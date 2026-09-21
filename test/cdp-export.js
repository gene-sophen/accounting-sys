/* 验证真实 exportPdf 流程：拦截 jsPDF.save，检查画布尺寸 / 分页 / blob */
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const LOG = 'D:/my_program/accounting-sys/test/dbg4.log';
fs.writeFileSync(LOG, '');
function log(...a) { fs.appendFileSync(LOG, a.join(' ') + '\n'); }
function getJson(path) {
  return new Promise((res, rej) => {
    const req = http.get({ host: '127.0.0.1', port: 9228, path, timeout: 3000 }, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    });
    req.on('error', rej);
    req.on('timeout', () => { req.destroy(); rej(new Error('timeout')); });
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=D:/my_program/accounting-sys/test/.edge-profile4', '--remote-debugging-port=9228',
    'about:blank'], { stdio: 'ignore' });
  let targets = null;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    try { targets = await getJson('/json/list'); break; } catch (e) {}
  }
  if (!targets) { log('no devtools'); process.exit(1); }
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; setTimeout(() => rej(new Error('ws timeout')), 10000); });
  let id = 0; const pending = {};
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; } };
  const send = (method, params) => new Promise(res => { const i = ++id; pending[i] = res; ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  const evalJs = (expr, awaitP, timeoutMs) => Promise.race([
    send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: !!awaitP }).then(r => {
      if (r.result && r.result.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description || r.result.exceptionDetails.text);
      return r.result && r.result.result && r.result.result.value;
    }),
    sleep(timeoutMs || 30000).then(() => 'TIMEOUT')
  ]);
  await send('Page.enable');
    await send('Network.enable');
    await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.navigate', { url: 'http://127.0.0.1:8765/test/smoke.html' });
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    const v = await evalJs('document.getElementById("result") && document.getElementById("result").textContent', false, 5000);
    if (v && String(v).startsWith('SMOKE:')) break;
  }
  log('smoke ready');
  // 加 60 条流水，切流水表，重新生成
  log('add entries:', await evalJs(`(async () => {
    var setId = App.state.currentSetId;
    for (var i = 1; i <= 60; i++) {
      await DB.addEntry({ set_id: setId, date: '2026-07-' + ('0' + (i % 28 + 1)).slice(-2),
        vehicle: i + '号挖机', qty_ml: 100000 + i * 1370, price_fen: 690, note: '' });
    }
    App.showTab('stmt');
    await new Promise(r => setTimeout(r, 500));
    document.getElementById('s-settings').click();
    await new Promise(r => setTimeout(r, 500));
    var seg = document.querySelectorAll('#panel-fmt .seg-btn');
    if (!seg[0].classList.contains('active')) seg[0].click();   // 切按日期流水表
    await new Promise(r => setTimeout(r, 400));
    document.querySelector('.overlay [data-act=done]').click();
    await new Promise(r => setTimeout(r, 300));
    document.getElementById('s-gen').click();
    return 'added';
  })()`, true, 30000));
  await sleep(1500);
  log('paper state:', await evalJs('(function(){var v=document.getElementById("s-viewport");var p=document.getElementById("s-paper");var t=document.getElementById("toast");return JSON.stringify({hidden:v.hidden, h:p.offsetHeight, rows:p.querySelectorAll("tr").length, setVal:document.getElementById("s-set").value, toast:t&&t.textContent});})()'));
  log('paper height:', await evalJs('document.getElementById("s-paper").offsetHeight'));
  // 拦截 save，点真实导出按钮
  log('export:', await evalJs(`(async () => {
    window.__saved = null; navigator.canShare = function(){ return false; }; window.__err=null; window.onerror=function(m){window.__err=m;};
    var lazyBefore = typeof html2canvas === 'undefined';
    await Vendor.load();
    jspdf.jsPDF.API.save = function (n) { window.__saved = { name: n, pages: this.getNumberOfPages(), size: this.output('blob').size }; };
    document.getElementById('s-export').click();
    window.__lazyBefore = lazyBefore;
    for (var i = 0; i < 120; i++) { await new Promise(r => setTimeout(r, 250)); if (window.__saved) break; }
    return JSON.stringify({ saved: window.__saved, err: window.__err, lazyBefore: window.__lazyBefore });
  })()`, true, 60000));
  edge.kill();
  log('done');
  process.exit(0);
})().catch(e => { log('ERR', e.stack || e.message); process.exit(1); });

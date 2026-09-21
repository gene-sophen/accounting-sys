/* dist 包冒烟：8766 端口挂载 dist/，验证部署产物本身可用 */
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const { spawn } = require('child_process');
const http = require('http');
function getJson(path) {
  return new Promise((res, rej) => {
    const req = http.get({ host: '127.0.0.1', port: 9241, path, timeout: 3000 }, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    });
    req.on('error', rej); req.on('timeout', () => { req.destroy(); rej(new Error('timeout')); });
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=D:/my_program/accounting-sys/test/.edge-dist', '--remote-debugging-port=9241', 'about:blank'], { stdio: 'ignore' });
  const exceptions = [];
  try {
    let targets = null;
    for (let i = 0; i < 40; i++) { await sleep(500); try { targets = await getJson('/json/list'); break; } catch (e) {} }
    if (!targets) throw new Error('no devtools');
    const page = targets.find(t => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; setTimeout(() => rej(new Error('ws timeout')), 10000); });
    let id = 0; const pending = {};
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; return; }
      if (m.method === 'Runtime.exceptionThrown') {
        exceptions.push(m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text);
      }
    };
    const send = (m, p) => new Promise(res => { const i = ++id; pending[i] = res; ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
    const evalJs = (expr, awaitP, t) => Promise.race([
      send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: !!awaitP }).then(r => {
        if (r.result && r.result.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description || r.result.exceptionDetails.text);
        return r.result && r.result.result && r.result.result.value;
      }),
      sleep(t || 15000).then(() => 'TIMEOUT')
    ]);
    await send('Page.enable');
    await send('Network.enable');
    await send('Network.setCacheDisabled', { cacheDisabled: true });
    await send('Runtime.enable');
    await Promise.race([send('Page.navigate', { url: 'http://127.0.0.1:8766/index.html' }), sleep(15000)]);
    await sleep(3000);
    console.log('基础渲染:', await evalJs(`(function(){
      return JSON.stringify({ readyState: document.readyState, tabs: document.querySelectorAll('.tab-btn').length,
        newSetCard: !!document.querySelector('.set-card-add'),
        vendorNotLoaded: typeof html2canvas === 'undefined' && !window.jspdf });
    })()`));
    console.log('SW 注册:', await evalJs('(async()=>{var r=await navigator.serviceWorker.getRegistrations();return r.length;})()', true));
    console.log('数据链路:', await evalJs(`(async () => {
      var setId = await DB.addSet('dist验证集');
      await App.selectSet(setId);
      await DB.addEntry({ set_id: setId, date: '2026-09-16', vehicle: '1号车', qty_ml: 663000, price_fen: 690, note: '' });
      await EntriesPage.refresh();
      var rows = document.querySelectorAll('.entry-row').length;
      App.showTab('stmt');
      await new Promise(r => setTimeout(r, 400));
      document.getElementById('s-gen').click();
      await new Promise(r => setTimeout(r, 800));
      var paper = document.getElementById('s-paper');
      return JSON.stringify({ entryRows: rows, paperShown: !document.getElementById('s-viewport').hidden,
        has4574: paper.textContent.indexOf('4574.70') >= 0 });
    })()`, true, 20000));
    console.log('延迟加载:', await evalJs('Vendor.load().then(function(){return Vendor.loaded();})', true));
    console.log('页面异常:', JSON.stringify(exceptions));
    console.log(exceptions.length === 0 ? 'DIST PASS' : 'DIST FAIL');
  } finally {
    edge.kill();
  }
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });

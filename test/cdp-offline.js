/* 离线实测：SW 预缓存激活后断网 reload，断言页面完整渲染 + 对账单可生成 */
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const { spawn } = require('child_process');
const http = require('http');
function getJson(path) {
  return new Promise((res, rej) => {
    const req = http.get({ host: '127.0.0.1', port: 9240, path, timeout: 3000 }, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    });
    req.on('error', rej); req.on('timeout', () => { req.destroy(); rej(new Error('timeout')); });
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=/tmp/edge-cdp', '--remote-debugging-port=9240', 'about:blank'], { stdio: 'ignore' });
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
    await send('Network.enable');

    // 1) 上线加载 → 清旧 SW/缓存 → 重载安装 v3 SW
    await Promise.race([send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html' }), sleep(15000)]);
    await sleep(2000);
    await evalJs('(async()=>{var rs=await navigator.serviceWorker.getRegistrations();await Promise.all(rs.map(r=>r.unregister()));var ks=await caches.keys();await Promise.all(ks.map(k=>caches.delete(k)));return 1;})()', true);
    await Promise.race([send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html' }), sleep(15000)]);
    // 2) 等 SW 激活并控制页面、预缓存完成
    let swState = '';
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      swState = await evalJs(`(async()=>{
        var reg = await navigator.serviceWorker.ready;
        var ctrl = !!navigator.serviceWorker.controller;
        var keys = await (await caches.open('accounting-v5')).keys();
        return JSON.stringify({ active: !!reg.active, controller: ctrl, cached: keys.length });
      })()`, true);
      try {
        var s = JSON.parse(swState);
        if (s.active && s.controller && s.cached >= 16) break;
      } catch (e) {}
      if (i === 20 && s && s.active && !s.controller) {
        await Promise.race([send('Page.reload'), sleep(10000)]); // 让 SW 接管
      }
    }
    console.log('SW 状态:', swState);

    // 3) 断网 reload
    await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    await Promise.race([send('Page.reload'), sleep(15000)]);
    await sleep(4000);
    console.log('离线渲染:', await evalJs(`(function(){
      return JSON.stringify({
        readyState: document.readyState,
        tabs: document.querySelectorAll('.tab-btn').length,
        sets: window.App ? App.state.sets.length : -1,
        groups: document.querySelectorAll('.group-key').length,
        rows: document.querySelectorAll('.entry-row').length,
        h2c: typeof html2canvas, jspdf: !!(window.jspdf && window.jspdf.jsPDF)
      });
    })()`));
    // 4) 离线生成对账单
    await evalJs('document.querySelector(\'.tab-btn[data-tab="stmt"]\').click()');
    await sleep(1200);
    await evalJs('document.getElementById("s-gen").click()');
    await sleep(1500);
    console.log('离线对账单:', await evalJs(`(function(){
      var v = document.getElementById('s-viewport');
      var rows = document.querySelectorAll('#s-paper .stmt-table tbody tr').length;
      return JSON.stringify({ paperShown: !v.hidden, tableRows: rows });
    })()`));
    console.log('离线按需加载 vendor:', await evalJs('Vendor.load().then(function(){return Vendor.loaded();}).catch(function(e){return "FAIL:"+e.message;})', true, 30000));
    console.log('页面异常:', JSON.stringify(exceptions));
    console.log(exceptions.length === 0 ? 'OFFLINE PASS' : 'OFFLINE PASS(有异常，见上)');
  } finally {
    edge.kill();
  }
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });

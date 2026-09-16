/* CDP 冒烟测试：驱动无头 Edge 加载 smoke 页，等待结果并断言 */
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const { spawn } = require('child_process');
const http = require('http');

function getJson(path) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: 9223, path }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const edge = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=/tmp/edge-cdp', '--remote-debugging-port=9223',
    'about:blank'], { stdio: 'ignore' });
  try {
    let targets = null;
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      try { targets = await getJson('/json/list'); break; } catch (e) {}
    }
    if (!targets) throw new Error('edge devtools not reachable');
    const page = targets.find(t => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0;
    const pending = {};
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; }
    };
    const send = (method, params) => new Promise(res => {
      const i = ++id;
      pending[i] = res;
      ws.send(JSON.stringify({ id: i, method, params: params || {} }));
    });
    await send('Page.enable');
    await send('Page.navigate', { url: 'http://127.0.0.1:8765/test/smoke.html' });
    await sleep(2000);
    // 清掉旧 Service Worker 与缓存，避免 cache-first 提供过期文件，然后重新加载
    await send('Runtime.evaluate', {
      expression: '(async()=>{var rs=await navigator.serviceWorker.getRegistrations();await Promise.all(rs.map(r=>r.unregister()));var ks=await caches.keys();await Promise.all(ks.map(k=>caches.delete(k)));return 1;})()',
      awaitPromise: true, returnByValue: true
    });
    await send('Page.navigate', { url: 'http://127.0.0.1:8765/test/smoke.html' });
    // 轮询结果
    let result = null;
    for (let i = 0; i < 60; i++) {
      await sleep(500);
      const r = await send('Runtime.evaluate', {
        expression: 'document.getElementById("result").textContent',
        returnByValue: true
      });
      const v = r.result && r.result.result && r.result.result.value;
      if (v && v.startsWith('SMOKE:')) { result = JSON.parse(v.slice(6)); break; }
    }
    if (!result) throw new Error('smoke page did not report');
    console.log(JSON.stringify(result, null, 2));
    const errs = (result.errors || []).concat(result.errorsAfter || []);
    if (result.fatal) { console.error('FATAL: ' + result.fatal); process.exit(1); }
    if (errs.length) { console.error('页面报错: ' + JSON.stringify(errs)); process.exit(1); }
    console.log('SMOKE PASS');
  } finally {
    edge.kill();
  }
})().catch(e => { console.error(e.message); process.exit(1); });

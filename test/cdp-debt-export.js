/* 欠账单真实导出链路验证 */
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const { spawn } = require('child_process');
const http = require('http');
function getJson(path) {
  return new Promise((res, rej) => {
    const req = http.get({ host: '127.0.0.1', port: 9243, path, timeout: 3000 }, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    });
    req.on('error', rej); req.on('timeout', () => { req.destroy(); rej(new Error('timeout')); });
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=/tmp/edge-cdp', '--remote-debugging-port=9243', 'about:blank'], { stdio: 'ignore' });
  try {
    let targets = null;
    for (let i = 0; i < 40; i++) { await sleep(500); try { targets = await getJson('/json/list'); break; } catch (e) {} }
    const page = targets.find(t => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; setTimeout(() => rej(new Error('ws timeout')), 10000); });
    let id = 0; const pending = {};
    ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; } };
    const send = (m, p) => new Promise(res => { const i = ++id; pending[i] = res; ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
    const evalJs = (expr, awaitP, t) => Promise.race([
      send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: !!awaitP }).then(r => {
        if (r.result && r.result.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description || r.result.exceptionDetails.text);
        return r.result && r.result.result && r.result.result.value;
      }),
      sleep(t || 20000).then(() => 'TIMEOUT')
    ]);
    await send('Page.enable');
    await send('Network.enable');
    await send('Network.setCacheDisabled', { cacheDisabled: true });
    await Promise.race([send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html' }), sleep(15000)]);
    await sleep(2000);
    await evalJs('(async()=>{var rs=await navigator.serviceWorker.getRegistrations();await Promise.all(rs.map(r=>r.unregister()));var ks=await caches.keys();await Promise.all(ks.map(k=>caches.delete(k)));return 1;})()', true);
    await Promise.race([send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html' }), sleep(15000)]);
    await sleep(3000);
    console.log('导出:', await evalJs(`(async () => {
      document.querySelector('.tab-btn[data-tab="debts"]').click();
      await new Promise(r => setTimeout(r, 1200));
      var rows = document.querySelectorAll('.customer-row .entry-content');
      if (!rows.length) return 'NO CUSTOMERS';
      rows[rows.length - 1].click();
      await new Promise(r => setTimeout(r, 1000));
      document.getElementById('dd-print').click();
      await new Promise(r => setTimeout(r, 1500));
      var pov = document.getElementById('debt-print-overlay');
      if (!pov) return 'PRINT OVERLAY MISSING';
      window.__saved = null;
      navigator.canShare = function () { return false; };
      await Vendor.load();
      jspdf.jsPDF.API.save = function (n) { window.__saved = { name: n, pages: this.getNumberOfPages(), size: this.output('blob').size }; };
      pov.querySelector('#dp-export').click();
      for (var i = 0; i < 120; i++) { await new Promise(r => setTimeout(r, 250)); if (window.__saved) break; }
      return JSON.stringify(window.__saved);
    })()`, true, 90000));

    // 压测：45 条用油记录（跨 6 个月）→ 明细页渲染耗时 + 多页导出
    console.log('压测:', await evalJs(`(async () => {
      document.querySelectorAll('.page-overlay').forEach(function (o) { o.remove(); });
      var cid = await DB.addCustomer('压测客户');
      for (var i = 1; i <= 45; i++) {
        var m = (i % 6) + 1, d = (i % 27) + 1;
        await DB.addUsage({ customer_id: cid, date: '2026-0' + m + '-' + (d < 10 ? '0' : '') + d,
          qty_ml: 100000 + i * 1000, total_fen: 70000 + i * 100 });
      }
      await DebtsPage.refresh();
      var rows = document.querySelectorAll('.customer-row .entry-content');
      var pick = rows[rows.length - 1];
      var t0 = performance.now();
      pick.click();
      for (var i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 100));
        if (document.querySelectorAll('#dd-usage-list .entry-row').length >= 45) break;
      }
      var renderMs = Math.round(performance.now() - t0);
      var rowsRendered = document.querySelectorAll('#dd-usage-list .entry-row').length;
      document.getElementById('dd-print').click();
      await new Promise(r => setTimeout(r, 1500));
      var pov = document.getElementById('debt-print-overlay');
      window.__saved2 = null;
      window.__err2 = null;
      window.onerror = function (m) { window.__err2 = String(m); };
      navigator.canShare = function () { return false; };
      jspdf.jsPDF.API.save = function (n) { window.__saved2 = { name: n, pages: this.getNumberOfPages(), size: this.output('blob').size }; };
      pov.querySelector('#dp-export').click();
      for (var i = 0; i < 160; i++) { await new Promise(r => setTimeout(r, 250)); if (window.__saved2) break; }
      var toast = document.getElementById('toast');
      return JSON.stringify({ renderMs: renderMs, rowsRendered: rowsRendered, saved: window.__saved2,
        err: window.__err2, toast: toast && toast.textContent, btnText: pov.querySelector('#dp-export').textContent,
        paperH: pov.querySelector('#debt-paper').offsetHeight });
    })()`, true, 120000));
  } finally { edge.kill(); }
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });

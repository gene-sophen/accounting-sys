/* CDP 390×844 横向溢出诊断 + 截图工具 */
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

const PORT = 9231;
const LOGF = 'D:/my_program/accounting-sys/test/cdp-390.log';
fs.writeFileSync(LOGF, '');
function log(...a) { fs.appendFileSync(LOGF, a.join(' ') + '\n'); }
setTimeout(() => { log('HARD TIMEOUT'); process.exit(2); }, 120000);
const PROFILE = process.argv[2] === 'smoke-profile' ? '/tmp/edge-cdp'
  : (process.argv[2] || 'D:/my_program/accounting-sys/test/.edge-390');
const MODE = process.argv[3] || 'diagnose'; // diagnose | shot-home | shot-data | shot-stmt

function getJson(path) {
  return new Promise((res, rej) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path, timeout: 3000 }, r => {
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
    '--user-data-dir=' + PROFILE, '--remote-debugging-port=' + PORT, '--window-size=390,844',
    'about:blank'], { stdio: 'ignore' });
  log('edge spawned');
  try {
    let targets = null;
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      try { targets = await getJson('/json/list'); break; } catch (e) {}
    }
    if (!targets) throw new Error('no devtools');
    log('devtools ok');
    const page = targets.find(t => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; setTimeout(() => rej(new Error('ws timeout')), 10000); });
    let id = 0; const pending = {};
    ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; } };
    const send = (method, params) => new Promise(res => { const i = ++id; pending[i] = res; ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
    const evalJs = async (expr, awaitP) => {
      const r = await Promise.race([send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: !!awaitP }), sleep(20000).then(() => ({ timeout: true }))]);
      if (r.timeout) return 'EVAL TIMEOUT';
      if (r.result && r.result.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description || r.result.exceptionDetails.text);
      return r.result && r.result.result && r.result.result.value;
    };

    log('ws connected');
    await send('Page.enable');
    await send('Network.enable');
    await send('Network.setCacheDisabled', { cacheDisabled: true });
    if (MODE !== 'diagnose-desktop') {
      await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    }
    log('metrics set');
    await Promise.race([send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html' }), sleep(15000)]);
    log('nav1 done');
    await sleep(2000);
    log('cleanup start');
    // 清掉旧 Service Worker 与缓存，避免 cache-first 提供过期文件，然后重新加载
    await evalJs('(async()=>{var rs=await navigator.serviceWorker.getRegistrations();await Promise.all(rs.map(r=>r.unregister()));var ks=await caches.keys();await Promise.all(ks.map(k=>caches.delete(k)));return 1;})()', true);
    log('cleanup done');
    await Promise.race([send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html' }), sleep(15000)]);
    log('navigated');
    await sleep(3000);
    log('walk start'); // 真实时间等待 IndexedDB/渲染，不用 virtual-time

    const WALK = `(function(){
      var vw = window.innerWidth, bad = [];
      document.querySelectorAll('body *').forEach(function(el){
        var r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        if (r.right > vw + 0.5 || r.left < -0.5) {
          bad.push({ tag: el.tagName.toLowerCase(), id: el.id || '',
            cls: (typeof el.className === 'string' ? el.className : '').slice(0, 50),
            left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) });
        }
      });
      return JSON.stringify({ innerWidth: vw, docScrollW: document.documentElement.scrollWidth,
        bodyScrollW: document.body.scrollWidth, overflowCount: bad.length, bad: bad.slice(0, 25) }, null, 1);
    })()`;

    async function shot(path) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path, Buffer.from(r.result.data, 'base64'));
      console.log('saved', path);
    }

    if (MODE === 'diagnose' || MODE === 'diagnose-desktop' || MODE === 'shot-home') {
      console.log(await evalJs(WALK));
      if (MODE === 'shot-home') await shot('test/shot-390-home.png');
    } else if (MODE === 'shot-data') {
      // 复用冒烟数据 profile：等 sets 加载完，选中有流水的账单集并渲染
      for (var wi = 0; wi < 40; wi++) {
        await sleep(500);
        var ready = await evalJs('window.App && App.state.sets.length + ":" + Object.keys(App.state.setStats).length');
        if (ready && !/^0/.test(String(ready))) break;
      }
      console.log('sets ready:', ready);
      console.log('diag:', await evalJs('(async()=>{var d=await indexedDB.databases();var s=await DB.listSets().then(r=>r.length).catch(e=>"ERR:"+e.message);return JSON.stringify({href:location.href,dbs:d,sets:s,appSets:App.state.sets.length});})()', true));
      console.log('pick set:', await evalJs(`(async () => {
        var stats = App.state.setStats, best = null, n = -1;
        Object.keys(stats).forEach(function (k) { if (stats[k].count > n) { n = stats[k].count; best = k; } });
        await App.selectSet(parseInt(best, 10));
        await EntriesPage.refresh();
        return best + ' (' + n + '笔)';
      })()`, true));
      await sleep(1000);
      console.log(await evalJs(WALK));
      console.log('entries:', await evalJs('document.querySelectorAll(".entry-row").length'));
      await shot('test/shot-390-data.png');
    } else if (MODE === 'shot-stmt') {
      await sleep(1500);
      // 选中最新（车辆数最多、含空车辆）的账单集，切聚合格式生成
      console.log('pick set:', await evalJs(`(async () => {
        await App.refreshSets();
        var sets = App.state.sets, best = sets[0], bestN = -1;
        for (var i = 0; i < sets.length; i++) {
          var rows = await DB.listEntries(sets[i].id);
          var vs = {};
          rows.forEach(function (r) { vs[r.vehicle] = 1; });
          var n = Object.keys(vs).length;
          if (n >= bestN) { bestN = n; best = sets[i]; }
        }
        await App.selectSet(best.id);
        return best.id + ' (' + bestN + '台车)';
      })()`, true));
      await evalJs('document.getElementById("entries-stmt-btn").click()');
      await sleep(1000);
      // 设置面板：切聚合格式，面板本身截图 + 溢出检查
      await evalJs('document.getElementById("s-settings").click()');
      await sleep(800);
      await evalJs('(function(){var b=document.querySelectorAll("#panel-fmt .seg-btn");if(b[1]&&!b[1].classList.contains("active"))b[1].click();})()');
      await sleep(600);
      // 落款位置复位到「表格下方」（该集此前可能被冒烟测试记成上方）
      await evalJs('(function(){var b=document.querySelectorAll("#panel-sigpos .seg-btn");if(b[0]&&!b[0].classList.contains("active"))b[0].click();})()');
      await sleep(400);
      console.log('with-settings-panel:', await evalJs(WALK));
      await shot('test/shot-390-settings.png');
      await evalJs('document.querySelector(".overlay [data-act=done]").click()');
      await sleep(400);
      // 生成（落款默认在表格下方）
      await evalJs('document.getElementById("s-gen").click()');
      await sleep(1500);
      console.log(await evalJs(WALK));
      console.log('paper:', await evalJs('(function(){var v=document.getElementById("s-viewport");var p=document.getElementById("s-paper");return JSON.stringify({hidden:v.hidden, viewportW:v.clientWidth, viewportH:v.style.height, transform:p.style.transform})})()'));
      await shot('test/shot-390-stmt.png');
      // 落款切到表格上方
      await evalJs('document.getElementById("s-settings").click()');
      await sleep(600);
      await evalJs('(function(){var b=document.querySelectorAll("#panel-sigpos .seg-btn");if(b[1]&&!b[1].classList.contains("active"))b[1].click();})()');
      await sleep(600);
      await evalJs('document.querySelector(".overlay [data-act=done]").click()');
      await sleep(600);
      console.log('sig-above walk:', await evalJs(WALK));
      await shot('test/shot-390-stmt-above.png');
      // 账目页按车辆排布（空车辆组排最后）
      await evalJs('document.querySelector(\'.tab-btn[data-tab="entries"]\').click()');
      await sleep(1000);
      await evalJs('(function(){var b=document.querySelectorAll("#seg-wrap .seg-btn");if(b[1]&&!b[1].classList.contains("active"))b[1].click();})()');
      await sleep(800);
      await shot('test/shot-390-vehicle-layout.png');
      // 顺带：记一笔页车辆补全下拉
      await evalJs('document.querySelector(\'.tab-btn[data-tab="add"]\').click()');
      await sleep(800);
      await evalJs('var v=document.getElementById("a-vehicle"); v.value=""; v.focus();');
      await sleep(800);
      console.log('with-dropdown:', await evalJs(WALK));
    } else if (MODE === 'shot-debts') {
      await sleep(1500);
      // 确保存在一个「还欠」客户（列表同时展示还欠/多收）
      console.log('ensure owed:', await evalJs(`(async () => {
        var cs = await DB.listCustomers();
        for (var i = 0; i < cs.length; i++) {
          var u = await DB.listUsage(cs[i].id), p = await DB.listPayments(cs[i].id);
          if (Stats.yearSummary(u, p, new Date().getFullYear()).balanceFen > 0) return 'exists';
        }
        var id = await DB.addCustomer('还欠示例客户');
        await DB.addUsage({ customer_id: id, date: '2026-09-05', qty_ml: 300000, total_fen: 210000 });
        await DB.addUsage({ customer_id: id, date: '2026-09-12', qty_ml: 150.25, total_fen: 105175 });
        await DB.addPayment({ customer_id: id, date: '2026-09-18', amount_fen: 100000, note: '转账' });
        return 'created';
      })()`, true, 30000));
      await evalJs('document.querySelector(\'.tab-btn[data-tab="debts"]\').click()');
      await sleep(1500);
      console.log('debt-list:', await evalJs(WALK));
      await shot('test/shot-390-debts.png');
      // 选一个有多收场景的客户（欠账为负优先，否则第一个）
      await evalJs(`(function(){
        var rows = document.querySelectorAll('.customer-row .entry-content');
        var pick = rows[0];
        rows.forEach(function (r) { if (r.textContent.indexOf('多收') >= 0) pick = r; });
        if (pick) pick.click();
      })()`);
      await sleep(1000);
      console.log('debt-detail:', await evalJs(WALK));
      await shot('test/shot-390-debt-detail.png');
      // 记用油表单
      await evalJs('document.getElementById("dd-usage-btn").click()');
      await sleep(800);
      console.log('debt-form:', await evalJs(WALK));
      await shot('test/shot-390-debt-form.png');
      await evalJs('(function(){var o=document.querySelector(".overlay-bottom");if(o)o.remove();})()');
      await sleep(400);
      // 记录左滑删除态（合成 touch）
      await evalJs(`(function(){
        var row = document.querySelector('#dd-usage-list .entry-row');
        var content = row.querySelector('.entry-content');
        var r = content.getBoundingClientRect();
        function fire(type, x, y) {
          var t = new Touch({ identifier: 1, target: content, clientX: x, clientY: y });
          content.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], cancelable: true, bubbles: true }));
        }
        var sx = r.left + r.width - 20, sy = r.top + r.height / 2;
        fire('touchstart', sx, sy);
        fire('touchmove', sx - 20, sy);
        fire('touchmove', sx - 70, sy);
        fire('touchend', sx - 70, sy);
      })()`);
      await sleep(400);
      await shot('test/shot-390-debt-swipe.png');
      await evalJs('(function(){var o=document.querySelector(".page-overlay .entry-row.swiped");if(o){o.classList.remove("swiped");o.querySelector(".entry-content").style.transform="";}})()');
      await sleep(300);
      // 打印欠账单（独立子页）：纸张 + 设置面板
      await evalJs('document.getElementById("dd-print").click()');
      await sleep(1500);
      await evalJs('(function(){var o=document.getElementById("debt-print-overlay");if(o)o.scrollTop=o.scrollHeight;})()');
      await sleep(400);
      console.log('debt-paper:', await evalJs(WALK));
      await shot('test/shot-390-debt-paper.png');
      await evalJs('document.querySelector("#debt-print-overlay #dp-settings").click()');
      await sleep(800);
      console.log('debt-settings:', await evalJs(WALK));
      await shot('test/shot-390-debt-settings.png');
      // 用油表三模式截图
      await evalJs('document.querySelectorAll("#dp-usage-mode .seg-btn")[1].click()');
      await sleep(600);
      await evalJs('document.querySelector(".overlay [data-act=done]").click()');
      await sleep(500);
      await shot('test/shot-390-debt-paper-subtotal.png');
      await evalJs('document.querySelector("#debt-print-overlay #dp-settings").click()');
      await sleep(600);
      await evalJs('document.querySelectorAll("#dp-usage-mode .seg-btn")[2].click()');
      await sleep(600);
      await evalJs('document.querySelector(".overlay [data-act=done]").click()');
      await sleep(500);
      await shot('test/shot-390-debt-paper-monthly.png');
      // 复位默认模式
      await evalJs('document.querySelector("#debt-print-overlay #dp-settings").click()');
      await sleep(600);
      await evalJs('document.querySelectorAll("#dp-usage-mode .seg-btn")[0].click()');
      await sleep(400);
      await evalJs('document.querySelector(".overlay [data-act=done]").click()');
    } else if (MODE === 'shot-add') {
      await sleep(1500);
      await evalJs('document.querySelector(\'.tab-btn[data-tab="add"]\').click()');
      await sleep(1000);
      console.log(await evalJs(WALK));
      await shot('test/shot-390-add.png');
    }
  } finally {
    edge.kill();
  }
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });

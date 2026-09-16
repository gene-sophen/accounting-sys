/* app.js —— 主控：全局状态、Tab 切换、车辆补全、Service Worker 注册 */
(function (global) {
  'use strict';

  var DB = global.DB, U = global.UI;

  var App = {
    state: {
      sets: [],
      currentSetId: null,
      entries: [],
      setStats: {}   // setId -> {count, fen}
    },

    refreshSets: function () {
      return DB.listSets().then(function (sets) {
        App.state.sets = sets;
        if (!sets.length) { App.state.currentSetId = null; App.state.setStats = {}; return; }
        if (!sets.some(function (s) { return s.id === App.state.currentSetId; })) {
          App.state.currentSetId = sets[0].id;
        }
        // 统计每个账单集的笔数与合计
        var stats = {};
        var chain = Promise.resolve();
        sets.forEach(function (s) {
          chain = chain.then(function () {
            return DB.listEntries(s.id).then(function (rows) {
              stats[s.id] = { count: rows.length, fen: global.Money.totals(rows).fen };
            });
          });
        });
        return chain.then(function () { App.state.setStats = stats; });
      });
    },

    selectSet: function (id) {
      App.state.currentSetId = id;
      return Promise.resolve();
    },

    showTab: function (name) {
      document.querySelectorAll('.tab-btn').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-tab') === name);
      });
      document.querySelectorAll('.page').forEach(function (p) {
        p.classList.toggle('active', p.id === 'page-' + name);
      });
      var page = { entries: global.EntriesPage, add: global.AddPage, stmt: global.StatementPage }[name];
      if (page && page.onShow) page.onShow();
    },

    // 车辆输入补全：当前账单集内历史车辆去重下拉，允许新名称
    attachVehicleComplete: function (input, wrap, getSetId) {
      var listEl = document.createElement('div');
      listEl.className = 'vehicle-list';
      listEl.hidden = true;
      wrap.appendChild(listEl);

      function candidates() {
        var setId = getSetId();
        if (!setId) return Promise.resolve([]);
        return DB.listEntries(setId).then(function (rows) {
          var seen = {}, out = [];
          rows.forEach(function (r) {
            if (r.vehicle && !seen[r.vehicle]) { seen[r.vehicle] = true; out.push(r.vehicle); }
          });
          return out;
        });
      }
      function draw() {
        var q = input.value.trim();
        candidates().then(function (names) {
          var matched = names.filter(function (n) { return !q || n.indexOf(q) >= 0; });
          if (!matched.length || document.activeElement !== input) { listEl.hidden = true; return; }
          listEl.innerHTML = '';
          matched.slice(0, 8).forEach(function (n) {
            var item = document.createElement('div');
            item.className = 'vehicle-item';
            item.textContent = n;
            item.addEventListener('pointerdown', function (e) {
              e.preventDefault(); // 防止输入框失焦导致列表先隐藏
              input.value = n;
              listEl.hidden = true;
            });
            listEl.appendChild(item);
          });
          listEl.hidden = false;
        });
      }
      input.addEventListener('input', draw);
      input.addEventListener('focus', draw);
      input.addEventListener('blur', function () {
        setTimeout(function () { listEl.hidden = true; }, 150);
      });
    }
  };

  function init() {
    global.EntriesPage.render(document.getElementById('page-entries'));
    global.AddPage.render(document.getElementById('page-add'));
    global.StatementPage.render(document.getElementById('page-stmt'));

    document.querySelectorAll('.tab-btn').forEach(function (b) {
      b.addEventListener('click', function () { App.showTab(b.getAttribute('data-tab')); });
    });
    App.showTab('entries');

    // Service Worker 仅在 http(s)/localhost 生效
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  }

  global.App = App;
  document.addEventListener('DOMContentLoaded', init);
})(window);

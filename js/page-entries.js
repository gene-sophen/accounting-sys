/* page-entries.js —— 账目页（首页）：账单集卡片条、排布方式、分组列表、条目详情/编辑 */
(function (global) {
  'use strict';

  var M = global.Money, U = global.UI, DB = global.DB;

  var root = null;          // 页面容器
  var stripEl, segWrapEl, listEl, emptyEl;
  var layout = 'date';      // 当前排布方式

  function render(container) {
    root = container;
    root.innerHTML =
      '<div class="set-strip" id="set-strip"></div>' +
      '<div class="list-tools" id="list-tools">' +
        '<div class="seg-wrap" id="seg-wrap"></div>' +
        '<button class="btn btn-plain stmt-entry" id="entries-stmt-btn" type="button">' +
          global.UI.icon('receipt') + '<span>打印</span></button>' +
      '</div>' +
      '<div class="group-list" id="group-list"></div>' +
      '<div class="empty-hint" id="entries-empty" hidden></div>';
    stripEl = root.querySelector('#set-strip');
    segWrapEl = root.querySelector('#seg-wrap');
    listEl = root.querySelector('#group-list');
    emptyEl = root.querySelector('#entries-empty');
    root.querySelector('#entries-stmt-btn').addEventListener('click', function () {
      global.App.openStatement(global.App.state.currentSetId);
    });
  }

  function onShow() { refresh(); }

  function refresh() {
    return global.App.refreshSets().then(function () {
      renderStrip();
      return renderList();
    });
  }

  // ---- 账单集卡片条 ----
  function renderStrip() {
    var sets = global.App.state.sets;
    var cur = global.App.state.currentSetId;
    stripEl.innerHTML = '';

    var addCard = document.createElement('button');
    addCard.type = 'button';
    addCard.className = 'set-card set-card-add';
    addCard.innerHTML = U.icon('plus') + '<span>新建账单集</span>';
    addCard.addEventListener('click', function () { openSetModal(null); });
    stripEl.appendChild(addCard);

    sets.forEach(function (s) {
      var card = document.createElement('div');
      card.className = 'set-card' + (s.id === cur ? ' selected' : '');
      var stat = global.App.state.setStats[s.id] || { count: 0, fen: 0 };
      card.innerHTML =
        '<div class="set-name">' + U.esc(s.name) + '</div>' +
        '<div class="set-sub">' + stat.count + '笔 · ¥' + M.fmtFen(stat.fen) + '</div>' +
        '<button type="button" class="set-edit" aria-label="编辑">' + U.icon('pencil') + '</button>';
      card.addEventListener('click', function () {
        global.App.selectSet(s.id).then(renderStrip).then(renderList);
      });
      card.querySelector('.set-edit').addEventListener('click', function (e) {
        e.stopPropagation();
        openSetModal(s);
      });
      stripEl.appendChild(card);
    });
  }

  // ---- 新建 / 编辑账单集弹窗 ----
  function openSetModal(set) {
    var isEdit = !!set;
    var onlyOne = global.App.state.sets.length <= 1;
    var m = U.modal(
      '<div class="sheet-title">' + (isEdit ? '编辑账单集' : '新建账单集') + '</div>' +
      '<input class="text-input" id="set-name" type="text" maxlength="40" placeholder="账单集名称（如：XX工地6月）" value="' +
        (isEdit ? U.esc(set.name) : '') + '">' +
      '<div class="sheet-btns">' +
        '<button class="btn btn-plain" data-act="cancel">取消</button>' +
        '<button class="btn btn-primary" data-act="ok">' + (isEdit ? '保存' : '创建') + '</button>' +
      '</div>' +
      (isEdit ? '<button class="btn btn-danger btn-block" data-act="delete"' + (onlyOne ? ' disabled' : '') +
        '>删除此账单集</button>' : '')
    );
    var input = m.el.querySelector('#set-name');
    input.focus();
    m.el.addEventListener('click', function (e) {
      var act = e.target.getAttribute('data-act');
      if (act === 'cancel') { m.close(); return; }
      if (act === 'ok') {
        var name = input.value.trim();
        if (!name) { U.toast('请输入账单集名称'); return; }
        var p = isEdit ? DB.updateSet(set.id, name) : DB.addSet(name).then(function (id) {
          return global.App.selectSet(id);
        });
        p.then(function () { m.close(); refresh(); });
        return;
      }
      if (act === 'delete') {
        if (onlyOne) return;
        U.confirm('删除后不可恢复，确认删除？（该账单集内全部条目将一并删除）', { danger: true, okText: '删除' })
          .then(function (ok) {
            if (!ok) return;
            DB.deleteSet(set.id).then(function () {
              if (global.App.state.currentSetId === set.id) global.App.state.currentSetId = null;
              m.close();
              refresh();
              U.toast('已删除');
            });
          });
      }
    });
  }

  // ---- 分组列表 ----
  function renderList() {
    var st = global.App.state;
    var sets = st.sets;
    if (!sets.length) {
      root.querySelector('#list-tools').style.display = 'none';
      segWrapEl.innerHTML = '';
      listEl.innerHTML = '';
      emptyEl.hidden = false;
      emptyEl.innerHTML = U.icon('inbox') + '<span>还没有账单集，点左上角「新建账单集」开始记账</span>';
      return Promise.resolve();
    }
    root.querySelector('#list-tools').style.display = '';
    return DB.listEntries(st.currentSetId).then(function (entries) {
      st.entries = entries;
      return DB.getSetting('layout:' + st.currentSetId).then(function (saved) {
        layout = saved === 'vehicle' ? 'vehicle' : 'date';
        renderSeg();
        renderGroups();
      });
    });
  }

  function renderSeg() {
    segWrapEl.innerHTML = '';
    segWrapEl.appendChild(U.segmented(
      [{ value: 'date', label: '按日期' }, { value: 'vehicle', label: '按车辆' }],
      layout,
      function (v) {
        layout = v;
        DB.setSetting('layout:' + global.App.state.currentSetId, v);
        renderGroups();
      }
    ));
  }

  function vehicleHtml(name) {
    return name ? U.esc(name) : '<span class="novehicle">未填车辆</span>';
  }

  function groupEntries(entries) {
    var map = {}, order = [];
    entries.forEach(function (e) {
      var key = layout === 'date' ? e.date : e.vehicle;
      if (!map[key]) { map[key] = []; order.push(key); }
      map[key].push(e);
    });
    if (layout === 'date') order.sort().reverse();       // 日期新的在前
    else order.sort(function (a, b) {
      if (!a) return 1;                                  // 空车辆组排最后
      if (!b) return -1;
      return a.localeCompare(b, 'zh-Hans-CN');
    });
    return order.map(function (k) { return { key: k, items: map[k] }; });
  }

  function renderGroups() {
    var entries = global.App.state.entries || [];
    listEl.innerHTML = '';
    if (!entries.length) {
      emptyEl.hidden = false;
      emptyEl.innerHTML = U.icon('inbox') + '<span>该账单集暂无流水，去「记一笔」添加</span>';
      return;
    }
    emptyEl.hidden = true;
    groupEntries(entries).forEach(function (g) {
      var t = M.totals(g.items);
      var card = document.createElement('div');
      card.className = 'group-card';
      var head = document.createElement('div');
      head.className = 'group-head';
      head.innerHTML =
        '<span class="group-key">' + (layout === 'date' ? U.esc(U.longDate(g.key)) : vehicleHtml(g.key)) + '</span>' +
        '<span class="group-sub">' + g.items.length + '笔 · ¥' + M.fmtFen(t.fen) + '</span>';
      card.appendChild(head);
      g.items.forEach(function (e) { card.appendChild(entryRow(e)); });
      listEl.appendChild(card);
    });
  }

  // ---- 条目行（含左滑删除）----
  function entryRow(e) {
    var fen = M.amountFen(e.qty_ml, e.price_fen);
    var row = document.createElement('div');
    row.className = 'entry-row';
    var main = layout === 'date' ? vehicleHtml(e.vehicle) : U.esc(U.longDate(e.date));
    var sub = M.fmtMl(e.qty_ml) + '升 × ' + M.fmtFen(e.price_fen) + (e.note ? ' · ' + e.note : '');
    row.innerHTML =
      '<div class="swipe-delete">删除</div>' +
      '<div class="entry-content">' +
        '<div class="entry-main"><span class="entry-title">' + main + '</span>' +
        '<span class="entry-amt">¥' + M.fmtFen(fen) + '</span></div>' +
        '<div class="entry-sub">' + U.esc(sub) + '</div>' +
      '</div>';
    U.attachSwipe(row, function () {
      U.confirm('删除后不可恢复，确认删除？', { danger: true, okText: '删除' }).then(function (ok) {
        if (ok) DB.deleteEntry(e.id).then(function () { refresh(); U.toast('已删除'); });
        else U.closeSwipe(row);
      });
    });
    row.querySelector('.entry-content').addEventListener('click', function () {
      if (row.dataset.noClick) { delete row.dataset.noClick; return; } // 左滑后的合成 click，忽略
      if (row.classList.contains('swiped')) { U.closeSwipe(row); return; }
      openDetail(e);
    });
    return row;
  }


  // ---- 条目详情（覆盖页）----
  function openDetail(e) {
    var fen = M.amountFen(e.qty_ml, e.price_fen);
    var overlay = document.createElement('div');
    overlay.className = 'page-overlay';
    overlay.innerHTML =
      '<div class="page-header"><button class="back-btn" type="button">‹ 返回</button><span class="page-title">条目详情</span></div>' +
      '<div class="detail-card">' +
        field('日期', U.longDate(e.date)) +
        field('车辆', vehicleHtml(e.vehicle)) +
        field('数量（升）', M.fmtMl(e.qty_ml)) +
        field('单价（元/升）', M.fmtFen(e.price_fen)) +
        field('金额（元）', M.fmtFen(fen)) +
        field('备注', U.esc(e.note || '—')) +
      '</div>' +
      '<div class="detail-actions">' +
        '<button class="btn btn-danger" data-act="delete">删除</button>' +
        '<button class="btn btn-primary" data-act="edit">编辑</button>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.querySelector('.back-btn').addEventListener('click', function () { global.App.closeOverlay(overlay); });
    overlay.addEventListener('click', function (ev) {
      var act = ev.target.getAttribute('data-act');
      if (act === 'delete') {
        U.confirm('删除后不可恢复，确认删除？', { danger: true, okText: '删除' }).then(function (ok) {
          if (ok) DB.deleteEntry(e.id).then(function () { global.App.closeOverlay(overlay); refresh(); U.toast('已删除'); });
        });
      } else if (act === 'edit') {
        overlay.remove();
        openEdit(e);
      }
    });
    function field(k, v) {
      return '<div class="detail-row"><span class="detail-k">' + k + '</span><span class="detail-v">' + v + '</span></div>';
    }
  }

  // ---- 条目编辑（覆盖页）----
  function openEdit(entry) {
    var sets = global.App.state.sets;
    var overlay = document.createElement('div');
    overlay.className = 'page-overlay';
    var opts = sets.map(function (s) {
      return '<option value="' + s.id + '"' + (s.id === entry.set_id ? ' selected' : '') + '>' + U.esc(s.name) + '</option>';
    }).join('');
    overlay.innerHTML =
      '<div class="page-header"><button class="back-btn" type="button">‹ 返回</button><span class="page-title">编辑条目</span></div>' +
      '<div class="form-card">' +
        '<label class="form-label">所属账单集</label><select class="text-input" id="f-set">' + opts + '</select>' +
        '<label class="form-label">日期</label><input class="text-input" id="f-date" type="date" value="' + entry.date + '">' +
        '<label class="form-label">数量（升）</label><input class="text-input" id="f-qty" type="text" inputmode="decimal" value="' + M.fmtMl(entry.qty_ml) + '">' +
        '<label class="form-label">单价（元/升）</label><input class="text-input" id="f-price" type="text" inputmode="decimal" value="' + M.fmtFen(entry.price_fen) + '">' +
        '<label class="form-label">加油车辆</label><div class="vehicle-wrap"><input class="text-input" id="f-vehicle" type="text" maxlength="30" autocomplete="off" value="' + U.esc(entry.vehicle) + '"></div>' +
        '<label class="form-label">备注（可选）</label><input class="text-input" id="f-note" type="text" maxlength="60" value="' + U.esc(entry.note || '') + '">' +
        '<div class="amt-preview">金额：<b id="f-amt">¥' + M.fmtFen(M.amountFen(entry.qty_ml, entry.price_fen)) + '</b></div>' +
      '</div>' +
      '<div class="detail-actions"><button class="btn btn-primary btn-block" id="f-save">保存</button></div>';
    document.body.appendChild(overlay);
    overlay.querySelector('.back-btn').addEventListener('click', function () { global.App.closeOverlay(overlay); });

    var qtyEl = overlay.querySelector('#f-qty');
    var priceEl = overlay.querySelector('#f-price');
    var amtEl = overlay.querySelector('#f-amt');
    function updateAmt() {
      var q = M.parseQtyMl(qtyEl.value), p = M.parsePriceFen(priceEl.value);
      amtEl.textContent = (q != null && p != null) ? '¥' + M.fmtFen(M.amountFen(q, p)) : '—';
    }
    qtyEl.addEventListener('input', updateAmt);
    priceEl.addEventListener('input', updateAmt);

    var setEl = overlay.querySelector('#f-set');
    var vehicleEl = overlay.querySelector('#f-vehicle');
    global.App.attachVehicleComplete(vehicleEl, vehicleEl.parentElement, function () {
      return parseInt(setEl.value, 10);
    });

    overlay.querySelector('#f-save').addEventListener('click', function () {
      var setId = parseInt(setEl.value, 10);
      var date = overlay.querySelector('#f-date').value;
      var qty = M.parseQtyMl(qtyEl.value);
      var price = M.parsePriceFen(priceEl.value);
      var vehicle = vehicleEl.value.trim();
      var note = overlay.querySelector('#f-note').value.trim();
      if (!date) { U.toast('请选择日期'); return; }
      if (qty == null || qty <= 0) { U.toast('数量需为大于 0 的数字，最多三位小数'); return; }
      if (price == null) { U.toast('单价需为数字，最多两位小数'); return; }

      var updated = { id: entry.id, set_id: setId, date: date, vehicle: vehicle,
        qty_ml: qty, price_fen: price, note: note, created_at: entry.created_at };

      function doSave() {
        DB.updateEntry(updated).then(function () {
          global.App.closeOverlay(overlay);
          global.App.selectSet(setId).then(refresh);
          U.toast('已保存');
        });
      }

      // 车辆改名：旧值新值均非空，且集内存在其他同名旧值条目 → 二选一；空字符串不做批量替换
      if (vehicle !== entry.vehicle && vehicle && entry.vehicle) {
        DB.listEntries(entry.set_id).then(function (all) {
          var sameOld = all.filter(function (x) { return x.vehicle === entry.vehicle && x.id !== entry.id; });
          if (!sameOld.length) { doSave(); return; }
          var m = U.modal(
            '<div class="sheet-title">车辆名称变更</div>' +
            '<div class="sheet-msg">该账单集内还有 ' + sameOld.length + ' 笔「' + U.esc(entry.vehicle) + '」的条目。</div>' +
            '<div class="sheet-btns-col">' +
              '<button class="btn btn-primary" data-act="one">仅改此笔</button>' +
              '<button class="btn btn-plain" data-act="all">批量替换该账单集内所有同名车辆</button>' +
              '<button class="btn btn-plain" data-act="cancel">取消</button>' +
            '</div>', { sticky: true });
          m.el.addEventListener('click', function (ev) {
            var act = ev.target.getAttribute('data-act');
            if (act === 'one') { m.close(); doSave(); }
            else if (act === 'cancel') { m.close(); }
            else if (act === 'all') {
              var chain = DB.updateEntry(updated);
              sameOld.forEach(function (x) {
                chain = chain.then(function () {
                  x.vehicle = vehicle;
                  return DB.updateEntry(x);
                });
              });
              chain.then(function () {
                m.close(); global.App.closeOverlay(overlay);
                global.App.selectSet(setId).then(refresh);
                U.toast('已批量替换');
              });
            }
          });
        });
      } else {
        doSave();
      }
    });
  }

  global.EntriesPage = { render: render, onShow: onShow, refresh: refresh };
})(window);

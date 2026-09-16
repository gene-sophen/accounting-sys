/* page-add.js —— 记一笔：字段顺序、上次输入记忆、金额实时预览、双按钮、车辆补全 */
(function (global) {
  'use strict';

  var M = global.Money, U = global.UI, DB = global.DB;
  var root = null;
  var els = {};

  function render(container) {
    root = container;
    root.innerHTML =
      '<div class="form-card">' +
        '<label class="form-label">所属账单集</label><select class="text-input" id="a-set"></select>' +
        '<label class="form-label">日期</label><input class="text-input" id="a-date" type="date">' +
        '<label class="form-label">数量（升）</label><input class="text-input" id="a-qty" type="text" inputmode="decimal" placeholder="如 663 或 2645.570">' +
        '<label class="form-label">单价（元/升）</label><input class="text-input" id="a-price" type="text" inputmode="decimal" placeholder="如 6.90">' +
        '<label class="form-label">加油车辆</label><div class="vehicle-wrap"><input class="text-input" id="a-vehicle" type="text" maxlength="30" autocomplete="off" placeholder="输入或选择历史车辆"></div>' +
        '<label class="form-label">备注（可选）</label><input class="text-input" id="a-note" type="text" maxlength="60" placeholder="可选">' +
        '<div class="amt-preview">金额：<b id="a-amt">—</b></div>' +
      '</div>' +
      '<div class="add-btns">' +
        '<button class="btn btn-plain" id="a-save-more">保存并再记一笔</button>' +
        '<button class="btn btn-primary" id="a-save">保存这笔</button>' +
      '</div>';
    els = {
      set: root.querySelector('#a-set'),
      date: root.querySelector('#a-date'),
      qty: root.querySelector('#a-qty'),
      price: root.querySelector('#a-price'),
      vehicle: root.querySelector('#a-vehicle'),
      note: root.querySelector('#a-note'),
      amt: root.querySelector('#a-amt')
    };
    els.qty.addEventListener('input', updateAmt);
    els.price.addEventListener('input', updateAmt);
    root.querySelector('#a-save').addEventListener('click', function () { save(false); });
    root.querySelector('#a-save-more').addEventListener('click', function () { save(true); });
    global.App.attachVehicleComplete(els.vehicle, els.vehicle.parentElement, function () {
      return parseInt(els.set.value, 10);
    });
  }

  function onShow() {
    global.App.refreshSets().then(function () {
      fillSets();
      return DB.getSetting('lastAdd');
    }).then(function (last) {
      var st = global.App.state;
      if (last) {
        if (last.set_id && st.sets.some(function (s) { return s.id === last.set_id; })) {
          els.set.value = String(last.set_id);
        }
        els.date.value = last.date || U.todayStr();
        if (last.price_fen != null) els.price.value = M.fmtFen(last.price_fen);
      } else {
        els.date.value = U.todayStr();
      }
      updateAmt();
    });
  }

  function fillSets() {
    var st = global.App.state;
    var prev = els.set.value;
    els.set.innerHTML = st.sets.map(function (s) {
      return '<option value="' + s.id + '">' + U.esc(s.name) + '</option>';
    }).join('');
    if (prev && st.sets.some(function (s) { return String(s.id) === prev; })) els.set.value = prev;
    else if (st.currentSetId) els.set.value = String(st.currentSetId);
  }

  function updateAmt() {
    var q = M.parseQtyMl(els.qty.value), p = M.parsePriceFen(els.price.value);
    els.amt.textContent = (q != null && p != null) ? '¥' + M.fmtFen(M.amountFen(q, p)) : '—';
  }

  function save(again) {
    if (!global.App.state.sets.length) { U.toast('请先新建账单集'); return; }
    var setId = parseInt(els.set.value, 10);
    var date = els.date.value;
    var qty = M.parseQtyMl(els.qty.value);
    var price = M.parsePriceFen(els.price.value);
    var vehicle = els.vehicle.value.trim();
    var note = els.note.value.trim();
    if (!date) { U.toast('请选择日期'); return; }
    if (qty == null || qty <= 0) { U.toast('数量需为大于 0 的数字，最多三位小数'); return; }
    if (price == null) { U.toast('单价需为数字，最多两位小数'); return; }

    var entry = { set_id: setId, date: date, vehicle: vehicle, qty_ml: qty, price_fen: price, note: note };
    DB.addEntry(entry).then(function () {
      // 记忆上次输入：账单集 / 日期 / 单价
      return DB.setSetting('lastAdd', { set_id: setId, date: date, price_fen: price });
    }).then(function () {
      if (again) {
        els.qty.value = '';
        els.vehicle.value = '';
        els.note.value = '';
        updateAmt();
        els.qty.focus();
        U.toast('已保存');
      } else {
        els.qty.value = '';
        els.vehicle.value = '';
        els.note.value = '';
        global.App.selectSet(setId).then(function () {
          global.App.showTab('entries');
        });
      }
    });
  }

  global.AddPage = { render: render, onShow: onShow };
})(window);

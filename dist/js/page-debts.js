/* page-debts.js —— 欠账模块：客户列表 / 客户明细（年度统计、按月分组）/ 记用油 / 记收款 /
 * 打印欠账单（独立子页：全内容可编辑、设置面板、列配置、导出 PDF） */
(function (global) {
  'use strict';

  var M = global.Money, U = global.UI, DB = global.DB, S = global.Stats;
  var PAPER_W = 794;

  var root = null, listEl, emptyEl;

  // ================= 客户列表页 =================
  function render(container) {
    root = container;
    root.innerHTML =
      '<button class="btn btn-plain btn-block debt-new" id="debt-new-btn" type="button">' +
        U.icon('plus') + '<span>新建客户</span></button>' +
      '<div class="group-list" id="debt-list"></div>' +
      '<div class="empty-hint" id="debt-empty" hidden></div>';
    listEl = root.querySelector('#debt-list');
    emptyEl = root.querySelector('#debt-empty');
    root.querySelector('#debt-new-btn').addEventListener('click', function () { openCustomerModal(null); });
  }

  function onShow() { return refresh(); }

  function refresh() {
    var year = new Date().getFullYear();
    return DB.listCustomers().then(function (customers) {
      listEl.innerHTML = '';
      if (!customers.length) {
        emptyEl.hidden = false;
        emptyEl.innerHTML = U.icon('debt') + '<span>还没有客户，点上方「新建客户」开始记欠账</span>';
        return;
      }
      emptyEl.hidden = true;
      var card = document.createElement('div');
      card.className = 'group-card';
      var chain = Promise.resolve();
      customers.forEach(function (c) {
        chain = chain.then(function () {
          return Promise.all([DB.listUsage(c.id), DB.listPayments(c.id)]).then(function (rs) {
            var y = S.yearSummary(rs[0], rs[1], year);
            card.appendChild(customerRow(c, y));
          });
        });
      });
      return chain.then(function () { listEl.appendChild(card); });
    });
  }

  // 还欠/多收 文案与色彩：正=还欠（警示色），负=多收（主题色），不显示负号
  function balanceText(fen) {
    if (fen >= 0) return { text: '还欠 ¥' + M.fmtFen(fen), owed: true };
    return { text: '多收 ¥' + M.fmtFen(-fen), owed: false };
  }

  function customerRow(c, y) {
    var bal = balanceText(y.balanceFen);
    var row = document.createElement('div');
    row.className = 'entry-row customer-row';
    row.innerHTML =
      '<div class="swipe-delete">删除</div>' +
      '<div class="entry-content">' +
        '<div class="entry-main"><span class="entry-title">' + U.esc(c.name) + '</span>' +
        '<span class="debt-bal ' + (bal.owed ? 'debt-owed' : 'debt-overpaid') + '" data-bal>' + bal.text + '</span></div>' +
        '<div class="entry-sub">本年消耗 ' + M.fmtMl(y.qtyMl) + '升 · 进账 ¥' + M.fmtFen(y.payFen) + '</div>' +
      '</div>' +
      '<button type="button" class="set-edit debt-edit" aria-label="编辑">' + U.icon('pencil') + '</button>';
    U.attachSwipe(row, function () {
      U.confirm('删除后不可恢复，确认删除？（该客户全部用油/收款记录将一并删除）', { danger: true, okText: '删除' })
        .then(function (ok) {
          if (ok) DB.deleteCustomer(c.id).then(function () { refresh(); U.toast('已删除'); });
          else U.closeSwipe(row);
        });
    });
    row.querySelector('.entry-content').addEventListener('click', function () {
      if (row.dataset.noClick) { delete row.dataset.noClick; return; }
      if (row.classList.contains('swiped')) { U.closeSwipe(row); return; }
      openDetail(c);
    });
    row.querySelector('.debt-edit').addEventListener('click', function (e) {
      e.stopPropagation();
      openCustomerModal(c);
    });
    return row;
  }

  // 新建 / 编辑客户弹窗（编辑模式底部红色删除）
  function openCustomerModal(customer) {
    var isEdit = !!customer;
    var m = U.modal(
      '<div class="sheet-title">' + (isEdit ? '编辑客户' : '新建客户') + '</div>' +
      '<input class="text-input" id="cust-name" type="text" maxlength="30" placeholder="客户名称（如：张三工地）" value="' +
        (isEdit ? U.esc(customer.name) : '') + '">' +
      '<div class="sheet-btns">' +
        '<button class="btn btn-plain" data-act="cancel">取消</button>' +
        '<button class="btn btn-primary" data-act="ok">' + (isEdit ? '保存' : '创建') + '</button>' +
      '</div>' +
      (isEdit ? '<button class="btn btn-danger btn-block" data-act="delete">删除此客户</button>' : '')
    );
    var input = m.el.querySelector('#cust-name');
    input.focus();
    m.el.addEventListener('click', function (e) {
      var act = e.target.getAttribute('data-act');
      if (act === 'cancel') { m.close(); return; }
      if (act === 'ok') {
        var name = input.value.trim();
        if (!name) { U.toast('请输入客户名称'); return; }
        var p = isEdit ? DB.updateCustomer(customer.id, name) : DB.addCustomer(name);
        p.then(function () { m.close(); refresh(); });
        return;
      }
      if (act === 'delete') {
        U.confirm('删除后不可恢复，确认删除？（该客户全部用油/收款记录将一并删除）', { danger: true, okText: '删除' })
          .then(function (ok) {
            if (!ok) return;
            DB.deleteCustomer(customer.id).then(function () { m.close(); refresh(); U.toast('已删除'); });
          });
      }
    });
  }

  // ================= 客户明细页 =================
  var dd = null; // { overlay, customer, year, usage, payments }

  function openDetail(customer) {
    dd = { customer: customer, year: new Date().getFullYear(), usage: [], payments: [] };
    var overlay = document.createElement('div');
    overlay.className = 'page-overlay';
    overlay.innerHTML =
      '<div class="page-header"><button class="back-btn" type="button">‹ 返回</button>' +
        '<span class="page-title">' + U.esc(customer.name) + '</span></div>' +
      '<div class="detail-card dd-stat">' +
        '<div class="year-nav">' +
          '<button class="year-btn" id="dd-prev" type="button" aria-label="上一年">‹</button>' +
          '<span class="year-label" id="dd-year"></span>' +
          '<button class="year-btn" id="dd-next" type="button" aria-label="下一年">›</button>' +
        '</div>' +
        '<div class="detail-row"><span class="detail-k">本年消耗</span><span class="detail-v" id="dd-usage"></span></div>' +
        '<div class="detail-row"><span class="detail-k">本年进账</span><span class="detail-v" id="dd-pay"></span></div>' +
        '<div class="detail-row"><span class="detail-k" id="dd-bal-k">本年还欠</span><span class="detail-v dd-balance" id="dd-bal"></span></div>' +
        '<div class="dd-total" id="dd-total"></div>' +
      '</div>' +
      '<div class="dd-sec-title">用油记录</div>' +
      '<div class="group-list" id="dd-usage-list"></div>' +
      '<div class="dd-sec-title">收款记录</div>' +
      '<div class="group-list" id="dd-pay-list"></div>' +
      '<div class="debt-actions">' +
        '<button class="btn btn-plain" id="dd-usage-btn" type="button">记用油</button>' +
        '<button class="btn btn-plain" id="dd-payment-btn" type="button">记收款</button>' +
        '<button class="btn btn-primary" id="dd-print" type="button">打印</button>' +
      '</div>';
    document.body.appendChild(overlay);
    dd.overlay = overlay;
    overlay.querySelector('.back-btn').addEventListener('click', function () {
      global.App.closeOverlay(overlay);
      refresh();
    });
    overlay.querySelector('#dd-prev').addEventListener('click', function () { dd.year--; refreshDetail(); });
    overlay.querySelector('#dd-next').addEventListener('click', function () { dd.year++; refreshDetail(); });
    overlay.querySelector('#dd-usage-btn').addEventListener('click', function () { openRecordSheet('usage', null); });
    overlay.querySelector('#dd-payment-btn').addEventListener('click', function () { openRecordSheet('payment', null); });
    overlay.querySelector('#dd-print').addEventListener('click', openPrint);
    refreshDetail();
  }

  function reloadRecords() {
    return Promise.all([DB.listUsage(dd.customer.id), DB.listPayments(dd.customer.id)]).then(function (rs) {
      dd.usage = rs[0];
      dd.payments = rs[1];
    });
  }

  function refreshDetail() {
    reloadRecords().then(function () {
      var y = S.yearSummary(dd.usage, dd.payments, dd.year);
      var t = S.totalSummary(dd.usage, dd.payments);
      var o = dd.overlay;
      o.querySelector('#dd-year').textContent = dd.year;
      o.querySelector('#dd-usage').textContent = M.fmtMl(y.qtyMl) + '升 · ¥' + M.fmtFen(y.usageFen);
      o.querySelector('#dd-pay').textContent = '¥' + M.fmtFen(y.payFen);
      var balK = o.querySelector('#dd-bal-k'), balV = o.querySelector('#dd-bal');
      if (y.balanceFen >= 0) {
        balK.textContent = '本年还欠';
        balV.textContent = '¥' + M.fmtFen(y.balanceFen);
        balV.className = 'detail-v dd-balance debt-owed';
      } else {
        balK.textContent = '本年多收';
        balV.textContent = '¥' + M.fmtFen(-y.balanceFen);
        balV.className = 'detail-v dd-balance debt-overpaid';
      }
      var totEl = o.querySelector('#dd-total');
      totEl.textContent = (t.balanceFen >= 0 ? '累计还欠 ¥' : '累计多收 ¥') +
        M.fmtFen(Math.abs(t.balanceFen)) + '（全部年份）';
      totEl.className = 'dd-total ' + (t.balanceFen >= 0 ? '' : 'debt-overpaid');
      renderUsageList();
      renderPayList();
    });
  }

  function recordRow(opts) {
    var row = document.createElement('div');
    row.className = 'entry-row';
    row.innerHTML =
      '<div class="swipe-delete">删除</div>' +
      '<div class="entry-content">' +
        '<div class="entry-main"><span class="entry-title">' + opts.main + '</span>' +
        '<span class="entry-amt">' + opts.amt + '</span></div>' +
        '<div class="entry-sub">' + opts.sub + '</div>' +
      '</div>';
    U.attachSwipe(row, function () {
      U.confirm('删除后不可恢复，确认删除？', { danger: true, okText: '删除' }).then(function (ok) {
        if (ok) opts.onDelete().then(function () { refreshDetail(); refresh(); U.toast('已删除'); });
        else U.closeSwipe(row);
      });
    });
    row.querySelector('.entry-content').addEventListener('click', function () {
      if (row.dataset.noClick) { delete row.dataset.noClick; return; }
      if (row.classList.contains('swiped')) { U.closeSwipe(row); return; }
      opts.onEdit();
    });
    return row;
  }

  function renderUsageList() {
    var host = dd.overlay.querySelector('#dd-usage-list');
    host.innerHTML = '';
    var groups = S.monthGroups(dd.usage, dd.year);
    if (!groups.length) {
      host.innerHTML = '<div class="empty-hint dd-empty">' + U.icon('inbox') + '<span>本年暂无用油记录</span></div>';
      return;
    }
    groups.forEach(function (g) {
      var card = document.createElement('div');
      card.className = 'group-card';
      var head = document.createElement('div');
      head.className = 'group-head';
      head.innerHTML =
        '<span class="group-key">' + dd.year + '年' + g.month + '月</span>' +
        '<span class="group-sub">小计 ' + M.fmtMl(g.qtyMl) + '升 ¥' + M.fmtFen(g.fen) + '</span>';
      card.appendChild(head);
      g.items.forEach(function (r) {
        card.appendChild(recordRow({
          main: U.esc(parseInt(r.date.split('-')[1], 10) + '月' + parseInt(r.date.split('-')[2], 10) + '日'),
          amt: '¥' + M.fmtFen(r.total_fen),
          sub: M.fmtMl(r.qty_ml) + '升',
          onEdit: function () { openRecordSheet('usage', r); },
          onDelete: function () { return DB.deleteUsage(r.id); }
        }));
      });
      host.appendChild(card);
    });
  }

  function renderPayList() {
    var host = dd.overlay.querySelector('#dd-pay-list');
    host.innerHTML = '';
    var rows = dd.payments.filter(function (p) { return p.date.indexOf(String(dd.year) + '-') === 0; });
    if (!rows.length) {
      host.innerHTML = '<div class="empty-hint dd-empty">' + U.icon('inbox') + '<span>本年暂无收款记录</span></div>';
      return;
    }
    var card = document.createElement('div');
    card.className = 'group-card';
    rows.forEach(function (p) {
      card.appendChild(recordRow({
        main: U.esc(U.longDate(p.date)),
        amt: '¥' + M.fmtFen(p.amount_fen),
        sub: U.esc(p.note || '—'),
        onEdit: function () { openRecordSheet('payment', p); },
        onDelete: function () { return DB.deletePayment(p.id); }
      }));
    });
    host.appendChild(card);
  }

  // ================= 记用油 / 记收款（底部上滑表单） =================
  function openRecordSheet(kind, existing) {
    var isUsage = kind === 'usage';
    var isEdit = !!existing;
    var title = (isEdit ? '编辑' : '记') + (isUsage ? '用油' : '收款');
    var m = U.modal(
      '<div class="sheet-title">' + title + '</div>' +
      '<div class="form-card dd-form">' +
        '<label class="form-label">日期</label>' +
        '<input class="text-input" id="rf-date" type="date" value="' + (isEdit ? existing.date : U.todayStr()) + '">' +
        (isUsage
          ? '<label class="form-label">升数（最多三位小数）</label>' +
            '<input class="text-input" id="rf-qty" type="text" inputmode="decimal" placeholder="如 250 或 250.5" value="' +
              (isEdit ? M.fmtMl(existing.qty_ml) : '') + '">' +
            '<label class="form-label">总价（元，两位小数）</label>' +
            '<input class="text-input" id="rf-total" type="text" inputmode="decimal" placeholder="如 1753.50" value="' +
              (isEdit ? M.fmtFen(existing.total_fen) : '') + '">'
          : '<label class="form-label">金额（元，两位小数）</label>' +
            '<input class="text-input" id="rf-amount" type="text" inputmode="decimal" placeholder="如 1000.00" value="' +
              (isEdit ? M.fmtFen(existing.amount_fen) : '') + '">' +
            '<label class="form-label">备注（可选）</label>' +
            '<input class="text-input" id="rf-note" type="text" maxlength="60" placeholder="可选" value="' +
              (isEdit ? U.esc(existing.note || '') : '') + '">') +
      '</div>' +
      '<button class="btn btn-primary btn-block" id="rf-save">保存</button>',
      { bottom: true });
    var saving = false; // 防连续快速点保存重复入库
    m.el.querySelector('#rf-save').addEventListener('click', function () {
      if (saving) return;
      var date = m.el.querySelector('#rf-date').value;
      if (!date) { U.toast('请选择日期'); return; }
      if (isUsage) {
        var qty = M.parseQtyMl(m.el.querySelector('#rf-qty').value);
        var total = M.parsePriceFen(m.el.querySelector('#rf-total').value);
        if (qty == null || qty <= 0) { U.toast('升数需为大于 0 的数字，最多三位小数'); return; }
        if (total == null) { U.toast('总价需为数字，最多两位小数'); return; }
        var recU = isEdit ? existing : { customer_id: dd.customer.id };
        recU.date = date; recU.qty_ml = qty; recU.total_fen = total;
        (isEdit ? DB.updateUsage(recU) : DB.addUsage(recU)).then(afterSave);
      } else {
        var amount = M.parsePriceFen(m.el.querySelector('#rf-amount').value);
        if (amount == null || amount <= 0) { U.toast('金额需为大于 0 的数字，最多两位小数'); return; }
        var recP = isEdit ? existing : { customer_id: dd.customer.id };
        recP.date = date; recP.amount_fen = amount;
        recP.note = m.el.querySelector('#rf-note').value.trim();
        (isEdit ? DB.updatePayment(recP) : DB.addPayment(recP)).then(afterSave);
      }
      saving = true;
      function afterSave() {
        m.close();
        refreshDetail();
        refresh();
        U.toast('已保存');
      }
    });
  }

  // ================= 打印欠账单（独立子页） =================
  var DEBT_COLS = {
    usage: [
      { key: 'date', label: '日期', on: true },
      { key: 'qty', label: '升数（升）', on: true },
      { key: 'amount', label: '金额（元）', on: true }
    ],
    payment: [
      { key: 'date', label: '日期', on: true },
      { key: 'amount', label: '金额（元）', on: true },
      { key: 'note', label: '备注', on: true }
    ]
  };
  var COL_WEIGHT = { date: 0.9, qty: 1.05, amount: 1.15, note: 1.2 };
  var SIG_FIELDS = [
    { key: 'receiver', labelKey: 'labelReceiver', defLabel: '收货方代理人' },
    { key: 'supplier', labelKey: 'labelSupplier', defLabel: '供货方' },
    { key: 'issueDate', labelKey: 'labelIssueDate', defLabel: '出单日期' }
  ];

  var dp = null; // { overlay, doc, sigPos, sigFields, colsUsage, colsPayment }

  function debtColsKey(kind) { return 'debtCols:' + dd.customer.id + ':' + kind; }
  function debtSigPosKey() { return 'debtSigPos:' + dd.customer.id; }
  function debtSigFieldsKey() { return 'debtSigFields:' + dd.customer.id; }
  function debtFinalOnKey() { return 'debtFinalOn:' + dd.customer.id; }
  function debtUsageModeKey() { return 'debtUsageMode:' + dd.customer.id; }

  function loadDebtCols(kind) {
    return DB.getSetting(debtColsKey(kind)).then(function (saved) {
      var defs = DEBT_COLS[kind];
      if (!Array.isArray(saved)) return defs.map(function (c) { return { key: c.key, label: c.label, on: c.on }; });
      var out = saved.filter(function (c) { return defs.some(function (d) { return d.key === c.key; }); })
        .map(function (c) { return { key: c.key, label: String(c.label || ''), on: !!c.on }; });
      defs.forEach(function (d) {
        if (!out.some(function (c) { return c.key === d.key; })) out.push({ key: d.key, label: d.label, on: d.on });
      });
      return out;
    });
  }

  function openPrint() {
    var overlay = document.createElement('div');
    overlay.className = 'page-overlay';
    overlay.id = 'debt-print-overlay';
    overlay.innerHTML =
      '<div class="page-header"><button class="back-btn" type="button">‹ 返回</button>' +
        '<span class="page-title">打印欠账单</span></div>' +
      '<div class="form-card">' +
        '<label class="form-label">' + U.esc(dd.customer.name) + ' · ' + dd.year + ' 年</label>' +
        '<div class="gen-btns">' +
          '<button class="btn btn-primary btn-grow" id="dp-gen" type="button">一键生成欠账单</button>' +
          '<button class="btn btn-plain" id="dp-settings" type="button">设置</button>' +
        '</div>' +
      '</div>' +
      '<div class="paper-viewport" id="dd-viewport" hidden>' +
        '<div class="paper" id="debt-paper" style="width:' + PAPER_W + 'px"></div>' +
      '</div>' +
      '<div class="export-wrap" id="dd-export-wrap" hidden>' +
        '<button class="btn btn-primary btn-block" id="dp-export">导出 / 分享 PDF</button>' +
        '<div class="export-hint">预览用于核对布局与文字，最终效果以导出 PDF 为准</div>' +
      '</div>';
    document.body.appendChild(overlay);
    dp = { overlay: overlay, doc: null, sigPos: 'below',
      sigFields: { receiver: true, supplier: true, issueDate: true },
      finalOn: true, usageMode: 'headerTotal', colsUsage: null, colsPayment: null };
    overlay.querySelector('.back-btn').addEventListener('click', function () {
      global.App.closeOverlay(overlay);
    });
    overlay.querySelector('#dp-gen').addEventListener('click', generatePaper);
    overlay.querySelector('#dp-settings').addEventListener('click', openPrintSettings);
    overlay.querySelector('#dp-export').addEventListener('click', exportPdf);
    window.addEventListener('resize', fitDebtPaper);

    var cid = dd.customer.id;
    Promise.all([
      DB.getSetting('debtDoc:' + cid),
      DB.getSetting(debtSigPosKey()),
      DB.getSetting(debtSigFieldsKey()),
      DB.getSetting(debtFinalOnKey()),
      DB.getSetting(debtUsageModeKey()),
      DB.getSetting('supplier'),
      DB.getSetting('receiver'),
      loadDebtCols('usage'),
      loadDebtCols('payment')
    ]).then(function (rs) {
      var saved = rs[0] || {};
      dp.sigPos = rs[1] === 'above' ? 'above' : 'below';
      var sf = rs[2];
      dp.sigFields = {
        receiver: !sf || sf.receiver !== false,
        supplier: !sf || sf.supplier !== false,
        issueDate: !sf || sf.issueDate !== false
      };
      dp.finalOn = rs[3] !== false;
      dp.usageMode = ['headerTotal', 'subtotalRow', 'monthlyOnly'].indexOf(rs[4]) >= 0 ? rs[4] : 'headerTotal';
      var y = S.yearSummary(dd.usage, dd.payments, dd.year);
      var t0 = S.totalSummary(dd.usage, dd.payments);
      var autoDesc = dd.customer.name + '，' + dd.year + ' 年用油 ' + M.fmtMl(y.qtyMl) +
        ' 升（合计 ¥' + M.fmtFen(y.usageFen) + '），已收款 ¥' + M.fmtFen(y.payFen) +
        '，' + balanceText(y.balanceFen).text + '。';
      dp.doc = {
        title: saved.title != null ? saved.title : '欠账对账单',
        desc: saved.desc != null ? saved.desc : autoDesc,
        receiver: saved.receiver != null ? saved.receiver : (rs[6] || ''),
        supplier: saved.supplier != null ? saved.supplier : (rs[5] || ''),
        issueDate: saved.issueDate != null ? saved.issueDate : U.longDate(U.todayStr()),
        labelReceiver: saved.labelReceiver != null ? saved.labelReceiver : '收货方代理人',
        labelSupplier: saved.labelSupplier != null ? saved.labelSupplier : '供货方',
        labelIssueDate: saved.labelIssueDate != null ? saved.labelIssueDate : '出单日期',
        finalMain: saved.finalMain != null ? saved.finalMain : autoFinalMain(y),
        finalSub: saved.finalSub != null ? saved.finalSub : autoFinalSub(t0)
      };
      dp.colsUsage = rs[7];
      dp.colsPayment = rs[8];
      renderPaper();
    });
  }

  function autoFinalMain(y) {
    return (y.balanceFen >= 0 ? '本年还欠：¥' : '本年多收：¥') + M.fmtFen(Math.abs(y.balanceFen));
  }
  function autoFinalSub(t) {
    return (t.balanceFen >= 0 ? '累计还欠：¥' : '累计多收：¥') + M.fmtFen(Math.abs(t.balanceFen)) + '（全部年份）';
  }

  // 重新生成：保留就地编辑记忆（debtDoc 持久化），仅重取记录数据
  function generatePaper() {
    reloadRecords().then(function () {
      var cid = dd.customer.id;
      DB.getSetting('debtDoc:' + cid).then(function (saved) {
        var y = S.yearSummary(dd.usage, dd.payments, dd.year);
        var t0 = S.totalSummary(dd.usage, dd.payments);
        var autoDesc = dd.customer.name + '，' + dd.year + ' 年用油 ' + M.fmtMl(y.qtyMl) +
          ' 升（合计 ¥' + M.fmtFen(y.usageFen) + '），已收款 ¥' + M.fmtFen(y.payFen) +
          '，' + balanceText(y.balanceFen).text + '。';
        dp.doc.desc = (saved && saved.desc != null) ? saved.desc : autoDesc;
        dp.doc.finalMain = (saved && saved.finalMain != null) ? saved.finalMain : autoFinalMain(y);
        dp.doc.finalSub = (saved && saved.finalSub != null) ? saved.finalSub : autoFinalSub(t0);
        renderPaper();
      });
    });
  }

  function editable(cls, key, text, tag) {
    return '<' + tag + ' class="editable ' + cls + '" data-doc="' + key + '" contenteditable="true">' +
      U.esc(text) + '</' + tag + '>';
  }

  function sigFieldHtml(f) {
    return '<span class="sig-field">' +
      editable('sig-label', f.labelKey, dp.doc[f.labelKey], 'span') +
      '<span class="sig-colon">：</span>' +
      editable('sig-value', f.key, dp.doc[f.key], 'span') +
      '</span>';
  }

  function visibleSigFields() {
    return SIG_FIELDS.filter(function (f) { return dp.sigFields[f.key]; });
  }

  function sigAboveHtml() {
    var vis = visibleSigFields();
    if (!vis.length) return '';
    return '<div class="doc-meta">' + vis.map(function (f) {
      return '<div class="doc-meta-row">' + sigFieldHtml(f) + '</div>';
    }).join('') + '</div>';
  }

  function sigBelowHtml() {
    var vis = visibleSigFields();
    if (!vis.length) return '';
    var fR = null, fS = null, fD = null;
    vis.forEach(function (f) {
      if (f.key === 'receiver') fR = f;
      else if (f.key === 'supplier') fS = f;
      else fD = f;
    });
    var html = '<div class="doc-sig">';
    if (fR || fS) {
      html += '<div class="doc-sig-row">' +
        (fR ? sigFieldHtml(fR) : '<span></span>') +
        (fS ? sigFieldHtml(fS) : '') +
        '</div>';
    }
    if (fD) html += '<div class="doc-sig-row doc-sig-row-end">' + sigFieldHtml(fD) + '</div>';
    return html + '</div>';
  }

  function visibleDebtCols(kind) {
    var cols = kind === 'usage' ? dp.colsUsage : dp.colsPayment;
    var v = cols.filter(function (c) { return c.on; });
    return v.length ? v : cols.slice();
  }

  function colgroupHtml(cols) {
    var total = 0;
    cols.forEach(function (c) { total += COL_WEIGHT[c.key] || 1; });
    return '<colgroup>' + cols.map(function (c) {
      return '<col style="width:' + (((COL_WEIGHT[c.key] || 1) / total) * 100).toFixed(3) + '%">';
    }).join('') + '</colgroup>';
  }

  function headCellsHtml(kind, cols) {
    var all = kind === 'usage' ? dp.colsUsage : dp.colsPayment;
    return cols.map(function (c) {
      var i = all.indexOf(c);
      return '<th class="col-head" data-tbl="' + kind + '" data-col="' + i + '" contenteditable="true">' + U.esc(c.label) + '</th>';
    }).join('');
  }

  function usageCellHtml(key, r) {
    if (key === 'date') return parseInt(r.date.split('-')[2], 10) + '日';
    if (key === 'qty') return M.fmtMl(r.qty_ml);
    if (key === 'amount') return M.fmtFen(r.total_fen);
    return '';
  }

  function payCellHtml(key, p) {
    if (key === 'date') return U.longDate(p.date);
    if (key === 'amount') return M.fmtFen(p.amount_fen);
    if (key === 'note') return U.esc(p.note || '');
    return '';
  }

  function usageTableHtml() {
    var cols = visibleDebtCols('usage');
    var groups = S.monthGroups(dd.usage, dd.year);
    var y = S.yearSummary(dd.usage, dd.payments, dd.year);
    var html = '<table class="stmt-table debt-table">' + colgroupHtml(cols) +
      '<thead><tr>' + headCellsHtml('usage', cols) + '</tr></thead><tbody>';
    groups.forEach(function (g) {
      var mode = dp.usageMode;
      if (mode === 'monthlyOnly') {
        // 按月汇总：每月一行（月份名 + 当月合计，跟随列位置），无明细
        html += '<tr class="month-row">' + cols.map(function (c, i) {
          if (i === 0) return '<td>' + dd.year + '年' + g.month + '月</td>';
          if (c.key === 'qty') return '<td>' + M.fmtMl(g.qtyMl) + '</td>';
          if (c.key === 'amount') return '<td>' + M.fmtFen(g.fen) + '</td>';
          return '<td></td>';
        }).join('') + '</tr>';
        return;
      }
      // 组头行：headerTotal 模式带当月合计，subtotalRow 模式只显示月份名
      html += '<tr class="month-row">' + cols.map(function (c, i) {
        if (i === 0) return '<td>' + dd.year + '年' + g.month + '月</td>';
        if (mode === 'headerTotal' && c.key === 'qty') return '<td>' + M.fmtMl(g.qtyMl) + '</td>';
        if (mode === 'headerTotal' && c.key === 'amount') return '<td>' + M.fmtFen(g.fen) + '</td>';
        return '<td></td>';
      }).join('') + '</tr>';
      g.items.forEach(function (r) {
        html += '<tr>' + cols.map(function (c) { return '<td>' + usageCellHtml(c.key, r) + '</td>'; }).join('') + '</tr>';
      });
      if (mode === 'subtotalRow') {
        html += '<tr class="month-total">' + cols.map(function (c) {
          if (c.key === 'date') return '<td>小计</td>';
          if (c.key === 'qty') return '<td>' + M.fmtMl(g.qtyMl) + '</td>';
          if (c.key === 'amount') return '<td>' + M.fmtFen(g.fen) + '</td>';
          return '<td></td>';
        }).join('') + '</tr>';
      }
    });
    // 年合计行：始终完整
    html += '<tr class="total-row">' + cols.map(function (c) {
      if (c.key === 'date') return '<td class="total-cell">合计</td>';
      if (c.key === 'qty') return '<td class="total-cell">' + M.fmtMl(y.qtyMl) + '</td>';
      if (c.key === 'amount') return '<td class="total-cell">' + M.fmtFen(y.usageFen) + '</td>';
      return '<td></td>';
    }).join('') + '</tr>';
    return html + '</tbody></table>';
  }

  function payTableHtml() {
    var cols = visibleDebtCols('payment');
    var y = S.yearSummary(dd.usage, dd.payments, dd.year);
    var pays = dd.payments.filter(function (p) { return p.date.indexOf(String(dd.year) + '-') === 0; });
    var html = '<table class="stmt-table debt-table">' + colgroupHtml(cols) +
      '<thead><tr>' + headCellsHtml('payment', cols) + '</tr></thead><tbody>';
    pays.forEach(function (p) {
      html += '<tr>' + cols.map(function (c) { return '<td>' + payCellHtml(c.key, p) + '</td>'; }).join('') + '</tr>';
    });
    html += '<tr class="total-row">' + cols.map(function (c) {
      if (c.key === 'date') return '<td class="total-cell">合计</td>';
      if (c.key === 'amount') return '<td class="total-cell">' + M.fmtFen(y.payFen) + '</td>';
      return '<td></td>';
    }).join('') + '</tr>';
    return html + '</tbody></table>';
  }

  function renderPaper() {
    var y = S.yearSummary(dd.usage, dd.payments, dd.year);
    var t = S.totalSummary(dd.usage, dd.payments);
    var balMainCls = y.balanceFen >= 0 ? 'txt-owed' : 'txt-overpaid';
    var balSubCls = t.balanceFen >= 0 ? 'txt-owed' : 'txt-overpaid';

    var paper = dp.overlay.querySelector('#debt-paper');
    paper.innerHTML =
      editable('doc-title', 'title', dp.doc.title, 'div') +
      editable('doc-desc', 'desc', dp.doc.desc, 'div') +
      (dp.sigPos === 'above' ? sigAboveHtml() : '') +
      usageTableHtml() +
      '<div class="debt-table-gap"></div>' +
      payTableHtml() +
      (dp.finalOn
        ? '<div class="debt-final">' +
          editable('debt-final-main ' + balMainCls, 'finalMain', dp.doc.finalMain, 'div') +
          editable('debt-final-sub ' + balSubCls, 'finalSub', dp.doc.finalSub, 'div') +
          '</div>'
        : '') +
      (dp.sigPos === 'below' ? sigBelowHtml() : '');

    // 就地编辑绑定：文书 + 落款标签/值 + 两个表格的列头名
    paper.querySelectorAll('.editable').forEach(function (el) {
      el.addEventListener('blur', function () {
        var key = el.getAttribute('data-doc');
        var val = el.innerText.trim();
        dp.doc[key] = val;
        DB.setSetting('debtDoc:' + dd.customer.id, dp.doc);
        if (key === 'supplier' && val) DB.setSetting('supplier', val);
        if (key === 'receiver' && val) DB.setSetting('receiver', val);
      });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && el.getAttribute('data-doc') !== 'desc') {
          e.preventDefault();
          el.blur();
        }
      });
    });
    paper.querySelectorAll('.col-head').forEach(function (th) {
      th.addEventListener('blur', function () {
        var kind = th.getAttribute('data-tbl');
        var idx = parseInt(th.getAttribute('data-col'), 10);
        var cols = kind === 'usage' ? dp.colsUsage : dp.colsPayment;
        var v = th.innerText.trim();
        if (cols[idx] && v) {
          cols[idx].label = v;
          DB.setSetting(debtColsKey(kind), cols);
        }
      });
      th.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); th.blur(); }
      });
    });
    paper.querySelectorAll('table').forEach(function (table) {
      table.addEventListener('click', function (e) {
        if (e.target.closest('.col-head')) return;
        U.toast('数字来自记录，请返回修改后重新生成');
      });
    });

    var vp = dp.overlay.querySelector('#dd-viewport');
    var ew = dp.overlay.querySelector('#dd-export-wrap');
    vp.hidden = false;
    ew.hidden = false;
    [vp, ew].forEach(function (el) {
      el.classList.remove('reveal');
      void el.offsetWidth;
      el.classList.add('reveal');
    });
    fitDebtPaper();
  }

  function fitDebtPaper() {
    if (!dp) return;
    var vp = dp.overlay.querySelector('#dd-viewport');
    if (vp.hidden) return;
    var scale = Math.min(1, vp.clientWidth / PAPER_W);
    var p = dp.overlay.querySelector('#debt-paper');
    p.style.transform = 'scale(' + scale + ')';
    vp.style.height = (p.offsetHeight * scale) + 'px';
  }

  // ---- 欠账单设置面板 ----
  function openPrintSettings() {
    var m = U.modal(
      '<div class="sheet-title">设置</div>' +
      '<div class="settings-group-title">落款</div>' +
      '<div class="settings-card">' +
        '<div class="settings-row"><span class="settings-label">位置</span><span id="dp-sigpos" class="settings-seg"></span></div>' +
        '<div class="settings-row"><span class="settings-label">收货方代理人</span>' +
          '<label class="ios-switch"><input type="checkbox" id="dp-sf-receiver"' + (dp.sigFields.receiver ? ' checked' : '') + '><i></i></label></div>' +
        '<div class="settings-row"><span class="settings-label">供货方</span>' +
          '<label class="ios-switch"><input type="checkbox" id="dp-sf-supplier"' + (dp.sigFields.supplier ? ' checked' : '') + '><i></i></label></div>' +
        '<div class="settings-row"><span class="settings-label">出单日期</span>' +
          '<label class="ios-switch"><input type="checkbox" id="dp-sf-issueDate"' + (dp.sigFields.issueDate ? ' checked' : '') + '><i></i></label></div>' +
      '</div>' +
      '<div class="settings-group-title">结尾小结</div>' +
      '<div class="settings-card">' +
        '<div class="settings-row"><span class="settings-label">结尾小结</span>' +
          '<label class="ios-switch"><input type="checkbox" id="dp-sf-final"' + (dp.finalOn ? ' checked' : '') + '><i></i></label></div>' +
      '</div>' +
      '<div class="settings-group-title">用油表</div>' +
      '<div class="settings-card"><div id="dp-usage-mode"></div></div>' +
      '<div class="settings-group-title">列 · 用油记录</div>' +
      '<div class="settings-card"><div class="col-list" id="dp-cols-usage"></div></div>' +
      '<div class="settings-group-title">列 · 收款记录</div>' +
      '<div class="settings-card"><div class="col-list" id="dp-cols-payment"></div></div>' +
      '<button class="btn btn-primary btn-block" data-act="done">完成</button>',
      { bottom: true });

    function regen() { renderPaper(); }

    // 落款：位置 + 三字段开关
    m.el.querySelector('#dp-sigpos').appendChild(U.segmented(
      [{ value: 'below', label: '表格下方' }, { value: 'above', label: '表格上方' }],
      dp.sigPos,
      function (v) {
        dp.sigPos = v;
        DB.setSetting(debtSigPosKey(), v);
        regen();
      }
    ));
    ['receiver', 'supplier', 'issueDate'].forEach(function (k) {
      m.el.querySelector('#dp-sf-' + k).addEventListener('change', function (e) {
        dp.sigFields[k] = e.target.checked;
        DB.setSetting(debtSigFieldsKey(), dp.sigFields);
        regen();
      });
    });

    m.el.querySelector('#dp-sf-final').addEventListener('change', function (e) {
      dp.finalOn = e.target.checked;
      DB.setSetting(debtFinalOnKey(), dp.finalOn);
      regen();
    });

    // 用油表：月度合计显示方式（按客户持久化）
    m.el.querySelector('#dp-usage-mode').appendChild(U.segmented(
      [{ value: 'headerTotal', label: '组头带合计' }, { value: 'subtotalRow', label: '独立小计行' }, { value: 'monthlyOnly', label: '按月汇总' }],
      dp.usageMode,
      function (v) {
        dp.usageMode = v;
        DB.setSetting(debtUsageModeKey(), v);
        regen();
      }
    ));

    // 列：用油 / 收款 各自配置（按「客户+表」持久化）
    function drawCols(kind) {
      var cols = kind === 'usage' ? dp.colsUsage : dp.colsPayment;
      var listEl = m.el.querySelector('#dp-cols-' + kind);
      listEl.innerHTML = '';
      cols.forEach(function (c, i) {
        var row = document.createElement('div');
        row.className = 'col-row';
        row.innerHTML =
          '<label class="col-check"><input type="checkbox"' + (c.on ? ' checked' : '') + '></label>' +
          '<input class="text-input col-name" type="text" maxlength="12" value="' + U.esc(c.label) + '">' +
          '<button type="button" class="col-move" data-mv="up"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
          '<button type="button" class="col-move" data-mv="down"' + (i === cols.length - 1 ? ' disabled' : '') + '>↓</button>';
        row.querySelector('input[type=checkbox]').addEventListener('change', function (e) {
          c.on = e.target.checked;
          DB.setSetting(debtColsKey(kind), cols);
          if (cols.some(function (x) { return x.on; })) regen();
        });
        row.querySelector('.col-name').addEventListener('change', function (e) {
          var v = e.target.value.trim();
          if (v) { c.label = v; DB.setSetting(debtColsKey(kind), cols); regen(); }
          else e.target.value = c.label;
        });
        row.querySelectorAll('.col-move').forEach(function (b) {
          b.addEventListener('click', function () {
            var j = i + (b.getAttribute('data-mv') === 'up' ? -1 : 1);
            var tmp = cols[i]; cols[i] = cols[j]; cols[j] = tmp;
            DB.setSetting(debtColsKey(kind), cols);
            drawCols(kind);
            regen();
          });
        });
        listEl.appendChild(row);
      });
    }
    drawCols('usage');
    drawCols('payment');

    m.el.addEventListener('click', function (e) {
      if (e.target.getAttribute('data-act') === 'done') m.close();
    });
  }

  // ---- 导出 / 分享 PDF ----
  function exportPdf() {
    var paper = dp.overlay.querySelector('#debt-paper');
    var btn = dp.overlay.querySelector('#dp-export');
    var prevText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '正在加载导出组件…';
    global.Vendor.load().then(function () {
      btn.textContent = '正在生成 PDF…';
      var prevTransform = paper.style.transform;
      var prevHeight = dp.overlay.querySelector('#dd-viewport').style.height;
      paper.style.transform = 'none';
      paper.classList.add('capturing');
      return html2canvas(paper, { scale: 2, backgroundColor: '#ffffff', useCORS: true }).then(function (canvas) {
        paper.style.transform = prevTransform;
        paper.classList.remove('capturing');
        dp.overlay.querySelector('#dd-viewport').style.height = prevHeight;
        var jsPDF = global.jspdf.jsPDF;
        var pdf = new jsPDF('p', 'mm', 'a4');
        var margin = 10;
        var imgWmm = 210 - margin * 2;
        var usableHmm = 297 - margin * 2;
        var pxPerMm = canvas.width / imgWmm;
        var sliceH = Math.floor(usableHmm * pxPerMm);
        var y0 = 0, first = true;
        while (y0 < canvas.height) {
          var end = Math.min(y0 + sliceH, canvas.height);
          if (end < canvas.height) end = U.snapWhiteLine(canvas, end); // 分页处向上找空白行，不裁字
          var h = end - y0;
          var part = document.createElement('canvas');
          part.width = canvas.width;
          part.height = h;
          var ctx = part.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, part.width, part.height);
          ctx.drawImage(canvas, 0, y0, canvas.width, h, 0, 0, canvas.width, h);
          if (!first) pdf.addPage();
          pdf.addImage(part.toDataURL('image/jpeg', 0.95), 'JPEG', margin, margin, imgWmm, h / pxPerMm);
          first = false;
          y0 = end;
        }
        var fname = (dp.doc.title || '欠账对账单') + '-' + dd.customer.name + '-' + dd.year + '.pdf';
        var blob = pdf.output('blob');
        var file = new File([blob], fname, { type: 'application/pdf' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: fname }).catch(function () {});
        } else {
          pdf.save(fname);
        }
      }).catch(function (err) {
        paper.style.transform = prevTransform;
        paper.classList.remove('capturing');
        dp.overlay.querySelector('#dd-viewport').style.height = prevHeight;
        throw err;
      });
    }).catch(function (e) {
      U.toast(e && e.message ? e.message : 'PDF 生成失败');
    }).then(function () {
      btn.disabled = false;
      btn.textContent = prevText;
    });
  }

  global.DebtsPage = { render: render, onShow: onShow, refresh: refresh };
})(window);

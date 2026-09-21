/* page-statement.js —— 对账单页：一键生成、纸张预览、就地编辑（标题/说明/落款标签与值）、
 * 设置面板（输出格式 / 落款位置与开关 / 列设置）、PDF 导出 */
(function (global) {
  'use strict';

  var M = global.Money, U = global.UI, DB = global.DB;
  var PAPER_W = 794; // A4 @96dpi

  var DEFAULT_COLS = {
    date: [
      { key: 'seq', label: '序号', on: true },
      { key: 'date', label: '日期', on: true },
      { key: 'vehicle', label: '车辆', on: true },
      { key: 'qty', label: '升数（升）', on: true },
      { key: 'price', label: '单价（元）', on: true },
      { key: 'amount', label: '金额（元）', on: true }
    ],
    vehicle: [
      { key: 'vehicle', label: '车辆', on: true },
      { key: 'amount', label: '金额（元）', on: true },
      { key: 'qty', label: '升数（升）', on: true }
    ]
  };

  // 落款区字段定义：值 key（存 genDoc / 全局记忆）+ 标签 key（按账单集记忆）+ 默认标签
  var SIG_FIELDS = [
    { key: 'receiver', labelKey: 'labelReceiver', defLabel: '收货方代理人', global: 'receiver' },
    { key: 'supplier', labelKey: 'labelSupplier', defLabel: '供货方', global: 'supplier' },
    { key: 'issueDate', labelKey: 'labelIssueDate', defLabel: '出单日期', global: null }
  ];

  var root = null, els = {};
  var fmt = 'date';            // 当前输出格式（按账单集记忆）
  var sigPos = 'below';        // 落款位置（按 集+格式 记忆）
  var sigFields = { receiver: true, supplier: true, issueDate: true }; // 落款显示开关（按 集+格式 记忆）
  var genEntries = null;       // 当前生成所用数据
  var genCols = null;          // 当前列配置
  var genDoc = null;           // 当前文书内容（含落款标签与值）

  function render(container) {
    root = container;
    root.innerHTML =
      '<div class="form-card">' +
        '<label class="form-label">选择账单集</label><select class="text-input" id="s-set"></select>' +
        '<div class="gen-btns">' +
          '<button class="btn btn-primary btn-grow" id="s-gen">一键生成对账单</button>' +
          '<button class="btn btn-plain" id="s-settings">设置</button>' +
        '</div>' +
      '</div>' +
      '<div class="paper-viewport" id="s-viewport" hidden>' +
        '<div class="paper" id="s-paper" style="width:' + PAPER_W + 'px"></div>' +
      '</div>' +
      '<div class="export-wrap" id="s-export-wrap" hidden>' +
        '<button class="btn btn-primary btn-block" id="s-export">导出 / 分享 PDF</button>' +
        '<div class="export-hint">预览用于核对布局与文字，最终效果以导出 PDF 为准</div>' +
      '</div>' +
      '<div class="empty-hint" id="s-empty"></div>';
    els = {
      set: root.querySelector('#s-set'),
      gen: root.querySelector('#s-gen'),
      settings: root.querySelector('#s-settings'),
      viewport: root.querySelector('#s-viewport'),
      paper: root.querySelector('#s-paper'),
      exportWrap: root.querySelector('#s-export-wrap'),
      exportBtn: root.querySelector('#s-export'),
      empty: root.querySelector('#s-empty')
    };
    els.gen.addEventListener('click', generate);
    els.settings.addEventListener('click', openSettings);
    els.exportBtn.addEventListener('click', exportPdf);
    els.set.addEventListener('change', function () {
      global.App.selectSet(parseInt(els.set.value, 10)).then(function () {
        hidePaper();
        onShow();
      });
    });
    window.addEventListener('resize', fitPaper);
  }

  // ---- 设置读写（键：format:{setId} / sigPos:{setId}:{fmt} / sigFields:{setId}:{fmt} / cols:{setId}:{fmt}）----
  function sigPosKey() { return 'sigPos:' + global.App.state.currentSetId + ':' + fmt; }
  function sigFieldsKey() { return 'sigFields:' + global.App.state.currentSetId + ':' + fmt; }

  function loadLayoutPrefs() {
    var setId = global.App.state.currentSetId;
    return DB.getSetting('format:' + setId).then(function (saved) {
      fmt = saved === 'vehicle' ? 'vehicle' : 'date';
      return loadSigPrefs();
    });
  }
  // 落款两个键跟随「集+格式」，fmt 确定后读取
  function loadSigPrefs() {
    return Promise.all([DB.getSetting(sigPosKey()), DB.getSetting(sigFieldsKey())]).then(function (rs) {
      sigPos = rs[0] === 'above' ? 'above' : 'below';
      var sf = rs[1];
      sigFields = {
        receiver: !sf || sf.receiver !== false,
        supplier: !sf || sf.supplier !== false,
        issueDate: !sf || sf.issueDate !== false
      };
    });
  }

  function onShow() {
    return global.App.refreshSets().then(function () {
      var st = global.App.state;
      els.set.innerHTML = st.sets.map(function (s) {
        return '<option value="' + s.id + '"' + (s.id === st.currentSetId ? ' selected' : '') + '>' + U.esc(s.name) + '</option>';
      }).join('');
      if (!st.sets.length) {
        els.empty.textContent = '还没有账单集，请先到「账目」页新建';
        hidePaper();
        return;
      }
      els.empty.textContent = '';
      return loadLayoutPrefs();
    });
  }

  function hidePaper() {
    els.viewport.hidden = true;
    els.exportWrap.hidden = true;
    genEntries = null;
  }

  // ---- 列配置读写 ----
  function colsKey() { return 'cols:' + global.App.state.currentSetId + ':' + fmt; }
  function loadCols() {
    return DB.getSetting(colsKey()).then(function (saved) {
      var defs = DEFAULT_COLS[fmt];
      if (!Array.isArray(saved)) return defs.map(function (c) { return { key: c.key, label: c.label, on: c.on }; });
      // 以保存的顺序为准，补齐新增默认列
      var out = saved.filter(function (c) { return defs.some(function (d) { return d.key === c.key; }); })
        .map(function (c) { return { key: c.key, label: String(c.label || ''), on: !!c.on }; });
      defs.forEach(function (d) {
        if (!out.some(function (c) { return c.key === d.key; })) out.push({ key: d.key, label: d.label, on: d.on });
      });
      return out;
    });
  }

  // ---- 生成 ----
  function generate() {
    var st = global.App.state;
    if (!st.sets.length) { U.toast('请先新建账单集'); return; }
    var setId = parseInt(els.set.value, 10);
    Promise.all([
      DB.listEntries(setId),
      loadCols(),
      DB.getSetting('doc:' + setId),
      DB.getSetting('supplier'),
      DB.getSetting('receiver')
    ]).then(function (rs) {
      var entries = rs[0], cols = rs[1], doc = rs[2] || {}, supplierG = rs[3], receiverG = rs[4];
      if (!entries.length) { U.toast('该账单集暂无流水'); hidePaper(); return; }
      var setName = (st.sets.filter(function (s) { return s.id === setId; })[0] || {}).name || '';
      var t = M.totals(entries);
      var dates = entries.map(function (e) { return e.date; }).sort();
      var minD = dates[0], maxD = dates[dates.length - 1];
      var rangeText = minD === maxD ? U.longDate(minD)
        : U.longDate(minD) + '至' + parseInt(maxD.split('-')[1], 10) + '月' + parseInt(maxD.split('-')[2], 10) + '日';
      genEntries = entries;
      genCols = cols;
      genDoc = {
        title: doc.title != null ? doc.title : '对账单',
        desc: doc.desc != null ? doc.desc
          : setName + '，' + rangeText + '，共加注柴油 ' + M.fmtMl(t.ml) + ' 升，合计 ' + M.fmtFen(t.fen) + ' 元。',
        supplier: doc.supplier != null ? doc.supplier : (supplierG || ''),
        receiver: doc.receiver != null ? doc.receiver : (receiverG || ''),
        issueDate: doc.issueDate != null ? doc.issueDate : U.longDate(U.todayStr()),
        labelReceiver: doc.labelReceiver != null ? doc.labelReceiver : '收货方代理人',
        labelSupplier: doc.labelSupplier != null ? doc.labelSupplier : '供货方',
        labelIssueDate: doc.labelIssueDate != null ? doc.labelIssueDate : '出单日期'
      };
      renderPaper();
    });
  }

  // ---- 纸张渲染 ----
  function editable(cls, key, text, tag) {
    return '<' + tag + ' class="editable ' + cls + '" data-doc="' + key + '" contenteditable="true">' +
      U.esc(text) + '</' + tag + '>';
  }

  function sigFieldHtml(f) {
    return '<span class="sig-field">' +
      editable('sig-label', f.labelKey, genDoc[f.labelKey], 'span') +
      '<span class="sig-colon">：</span>' +
      editable('sig-value', f.key, genDoc[f.key], 'span') +
      '</span>';
  }

  function visibleSigFields() {
    return SIG_FIELDS.filter(function (f) { return sigFields[f.key]; });
  }

  // 落款区 · 表格上方：右对齐块（原版式，带新字段与可编辑标签）
  function sigAboveHtml() {
    var vis = visibleSigFields();
    if (!vis.length) return '';
    return '<div class="doc-meta">' + vis.map(function (f) {
      return '<div class="doc-meta-row">' + sigFieldHtml(f) + '</div>';
    }).join('') + '</div>';
  }

  // 落款区 · 表格下方（新默认）：第一行 左收货方代理人 右供货方，第二行 右出单日期；隐藏字段自动补位
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

  function renderPaper() {
    var p = els.paper;
    p.innerHTML =
      editable('doc-title', 'title', genDoc.title, 'div') +
      editable('doc-desc', 'desc', genDoc.desc, 'div') +
      (sigPos === 'above' ? sigAboveHtml() : '') +
      (fmt === 'date' ? tableDate() : tableVehicle()) +
      (sigPos === 'below' ? sigBelowHtml() : '');

    bindEditable(p);
    var table = p.querySelector('table');
    table.addEventListener('click', function (e) {
      if (e.target.closest('.col-head')) return; // 表头列名可改，不提示
      U.toast('数字来自流水，请到账目页修改后重新生成');
    });
    els.viewport.hidden = false;
    els.exportWrap.hidden = false;
    fitPaper();
  }

  function bindEditable(p) {
    p.querySelectorAll('.editable').forEach(function (el) {
      el.addEventListener('blur', function () {
        var key = el.getAttribute('data-doc');
        var val = el.innerText.trim();
        genDoc[key] = val;
        var setId = global.App.state.currentSetId;
        DB.setSetting('doc:' + setId, genDoc);
        // 供货方 / 收货方代理人的值首次填写后全局记忆
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
    p.querySelectorAll('.col-head').forEach(function (th) {
      th.addEventListener('blur', function () {
        var idx = parseInt(th.getAttribute('data-col'), 10);
        var v = th.innerText.trim();
        if (genCols[idx] && v) {
          genCols[idx].label = v;
          DB.setSetting(colsKey(), genCols);
        }
      });
      th.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); th.blur(); }
      });
    });
  }

  function visibleCols() {
    var v = genCols.filter(function (c) { return c.on; });
    return v.length ? v : genCols.slice();
  }

  // 5.1 按日期流水表
  function tableDate() {
    var cols = visibleCols();
    var rows = genEntries.slice().sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.created_at - b.created_at);
    });
    var html = '<table class="stmt-table"><thead><tr>' + cols.map(function (c) {
      var i = genCols.indexOf(c);
      return '<th class="col-head" data-col="' + i + '" contenteditable="true">' + U.esc(c.label) + '</th>';
    }).join('') + '</tr></thead><tbody>';
    rows.forEach(function (e, idx) {
      html += '<tr>' + cols.map(function (c) {
        return '<td>' + cellDate(c.key, e, idx) + '</td>';
      }).join('') + '</tr>';
    });
    var t = M.totals(rows);
    html += '<tr class="total-row">' + cols.map(function (c, i) {
      if (i === 0) return '<td><b>合计</b></td>';
      if (c.key === 'qty') return '<td><b>' + M.fmtMl(t.ml) + '</b></td>';
      if (c.key === 'amount') return '<td><b>' + M.fmtFen(t.fen) + '</b></td>';
      return '<td></td>';
    }).join('') + '</tr>';
    return html + '</tbody></table>';
  }

  function cellDate(key, e, idx) {
    switch (key) {
      case 'seq': return idx + 1;
      case 'date': return U.shortDate(e.date);
      case 'vehicle': return vehicleHtml(e.vehicle);
      case 'qty': return M.fmtMl(e.qty_ml);
      case 'price': return M.fmtFen(e.price_fen);
      case 'amount': return M.fmtFen(M.amountFen(e.qty_ml, e.price_fen));
      default: return '';
    }
  }

  function vehicleHtml(name) {
    return name ? U.esc(name) : '<span class="novehicle">未填车辆</span>';
  }

  // 5.2 按车辆聚合表（双栏）
  function tableVehicle() {
    var cols = visibleCols();
    var agg = {};
    genEntries.forEach(function (e) {
      var key = e.vehicle || '';
      if (!agg[key]) agg[key] = { vehicle: key, ml: 0, fen: 0 };
      agg[key].ml += e.qty_ml;
      agg[key].fen += M.amountFen(e.qty_ml, e.price_fen);
    });
    var list = Object.keys(agg).map(function (k) { return agg[k]; })
      .sort(function (a, b) {
        if (!a.vehicle) return 1;   // 空车辆聚成一组，排最后
        if (!b.vehicle) return -1;
        return a.vehicle.localeCompare(b.vehicle, 'zh-Hans-CN');
      });
    var half = Math.ceil(list.length / 2);
    var left = list.slice(0, half), right = list.slice(half);

    // colgroup 显式均分 2k 列，保证合计行 colspan 与表体两两分组严格对齐
    var k = cols.length;
    var colgroup = '<colgroup>' + Array(k * 2 + 1).join('<col style="width:' + (100 / (k * 2)).toFixed(4) + '%">') + '</colgroup>';
    var headCells = cols.map(function (c) {
      var i = genCols.indexOf(c);
      return '<th class="col-head" data-col="' + i + '" contenteditable="true">' + U.esc(c.label) + '</th>';
    }).join('');
    var html = '<table class="stmt-table">' + colgroup + '<thead><tr>' + headCells + headCells + '</tr></thead><tbody>';
    for (var i = 0; i < left.length; i++) {
      html += '<tr>' + aggCells(cols, left[i]) + aggCells(cols, right[i]) + '</tr>';
    }
    // 合计行：占满整行、与表头对称，每格跨两列，依次为 合计｜总金额｜总升数
    var t = M.totals(genEntries);
    var totalCols = k * 2;
    var span = Math.floor(totalCols / 3);
    var spans = [totalCols - span * 2, span, span];
    var labels = ['合计', M.fmtFen(t.fen), M.fmtMl(t.ml)];
    html += '<tr class="total-row">';
    for (var j = 0; j < 3; j++) {
      if (spans[j] <= 0) continue;
      html += '<td colspan="' + spans[j] + '" class="total-cell">' + labels[j] + '</td>';
    }
    html += '</tr></tbody></table>';
    return html;
  }

  function aggCells(cols, item) {
    if (!item) return cols.map(function () { return '<td></td>'; }).join('');
    return cols.map(function (c) {
      var v = c.key === 'vehicle' ? vehicleHtml(item.vehicle)
        : c.key === 'amount' ? M.fmtFen(item.fen)
        : c.key === 'qty' ? M.fmtMl(item.ml) : '';
      return '<td>' + v + '</td>';
    }).join('');
  }

  // 纸张宽度适配手机屏幕
  function fitPaper() {
    if (els.viewport.hidden) return;
    var vw = els.viewport.clientWidth;
    var scale = Math.min(1, vw / PAPER_W);
    var p = els.paper;
    p.style.transform = 'scale(' + scale + ')';
    els.viewport.style.height = (p.offsetHeight * scale) + 'px';
  }

  // ---- 设置面板（底部上滑，iOS 分组列表风格：输出格式 / 落款 / 列）----
  function openSettings() {
    if (!global.App.state.sets.length) { U.toast('请先新建账单集'); return; }
    var setId = global.App.state.currentSetId;
    loadCols().then(function (cols) {
      var m = U.modal(
        '<div class="sheet-title">设置</div>' +
        '<div class="settings-group-title">输出格式</div>' +
        '<div class="settings-card"><div id="panel-fmt"></div></div>' +
        '<div class="settings-group-title">落款</div>' +
        '<div class="settings-card">' +
          '<div class="settings-row"><span class="settings-label">位置</span><span id="panel-sigpos" class="settings-seg"></span></div>' +
          '<div class="settings-row"><span class="settings-label">收货方代理人</span>' +
            '<label class="ios-switch"><input type="checkbox" id="sf-receiver"' + (sigFields.receiver ? ' checked' : '') + '><i></i></label></div>' +
          '<div class="settings-row"><span class="settings-label">供货方</span>' +
            '<label class="ios-switch"><input type="checkbox" id="sf-supplier"' + (sigFields.supplier ? ' checked' : '') + '><i></i></label></div>' +
          '<div class="settings-row"><span class="settings-label">出单日期</span>' +
            '<label class="ios-switch"><input type="checkbox" id="sf-issueDate"' + (sigFields.issueDate ? ' checked' : '') + '><i></i></label></div>' +
        '</div>' +
        '<div class="settings-group-title">列（跟随输出格式）</div>' +
        '<div class="settings-card"><div class="col-list" id="col-list"></div></div>' +
        '<button class="btn btn-primary btn-block" data-act="done">完成</button>',
        { bottom: true });

      function regen() {
        if (!genEntries) return;
        genCols = cols;
        renderPaper();
      }
      function regenCols() {
        if (!cols.some(function (c) { return c.on; })) return; // 至少一列
        regen();
      }

      // 分组 1：输出格式（按账单集记忆）
      m.el.querySelector('#panel-fmt').appendChild(U.segmented(
        [{ value: 'date', label: '按日期流水表' }, { value: 'vehicle', label: '按车辆聚合表' }],
        fmt,
        function (v) {
          fmt = v;
          DB.setSetting('format:' + setId, v);
          // 列方案与落款配置跟随新格式
          Promise.all([loadCols(), loadSigPrefs()]).then(function (rs) {
            cols = rs[0];
            drawCols();
            drawSig();
            regen();
          });
        }
      ));

      // 分组 2：落款（位置 + 三个显示开关，按 集+格式 记忆）
      function drawSig() {
        var posWrap = m.el.querySelector('#panel-sigpos');
        posWrap.innerHTML = '';
        posWrap.appendChild(U.segmented(
          [{ value: 'below', label: '表格下方' }, { value: 'above', label: '表格上方' }],
          sigPos,
          function (v) {
            sigPos = v;
            DB.setSetting(sigPosKey(), v);
            regen();
          }
        ));
        ['receiver', 'supplier', 'issueDate'].forEach(function (k) {
          var input = m.el.querySelector('#sf-' + k);
          input.checked = sigFields[k];
        });
      }
      ['receiver', 'supplier', 'issueDate'].forEach(function (k) {
        m.el.querySelector('#sf-' + k).addEventListener('change', function (e) {
          sigFields[k] = e.target.checked;
          DB.setSetting(sigFieldsKey(), sigFields);
          regen();
        });
      });
      drawSig();

      // 分组 3：列设置（跟随当前输出格式，按 集+格式 持久化）
      var listEl = m.el.querySelector('#col-list');
      function persistCols() { return DB.setSetting(colsKey(), cols); }
      function drawCols() {
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
            persistCols();
            regenCols();
          });
          row.querySelector('.col-name').addEventListener('change', function (e) {
            var v = e.target.value.trim();
            if (v) { c.label = v; persistCols(); regenCols(); } else e.target.value = c.label;
          });
          row.querySelectorAll('.col-move').forEach(function (b) {
            b.addEventListener('click', function () {
              var j = i + (b.getAttribute('data-mv') === 'up' ? -1 : 1);
              var tmp = cols[i]; cols[i] = cols[j]; cols[j] = tmp;
              persistCols();
              drawCols();
              regenCols();
            });
          });
          listEl.appendChild(row);
        });
      }
      drawCols();

      m.el.addEventListener('click', function (e) {
        if (e.target.getAttribute('data-act') === 'done') m.close();
      });
    });
  }

  // ---- 导出 / 分享 PDF ----
  function exportPdf() {
    if (!genEntries) return;
    var paper = els.paper;
    var prevTransform = paper.style.transform;
    var prevHeight = els.viewport.style.height;
    paper.style.transform = 'none';
    paper.classList.add('capturing'); // 截图时隐藏虚线编辑框与铅笔角标
    els.viewport.style.height = 'auto';
    U.toast('正在生成 PDF…');
    html2canvas(paper, { scale: 2, backgroundColor: '#ffffff', useCORS: true }).then(function (canvas) {
      paper.style.transform = prevTransform;
      paper.classList.remove('capturing');
      els.viewport.style.height = prevHeight;

      var jsPDF = global.jspdf.jsPDF;
      var pdf = new jsPDF('p', 'mm', 'a4');
      var margin = 10;
      var imgWmm = 210 - margin * 2;
      var usableHmm = 297 - margin * 2;
      var pxPerMm = canvas.width / imgWmm;
      var sliceH = Math.floor(usableHmm * pxPerMm);
      var y = 0, first = true;
      while (y < canvas.height) {
        var h = Math.min(sliceH, canvas.height - y);
        var part = document.createElement('canvas');
        part.width = canvas.width;
        part.height = h;
        var ctx = part.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, part.width, part.height);
        ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
        if (!first) pdf.addPage();
        pdf.addImage(part.toDataURL('image/jpeg', 0.95), 'JPEG', margin, margin, imgWmm, h / pxPerMm);
        first = false;
        y += h;
      }
      var setName = (global.App.state.sets.filter(function (s) {
        return s.id === global.App.state.currentSetId;
      })[0] || {}).name || '';
      var fname = (genDoc.title || '对账单') + '-' + setName + '.pdf';
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
      els.viewport.style.height = prevHeight;
      U.toast('PDF 生成失败：' + err.message);
    });
  }

  global.StatementPage = { render: render, onShow: onShow };
})(window);

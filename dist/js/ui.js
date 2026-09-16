/* ui.js —— 可复用 UI 组件：Toast、确认弹窗、通用模态框、分段控件 */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ---- Toast ----
  var toastTimer = null;
  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 1800);
  }

  // ---- 确认弹窗（Promise<boolean>）----
  function confirmDialog(message, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'overlay';
      overlay.innerHTML =
        '<div class="dialog">' +
          '<div class="dialog-msg">' + esc(message) + '</div>' +
          '<div class="dialog-btns">' +
            '<button class="dialog-btn" data-act="cancel">取消</button>' +
            '<button class="dialog-btn ' + (opts.danger ? 'danger' : 'primary') + '" data-act="ok">' +
              esc(opts.okText || '确认') + '</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(overlay);
      overlay.addEventListener('click', function (e) {
        var act = e.target.getAttribute('data-act');
        if (e.target === overlay || act === 'cancel') { cleanup(); resolve(false); }
        else if (act === 'ok') { cleanup(); resolve(true); }
      });
      function cleanup() { overlay.remove(); }
    });
  }

  // ---- 通用模态框 ----
  // content: HTML 字符串；返回 { el, close }，调用方自行绑定内部事件
  function modal(contentHtml, opts) {
    opts = opts || {};
    var overlay = document.createElement('div');
    overlay.className = 'overlay';
    var sheet = document.createElement('div');
    sheet.className = 'sheet' + (opts.wide ? ' sheet-wide' : '');
    sheet.innerHTML = contentHtml;
    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
    function close() { overlay.remove(); }
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay && !opts.sticky) close();
    });
    return { el: sheet, overlay: overlay, close: close };
  }

  // ---- 分段控件 ----
  // options: [{value,label}]，onChange(value)
  function segmented(options, current, onChange) {
    var wrap = document.createElement('div');
    wrap.className = 'segmented';
    options.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'seg-btn' + (o.value === current ? ' active' : '');
      b.textContent = o.label;
      b.setAttribute('data-value', o.value);
      b.addEventListener('click', function () {
        if (b.classList.contains('active')) return;
        wrap.querySelectorAll('.seg-btn').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        onChange(o.value);
      });
      wrap.appendChild(b);
    });
    return wrap;
  }

  // 日期工具：YYYY-MM-DD
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  // "2026-07-01" → "7月1日"
  function shortDate(s) {
    var p = String(s).split('-');
    return parseInt(p[1], 10) + '月' + parseInt(p[2], 10) + '日';
  }
  // "2026-07-01" → "2026年7月1日"
  function longDate(s) {
    var p = String(s).split('-');
    return p[0] + '年' + parseInt(p[1], 10) + '月' + parseInt(p[2], 10) + '日';
  }

  global.UI = {
    esc: esc,
    toast: toast,
    confirm: confirmDialog,
    modal: modal,
    segmented: segmented,
    todayStr: todayStr,
    shortDate: shortDate,
    longDate: longDate
  };
})(window);

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
  // content: HTML 字符串；opts.bottom=true 时为底部上滑大面板（iOS 设置风格）
  // 返回 { el, close }，调用方自行绑定内部事件
  function modal(contentHtml, opts) {
    opts = opts || {};
    var overlay = document.createElement('div');
    overlay.className = 'overlay' + (opts.bottom ? ' overlay-bottom' : '');
    var sheet = document.createElement('div');
    sheet.className = 'sheet' + (opts.wide ? ' sheet-wide' : '') + (opts.bottom ? ' sheet-bottom' : '');
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

  // ---- 内联 SVG 图标（stroke 风格，随 currentColor 变色）----
  var ICONS = {
    pencil: '<svg viewBox="0 0 24 24"><path d="M12 20h8"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7.5 18.5 3 20l1.5-4.5Z"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    inbox: '<svg viewBox="0 0 24 24"><path d="M3 13l3-8h12l3 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/><path d="M3 13h6l1.5 2.5h3L15 13h6"/></svg>',
    receipt: '<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-2-1.3L14 21l-2-1.3L10 21l-2-1.3L6 21Z"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="9" y1="12" x2="15" y2="12"/></svg>'
  };
  function icon(name) { return ICONS[name] || ''; }

  global.UI = {
    esc: esc,
    toast: toast,
    confirm: confirmDialog,
    modal: modal,
    segmented: segmented,
    icon: icon,
    todayStr: todayStr,
    shortDate: shortDate,
    longDate: longDate
  };
})(window);

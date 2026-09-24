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
    receipt: '<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-2-1.3L14 21l-2-1.3L10 21l-2-1.3L6 21Z"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="9" y1="12" x2="15" y2="12"/></svg>',
    debt: '<svg viewBox="0 0 24 24"><circle cx="9" cy="7" r="3.2"/><path d="M3.5 20c0-3 2.5-5.5 5.5-5.5 1.5 0 2.9.6 3.9 1.6"/><circle cx="17" cy="17" r="3.6"/><line x1="15.2" y1="17" x2="18.8" y2="17"/></svg>'
  };
  function icon(name) { return ICONS[name] || ''; }

  // ---- 左滑删除（行内须含 .entry-content 与 .swipe-delete）----
  var SWIPE_DELETE_W = 80;
  function closeSwipe(row) {
    row.classList.remove('swiped');
    row.querySelector('.entry-content').style.transform = '';
  }
  function attachSwipe(row, onDelete) {
    var content = row.querySelector('.entry-content');
    var startX = 0, startY = 0, dx = 0, active = false, horiz = null;
    content.addEventListener('touchstart', function (ev) {
      var t = ev.touches[0];
      startX = t.clientX; startY = t.clientY; dx = 0; horiz = null;
      active = true;
      content.style.transition = 'none';
    }, { passive: true });
    content.addEventListener('touchmove', function (ev) {
      if (!active) return;
      var t = ev.touches[0];
      var mx = t.clientX - startX, my = t.clientY - startY;
      if (horiz === null && (Math.abs(mx) > 10 || Math.abs(my) > 10)) horiz = Math.abs(mx) > Math.abs(my);
      if (!horiz) return;
      ev.preventDefault();
      var base = row.classList.contains('swiped') ? -SWIPE_DELETE_W : 0;
      var raw = base + mx;
      dx = raw - base; // 用原始位移判断意图
      var shown;
      if (raw > 0) shown = raw * 0.3;                                     // 右拉过界：阻尼
      else if (raw < -SWIPE_DELETE_W) shown = -SWIPE_DELETE_W + (raw + SWIPE_DELETE_W) * 0.3; // 左拉过界：阻尼
      else shown = raw;
      content.style.transform = 'translateX(' + shown + 'px)';
    }, { passive: false });
    content.addEventListener('touchend', function () {
      if (!active) return;
      active = false;
      content.style.transition = '';
      if (horiz) row.dataset.noClick = '1';
      if (horiz && dx < -30) {
        row.classList.add('swiped');
        content.style.transform = 'translateX(-' + SWIPE_DELETE_W + 'px)';
      } else if (horiz) {
        closeSwipe(row);
      }
    });
    row.querySelector('.swipe-delete').addEventListener('click', onDelete);
  }

  // ---- PDF 分页辅助：在目标切线附近向上找纯白行，分页不裁字 ----
  function snapWhiteLine(canvas, targetY) {
    var w = canvas.width, h = canvas.height;
    if (targetY >= h) return h;
    var range = Math.min(60, targetY);
    var ctx = canvas.getContext('2d');
    var data = ctx.getImageData(0, targetY - range, w, range).data;
    for (var dy = range - 1; dy >= 0; dy--) {
      var white = true;
      for (var x = 0; x < w; x += 4) {
        var i = (dy * w + x) * 4;
        if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) { white = false; break; }
      }
      if (white) return targetY - range + dy;
    }
    return targetY;
  }

  global.UI = {
    esc: esc,
    toast: toast,
    confirm: confirmDialog,
    modal: modal,
    segmented: segmented,
    icon: icon,
    attachSwipe: attachSwipe,
    closeSwipe: closeSwipe,
    snapWhiteLine: snapWhiteLine,
    todayStr: todayStr,
    shortDate: shortDate,
    longDate: longDate
  };
})(window);

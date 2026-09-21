/* loader.js —— vendor 库（html2canvas/jsPDF）延迟加载，Promise 缓存防重复 */
(function (global) {
  'use strict';

  var promise = null;

  // 以 loader.js 自身的 URL 为基准定位 vendor（兼容子路径部署与 test/ 目录下的页面）
  var base = (function () {
    var s = document.querySelector('script[src$="js/loader.js"]') ||
            document.querySelector('script[src*="loader.js"]');
    return s ? s.src.replace(/js\/loader\.js.*$/, '') : './';
  })();

  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('加载失败: ' + url)); };
      document.head.appendChild(s);
    });
  }

  global.Vendor = {
    loaded: function () {
      return !!(global.html2canvas && global.jspdf && global.jspdf.jsPDF);
    },
    load: function () {
      if (this.loaded()) return Promise.resolve();
      if (!promise) {
        promise = loadScript(base + 'vendor/html2canvas.min.js')
          .then(function () { return loadScript(base + 'vendor/jspdf.umd.min.js'); })
          .catch(function (e) { promise = null; throw e; });
      }
      return promise;
    }
  };
})(window);

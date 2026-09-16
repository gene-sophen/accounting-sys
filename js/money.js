/* money.js —— 金额整数运算与解析/格式化（§6.2）
 * 数量存千分之一升（qty_ml），单价存分（price_fen），金额不落库：
 * 金额(分) = Math.round(qty_ml * price_fen / 1000)
 * 合计 = 各行金额(分)先累加再格式化。
 */
(function (global) {
  'use strict';

  // 解析用户输入的数量（升）→ 千分之一升整数；非法返回 null
  function parseQtyMl(str) {
    if (str == null) return null;
    var s = String(str).trim();
    if (!/^\d+(\.\d{1,3})?$/.test(s)) return null;
    var parts = s.split('.');
    var intPart = parseInt(parts[0], 10);
    var frac = parts[1] || '';
    while (frac.length < 3) frac += '0';
    var ml = intPart * 1000 + parseInt(frac, 10);
    if (!isFinite(ml) || ml < 0) return null;
    return ml;
  }

  // 解析用户输入的单价（元/升）→ 分；非法返回 null
  function parsePriceFen(str) {
    if (str == null) return null;
    var s = String(str).trim();
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
    var parts = s.split('.');
    var intPart = parseInt(parts[0], 10);
    var frac = parts[1] || '';
    while (frac.length < 2) frac += '0';
    var fen = intPart * 100 + parseInt(frac, 10);
    if (!isFinite(fen) || fen < 0) return null;
    return fen;
  }

  // 金额(分)，整数运算四舍五入到分
  function amountFen(qtyMl, priceFen) {
    return Math.round(qtyMl * priceFen / 1000);
  }

  // 分 → "4574.70"（固定两位小数）
  function fmtFen(fen) {
    var neg = fen < 0;
    var a = Math.abs(fen);
    var s = (neg ? '-' : '') + Math.floor(a / 100) + '.' + ('0' + (a % 100)).slice(-2);
    return s;
  }

  // 千分之一升 → 最多三位小数、去尾零：2520000→"2520"，2645570→"2645.57"
  function fmtMl(ml) {
    var neg = ml < 0;
    var a = Math.abs(ml);
    var intPart = Math.floor(a / 1000);
    var frac = a % 1000;
    var s = String(neg ? -intPart : intPart);
    if (frac > 0) {
      var f = ('00' + frac).slice(-3).replace(/0+$/, '');
      s += '.' + f;
    }
    return s;
  }

  // 一组条目的合计金额(分)与合计升数(千分之一升)：先整数累加，调用方再格式化
  function totals(entries) {
    var fen = 0, ml = 0;
    for (var i = 0; i < entries.length; i++) {
      fen += amountFen(entries[i].qty_ml, entries[i].price_fen);
      ml += entries[i].qty_ml;
    }
    return { fen: fen, ml: ml };
  }

  global.Money = {
    parseQtyMl: parseQtyMl,
    parsePriceFen: parsePriceFen,
    amountFen: amountFen,
    fmtFen: fmtFen,
    fmtMl: fmtMl,
    totals: totals
  };
})(typeof window !== 'undefined' ? window : globalThis);

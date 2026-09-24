/* stats.js —— 欠账统计纯计算函数（年度汇总 / 月分组 / 累计），整数运算，可命令行测试 */
(function (global) {
  'use strict';

  // 某自然年汇总：消耗升数/总价、进账、欠账(分)=总价−收款（可为负，展示层处理符号）
  function yearSummary(usageRows, payRows, year) {
    var qtyMl = 0, usageFen = 0, payFen = 0;
    var prefix = String(year) + '-';
    for (var i = 0; i < usageRows.length; i++) {
      if (usageRows[i].date.indexOf(prefix) === 0) {
        qtyMl += usageRows[i].qty_ml;
        usageFen += usageRows[i].total_fen;
      }
    }
    for (var j = 0; j < payRows.length; j++) {
      if (payRows[j].date.indexOf(prefix) === 0) payFen += payRows[j].amount_fen;
    }
    return { qtyMl: qtyMl, usageFen: usageFen, payFen: payFen, balanceFen: usageFen - payFen };
  }

  // 全部年份累计
  function totalSummary(usageRows, payRows) {
    var qtyMl = 0, usageFen = 0, payFen = 0;
    for (var i = 0; i < usageRows.length; i++) {
      qtyMl += usageRows[i].qty_ml;
      usageFen += usageRows[i].total_fen;
    }
    for (var j = 0; j < payRows.length; j++) {
      payFen += payRows[j].amount_fen;
    }
    return { qtyMl: qtyMl, usageFen: usageFen, payFen: payFen, balanceFen: usageFen - payFen };
  }

  // 用油记录按月份分组（指定年份，月份新的在前；组内保持录入顺序）
  function monthGroups(usageRows, year) {
    var prefix = String(year) + '-';
    var map = {}, order = [];
    usageRows.forEach(function (r) {
      if (r.date.indexOf(prefix) !== 0) return;
      var m = parseInt(r.date.split('-')[1], 10);
      if (!map[m]) { map[m] = { month: m, qtyMl: 0, fen: 0, items: [] }; order.push(m); }
      map[m].qtyMl += r.qty_ml;
      map[m].fen += r.total_fen;
      map[m].items.push(r);
    });
    order.sort(function (a, b) { return b - a; });
    return order.map(function (m) { return map[m]; });
  }

  global.Stats = {
    yearSummary: yearSummary,
    totalSummary: totalSummary,
    monthGroups: monthGroups
  };
})(typeof window !== 'undefined' ? window : globalThis);

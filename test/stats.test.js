/* stats.js 命令行断言测试：年度汇总 / 月分组 / 累计 / 多收口径 */
require('../js/stats.js');
var S = globalThis.Stats;
var n = 0, fail = 0;
function eq(actual, expected, label) {
  n++;
  if (actual !== expected) { fail++; console.error('FAIL ' + label + ': got ' + JSON.stringify(actual) + ', want ' + JSON.stringify(expected)); }
  else console.log('ok ' + label);
}

var usage = [
  { date: '2026-09-03', qty_ml: 250000, total_fen: 175350, created_at: 1 },
  { date: '2026-09-10', qty_ml: 250500, total_fen: 175350, created_at: 2 },
  { date: '2026-08-01', qty_ml: 100000, total_fen: 70000, created_at: 3 },
  { date: '2025-12-31', qty_ml: 50000, total_fen: 35000, created_at: 4 }
];
var pays = [
  { date: '2026-09-15', amount_fen: 100000 },
  { date: '2025-06-01', amount_fen: 20000 }
];

// 年度汇总 2026
var y26 = S.yearSummary(usage, pays, 2026);
eq(y26.qtyMl, 600500, '2026 消耗升数');
eq(y26.usageFen, 420700, '2026 总价');
eq(y26.payFen, 100000, '2026 进账');
eq(y26.balanceFen, 320700, '2026 欠账(分)');
// 年度汇总 2025
var y25 = S.yearSummary(usage, pays, 2025);
eq(y25.balanceFen, 35000 - 20000, '2025 欠账(分)');
eq(y25.qtyMl, 50000, '2025 升数');
// 空年
var y30 = S.yearSummary(usage, pays, 2030);
eq(y30.balanceFen, 0, '2030 欠账为 0');
// 多收场景（收款 > 总价）
var yMulti = S.yearSummary(usage, [{ date: '2026-01-01', amount_fen: 500000 }], 2026);
eq(yMulti.balanceFen, 420700 - 500000, '多收时欠账为负');
// 累计
var t = S.totalSummary(usage, pays);
eq(t.qtyMl, 650500, '累计升数');
eq(t.balanceFen, 455700 - 120000, '累计欠账(分)');

// 月分组（2026：9月两条、8月一条，新的月份在前，组内保持录入顺序）
var groups = S.monthGroups(usage, 2026);
eq(groups.length, 2, '月分组数');
eq(groups[0].month, 9, '首组为 9 月');
eq(groups[0].qtyMl, 500500, '9 月小计升数');
eq(groups[0].fen, 350700, '9 月小计金额');
eq(groups[0].items.length, 2, '9 月两条');
eq(groups[0].items[0].created_at, 1, '组内按录入时间');
eq(groups[1].month, 8, '次组为 8 月');
eq(groups[1].fen, 70000, '8 月小计');
eq(S.monthGroups(usage, 2024).length, 0, '无数据年份空分组');

console.log(fail === 0 ? '\n全部通过 (' + n + ' 条)' : '\n失败 ' + fail + '/' + n);
process.exit(fail ? 1 : 0);

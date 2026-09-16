/* money.js 命令行断言测试 */
require('../js/money.js');
var M = globalThis.Money;
var n = 0, fail = 0;
function eq(actual, expected, label) {
  n++;
  if (actual !== expected) { fail++; console.error('FAIL ' + label + ': got ' + JSON.stringify(actual) + ', want ' + JSON.stringify(expected)); }
  else console.log('ok ' + label);
}

// 核心示例：663 升 × 6.90 元 = 4574.70 元
eq(M.amountFen(M.parseQtyMl('663'), M.parsePriceFen('6.90')), 457470, '663x6.90=457470分');
eq(M.fmtFen(457470), '4574.70', '457470分格式化');

// 升数格式化去尾零
eq(M.fmtMl(2520000), '2520', '2520000 -> 2520');
eq(M.fmtMl(2645570), '2645.57', '2645570 -> 2645.57');
eq(M.fmtMl(1000), '1', '1000 -> 1');
eq(M.fmtMl(1500), '1.5', '1500 -> 1.5');
eq(M.fmtMl(1050), '1.05', '1050 -> 1.05');
eq(M.fmtMl(1), '0.001', '1 -> 0.001');

// 解析
eq(M.parseQtyMl('663'), 663000, "parseQtyMl('663')");
eq(M.parseQtyMl('2645.570'), 2645570, "parseQtyMl('2645.570')");
eq(M.parseQtyMl('0.5'), 500, "parseQtyMl('0.5')");
eq(M.parseQtyMl(''), null, "parseQtyMl('') 为空");
eq(M.parseQtyMl('abc'), null, "parseQtyMl('abc') 非法");
eq(M.parseQtyMl('1.2345'), null, "parseQtyMl 超三位小数");
eq(M.parseQtyMl('-5'), null, "parseQtyMl 负数");
eq(M.parseQtyMl('1.2.3'), null, "parseQtyMl 多小数点");
eq(M.parseQtyMl(' 12.5 '), 12500, "parseQtyMl 容忍空格");
eq(M.parseQtyMl('.5'), null, "parseQtyMl('.5') 无整数位");

eq(M.parsePriceFen('6.90'), 690, "parsePriceFen('6.90')");
eq(M.parsePriceFen('6.9'), 690, "parsePriceFen('6.9')");
eq(M.parsePriceFen('7'), 700, "parsePriceFen('7')");
eq(M.parsePriceFen('6.955'), null, 'parsePriceFen 超两位小数');
eq(M.parsePriceFen(''), null, "parsePriceFen('')");
eq(M.parsePriceFen('x1'), null, "parsePriceFen('x1')");

// 合计 = 各行之和，分毫不差
var rows = [
  { qty_ml: 663000, price_fen: 690 },      // 4574.70
  { qty_ml: 115000, price_fen: 690 },      // 793.50
  { qty_ml: 2645570, price_fen: 686 },     // 2645.57*6.86=18148.6...
  { qty_ml: 333, price_fen: 1 }            // 0.00333 -> 0分(四舍五入)
];
var t = M.totals(rows);
var expectFen = M.amountFen(663000, 690) + M.amountFen(115000, 690) + M.amountFen(2645570, 686) + M.amountFen(333, 1);
eq(t.fen, expectFen, '合计等于各行金额之和');
eq(t.ml, 663000 + 115000 + 2645570 + 333, '合计升数');
eq(M.fmtFen(M.amountFen(2645570, 686)), '18148.61', '2645.57x6.86 四舍五入到分');
// §5.2 示例合计：6435 升 / 42904.50 元
var rows2 = [{ qty_ml: 663000, price_fen: 690 }];
eq(M.fmtMl(6435000), '6435', '合计升数 6435');
eq(M.fmtFen(4290450), '42904.50', '合计金额 42904.50');

console.log(fail === 0 ? '\n全部通过 (' + n + ' 条)' : '\n失败 ' + fail + '/' + n);
process.exit(fail ? 1 : 0);

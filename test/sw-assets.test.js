/* sw.js 防呆：预缓存清单内每个文件都必须存在于磁盘 */
const fs = require('fs');
const src = fs.readFileSync('sw.js', 'utf8');
const m = src.match(/var ASSETS = \[([\s\S]*?)\];/);
if (!m) { console.error('ASSETS 未找到'); process.exit(1); }
const assets = m[1].match(/'[^']+'/g).map(s => s.slice(1, -1));
let fail = 0;
assets.forEach(a => {
  const p = a === './' ? 'index.html' : a.replace(/^\.\//, '');
  if (!fs.existsSync(p) || fs.statSync(p).size === 0) {
    fail++;
    console.error('FAIL 缺失或为空: ' + a);
  } else {
    console.log('ok ' + a);
  }
});
const cache = (src.match(/var CACHE = '([^']+)'/) || [])[1];
console.log('CACHE = ' + cache + '，共 ' + assets.length + ' 项');
console.log(fail === 0 ? 'SW ASSETS 全部存在' : '缺失 ' + fail + ' 项');
process.exit(fail ? 1 : 0);

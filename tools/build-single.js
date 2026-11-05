/* tools/build-single.js — 把整个游戏打包成单文件 dist/index.html（CSS/JS 内联 + 立绘 base64）
   用法：node tools/build-single.js
   产物：dist/index.html —— 直接上传到网站根目录覆盖 index.html 即可 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'dist');
const OUT = path.join(OUT_DIR, 'index.html');

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// 引入顺序必须与 index.html 一致（先 vendor/peerjs，再 data/net-config，最后 game）
const JS_ORDER = [
  'js/vendor/peerjs.min.js',
  'js/data.js',
  'js/net-config.js',
  'js/audio.js',
  'js/effects.js',
  'js/art.js',
  'js/art-bg.js',
  'js/skills.js',
  'js/fighter.js',
  'js/ai.js',
  'js/net.js',
  'js/netplay.js',
  'js/game.js',
];

const IMAGES = ['hannya', 'angel', 'boxer', 'dancer', 'dragon', 'warlock', 'ranger', 'ronin'];

function build() {
  let js = '';
  for (const f of JS_ORDER) {
    const code = read(f);
    js += `\n/* ===================== ${f} ===================== */\n${code}\n`;
  }

  // 立绘内联为 data URI
  let inlined = 0;
  for (const name of IMAGES) {
    const from = 'assets/chars/' + name + '.jpg';
    if (!js.includes(from)) throw new Error('未找到立绘引用：' + from);
    const b64 = fs.readFileSync(path.join(ROOT, from)).toString('base64');
    js = js.split(from).join('data:image/jpeg;base64,' + b64);
    inlined++;
  }

  const css = read('css/style.css');

  // 防止 JS 里的 "</script" 提前闭合标签
  js = js.replace(/<\/script/gi, '<\\/script');

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>陈锴瑞 VS 陈锴瑞 · 八相乱斗</title>
<style>
${css}
</style>
</head>
<body>
  <div id="stage">
    <canvas id="game" width="1280" height="720"></canvas>
  </div>
<script>
${js}
</script>
</body>
</html>
`;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, html, 'utf8');
  const mb = (Buffer.byteLength(html, 'utf8') / 1024 / 1024).toFixed(2);
  console.log('✅ 已生成 ' + OUT);
  console.log('   体积 ' + mb + ' MB，内联立绘 ' + inlined + ' 张，脚本 ' + JS_ORDER.length + ' 个');
}

build();

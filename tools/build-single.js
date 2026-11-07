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
// ★ 第三期：js/art-assist.js 插在 art-bg.js 之后（只依赖 art.js 的 kit），
//          js/super.js 插在 skills.js 之后、assist.js 之前（依赖 data/art/FX，被后续文件反向调用）
const JS_ORDER = [
  'js/vendor/peerjs.min.js',
  'js/data.js',
  'js/net-config.js',
  'js/audio.js',
  'js/effects.js',
  'js/art.js',
  'js/art-bg.js',
  'js/art-assist.js',
  'js/skills.js',
  'js/super.js',
  // ★ 第四期：场上超必杀动作。moves 只放数据/动画函数，super-field 是状态机（运行时才读 moves）
  'js/super-field-moves.js',
  'js/super-field.js',
  'js/assist.js',
  'js/fighter.js',
  'js/ai.js',
  'js/net.js',
  'js/netplay.js',
  // 第五期：横版爬塔肉鸽（data → art → 逻辑/绘制），只依赖 data/art/FX/audio，被 game.js 反向调用
  'js/rogue-data.js',
  'js/rogue-rig.js',
  'js/rogue-art.js',
  'js/rogue.js',
  'js/leaderboard.js',
  'js/game.js',
];

const IMAGES = ['hannya', 'angel', 'boxer', 'dancer', 'dragon', 'warlock', 'ranger', 'ronin'];
// 援助立绘按目录实际内容收集（新增援助角色时无需再改这里）
const ASSIST_IMAGES = fs.readdirSync(path.join(ROOT, 'assets/assists'))
  .filter((f) => /\.jpe?g$/i.test(f))
  .map((f) => f.replace(/\.jpe?g$/i, ''))
  .sort();

function build() {
  // 肉鸽怪物立绘：以 base64 映射表注入，运行时优先取表、回退相对路径
  const ROGUE_SPRITES = fs.readdirSync(path.join(ROOT, 'assets/rogue'))
    .filter((f) => /\.png$/i.test(f))
    .map((f) => f.replace(/\.png$/i, ''))
    .sort();
  const spriteMap = {};
  for (const name of ROGUE_SPRITES) {
    spriteMap[name] = 'data:image/png;base64,' +
      fs.readFileSync(path.join(ROOT, 'assets/rogue/' + name + '.png')).toString('base64');
  }
  const spriteInject = 'window.BVN = window.BVN || {};\nwindow.BVN.ROGUE_SPRITE_DATA = ' +
    JSON.stringify(spriteMap) + ';\n';

  let js = spriteInject;
  for (const f of JS_ORDER) {
    const code = read(f);
    js += `\n/* ===================== ${f} ===================== */\n${code}\n`;
  }

  // 立绘内联为 data URI（角色 + 援助）
  let inlined = 0;
  const inlineAll = (names, dir) => {
    for (const name of names) {
      const from = dir + name + '.jpg';
      if (!js.includes(from)) throw new Error('未找到立绘引用：' + from);
      const b64 = fs.readFileSync(path.join(ROOT, from)).toString('base64');
      js = js.split(from).join('data:image/jpeg;base64,' + b64);
      inlined++;
    }
  };
  inlineAll(IMAGES, 'assets/chars/');
  inlineAll(ASSIST_IMAGES, 'assets/assists/');

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
  console.log('   体积 ' + mb + ' MB，内联立绘 ' + (inlined + ROGUE_SPRITES.length) + ' 张，脚本 ' + JS_ORDER.length + ' 个');
}

build();

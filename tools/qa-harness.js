/* /tmp/qa-v3/harness.js — v3 可复用验收脚手架（Node + Playwright Chromium）
 *
 * 设计原则：
 *   1) 绝不修改项目源码；只做「启动 / 轮询状态 / 按键 / 截图 / 读数 / 帧同步」。
 *   2) 全部用状态轮询推进，不用硬 sleep 等状态（sleep 只用于按键按住时长与帧锁稳定）。
 *   3) 按键一律 down → 130ms → up（游戏按「按住/松开」取样，press() 会被吞）。
 *   4) 读不到的状态如实返回 null / 记录在 missing 里，不去改源码补探针。
 *
 * 依赖：/Users/liheyang/.npm/_npx/f0a362733743bae2/node_modules/playwright
 *
 * 用法：
 *   var H = require('/tmp/qa-v3/harness.js');
 *   var page = await H.boot({ entry: 'http' });        // 源码态（http://127.0.0.1:8123/index.html，端口自动兜底）
 *   var page = await H.boot({ entry: 'dist' });        // 打包态（file://…/dist/index.html）
 *   await H.toBattle(page, 0, 7);                      // 双人对战：P1=0 P2=7，进到 roundState==='active'
 *   await H.hold(page, 'KeyJ', 150);
 *   await H.screenshot(page, 'demo');
 *   var st = await H.readState(page);
 *   var errs = H.errors(page);                          // 一条命令取全部 error
 *   await H.close(page);
 *
 * 帧锁（帧级确定性）：
 *   var lock = await H.frameLock(page);                 // 之后渲染循环完全停住
 *   await lock.step(150);                               // 手动推进 150 帧（每批末尾会 draw 一次）
 *   await lock.unlock();
 */
'use strict';

var fs = require('fs');
var path = require('path');
var http = require('http');
var cp = require('child_process');

var PW = '/Users/liheyang/.npm/_npx/f0a362733743bae2/node_modules/playwright';
var chromium = require(PW).chromium;

var PROJECT = '/Users/liheyang/Desktop/carry格斗';
var SHOTS = process.env.QA_SHOTS || '/tmp/qa-v3/shots';
function setShots(dir) { SHOTS = dir; mkdirp(dir); }
var DIST_URL = 'file://' + encodeURI(PROJECT + '/dist/index.html');
var PORT_CANDIDATES = [8123, 8124, 8125, 8126];

var servers = [];   // 本进程起的 http.server，退出时清掉

/* ---------------- 基础工具 ---------------- */

function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function mkdirp(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** 探测端口是否已经在提供 index.html（Node 直连，不走 HTTP_PROXY） */
function probePort(port) {
  return new Promise(function (resolve) {
    var req = http.get({ host: '127.0.0.1', port: port, path: '/index.html', timeout: 1200 }, function (res) {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', function () { resolve(false); });
    req.on('timeout', function () { req.destroy(); resolve(false); });
  });
}

function sleepSync(ms) { var t = Date.now(); while (Date.now() - t < ms) { /* spin */ } }

function portFree(port) {
  // 用同步 connect 判断端口是否被占用（不引第三方依赖）
  try {
    var r = cp.spawnSync('bash', ['-c', 'exec 3<>/dev/tcp/127.0.0.1/' + port + ' 2>/dev/null && echo open || echo closed'],
      { encoding: 'utf8', timeout: 1500 });
    return String(r.stdout || '').indexOf('open') < 0;
  } catch (e) { return true; }
}

/** 确保有一个 http 服务在服务 project；优先 prefer 端口，被占则顺延 */
async function ensureHttpPort(prefer, project) {
  var root = project || PROJECT;
  var ports = prefer ? [prefer].concat(PORT_CANDIDATES) : PORT_CANDIDATES.slice();
  var tried = [];
  for (var i = 0; i < ports.length; i++) {
    var p = ports[i];
    if (tried.indexOf(p) >= 0) continue;
    tried.push(p);
    if (await probePort(p)) return p;                    // 已有服务
    if (!portFree(p)) continue;                          // 被别的程序占了，换端口
    var child = cp.spawn('python3', ['-m', 'http.server', String(p), '--bind', '127.0.0.1'],
      { cwd: root, stdio: 'ignore' });
    child.unref();                       // 关键：不让子进程拖住 Node 事件循环（否则脚本跑完不退出）
    servers.push(child);
    for (var t = 0; t < 24; t++) {                       // 最多等 ~4.8s
      await delay(200);
      if (await probePort(p)) return p;
      if (child.exitCode !== null) break;
    }
    try { child.kill(); } catch (e) { /* ignore */ }
  }
  throw new Error('无法在 ' + tried.join('/') + ' 上启动静态服务（目录：' + root + '）');
}

/* ---------------- 等待 / 状态 ---------------- */

/** 轮询直到 fn 为真；失败时把现场状态一起抛出来，便于定位是脚本问题还是代码问题 */
async function waitFor(page, fn, label, timeout) {
  try {
    await page.waitForFunction(fn, null, { timeout: timeout || 15000, polling: 50 });
  } catch (e) {
    var st = null;
    try { st = await page.evaluate(function () {
      var G = window.BVN && window.BVN.Game;
      return G ? { phase: G.phase, mode: G.mode, step: G.sel && G.sel.step, turn: G.sel && G.sel.turn,
        acur: G.sel && G.sel.acur, roundState: G.roundState, frame: G.frame } : 'no-BVN.Game';
    }); } catch (e2) { st = 'evaluate-failed'; }
    throw new Error('waitFor 超时 [' + (label || '') + '] 现场状态=' + JSON.stringify(st));
  }
}

/** 等 "BVN.Game 就绪 + 画布在 + 立绘解码完" */
async function waitReady(page, timeout) {
  await waitFor(page, function () {
    return !!(window.BVN && window.BVN.Game && window.BVN.Game.phase && document.getElementById('game'));
  }, 'BVN.Game 就绪', timeout || 30000);
  await waitFor(page, function () {
    var B = window.BVN;
    if (!B || !B.Art) return false;
    var rosterOk = (B.ROSTER || []).every(function (d) { var i = B.Art.img(d.id); return i && i.complete && i.naturalWidth > 0; });
    var assistOk = (B.ASSISTS || []).every(function (d) { var i = B.Assist && B.Assist.img(d.id); return i && i.complete && i.naturalWidth > 0; });
    return rosterOk && assistOk;
  }, '立绘全部解码', timeout || 30000);
}

/* ---------------- 输入 ---------------- */

/** 点按：按住 130ms 再松开（press() 太快会被游戏吞掉） */
async function tap(page, key, holdMs) {
  await page.keyboard.down(key);
  await delay(holdMs || 130);
  await page.keyboard.up(key);
  await delay(90);
}

/** 长按指定毫秒后松开（霸体窗口、蓄力这类判定用） */
async function hold(page, key, ms) {
  await page.keyboard.down(key);
  await delay(ms || 300);
  await page.keyboard.up(key);
  await delay(60);
}

/** 点画布上的援助/角色卡（读真实 hotspots，换算成页面坐标） */
async function clickCard(page, index, kind) {
  var action = (kind === 'char' ? 'card:' : 'acard:') + index;
  var hs = await page.evaluate(function (act) {
    var G = window.BVN.Game;
    var h = (G.hotspots || []).filter(function (o) { return o.action === act; })[0];
    if (!h) return null;
    var c = document.getElementById('game');
    var r = c.getBoundingClientRect();
    var k = (parseFloat(c.style.width) || r.width) / 1280;
    return { x: r.x + (h.x + h.w / 2) * k, y: r.y + (h.y + h.h / 2) * k };
  }, action);
  if (!hs) throw new Error('clickCard: 找不到热区 ' + action + '（当前 phase/step 不对？）');
  await page.mouse.click(hs.x, hs.y);
  await delay(150);
  return hs;
}

/* ---------------- 场景推进 ---------------- */

async function toTitle(page) {
  var phase = await page.evaluate(function () { return window.BVN.Game.phase; });
  if (phase === 'title') return;
  // 从任意界面回标题：Esc 一路退
  for (var i = 0; i < 6; i++) {
    phase = await page.evaluate(function () { return window.BVN.Game.phase; });
    if (phase === 'title') return;
    await tap(page, 'Escape');
    await delay(120);
  }
  await waitFor(page, function () { return window.BVN.Game.phase === 'title'; }, 'toTitle');
}

/** 标题 → 选人（mode: 'arcade' 街机 / 'versus' 双人对战） */
async function toCharacterSelect(page, mode) {
  var m = mode || 'arcade';
  var phase = await page.evaluate(function () { return window.BVN.Game.phase; });
  if (phase === 'select') return;
  await toTitle(page);
  var want = (m === 'versus') ? 1 : 0;
  for (var guard = 0; guard < 8; guard++) {
    var idx = await page.evaluate(function () { return window.BVN.Game.menuIndex; });
    if (idx === want) break;
    await tap(page, 'ArrowDown');
  }
  await waitFor(page, 'BVN.Game.menuIndex === ' + want, 'menuIndex=' + want);
  await tap(page, 'Enter');
  await waitFor(page, function () {
    return window.BVN.Game.phase === 'select' && window.BVN.Game.sel.step === 'char';
  }, '选人界面(char)');
}

/** 选人界面 → 援助步（若已在援助步直接返回） */
async function toAssistSelect(page) {
  var step = await page.evaluate(function () { return window.BVN.Game.sel.step; });
  if (step !== 'assist') {
    var turn = await page.evaluate(function () { return window.BVN.Game.sel.turn; });
    await tap(page, turn === 1 ? 'Digit1' : 'KeyJ');   // 1P=J / 2P=1
  }
  await waitFor(page, function () { return window.BVN.Game.sel.step === 'assist'; }, '援助步');
  // 进页闸门：assistT>15 且确定键已松开过，这里等到 20 帧以后才允许确认
  await waitFor(page, function () { return (window.BVN.Game.sel.assistT || 0) > 20; }, '援助步可确认');
}

/** 把选人光标移到目标角色（4 列 x 2 行，支持环绕，从当前光标算最短前向步数） */
async function pickCharacter(page, who, index) {
  var sel = await page.evaluate(function () { return { c1: window.BVN.Game.sel.c1, c2: window.BVN.Game.sel.c2 }; });
  var cur = who === 0 ? sel.c1 : sel.c2;
  var c0 = cur % 4, r0 = (cur / 4) | 0, c1 = index % 4, r1 = (index / 4) | 0;
  var dx = ((c1 - c0) + 4) % 4, dy = ((r1 - r0) + 2) % 2;
  var K = who === 0
    ? { right: 'KeyD', left: 'KeyA', up: 'KeyW', down: 'KeyS', ok: 'KeyJ' }
    : { right: 'ArrowRight', left: 'ArrowLeft', up: 'ArrowUp', down: 'ArrowDown', ok: 'Digit1' };
  for (var i = 0; i < dx; i++) await tap(page, K.right);
  for (var j = 0; j < dy; j++) await tap(page, K.down);
  await waitFor(page, '((BVN.Game.sel.' + (who === 0 ? 'c1' : 'c2') + ') === ' + index + ')', '光标到 ' + index);
  await tap(page, K.ok);
}

/** 援助光标移到 index 并确认（需已进入援助步且闸门已开） */
async function pickAssist(page, who, index) {
  await waitFor(page, function () { return window.BVN.Game.sel.step === 'assist'; }, '援助步');
  await waitFor(page, function () { return (window.BVN.Game.sel.assistT || 0) > 20; }, '援助步闸门');
  var K = who === 0 ? { right: 'KeyD', ok: 'KeyJ' } : { right: 'ArrowRight', ok: 'Digit1' };
  for (var guard = 0; guard < 12; guard++) {
    var cur = await page.evaluate(function () { return window.BVN.Game.sel.acur; });
    if (cur === index) break;
    await tap(page, K.right);
  }
  await waitFor(page, 'BVN.Game.sel.acur === ' + index, '援助光标=' + index);
  await tap(page, K.ok);
}

/**
 * 进战斗并停在 roundState==='active'。
 * @param {number} p1 P1 角色下标 0..7
 * @param {number} [p2] P2 角色下标；给了就走双人对战（确定性，无 AI 干扰），不给走街机（AI 随机）
 * @param {object} [opts] { mode:'versus'|'arcade', a1:0..6, a2:0..6, aiLevel:0..2 }
 */
async function toBattle(page, p1, p2, opts) {
  opts = opts || {};
  var mode = opts.mode || (typeof p2 === 'number' ? 'versus' : 'arcade');
  await toCharacterSelect(page, mode);
  await pickCharacter(page, 0, p1);
  await toAssistSelect(page);
  await pickAssist(page, 0, opts.a1 || 0);
  if (mode === 'versus') {
    await waitFor(page, function () { return window.BVN.Game.sel.turn === 1 && window.BVN.Game.sel.step === 'char'; }, 'P2 选角色');
    await pickCharacter(page, 1, p2);
    await toAssistSelect(page);
    await pickAssist(page, 1, opts.a2 || 0);
  }
  await waitFor(page, function () { return window.BVN.Game.phase === 'vs'; }, 'VS 画面', 20000);
  await tap(page, 'Enter');
  await waitFor(page, function () { return window.BVN.Game.phase === 'fight'; }, '进战斗', 20000);
  await waitFor(page, function () { return window.BVN.Game.roundState === 'active'; }, 'roundState=active', 20000);
}

/* ---------------- 截图 / 读数 ---------------- */

/** 整页截图 → /tmp/qa-v3/shots/<name>.png，返回路径 */
async function screenshot(page, name, opts) {
  mkdirp(SHOTS);
  var p = path.join(SHOTS, String(name).replace(/[^\w.\-]/g, '_') + '.png');
  await page.screenshot({ path: p });
  return p;
}

/** 只截 canvas 的某个矩形（CSS 坐标），最近邻放大 scale 倍，避免小图标看不清 */
async function screenshotRect(page, name, rect, scale) {
  mkdirp(SHOTS);
  var b64 = await page.evaluate(function (arg) {
    var r = arg[0], s = arg[1] || 1;
    var c = document.getElementById('game');
    var cssW = parseFloat(c.style.width) || c.clientWidth;
    var k = c.width / cssW;
    var out = document.createElement('canvas');
    out.width = Math.round(r.w * k) * s;
    out.height = Math.round(r.h * k) * s;
    var g = out.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#000';
    g.fillRect(0, 0, out.width, out.height);
    g.drawImage(c, Math.round(r.x * k), Math.round(r.y * k), Math.round(r.w * k), Math.round(r.h * k), 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  }, [rect, scale || 1]);
  var p = path.join(SHOTS, String(name).replace(/[^\w.\-]/g, '_') + '.png');
  fs.writeFileSync(p, Buffer.from(b64.split(',')[1], 'base64'));
  return p;
}

/**
 * 一次性取回关键运行时状态快照。
 * 对「还不存在的字段」（如 v3 的超级技能）返回 null，并在 missing 里登记，
 * 方便改造前后对比；不去为了取数改源码。
 */
function readState(page) {
  return page.evaluate(function () {
    var B = window.BVN || {};
    var G = B.Game || {};
    var missing = [];

    // 动态收集「超级技能 / 霸体」相关字段：v3 字段名还在演进，不靠猜字段名，
    // 凡是名字里带 super/armor/ult 的标量都抓出来（对象只记类型，避免把整张表拖回来）。
    function dynKeys(obj, re) {
      var out = {};
      if (!obj) return out;
      Object.keys(obj).forEach(function (k) {
        if (!re.test(k)) return;
        var v = obj[k];
        if (v === null || typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') out[k] = v;
        else out[k] = Array.isArray(v) ? '[array:' + v.length + ']' : '[' + typeof v + ']';
      });
      return out;
    }

    var f = (G.fighters || []);
    var fighters = f.map(function (x) {
      return {
        id: x.def && x.def.id,
        hp: x.hp,
        hpMax: x.hpMax,                      // 现版本字段名（不是 maxHp）
        meter: x.meter,
        state: x.state,
        x: x.x, y: x.y, facing: x.facing,
        armorLevel: (x.armorLevel !== undefined ? x.armorLevel : null),
        armorTimer: (x.armorTimer !== undefined ? x.armorTimer : null),
        armorWindows: (x.def && x.def.skill && x.def.skill.armorWindows) ? 'def' : undefined,
        attackPhase: (x.attackFrame !== undefined ? x.attackFrame : (x.af !== undefined ? x.af : null)),
        dyn: dynKeys(x, /super|armor|ult/i),
      };
    });

    var cfg = {};
    if (B.CFG) {
      Object.keys(B.CFG).forEach(function (k) {
        var v = B.CFG[k];
        cfg[k] = (typeof v === 'string' && v.length > 24) ? v.slice(0, 24) + '…' : v;
      });
    }

    var supersInfo = null;
    if (B.SUPERS) {
      var keys = Object.keys(B.SUPERS);
      var sample = keys.length ? B.SUPERS[keys[0]] : null;
      supersInfo = {
        keys: keys,
        sampleFields: sample ? Object.keys(sample) : [],
        sampleId: sample && sample.id,
        sampleCost: sample && sample.cost,
        sampleTotal: sample && sample.total,
        samplePhases: sample && sample.phases ? sample.phases.map(function (p) { return p.n + ':' + p.s + '-' + p.e; }) : null,
      };
    }

    if (!('scene' in G)) missing.push('Game.scene（现版本用 Game.phase，所有场景判断请用 phase）');
    if (!B.SUPERS) missing.push('BVN.SUPERS（v3 奥义数据表未实现）');
    if (!f.length) missing.push('fighters（尚未进战斗，属于正常）');
    else {
      var anySuper = Object.keys(fighters[0].dyn).some(function (k) { return /super|ult/i.test(k); });
      if (!anySuper) missing.push('fighter 上的超级技能充能 / used 标记（字段名待工程师定，当前 fighter 上无 super*/ult* 标量）');
    }

    return {
      url: location.href,
      phase: G.phase, mode: G.mode, scene: (G.scene !== undefined ? G.scene : null),
      select: { turn: G.sel && G.sel.turn, step: G.sel && G.sel.step, acur: G.sel && G.sel.acur,
        c1: G.sel && G.sel.c1, c2: G.sel && G.sel.c2, a1: G.sel && G.sel.a1, a2: G.sel && G.sel.a2 },
      fight: { round: G.round, roundState: G.roundState, timer: G.timer, frame: G.frame,
        hitstop: G.hitstop, slowmo: G.slowmo, execT: G.execT, wins: G.wins },
      fighters: fighters,
      globalSuper: dynKeys(G, /super/i),
      assist: { sel: G.assistSel, uses: G.assistUses, cd: G.assistCd,
        records: (G.assistRecords || []).map(function (r) { return { id: r.def && r.def.id, side: r.side, phase: r.phase, t: r.t }; }) },
      cfg: cfg,
      supers: B.SUPERS ? Object.keys(B.SUPERS) : null,
      supersInfo: supersInfo,
      armor: B.ARMOR || null,
      assists: (B.ASSISTS || []).map(function (a) { return a.id; }),
      roster: (B.ROSTER || []).map(function (r) { return r.id; }),
      artLoaded: B.Art ? { loaded: B.Art.loaded, total: B.Art.total } : null,
      missing: missing,
    };
  });
}

/* ---------------- error 收集 ---------------- */

/** 一条命令取全部 error（pageerror / console.error / requestfailed） */
function errors(page) { return (page && page.qaErrors) ? page.qaErrors.slice() : []; }

function printErrors(page, tag) {
  var list = errors(page);
  var pre = (tag || 'page') + '.';
  console.log(pre + 'ERROR_COUNT=' + list.length);
  list.forEach(function (e, i) {
    console.log(pre + 'ERROR_' + i + '=' + e.kind + ' | ' + (e.url || '') + ' | ' + String(e.msg).replace(/\s+/g, ' ').slice(0, 300));
  });
  return list;
}

/* ---------------- 启动 / 关闭 ---------------- */

/**
 * boot({ entry:'http'|'dist', port, dpr, waitArt })
 * @returns {Page} page；page.qa 里带 { browser, context, url, entry }
 */
async function boot(opts) {
  opts = opts || {};
  var entry = opts.entry === 'dist' ? 'dist' : 'http';
  var browser = await chromium.launch({
    headless: true,
    args: ['--no-proxy-server', '--mute-audio', '--autoplay-policy=no-user-gesture-required'],
  });
  var context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: opts.dpr || 1,
  });
  var page = await context.newPage();

  page.qaErrors = [];
  page.on('pageerror', function (e) {
    page.qaErrors.push({ kind: 'pageerror', msg: String((e && e.message) || e) });
  });
  page.on('console', function (m) {
    if (m.type() === 'error') page.qaErrors.push({ kind: 'console', msg: m.text() });
  });
  page.on('requestfailed', function (r) {
    var f = r.failure();
    page.qaErrors.push({ kind: 'requestfailed', url: r.url().slice(0, 160), msg: (f && f.errorText) || '' });
  });

  var url;
  if (opts.url) {
    url = opts.url;                                   // 显式入口（worktree / 自定义端口）
  } else if (entry === 'dist') {
    url = DIST_URL;
  } else {
    var port = await ensureHttpPort(opts.port, opts.project);
    url = 'http://127.0.0.1:' + port + '/index.html';
  }

  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await waitReady(page, opts.timeout);
  if (opts.waitArt !== false) await delay(120);   // 让首帧先画一遍

  page.qa = { browser: browser, context: context, url: url, entry: entry };
  return page;
}

async function close(page) {
  if (!page) return;
  var qa = page.qa;
  try { if (qa && qa.browser) await qa.browser.close(); } catch (e) { /* ignore */ }
}

/* ---------------- 帧锁（帧级确定性） ---------------- */

/**
 * frameLock(page)：把 requestAnimationFrame 换成 no-op，让游戏循环彻底停住，
 * 之後只能用 lock.step(n) 手动推进 BVN.Game.update(1/60)（每批末尾 draw 一次）。
 * 注意：锁住之后，按键事件仍会写入 G.keys/G.pressed，但只有 step() 才消费。
 */
async function frameLock(page) {
  await page.evaluate(function () {
    if (window.__qaFrozen) return;
    window.__qaRaf = window.requestAnimationFrame;
    window.__qaFrozen = true;
    window.__qaStepCount = 0;
    window.__qaQ = [];                       // 把游戏循环的回调「挂号」而不是丢掉，unlock 才能续上
    window.requestAnimationFrame = function (cb) { window.__qaQ.push(cb); return 0; };
    window.__qaStep = function (n) {
      n = n || 1;
      for (var i = 0; i < n; i++) {
        if (window.BVN && window.BVN.Game && window.BVN.Game.update) window.BVN.Game.update(1 / 60);
        window.__qaStepCount++;
      }
      try { if (window.BVN && window.BVN.Game && window.BVN.Game.draw) window.BVN.Game.draw(); } catch (e) { /* 绘制异常由 pageerror 捕获 */ }
      return window.__qaStepCount;
    };
  });
  // 覆盖 rAF 时可能还有一帧已排队，等它跑完再确认真的停住了
  for (var i = 0; i < 6; i++) {
    await delay(80);
    var a = await page.evaluate(function () { return window.BVN.Game.frame; });
    await delay(80);
    var b = await page.evaluate(function () { return window.BVN.Game.frame; });
    if (a === b) break;
  }
  var frozenCheck = await page.evaluate(function () {
    var a = window.BVN.Game.frame;
    return new Promise(function (res) {
      setTimeout(function () { res(a === window.BVN.Game.frame); }, 120);
    });
  });

  var api = {
    frozen: frozenCheck,
    /** 手动推进 n 帧 */
    step: function (n) { return page.evaluate(function (k) { return window.__qaStep(k); }, n || 1); },
    /** 推进直到 pred 为真（pred 在页面上下文执行，支持字符串表达式） */
    stepUntil: async function (pred, maxFrames) {
      var max = maxFrames || 600;
      for (var i = 0; i <= max; i++) {
        var ok = await page.evaluate(function (src) {
          try { return !!(new Function('return (' + src + ')'))(); } catch (e) { return false; }
        }, pred);
        if (ok) return i;
        await page.evaluate(function () { window.__qaStep(1); });
      }
      throw new Error('stepUntil 超过 ' + max + ' 帧仍未满足：' + pred);
    },
    /** 按住 key 推进 n 帧（霸体窗口这类要「保持输入」的场景） */
    pressStep: async function (key, n) {
      await page.keyboard.down(key);
      try { await page.evaluate(function (k) { return window.__qaStep(k); }, n || 1); }
      finally { await page.keyboard.up(key); }
    },
    frames: function () { return page.evaluate(function () { return window.__qaStepCount || 0; }); },
    unlock: function () {
      // 先把挂号的游戏循环回调交还给真 rAF，否则循环永远断在原地
      return page.evaluate(function () {
        if (!window.__qaRaf) return;
        window.requestAnimationFrame = window.__qaRaf;
        window.__qaFrozen = false;
        var q = window.__qaQ || [];
        window.__qaQ = [];
        q.forEach(function (cb) { window.__qaRaf(cb); });
      });
    },
  };
  return api;
}

module.exports = {
  // 启动 / 关闭
  boot: boot,
  close: close,
  // 场景推进
  toTitle: toTitle,
  toCharacterSelect: toCharacterSelect,
  toAssistSelect: toAssistSelect,
  toBattle: toBattle,
  pickCharacter: pickCharacter,
  pickAssist: pickAssist,
  // 输入
  tap: tap,
  hold: hold,
  clickCard: clickCard,
  // 观测
  screenshot: screenshot,
  screenshotRect: screenshotRect,
  readState: readState,
  errors: errors,
  printErrors: printErrors,
  waitFor: waitFor,
  waitReady: waitReady,
  // 帧锁
  frameLock: frameLock,
  // 杂项
  delay: delay,
  dist: DIST_URL,
  project: PROJECT,
  shots: SHOTS,
  setShots: setShots,
  ensureHttpPort: ensureHttpPort,
};

function killServers() {
  servers.forEach(function (c) { try { c.kill(); } catch (e) { /* ignore */ } });
  servers.length = 0;
}

process.on('exit', killServers);
process.on('SIGINT', function () { killServers(); process.exit(130); });
process.on('SIGTERM', function () { killServers(); process.exit(143); });

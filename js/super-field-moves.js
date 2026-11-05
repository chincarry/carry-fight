/* js/super-field-moves.js — 场上超必杀动作库（第四期 T07）
 *
 * 本文件**只放数据与动画函数**，不含任何状态机逻辑：
 *   状态机 / 命中派发 / 霸体与免伤续期 / 联机同步 全在 js/super-field.js（BVN.Field）。
 *
 * 每个角色的条目契约（引擎逐帧调用，顺序固定 move → pose → fx → 命中结算 → draw）：
 *
 *   BVN.FIELD_MOVES[id] = {
 *     total: 160~220,          // 动作总帧数（60fps → 2.7~3.7 秒）
 *     label: '百鬼夜行 · 终',   // 起始 26 帧显示在施法者上方的招式名
 *     hits: [                  // 4~6 段命中；f = 相对动作起始帧（递增）
 *       { f: 40, dmg: 55, hitstun: 22, kb: 90, lift: 0, sfx: 'slash', shake: 10 },
 *     ],
 *     move: function (f, t, G) { ... },   // 每帧：绝对写 f.x / f.y / f.facing / f.glow
 *     pose: function (f, t) { ... },      // 每帧：返回 13 字段姿势对象（绝对覆盖）
 *     fx:   function (f, t, G) { ... },   // 每帧：BVN.FX.* / BVN.Sfx.play / G.shake
 *     draw: function (ctx, f, t, G) { ... } // 可选：世界坐标额外绘制
 *   };
 *
 * 姿势 13 字段（与 BVN.POSE_DEFAULT 一致）：t, h, afu, aff, abu, abf, lft, lfs, lbt, lbs, c, rot, hipx
 * 角度约定（见 js/art.js skeleton / pt）：0 = 正下方，+π/2 = 正前方，π = 正上方，负值 = 身后。
 *
 * ── 两条实现约定（与 super-field.js 的分工）─────────────────────────────
 * 1) 位置由本文件**绝对驱动**：每帧写 f.x / f.y 并把 f.vx / f.vy 归零，
 *    所以状态机**不要**再对施法者做速度积分，否则位移会翻倍。
 * 2) 命中帧的「音效 / 震屏 / 伤害数字」由状态机按 hits[] 派发；本文件只补
 *    **非命中**的关键音（起手蓄力、起跳、落地、召唤），以及命中点的火花与冲击环。
 */
window.BVN = window.BVN || {};

(function (BVN) {
  'use strict';

  /* ============================================================
   * 0. 基础工具（数学 / 姿势关键帧 / 引擎传参解析）
   * ============================================================ */

  const TAU = Math.PI * 2;

  /** 姿势的 13 个字段（顺序固定，便于自检）。 */
  const POSE_KEYS = [
    't', 'h', 'afu', 'aff', 'abu', 'abf',
    'lft', 'lfs', 'lbt', 'lbs', 'c', 'rot', 'hipx',
  ];

  /** data.js 未加载时的兜底默认姿势（与 BVN.POSE_DEFAULT 同值）。 */
  const FALLBACK_POSE = {
    t: 0.05, h: -0.04,
    afu: 0.55, aff: 0.78,
    abu: -0.34, abf: 0.52,
    lft: 0.2, lfs: -0.16,
    lbt: -0.2, lbs: -0.1,
    c: 6, rot: 0, hipx: 0,
  };

  /** 舞台左/右安全边距（角色中心不得越界）。 */
  const EDGE = 36;

  /** rot ≥ 0.02 时 Art.drawFighter 会把整只角色下移 12px，move 里要抵消掉。 */
  const ROT_LIFT = 12;

  function defaultPose() {
    return BVN.POSE_DEFAULT || FALLBACK_POSE;
  }

  function cfg() {
    return BVN.CFG || { STAGE_W: 1680, GROUND_Y: 600, GRAVITY: 2300 };
  }

  function groundY() {
    return cfg().GROUND_Y;
  }

  function clamp(v, a, b) {
    return v < a ? a : (v > b ? b : v);
  }

  function lerp(a, b, k) {
    return a + (b - a) * k;
  }

  /** 归一化到 [0,1]。 */
  function seg(n, a, b) {
    if (b === a) return n >= b ? 1 : 0;
    return clamp((n - a) / (b - a), 0, 1);
  }

  /** 稳定伪随机（按整数索引），保证同一帧重复绘制结果一致（不会闪）。 */
  function h1(i) {
    const v = Math.sin(i * 127.1 + 11.7) * 43758.5453;
    return v - Math.floor(v);
  }

  /** 缓动表。 */
  const EASE = {
    lin: function (k) { return k; },
    io: function (k) { return k * k * (3 - 2 * k); },        // 平滑进出（默认）
    out: function (k) { return 1 - (1 - k) * (1 - k); },
    out3: function (k) { return 1 - Math.pow(1 - k, 3); },   // 快出慢收（爆发）
    in: function (k) { return k * k; },
    in3: function (k) { return k * k * k; },                 // 慢起快收（下坠）
    hard: function (k) { return Math.pow(k, 0.32); },        // 出手瞬间几乎到顶点
    snap: function (k) { return 1 - Math.pow(1 - k, 6); },   // 极短时间到顶点后定住
  };

  function ease(kind, k) {
    const fn = EASE[kind] || EASE.io;
    return fn(clamp(k, 0, 1));
  }

  /** 把半姿势补全成 13 字段的完整姿势（缺省字段取 POSE_DEFAULT）。 */
  function fit(partial) {
    const d = defaultPose();
    const out = {};
    for (let i = 0; i < POSE_KEYS.length; i++) {
      const k = POSE_KEYS[i];
      out[k] = partial && partial[k] != null ? partial[k] : d[k];
    }
    return out;
  }

  /** 两份完整姿势按 k 插值（rot 也线性插值 —— 连续旋转靠它）。 */
  function mixPose(a, b, k) {
    const out = {};
    for (let i = 0; i < POSE_KEYS.length; i++) {
      const key = POSE_KEYS[i];
      out[key] = a[key] + (b[key] - a[key]) * k;
    }
    return out;
  }

  /**
   * 关键帧轨道：keys = [{ f, p, e }]（f 递增，p 可只写要改的字段，e 是本段缓动）。
   * 返回 function (n) → 13 字段完整姿势（每帧新对象，绝不会污染上一帧）。
   */
  function track(keys) {
    const ks = keys.map(function (k) {
      return { f: k.f, p: fit(k.p), e: k.e || 'io' };
    });
    return function (n) {
      if (!ks.length) return fit(null);
      if (n <= ks[0].f) return fit(ks[0].p);
      for (let i = 0; i < ks.length - 1; i++) {
        const a = ks[i];
        const b = ks[i + 1];
        if (n <= b.f) {
          const k = seg(n, a.f, b.f);
          return mixPose(a.p, b.p, ease(b.e, k));
        }
      }
      return fit(ks[ks.length - 1].p);
    };
  }

  /**
   * 数值轨道（用于 y 高度 / x 偏移这类标量）：keys = [{ f, v, e }]。
   * 返回 function (n) → number。
   */
  function numTrack(keys) {
    return function (n) {
      if (!keys.length) return 0;
      if (n <= keys[0].f) return keys[0].v;
      for (let i = 0; i < keys.length - 1; i++) {
        const a = keys[i];
        const b = keys[i + 1];
        if (n <= b.f) {
          const k = seg(n, a.f, b.f);
          return lerp(a.v, b.v, ease(b.e, k));
        }
      }
      return keys[keys.length - 1].v;
    };
  }

  /** 该帧是否落在 [k, k+1) 这个整数帧里（用于"只播一次"的音效与粒子）。 */
  function at(n, k) {
    return n >= k && n < k + 1;
  }

  /** 该帧是否落在 [a, b] 区间内。 */
  function inRange(n, a, b) {
    return n >= a && n <= b;
  }

  /**
   * 解析引擎传参。契约签名有多种可能（move(f,t,G) / pose(f,t) / draw(ctx,f,t,G)），
   * 这里按类型扫一遍，任意顺序都能拿到 ctx / 战斗对象 / G / 帧号：
   *   - 带 beginPath 或 canvas     → 2D 上下文
   *   - 带 fighters / cam / shake → G（Game）
   *   - 带 facing / pose / hp     → 战斗对象
   *   - 余下的数字里帧号恒 ≥ 秒×60，取最大值即帧号
   */
  function readArgs(list) {
    const r = { ctx: null, f: null, G: null, n: 0 };
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      if (v == null) continue;
      if (typeof v === 'number') {
        if (isFinite(v) && v > r.n) r.n = v;
      } else if (typeof v === 'object') {
        if (r.ctx === null && (typeof v.beginPath === 'function' || v.canvas)) {
          r.ctx = v;
        } else if (r.G === null && (v.fighters || v.cam || typeof v.shake === 'function')) {
          r.G = v;
        } else if (r.f === null && (v.facing != null || v.pose || v.hp != null)) {
          r.f = v;
        }
      }
    }
    return r;
  }

  /**
   * 取本次施法的私有状态（挂在施法者身上，只用于记录"起点 / 历史残影"这类纯表现数据）。
   * 帧号回退（新一次施法从 0 重新开始）时自动重建。
   */
  function st(f, tag, n) {
    let s = f.__fm;
    if (!s || s.tag !== tag || n < s.lastN - 0.5) {
      s = f.__fm = {
        tag: tag,
        x0: f.x,
        y0: f.y,
        dir: f.facing < 0 ? -1 : 1,
        lastN: -1,
        marks: [],
      };
    }
    s.lastN = n;
    return s;
  }

  function opponent(G, f) {
    if (G && G.fighters && G.fighters.length >= 2) {
      return G.fighters[0] === f ? G.fighters[1] : G.fighters[0];
    }
    return null;
  }

  function clampX(x) {
    return clamp(x, EDGE, cfg().STAGE_W - EDGE);
  }

  /**
   * 绝对写位置：x 夹在安全边界内、速度归零（避免被物理再积分一次）、
   * 贴地判定以 GROUND_Y 为准。
   * @param {Object} f 施法者
   * @param {number} x 目标 x
   * @param {number} y 目标 y（= 地面高度 - 抬升）
   */
  function applyPos(f, x, y) {
    f.x = clampX(x);
    f.y = y;
    f.vx = 0;
    f.vy = 0;
    f.onGround = y >= groundY() - 0.75;
  }

  /* ============================================================
   * 1. 特效 / 音效 / 绘制小工具
   * ============================================================ */

  function sfx(name) {
    if (BVN.Sfx && BVN.Sfx.play) BVN.Sfx.play(name);
  }

  function shake(G, mag, frames) {
    if (G && typeof G.shake === 'function') G.shake(mag, frames);
  }

  function spark(x, y, power, color) {
    if (BVN.FX && BVN.FX.hitSpark) BVN.FX.hitSpark(x, y, power, color);
  }

  function ring(x, y, color, radius, life) {
    if (BVN.FX && BVN.FX.ring) BVN.FX.ring(x, y, color, radius, life);
  }

  function arc(x, y, radius, from, to, color, width) {
    if (BVN.FX && BVN.FX.slashArc) BVN.FX.slashArc(x, y, radius, from, to, color, width);
  }

  function burst(x, y, count, opt) {
    if (BVN.FX && BVN.FX.burst) BVN.FX.burst(x, y, count, opt);
  }

  function text(x, y, str, color, size, strong) {
    if (BVN.FX && BVN.FX.text) BVN.FX.text(x, y, str, color, size, strong);
  }

  /** 攻击落点：对手胸口（没有对手时退化为自身正前方）。 */
  function targetPoint(G, f) {
    const o = opponent(G, f);
    if (o) return { x: o.x, y: o.y - 92 };
    return { x: f.x + (f.facing < 0 ? -110 : 110), y: f.y - 92 };
  }

  function faceTo(f, x) {
    f.facing = x >= f.x ? 1 : -1;
  }

  /**
   * 姿势局部坐标 → 世界坐标（复刻 Art.drawFighter 的变换链：
   * translate(f.x,f.y) → scale(facing) → 贴地抬升 → rot 绕 (0,-58) 旋转）。
   * 用于让 draw 里的附加图形（巨拳、爪、龙首）与真实骨架严格对齐。
   */
  function localToWorld(f, lx, ly) {
    const pose = f.pose || defaultPose();
    const rot = pose.rot || 0;
    let px = lx;
    let py = ly;
    const skel = BVN.Art && BVN.Art.skeleton;
    if (f.onGround && Math.abs(rot) < 0.02 && skel) {
      const g = skel(pose);
      py -= Math.max(g.footF.y, g.footB.y, -6);
    }
    if (Math.abs(rot) >= 0.02) {
      const ox = px;
      const oy = py + 70;
      const ca = Math.cos(rot);
      const sa = Math.sin(rot);
      px = ox * ca - oy * sa;
      py = ox * sa + oy * ca - 58;
    }
    return {
      x: f.x + px * (f.facing < 0 ? -1 : 1),
      y: f.y + py,
    };
  }

  /** 取某个关节的世界坐标（骨架不可用时退化为角色中心上方）。 */
  function jointWorld(f, key) {
    const skel = BVN.Art && BVN.Art.skeleton;
    if (!skel || !f.pose) return { x: f.x, y: f.y - 92 };
    const g = skel(f.pose);
    const p = g[key];
    if (!p) return { x: f.x, y: f.y - 92 };
    return localToWorld(f, p.x, p.y);
  }

  /** 用 Art.drawFighter 画一具半透明残影（复用真实骨架，读起来才像"分身"）。 */
  function drawGhost(ctx, f, x, y, facing, pose, alpha) {
    if (!BVN.Art || !BVN.Art.drawFighter) return;
    const g = f.__fmGhost || (f.__fmGhost = {});
    g.x = x;
    g.y = y;
    g.facing = facing;
    g.build = f.build;
    g.palette = f.palette;
    g.pose = pose;
    g.alpha = alpha;
    g.glow = 0;
    g.hitFlash = 0;
    g.onGround = false;
    g.state = 'idle';
    BVN.Art.drawFighter(ctx, g, 0);
  }

  /** 多边形填充（世界坐标）。 */
  function poly(ctx, pts, fill, stroke, lw) {
    if (!pts || pts.length < 3) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw == null ? 2 : lw;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
  }

  /** 折线描边（世界坐标）。 */
  function strokePath(ctx, pts, color, lw) {
    if (!pts || pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.strokeStyle = color;
    ctx.lineWidth = lw == null ? 2 : lw;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  /** 竖向光柱（顶部渐隐、底部最亮）。 */
  function beam(ctx, x, top, bottom, halfW, color, alpha) {
    if (alpha <= 0.01 || bottom <= top) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const grd = ctx.createLinearGradient(0, top, 0, bottom);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.55, color);
    grd.addColorStop(1, '#ffffff');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(x - halfW * 0.42, top);
    ctx.lineTo(x + halfW * 0.42, top);
    ctx.lineTo(x + halfW, bottom);
    ctx.lineTo(x - halfW, bottom);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** 通用的"地面冲击环"：扁椭圆，贴地画。 */
  function groundRing(ctx, x, gy, rx, ry, color, alpha, lw) {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = lw == null ? 3 : lw;
    ctx.beginPath();
    ctx.ellipse(x, gy + 2, rx, ry, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  /** 地面裂纹：从 (x, gy) 向外发散的锯齿黑线。 */
  function crack(ctx, x, gy, width, depth, seed, color, alpha) {
    if (depth <= 1 || alpha <= 0.02) return;
    const n = 5;
    ctx.save();
    ctx.globalAlpha = alpha;
    for (let i = 0; i < n; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      const base = h1(seed + i * 3.7);
      const len = depth * (0.5 + base * 0.9);
      const pts = [{ x: x, y: gy }];
      let cx = x;
      let cy = gy;
      for (let k = 1; k <= 3; k++) {
        cx = x + dir * (len * k / 3) * (0.55 + h1(seed + i + k) * 0.7);
        cy = gy - (k % 2 === 0 ? 2 : 7) * (0.6 + h1(seed + i * 2 + k) * 0.9);
        pts.push({ x: cx, y: cy });
      }
      strokePath(ctx, pts, color, width * (1 - i * 0.08));
    }
    ctx.restore();
  }

  /* ============================================================
   * 2. 般若 —— 百鬼夜行 · 终
   *    蓄力低吼 → 蹬地跃起 → 空中旋转两周 → 俯冲下砸 → 鬼手地裂 → 收势
   * ============================================================ */

  const HANNYA_TOTAL = 200;
  const HANNYA_TINT = '#ff3b30';

  /** 旋转轨道：46 帧起转，96 帧正好转满两周（4π），97 帧硬切回 0。 */
  function hannyaRot(n) {
    if (n <= 46) return 0;
    if (n <= 96) return ((n - 46) / 50) * TAU * 2;
    return 0;
  }

  /** 抬升高度（相对地面）。 */
  const hannyaLift = numTrack([
    { f: 0, v: 0 },
    { f: 20, v: 0, e: 'in' },
    { f: 46, v: 330, e: 'out3' },
    { f: 70, v: 302, e: 'io' },
    { f: 96, v: 330, e: 'io' },
    { f: 118, v: 0, e: 'in3' },
    { f: 200, v: 0 },
  ]);

  /** 前冲量（相对起点，沿朝向）。 */
  const hannyaPush = numTrack([
    { f: 0, v: 0 },
    { f: 20, v: 0 },
    { f: 46, v: 40, e: 'out3' },
    { f: 96, v: 130, e: 'lin' },
    { f: 118, v: 250, e: 'in' },
    { f: 200, v: 250 },
  ]);

  const hannyaPose = track([
    // 0-20 蓄力低吼：下蹲、张臂向后、抬头
    {
      f: 0,
      p: {
        c: 18, t: 0.06, h: 0.1,
        afu: -0.75, aff: 0.75, abu: -0.95, abf: 0.6,
        lft: 0.45, lfs: -0.5, lbt: -0.45, lbs: -0.35,
      },
    },
    {
      f: 8,
      p: {
        c: 26, t: -0.18, h: 0.26,
        afu: -1.05, aff: 0.5, abu: -1.25, abf: 0.42,
        lft: 0.55, lfs: -0.66, lbt: -0.55, lbs: -0.5,
      },
      e: 'out',
    },
    {
      f: 20,
      p: {
        c: 32, t: -0.34, h: 0.38,
        afu: -1.32, aff: 0.3, abu: -1.5, abf: 0.26,
        lft: 0.6, lfs: -0.8, lbt: -0.6, lbs: -0.56,
      },
    },
    // 20-46 蹬地跃起、双臂上举
    {
      f: 32,
      p: {
        c: 4, t: 0.12, h: -0.18,
        afu: 2.35, aff: 0.25, abu: -2.4, abf: 0.3,
        lft: 0.75, lfs: -0.55, lbt: -0.55, lbs: -0.8,
      },
      e: 'out3',
    },
    {
      f: 46,
      p: {
        c: 10, t: 0.1, h: -0.12,
        afu: 2.6, aff: 0.15, abu: -2.55, abf: 0.2,
        lft: 0.85, lfs: -1.2, lbt: -0.5, lbs: -1.0,
      },
    },
    // 46-96 空中旋转两周：抱膝、双臂横张成"十字"
    {
      f: 60,
      p: {
        c: 14, t: 0.16, h: 0.05,
        afu: 1.55, aff: 0.05, abu: -1.55, abf: 0.08,
        lft: 1.05, lfs: -1.75, lbt: -0.75, lbs: -1.5,
      },
    },
    {
      f: 96,
      p: {
        c: 14, t: 0.16, h: 0.05,
        afu: 1.55, aff: 0.05, abu: -1.55, abf: 0.08,
        lft: 1.05, lfs: -1.75, lbt: -0.75, lbs: -1.5,
      },
    },
    // 96-118 俯冲：头下脚上，双拳向下贯穿
    {
      f: 106,
      p: {
        c: 4, t: 0.52, h: 0.55,
        afu: 0.15, aff: 0.05, abu: -0.2, abf: 0.1,
        lft: -0.6, lfs: -0.35, lbt: -0.95, lbs: -0.4,
      },
      e: 'out',
    },
    {
      f: 118,
      p: {
        c: 2, t: 0.62, h: 0.62,
        afu: 0.1, aff: 0.02, abu: -0.15, abf: 0.05,
        lft: -0.75, lfs: -0.3, lbt: -1.05, lbs: -0.35,
      },
      e: 'in',
    },
    // 118-140 落地砸地：深蹲、单拳砸向地面
    {
      f: 124,
      p: {
        c: 38, t: 0.78, h: 0.5,
        afu: 0.42, aff: 0.1, abu: -1.0, abf: 0.95,
        lft: 1.15, lfs: -1.75, lbt: -0.9, lbs: -1.4,
      },
      e: 'out3',
    },
    {
      f: 140,
      p: {
        c: 34, t: 0.6, h: 0.35,
        afu: 0.6, aff: 0.2, abu: -1.1, abf: 0.9,
        lft: 1.1, lfs: -1.7, lbt: -0.85, lbs: -1.35,
      },
    },
    // 140-200 起身收势
    {
      f: 168,
      p: {
        c: 16, t: 0.12, h: 0.0,
        afu: -0.3, aff: 1.0, abu: -0.6, abf: 0.8,
        lft: 0.4, lfs: -0.35, lbt: -0.35, lbs: -0.22,
      },
    },
    { f: 200, p: {} },
  ]);

  /** 六只鬼手在地面出现的位置（相对角色 x，按朝向镜像）。 */
  const HANNYA_HANDS = [
    { dx: -300, sc: 1.15, dl: 0 },
    { dx: 300, sc: 1.15, dl: 2 },
    { dx: -170, sc: 0.8, dl: 6 },
    { dx: 190, sc: 0.82, dl: 9 },
    { dx: -430, sc: 0.62, dl: 14 },
    { dx: 440, sc: 0.64, dl: 17 },
  ];

  /** 一只从地里伸出的巨大鬼手（粗黑爪 + 红眼点）。 */
  function drawOniHand(ctx, x, gy, rise, sc, alpha, tint) {
    if (rise <= 0.02 || alpha <= 0.02) return;
    const up = rise * 168 * sc;
    const w = 30 * sc;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, gy);
    // 前臂：下粗上细的柱体
    poly(ctx, [
      { x: -w * 1.15, y: 4 },
      { x: -w * 0.78, y: -up * 0.82 },
      { x: w * 0.72, y: -up * 0.86 },
      { x: w * 1.15, y: 4 },
    ], '#120a0c', '#000000', 3 * sc);
    // 手掌
    const py = -up;
    poly(ctx, [
      { x: -w * 0.95, y: py + 6 },
      { x: -w * 1.05, y: py - 16 * sc },
      { x: -w * 0.3, y: py - 26 * sc },
      { x: w * 0.35, y: py - 24 * sc },
      { x: w * 1.0, y: py - 12 * sc },
      { x: w * 0.92, y: py + 8 },
    ], '#190e11', '#000000', 3 * sc);
    // 五指（张开抓向天空）
    for (let i = 0; i < 5; i++) {
      const bx = (-0.82 + i * 0.42) * w;
      const spread = (i - 2) * 0.34;
      const len = (34 + h1(i * 5.1) * 22) * sc;
      const tipx = bx + Math.sin(spread) * len;
      const tipy = py - 24 * sc - Math.cos(spread) * len;
      poly(ctx, [
        { x: bx - 5 * sc, y: py - 18 * sc },
        { x: tipx - 2.4 * sc, y: tipy },
        { x: tipx + 3.4 * sc, y: tipy + 3 * sc },
        { x: bx + 6 * sc, y: py - 18 * sc },
      ], '#140b0e', '#000000', 2.2 * sc);
    }
    // 掌心红眼
    ctx.fillStyle = tint;
    ctx.beginPath();
    ctx.ellipse(-w * 0.28, py - 6 * sc, 5.2 * sc, 3.2 * sc, -0.2, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(w * 0.3, py - 8 * sc, 4.6 * sc, 2.8 * sc, 0.2, 0, TAU);
    ctx.fill();
    // 手臂内侧的血色高光
    ctx.globalAlpha = alpha * 0.5;
    ctx.strokeStyle = tint;
    ctx.lineWidth = 2.4 * sc;
    ctx.beginPath();
    ctx.moveTo(-w * 0.3, -6);
    ctx.lineTo(-w * 0.22, -up * 0.86);
    ctx.stroke();
    ctx.restore();
  }

  /* ============================================================
   * 3. 天使 —— 炽翼 · 天罚
   *    跪地祈祷 → 展翼升空 → 悬停蓄光 → 垂直俯冲贯穿 → 落地光柱爆发
   * ============================================================ */

  const ANGEL_TOTAL = 194;
  const ANGEL_TINT = '#ffd76e';

  const angelLift = numTrack([
    { f: 0, v: 0 },
    { f: 24, v: 0, e: 'in' },
    { f: 70, v: 262, e: 'out3' },
    { f: 86, v: 276, e: 'io' },
    { f: 100, v: 268, e: 'io' },
    { f: 130, v: 0, e: 'in3' },
    { f: 194, v: 0 },
  ]);

  const angelPush = numTrack([
    { f: 0, v: 0 },
    { f: 24, v: 0 },
    { f: 70, v: 46, e: 'out3' },
    { f: 130, v: 96, e: 'io' },
    { f: 194, v: 96 },
  ]);

  const angelPose = track([
    // 0-24 跪地祈祷
    {
      f: 0,
      p: {
        c: 30, t: 0.4, h: 0.34,
        afu: 0.85, aff: 1.15, abu: 0.8, abf: 1.1,
        lft: 1.15, lfs: -1.9, lbt: -0.3, lbs: -1.55,
      },
    },
    {
      f: 12,
      p: {
        c: 36, t: 0.55, h: 0.44,
        afu: 1.0, aff: 1.3, abu: 0.95, abf: 1.25,
        lft: 1.2, lfs: -1.95, lbt: -0.34, lbs: -1.6,
      },
      e: 'in',
    },
    // 24-70 展翼升空
    {
      f: 30,
      p: {
        c: 12, t: -0.1, h: -0.24,
        afu: 2.2, aff: 0.5, abu: -2.1, abf: 0.6,
        lft: 0.36, lfs: -0.2, lbt: -0.28, lbs: -0.16,
      },
      e: 'out3',
    },
    {
      f: 70,
      p: {
        c: 6, t: 0.0, h: -0.16,
        afu: 2.55, aff: 0.15, abu: -2.5, abf: 0.2,
        lft: 0.36, lfs: -0.52, lbt: -0.3, lbs: -0.42,
      },
    },
    // 70-100 悬停蓄光：双手举顶合掌
    {
      f: 82,
      p: {
        c: 4, t: -0.12, h: -0.22,
        afu: 2.86, aff: 0.1, abu: 2.8, abf: 0.12,
        lft: 0.3, lfs: -0.62, lbt: -0.26, lbs: -0.5,
      },
    },
    {
      f: 100,
      p: {
        c: 2, t: -0.18, h: -0.26,
        afu: 2.95, aff: 0.04, abu: 2.92, abf: 0.05,
        lft: 0.26, lfs: -0.66, lbt: -0.22, lbs: -0.55,
      },
    },
    // 100-130 垂直俯冲贯穿：头下脚上、双臂张开成锥
    {
      f: 112,
      p: {
        c: 4, t: 0.44, h: 0.5,
        afu: 0.2, aff: 0.08, abu: -0.18, abf: 0.1,
        lft: -0.5, lfs: -0.24, lbt: -0.72, lbs: -0.2,
      },
      e: 'out',
    },
    {
      f: 130,
      p: {
        c: 2, t: 0.56, h: 0.58,
        afu: 0.14, aff: 0.04, abu: -0.12, abf: 0.06,
        lft: -0.62, lfs: -0.2, lbt: -0.85, lbs: -0.16,
      },
      e: 'in',
    },
    // 130-194 落地光柱 + 收势
    {
      f: 136,
      p: {
        c: 30, t: 0.42, h: 0.18,
        afu: 1.32, aff: 0.32, abu: -1.22, abf: 0.42,
        lft: 1.1, lfs: -1.68, lbt: -0.5, lbs: -1.0,
      },
      e: 'out3',
    },
    {
      f: 154,
      p: {
        c: 12, t: 0.02, h: -0.12,
        afu: 1.5, aff: 0.3, abu: -1.4, abf: 0.34,
        lft: 0.42, lfs: -0.36, lbt: -0.36, lbs: -0.24,
      },
    },
    {
      f: 174,
      p: {
        c: 9, t: 0.05, h: -0.06,
        afu: 0.8, aff: 0.8, abu: -0.55, abf: 0.65,
        lft: 0.3, lfs: -0.26, lbt: -0.26, lbs: -0.18,
      },
    },
    { f: 194, p: {} },
  ]);

  /** 三道光柱的横向位置（相对角色 x，沿朝向）。 */
  const ANGEL_BEAMS = [-300, 0, 300];

  /* ============================================================
   * 4. 拳击 —— 无限 KO 连打
   *    摆拳起手 → 前冲贴身 → 五记连打 → 末记上勾拳 → 收拳喘息
   * ============================================================ */

  const BOXER_TOTAL = 205;
  const BOXER_TINT = '#f2f2f2';

  /* 五记连打的帧位（每 13 帧一拳） */
  const BOXER_PUNCH = [40, 53, 66, 79, 92];
  /* 末记上勾拳 */
  const BOXER_UPPER = 128;

  /** 前手直拳（右手直拳）姿势。 */
  function boxerJab() {
    return {
      c: 12, t: 0.34, h: 0.06,
      afu: 1.6, aff: 0.02, abu: -0.7, abf: 1.55,
      lft: 0.52, lfs: -0.36, lbt: -0.5, lbs: -0.2,
    };
  }

  /** 后手勾拳（跨身，躯干拧转）姿势。 */
  function boxerHook() {
    return {
      c: 12, t: 0.04, h: 0.02,
      afu: 0.42, aff: 1.52, abu: 1.52, abf: 0.16,
      lft: 0.46, lfs: -0.34, lbt: -0.44, lbs: -0.24,
    };
  }

  /** 收拳预备姿势（side: true = 右手拉回）。 */
  function boxerCock(right) {
    if (right) {
      return {
        c: 18, t: 0.18, h: 0.1,
        afu: -0.2, aff: 1.9, abu: -0.9, abf: 1.6,
        lft: 0.5, lfs: -0.42, lbt: -0.45, lbs: -0.3,
      };
    }
    return {
      c: 18, t: 0.42, h: 0.14,
      afu: 0.55, aff: 1.45, abu: 1.2, abf: 1.5,
      lft: 0.55, lfs: -0.45, lbt: -0.5, lbs: -0.32,
    };
  }

  const boxerKeys = [
    // 0-18 摆拳起手
    {
      f: 0,
      p: {
        c: 16, t: 0.28, h: 0.12,
        afu: -0.5, aff: 1.5, abu: -0.8, abf: 1.35,
        lft: 0.55, lfs: -0.5, lbt: -0.5, lbs: -0.35,
      },
    },
    {
      f: 8,
      p: {
        c: 24, t: 0.36, h: 0.18,
        afu: -0.85, aff: 1.85, abu: -1.05, abf: 1.75,
        lft: 0.62, lfs: -0.62, lbt: -0.56, lbs: -0.46,
      },
      e: 'out',
    },
    {
      f: 18,
      p: {
        c: 20, t: 0.3, h: 0.14,
        afu: -0.9, aff: 1.9, abu: -1.0, abf: 1.8,
        lft: 0.58, lfs: -0.55, lbt: -0.52, lbs: -0.4,
      },
    },
  ];

  /* 五记连打：每拳 = 收拳(前 5 帧) → 出拳(命中帧，极快) → 微回(+6 帧) */
  BOXER_PUNCH.forEach(function (pf, i) {
    const right = i % 2 === 0;
    boxerKeys.push({ f: pf - 5, p: boxerCock(right), e: 'in' });
    boxerKeys.push({ f: pf, p: right ? boxerJab() : boxerHook(), e: 'hard' });
    boxerKeys.push({
      f: pf + 6,
      p: right ? boxerCock(false) : boxerCock(true),
      e: 'out',
    });
  });

  /* 末记上勾拳 */
  boxerKeys.push({
    f: 118,
    p: {
      c: 32, t: 0.5, h: 0.2,
      afu: -0.35, aff: 1.75, abu: -0.95, abf: 1.6,
      lft: 0.95, lfs: -1.12, lbt: -0.86, lbs: -0.98,
    },
    e: 'in',
  });
  boxerKeys.push({
    f: BOXER_UPPER,
    p: {
      c: 2, t: -0.22, h: -0.3,
      afu: 2.95, aff: 0.08, abu: -0.5, abf: 1.4,
      lft: 0.12, lfs: -0.06, lbt: -0.2, lbs: -0.08,
    },
    e: 'hard',
  });
  boxerKeys.push({
    f: 140,
    p: {
      c: 8, t: -0.1, h: -0.16,
      afu: 2.5, aff: 0.3, abu: -0.6, abf: 1.1,
      lft: 0.3, lfs: -0.2, lbt: -0.3, lbs: -0.16,
    },
    e: 'out',
  });
  /* 收拳喘息 */
  boxerKeys.push({
    f: 158,
    p: {
      c: 22, t: 0.42, h: 0.3,
      afu: 0.6, aff: 1.3, abu: 0.34, abf: 1.35,
      lft: 0.52, lfs: -0.46, lbt: -0.46, lbs: -0.32,
    },
  });
  boxerKeys.push({
    f: 180,
    p: {
      c: 18, t: 0.3, h: 0.22,
      afu: 0.5, aff: 1.1, abu: 0.1, abf: 1.1,
      lft: 0.44, lfs: -0.4, lbt: -0.4, lbs: -0.28,
    },
  });
  boxerKeys.push({ f: BOXER_TOTAL, p: {} });

  const boxerPose = track(boxerKeys);

  const boxerLift = numTrack([
    { f: 0, v: 0 },
    { f: 118, v: 0 },
    { f: 130, v: 26, e: 'out3' },
    { f: 146, v: 0, e: 'in3' },
    { f: BOXER_TOTAL, v: 0 },
  ]);

  /* ============================================================
   * 5. 舞女 —— 千夜 · 散花
   *    原地旋舞 → 彩带缠绕收束 → 腾空 → 坠落炸花
   * ============================================================ */

  const DANCER_TOTAL = 198;
  const DANCER_TINT = '#ff9ecb';

  /** 旋舞：0-60 帧转满两周，61 帧硬切回 0（12px 抬升由 move 抵消）。 */
  function dancerRot(n) {
    if (n <= 60) return (n / 60) * TAU * 2;
    return 0;
  }

  const dancerLift = numTrack([
    { f: 0, v: 0 },
    { f: 110, v: 0, e: 'in' },
    { f: 150, v: 208, e: 'out3' },
    { f: 166, v: 0, e: 'in3' },
    { f: DANCER_TOTAL, v: 0 },
  ]);

  const dancerPush = numTrack([
    { f: 0, v: 0 },
    { f: 60, v: 0 },
    { f: 110, v: 26, e: 'io' },
    { f: 150, v: 60, e: 'out3' },
    { f: DANCER_TOTAL, v: 60 },
  ]);

  const dancerPose = track([
    // 0-60 原地旋舞：双臂横展、单腿抬起的旋转姿势
    {
      f: 0,
      p: {
        c: 14, t: -0.1, h: 0.1,
        afu: 1.15, aff: 0.35, abu: -1.15, abf: 0.35,
        lft: 0.6, lfs: -0.5, lbt: -0.5, lbs: -0.4,
      },
    },
    {
      f: 12,
      p: {
        c: 8, t: -0.06, h: 0.06,
        afu: 1.7, aff: 0.1, abu: -1.7, abf: 0.12,
        lft: 0.95, lfs: -1.5, lbt: -0.32, lbs: -0.3,
      },
      e: 'out3',
    },
    {
      f: 44,
      p: {
        c: 8, t: -0.04, h: 0.04,
        afu: 1.8, aff: 0.06, abu: -1.8, abf: 0.08,
        lft: 0.9, lfs: -1.45, lbt: -0.3, lbs: -0.28,
      },
    },
    // 60-110 彩带缠绕：双手向内收拢
    {
      f: 72,
      p: {
        c: 18, t: 0.2, h: 0.16,
        afu: 1.35, aff: 0.95, abu: -1.3, abf: 0.9,
        lft: 0.5, lfs: -0.44, lbt: -0.44, lbs: -0.3,
      },
    },
    {
      f: 96,
      p: {
        c: 26, t: 0.34, h: 0.24,
        afu: 1.05, aff: 1.45, abu: -1.0, abf: 1.4,
        lft: 0.62, lfs: -0.7, lbt: -0.5, lbs: -0.5,
      },
    },
    // 110-150 腾空
    {
      f: 124,
      p: {
        c: 6, t: -0.24, h: -0.3,
        afu: 2.55, aff: 0.2, abu: -2.5, abf: 0.24,
        lft: 0.5, lfs: -1.05, lbt: -0.3, lbs: -0.85,
      },
      e: 'out3',
    },
    {
      f: 150,
      p: {
        c: 4, t: -0.3, h: -0.34,
        afu: 2.7, aff: 0.12, abu: -2.65, abf: 0.16,
        lft: 0.42, lfs: -1.2, lbt: -0.24, lbs: -1.0,
      },
    },
    // 150-166 坠落炸花（双臂下砸）
    {
      f: 160,
      p: {
        c: 8, t: 0.35, h: 0.4,
        afu: 0.3, aff: 0.12, abu: -0.28, abf: 0.14,
        lft: 0.3, lfs: -0.3, lbt: -0.4, lbs: -0.3,
      },
      e: 'in',
    },
    {
      f: 168,
      p: {
        c: 34, t: 0.46, h: 0.3,
        afu: 0.72, aff: 0.24, abu: -0.66, abf: 0.28,
        lft: 1.1, lfs: -1.7, lbt: -0.85, lbs: -1.3,
      },
      e: 'out3',
    },
    {
      f: 182,
      p: {
        c: 16, t: 0.14, h: 0.06,
        afu: 0.75, aff: 0.9, abu: -0.5, abf: 0.7,
        lft: 0.38, lfs: -0.32, lbt: -0.32, lbs: -0.22,
      },
    },
    { f: DANCER_TOTAL, p: {} },
  ]);

  /* 花瓣配色（从角色 palette / tint 派生） */
  const DANCER_PETALS = ['#ff9ecb', '#ffe9a8', '#7ef9ff', '#ffd0e4', '#ff6f9c'];

  /* ============================================================
   * 6. 恶龙 —— 骸龙 · 吞世
   *    伏地蓄力 → 龙化起身 → 冲锋贯穿全屏 → 回身收爪
   * ============================================================ */

  const DRAGON_TOTAL = 212;
  const DRAGON_TINT = '#b6ff5a';

  const dragonLift = numTrack([
    { f: 0, v: 0 },
    { f: 40, v: 0 },
    { f: 58, v: 54, e: 'out3' },
    { f: 90, v: 24, e: 'io' },
    { f: 150, v: 0, e: 'in' },
    { f: DRAGON_TOTAL, v: 0 },
  ]);

  /** 冲锋进度 0~1（90-150 帧横向贯穿）。 */
  function dragonCharge(n) {
    return seg(n, 90, 150);
  }

  const dragonPose = track([
    // 0-40 伏地蓄力：极深下蹲、双臂撑地、抬头咆哮
    {
      f: 0,
      p: {
        c: 20, t: 0.3, h: 0.14,
        afu: 0.3, aff: 0.3, abu: -0.55, abf: 0.4,
        lft: 0.6, lfs: -0.7, lbt: -0.55, lbs: -0.5,
      },
    },
    {
      f: 16,
      p: {
        c: 40, t: 0.62, h: 0.3,
        afu: 0.12, aff: 0.16, abu: -0.9, abf: 0.5,
        lft: 0.95, lfs: -1.45, lbt: -0.8, lbs: -1.3,
      },
      e: 'out',
    },
    {
      f: 30,
      p: {
        c: 44, t: 0.7, h: 0.42,
        afu: 0.1, aff: 0.1, abu: -1.0, abf: 0.42,
        lft: 1.0, lfs: -1.5, lbt: -0.85, lbs: -1.36,
      },
    },
    // 40-90 龙化起身：大幅张臂、挺胸抬头
    {
      f: 56,
      p: {
        c: 10, t: -0.2, h: -0.28,
        afu: 2.3, aff: 0.42, abu: -2.3, abf: 0.48,
        lft: 0.4, lfs: -0.34, lbt: -0.34, lbs: -0.24,
      },
      e: 'out3',
    },
    {
      f: 78,
      p: {
        c: 20, t: 0.42, h: 0.24,
        afu: 1.25, aff: 0.42, abu: -1.2, abf: 0.5,
        lft: 0.85, lfs: -1.1, lbt: -0.7, lbs: -0.9,
      },
    },
    // 90-150 冲锋贯穿：几乎水平前倾、双爪前伸
    {
      f: 94,
      p: {
        c: 14, t: 0.95, h: 0.5,
        afu: 1.5, aff: 0.34, abu: 1.42, abf: 0.4,
        lft: 0.9, lfs: -0.7, lbt: -0.55, lbs: -1.1,
      },
      e: 'out3',
    },
    {
      f: 148,
      p: {
        c: 12, t: 1.0, h: 0.54,
        afu: 1.5, aff: 0.3, abu: 1.42, abf: 0.36,
        lft: 0.95, lfs: -0.62, lbt: -0.5, lbs: -1.16,
      },
    },
    // 150-212 回身收爪
    {
      f: 164,
      p: {
        c: 26, t: 0.5, h: 0.28,
        afu: 0.5, aff: 0.36, abu: -0.9, abf: 0.8,
        lft: 0.75, lfs: -0.95, lbt: -0.6, lbs: -0.7,
      },
      e: 'out',
    },
    {
      f: 184,
      p: {
        c: 14, t: 0.18, h: 0.08,
        afu: 0.6, aff: 0.9, abu: -0.45, abf: 0.7,
        lft: 0.4, lfs: -0.34, lbt: -0.34, lbs: -0.24,
      },
    },
    { f: DRAGON_TOTAL, p: {} },
  ]);

  /* ============================================================
   * 7. 术士 —— 深渊 · 十一芒
   *    浮空 → 双手下压 → 地面裂开无数黑手上抓 → 收势落地
   * ============================================================ */

  const WARLOCK_TOTAL = 190;
  const WARLOCK_TINT = '#9b5cff';

  const warlockLift = numTrack([
    { f: 0, v: 0 },
    { f: 50, v: 182, e: 'out3' },
    { f: 110, v: 168, e: 'io' },
    { f: 170, v: 0, e: 'in3' },
    { f: WARLOCK_TOTAL, v: 0 },
  ]);

  const warlockPush = numTrack([
    { f: 0, v: 0 },
    { f: 50, v: 0 },
    { f: 110, v: 0 },
    { f: 170, v: 34, e: 'io' },
    { f: WARLOCK_TOTAL, v: 34 },
  ]);

  const warlockPose = track([
    // 0-50 浮空起势：双手合于胸前、长袍下垂
    {
      f: 0,
      p: {
        c: 16, t: 0.22, h: 0.12,
        afu: 0.9, aff: 1.2, abu: 0.7, abf: 1.1,
        lft: 0.5, lfs: -0.5, lbt: -0.45, lbs: -0.36,
      },
    },
    {
      f: 26,
      p: {
        c: 6, t: -0.14, h: -0.24,
        afu: 2.4, aff: 0.7, abu: -2.3, abf: 0.75,
        lft: 0.34, lfs: -0.62, lbt: -0.3, lbs: -0.5,
      },
      e: 'out3',
    },
    {
      f: 50,
      p: {
        c: 2, t: -0.24, h: -0.32,
        afu: 2.8, aff: 0.28, abu: 2.72, abf: 0.34,
        lft: 0.3, lfs: -0.72, lbt: -0.26, lbs: -0.6,
      },
    },
    // 50-110 双手下压（施法）：从头顶压到身前
    {
      f: 74,
      p: {
        c: 6, t: 0.1, h: 0.1,
        afu: 1.55, aff: 0.24, abu: 1.45, abf: 0.3,
        lft: 0.34, lfs: -0.66, lbt: -0.3, lbs: -0.55,
      },
    },
    {
      f: 110,
      p: {
        c: 12, t: 0.42, h: 0.36,
        afu: 0.72, aff: 0.24, abu: 0.62, abf: 0.3,
        lft: 0.4, lfs: -0.6, lbt: -0.34, lbs: -0.5,
      },
      e: 'in',
    },
    // 110-170 黑手上抓：双手持续下压、身体后仰
    {
      f: 128,
      p: {
        c: 16, t: 0.3, h: 0.28,
        afu: 0.55, aff: 0.3, abu: 0.48, abf: 0.34,
        lft: 0.44, lfs: -0.58, lbt: -0.38, lbs: -0.48,
      },
    },
    {
      f: 158,
      p: {
        c: 10, t: 0.12, h: 0.2,
        afu: 0.85, aff: 0.4, abu: 0.7, abf: 0.44,
        lft: 0.36, lfs: -0.48, lbt: -0.32, lbs: -0.4,
      },
    },
    // 170-190 落地收势
    {
      f: 176,
      p: {
        c: 24, t: 0.26, h: 0.14,
        afu: 0.9, aff: 0.8, abu: -0.4, abf: 0.8,
        lft: 0.55, lfs: -0.62, lbt: -0.45, lbs: -0.4,
      },
      e: 'out3',
    },
    { f: WARLOCK_TOTAL, p: {} },
  ]);

  /* ============================================================
   * 8. 游侠 —— 苍鹰 · 万箭
   *    后跃拉开 → 空中连射五箭 → 巨箭贯穿 → 落地
   * ============================================================ */

  const RANGER_TOTAL = 186;
  const RANGER_TINT = '#cfe8ff';

  /* 五箭的出手帧 */
  const RANGER_ARROWS = [34, 48, 62, 76, 90];
  /* 巨箭出手帧 */
  const RANGER_GIANT = 112;

  const rangerLift = numTrack([
    { f: 0, v: 0 },
    { f: 10, v: 96, e: 'out3' },
    { f: 26, v: 176, e: 'out' },
    { f: 100, v: 150, e: 'io' },
    { f: 140, v: 26, e: 'in3' },
    { f: 150, v: 0, e: 'in' },
    { f: RANGER_TOTAL, v: 0 },
  ]);

  /** 后跃位移（负向，沿朝向后退）。 */
  const rangerPush = numTrack([
    { f: 0, v: 0 },
    { f: 30, v: -220, e: 'out3' },
    { f: 100, v: -280, e: 'io' },
    { f: 150, v: -300, e: 'io' },
    { f: RANGER_TOTAL, v: -300 },
  ]);

  /** 拉弓姿势（拉满）。 */
  function rangerDraw() {
    return {
      c: 8, t: -0.08, h: 0.06,
      afu: 1.62, aff: 0.06, abu: 1.42, abf: 1.35,
      lft: 0.5, lfs: -0.62, lbt: -0.36, lbs: -0.7,
    };
  }

  /** 放箭姿势（弦松）。 */
  function rangerLoose() {
    return {
      c: 6, t: 0.1, h: 0.02,
      afu: 1.55, aff: 0.12, abu: -0.55, abf: 1.05,
      lft: 0.44, lfs: -0.56, lbt: -0.3, lbs: -0.66,
    };
  }

  const rangerKeys = [
    // 0-30 后跃拉开
    {
      f: 0,
      p: {
        c: 16, t: 0.26, h: 0.12,
        afu: 0.6, aff: 1.1, abu: 0.2, abf: 1.2,
        lft: 0.55, lfs: -0.5, lbt: -0.5, lbs: -0.36,
      },
    },
    {
      f: 12,
      p: {
        c: 4, t: 0.14, h: -0.06,
        afu: 2.2, aff: 0.4, abu: -1.2, abf: 0.7,
        lft: 0.95, lfs: -1.1, lbt: -0.5, lbs: -1.0,
      },
      e: 'out3',
    },
    {
      f: 30,
      p: {
        c: 6, t: -0.14, h: -0.16,
        afu: 1.9, aff: 0.2, abu: -0.9, abf: 1.0,
        lft: 0.6, lfs: -1.0, lbt: -0.4, lbs: -0.9,
      },
    },
  ];

  /* 五连射：每箭 = 拉满(前 6 帧) → 放(命中帧) → 半收(+8 帧) */
  RANGER_ARROWS.forEach(function (af, i) {
    rangerKeys.push({ f: af - 6, p: rangerDraw(), e: 'out' });
    rangerKeys.push({ f: af, p: rangerLoose(), e: 'hard' });
    rangerKeys.push({
      f: af + 8,
      p: i < RANGER_ARROWS.length - 1 ? rangerDraw() : rangerLoose(),
      e: 'io',
    });
  });

  /* 巨箭：更大的拉弓幅度 */
  rangerKeys.push({
    f: RANGER_GIANT - 8,
    p: {
      c: 14, t: -0.2, h: -0.1,
      afu: 1.7, aff: 0.04, abu: 1.5, abf: 1.55,
      lft: 0.66, lfs: -0.8, lbt: -0.48, lbs: -0.86,
    },
    e: 'out',
  });
  rangerKeys.push({
    f: RANGER_GIANT,
    p: {
      c: 4, t: 0.16, h: 0.1,
      afu: 1.58, aff: 0.06, abu: -0.7, abf: 1.0,
      lft: 0.4, lfs: -0.5, lbt: -0.26, lbs: -0.6,
    },
    e: 'hard',
  });
  rangerKeys.push({
    f: 130,
    p: {
      c: 10, t: 0.1, h: 0.04,
      afu: 1.2, aff: 0.3, abu: -0.4, abf: 0.9,
      lft: 0.5, lfs: -0.6, lbt: -0.34, lbs: -0.7,
    },
  });
  /* 140-186 落地收势 */
  rangerKeys.push({
    f: 148,
    p: {
      c: 30, t: 0.4, h: 0.24,
      afu: 0.5, aff: 1.1, abu: -0.2, abf: 1.0,
      lft: 1.05, lfs: -1.5, lbt: -0.72, lbs: -1.2,
    },
    e: 'out3',
  });
  rangerKeys.push({
    f: 162,
    p: {
      c: 16, t: 0.2, h: 0.1,
      afu: 0.6, aff: 1.0, abu: -0.3, abf: 0.9,
      lft: 0.5, lfs: -0.42, lbt: -0.4, lbs: -0.3,
    },
  });
  rangerKeys.push({ f: RANGER_TOTAL, p: {} });

  const rangerPose = track(rangerKeys);

  /* ============================================================
   * 9. 浪人 —— 无明 · 十步杀
   *    居合起手 → 五次瞬移斩 → 末刀定帧 → 收刀
   * ============================================================ */

  const RONIN_TOTAL = 202;
  const RONIN_TINT = '#e8e8f0';

  /* 五次瞬移斩的帧位 */
  const RONIN_SLASH = [30, 50, 70, 90, 110];
  /* 末刀定帧 */
  const RONIN_LAST = 132;

  /** 拔刀斩姿势：前倾、前手横斩到位。 */
  function roninSlash(p) {
    return {
      c: 8 + p * 4, t: 0.42, h: 0.18,
      afu: 1.05 + p * 0.45, aff: 0.12, abu: -0.95, abf: 0.85,
      lft: 0.62, lfs: -0.44, lbt: -0.62, lbs: -0.3,
    };
  }

  /** 收刀起手姿势：手按刀柄、重心下沉。 */
  function roninReady() {
    return {
      c: 20, t: 0.3, h: 0.14,
      afu: 0.72, aff: 1.2, abu: -0.35, abf: 1.0,
      lft: 0.6, lfs: -0.58, lbt: -0.55, lbs: -0.42,
    };
  }

  const roninKeys = [
    // 0-30 居合起手
    {
      f: 0,
      p: {
        c: 14, t: 0.16, h: 0.06,
        afu: 0.55, aff: 1.0, abu: -0.3, abf: 0.8,
        lft: 0.45, lfs: -0.42, lbt: -0.42, lbs: -0.3,
      },
    },
    { f: 10, p: roninReady(), e: 'out' },
    {
      f: 24,
      p: {
        c: 26, t: 0.4, h: 0.2,
        afu: 0.66, aff: 1.3, abu: -0.42, abf: 1.05,
        lft: 0.66, lfs: -0.66, lbt: -0.6, lbs: -0.48,
      },
      e: 'in',
    },
  ];

  /* 五次瞬移斩：消失(前 6 帧) → 现身斩(命中帧) → 定帧(+8) */
  RONIN_SLASH.forEach(function (sf, i) {
    const p = i / (RONIN_SLASH.length - 1);
    roninKeys.push({
      f: sf - 6,
      p: {
        c: 12, t: -0.1, h: -0.06,
        afu: 0.2, aff: 0.9, abu: -0.6, abf: 0.9,
        lft: 0.5, lfs: -0.5, lbt: -0.45, lbs: -0.4,
      },
      e: 'io',
    });
    roninKeys.push({ f: sf, p: roninSlash(p), e: 'snap' });
    roninKeys.push({
      f: sf + 8,
      p: {
        c: 12, t: 0.2, h: 0.1,
        afu: 1.4, aff: 0.2, abu: -0.7, abf: 0.9,
        lft: 0.55, lfs: -0.46, lbt: -0.5, lbs: -0.32,
      },
      e: 'out',
    });
  });

  /* 末刀：更大的横向斩 */
  roninKeys.push({
    f: RONIN_LAST - 8,
    p: {
      c: 18, t: -0.24, h: -0.14,
      afu: -0.7, aff: 0.9, abu: -1.1, abf: 0.8,
      lft: 0.52, lfs: -0.6, lbt: -0.5, lbs: -0.5,
    },
    e: 'in',
  });
  roninKeys.push({
    f: RONIN_LAST,
    p: {
      c: 8, t: 0.58, h: 0.26,
      afu: 1.72, aff: 0.06, abu: -1.0, abf: 0.7,
      lft: 0.72, lfs: -0.38, lbt: -0.72, lbs: -0.26,
    },
    e: 'snap',
  });
  roninKeys.push({
    f: RONIN_LAST + 16,
    p: {
      c: 12, t: 0.34, h: 0.16,
      afu: 1.3, aff: 0.24, abu: -0.7, abf: 0.8,
      lft: 0.6, lfs: -0.44, lbt: -0.56, lbs: -0.3,
    },
  });
  /* 收刀 */
  roninKeys.push({
    f: 178,
    p: {
      c: 16, t: 0.18, h: 0.08,
      afu: 0.66, aff: 1.05, abu: -0.36, abf: 0.86,
      lft: 0.44, lfs: -0.4, lbt: -0.4, lbs: -0.28,
    },
    e: 'io',
  });
  roninKeys.push({ f: RONIN_TOTAL, p: {} });

  const roninPose = track(roninKeys);

  /* ============================================================
   * 10. 注册 8 套动作
   * ============================================================ */

  const MOVES = {};

  /* ---------------- 般若 ---------------- */
  MOVES.hannya = {
    total: HANNYA_TOTAL,
    label: '百鬼夜行 · 终',
    tint: HANNYA_TINT,
    hits: [
      { f: 52, dmg: 50, hitstun: 20, kb: 60, lift: 0, sfx: 'slash', shake: 8 },
      { f: 72, dmg: 45, hitstun: 20, kb: 60, lift: 0, sfx: 'slash', shake: 9 },
      { f: 92, dmg: 45, hitstun: 20, kb: 60, lift: 0, sfx: 'slash', shake: 9 },
      { f: 118, dmg: 90, hitstun: 30, kb: 200, lift: 340, sfx: 'heavy', shake: 20 },
      { f: 136, dmg: 60, hitstun: 26, kb: 260, lift: 420, sfx: 'dark', shake: 16 },
    ],
    move: function (f, t, G) {
      const A = readArgs([f, t, G]);
      if (!A.f) return;
      const n = A.n;
      const s = st(A.f, 'hannya', n);
      if (n <= 0.5) {
        s.x0 = A.f.x;
        s.y0 = A.f.y;
        const o = opponent(A.G, A.f);
        s.dir = o && o.x < A.f.x ? -1 : (o && o.x > A.f.x ? 1 : s.dir);
      }
      const dir = s.dir;
      const rot = hannyaRot(n);
      const liftPx = Math.abs(rot) >= 0.02 ? ROT_LIFT : 0;
      const y = groundY() - hannyaLift(n) - liftPx;
      const x = s.x0 + dir * hannyaPush(n);
      applyPos(A.f, x, y);
      A.f.facing = dir;
      // 全身鬼气：起手到收势一直发光
      A.f.glow = Math.max(A.f.glow || 0, 0.12);
    },
    pose: function (f, t) {
      const A = readArgs([f, t]);
      const p = hannyaPose(A.n);
      p.rot = hannyaRot(A.n);
      return p;
    },
    fx: function (f, t, G) {
      const A = readArgs([f, t, G]);
      if (!A.f) return;
      const n = A.n;
      const ft = A.f;
      // 起手
      if (at(n, 0)) {
        sfx('charge');
        ring(ft.x, groundY() - 4, HANNYA_TINT, 90, 0.4);
      }
      if (at(n, 8)) ring(ft.x, ft.y - 60, HANNYA_TINT, 130, 0.45);
      if (at(n, 20)) {
        sfx('dark');
        shake(A.G, 8, 8);
        burst(ft.x, ft.y - 40, 22, {
          colors: [HANNYA_TINT, '#2a0d10', '#ff8676'],
          speedMin: 60, speedMax: 260, sizeMin: 3, sizeMax: 8,
          lifeMin: 0.3, lifeMax: 0.7, grav: 260, drag: 2.4,
        });
      }
      // 起跳
      if (at(n, 30)) {
        sfx('jump');
        ring(ft.x, groundY() - 4, '#ff8676', 150, 0.42);
        burst(ft.x, groundY() - 4, 18, {
          colors: ['#ffd7cf', HANNYA_TINT, '#3a1114'],
          angle: -Math.PI / 2, spread: 1.1,
          speedMin: 80, speedMax: 300, sizeMin: 3, sizeMax: 9,
          lifeMin: 0.3, lifeMax: 0.6, grav: 700, drag: 2.2,
        });
      }
      // 空中旋转：每半圈一道刀光
      if (n > 46 && n < 96 && Math.floor((n - 46) / 12.5) !== Math.floor((n - 1 - 46) / 12.5)) {
        arc(ft.x, ft.y - 70, 92, -0.6, 2.2, '#ff6b4a', 10);
      }
      // 俯冲
      if (at(n, 100)) sfx('dash');
      if (n > 96 && n < 118) {
        burst(ft.x - ft.facing * 30, ft.y - 60, 3, {
          colors: ['#ff6b4a', '#ffd7cf'],
          speedMin: 40, speedMax: 150, sizeMin: 2, sizeMax: 6,
          lifeMin: 0.2, lifeMax: 0.45, grav: 90, drag: 2.6,
        });
      }
      // 落地砸地
      if (at(n, 118)) {
        sfx('land');
        shake(A.G, 24, 22);
        ring(ft.x, groundY() - 6, '#ffd7cf', 220, 0.5);
        ring(ft.x, groundY() - 6, HANNYA_TINT, 300, 0.62);
        burst(ft.x, groundY() - 8, 42, {
          colors: ['#c9b7a6', '#8a7a6c', '#ff6b4a', '#3a1114'],
          angle: -Math.PI / 2, spread: 1.4,
          speedMin: 120, speedMax: 520, sizeMin: 3, sizeMax: 11,
          lifeMin: 0.4, lifeMax: 0.95, grav: 900, drag: 1.9,
        });
        burst(ft.x, groundY() - 4, 26, {
          colors: ['#e8dfd2', '#b9a996'],
          speedMin: 30, speedMax: 130, sizeMin: 4, sizeMax: 12,
          lifeMin: 0.5, lifeMax: 1.1, grav: 120, drag: 2.8,
        });
        spark(ft.x, groundY() - 30, 2.4, '#fff0e6');
      }
      // 鬼手地裂
      if (at(n, 124)) {
        shake(A.G, 16, 18);
        for (let i = 0; i < HANNYA_HANDS.length; i++) {
          const hx = ft.x + HANNYA_HANDS[i].dx * ft.facing;
          burst(hx, groundY() - 6, 10, {
            colors: ['#2a0d10', '#ff6b4a', '#120a0c'],
            angle: -Math.PI / 2, spread: 0.9,
            speedMin: 90, speedMax: 300, sizeMin: 3, sizeMax: 9,
            lifeMin: 0.35, lifeMax: 0.8, grav: 800, drag: 2,
          });
        }
      }
      if (at(n, 136)) {
        sfx('dark');
        shake(A.G, 18, 16);
        ring(ft.x, groundY() - 4, HANNYA_TINT, 340, 0.55);
        burst(ft.x, groundY() - 10, 30, {
          colors: [HANNYA_TINT, '#ffb4a4', '#120a0c'],
          angle: -Math.PI / 2, spread: 1.2,
          speedMin: 140, speedMax: 460, sizeMin: 3, sizeMax: 10,
          lifeMin: 0.4, lifeMax: 0.9, grav: 640, drag: 1.8,
        });
      }
      // 收势余烬
      if (n > 140 && n % 6 === 0) {
        burst(ft.x + (h1(n) - 0.5) * 120, groundY() - 6, 2, {
          colors: ['#ff6b4a', '#7a1d16'],
          speedMin: 20, speedMax: 90, sizeMin: 2, sizeMax: 5,
          lifeMin: 0.4, lifeMax: 0.9, grav: -40, drag: 1.2,
        });
      }
    },
    draw: function (ctx, f, t, G) {
      const A = readArgs([ctx, f, t, G]);
      if (!A.ctx || !A.f) return;
      const n = A.n;
      const c = A.ctx;
      const ft = A.f;
      if (n < 118) return;
      // 地裂黑纹
      const crackT = seg(n, 118, 132);
      crack(c, ft.x, groundY() + 2, 7, 300 * crackT, 3, 'rgba(8,4,6,0.85)', 0.9);
      crack(c, ft.x, groundY() + 2, 5, 210 * crackT, 17, 'rgba(8,4,6,0.7)', 0.8);
      // 六只鬼手
      const tint = HANNYA_TINT;
      for (let i = 0; i < HANNYA_HANDS.length; i++) {
        const h = HANNYA_HANDS[i];
        const t0 = 120 + h.dl;
        const k = seg(n, t0, t0 + 16);
        if (k <= 0) continue;
        const rise = EASE.out3(k);
        const fade = 1 - seg(n, 168, 200) * 0.85;
        const hx = ft.x + h.dx * ft.facing;
        drawOniHand(c, hx, groundY() + 4, rise, h.sc, fade * 0.95, tint);
      }
      // 落地冲击的红色地面光斑
      if (n >= 118 && n <= 168) {
        const k = 1 - seg(n, 118, 168);
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = k * 0.35;
        c.fillStyle = tint;
        c.beginPath();
        c.ellipse(ft.x, groundY() + 2, 320 * (1.3 - k * 0.3), 46, 0, 0, TAU);
        c.fill();
        c.restore();
      }
    },
  };

  /* ---------------- 天使 ---------------- */
  MOVES.angel = {
    total: ANGEL_TOTAL,
    label: '炽翼 · 天罚',
    tint: ANGEL_TINT,
    hits: [
      { f: 58, dmg: 45, hitstun: 20, kb: 40, lift: 0, sfx: 'holy', shake: 8 },
      { f: 88, dmg: 42, hitstun: 20, kb: 40, lift: 0, sfx: 'holy', shake: 9 },
      { f: 108, dmg: 68, hitstun: 26, kb: 120, lift: 60, sfx: 'slash', shake: 14 },
      { f: 136, dmg: 82, hitstun: 32, kb: 240, lift: 460, sfx: 'heavy', shake: 22 },
      { f: 152, dmg: 45, hitstun: 22, kb: 120, lift: 180, sfx: 'holy', shake: 12 },
    ],
    move: function (f, t, G) {
      const A = readArgs([f, t, G]);
      if (!A.f) return;
      const n = A.n;
      const s = st(A.f, 'angel', n);
      if (n <= 0.5) {
        s.x0 = A.f.x;
        s.dir = A.f.facing < 0 ? -1 : 1;
      }
      const y = groundY() - angelLift(n);
      const x = s.x0 + s.dir * angelPush(n);
      applyPos(A.f, x, y);
      A.f.facing = s.dir;
      A.f.glow = Math.max(A.f.glow || 0, 0.12);
    },
    pose: function (f, t) {
      const A = readArgs([f, t]);
      const p = angelPose(A.n);
      p.rot = 0;
      return p;
    },
    fx: function (f, t, G) {
      const A = readArgs([f, t, G]);
      if (!A.f) return;
      const n = A.n;
      const ft = A.f;
      if (at(n, 0)) {
        sfx('charge');
        ring(ft.x, groundY() - 4, ANGEL_TINT, 100, 0.45);
      }
      if (at(n, 12)) {
        burst(ft.x, ft.y - 40, 16, {
          colors: [ANGEL_TINT, '#ffffff'],
          kind: 'feather',
          speedMin: 30, speedMax: 120, sizeMin: 4, sizeMax: 9,
          lifeMin: 0.6, lifeMax: 1.2, grav: -20, drag: 1.1,
        });
      }
      // 升空
      if (at(n, 24)) {
        sfx('holy');
        ring(ft.x, groundY() - 4, '#ffffff', 200, 0.5);
        ring(ft.x, groundY() - 4, ANGEL_TINT, 260, 0.62);
        burst(ft.x, groundY() - 6, 24, {
          colors: [ANGEL_TINT, '#ffffff', '#ffe9b0'],
          angle: -Math.PI / 2, spread: 1.2,
          speedMin: 60, speedMax: 260, sizeMin: 3, sizeMax: 8,
          lifeMin: 0.4, lifeMax: 0.9, grav: 260, drag: 2,
        });
      }
      // 上升途中脚下光环
      if (n > 24 && n < 70 && n % 4 === 0) {
        ring(ft.x, ft.y + 6, '#ffffff', 60 + (n % 12) * 4, 0.3);
      }
      // 悬停蓄光
      if (at(n, 70)) {
        sfx('summon');
        ring(ft.x, ft.y - 70, ANGEL_TINT, 240, 0.7);
      }
      if (n > 70 && n < 100 && n % 5 === 0) {
        burst(ft.x + (h1(n) - 0.5) * 160, ft.y - 40 - h1(n * 3) * 90, 3, {
          colors: [ANGEL_TINT, '#ffffff'],
          speedMin: 10, speedMax: 70, sizeMin: 2, sizeMax: 6,
          lifeMin: 0.3, lifeMax: 0.8, grav: -60, drag: 1.4,
        });
      }
      // 俯冲
      if (at(n, 102)) sfx('dash');
      if (n >= 100 && n <= 130 && n % 2 === 0) {
        burst(ft.x, ft.y - 60, 4, {
          colors: ['#ffffff', ANGEL_TINT],
          kind: 'streak',
          speedMin: 60, speedMax: 220, sizeMin: 3, sizeMax: 7,
          lifeMin: 0.15, lifeMax: 0.35, grav: 0, drag: 2.4,
        });
      }
      // 落地光柱爆发
      if (at(n, 130)) {
        sfx('land');
        shake(A.G, 22, 24);
        ring(ft.x, groundY() - 4, '#ffffff', 260, 0.5);
        ring(ft.x, groundY() - 4, ANGEL_TINT, 360, 0.7);
        shake(A.G, 20, 18);
        for (let i = 0; i < ANGEL_BEAMS.length; i++) {
          const bx = ft.x + ANGEL_BEAMS[i] * ft.facing;
          burst(bx, groundY() - 6, 14, {
            colors: ['#ffffff', ANGEL_TINT, '#fff6d8'],
            angle: -Math.PI / 2, spread: 0.5,
            speedMin: 120, speedMax: 420, sizeMin: 3, sizeMax: 8,
            lifeMin: 0.4, lifeMax: 0.9, grav: 200, drag: 2,
          });
        }
        burst(ft.x, ft.y - 80, 30, {
          colors: ['#ffffff', ANGEL_TINT],
          kind: 'feather',
          speedMin: 60, speedMax: 260, sizeMin: 5, sizeMax: 11,
          lifeMin: 0.8, lifeMax: 1.6, grav: 40, drag: 1.2,
        });
        spark(ft.x, groundY() - 50, 2.6, '#fffdf0');
      }
      // 光羽雨
      if (n > 130 && n < 186 && n % 3 === 0) {
        burst(ft.x + (h1(n) - 0.5) * 700, ft.y - 420 - h1(n * 7) * 120, 3, {
          colors: ['#ffffff', ANGEL_TINT, '#fff6d8'],
          kind: 'feather',
          speedMin: 20, speedMax: 90, sizeMin: 4, sizeMax: 9,
          lifeMin: 0.9, lifeMax: 1.5, grav: 90, drag: 0.8,
        });
      }
    },
    draw: function (ctx, f, t, G) {
      const A = readArgs([ctx, f, t, G]);
      if (!A.ctx || !A.f) return;
      const n = A.n;
      const c = A.ctx;
      const ft = A.f;
      const gy = groundY();

      // 六只光翼（升空到俯冲之间）
      if (inRange(n, 26, 128)) {
        const k = seg(n, 26, 46) * (1 - seg(n, 118, 128));
        const cx = ft.x;
        const cy = ft.y - 86;
        c.save();
        c.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 6; i++) {
          const side = i < 3 ? -1 : 1;
          const idx = i % 3;
          const ang = -0.35 - idx * 0.42 + Math.sin(n * 0.12 + i) * 0.06;
          const len = (96 + idx * 30) * k;
          const a1 = side < 0 ? Math.PI + ang : ang;
          const grd = c.createLinearGradient(cx, cy, cx + Math.cos(a1) * len, cy + Math.sin(a1) * len);
          grd.addColorStop(0, 'rgba(255,255,255,0.55)');
          grd.addColorStop(1, 'rgba(255,215,110,0)');
          c.globalAlpha = 0.55 * k;
          c.fillStyle = grd;
          c.beginPath();
          c.moveTo(cx, cy);
          c.quadraticCurveTo(
            cx + Math.cos(a1) * len * 0.55,
            cy + Math.sin(a1) * len * 0.55 - 26,
            cx + Math.cos(a1) * len * (side < 0 ? 1 : 0.92),
            cy + Math.sin(a1) * len
          );
          c.quadraticCurveTo(
            cx + Math.cos(a1 + 0.22) * len * 0.5,
            cy + Math.sin(a1 + 0.22) * len * 0.5 + 16,
            cx,
            cy
          );
          c.fill();
        }
        c.restore();
      }

      // 悬停蓄光：头顶聚光球
      if (inRange(n, 64, 108)) {
        const k = seg(n, 64, 92) * (1 - seg(n, 100, 108));
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = 0.75 * k;
        c.fillStyle = '#fffdf0';
        c.beginPath();
        c.arc(ft.x, ft.y - 210, 14 + 12 * k + Math.sin(n * 0.5) * 3, 0, TAU);
        c.fill();
        c.globalAlpha = 0.3 * k;
        c.beginPath();
        c.arc(ft.x, ft.y - 210, 46 + 22 * k, 0, TAU);
        c.fill();
        c.restore();
      }

      // 三道天顶光柱（落地后）
      if (n >= 128) {
        const k = seg(n, 128, 140) * (1 - seg(n, 176, 192) * 0.9);
        for (let i = 0; i < ANGEL_BEAMS.length; i++) {
          const bx = ft.x + ANGEL_BEAMS[i] * ft.facing;
          const wob = Math.sin(n * 0.22 + i) * 6;
          beam(c, bx + wob, gy - 860, gy + 2, 46, 'rgba(255,232,160,0.85)', 0.55 * k);
          groundRing(c, bx, gy, 70, 16, '#fff6d8', 0.7 * k, 3);
        }
      }

      // 落地后的地面圣光
      if (inRange(n, 130, 180)) {
        const k = 1 - seg(n, 130, 180);
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = 0.3 * k;
        c.fillStyle = ANGEL_TINT;
        c.beginPath();
        c.ellipse(ft.x, gy + 2, 260, 40, 0, 0, TAU);
        c.fill();
        c.restore();
      }
    },
  };

  /* ---------------- 拳击 ---------------- */
  MOVES.boxer = {
    total: BOXER_TOTAL,
    label: '无限 KO 连打',
    tint: BOXER_TINT,
    hits: [
      { f: 40, dmg: 28, hitstun: 12, kb: 0, lift: 0, sfx: 'light', shake: 6 },
      { f: 53, dmg: 28, hitstun: 12, kb: 10, lift: 0, sfx: 'light', shake: 6 },
      { f: 66, dmg: 28, hitstun: 12, kb: 10, lift: 0, sfx: 'light', shake: 7 },
      { f: 79, dmg: 28, hitstun: 12, kb: 20, lift: 0, sfx: 'light', shake: 7 },
      { f: 92, dmg: 28, hitstun: 14, kb: 30, lift: 20, sfx: 'light', shake: 8 },
      { f: BOXER_UPPER, dmg: 120, hitstun: 34, kb: 320, lift: 620, sfx: 'heavy', shake: 26 },
    ],
    move: function (f, t, G) {
      const A = readArgs([f, t, G]);
      if (!A.f) return;
      const n = A.n;
      const ft = A.f;
      const s = st(ft, 'boxer', n);
      const o = opponent(A.G, ft);
      if (n <= 0.5) {
        s.x0 = ft.x;
        s.dir = ft.facing < 0 ? -1 : 1;
      }
      // 目标：贴在对手身前 86px（对手被击退也跟着压上，才有"连打"的黏性）
      const ox = o ? o.x : s.x0 + s.dir * 320;
      let dir = s.dir;
      if (n >= 18) {
        dir = ox >= ft.x ? 1 : -1;
        s.dir = dir;
      }
      const near = ox - dir * 86;
      let x;
      if (n < 18) x = s.x0;
      else if (n < 40) x = lerp(s.x0, near, EASE.out3(seg(n, 18, 40)));
      else x = near;
      applyPos(ft, x, groundY() - boxerLift(n));
      ft.facing = dir;
      ft.glow = Math.max(ft.glow || 0, 0.1);
      // 记录每一拳的落点，供 draw 画巨拳残影
      for (let i = 0; i < BOXER_PUNCH.length; i++) {
        if (at(n, BOXER_PUNCH[i])) {
          s.marks.push({ f: n, x: ft.x + dir * 78, y: groundY() - 108, kind: 'jab' });
        }
      }
      if (at(n, BOXER_UPPER)) {
        s.marks.push({ f: n, x: ft.x + dir * 74, y: groundY() - 150, kind: 'upper' });
      }
      if (s.marks.length > 10) s.marks.splice(0, s.marks.length - 10);
    },
    pose: function (f, t) {
      const A = readArgs([f, t]);
      const n = A.n;
      const p = boxerPose(n);
      p.rot = 0;
      // 收拳喘息：呼吸起伏
      if (n > 155) {
        const br = Math.sin((n - 155) * 0.26);
        p.c += br * 2.4;
        p.h += br * 0.05;
        p.t += br * 0.02;
      }
      return p;
    },
    fx: function (f, t, G) {
      const A = readArgs([f, t, G]);
      if (!A.f) return;
      const n = A.n;
      const ft = A.f;
      const tp = targetPoint(A.G, ft);
      if (at(n, 0)) {
        sfx('charge');
        ring(ft.x, groundY() - 4, '#ff8a3d', 80, 0.4);
      }
      if (at(n, 14)) {
        ring(ft.x, groundY() - 70, '#ff8a3d', 120, 0.35);
      }
      if (at(n, 18)) sfx('dash');
      // 每一拳：火花 + 冲击环（震屏与伤害数字由状态机按 hits 派发）
      for (let i = 0; i < BOXER_PUNCH.length; i++) {
        if (at(n, BOXER_PUNCH[i])) {
          spark(tp.x, tp.y, 1.3, '#ffffff');
          ring(tp.x, tp.y, i % 2 ? '#ffd7a8' : '#ffffff', 62, 0.22);
          burst(tp.x, tp.y, 6, {
            colors: ['#ffffff', '#ffd7a8'],
            speedMin: 120, speedMax: 340, sizeMin: 2, sizeMax: 5,
            lifeMin: 0.15, lifeMax: 0.35, grav: 240, drag: 2.6,
          });
        }
      }
      // 末记上勾
      if (at(n, BOXER_UPPER)) {
        spark(tp.x, tp.y + 20, 2.6, '#ffffff');
        ring(tp.x, tp.y + 10, '#ffffff', 180, 0.4);
        ring(tp.x, tp.y + 10, '#ff8a3d', 260, 0.55);
        shake(A.G, 22, 24);
        burst(tp.x, tp.y + 16, 26, {
          colors: ['#ffffff', '#ffd7a8', '#ff8a3d'],
          angle: -Math.PI / 2, spread: 0.9,
          speedMin: 160, speedMax: 520, sizeMin: 3, sizeMax: 9,
          lifeMin: 0.3, lifeMax: 0.75, grav: 620, drag: 2,
        });
      }
      if (at(n, 150)) sfx('land');
      if (n > 150 && n % 8 === 0) {
        burst(ft.x + (h1(n) - 0.5) * 60, ft.y - 150, 2, {
          colors: ['#ffffff', '#ffd7a8'],
          speedMin: 10, speedMax: 50, sizeMin: 2, sizeMax: 4,
          lifeMin: 0.3, lifeMax: 0.7, grav: -30, drag: 1.4,
        });
      }
    },
    draw: function (ctx, f, t, G) {
      const A = readArgs([ctx, f, t, G]);
      if (!A.ctx || !A.f) return;
      const n = A.n;
      const c = A.ctx;
      const ft = A.f;
      const s = ft.__fm;
      if (!s || s.tag !== 'boxer') return;
      // 每个拳印存活 22 帧，越旧越淡越大
      for (let i = 0; i < s.marks.length; i++) {
        const m = s.marks[i];
        const age = n - m.f;
        if (age < 0 || age > 22) continue;
        const k = 1 - age / 22;
        const sc = (m.kind === 'upper' ? 2.5 : 1.9) * (1.15 - k * 0.15);
        c.save();
        c.globalAlpha = 0.42 * k;
        c.translate(m.x, m.y);
        c.rotate(m.kind === 'upper' ? -0.5 : 0);
        c.scale(ft.facing * sc, sc);
        // 拳套剪影：掌背 + 四指节
        c.fillStyle = m.kind === 'upper' ? '#ffffff' : '#e9eef6';
        c.beginPath();
        c.ellipse(0, 0, 20, 16, 0, 0, TAU);
        c.fill();
        c.beginPath();
        c.ellipse(16, -6, 12, 13, 0, 0, TAU);
        c.fill();
        c.fillStyle = 'rgba(120,130,150,0.55)';
        for (let j = 0; j < 3; j++) {
          c.beginPath();
          c.ellipse(22, -10 + j * 8, 5, 3.4, 0, 0, TAU);
          c.fill();
        }
        // 速度线
        c.globalAlpha = 0.3 * k;
        c.strokeStyle = '#ffffff';
        c.lineWidth = 3;
        for (let j = 0; j < 3; j++) {
          const yy = -12 + j * 12;
          c.beginPath();
          c.moveTo(-34, yy);
          c.lineTo(-12, yy);
          c.stroke();
        }
        c.restore();
      }
    },
  };

  /* ---------------- 舞女 ---------------- */
  MOVES.dancer = {
    total: DANCER_TOTAL,
    label: '千夜 · 散花',
    tint: DANCER_TINT,
    hits: [
      { f: 34, dmg: 40, hitstun: 16, kb: 30, lift: 0, sfx: 'slash', shake: 7 },
      { f: 52, dmg: 40, hitstun: 16, kb: 30, lift: 0, sfx: 'slash', shake: 7 },
      { f: 82, dmg: 46, hitstun: 20, kb: 60, lift: 40, sfx: 'slash', shake: 10 },
      { f: 100, dmg: 46, hitstun: 20, kb: 60, lift: 40, sfx: 'slash', shake: 10 },
      { f: 150, dmg: 60, hitstun: 22, kb: 80, lift: 60, sfx: 'holy', shake: 12 },
      { f: 166, dmg: 78, hitstun: 30, kb: 260, lift: 440, sfx: 'heavy', shake: 22 },
    ],
    move: function (f, t, G) {
      const A = readArgs([f, t, G]);
      if (!A.f) return;
      const n = A.n;
      const ft = A.f;
      const s = st(ft, 'dancer', n);
      if (n <= 0.5) {
        s.x0 = ft.x;
        s.dir = ft.facing < 0 ? -1 : 1;
      }
      const rot = dancerRot(n);
      const liftPx = Math.abs(rot) >= 0.02 ? ROT_LIFT : 0;
      const y = groundY() - dancerLift(n) - liftPx;
      const x = s.x0 + s.dir * dancerPush(n);
      applyPos(ft, x, y);
      ft.facing = s.dir;
      ft.glow = Math.max(ft.glow || 0, 0.12);
    },
    pose: function (f, t) {
      const A = readArgs([f, t]);
      const n = A.n;
      const p = dancerPose(n);
      p.rot = dancerRot(n);
      // 旋舞期间手臂随相位轻摆
      if (n < 60) {
        const w = Math.sin(n * 0.42) * 0.18;
        p.afu += w;
        p.abu -= w;
      }
      return p;
    },
    fx: function (f, t, G) {
      const A = readArgs([f, t, G]);
      if (!A.f) return;
      const n = A.n;
      const ft = A.f;
      if (at(n, 0)) {
        sfx('charge');
        ring(ft.x, groundY() - 4, DANCER_TINT, 90, 0.45);
      }
      // 旋舞：脚下彩色花瓣
      if (n > 10 && n < 60 && n % 3 === 0) {
        const a = n * 0.62;
        burst(ft.x + Math.cos(a) * 62, groundY() - 10 + Math.sin(a) * 12, 2, {
          colors: DANCER_PETALS,
          kind: 'feather',
          speedMin: 20, speedMax: 110, sizeMin: 3, sizeMax: 7,
          lifeMin: 0.5, lifeMax: 1.0, grav: 60, drag: 1.6,
        });
      }
      if (at(n, 24)) sfx('slash');
      // 彩带收束
      if (at(n, 68)) {
        sfx('summon');
        ring(ft.x, ft.y - 90, DANCER_TINT, 180, 0.6);
      }
      if (n >= 70 && n <= 110 && n % 4 === 0) {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU + n * 0.1;
          burst(ft.x + Math.cos(a) * 150, ft.y - 90 + Math.sin(a) * 110, 1, {
            colors: DANCER_PETALS,
            kind: 'feather',
            speedMin: 10, speedMax: 60, sizeMin: 3, sizeMax: 6,
            lifeMin: 0.4, lifeMax: 0.9, grav: 20, drag: 1.8,
          });
        }
      }
      // 腾空
      if (at(n, 110)) {
        sfx('jump');
        ring(ft.x, groundY() - 4, DANCER_TINT, 200, 0.5);
        burst(ft.x, groundY() - 6, 22, {
          colors: DANCER_PETALS,
          kind: 'feather',
          angle: -Math.PI / 2, spread: 1.3,
          speedMin: 80, speedMax: 320, sizeMin: 4, sizeMax: 10,
          lifeMin: 0.5, lifeMax: 1.1, grav: 120, drag: 1.6,
        });
      }
      // 坠落炸花
      if (at(n, 166)) {
        sfx('land');
        shake(A.G, 24, 22);
        ring(ft.x, groundY() - 4, '#ffd0e4', 240, 0.55);
        ring(ft.x, groundY() - 4, DANCER_TINT, 330, 0.7);
        burst(ft.x, groundY() - 10, 60, {
          colors: DANCER_PETALS,
          kind: 'feather',
          angle: -Math.PI / 2, spread: 1.5,
          speedMin: 120, speedMax: 520, sizeMin: 4, sizeMax: 12,
          lifeMin: 0.7, lifeMax: 1.6, grav: 180, drag: 1.3,
        });
        spark(ft.x, groundY() - 40, 2.4, '#ffe4f2');
      }
      if (n > 166 && n < 196 && n % 3 === 0) {
        burst(ft.x + (h1(n) - 0.5) * 400, groundY() - 260 - h1(n * 5) * 120, 2, {
          colors: DANCER_PETALS,
          kind: 'feather',
          speedMin: 10, speedMax: 70, sizeMin: 3, sizeMax: 8,
          lifeMin: 1.0, lifeMax: 1.8, grav: 70, drag: 0.7,
        });
      }
    },
    draw: function (ctx, f, t, G) {
      const A = readArgs([ctx, f, t, G]);
      if (!A.ctx || !A.f) return;
      const n = A.n;
      const c = A.ctx;
      const ft = A.f;
      const gy = groundY();
      // 八条螺旋彩带：缠绕阶段从四周收束到身体
      if (inRange(n, 62, 168)) {
        const converge = EASE.out3(seg(n, 66, 108));
        const burstOut = seg(n, 150, 168);
        const fade = 1 - seg(n, 160, 176);
        const cx = ft.x;
        const cy = ft.y - 86;
        c.save();
        c.globalAlpha = 0.72 * fade;
        c.lineCap = 'round';
        for (let i = 0; i < 8; i++) {
          const baseA = (i / 8) * TAU;
          const rOut = lerp(360, 26, converge) + burstOut * 220;
          const pts = [];
          for (let k = 0; k <= 6; k++) {
            const u = k / 6;
            const a = baseA + u * 5.2 + n * 0.05;
            const rr = lerp(rOut, 14, u * converge);
            pts.push({
              x: cx + Math.cos(a) * rr,
              y: cy + Math.sin(a) * rr * 0.72 + (1 - converge) * 60 * u,
            });
          }
          strokePath(c, pts, DANCER_PETALS[i % DANCER_PETALS.length], 5);
          strokePath(c, pts, 'rgba(255,255,255,0.5)', 1.6);
        }
        c.restore();
      }
      // 旋舞时的贴地粉色光环
      if (inRange(n, 4, 64)) {
        const k = 1 - seg(n, 50, 64);
        groundRing(c, ft.x, gy, 90 + Math.sin(n * 0.3) * 14, 20, DANCER_TINT, 0.55 * k, 3);
      }
      // 落点粉色冲击环（画两层错开，形成花心）
      if (inRange(n, 164, 198)) {
        const k = 1 - seg(n, 166, 198);
        groundRing(c, ft.x, gy, 120 + (1 - k) * 130, 26 + (1 - k) * 20, '#ffd0e4', 0.75 * k, 4);
        groundRing(c, ft.x, gy, 60 + (1 - k) * 90, 14 + (1 - k) * 14, DANCER_TINT, 0.5 * k, 3);
      }
    },
  };

  /* ---------------- 恶龙 ---------------- */
  MOVES.dragon = {
    total: DRAGON_TOTAL,
    label: '骸龙 · 吞世',
    tint: DRAGON_TINT,
    hits: [
      { f: 56, dmg: 40, hitstun: 18, kb: 40, lift: 0, sfx: 'dark', shake: 10 },
      { f: 88, dmg: 45, hitstun: 18, kb: 60, lift: 0, sfx: 'heavy', shake: 12 },
      { f: 104, dmg: 55, hitstun: 22, kb: 120, lift: 80, sfx: 'slash', shake: 14 },
      { f: 122, dmg: 55, hitstun: 22, kb: 120, lift: 80, sfx: 'slash', shake: 14 },
      { f: 140, dmg: 65, hitstun: 26, kb: 260, lift: 240, sfx: 'heavy', shake: 18 },
      { f: 168, dmg: 40, hitstun: 24, kb: 200, lift: 380, sfx: 'dark', shake: 16 },
    ],
    move: function (f, t, G) {
      const A = readArgs([f, t, G]);
      if (!A.f) return;
      const n = A.n;
      const ft = A.f;
      const s = st(ft, 'dragon', n);
      if (n <= 0.5) {
        s.x0 = ft.x;
        const o = opponent(A.G, ft);
        s.dir = o && Math.abs(o.x - ft.x) > 4 ? (o.x > ft.x ? 1 : -1) : (ft.facing < 0 ? -1 : 1);
        s.chargeFrom = null;
      }
      const dir = s.dir;
      let x = s.x0;
      if (n >= 90) {
        // 冲锋：从起点直线穿过对手，直到撞上舞台另一侧
        if (s.chargeFrom == null) s.chargeFrom = ft.x;
        const dist = (cfg().STAGE_W - EDGE * 2);
        x = s.chargeFrom + dir * dist * (EASE.in(dragonCharge(n)) * 0.94 + dragonCharge(n) * 0.06);
      }
      applyPos(ft, x, groundY() - dragonLift(n));
      ft.facing = n >= 150 ? (opponent(A.G, ft) && opponent(A.G, ft).x < ft.x ? -1 : 1) : dir;
      ft.glow = Math.max(ft.glow || 0, 0.14);
    },
    pose: function (f, t) {
      const A = readArgs([f, t]);
      const p = dragonPose(A.n);
      p.rot = 0;
      // 冲锋时轻微上下颠簸
      const n = A.n;
      if (n > 90 && n < 150) {
        p.c += Math.sin(n * 0.7) * 3;
        p.t += Math.sin(n * 0.5) * 0.05;
      }
      return p;
    },
    fx: function (f, t, G) {
      const A = readArgs([f, t, G]);
      if (!A.f) return;
      const n = A.n;
      const ft = A.f;
      if (at(n, 0)) {
        sfx('charge');
        ring(ft.x, groundY() - 4, DRAGON_TINT, 100, 0.45);
      }
      // 咆哮
      if (at(n, 16)) {
        sfx('dark');
        shake(A.G, 10, 14);
        ring(ft.x, ft.y - 60, DRAGON_TINT, 190, 0.55);
        burst(ft.x + ft.facing * 40, ft.y - 90, 22, {
          colors: [DRAGON_TINT, '#4b8f61', '#d8f4c0'],
          angle: -Math.PI / 2, spread: 1.1,
          speedMin: 60, speedMax: 280, sizeMin: 3, sizeMax: 9,
          lifeMin: 0.35, lifeMax: 0.8, grav: -80, drag: 1.8,
        });
      }
      // 龙化
      if (at(n, 40)) {
        sfx('summon');
        ring(ft.x, ft.y - 80, DRAGON_TINT, 260, 0.7);
        shake(A.G, 12, 14);
      }
      if (n >= 42 && n <= 90 && n % 3 === 0) {
        burst(ft.x + (h1(n) - 0.5) * 110, ft.y - 40 - h1(n * 3) * 150, 3, {
          colors: [DRAGON_TINT, '#2f7d4f', '#d8f4c0'],
          speedMin: 30, speedMax: 140, sizeMin: 3, sizeMax: 8,
          lifeMin: 0.3, lifeMax: 0.8, grav: -120, drag: 1.6,
        });
      }
      // 冲锋
      if (at(n, 90)) {
        sfx('dash');
        ring(ft.x, groundY() - 4, DRAGON_TINT, 220, 0.5);
        shake(A.G, 14, 12);
      }
      if (n > 90 && n < 152) {
        burst(ft.x - ft.facing * 40, ft.y - 70, 4, {
          colors: [DRAGON_TINT, '#2f7d4f', '#8ef26a'],
          kind: 'streak',
          speedMin: 80, speedMax: 260, sizeMin: 3, sizeMax: 8,
          lifeMin: 0.15, lifeMax: 0.4, grav: 0, drag: 2.2,
        });
        if (n % 5 === 0) {
          burst(ft.x - ft.facing * 70, groundY() - 6, 3, {
            colors: ['#2f7d4f', DRAGON_TINT, '#d8f4c0'],
            angle: -Math.PI / 2, spread: 0.6,
            speedMin: 80, speedMax: 260, sizeMin: 3, sizeMax: 8,
            lifeMin: 0.3, lifeMax: 0.7, grav: 600, drag: 2,
          });
        }
      }
      // 穿过对手
      if (at(n, 120)) {
        spark(targetPoint(A.G, ft).x, targetPoint(A.G, ft).y, 2.2, '#d8f4c0');
        shake(A.G, 18, 16);
      }
      // 收爪
      if (at(n, 152)) sfx('land');
      if (at(n, 168)) {
        sfx('dark');
        ring(ft.x, groundY() - 4, DRAGON_TINT, 260, 0.6);
        burst(ft.x, groundY() - 8, 26, {
          colors: [DRAGON_TINT, '#2f7d4f', '#d8f4c0'],
          angle: -Math.PI / 2, spread: 1.3,
          speedMin: 100, speedMax: 380, sizeMin: 3, sizeMax: 10,
          lifeMin: 0.4, lifeMax: 0.9, grav: 700, drag: 1.9,
        });
      }
    },
    draw: function (ctx, f, t, G) {
      const A = readArgs([ctx, f, t, G]);
      if (!A.ctx || !A.f) return;
      const n = A.n;
      const c = A.ctx;
      const ft = A.f;
      const dir = ft.facing;
      const gy = groundY();

      // 身后巨大白骨龙首（40 帧后出现，冲锋时最亮）
      if (n >= 40) {
        const k = seg(n, 40, 70) * (1 - seg(n, 176, 206) * 0.9);
        const head = jointWorld(ft, 'head');
        const bx = head.x - dir * 74;
        const by = head.y - 46;
        const sc = 1.25 * (0.6 + k * 0.4);
        const jaw = 0.16 + Math.sin(n * 0.18) * 0.06;
        c.save();
        c.globalAlpha = 0.55 + 0.35 * k;
        c.translate(bx, by);
        c.scale(dir * sc, sc);
        // 颅骨
        poly(c, [
          { x: -34, y: -6 }, { x: -18, y: -30 }, { x: 14, y: -34 },
          { x: 40, y: -18 }, { x: 46, y: 4 }, { x: 10, y: 12 }, { x: -24, y: 12 },
        ], '#e8efdc', '#0d2418', 2.6);
        // 上颚 + 牙
        poly(c, [
          { x: 26, y: -4 }, { x: 66, y: 2 }, { x: 62, y: 12 }, { x: 24, y: 10 },
        ], '#d8f4c0', '#0d2418', 2);
        for (let i = 0; i < 5; i++) {
          const tx = 30 + i * 8;
          poly(c, [
            { x: tx, y: 8 }, { x: tx + 3, y: 20 }, { x: tx + 6, y: 8 },
          ], '#ffffff', '#0d2418', 1.2);
        }
        // 下颚（随呼吸开合）
        c.save();
        c.rotate(jaw);
        poly(c, [
          { x: 8, y: 14 }, { x: 58, y: 14 }, { x: 52, y: 24 }, { x: 6, y: 22 },
        ], '#cbe6b4', '#0d2418', 2);
        c.restore();
        // 眼窝绿光
        c.fillStyle = DRAGON_TINT;
        c.beginPath();
        c.ellipse(14, -12, 7, 5, -0.3, 0, TAU);
        c.fill();
        // 犄角
        poly(c, [
          { x: -14, y: -28 }, { x: -46, y: -58 }, { x: -30, y: -24 },
        ], '#e8efdc', '#0d2418', 2);
        poly(c, [
          { x: -2, y: -32 }, { x: -20, y: -62 }, { x: -12, y: -28 },
        ], '#e8efdc', '#0d2418', 2);
        c.restore();

        // 身后的脊骨 + 熔岩裂口（冲锋阶段）
        if (inRange(n, 90, 160)) {
          const ck = seg(n, 90, 110) * (1 - seg(n, 148, 162));
          c.save();
          c.globalAlpha = 0.85 * ck;
          for (let i = 0; i < 9; i++) {
            const u = i / 8;
            const sx = ft.x - dir * (70 + u * 420);
            const sy = gy - 8 - Math.sin(u * Math.PI) * 10;
            // 脊椎骨节
            poly(c, [
              { x: sx - 14, y: sy - 26 }, { x: sx, y: sy - 44 }, { x: sx + 14, y: sy - 26 },
              { x: sx + 10, y: sy - 12 }, { x: sx - 10, y: sy - 12 },
            ], 'rgba(232,239,220,0.85)', 'rgba(13,36,24,0.9)', 2);
            // 熔岩裂口
            c.globalAlpha = 0.6 * ck * (1 - u);
            c.fillStyle = DRAGON_TINT;
            c.beginPath();
            c.ellipse(sx, sy, 22 - u * 8, 5, 0, 0, TAU);
            c.fill();
            c.globalAlpha = 0.85 * ck;
          }
          c.restore();
        }
      }
    },
  };

  /* ---------------- 术士 ---------------- */
  MOVES.warlock = {
    total: WARLOCK_TOTAL,
    label: '深渊 · 十一芒',
    tint: WARLOCK_TINT,
    hits: [
      { f: 30, dmg: 40, hitstun: 18, kb: 20, lift: 0, sfx: 'dark', shake: 8 },
      { f: 104, dmg: 50, hitstun: 20, kb: 40, lift: 0, sfx: 'dark', shake: 10 },
      { f: 118, dmg: 45, hitstun: 20, kb: 40, lift: 30, sfx: 'dark', shake: 10 },
      { f: 138, dmg: 55, hitstun: 22, kb: 90, lift: 120, sfx: 'slash', shake: 12 },
      { f: 158, dmg: 60, hitstun: 26, kb: 200, lift: 380, sfx: 'heavy', shake: 18 },
      { f: 172, dmg: 35, hitstun: 22, kb: 160, lift: 220, sfx: 'dark', shake: 12 },
    ],
    move: function (f, t, G) {
      const A = readArgs([f, t, G]);
      if (!A.f) return;
      const n = A.n;
      const ft = A.f;
      const s = st(ft, 'warlock', n);
      if (n <= 0.5) {
        s.x0 = ft.x;
        s.dir = ft.facing < 0 ? -1 : 1;
      }
      const y = groundY() - warlockLift(n);
      const x = s.x0 + s.dir * warlockPush(n);
      applyPos(ft, x, y);
      ft.facing = s.dir;
      ft.glow = Math.max(ft.glow || 0, 0.14);
    },
    pose: function (f, t) {
      const A = readArgs([f, t]);
      const p = warlockPose(A.n);
      p.rot = 0;
      // 浮空时轻微飘动
      const n = A.n;
      if (n > 8 && n < 168) {
        p.hipx += Math.sin(n * 0.08) * 2;
      }
      return p;
    },
    fx: function (f, t, G) {
      const A = readArgs([f, t, G]);
      if (!A.f) return;
      const n = A.n;
      const ft = A.f;
      if (at(n, 0)) {
        sfx('charge');
        ring(ft.x, groundY() - 4, WARLOCK_TINT, 100, 0.5);
      }
      // 浮空
      if (at(n, 8)) {
        sfx('summon');
        ring(ft.x, groundY() - 4, WARLOCK_TINT, 170, 0.6);
      }
      if (n > 8 && n < 60 && n % 4 === 0) {
        burst(ft.x + (h1(n) - 0.5) * 120, groundY() - 10, 2, {
          colors: [WARLOCK_TINT, '#b06bff', '#e0c8ff'],
          speedMin: 20, speedMax: 90, sizeMin: 2, sizeMax: 6,
          lifeMin: 0.4, lifeMax: 0.9, grav: -140, drag: 1.4,
        });
      }
      // 双手下压
      if (at(n, 50)) {
        sfx('dark');
        shake(A.G, 12, 14);
        ring(ft.x, ft.y - 90, WARLOCK_TINT, 220, 0.6);
      }
      if (n > 50 && n < 110 && n % 6 === 0) {
        const r = 120 + ((n * 7) % 160);
        groundRingFlat(ft.x, groundY(), r, WARLOCK_TINT, 0.5);
      }
      // 地面黑手上抓
      if (at(n, 110)) {
        sfx('summon');
        shake(A.G, 16, 20);
        ring(ft.x, groundY() - 4, WARLOCK_TINT, 320, 0.7);
      }
      if (n >= 110 && n <= 168 && n % 4 === 0) {
        const a = h1(n * 3) * TAU;
        const rr = 60 + h1(n * 5) * 260;
        burst(ft.x + Math.cos(a) * rr, groundY() - 8, 3, {
          colors: ['#12080f', WARLOCK_TINT, '#4a2470'],
          angle: -Math.PI / 2, spread: 0.5,
          speedMin: 60, speedMax: 220, sizeMin: 3, sizeMax: 8,
          lifeMin: 0.35, lifeMax: 0.9, grav: 260, drag: 2,
        });
      }
      // 收束
      if (at(n, 162)) {
        sfx('heavy');
        shake(A.G, 18, 18);
        ring(ft.x, groundY() - 4, '#e0c8ff', 380, 0.6);
      }
      if (at(n, 170)) sfx('land');
    },
    draw: function (ctx, f, t, G) {
      const A = readArgs([ctx, f, t, G]);
      if (!A.ctx || !A.f) return;
      const n = A.n;
      const c = A.ctx;
      const ft = A.f;
      const gy = groundY();

      // 十一芒星阵（地面，随时间缓慢自转）
      if (n >= 46) {
        const k = seg(n, 46, 78) * (1 - seg(n, 168, 186) * 0.85);
        const cx = ft.x;
        const R = 300;
        const rot = n * 0.012;
        const ry = 0.34;     // 压扁成地面透视
        c.save();
        c.globalAlpha = 0.75 * k;
        c.strokeStyle = WARLOCK_TINT;
        c.lineWidth = 3;
        c.beginPath();
        for (let i = 0; i <= 11; i++) {
          const idx = (i * 4) % 11;            // {11/4} 星形
          const a = (idx / 11) * TAU + rot;
          const px = cx + Math.cos(a) * R;
          const py = gy + Math.sin(a) * R * ry;
          if (i === 0) c.moveTo(px, py);
          else c.lineTo(px, py);
        }
        c.closePath();
        c.stroke();
        // 内层第二个星（反向旋转）
        c.globalAlpha = 0.4 * k;
        c.lineWidth = 2;
        c.beginPath();
        for (let i = 0; i <= 11; i++) {
          const idx = (i * 3) % 11;
          const a = (idx / 11) * TAU - rot * 1.6;
          const px = cx + Math.cos(a) * R * 0.62;
          const py = gy + Math.sin(a) * R * 0.62 * ry;
          if (i === 0) c.moveTo(px, py);
          else c.lineTo(px, py);
        }
        c.closePath();
        c.stroke();
        // 11 个顶点符文点
        c.globalAlpha = 0.9 * k;
        c.fillStyle = '#e0c8ff';
        for (let i = 0; i < 11; i++) {
          const a = (i / 11) * TAU + rot;
          c.beginPath();
          c.ellipse(cx + Math.cos(a) * R, gy + Math.sin(a) * R * ry, 4, 2.4, 0, 0, TAU);
          c.fill();
        }
        c.restore();
        // 地面紫光
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = 0.22 * k;
        c.fillStyle = WARLOCK_TINT;
        c.beginPath();
        c.ellipse(cx, gy + 2, R * 1.05, R * ry * 1.1, 0, 0, TAU);
        c.fill();
        c.restore();
      }

      // 十只从地面升起的黑色张指手
      if (n >= 108) {
        for (let i = 0; i < 10; i++) {
          const ang = (i / 10) * TAU + 0.3;
          const rr = 90 + h1(i * 7) * 240;
          const hx = ft.x + Math.cos(ang) * rr;
          const t0 = 110 + i * 3;
          const k = EASE.out3(seg(n, t0, t0 + 18));
          if (k <= 0) continue;
          const fade = 1 - seg(n, 162, 182);
          drawDarkHand(c, hx, gy + 6, k, 0.7 + h1(i * 3) * 0.5, fade * 0.9, WARLOCK_TINT, i);
        }
      }
    },
  };

  /** 贴地椭圆环（术士法阵用，直接画在世界坐标）。 */
  function groundRingFlat(x, gy, r, color, alpha) {
    if (!BVN.FX || !BVN.FX.ring) return;
    // FX.ring 是正圆，这里用粒子 kind:'ring' 的等效替代：直接画一条扁环
    BVN.FX.particles.push({
      x: x, y: gy + 2, vx: 0, vy: 0, life: 0.5, max: 0.5,
      size: r * 0.5, color: color, grav: 0, drag: 1,
      kind: 'ring', rot: 0, spin: 0, grow: 0,
    });
    // 用极淡的粒子兜底视觉（避免依赖 FX 内部结构变化时完全消失）
    if (alpha > 0) {
      BVN.FX.burst(x, gy, 1, {
        colors: [color], speedMin: 0, speedMax: 4, sizeMin: 1, sizeMax: 2,
        lifeMin: 0.2, lifeMax: 0.3, grav: 0, drag: 4,
      });
    }
  }

  /** 术士的黑手：从地里升起、五指张开。 */
  function drawDarkHand(ctx, x, gy, rise, sc, alpha, tint, seed) {
    if (rise <= 0.02 || alpha <= 0.02) return;
    const up = rise * 118 * sc;
    const w = 15 * sc;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, gy);
    ctx.rotate((h1(seed) - 0.5) * 0.5);
    // 前臂
    poly(ctx, [
      { x: -w * 1.2, y: 6 },
      { x: -w * 0.8, y: -up * 0.8 },
      { x: w * 0.8, y: -up * 0.82 },
      { x: w * 1.2, y: 6 },
    ], '#0d0714', '#000000', 2);
    // 掌
    const py = -up;
    poly(ctx, [
      { x: -w * 0.9, y: py + 4 },
      { x: -w * 0.85, y: py - 12 },
      { x: w * 0.85, y: py - 12 },
      { x: w * 0.9, y: py + 4 },
    ], '#150b22', '#000000', 2);
    // 五指张开的剪影
    for (let i = 0; i < 5; i++) {
      const bx = (-0.75 + i * 0.38) * w;
      const spread = (i - 2) * 0.46;
      const len = (22 + h1(seed * 3 + i) * 16) * sc;
      poly(ctx, [
        { x: bx - 3 * sc, y: py - 8 },
        { x: bx + Math.sin(spread) * len, y: py - 10 - Math.cos(spread) * len },
        { x: bx + Math.sin(spread) * len + 3 * sc, y: py - 8 - Math.cos(spread) * len },
        { x: bx + 3 * sc, y: py - 8 },
      ], '#1b0f2c', '#000000', 1.6);
    }
    // 掌心紫光
    ctx.globalAlpha = alpha * 0.85;
    ctx.fillStyle = tint;
    ctx.beginPath();
    ctx.ellipse(0, py - 4, 3.2 * sc, 2.2 * sc, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /* ---------------- 游侠 ---------------- */
  MOVES.ranger = {
    total: RANGER_TOTAL,
    label: '苍鹰 · 万箭',
    tint: RANGER_TINT,
    hits: [
      { f: 34, dmg: 24, hitstun: 14, kb: 20, lift: 0, sfx: 'arrow', shake: 5 },
      { f: 48, dmg: 24, hitstun: 14, kb: 20, lift: 0, sfx: 'arrow', shake: 5 },
      { f: 62, dmg: 24, hitstun: 14, kb: 30, lift: 0, sfx: 'arrow', shake: 6 },
      { f: 76, dmg: 24, hitstun: 14, kb: 30, lift: 0, sfx: 'arrow', shake: 6 },
      { f: 90, dmg: 24, hitstun: 16, kb: 40, lift: 20, sfx: 'arrow', shake: 7 },
      { f: RANGER_GIANT, dmg: 150, hitstun: 34, kb: 420, lift: 520, sfx: 'heavy', shake: 26 },
    ],
    move: function (f, t, G) {
      const A = readArgs([f, t, G]);
      if (!A.f) return;
      const n = A.n;
      const ft = A.f;
      const s = st(ft, 'ranger', n);
      if (n <= 0.5) {
        s.x0 = ft.x;
        s.dir = ft.facing < 0 ? -1 : 1;
      }
      const y = groundY() - rangerLift(n);
      const x = s.x0 + s.dir * rangerPush(n);
      applyPos(ft, x, y);
      ft.facing = s.dir;
      ft.glow = Math.max(ft.glow || 0, 0.1);
      // 每箭出手时记录箭迹起点（弓的位置）
      for (let i = 0; i < RANGER_ARROWS.length; i++) {
        if (at(n, RANGER_ARROWS[i])) {
          s.marks.push({ f: n, kind: 'arrow', size: 1 });
        }
      }
      if (at(n, RANGER_GIANT)) s.marks.push({ f: n, kind: 'giant', size: 4 });
      // 只保留最近 8 条
      if (s.marks.length > 8) s.marks.splice(0, s.marks.length - 8);
    },
    pose: function (f, t) {
      const A = readArgs([f, t]);
      const p = rangerPose(A.n);
      p.rot = 0;
      return p;
    },
    fx: function (f, t, G) {
      const A = readArgs([f, t, G]);
      if (!A.f) return;
      const n = A.n;
      const ft = A.f;
      const tp = targetPoint(A.G, ft);
      if (at(n, 0)) {
        sfx('charge');
        ring(ft.x, groundY() - 4, RANGER_TINT, 90, 0.45);
      }
      if (at(n, 6)) sfx('jump');
      if (at(n, 10)) {
        ring(ft.x, groundY() - 4, '#9fe6ff', 150, 0.45);
        burst(ft.x, groundY() - 6, 14, {
          colors: ['#dfeaf2', '#9fe6ff'],
          angle: -Math.PI / 2, spread: 1.1,
          speedMin: 60, speedMax: 240, sizeMin: 3, sizeMax: 8,
          lifeMin: 0.3, lifeMax: 0.7, grav: 400, drag: 2.2,
        });
      }
      // 五箭：箭迹火花
      for (let i = 0; i < RANGER_ARROWS.length; i++) {
        const af = RANGER_ARROWS[i];
        if (at(n, af)) {
          spark(tp.x, tp.y, 0.9, '#ffffff');
          burst(ft.x, ft.y - 96, 5, {
            colors: ['#ffffff', RANGER_TINT],
            kind: 'streak',
            speedMin: 60, speedMax: 200, sizeMin: 2, sizeMax: 5,
            lifeMin: 0.12, lifeMax: 0.3, grav: 0, drag: 2.6,
          });
        }
      }
      // 巨箭
      if (at(n, RANGER_GIANT)) {
        shake(A.G, 16, 18);
        ring(ft.x, ft.y - 96, '#ffffff', 190, 0.45);
        ring(ft.x, ft.y - 96, RANGER_TINT, 260, 0.6);
        spark(tp.x, tp.y, 2.4, '#ffffff');
        burst(tp.x, tp.y, 28, {
          colors: ['#ffffff', RANGER_TINT, '#5fb0d8'],
          speedMin: 120, speedMax: 460, sizeMin: 3, sizeMax: 9,
          lifeMin: 0.25, lifeMax: 0.7, grav: 500, drag: 2,
        });
      }
      // 落地
      if (at(n, 148)) {
        sfx('land');
        shake(A.G, 10, 12);
        ring(ft.x, groundY() - 4, RANGER_TINT, 190, 0.45);
        burst(ft.x, groundY() - 6, 16, {
          colors: ['#dfeaf2', '#5fb0d8', '#9fe6ff'],
          angle: -Math.PI / 2, spread: 1.3,
          speedMin: 60, speedMax: 260, sizeMin: 3, sizeMax: 8,
          lifeMin: 0.3, lifeMax: 0.7, grav: 700, drag: 2.1,
        });
      }
    },
    draw: function (ctx, f, t, G) {
      const A = readArgs([ctx, f, t, G]);
      if (!A.ctx || !A.f) return;
      const n = A.n;
      const c = A.ctx;
      const ft = A.f;
      const dy = ft.facing * -1;   // 箭飞向对手（大致朝 +facing）
      const dir = ft.facing;

      // 顶部暗幕
      if (inRange(n, 26, 130)) {
        const k = seg(n, 26, 44) * (1 - seg(n, 116, 132));
        c.save();
        c.globalAlpha = 0.34 * k;
        c.fillStyle = '#050a12';
        c.fillRect(ft.x - 900, groundY() - 720, 1800, 420);
        c.restore();
      }

      // 每条箭迹：一条白线 + 三角箭头
      const s = ft.__fm;
      if (!s || s.tag !== 'ranger') return;
      for (let i = 0; i < s.marks.length; i++) {
        const m = s.marks[i];
        const age = n - m.f;
        const life = m.kind === 'giant' ? 16 : 12;
        if (age < 0 || age > life) continue;
        const k = 1 - age / life;
        const len = (m.kind === 'giant' ? 620 : 470) * (0.35 + 0.65 * Math.min(1, age / 3));
        const y0 = ft.y - 96 + (m.kind === 'giant' ? 4 : (i % 2 ? 10 : -14));
        const x0 = ft.x + dir * 62;
        const x1 = ft.x + dir * (62 + len);
        c.save();
        c.globalAlpha = 0.85 * k;
        c.strokeStyle = m.kind === 'giant' ? '#ffffff' : RANGER_TINT;
        c.lineWidth = m.kind === 'giant' ? 13 : 4;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(x0, y0);
        c.lineTo(x1, y0);
        c.stroke();
        // 箭头
        const hs = m.kind === 'giant' ? 46 : 16;
        poly(c, [
          { x: x1, y: y0 },
          { x: x1 - dir * hs, y: y0 - hs * 0.5 },
          { x: x1 - dir * hs * 0.72, y: y0 },
          { x: x1 - dir * hs, y: y0 + hs * 0.5 },
        ], '#ffffff', 'rgba(0,0,0,0.35)', 1.2);
        if (m.kind === 'giant') {
          c.globalAlpha = 0.5 * k;
          c.strokeStyle = '#ffffff';
          c.lineWidth = 3;
          c.beginPath();
          c.moveTo(x0, y0 - 26);
          c.lineTo(x1, y0 - 18);
          c.moveTo(x0, y0 + 26);
          c.lineTo(x1, y0 + 18);
          c.stroke();
        }
        c.restore();
      }
      // 防止未使用变量告警（dir/dy 参与上方计算）
      if (dy === 0) return;
    },
  };

  /* ---------------- 浪人 ---------------- */
  MOVES.ronin = {
    total: RONIN_TOTAL,
    label: '无明 · 十步杀',
    tint: RONIN_TINT,
    hits: [
      { f: 30, dmg: 36, hitstun: 16, kb: 20, lift: 0, sfx: 'slash', shake: 8 },
      { f: 50, dmg: 36, hitstun: 16, kb: 30, lift: 0, sfx: 'slash', shake: 8 },
      { f: 70, dmg: 36, hitstun: 16, kb: 30, lift: 0, sfx: 'slash', shake: 9 },
      { f: 90, dmg: 36, hitstun: 18, kb: 40, lift: 20, sfx: 'slash', shake: 9 },
      { f: 110, dmg: 36, hitstun: 18, kb: 40, lift: 20, sfx: 'slash', shake: 10 },
      { f: RONIN_LAST, dmg: 110, hitstun: 34, kb: 380, lift: 460, sfx: 'heavy', shake: 24 },
    ],
    move: function (f, t, G) {
      const A = readArgs([f, t, G]);
      if (!A.f) return;
      const n = A.n;
      const ft = A.f;
      const s = st(ft, 'ronin', n);
      const o = opponent(A.G, ft);
      if (n <= 0.5) {
        s.x0 = ft.x;
        s.dir = ft.facing < 0 ? -1 : 1;
      }
      const ox = o ? o.x : s.x0 + s.dir * 300;
      let x = s.x0;
      let facing = s.dir;

      // 五次瞬移斩 + 末刀：每次瞬移到对手另一侧
      const all = RONIN_SLASH.concat([RONIN_LAST]);
      for (let i = 0; i < all.length; i++) {
        const sf = all[i];
        if (n < sf - 6) break;
        if (n < sf) {
          // 消失预备：停在原地
          x = i === 0 ? s.x0 : s.pos[i - 1];
          facing = s.dir;
          break;
        }
        // 已瞬移到第 i 个落点
        const side = i === all.length - 1 ? -1 : (i % 2 === 0 ? 1 : -1);
        const off = i === all.length - 1 ? 150 : 108;
        const target = ox + side * off;
        if (!s.pos) s.pos = [];
        s.pos[i] = clampX(target);
        x = s.pos[i];
        facing = ox >= x ? 1 : -1;
        if (at(n, sf)) {
          // 记录残影 + 刀光
          s.marks.push({
            f: n, x: s.marks.length ? s.marks[s.marks.length - 1].nx : x,
            nx: x, facing: facing, pose: fit(roninSlash(i / (all.length - 1))),
          });
          if (s.marks.length > 6) s.marks.shift();
        }
      }
      // 末刀之后回身站定
      if (n > RONIN_LAST + 10 && o) facing = ox >= x ? 1 : -1;
      applyPos(ft, x, groundY());
      ft.facing = facing;
      ft.glow = Math.max(ft.glow || 0, 0.1);
    },
    pose: function (f, t) {
      const A = readArgs([f, t]);
      const p = roninPose(A.n);
      p.rot = 0;
      return p;
    },
    fx: function (f, t, G) {
      const A = readArgs([f, t, G]);
      if (!A.f) return;
      const n = A.n;
      const ft = A.f;
      if (at(n, 0)) {
        sfx('charge');
        ring(ft.x, groundY() - 4, RONIN_TINT, 80, 0.45);
      }
      if (at(n, 12)) {
        ring(ft.x, groundY() - 80, '#ffe9c0', 110, 0.4);
        burst(ft.x, groundY() - 80, 10, {
          colors: ['#ffe9c0', '#ffffff'],
          speedMin: 20, speedMax: 90, sizeMin: 2, sizeMax: 5,
          lifeMin: 0.2, lifeMax: 0.5, grav: 0, drag: 2.4,
        });
      }
      // 五次瞬移斩：每次一道刀光 + 火花
      const all = RONIN_SLASH.concat([RONIN_LAST]);
      for (let i = 0; i < all.length; i++) {
        const sf = all[i];
        if (at(n, sf)) {
          const big = i === all.length - 1;
          const cx = ft.x + ft.facing * (big ? 30 : 20);
          const cy = ft.y - 100;
          arc(cx, cy, big ? 190 : 130, -1.5, 1.2, '#ffffff', big ? 18 : 9);
          arc(cx, cy, big ? 210 : 145, -1.3, 1.0, RONIN_TINT, big ? 8 : 4);
          shake(A.G, big ? 22 : 9, big ? 20 : 10);
          burst(ft.x + ft.facing * 60, ft.y - 100, big ? 24 : 10, {
            colors: ['#ffffff', '#ffe9c0'],
            kind: 'streak',
            angle: -Math.PI / 2, spread: 1.2,
            speedMin: 120, speedMax: big ? 520 : 300, sizeMin: 2, sizeMax: 6,
            lifeMin: 0.15, lifeMax: 0.45, grav: 0, drag: 2.2,
          });
          if (!big) sfx('slash');
        }
      }
      if (at(n, RONIN_LAST)) sfx('ko');
      if (at(n, RONIN_LAST + 18)) sfx('land');
      // 收刀时刀气余韵
      if (n > RONIN_LAST && n < RONIN_LAST + 14 && n % 3 === 0) {
        burst(ft.x, ft.y - 100, 3, {
          colors: ['#ffffff', '#ffe9c0'],
          speedMin: 40, speedMax: 160, sizeMin: 2, sizeMax: 5,
          lifeMin: 0.2, lifeMax: 0.5, grav: 0, drag: 2,
        });
      }
    },
    draw: function (ctx, f, t, G) {
      const A = readArgs([ctx, f, t, G]);
      if (!A.ctx || !A.f) return;
      const n = A.n;
      const c = A.ctx;
      const ft = A.f;
      const s = ft.__fm;
      if (!s || s.tag !== 'ronin' || !s.marks) return;

      // 残影：每次瞬移在原地留一个半透明分身，12 帧内淡出
      for (let i = 0; i < s.marks.length; i++) {
        const m = s.marks[i];
        const age = n - m.f;
        if (age < 0 || age > 14) continue;
        const k = 1 - age / 14;
        c.save();
        c.globalCompositeOperation = 'source-over';
        drawGhost(c, ft, m.x, groundY(), m.facing, m.pose, 0.34 * k);
        c.restore();
      }

      // 末刀之后：一道横贯全屏的白线（短暂只剩光）
      if (n >= RONIN_LAST && n <= RONIN_LAST + 18) {
        const k = 1 - seg(n, RONIN_LAST, RONIN_LAST + 18);
        const y = groundY() - 104;
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = 0.95 * k;
        c.strokeStyle = '#ffffff';
        c.lineWidth = 3 + 5 * k;
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(cfg().STAGE_W, y);
        c.stroke();
        c.globalAlpha = 0.4 * k;
        c.lineWidth = 16 * k;
        c.stroke();
        c.restore();
      }
    },
  };

  /* ============================================================
   * 11. 自检 + 导出
   * ============================================================ */

  /** 启动自检：帧数区间、段数、伤害合计、段帧递增、姿势 13 字段齐全。 */
  function selfCheck() {
    const ids = Object.keys(MOVES);
    const report = { ok: true, items: [] };
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const m = MOVES[id];
      // 防御：只检查「像动作条目」的对象（selfCheck 等挂载在 MOVES 上的工具函数要跳过）
      if (!m || typeof m !== 'object' || typeof m.pose !== 'function' || !Array.isArray(m.hits)) continue;
      const dmg = m.hits.reduce(function (a, h) { return a + h.dmg; }, 0);
      let sorted = true;
      for (let j = 1; j < m.hits.length; j++) {
        if (m.hits[j].f <= m.hits[j - 1].f) sorted = false;
      }
      const pose = m.pose(null, 0);
      const keys = Object.keys(pose);
      const full = POSE_KEYS.every(function (k) { return pose[k] != null; });
      const item = {
        id: id,
        total: m.total,
        hits: m.hits.length,
        dmg: dmg,
        sorted: sorted,
        poseKeys: keys.length,
        poseFull: full,
      };
      if (m.total < 160 || m.total > 220 || m.hits.length < 4 || m.hits.length > 6 ||
          dmg < 240 || dmg > 320 || !sorted || !full) {
        item.warn = true;
        report.ok = false;
      }
      report.items.push(item);
    }
    return report;
  }

  /* 先算报告再挂载工具函数：selfCheck() 遍历 MOVES 的键，
     若先把 selfCheck 挂上去，遍历时会撞上 undefined.hits（页错误）。 */
  BVN.FIELD_MOVE_REPORT = selfCheck();
  MOVES.selfCheck = selfCheck;
  BVN.FIELD_MOVES = MOVES;
})(window.BVN);

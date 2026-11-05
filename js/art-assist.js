/* js/art-assist.js — 7 个援助角色的程序化骨骼外观（复用 art.js 的 drawBody 管线）+ 三相动作姿势关键帧
 *
 * 结构：
 *   0. 契约与通用绘制小件（与 LOOKS.ronin / LOOKS.warlock 同一套手法）
 *   1. 姿势系统：STAND 站姿 + 每个 build 的 5 个相位关键帧（in / windup / strike / recover / out）
 *   2. 7 套外观（用 Art.registerLook 注册，键 === ASSISTS[].build）
 *   3. 启动自检：ASSISTS 里有 build 没注册就 console.warn（art.js 会自动回退 LOOKS.ronin，一眼可发现）
 *
 * 画风契约（docs/design-v3.md §2.8）：
 *   只允许通过 Art.kit 的原语与 drawBody 钩子绘制；颜色只能由 def.palette（C0）
 *   经 shade()/rgba() 派生，不硬编码主色 —— 这样 7 个援助与 8 个可操控角色是"同一部作品里的角色"。
 *
 * 三相时序（与 js/assist.js 的 in→act→out 对齐，伤害时点零改动）：
 *   in(30 帧)  : 从召援者身后低姿滑入，尾段（后 50%）并入蓄力顶点 → 落地即蓄满
 *   act        : strike 起于 act 第 0 帧（= 现有 fireAct 的触发帧），strike 段之后全为 recover
 *                （因此 windup 被前移到 in 段尾部：不这么做，伤害时点会比二期晚 10~17 帧）
 *   out(20 帧) : 后跃 + 淡出
 */
window.BVN = window.BVN || {};

(function (BVN) {
  'use strict';

  const Art = BVN.Art;
  const KIT = Art.kit;
  /** 颜色派生（等于 Art.kit.shade / rgba，别名只是为了代码里读起来短一点） */
  const shade = KIT.shade;
  const rgba = KIT.rgba;

  /** 姿势字段契约（与 data.js 的 POSE_DEFAULT 完全一致） */
  const POSE_KEYS = ['t', 'h', 'afu', 'aff', 'abu', 'abf', 'lft', 'lfs', 'lbt', 'lbs', 'c', 'rot', 'hipx'];
  /** 姿势驱动的 5 个相位（act 内再分 strike / recover，见文件头说明） */
  const PHASES = ['in', 'windup', 'strike', 'recover', 'out'];

  /* ============================================================
   *  0. 通用工具
   * ============================================================ */

  function clamp01(u) { return u < 0 ? 0 : (u > 1 ? 1 : u); }
  /** 出招用：前段快、后段慢（起手爆发） */
  function easeOut(u) { const v = clamp01(u); return 1 - Math.pow(1 - v, 3); }
  /** 收招用：前段慢、后段快（跟随惯性） */
  function easeIn(u) { const v = clamp01(u); return v * v * v; }
  function mix(a, b, u) { return a + (b - a) * u; }

  /**
   * 锥形肢体：填充 + 深色描边 + 迎光亮边。
   * 与 art.js 内部 taper() 完全同类（同一个原语，保证描边粗细一致）。
   */
  function limb(ctx, pts, ws, fill, C, lw, rim) {
    KIT.taper(ctx, pts, ws, fill, C.outline, lw == null ? 2.6 : lw, rim || null);
  }

  /** 一块布（多边形填充 + 深色描边），包一层只是为了少写 outline/线宽；C 传 null = 不描边。 */
  function panel(ctx, pts, fill, C, lw) {
    KIT.cloth(ctx, pts, fill, C ? C.outline : null, lw == null ? 2.8 : lw);
  }

  /** 四芒星（法师星冠 / 肩上三星 / 命中闪光）。 */
  function starShape(ctx, x, y, r, color, C) {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x + r * 0.22, y - r * 0.22, x + r, y);
    ctx.quadraticCurveTo(x + r * 0.22, y + r * 0.22, x, y + r);
    ctx.quadraticCurveTo(x - r * 0.22, y + r * 0.22, x - r, y);
    ctx.quadraticCurveTo(x - r * 0.22, y - r * 0.22, x, y - r);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    if (C) {
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 1.4;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
  }

  /** 头顶小徽记（侦探的秒表 / 囚徒的锁），用同一个圆 + 内圈画法。 */
  function emblem(ctx, x, y, r, fill, C) {
    KIT.circle(ctx, x, y, r);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }

  /* ============================================================
   *  1. 姿势系统
   * ============================================================ */

  /** 站姿基线（与可操控角色 idle 的中段值同源，头身比才不会跑偏） */
  const STAND = {
    t: 0.08, h: -0.02,
    afu: 0.6, aff: 0.82,
    abu: -0.42, abf: 0.66,
    lft: 0.26, lfs: -0.24,
    lbt: -0.22, lbs: -0.14,
    c: 6, rot: 0, hipx: 0,
  };

  /** 把两个"半姿势"按 u 混合成完整姿势（缺省字段取 STAND）。 */
  function mixPose(a, b, u) {
    const A = a || {};
    const B = b || {};
    const o = {};
    for (let i = 0; i < POSE_KEYS.length; i++) {
      const k = POSE_KEYS[i];
      const av = A[k] == null ? STAND[k] : A[k];
      const bv = B[k] == null ? STAND[k] : B[k];
      o[k] = av + (bv - av) * u;
    }
    return o;
  }

  /**
   * 每个 build 的相位关键帧。
   *   in      : 入场（低姿滑入，尾段并入 wind）
   *   wind    : 蓄力顶点（in 段尾 & windup 相位的终点）
   *   strike  : 出手顶点（对象，或 function(k, opt) → 半姿势；黑道按 attackFrame 分三档）
   *   recover : 收招终点
   *   out     : 后跃顶点
   */
  const POSE_TABLE = {
    /* 侦探：抬腕看表 → 右臂前伸，重心后坐、风衣下摆甩起 */
    detective: {
      in: { t: 0.34, h: 0.12, afu: -0.5, aff: 1.5, abu: -0.92, abf: 1.28, lft: 0.64, lfs: -0.5, lbt: -0.5, lbs: -0.34, c: 17 },
      wind: { t: -0.08, h: 0.28, afu: 1.12, aff: 1.72, abu: -0.16, abf: 0.34, lft: 0.18, lfs: -0.3, lbt: -0.36, lbs: -0.2, c: 9 },
      strike: { t: -0.16, h: -0.04, afu: 1.56, aff: 0.06, abu: -0.7, abf: 0.92, lft: 0.44, lfs: -0.34, lbt: -0.46, lbs: -0.12, c: 4 },
      recover: { t: 0.02, h: 0.05, afu: 0.96, aff: 0.96, abu: -0.4, abf: 0.6, lft: 0.3, lfs: -0.26, lbt: -0.26, lbs: -0.16, c: 7 },
      out: { t: -0.2, h: -0.1, afu: -1.1, aff: 0.9, abu: -1.2, abf: 1.0, lft: 0.92, lfs: -1.1, lbt: 0.5, lbs: -1.3, c: 10, rot: 0.18 },
    },
    /* 仙人：拂尘上举划弧 → 斜下挥落，宽袖带风 */
    immortal: {
      in: { t: 0.26, h: 0.06, afu: -0.66, aff: 1.24, abu: -1.0, abf: 1.1, lft: 0.56, lfs: -0.46, lbt: -0.46, lbs: -0.3, c: 14 },
      wind: { t: -0.12, h: -0.1, afu: 2.34, aff: 0.14, abu: 2.06, abf: 0.22, lft: 0.2, lfs: -0.3, lbt: -0.34, lbs: -0.22, c: 5 },
      strike: { t: 0.3, h: 0.14, afu: 0.86, aff: 0.04, abu: 0.62, abf: 0.4, lft: 0.52, lfs: -0.38, lbt: -0.42, lbs: -0.16, c: 11 },
      recover: { t: 0.1, h: 0.02, afu: 0.74, aff: 0.7, abu: -0.2, abf: 0.6, lft: 0.32, lfs: -0.28, lbt: -0.28, lbs: -0.18, c: 8 },
      out: { t: -0.16, h: -0.06, afu: -0.9, aff: 1.0, abu: -1.1, abf: 1.0, lft: 0.86, lfs: -1.2, lbt: 0.46, lbs: -1.24, c: 8, rot: 0.14 },
    },
    /* 黑道：耸肩收拳 → 三连摆拳（按 attackFrame 分三档） */
    yakuza: {
      in: { t: 0.32, h: 0.1, afu: -0.4, aff: 1.44, abu: -0.86, abf: 1.24, lft: 0.6, lfs: -0.48, lbt: -0.48, lbs: -0.32, c: 16 },
      wind: { t: -0.1, h: 0.06, afu: 1.26, aff: 2.02, abu: 0.92, abf: 2.18, lft: 0.22, lfs: -0.32, lbt: -0.38, lbs: -0.2, c: 12 },
      strike: function (k, opt) {
        const fr = (opt && opt.frame) || 0;
        if (fr < 6) {
          // 第一拳：右直拳
          return { t: 0.24, h: 0.02, afu: 1.46, aff: 0.12, abu: -0.7, abf: 1.5, lft: 0.44, lfs: -0.34, lbt: -0.44, lbs: -0.16, c: 9 };
        }
        if (fr < 12) {
          // 第二拳：左勾拳（后手跨身）
          return { t: 0.1, h: 0.04, afu: 0.5, aff: 1.48, abu: 1.32, abf: 0.5, lft: 0.36, lfs: -0.32, lbt: -0.4, lbs: -0.18, c: 10 };
        }
        if (fr < 18) {
          // 第三拳：转身大摆拳（末段击飞）
          return { t: 0.34, h: 0.1, afu: 1.66, aff: 0.1, abu: -1.0, abf: 1.1, lft: 0.58, lfs: -0.4, lbt: -0.5, lbs: -0.12, c: 8, rot: 0.13 };
        }
        return { t: 0.12, h: 0.04, afu: 0.96, aff: 0.96, abu: -0.4, abf: 0.86, lft: 0.34, lfs: -0.3, lbt: -0.3, lbs: -0.16, c: 9, rot: 0.04 };
      },
      recover: { t: 0.06, h: 0.02, afu: 0.9, aff: 1.0, abu: -0.3, abf: 0.9, lft: 0.3, lfs: -0.28, lbt: -0.28, lbs: -0.16, c: 8 },
      out: { t: -0.18, h: -0.08, afu: -1.0, aff: 1.0, abu: -1.1, abf: 1.0, lft: 0.88, lfs: -1.14, lbt: 0.48, lbs: -1.28, c: 10, rot: 0.16 },
    },
    /* 肌霸：低重心收肩 → 肩撞前冲 */
    muscle: {
      in: { t: 0.42, h: 0.14, afu: -0.3, aff: 1.5, abu: -0.8, abf: 1.3, lft: 0.7, lfs: -0.56, lbt: -0.54, lbs: -0.36, c: 22 },
      wind: { t: 0.44, h: 0.18, afu: 1.16, aff: 1.5, abu: 0.92, abf: 1.42, lft: 0.3, lfs: -0.42, lbt: -0.44, lbs: -0.22, c: 21 },
      strike: { t: -0.2, h: -0.12, afu: -0.44, aff: 0.92, abu: -0.56, abf: 0.8, lft: 0.94, lfs: -0.36, lbt: -0.7, lbs: -0.1, c: 7, rot: 0.07 },
      recover: { t: 0.16, h: 0.06, afu: 0.7, aff: 1.05, abu: -0.2, abf: 0.9, lft: 0.44, lfs: -0.34, lbt: -0.36, lbs: -0.2, c: 12 },
      out: { t: -0.22, h: -0.1, afu: -1.2, aff: 0.8, abu: -1.2, abf: 0.9, lft: 0.86, lfs: -1.1, lbt: 0.5, lbs: -1.2, c: 12, rot: 0.2 },
    },
    /* 探险：过顶甩绳 → 前抛 + 后拽 */
    explorer: {
      in: { t: 0.3, h: 0.08, afu: -0.56, aff: 1.36, abu: -0.9, abf: 1.2, lft: 0.6, lfs: -0.46, lbt: -0.48, lbs: -0.3, c: 15 },
      wind: { t: -0.14, h: -0.06, afu: -2.42, aff: 0.3, abu: 0.9, abf: 0.6, lft: 0.24, lfs: -0.32, lbt: -0.36, lbs: -0.2, c: 8 },
      strike: { t: 0.34, h: 0.12, afu: 1.72, aff: 0.08, abu: -0.72, abf: 1.18, lft: 0.56, lfs: -0.4, lbt: -0.5, lbs: -0.14, c: 10 },
      recover: { t: 0.12, h: 0.04, afu: 1.0, aff: 0.9, abu: -0.34, abf: 0.78, lft: 0.34, lfs: -0.3, lbt: -0.3, lbs: -0.18, c: 9 },
      out: { t: -0.18, h: -0.08, afu: -1.0, aff: 0.96, abu: -1.08, abf: 0.98, lft: 0.9, lfs: -1.12, lbt: 0.48, lbs: -1.26, c: 10, rot: 0.16 },
    },
    /* 法师：双手举过头顶 → 双臂下压，袍摆上扬 */
    mage: {
      in: { t: 0.24, h: 0.04, afu: -0.5, aff: 1.2, abu: -0.94, abf: 1.14, lft: 0.54, lfs: -0.44, lbt: -0.44, lbs: -0.28, c: 12 },
      wind: { t: -0.14, h: -0.16, afu: 2.86, aff: 0.16, abu: 2.72, abf: 0.2, lft: 0.18, lfs: -0.28, lbt: -0.32, lbs: -0.2, c: 4 },
      strike: { t: 0.22, h: 0.1, afu: 1.02, aff: 0.26, abu: 0.92, abf: 0.3, lft: 0.48, lfs: -0.36, lbt: -0.4, lbs: -0.16, c: 13 },
      recover: { t: 0.08, h: 0.02, afu: 0.78, aff: 0.78, abu: -0.3, abf: 0.66, lft: 0.3, lfs: -0.26, lbt: -0.26, lbs: -0.16, c: 8 },
      out: { t: -0.14, h: -0.08, afu: -0.94, aff: 1.0, abu: -1.06, abf: 1.0, lft: 0.84, lfs: -1.16, lbt: 0.44, lbs: -1.22, c: 7, rot: 0.12 },
    },
    /* 囚徒：甩链抖动 → 前甩 + 铁球拖地 */
    prisoner: {
      in: { t: 0.36, h: 0.12, afu: -0.4, aff: 1.4, abu: -0.9, abf: 1.26, lft: 0.62, lfs: -0.5, lbt: -0.5, lbs: -0.32, c: 18 },
      wind: function (k) {
        // 甩链抖动：k 越大摆动幅度越小（链子被甩起来了）
        const jit = Math.sin(k * Math.PI * 5) * (0.5 - 0.3 * k);
        return { t: 0.2, h: 0.08, afu: -0.4 + jit * 1.4, aff: 1.2 - jit * 0.5, abu: -0.3, abf: 0.7, lft: 0.28, lfs: -0.34, lbt: -0.4, lbs: -0.2, c: 13 };
      },
      strike: { t: 0.3, h: 0.1, afu: 1.5, aff: 0.06, abu: -0.66, abf: 1.0, lft: 0.5, lfs: -0.38, lbt: -0.46, lbs: -0.14, c: 9 },
      recover: { t: 0.1, h: 0.04, afu: 0.92, aff: 0.94, abu: -0.36, abf: 0.76, lft: 0.32, lfs: -0.28, lbt: -0.3, lbs: -0.18, c: 9 },
      out: { t: -0.18, h: -0.08, afu: -1.04, aff: 0.98, abu: -1.1, abf: 0.98, lft: 0.9, lfs: -1.12, lbt: 0.48, lbs: -1.24, c: 10, rot: 0.17 },
    },
  };

  const AssistArt = {
    POSE_KEYS: POSE_KEYS,
    PHASES: PHASES,
    /** 已注册的 build id（启动自检用） */
    REGISTERED: [],
    /** registerAll() 是否已跑过 */
    READY: false,
    /** 自检发现的缺失 build（art.js 会回退 LOOKS.ronin，这里只记录 + warn） */
    MISSING: [],
  };

  /** 相位 → 半姿势（函数式关键帧要传 opt.frame 给黑道分档用） */
  function phaseShape(T, phase, k, opt) {
    const tb = T || POSE_TABLE.detective;
    const windRaw = tb.wind;
    const wind = typeof windRaw === 'function' ? windRaw(clamp01(k)) : windRaw;
    if (phase === 'in') {
      // 入场前 50% 是低姿滑入，后 50% 直接并入蓄力顶点 —— 落地即蓄满，出手才不会"先打完再蓄力"
      const u = clamp01((k - 0.5) / 0.5);
      return mixPose(tb.in, wind, easeOut(u));
    }
    if (phase === 'windup') {
      return mixPose(tb.in, wind, easeOut(clamp01(k)));
    }
    if (phase === 'strike') {
      const strike = typeof tb.strike === 'function' ? tb.strike(clamp01(k), opt || {}) : tb.strike;
      // 前 35% 完成 85% 的位移（爆发感），其余保持顶点
      const u = clamp01(k / 0.35);
      return mixPose(wind, strike, easeOut(u));
    }
    if (phase === 'recover') {
      const strike = typeof tb.strike === 'function' ? tb.strike(1, opt || {}) : tb.strike;
      return mixPose(strike, tb.recover, easeIn(clamp01(k)));
    }
    // out：从收招位后跃
    return mixPose(tb.recover, tb.out, easeOut(clamp01(k)));
  }

  /**
   * 按相位进度就地改写 / 生成一份姿势。
   * @param {string} build 援助 build id
   * @param {string} phase in / windup / strike / recover / out
   * @param {number} k 相位进度 0~1
   * @param {number} facing 朝向（1 右 / -1 左；镜像由 Art.drawFighter 负责，这里保留给世界向动作）
   * @param {Object} [opt] { out: 目标姿势对象, frame: act 内帧号 }
   * @returns {Object} 13 个字段齐全的姿势
   */
  AssistArt.pose = function (build, phase, k, facing, opt) {
    const o = (opt && opt.out) || {};
    const shape = phaseShape(POSE_TABLE[build], phase, clamp01(k == null ? 0 : k), opt || {});
    for (let i = 0; i < POSE_KEYS.length; i++) {
      const key = POSE_KEYS[i];
      o[key] = shape[key];
    }
    // facing 只在"世界向动作"里用到（例如探身后跃），此处保留参数以固定 API
    if (facing === 0) o.hipx = 0;
    return o;
  };

  /** 头顶名牌文字 */
  AssistArt.label = function (build) {
    const def = BVN.ASSIST_BY_ID ? BVN.ASSIST_BY_ID[build] : null;
    return (def ? def.short : build) + ' · 参上';
  };

  /** 身份证小动作的相位字段（外观钩子里读 f.aPhase / f.aK / f.attackFrame 用） */
  AssistArt.tint = function (def) {
    return (def && def.palette && def.palette.glow) || '#ffffff';
  };

  /* ============================================================
   *  2. 外观注册
   * ============================================================ */

  const DEFS = {};

  /**
   * 注册一套援助外观（内部就是 Art.registerLook + 记录，用于启动自检）。
   * @param {string} build build id（必须 === ASSISTS[].build）
   * @param {Object} look drawBody 钩子集合
   */
  function register(build, look) {
    DEFS[build] = look;
    if (Art.registerLook(build, look)) {
      if (AssistArt.REGISTERED.indexOf(build) < 0) AssistArt.REGISTERED.push(build);
      return true;
    }
    console.warn('[AssistArt] 外观注册失败：' + build + '（回退 LOOKS.ronin）');
    return false;
  }

  /* ------------------------------------------------------------
   *  侦探于沛頎：长风衣到小腿 + 礼帽 + 怀表
   *  上宽下长的剪影：肩线抬高、下摆两片垂到小腿中段，风衣不开衩
   * ------------------------------------------------------------ */
  register('detective', {
    mood: 'calm',
    foot: 'shoe',
    sleeve: true,
    fabric: function (C) { return shade(C.main, 20); },   // 深咖风衣（提亮一档，深色布料在暗背景上会塌成黑块）

    ground: function (ctx, g, f, C, T) {
      // 雨夜湿地：脚下一圈冷光（很低，只是让落地有"水面反光"）
      ctx.save();
      ctx.globalAlpha *= 0.16 + Math.sin(T * 1.8) * 0.04;
      ctx.fillStyle = C.glow;
      KIT.ell(ctx, 0, -5, 30, 7);
      ctx.fill();
      ctx.restore();
    },

    back: function (ctx, g, f, C, T) {
      const sw = Math.sin(T * 2.1) * 3.2;
      // 后袖
      KIT.hangingSleeve(ctx, g.elbowB, g.shB, C, shade(C.main, -30), 30, 18, sw * 0.5);
      // 风衣后摆（两片，出手/后跃时甩起；贴着胯，不做成 slabs）
      const dash = f.aPhase === 'out' || f.aPhase === 'strike' ? 1.5 : 1;
      for (let i = 0; i < 2; i++) {
        const x0 = KIT.at(g, 0.16, -12 + i * 5);
        const tail = (10 + i * 6) * dash;
        panel(ctx, [
          x0,
          { x: x0.x - tail * 0.5 + sw, y: x0.y + 34 },
          { x: x0.x - tail * 0.9 + sw * 1.3, y: x0.y + 58 },
          { x: x0.x + 7, y: x0.y + 48 },
        ], shade(C.main, -24 + i * 6), C, 2.8);
      }
    },

    hem: function (ctx, g, f, C, T) {
      // 风衣下摆：到小腿中段、前片开一道窄缝（风衣不开衩，但要有"下摆分片"的读感）
      const dash = f.aPhase === 'strike' ? 1.4 : 1;
      const sw = Math.sin(T * 2) * 2.6 + (dash - 1) * 7;
      const fr = KIT.at(g, 0.16, 15);
      const bk = KIT.at(g, 0.16, -15);
      const lift = (dash - 1) * 6;   // 出手时下摆整体上提（被风兜起）
      panel(ctx, [
        { x: fr.x + 2, y: fr.y + 2 },
        { x: fr.x + 12 + sw, y: fr.y + 44 - lift },
        { x: fr.x + 1 + sw * 0.6, y: fr.y + 56 - lift },
        { x: fr.x - 2, y: fr.y + 50 - lift },
      ], shade(C.main, 10), C, 3);
      panel(ctx, [
        { x: bk.x, y: bk.y + 2 },
        { x: bk.x - 10 - sw, y: bk.y + 46 - lift },
        { x: bk.x + 2 - sw * 0.5, y: bk.y + 58 - lift },
        { x: bk.x + 12, y: bk.y + 50 - lift },
      ], shade(C.main, -12), C, 3);
      // 下摆内衬：一条窄的翻边（同色系亮一档，不用米白，免得读成卡其色楔子）
      panel(ctx, [
        { x: fr.x + 1 + sw * 0.6, y: fr.y + 56 - lift },
        { x: fr.x + 12 + sw, y: fr.y + 44 - lift },
        { x: fr.x + 12 + sw, y: fr.y + 47 - lift },
        { x: fr.x + 2 + sw * 0.6, y: fr.y + 58 - lift },
      ], shade(C.main, 34), null, 0);
      // 竖向褶（同色系深一档，做成窄布条而不是描边）
      panel(ctx, [
        { x: fr.x - 2, y: fr.y + 10 },
        { x: fr.x + 2, y: fr.y + 10 },
        { x: fr.x - 3 + sw * 0.4, y: fr.y + 50 - lift },
        { x: fr.x - 7 + sw * 0.4, y: fr.y + 50 - lift },
      ], shade(C.main, -26), null, 0);
    },

    legFront: function (ctx, g, f, C, T) {
      // 长风衣的前片盖住前腿（只露鞋尖）—— 长摆才像风衣，不然小腿会从下摆里穿出来
      const sw = Math.sin(T * 2) * 2;
      const hipF = KIT.at(g, 0.18, 13);
      panel(ctx, [
        hipF,
        { x: hipF.x + 15 + sw, y: -20 },
        { x: hipF.x + 1 + sw, y: -12 },
        { x: hipF.x - 6, y: -34 },
      ], shade(C.main, 10), C, 2.8);
    },

    torso: function (ctx, g, f, C, T) {
      // 衬衫（米白 trim）：从领口往下的一个窄 V，只露一条，风衣扣起来的地方不露
      const nk = KIT.at(g, 1.0, 3);
      panel(ctx, [
        { x: nk.x - 8, y: nk.y - 6 },
        { x: nk.x + 8, y: nk.y - 7 },
        { x: nk.x + 5, y: nk.y + 14 },
        { x: nk.x - 6, y: nk.y + 13 },
      ], shade(C.trim, -10), C, 2.2);
      // 衬衫领：两片向外翻的小三角
      panel(ctx, [
        { x: nk.x + 5, y: nk.y - 5 },
        { x: nk.x + 13, y: nk.y + 1 },
        { x: nk.x + 3, y: nk.y + 8 },
      ], C.trim, C, 2);
      panel(ctx, [
        { x: nk.x - 6, y: nk.y - 6 },
        { x: nk.x - 13, y: nk.y + 1 },
        { x: nk.x - 4, y: nk.y + 7 },
      ], shade(C.trim, -18), C, 2);
      // 驳领（风衣最认得出的一块）：从锁骨外张到胸口，宽而短
      const a = KIT.at(g, 1.0, 12);
      const b = KIT.at(g, 0.74, 20);
      const c = KIT.at(g, 0.52, 12);
      const d = KIT.at(g, 0.66, 4);
      panel(ctx, [a, b, c, d], shade(C.main, 22), C, 2.8);
      const a2 = KIT.at(g, 1.0, -8);
      const b2 = KIT.at(g, 0.72, -19);
      const c2 = KIT.at(g, 0.5, -11);
      const d2 = KIT.at(g, 0.62, -4);
      panel(ctx, [a2, b2, c2, d2], shade(C.main, -6), C, 2.8);
      // 前襟中缝：一条窄暗片，做出"左襟压右襟"
      panel(ctx, [
        KIT.at(g, 0.88, 1), KIT.at(g, 0.88, 6),
        KIT.at(g, 0.24, 8), KIT.at(g, 0.24, 3),
      ], shade(C.main, -20), null, 0);
      // 双排扣
      for (let i = 0; i < 3; i++) {
        const p = KIT.at(g, 0.78 - i * 0.18, 7);
        emblem(ctx, p.x, p.y, 2.1, shade(C.accent, 6), C);
      }
      // 暗金怀表链：从第二颗扣斜挂到右腰袋（用 ribbon，自带描边，不会读成划痕）
      const ch0 = KIT.at(g, 0.6, 7);
      const ch1 = KIT.at(g, 0.3, 13);
      KIT.ribbon(ctx, ch0, { x: (ch0.x + ch1.x) / 2 - 5, y: (ch0.y + ch1.y) / 2 + 2 }, 1.6, C.accent, C, 0.9);
      KIT.ribbon(ctx, { x: (ch0.x + ch1.x) / 2 - 5, y: (ch0.y + ch1.y) / 2 + 2 }, ch1, 1.6, C.accent, C, 0.9);
      // 腰带
      const w1 = KIT.at(g, 0.2, 14);
      const w2 = KIT.at(g, 0.2, -14);
      KIT.ribbon(ctx, w1, w2, 5, shade(C.sub, -4), C, 1.6);
      emblem(ctx, w1.x - 2, w1.y, 3, shade(C.accent, -14), C);
    },

    head: function (ctx, g, f, C, T) {
      KIT.drawHeadBase(ctx, g, f, C, T, { mood: 'calm' });
      ctx.save();
      ctx.translate(g.head.x, g.head.y);
      ctx.rotate(g.headAng);
      // 鬓角
      ctx.beginPath();
      ctx.moveTo(-11, -2);
      ctx.quadraticCurveTo(-13.5, 5, -10, 9);
      ctx.lineTo(-7, 4);
      ctx.closePath();
      ctx.fillStyle = shade(C.hair, 6);
      ctx.fill();
      // 礼帽：帽檐（前低后高的扁椭圆）+ 帽冠 + 暗金帽带
      KIT.ell(ctx, 1, -13.5, 20, 5.2, -0.07);
      ctx.fillStyle = shade(C.main, -10);
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 2.4;
      ctx.stroke();
      const grd = ctx.createLinearGradient(-10, -30, 10, -12);
      grd.addColorStop(0, shade(C.main, 26));
      grd.addColorStop(1, shade(C.main, -18));
      ctx.beginPath();
      ctx.moveTo(-12.6, -13);
      ctx.quadraticCurveTo(-12, -30, 0.5, -31.5);
      ctx.quadraticCurveTo(12.5, -30, 12.8, -13);
      ctx.closePath();
      ctx.fillStyle = grd;
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.strokeStyle = C.accent;   // 暗金帽带
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-12.2, -16.4);
      ctx.lineTo(12.4, -16.4);
      ctx.stroke();
      ctx.restore();
    },

    front: function (ctx, g, f, C, T) {
      const p = g.handF;
      // 怀表（银壳 + 刻度 + 短链）—— 身份小动作：蓄力时抬到胸口
      const lifting = f.aPhase === 'windup' || f.aPhase === 'in' || f.aPhase === 'strike';
      const wob = Math.sin(T * 3.2) * (lifting ? 1.4 : 2.6);
      const wx = p.x + 7 + wob;
      const wy = p.y + (lifting ? -4 : 9) + Math.cos(T * 3.2) * 1.2;
      ctx.strokeStyle = KIT.rgba(C.accent, 0.9);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.quadraticCurveTo(p.x + 3, p.y + 6, wx, wy - 5);
      ctx.stroke();
      emblem(ctx, wx, wy, 6, '#dfe3ea', C);
      // 表盘
      KIT.circle(ctx, wx, wy, 4.2);
      ctx.fillStyle = '#f4f0e2';
      ctx.fill();
      ctx.strokeStyle = KIT.rgba(C.outline, 0.55);
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + T * 6;
        ctx.beginPath();
        ctx.moveTo(wx + Math.cos(a) * 1.2, wy + Math.sin(a) * 1.2);
        ctx.lineTo(wx + Math.cos(a) * 3.4, wy + Math.sin(a) * 3.4);
        ctx.stroke();
      }
      // 表冠
      KIT.roundRect(ctx, wx - 1.4, wy - 8.4, 2.8, 2.6, 1);
      ctx.fillStyle = C.accent;
      ctx.fill();
      if (f.aPhase === 'strike') {
        // 出手瞬间：表盖反光
        ctx.strokeStyle = KIT.rgba(C.glow, 0.8);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(wx, wy, 11, -0.9, 0.5);
        ctx.stroke();
      }
    },
  });

  /* ------------------------------------------------------------
   *  仙人杨子一：宽袖道袍 + 长须 + 拂尘垂地
   *  肩线下塌（宽袖），拂尘是"第二剪影"：从右手垂到地面
   * ------------------------------------------------------------ */
  register('immortal', {
    mood: 'calm',
    foot: 'shoe',
    sleeve: true,
    fabric: function (C) { return C.main; },   // 靛青道袍

    ground: function (ctx, g, f, C, T) {
      // 脚下云气（两层扁椭圆，缓慢呼吸）
      ctx.save();
      const br = 0.5 + Math.sin(T * 1.6) * 0.14;
      ctx.globalAlpha *= br * 0.5;
      ctx.fillStyle = KIT.rgba(C.accent, 0.5);
      KIT.ell(ctx, 0, -6, 44, 9);
      ctx.fill();
      KIT.ell(ctx, -14, -14, 26, 6);
      ctx.fill();
      ctx.restore();
    },

    back: function (ctx, g, f, C, T) {
      const sw = Math.sin(T * 1.9) * 4;
      // 极宽的背袖：从肩膀垂到胯下（道袍的"下塌"剪影）
      KIT.hangingSleeve(ctx, g.elbowB, g.shB, C, shade(C.main, -26), 44, 30, sw * 0.6);
      // 后摆（一层深色布，让侧面有"道袍很宽"的体积）
      const x0 = KIT.at(g, 0.2, -16);
      panel(ctx, [
        x0,
        { x: x0.x - 14 - sw * 0.6, y: x0.y + 40 },
        { x: x0.x - 4 - sw * 0.4, y: x0.y + 56 },
        { x: x0.x + 6, y: x0.y + 44 },
      ], shade(C.main, -22), C, 2.8);
    },

    hem: function (ctx, g, f, C, T) {
      // 道袍下摆：A 字外张 + 杏黄滚边
      const sw = Math.sin(T * 1.7) * 3;
      const fr = KIT.at(g, 0.16, 15);
      const bk = KIT.at(g, 0.16, -15);
      panel(ctx, [
        fr,
        { x: fr.x + 14 + sw, y: fr.y + 46 },
        { x: fr.x + 4, y: fr.y + 58 },
        { x: fr.x - 16, y: fr.y + 54 },
        { x: bk.x - 6 - sw, y: bk.y + 44 },
      ], C.main, C, 3);
      // 滚边（trim）
      ctx.strokeStyle = C.trim;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(fr.x + 14 + sw, fr.y + 46);
      ctx.quadraticCurveTo(fr.x + 2, fr.y + 52, fr.x - 14, fr.y + 52);
      ctx.stroke();
      // 竖向褶
      ctx.strokeStyle = KIT.rgba(shade(C.main, -40), 0.7);
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(fr.x - 6 + i * 6, fr.y + 8);
        ctx.lineTo(fr.x - 12 + i * 8, fr.y + 50);
        ctx.stroke();
      }
    },

    legFront: function (ctx, g, f, C, T) {
      // 道袍前摆盖住前腿（不然小腿会从下摆里穿出来）
      const sw = Math.sin(T * 1.7) * 2;
      const hipF = KIT.at(g, 0.18, 13);
      panel(ctx, [
        hipF,
        { x: hipF.x + 16 + sw, y: -18 },
        { x: hipF.x + 1 + sw, y: -10 },
        { x: hipF.x - 7, y: -30 },
      ], shade(C.main, 12), C, 2.8);
    },

    torso: function (ctx, g, f, C, T) {
      // 交领右衽：一片压一片的两片斜襟（杏黄滚边做成窄布条，不是描边）
      const n1 = KIT.at(g, 1.02, 11);
      const n2 = KIT.at(g, 1.02, -9);
      const w1 = KIT.at(g, 0.24, 13);
      const w2 = KIT.at(g, 0.24, -13);
      // 下层襟（后）
      panel(ctx, [n2, KIT.at(g, 1.02, 2), { x: w1.x - 4, y: w1.y + 2 }, w2], shade(C.main, -6), C, 2.6);
      // 上层襟（前）：从右肩斜压到左腰
      panel(ctx, [n1, { x: n1.x - 12, y: n1.y + 3 }, { x: w1.x - 2, y: w1.y - 3 }, { x: w1.x + 6, y: w1.y + 4 }], shade(C.main, 16), C, 2.8);
      // 滚边（trim）：沿上层襟的斜边贴一条窄带
      panel(ctx, [
        { x: n1.x - 1, y: n1.y + 1 },
        { x: n1.x - 5, y: n1.y + 2 },
        { x: w1.x - 4, y: w1.y - 1 },
        { x: w1.x - 1, y: w1.y - 2 },
      ], C.trim, null, 0);
      // 腰封（深靛）+ 玉扣
      const s1 = KIT.at(g, 0.2, 15);
      const s2 = KIT.at(g, 0.2, -15);
      KIT.ribbon(ctx, s1, s2, 8, shade(C.main, -24), C, 2);
      emblem(ctx, KIT.at(g, 0.2, 8).x, KIT.at(g, 0.2, 8).y, 3.2, C.accent, C);
      // 腰封垂带（accent 细带，随呼吸轻摆）
      const s3 = KIT.at(g, 0.14, 10);
      panel(ctx, [
        s3,
        { x: s3.x + 3.4, y: s3.y + 2 },
        { x: s3.x + 2 + Math.sin(T * 1.8) * 2, y: s3.y + 30 },
        { x: s3.x - 1.4 + Math.sin(T * 1.8) * 2, y: s3.y + 28 },
      ], shade(C.accent, -24), C, 1.4);
    },

    head: function (ctx, g, f, C, T) {
      KIT.drawHeadBase(ctx, g, f, C, T, { mood: 'calm' });
      ctx.save();
      ctx.translate(g.head.x, g.head.y);
      ctx.rotate(g.headAng);
      // 发髻（贴着头顶，不悬空）
      ctx.beginPath();
      ctx.moveTo(-10.5, -8);
      ctx.quadraticCurveTo(-9, -20, 1, -21);
      ctx.quadraticCurveTo(11, -20, 11.5, -7);
      ctx.lineTo(5, -10);
      ctx.lineTo(-5, -10);
      ctx.closePath();
      ctx.fillStyle = shade(C.hair, 6);
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 2;
      ctx.stroke();
      // 道髻（头顶小圆髻）+ 木簪（斜穿髻心，两端露出）
      KIT.circle(ctx, 1, -21.6, 4.2);
      ctx.fillStyle = C.hair;
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.save();
      ctx.translate(1, -21.6);
      ctx.rotate(-0.34);
      KIT.roundRect(ctx, -7.6, -1.3, 15.2, 2.6, 1.3);
      ctx.fillStyle = C.trim;
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.restore();
      // 长须：一束窄的银白，从下巴垂到胸口（不是一块围兜）
      const sway = Math.sin(T * 1.4) * 1.6;
      panel(ctx, [
        { x: -3.6, y: 9.5 },
        { x: 4.6, y: 10 },
        { x: 3.0 + sway, y: 28 },
        { x: 0.4 + sway, y: 32 },
        { x: -2.0 + sway, y: 26 },
      ], shade(C.trim, 52), C, 1.6);
      // 两撇细须
      ctx.strokeStyle = shade(C.trim, 30);
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(4.4, 9.4);
      ctx.quadraticCurveTo(8.6, 14, 7.4 + sway, 20);
      ctx.moveTo(-3.6, 9.6);
      ctx.quadraticCurveTo(-7.4, 14, -6 + sway, 19);
      ctx.stroke();
      // 白眉
      ctx.strokeStyle = KIT.rgba(shade(C.trim, 40), 0.95);
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(0.2, -5.2);
      ctx.quadraticCurveTo(4, -8.2, 8.4, -6.2);
      ctx.moveTo(-8.4, -6.4);
      ctx.quadraticCurveTo(-4, -8.4, -1, -5.8);
      ctx.stroke();
      ctx.restore();
    },

    front: function (ctx, g, f, C, T) {
      const p = g.handF;
      // 拂尘：短柄 + 一小把下垂的丝（扇面张开 ~50°，绝不画成"扫帚"）
      const striking = f.aPhase === 'strike';
      const sway = Math.sin(T * 2.2) * 5 + (striking ? 10 : 0);
      const hx = p.x + 3;
      const hy = p.y - 4;
      // 柄
      KIT.roundRect(ctx, hx - 1.6, hy - 2, 3.2, 12, 1.4);
      ctx.fillStyle = shade(C.sub, 12);
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      // 丝束：7 根渐短的曲线，越外侧越淡
      for (let i = 0; i < 7; i++) {
        const o = (i - 3) / 3;                       // -1 ~ 1
        const len = 30 - Math.abs(o) * 8;
        const ex = hx + o * 11 + sway * 0.5;
        const ey = hy + 10 + len;
        ctx.strokeStyle = KIT.rgba(shade(C.trim, 26), 0.9 - Math.abs(o) * 0.3);
        ctx.lineWidth = 1.6 - Math.abs(o) * 0.5;
        ctx.beginPath();
        ctx.moveTo(hx + o * 1.6, hy + 10);
        ctx.quadraticCurveTo(hx + o * 7 + sway * 0.3, hy + 10 + len * 0.55, ex, ey);
        ctx.stroke();
      }
      // 出手：三只青蝶飞出（accent 蝶影，各自不同相位）
      if (striking || f.aPhase === 'recover') {
        const born = striking ? clamp01((f.aK || 0) / 0.6) : 1;
        for (let i = 0; i < 3; i++) {
          const ph = i * 0.9;
          const bx = p.x + 26 + i * 22 + Math.sin(T * 3 + ph) * 6 + born * 34;
          const by = p.y - 26 - i * 16 + Math.cos(T * 4 + ph) * 5;
          const flap = 0.55 + Math.abs(Math.sin(T * 12 + ph)) * 0.45;
          const a = (striking ? 1 - born * 0.55 : 0.45) * (1 - i * 0.12);
          ctx.save();
          ctx.globalAlpha *= a;
          KIT.ell(ctx, bx - 4, by, 5.4 * flap, 4.2, -0.5);
          ctx.fillStyle = KIT.rgba(C.accent, 0.9);
          ctx.fill();
          KIT.ell(ctx, bx + 4, by, 5.4 * flap, 4.2, 0.5);
          ctx.fill();
          ctx.strokeStyle = KIT.rgba(C.outline, 0.5);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(bx, by - 3);
          ctx.lineTo(bx, by + 3);
          ctx.stroke();
          ctx.restore();
        }
      }
    },
  });

  /* ------------------------------------------------------------
   *  黑道孙啸晨：敞怀花衬衫 + 背头 + 金链 + 西装搭左肩
   *  躯干 = 血红旗袍衬衫（C.accent），西装（C.main）挂在左肩、垂在身后
   * ------------------------------------------------------------ */
  register('yakuza', {
    mood: 'angry',
    foot: 'shoe',
    sleeve: false,
    // 注意：fabric 会同时影响裤子/上臂（drawBody 里 C.main 被整体替换），
    // 所以这里保持西装色（裤子=西装裤），血红的衬衫在 torso 钩子里铺上去。
    fabric: function (C) { return shade(C.main, 6); },

    back: function (ctx, g, f, C, T) {
      const sw = Math.sin(T * 2.3) * 3;
      // 西装后摆（搭在身后，两片）
      for (let i = 0; i < 2; i++) {
        const x0 = KIT.at(g, 0.18, -13 + i * 5);
        panel(ctx, [
          x0,
          { x: x0.x - 13 - i * 5 - sw, y: x0.y + 36 + i * 6 },
          { x: x0.x - 5 - i * 4 - sw, y: x0.y + 56 + i * 6 },
          { x: x0.x + 7, y: x0.y + 44 },
        ], shade(C.main, -4 + i * 8), C, 2.8);
      }
      // 后腰的衬衫下摆（红）
      panel(ctx, [
        KIT.at(g, 0.1, -12), KIT.at(g, 0.1, -2),
        { x: KIT.at(g, 0.1, -2).x - 2, y: KIT.at(g, 0.1, -2).y + 20 },
        { x: KIT.at(g, 0.1, -12).x - 4, y: KIT.at(g, 0.1, -12).y + 18 },
      ], shade(C.accent, -22), C, 2.2);
    },

    // 挽起的袖口（前臂裸露由 drawBody 的 sleeve:false 负责）
    arm: function (ctx, g, f, C, T) {
      const ang = Math.atan2(g.elbowB.y - g.shB.y, g.elbowB.x - g.shB.x);
      const c = KIT.pt(g.elbowB, ang + Math.PI, 2);
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(ang - Math.PI / 2);
      KIT.roundRect(ctx, -7.2, -5, 14.4, 10, 3);
      ctx.fillStyle = shade(C.main, 40);
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    },

    torso: function (ctx, g, f, C, T) {
      // ① 血红衬衫铺满躯干（躯干基底是西装色，这里整片盖掉）
      panel(ctx, [
        KIT.at(g, 1.0, 12), KIT.at(g, 0.16, 15),
        KIT.at(g, 0.16, -15), KIT.at(g, 1.0, -11),
      ], shade(C.accent, -14), C, 2.6);
      // ② 敞怀：胸口一片皮肤（V 字三角）
      const nk = KIT.at(g, 1.0, 2);
      panel(ctx, [
        { x: nk.x + 8, y: nk.y },
        { x: nk.x - 8, y: nk.y - 2 },
        { x: nk.x - 2, y: nk.y + 26 },
        { x: nk.x + 4, y: nk.y + 22 },
      ], C.skin, C, 1.6);
      // 胸肌分线
      ctx.strokeStyle = KIT.rgba(shade(C.skin, -60), 0.55);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(nk.x - 1, nk.y + 4);
      ctx.lineTo(nk.x - 1, nk.y + 20);
      ctx.stroke();
      // ③ 西装两片前襟（敞怀，压在衬衫上；领口外翻）
      panel(ctx, [
        KIT.at(g, 1.02, 14), KIT.at(g, 0.66, 20),
        KIT.at(g, 0.2, 15), KIT.at(g, 0.2, 7), KIT.at(g, 0.72, 8),
      ], shade(C.main, 12), C, 2.8);
      panel(ctx, [
        KIT.at(g, 1.02, -13), KIT.at(g, 0.66, -20),
        KIT.at(g, 0.2, -15), KIT.at(g, 0.2, -7), KIT.at(g, 0.72, -8),
      ], shade(C.main, -6), C, 2.8);
      // 西装驳领（小三角，外翻到胸口）
      const lp = KIT.at(g, 0.92, 12);
      panel(ctx, [{ x: lp.x, y: lp.y - 6 }, { x: lp.x + 9, y: lp.y + 2 }, { x: lp.x + 2, y: lp.y + 12 }],
        shade(C.main, 34), C, 2.2);
      const rp = KIT.at(g, 0.92, -10);
      panel(ctx, [{ x: rp.x, y: rp.y - 6 }, { x: rp.x - 8, y: rp.y + 3 }, { x: rp.x - 1, y: rp.y + 12 }],
        shade(C.main, 18), C, 2.2);
      // ④ 金链（两段 ribbon，从双肩挂到胸骨）+ 金牌
      const c0 = KIT.at(g, 0.98, 9);
      const c1 = KIT.at(g, 0.98, -8);
      const cm = KIT.at(g, 0.74, 0);
      KIT.ribbon(ctx, c0, cm, 2.6, C.trim, C, 1.1);
      KIT.ribbon(ctx, cm, c1, 2.6, C.trim, C, 1.1);
      emblem(ctx, cm.x, cm.y, 3.2, shade(C.trim, -20), C);
      // ⑤ 碎花（小点，只在衬衫两襟上）
      ctx.fillStyle = KIT.rgba(C.trim, 0.8);
      for (let i = 0; i < 5; i++) {
        const p = KIT.at(g, 0.9 - i * 0.1, i % 2 ? 11 : -9);
        KIT.circle(ctx, p.x, p.y, 1.3);
        ctx.fill();
      }
      // ⑥ 腰带（黑）+ 金扣
      const w1 = KIT.at(g, 0.18, 14);
      const w2 = KIT.at(g, 0.18, -14);
      KIT.ribbon(ctx, w1, w2, 6, shade(C.main, -10), C, 1.6);
      emblem(ctx, w1.x - 2, w1.y, 3.2, C.trim, C);
    },

    head: function (ctx, g, f, C, T) {
      KIT.drawHeadBase(ctx, g, f, C, T, { mood: 'angry' });
      ctx.save();
      ctx.translate(g.head.x, g.head.y);
      ctx.rotate(g.headAng);
      // 背头：向后梳的一整片，后颈留一个小尖（发油反光）
      ctx.beginPath();
      ctx.moveTo(-12.5, -4);
      ctx.quadraticCurveTo(-14, -18, 1, -19.5);
      ctx.quadraticCurveTo(12, -19, 13, -6);
      ctx.quadraticCurveTo(6, -11, -1, -10.5);
      ctx.quadraticCurveTo(-8, -10, -12.5, -4);
      ctx.closePath();
      ctx.fillStyle = shade(C.hair, 12);
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 2;
      ctx.stroke();
      // 梳齿反光
      ctx.strokeStyle = KIT.rgba('#ffffff', 0.28);
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-8 + i * 5, -16 + i * 1.4);
        ctx.lineTo(6 + i * 2, -14 + i * 1.6);
        ctx.stroke();
      }
      // 耳后鬓角
      ctx.beginPath();
      ctx.moveTo(-11, -3);
      ctx.lineTo(-9.5, 6);
      ctx.lineTo(-7, 2);
      ctx.closePath();
      ctx.fillStyle = C.hair;
      ctx.fill();
      ctx.restore();
    },

    front: function (ctx, g, f, C, T) {
      // 前手臂的挽袖口
      const ang = Math.atan2(g.elbowF.y - g.shF.y, g.elbowF.x - g.shF.x);
      const c = KIT.pt(g.elbowF, ang + Math.PI, 2);
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(ang - Math.PI / 2);
      KIT.roundRect(ctx, -7.4, -5, 14.8, 10, 3);
      ctx.fillStyle = shade(C.main, 46);
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      // 金戒指 / 指虎
      emblem(ctx, g.handF.x, g.handF.y - 1, 2.4, C.trim, C);
      // 西装外套搭在左肩（= 后肩 shB）：一块不规则的大布垂下来，随呼吸轻摆
      const sw = Math.sin(T * 1.7) * 2.4;
      const top = { x: g.shB.x - 4, y: g.shB.y - 12 };
      panel(ctx, [
        top,
        { x: top.x - 7 + sw, y: top.y + 22 },
        { x: top.x - 4 + sw, y: top.y + 52 },
        { x: top.x + 9 + sw * 0.6, y: top.y + 44 },
        { x: top.x + 12, y: top.y + 8 },
      ], shade(C.main, 44), C, 3);
      // 西装翻领（小三角，让"搭肩"认得出是上衣）
      panel(ctx, [
        { x: top.x + 1, y: top.y + 3 },
        { x: top.x - 6, y: top.y + 18 },
        { x: top.x + 5, y: top.y + 22 },
      ], shade(C.main, 68), C, 2.2);
      // 肩线高光
      ctx.strokeStyle = KIT.rgba('#ffffff', 0.16);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(top.x - 1, top.y + 4);
      ctx.lineTo(top.x + 9, top.y + 2);
      ctx.stroke();
    },
  });

  /* ------------------------------------------------------------
   *  肌霸郭亚祥：背心 + 巨肩三角肌 + 粗前臂 + 护腕
   *  胸廓外扩：躯干钩子里用肤色铺胸、背心只留两侧竖条
   * ------------------------------------------------------------ */
  register('muscle', {
    mood: 'angry',
    foot: 'shoe',
    sleeve: false,
    fabric: function (C) { return shade(C.main, -12); },   // 背心/裤同色系（深一档，避免整身糊成一片橙）

    ground: function (ctx, g, f, C, T) {
      // 肩撞落地的尘环：只在 strike 相位的后 2/3 出现（与命中同帧起）
      if (f.aPhase !== 'strike' && f.aPhase !== 'recover') return;
      const k = f.aPhase === 'strike' ? clamp01((f.aK || 0) * 1.15) : 1;
      if (k < 0.12) return;
      const u = clamp01((k - 0.12) / 0.88);
      ctx.save();
      ctx.globalAlpha *= (1 - u) * 0.5;
      ctx.fillStyle = KIT.rgba(C.trim, 0.9);
      KIT.ell(ctx, -6, -5, 40 + u * 78, 8 + u * 15);
      ctx.fill();
      ctx.globalAlpha *= 0.7;
      KIT.ell(ctx, 12, -3, 22 + u * 52, 5 + u * 9);
      ctx.fill();
      ctx.restore();
    },

    back: function (ctx, g, f, C, T) {
      // 背心后片 + 背部肌肉的沟
      const x0 = KIT.at(g, 0.9, -12);
      panel(ctx, [
        x0,
        { x: x0.x - 6, y: x0.y + 26 },
        KIT.at(g, 0.16, -13),
        KIT.at(g, 0.8, -4),
      ], shade(C.main, -18), C, 2.6);
      // 后三角肌（比常人大一圈，压住肩关节）
      KIT.circle(ctx, g.shB.x, g.shB.y, 13);
      ctx.fillStyle = shade(C.skin, -30);
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 2.8;
      ctx.stroke();
    },

    // 无袖背心：上臂整段是皮肤（drawArm 的上臂用的是布料色，这里重涂掉）
    arm: function (ctx, g, f, C, T) {
      limb(ctx, [g.shB, g.elbowB], [8.4, 6.6], shade(C.skin, -24), C, 2.8);
    },

    torso: function (ctx, g, f, C, T) {
      // ① 先铺一整片胸廓（皮肤，比默认躯干宽 6px）
      const c0 = KIT.at(g, 1.0, 0);
      panel(ctx, [
        { x: c0.x - 17, y: c0.y + 2 },
        { x: c0.x + 17, y: c0.y + 1 },
        KIT.at(g, 0.3, 15), KIT.at(g, 0.3, -15),
      ], C.skin, null, 0);
      // ② 斜方肌（脖子两侧的厚块）
      panel(ctx, [
        { x: c0.x - 3, y: c0.y - 8 },
        KIT.at(g, 0.86, 16), { x: c0.x + 12, y: c0.y + 4 },
      ], shade(C.skin, 12), null, 0);
      panel(ctx, [
        { x: c0.x - 3, y: c0.y - 8 },
        KIT.at(g, 0.86, -17), { x: c0.x - 13, y: c0.y + 4 },
      ], shade(C.skin, -4), null, 0);
      // ③ 胸肌（两块椭圆）+ 中缝
      KIT.ell(ctx, KIT.at(g, 0.78, 8).x, KIT.at(g, 0.78, 8).y, 9.5, 7.5, -0.2);
      ctx.fillStyle = shade(C.skin, 8);
      ctx.fill();
      KIT.ell(ctx, KIT.at(g, 0.78, -7).x, KIT.at(g, 0.78, -7).y, 9, 7, 0.2);
      ctx.fillStyle = shade(C.skin, -12);
      ctx.fill();
      ctx.strokeStyle = KIT.rgba(shade(C.skin, -70), 0.5);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(c0.x, c0.y + 16);
      ctx.lineTo(c0.x - 1, c0.y + 34);
      ctx.stroke();
      // ④ 背心整片（accent 亮橙）+ ⑤ 领口露出胸口（皮肤 V 压在上面）
      panel(ctx, [
        KIT.at(g, 1.02, 15), KIT.at(g, 0.16, 16),
        KIT.at(g, 0.16, -16), KIT.at(g, 1.02, -15),
      ], C.accent, C, 2.8);
      // 背心的深色侧缝（把背心从"橙色块"变成"有剪裁的背心"）
      panel(ctx, [
        KIT.at(g, 1.0, 16), KIT.at(g, 0.16, 17),
        KIT.at(g, 0.16, 12), KIT.at(g, 1.0, 11),
      ], shade(C.accent, -46), null, 0);
      panel(ctx, [
        KIT.at(g, 1.0, -11), KIT.at(g, 0.16, -12),
        KIT.at(g, 0.16, -17), KIT.at(g, 1.0, -16),
      ], shade(C.accent, -60), null, 0);
      // 深 V 领口：胸肌露出来
      panel(ctx, [
        { x: c0.x - 9, y: c0.y + 2 },
        { x: c0.x + 10, y: c0.y + 1 },
        { x: c0.x + 4, y: c0.y + 26 },
        { x: c0.x - 4, y: c0.y + 24 },
      ], shade(C.skin, 6), C, 1.8);
      // 背心肩带（从领口翻出来的两条 accent 带）
      KIT.ribbon(ctx, KIT.at(g, 1.0, 12), KIT.at(g, 0.9, 15), 3.4, C.accent, C, 1.4);
      KIT.ribbon(ctx, KIT.at(g, 1.0, -10), KIT.at(g, 0.9, -13), 3.4, shade(C.accent, -30), C, 1.4);
      // ⑥ 前三角肌（超大，压在背心肩带上）
      KIT.circle(ctx, g.shF.x + 1, g.shF.y + 1, 14);
      ctx.fillStyle = C.skin;
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 2.8;
      ctx.stroke();
      // 三角肌分束
      ctx.strokeStyle = KIT.rgba(shade(C.skin, -64), 0.45);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(g.shF.x + 1, g.shF.y + 1, 9, 0.5, 1.9);
      ctx.stroke();
    },

    head: function (ctx, g, f, C, T) {
      KIT.drawHeadBase(ctx, g, f, C, T, { mood: 'angry' });
      ctx.save();
      ctx.translate(g.head.x, g.head.y);
      ctx.rotate(g.headAng);
      // 寸头：贴着头骨的一层短发
      ctx.beginPath();
      ctx.moveTo(-11, -3);
      ctx.quadraticCurveTo(-12, -16, 1, -17.5);
      ctx.quadraticCurveTo(11.5, -17, 12.5, -5);
      ctx.quadraticCurveTo(2, -12, -11, -3);
      ctx.closePath();
      ctx.fillStyle = shade(C.hair, 16);
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 2;
      ctx.stroke();
      // 咬牙（嘴角一道斜线）
      ctx.strokeStyle = KIT.rgba('#ffffff', 0.55);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(4.6, 9.2);
      ctx.lineTo(9.6, 8.4);
      ctx.stroke();
      ctx.restore();
    },

    front: function (ctx, g, f, C, T) {
      // 无袖：前臂上段重涂成皮肤
      limb(ctx, [g.shF, g.elbowF], [8.6, 6.8], C.skin, C, 2.8);
      // 粗前臂：在肤色前臂上再叠一块肌肉（不修骨骼，只加体积）
      const p = g.handF;
      const el = g.elbowF;
      const mid = { x: (p.x + el.x) / 2, y: (p.y + el.y) / 2 };
      KIT.ell(ctx, mid.x, mid.y, 7.4, 6.4, Math.atan2(p.y - el.y, p.x - el.x));
      ctx.fillStyle = shade(C.skin, 6);
      ctx.fill();
      ctx.strokeStyle = KIT.rgba(C.outline, 0.55);
      ctx.lineWidth = 1.6;
      ctx.stroke();
      // 护腕：沿前臂方向的一块厚布（accent 亮橙）
      const ang = Math.atan2(p.y - el.y, p.x - el.x);
      const wp = { x: p.x - Math.cos(ang) * 7, y: p.y - Math.sin(ang) * 7 };
      ctx.save();
      ctx.translate(wp.x, wp.y);
      ctx.rotate(ang - Math.PI / 2);
      KIT.roundRect(ctx, -7.6, -8, 15.2, 16, 4);
      ctx.fillStyle = shade(C.accent, -6);
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.strokeStyle = KIT.rgba(C.trim, 0.75);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-7, 2);
      ctx.lineTo(7, 2);
      ctx.stroke();
      ctx.restore();
    },
  });

  /* ------------------------------------------------------------
   *  探险肖牧辰：短夹克 + 布质阔边帽 + 斜跨绳 + 腰包
   * ------------------------------------------------------------ */
  register('explorer', {
    mood: 'focus',
    foot: 'shoe',
    sleeve: false,
    fabric: function (C) { return shade(C.main, 12); },

    ground: function (ctx, g, f, C, T) {
      // 绳索拖痕：出手时地面上的一道浅色弧
      if (f.aPhase !== 'strike' && f.aPhase !== 'recover') return;
      const k = f.aPhase === 'strike' ? clamp01((f.aK || 0) * 1.2) : 1;
      ctx.save();
      ctx.globalAlpha *= (1 - k * 0.75) * 0.45;
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(10, -6);
      ctx.quadraticCurveTo(46, -2, 96, -8);
      ctx.stroke();
      ctx.restore();
    },

    back: function (ctx, g, f, C, T) {
      // 短夹克后摆（只到胯）
      const sw = Math.sin(T * 2.2) * 2.6;
      const x0 = KIT.at(g, 0.2, -13);
      panel(ctx, [
        x0,
        { x: x0.x - 10 - sw, y: x0.y + 26 },
        { x: x0.x + 2 - sw, y: x0.y + 32 },
        { x: x0.x + 9, y: x0.y + 22 },
      ], shade(C.main, -14), C, 2.6);
      // 背包带（从后肩斜下来）
      KIT.ribbon(ctx, KIT.at(g, 0.94, -12), KIT.at(g, 0.3, -10), 3.4, shade(C.sub, 10), C, 1.4);
    },

    torso: function (ctx, g, f, C, T) {
      // 敞开短夹克：中间一件浅色内搭 + 两片外翻的夹克襟
      const nk = KIT.at(g, 1.0, 2);
      panel(ctx, [
        { x: nk.x - 9, y: nk.y - 4 },
        { x: nk.x + 9, y: nk.y - 5 },
        { x: nk.x + 6, y: nk.y + 28 },
        { x: nk.x - 7, y: nk.y + 27 },
      ], shade(C.trim, -20), null, 0);
      // 内搭的领口 + 纽扣
      ctx.fillStyle = KIT.rgba(shade(C.sub, 30), 0.9);
      for (let i = 0; i < 3; i++) {
        KIT.circle(ctx, nk.x + 1, nk.y + 8 + i * 8, 1.2);
        ctx.fill();
      }
      // 夹克两片襟
      panel(ctx, [
        KIT.at(g, 1.0, 13), KIT.at(g, 0.66, 17),
        KIT.at(g, 0.24, 12), KIT.at(g, 0.3, 6),
      ], shade(C.main, 8), C, 2.8);
      panel(ctx, [
        KIT.at(g, 1.0, -11), KIT.at(g, 0.66, -16),
        KIT.at(g, 0.24, -12), KIT.at(g, 0.3, -6),
      ], shade(C.main, -8), C, 2.8);
      // 斜跨绳（accent 嫩绿）：从左肩到右髋
      KIT.ribbon(ctx, KIT.at(g, 0.98, 10), KIT.at(g, 0.2, -12), 3.8, C.accent, C, 1.6);
      // 腰包（trim 米）+ 腰带
      const w1 = KIT.at(g, 0.18, 13);
      const w2 = KIT.at(g, 0.18, -13);
      KIT.ribbon(ctx, w1, w2, 4.6, shade(C.sub, 4), C, 1.4);
      ctx.save();
      ctx.translate(KIT.at(g, 0.12, 13).x, KIT.at(g, 0.12, 13).y);
      ctx.rotate(0.16);
      KIT.roundRect(ctx, -6.5, -1, 13, 12, 3);
      ctx.fillStyle = shade(C.trim, -8);
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.restore();
      // 右髋绳圈（三圈 accent 细环）
      const rc = KIT.at(g, 0.16, -13);
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 1.8;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(rc.x - 1, rc.y + 4 + i * 2.6, 7.5, 3.2, -0.2, 0, Math.PI * 2);
        ctx.stroke();
      }
    },

    head: function (ctx, g, f, C, T) {
      KIT.drawHeadBase(ctx, g, f, C, T, { mood: 'focus' });
      ctx.save();
      ctx.translate(g.head.x, g.head.y);
      ctx.rotate(g.headAng);
      // 阔边布帽：两片扁平椭圆（前檐更深）+ 帽冠
      KIT.ell(ctx, 2, -13, 23, 6, -0.1);
      ctx.fillStyle = shade(C.main, -8);
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 2.4;
      ctx.stroke();
      KIT.ell(ctx, 2, -14.6, 20, 4.4, -0.1);
      ctx.fillStyle = shade(C.main, 16);
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      // 帽冠（软塌，顶端前倾）
      ctx.beginPath();
      ctx.moveTo(-11, -14);
      ctx.quadraticCurveTo(-10, -28, 2, -28.5);
      ctx.quadraticCurveTo(12, -27, 12.5, -14);
      ctx.closePath();
      ctx.fillStyle = shade(C.main, 4);
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 2.4;
      ctx.stroke();
      // 帽带（accent）
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.moveTo(-10.6, -17);
      ctx.lineTo(12.2, -17);
      ctx.stroke();
      // 露出的鬓发
      ctx.fillStyle = shade(C.hair, 8);
      ctx.beginPath();
      ctx.moveTo(-12, -4);
      ctx.quadraticCurveTo(-13.5, 6, -10, 10);
      ctx.lineTo(-7.6, 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    },

    front: function (ctx, g, f, C, T) {
      const p = g.handF;
      // 手上的绳圈（三圈）
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 1.8;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(p.x + 1, p.y + 4 + i * 2.4, 6.4, 2.8, 0.1, 0, Math.PI * 2);
        ctx.stroke();
      }
      // 出手：抛出的三段折线绳索（taperPath + 末端钩爪）
      if (f.aPhase === 'strike' || f.aPhase === 'recover') {
        const k = f.aPhase === 'strike' ? clamp01((f.aK || 0) / 0.55) : 1;
        const endX = lerp2(p.x + 8, p.x + 150, easeOut(k));
        const endY = lerp2(p.y + 6, p.y + 26, easeOut(k));
        const mid1 = { x: p.x + (endX - p.x) * 0.36, y: p.y - 18 + Math.sin(T * 8) * 3 };
        const mid2 = { x: p.x + (endX - p.x) * 0.7, y: p.y + 4 + Math.cos(T * 9) * 4 };
        ctx.save();
        ctx.globalAlpha *= 0.55 + k * 0.45;
        limb(ctx, [p, mid1, mid2, { x: endX, y: endY }], [2.2, 2.8, 2.4, 1.6], C.accent, C, 1.6);
        // 钩爪
        ctx.strokeStyle = shade(C.trim, -10);
        ctx.lineWidth = 2.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX + 7, endY - 6);
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX + 8, endY + 3);
        ctx.stroke();
        ctx.restore();
      }
    },
  });

  /* ------------------------------------------------------------
   *  法师陆景西：白蓝星纹 A 字长袍 + 高领 + 肩浮三星
   *  palette.main 是深蓝 —— "冷白袍"由 C.trim（e0d8ff）派生，星纹用 C.accent
   * ------------------------------------------------------------ */
  register('mage', {
    mood: 'calm',
    foot: 'shoe',
    sleeve: true,
    fabric: function (C) { return shade(C.trim, -20); },   // 冷白（由 trim 派生）

    ground: function (ctx, g, f, C, T) {
      // 脚下星环（很淡，只是站位提示）
      ctx.save();
      ctx.globalAlpha *= 0.28 + Math.sin(T * 2) * 0.06;
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 1.6;
      KIT.ell(ctx, 0, -5, 36, 9);
      ctx.stroke();
      ctx.restore();
    },

    back: function (ctx, g, f, C, T) {
      const sw = Math.sin(T * 1.8) * 3;
      // 后摆（长袍拖得比前摆更远）
      const x0 = KIT.at(g, 0.18, -14);
      panel(ctx, [
        x0,
        { x: x0.x - 18 - sw, y: x0.y + 46 },
        { x: x0.x - 8 - sw, y: x0.y + 64 },
        { x: x0.x + 8, y: x0.y + 50 },
      ], shade(C.trim, -34), C, 2.8);
      // 后袖
      KIT.hangingSleeve(ctx, g.elbowB, g.shB, C, shade(C.trim, -30), 34, 22, sw * 0.5);
    },

    hem: function (ctx, g, f, C, T) {
      // A 字长袍：一整片裙到地面，滚边只留在底缘（避免多片互相打架）
      const sw = Math.sin(T * 1.9) * 3;
      const fr = KIT.at(g, 0.14, 15);
      const bk = KIT.at(g, 0.14, -15);
      panel(ctx, [
        fr,
        { x: fr.x + 21 + sw, y: -4 },
        { x: bk.x - 15 - sw, y: -4 },
        { x: bk.x - 5, y: -24 },
        { x: fr.x + 2, y: -26 },
      ], shade(C.trim, -24), C, 3);
      // 底缘滚边（trim 亮 + accent 细线）
      ctx.strokeStyle = C.trim;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(fr.x + 20 + sw, -6);
      ctx.quadraticCurveTo(fr.x + 2, -1, bk.x - 14 - sw, -6);
      ctx.stroke();
      ctx.strokeStyle = KIT.rgba(C.accent, 0.75);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(fr.x + 20 + sw, -10);
      ctx.quadraticCurveTo(fr.x + 2, -5, bk.x - 14 - sw, -10);
      ctx.stroke();
      // 竖褶（同色系深两档的窄布条）
      for (let i = 0; i < 3; i++) {
        const ox = -7 + i * 9;
        panel(ctx, [
          { x: fr.x + ox, y: fr.y + 8 },
          { x: fr.x + ox + 2.6, y: fr.y + 8 },
          { x: fr.x + ox + 6, y: -8 },
          { x: fr.x + ox + 3, y: -8 },
        ], shade(C.trim, -44), null, 0);
      }
    },

    legFront: function (ctx, g, f, C, T) {
      // 前摆盖住前腿：与 hem 同色、不描边 → 读成一整片裙
      const sw = Math.sin(T * 1.9) * 2;
      const hipF = KIT.at(g, 0.2, 12);
      KIT.cloth(ctx, [
        hipF,
        { x: hipF.x + 16 + sw, y: -3 },
        { x: hipF.x - 4 + sw, y: -3 },
        { x: hipF.x - 9, y: -22 },
      ], shade(C.trim, -24), null);
    },

    torso: function (ctx, g, f, C, T) {
      // 高领（竖起来的 trim 领）+ 竖向滚边 + 星纹
      const n1 = KIT.at(g, 1.0, 10);
      const n2 = KIT.at(g, 1.0, -9);
      panel(ctx, [
        { x: n1.x, y: n1.y + 2 }, { x: n2.x, y: n2.y + 2 },
        { x: n2.x - 2, y: n2.y - 12 }, { x: n1.x + 3, y: n1.y - 11 },
      ], shade(C.trim, -8), C, 2.4);
      // 前襟滚边（从领口到腰）
      KIT.ribbon(ctx, KIT.at(g, 1.0, 5), KIT.at(g, 0.2, 8), 3.2, C.trim, C, 1.2);
      // 肩胸的 A 字轮廓线
      KIT.ribbon(ctx, KIT.at(g, 0.98, 12), KIT.at(g, 0.7, 17), 2.4, shade(C.trim, -46), C, 1);
      // 星纹（accent 四芒，散在袍面上）
      const stars = [[0.86, -8, 3.2], [0.62, 9, 2.6], [0.44, -9, 2.2], [0.3, 6, 2.8]];
      for (let i = 0; i < stars.length; i++) {
        const p = KIT.at(g, stars[i][0], stars[i][1]);
        starShape(ctx, p.x, p.y, stars[i][2], KIT.rgba(C.accent, 0.85 - i * 0.1), null);
      }
      // 腰带（accent 细带 + 银蓝扣）
      const w1 = KIT.at(g, 0.2, 14);
      const w2 = KIT.at(g, 0.2, -14);
      KIT.ribbon(ctx, w1, w2, 5, shade(C.accent, -30), C, 1.4);
      emblem(ctx, w1.x - 2, w1.y, 2.8, C.trim, C);
    },

    head: function (ctx, g, f, C, T) {
      KIT.drawHeadBase(ctx, g, f, C, T, { mood: 'calm' });
      ctx.save();
      ctx.translate(g.head.x, g.head.y);
      ctx.rotate(g.headAng);
      // 裸头 + 后梳的中长发
      ctx.beginPath();
      ctx.moveTo(-11.5, -4);
      ctx.quadraticCurveTo(-13, -18, 1, -19);
      ctx.quadraticCurveTo(12.5, -18.5, 13, -5);
      ctx.quadraticCurveTo(4, -13, -11.5, -4);
      ctx.closePath();
      ctx.fillStyle = shade(C.hair, 10);
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 2;
      ctx.stroke();
      // 星冠：头顶三颗小星（自转）
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i - 1) * 0.62;
        const r = 19 + Math.sin(T * 2 + i) * 1.4;
        starShape(ctx, Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.8 - 2, 3.4 + i * 0.4,
          KIT.rgba(C.accent, 0.95), C);
      }
      ctx.restore();
    },

    front: function (ctx, g, f, C, T) {
      // 肩上三颗浮星（自转 + 呼吸浮动）
      const rise = f.aPhase === 'strike' ? 1 : 0;
      for (let i = 0; i < 3; i++) {
        const a = T * 1.6 + i * (Math.PI * 2 / 3);
        const cx = g.sh.x + Math.cos(a) * 26;
        const cy = g.sh.y - 12 + Math.sin(a) * 7 - rise * 12;
        const r = 3.4 + Math.sin(T * 3 + i) * 0.7;
        starShape(ctx, cx, cy, r, KIT.rgba(C.glow, 0.95), null);
        // 光晕
        ctx.save();
        ctx.globalAlpha *= 0.35;
        ctx.fillStyle = KIT.rgba(C.glow, 0.5);
        KIT.circle(ctx, cx, cy, r * 2.4);
        ctx.fill();
        ctx.restore();
      }
      // 掌心法光（出手时更亮）
      const p = g.handF;
      ctx.save();
      ctx.globalAlpha *= 0.45 + (f.aPhase === 'strike' ? 0.35 : 0) + Math.sin(T * 5) * 0.08;
      ctx.fillStyle = KIT.rgba(C.glow, 0.85);
      KIT.circle(ctx, p.x + 2, p.y - 2, 5.4);
      ctx.fill();
      ctx.restore();
    },
  });

  /* ------------------------------------------------------------
   *  囚徒刘鑫尧：橙条纹马甲 + 乱发 + 双侧镣铐 + 脚踝铁球拖地
   *  palette 里没有橙色 → 条纹由 C.skin（e3b895）派生，读作橙；
   *  金属件全部用 C.trim + 白高光（与"布料系"角色明显不同）
   * ------------------------------------------------------------ */
  register('prisoner', {
    mood: 'grim',
    foot: 'bare',
    sleeve: false,
    bareLegs: true,
    fabric: function (C) { return shade(C.main, 8); },

    ground: function (ctx, g, f, C, T) {
      // 铁球拖痕：身后地面上的一道深色刮痕 + 火星
      ctx.save();
      ctx.globalAlpha *= 0.4;
      ctx.strokeStyle = shade(C.sub, -12);
      ctx.lineWidth = 3.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-16, -5);
      ctx.lineTo(-52, -3);
      ctx.stroke();
      ctx.restore();
    },

    back: function (ctx, g, f, C, T) {
      const sw = Math.sin(T * 1.8) * 2;
      // 脚踝铁球（拖在身后地面）
      const ball = { x: -34 + sw, y: -9 };
      // 铁链：从后脚踝到铁球
      const ank = g.footB;
      const pts = [ank];
      for (let i = 1; i <= 3; i++) {
        pts.push({ x: lerp2(ank.x, ball.x, i / 3), y: lerp2(ank.y, ball.y, i / 3) + Math.sin(i * 1.6 + T * 3) * 3 });
      }
      limb(ctx, pts, [2.2, 2, 1.8, 1.6], shade(C.trim, -6), C, 1.4);
      // 铁球（生铁，深色 + 一道高光）
      ctx.fillStyle = shade(C.trim, -86);
      KIT.circle(ctx, ball.x, ball.y, 8);
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 2.4;
      ctx.stroke();
      // 金属高光（右下角一道弧）
      ctx.strokeStyle = KIT.rgba('#ffffff', 0.55);
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, 5.4, 1.9, 3.0);
      ctx.stroke();
    },

    torso: function (ctx, g, f, C, T) {
      // 囚服马甲：V 领 + 4 道横向橙条纹（由 skin 派生）
      const stripe = shade(C.skin, -18);
      const nk = KIT.at(g, 1.0, 2);
      // 内搭（深一档的蓝）
      panel(ctx, [
        { x: nk.x - 9, y: nk.y - 2 },
        { x: nk.x + 9, y: nk.y - 3 },
        { x: nk.x + 6, y: nk.y + 30 },
        { x: nk.x - 7, y: nk.y + 29 },
      ], shade(C.sub, 12), null, 0);
      // 马甲两片（留出中间的 V）
      panel(ctx, [
        KIT.at(g, 1.0, 13), KIT.at(g, 0.2, 15), KIT.at(g, 0.2, 5), KIT.at(g, 0.74, 6),
      ], C.main, C, 2.8);
      panel(ctx, [
        KIT.at(g, 1.0, -12), KIT.at(g, 0.2, -14), KIT.at(g, 0.2, -5), KIT.at(g, 0.74, -6),
      ], shade(C.main, -14), C, 2.8);
      // 橙条纹（沿躯干剖面横切，只在马甲上）
      ctx.save();
      for (let i = 0; i < 4; i++) {
        const u = 0.86 - i * 0.18;
        const a = KIT.at(g, u, 15);
        const b = KIT.at(g, u - 0.06, 15);
        const c = KIT.at(g, u - 0.06, -15);
        const d = KIT.at(g, u, -15);
        panel(ctx, [a, b, c, d], stripe, null, 0);
      }
      ctx.restore();
      // 腰部一圈带子（收腰）
      const w1 = KIT.at(g, 0.2, 14);
      const w2 = KIT.at(g, 0.2, -14);
      KIT.ribbon(ctx, w1, w2, 4.4, shade(C.sub, -6), C, 1.4);
    },

    head: function (ctx, g, f, C, T) {
      KIT.drawHeadBase(ctx, g, f, C, T, { mood: 'grim' });
      ctx.save();
      ctx.translate(g.head.x, g.head.y);
      ctx.rotate(g.headAng);
      // 乱发：几撮不规则的发束（长短参差，别画成整齐的帽子）
      const hair = shade(C.hair, 22);
      ctx.fillStyle = hair;
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 1.8;
      ctx.lineJoin = 'round';
      const tufts = [
        [-13, -2, -16, -18, -7, -13],
        [-9, -12, -6, -25, 0, -15],
        [-2, -15, 4, -24, 7, -13],
        [4, -13, 13, -19, 14, -6],
        [8, -9, 17, -9, 13, 0],
        [-11, -6, -16, 2, -9, 3],
      ];
      for (let i = 0; i < tufts.length; i++) {
        const t = tufts[i];
        ctx.beginPath();
        ctx.moveTo(t[0], t[1]);
        ctx.quadraticCurveTo(t[2], t[3], t[4], t[5]);
        ctx.quadraticCurveTo((t[0] + t[4]) / 2 + 2, (t[1] + t[5]) / 2 + 3, t[0], t[1]);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      // 胡茬（下巴一片点）
      ctx.fillStyle = KIT.rgba(shade(C.hair, 40), 0.5);
      for (let i = 0; i < 6; i++) {
        KIT.circle(ctx, -4 + i * 2.6, 11 + (i % 2) * 1.6, 0.9);
        ctx.fill();
      }
      ctx.restore();
    },

    front: function (ctx, g, f, C, T) {
      // 双腕镣铐（金属环）
      const hands = [g.handF, g.handB];
      for (let i = 0; i < 2; i++) {
        const h = hands[i];
        ctx.save();
        ctx.translate(h.x, h.y);
        ctx.rotate(Math.atan2(h.y - (i ? g.elbowB.y : g.elbowF.y), h.x - (i ? g.elbowB.x : g.elbowF.x)) + Math.PI / 2);
        KIT.roundRect(ctx, -6.4, -3, 12.8, 6, 2.4);
        ctx.fillStyle = shade(C.trim, -8);
        ctx.fill();
        ctx.strokeStyle = C.outline;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.strokeStyle = KIT.rgba('#ffffff', 0.5);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-3.6, -1.4);
        ctx.lineTo(3.6, -1.4);
        ctx.stroke();
        ctx.restore();
      }
      // 出手：前甩的三节链环（accent 冷光 + 金属描边）
      if (f.aPhase === 'strike' || f.aPhase === 'recover') {
        const k = f.aPhase === 'strike' ? clamp01((f.aK || 0) / 0.5) : 1;
        const p = g.handF;
        const reach = 96 * easeOut(k);
        for (let i = 0; i < 3; i++) {
          const cx = p.x + 16 + reach * ((i + 1) / 3);
          const cy = p.y - 8 + Math.sin(T * 10 + i * 1.2) * 5 * (1 - i * 0.2) + i * 4;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(0.5 + i * 0.4);
          ctx.strokeStyle = C.outline;
          ctx.lineWidth = 3.4;
          KIT.ell(ctx, 0, 0, 5.2, 8.4);
          ctx.stroke();
          ctx.strokeStyle = shade(C.trim, 6);
          ctx.lineWidth = 2;
          KIT.ell(ctx, 0, 0, 5.2, 8.4);
          ctx.stroke();
          ctx.restore();
        }
        // 甩链的冷光尾
        ctx.save();
        ctx.globalAlpha *= 0.45 * (1 - k * 0.4);
        ctx.strokeStyle = C.accent;
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x + 8, p.y - 4);
        ctx.quadraticCurveTo(p.x + 40 + reach * 0.4, p.y - 16, p.x + 30 + reach, p.y + 8);
        ctx.stroke();
        ctx.restore();
      }
    },
  });

  /** 局部 lerp（避免与 art.js 内部的 lerp 重名） */
  function lerp2(a, b, t) { return a + (b - a) * t; }

  /* ============================================================
   *  3. 启动注册 + 自检
   * ============================================================ */

  /**
   * 把 DEFS 里的外观全部注册一遍（幂等）。
   * 单独抽出来是为了让调用方能在热重载 / 单文件打包后重跑一次。
   */
  AssistArt.registerAll = function () {
    Object.keys(DEFS).forEach(function (build) {
      if (AssistArt.REGISTERED.indexOf(build) >= 0) return;
      if (Art.registerLook(build, DEFS[build])) AssistArt.REGISTERED.push(build);
    });
    AssistArt.READY = true;
    checkMissing();
    return AssistArt.REGISTERED.slice();
  };

  /**
   * 兜底自检：ASSISTS 里有 build 没注册就 warn。
   * 不抛错、不白屏 —— Art.drawFighter 内部是 `LOOKS[f.build] || LOOKS.ronin`，
   * 所以缺注册表现为"站了个浪人"，启动时一眼可发现。
   */
  function checkMissing() {
    const list = BVN.ASSISTS || [];
    const miss = [];
    for (let i = 0; i < list.length; i++) {
      const build = list[i].build || list[i].id;
      if (AssistArt.REGISTERED.indexOf(build) < 0) miss.push(build);
    }
    AssistArt.MISSING = miss;
    if (miss.length) {
      console.warn('[AssistArt] 以下援助缺外观注册，已回退 LOOKS.ronin：' + miss.join(', '));
    }
    return miss;
  }

  BVN.AssistArt = AssistArt;
  AssistArt.registerAll();
})(window.BVN);

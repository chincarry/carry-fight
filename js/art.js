/* js/art.js — 程序化矢量角色绘制（分层骨骼 + 服装体块 + 姿势插值）与场景背景绘制
 *
 * 结构：
 *   1. 图形工具（锥形肢体 / 圆角矩形 / 颜色）
 *   2. 骨骼：由 pose 角度算出各关节坐标
 *   3. 角色绘制管线：后层配件 → 后臂/后腿 → 下装 → 躯干 → 前腿 → 头 → 前臂 → 前层配件
 *   4. LOOKS：8 个角色各自的服装、发型、专属配件（每人一套）
 *   5. 场景背景：神社雨夜 / 冥火战场（多层视差）
 *   6. 立绘（cover 裁切，按人脸锚点）
 */
window.BVN = window.BVN || {};

(function (BVN) {
  'use strict';

  const CFG = BVN.CFG;
  const TAU = Math.PI * 2;

  const Art = { images: {}, loaded: 0, total: 0 };

  // 当前绘制的基础不透明度（残影会把它降到 0.4 左右，所有内部 alpha 都以此为基准）
  let BASE = 1;
  // 受击闪白：为 true 时所有颜色都退化成白色剪影（保证整只角色一起闪白）
  let MONO = false;

  const WHITE_PAL = {
    main: '#ffffff', sub: '#ffffff', accent: '#ffffff', trim: '#ffffff',
    skin: '#ffffff', hair: '#ffffff', outline: '#ffffff', glow: '#ffffff',
  };

  /* ============================================================
   *  1. 图形工具
   * ============================================================ */

  const clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  const lerp = function (a, b, t) { return a + (b - a) * t; };

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }
  Art.roundRect = roundRect;

  /** 由原点按角度（0 = +y 向下）与长度求点。 */
  function pt(o, a, len) {
    return { x: o.x + Math.sin(a) * len, y: o.y + Math.cos(a) * len };
  }

  /** 颜色明暗调整（amt 为 -255~255 的偏移）。 */
  function shade(hex, amt) {
    if (MONO) return '#ffffff';
    if (!hex || hex.charAt(0) !== '#') return hex || '#ffffff';
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255;
    let g = (n >> 8) & 255;
    let b = n & 255;
    r = clamp(r + amt, 0, 255);
    g = clamp(g + amt, 0, 255);
    b = clamp(b + amt, 0, 255);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  /** hex → rgba 字符串。 */
  function rgba(hex, a) {
    if (MONO) return 'rgba(255,255,255,' + a + ')';
    if (!hex || hex.charAt(0) !== '#') return hex || 'rgba(255,255,255,' + a + ')';
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  function ell(ctx, x, y, rx, ry, rot) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, TAU);
  }

  function circle(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.1, r), 0, TAU);
  }

  /**
   * 把点列按各自半宽展开成一条闭合带状路径（锥形肢体）。
   * 端点法线取相邻线段法线的平均，因此不会出现断口或可见圆关节。
   */
  function taperPath(ctx, pts, ws) {
    const n = pts.length;
    const nx = [];
    const ny = [];
    for (let i = 0; i < n; i++) {
      let ax = 0;
      let ay = 0;
      if (i > 0) {
        const dx = pts[i].x - pts[i - 1].x;
        const dy = pts[i].y - pts[i - 1].y;
        const l = Math.hypot(dx, dy) || 1;
        ax += -dy / l;
        ay += dx / l;
      }
      if (i < n - 1) {
        const dx = pts[i + 1].x - pts[i].x;
        const dy = pts[i + 1].y - pts[i].y;
        const l = Math.hypot(dx, dy) || 1;
        ax += -dy / l;
        ay += dx / l;
      }
      const l2 = Math.hypot(ax, ay) || 1;
      nx[i] = ax / l2;
      ny[i] = ay / l2;
    }
    ctx.beginPath();
    ctx.moveTo(pts[0].x + nx[0] * ws[0], pts[0].y + ny[0] * ws[0]);
    for (let i = 1; i < n; i++) ctx.lineTo(pts[i].x + nx[i] * ws[i], pts[i].y + ny[i] * ws[i]);
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(pts[i].x - nx[i] * ws[i], pts[i].y - ny[i] * ws[i]);
    ctx.closePath();
  }

  /** 画一段锥形肢体（填充 + 描边 + 朝前一面的亮边）。 */
  function taper(ctx, pts, ws, fill, outline, lw, rim) {
    taperPath(ctx, pts, ws);
    const g0 = pts[0];
    const g1 = pts[pts.length - 1];
    const grad = ctx.createLinearGradient(g0.x, g0.y, g1.x, g1.y);
    grad.addColorStop(0, shade(fill, 16));
    grad.addColorStop(1, shade(fill, -22));
    ctx.fillStyle = MONO ? '#ffffff' : grad;
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = outline;
    ctx.lineWidth = lw == null ? 3 : lw;
    ctx.stroke();
    if (rim && !MONO) {
      ctx.beginPath();
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const dx = (i < n - 1 ? pts[i + 1].x - pts[i].x : pts[i].x - pts[i - 1].x);
        const dy = (i < n - 1 ? pts[i + 1].y - pts[i].y : pts[i].y - pts[i - 1].y);
        const l = Math.hypot(dx, dy) || 1;
        const ax = -dy / l;
        const ay = dx / l;
        const px = pts[i].x + ax * ws[i] * 0.62;
        const py = pts[i].y + ay * ws[i] * 0.62;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = rim;
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }
  }

  /** 多边形填充 + 描边。 */
  function poly(ctx, pts, fill, outline, lw) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (outline) {
      ctx.lineJoin = 'round';
      ctx.strokeStyle = outline;
      ctx.lineWidth = lw == null ? 3 : lw;
      ctx.stroke();
    }
  }

  /* ============================================================
   *  2. 骨骼
   * ============================================================ */

  const TORSO_LEN = 48;
  const THIGH = 39;
  const SHIN = 39;
  const UPPER_ARM = 30;
  const FOREARM = 27;
  const HEAD_R = 15;

  /**
   * 由 pose 角度算出全部关节位置。
   * @param {Object} P pose（t/h/afu/aff/abu/abf/lft/lfs/lbt/lbs/c/rot/hipx）
   */
  function skeleton(P) {
    const c = P.c || 0;
    const hip = { x: P.hipx || 0, y: -78 - c * 0.7 };
    const up = { x: Math.sin(P.t), y: -Math.cos(P.t) };
    const perp = { x: -up.y, y: up.x }; // +perp = 正面（朝前）
    const sh = { x: hip.x + up.x * TORSO_LEN, y: hip.y + up.y * TORSO_LEN };
    const neck = { x: sh.x + up.x * 8, y: sh.y + up.y * 8 };
    const headAng = P.t * 0.55 + P.h;
    const hd = { x: Math.sin(headAng), y: -Math.cos(headAng) };
    const head = { x: neck.x + hd.x * (HEAD_R + 1), y: neck.y + hd.y * (HEAD_R + 1) };

    const shF = { x: sh.x + perp.x * 6, y: sh.y + perp.y * 6 };
    const shB = { x: sh.x - perp.x * 6, y: sh.y - perp.y * 6 };
    const elbowF = pt(shF, P.afu, UPPER_ARM);
    const handF = pt(elbowF, P.afu + P.aff, FOREARM);
    const elbowB = pt(shB, P.abu, UPPER_ARM);
    const handB = pt(elbowB, P.abu + P.abf, FOREARM);

    const hipF = { x: hip.x + perp.x * 5, y: hip.y + perp.y * 5 };
    const hipB = { x: hip.x - perp.x * 5, y: hip.y - perp.y * 5 };
    const kneeF = pt(hipF, P.lft, THIGH);
    const footF = pt(kneeF, P.lft + P.lfs, SHIN);
    const kneeB = pt(hipB, P.lbt, THIGH);
    const footB = pt(kneeB, P.lbt + P.lbs, SHIN);

    return {
      hip: hip, up: up, perp: perp, sh: sh, neck: neck, head: head,
      headAng: headAng, hd: hd,
      shF: shF, shB: shB, elbowF: elbowF, handF: handF, elbowB: elbowB, handB: handB,
      hipF: hipF, hipB: hipB, kneeF: kneeF, footF: footF, kneeB: kneeB, footB: footB,
    };
  }
  Art.skeleton = skeleton;

  /** 躯干局部坐标：u=0 髋 → u=1 肩；v=+ 前 → − 后。 */
  function at(g, u, v) {
    return {
      x: g.hip.x + g.up.x * TORSO_LEN * u + g.perp.x * v,
      y: g.hip.y + g.up.y * TORSO_LEN * u + g.perp.y * v,
    };
  }

  // 躯干剖面（u, 前缘, 后缘）——侧视体块：胸最厚、腰收窄、髋略张
  const TORSO_PROFILE = [
    [0.00, 11.5, -12.0],
    [0.14, 11.0, -10.4],
    [0.34, 10.2, -9.6],
    [0.56, 11.6, -10.2],
    [0.80, 14.4, -11.6],
    [0.97, 13.8, -12.6],
  ];

  function torsoPath(ctx, g) {
    ctx.beginPath();
    let p = at(g, TORSO_PROFILE[0][0], TORSO_PROFILE[0][1]);
    ctx.moveTo(p.x, p.y);
    for (let i = 1; i < TORSO_PROFILE.length; i++) {
      p = at(g, TORSO_PROFILE[i][0], TORSO_PROFILE[i][1]);
      ctx.lineTo(p.x, p.y);
    }
    for (let i = TORSO_PROFILE.length - 1; i >= 0; i--) {
      p = at(g, TORSO_PROFILE[i][0], TORSO_PROFILE[i][2]);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
  }

  /* ============================================================
   *  3. 绘制管线
   * ============================================================ */

  /** 颜色的感知亮度 0~255，用来判断"这块布料是不是暗到需要补光"。 */
  function lum(hex) {
    if (MONO) return 255;
    const c = hex.replace('#', '');
    const n = parseInt(c.length === 3 ? c.split('').map(x => x + x).join('') : c, 16);
    const r = (n >> 16) & 255;
    const g2 = (n >> 8) & 255;
    const b = n & 255;
    return 0.299 * r + 0.587 * g2 + 0.114 * b;
  }

  /** 躯干轮廓点（side: 1 = 前缘, -1 = 后缘），用于沿边描 rim light。 */
  function torsoEdge(g, side) {
    const idx = side > 0 ? 1 : 2;
    const pts = [];
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const u = 0 + 0.99 * t;
      // 在 TORSO_PROFILE 上按 u 线性插值
      let a = TORSO_PROFILE[0];
      let b = TORSO_PROFILE[TORSO_PROFILE.length - 1];
      for (let k = 0; k < TORSO_PROFILE.length - 1; k++) {
        if (u >= TORSO_PROFILE[k][0] && u <= TORSO_PROFILE[k + 1][0]) {
          a = TORSO_PROFILE[k];
          b = TORSO_PROFILE[k + 1];
          break;
        }
      }
      const span = (b[0] - a[0]) || 1;
      const f = clamp((u - a[0]) / span, 0, 1);
      const v = a[idx] + (b[idx] - a[idx]) * f;
      pts.push(at(g, u, v));
    }
    return pts;
  }

  function drawTorsoBase(ctx, g, C) {
    const dark = lum(C.main) < 70;
    torsoPath(ctx, g);
    const a = at(g, 0, 0);
    const b = at(g, 1, 0);
    const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    if (dark) {
      // 深色服装做三级明度（暗部 / 主体 / 亮部），否则在黑背景上塌成一块纯黑
      grad.addColorStop(0, shade(C.main, -16));
      grad.addColorStop(0.55, shade(C.main, 10));
      grad.addColorStop(1, shade(C.main, 42));
    } else {
      grad.addColorStop(0, shade(C.main, -26));
      grad.addColorStop(1, shade(C.main, 22));
    }
    ctx.fillStyle = MONO ? '#ffffff' : grad;
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 4;
    ctx.stroke();

    // 肩部圆肩（把手臂根部包进去，避免看到关节接缝）
    circle(ctx, g.sh.x + g.perp.x * 2, g.sh.y + g.perp.y * 2, 11.5);
    ctx.fillStyle = MONO ? '#ffffff' : shade(C.main, dark ? 18 : 0);
    ctx.fill();
    ctx.stroke();

    // 深色服装：前缘一道冷色 rim light（2px，#8fa4c8）
    if (dark && !MONO) {
      const edge = torsoEdge(g, 1);
      ctx.beginPath();
      for (let i = 0; i < edge.length; i++) {
        if (i === 0) ctx.moveTo(edge[i].x, edge[i].y);
        else ctx.lineTo(edge[i].x, edge[i].y);
      }
      ctx.strokeStyle = 'rgba(143,164,200,0.55)';
      ctx.lineWidth = 2.2;
      ctx.stroke();
    }
  }

  function drawLeg(ctx, g, C, back) {
    const hip = back ? g.hipB : g.hipF;
    const knee = back ? g.kneeB : g.kneeF;
    const foot = back ? g.footB : g.footF;
    const dark = back ? -32 : 0;
    const pants = shade(C.main, dark);
    const skin = shade(C.skin, dark);
    // 迎光侧 rim light：只在受光边留一点点，过强会在深色衣服上读成划痕；
    // 深色布料改挂一道冷色边（#8fa4c8），黑背景上才有轮廓
    const rim = lum(pants) < 70 ? 'rgba(143,164,200,0.5)' : 'rgba(255,255,255,0.16)';
    taper(ctx, [hip, knee, foot], [9.6, 7.6, 5.2], pants, C.outline, 3.2, back ? null : rim);
    // 小腿外露（袴/裙会盖住，由各角色下装再覆盖）
    taper(ctx, [pt(knee, 0, 0), foot], [7.0, 4.8], skin, C.outline, 2.6);
  }

  function drawArm(ctx, g, C, back, fore) {
    const sh = back ? g.shB : g.shF;
    const el = back ? g.elbowB : g.elbowF;
    const hd = back ? g.handB : g.handF;
    const dark = back ? -30 : 0;
    const sleeve = shade(C.main, dark);
    const skin = shade(C.skin, dark);
    const rim = lum(sleeve) < 70 ? 'rgba(143,164,200,0.5)' : 'rgba(255,255,255,0.18)';
    taper(ctx, [sh, el], [8.6, 6.6], sleeve, C.outline, 3.0, back ? null : rim);
    // 前臂：和服/长袍类角色由袖布包住（fore 传入布料色），否则露肤色
    const fx = fore == null ? [6.4, 4.6] : [6.2, 5.4];
    taper(ctx, [el, hd], fx, fore == null ? skin : fore, C.outline, 2.6);
  }

  /** 手：握拳。dir 为前臂朝向角。 */
  function drawFist(ctx, p, ang, r, C, color) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(ang);
    roundRect(ctx, -r * 0.9, -r * 0.9, r * 1.9, r * 1.8, r * 0.7);
    ctx.fillStyle = MONO ? '#ffffff' : color;
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 2.6;
    ctx.stroke();
    // 指节线
    ctx.strokeStyle = rgba(shade(color, -60), 0.55);
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.5 + i * r * 0.42, -r * 0.8);
      ctx.lineTo(-r * 0.5 + i * r * 0.42, 0.2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** 脚：鞋/靴，沿腓肠方向前伸。 */
  function drawFoot(ctx, ankle, knee, C, back, style) {
    const ang = Math.atan2(ankle.y - knee.y, ankle.x - knee.x);
    ctx.save();
    ctx.translate(ankle.x, ankle.y);
    ctx.rotate(ang);
    const dark = back ? -28 : 0;
    // 鞋体（局部 +x 为小腿方向，脚掌朝 -? => 使用旋转后的"下"为前方）
    ctx.beginPath();
    ctx.moveTo(-5.5, -5);
    ctx.lineTo(5.5, -5);
    ctx.quadraticCurveTo(6.5, 10, 9.5, 13.5);
    ctx.lineTo(-1.5, 14.5);
    ctx.quadraticCurveTo(-7, 9, -6.5, 0);
    ctx.closePath();
    ctx.fillStyle = MONO ? '#ffffff' : shade(style === 'bare' ? C.skin : C.sub, dark);
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 2.8;
    ctx.stroke();
    ctx.restore();
  }

  /** 头：皮肤底 + 下颌 + 耳 + 五官 + 眼镜（眼镜是全员彩蛋，必须保留）。 */
  function drawHeadBase(ctx, g, f, C, T, opt) {
    const o = opt || {};
    ctx.save();
    ctx.translate(g.head.x, g.head.y);
    ctx.rotate(g.headAng);

    // 脖子
    ctx.beginPath();
    ctx.moveTo(-2.5, -16);
    ctx.lineTo(4.5, -16);
    ctx.lineTo(5.5, 6);
    ctx.lineTo(-3.5, 6);
    ctx.closePath();
    ctx.fillStyle = MONO ? '#ffffff' : shade(C.skin, -32);
    ctx.fill();

    // 头骨
    const grd = ctx.createLinearGradient(-6, -12, 8, 12);
    grd.addColorStop(0, shade(C.skin, 16));
    grd.addColorStop(1, shade(C.skin, -30));
    ctx.beginPath();
    ctx.moveTo(-10.5, -12.5);
    ctx.quadraticCurveTo(2, -16.5, 10.5, -7.5);
    ctx.quadraticCurveTo(14, 0, 10.5, 7);
    ctx.quadraticCurveTo(7, 14.5, 0.5, 15);
    ctx.quadraticCurveTo(-8, 14.5, -11, 6);
    ctx.quadraticCurveTo(-13.5, -4, -10.5, -12.5);
    ctx.closePath();
    ctx.fillStyle = MONO ? '#ffffff' : grd;
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 2.8;
    ctx.stroke();

    // 耳
    ell(ctx, -9.5, 2, 2.8, 4.2);
    ctx.fillStyle = MONO ? '#ffffff' : shade(C.skin, -18);
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // 五官
    if (!o.noFace) drawFace(ctx, C, o.mood || 'calm', T);

    // 眼镜（细框，全员彩蛋）
    if (o.noGlasses) { ctx.restore(); return; }
    ctx.lineWidth = 1.7;
    ctx.strokeStyle = MONO ? '#ffffff' : 'rgba(226,244,255,0.95)';
    ctx.fillStyle = MONO ? 'rgba(255,255,255,0.2)' : 'rgba(150,205,255,0.16)';
    roundRect(ctx, -9.2, -4.6, 11.2, 8.6, 2.6);
    ctx.fill();
    ctx.stroke();
    roundRect(ctx, 2.6, -5.2, 12.4, 9.4, 2.8);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(1.8, -1.4);
    ctx.lineTo(2.8, -1.8);
    ctx.moveTo(-9.4, -1.6);
    ctx.lineTo(-13.2, 0.4);
    ctx.stroke();
    if (!MONO) {
      ctx.globalAlpha = BASE * 0.55;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(4.6, 2);
      ctx.lineTo(8.4, -2.4);
      ctx.stroke();
      ctx.globalAlpha = BASE;
    }

    ctx.restore();
  }

  /** 五官：mood = angry / calm / sly / focus / grim / beast。 */
  function drawFace(ctx, C, mood, T) {
    const ink = '#141018';
    const brow = MONO ? '#ffffff' : ink;
    ctx.lineCap = 'round';

    // 眼白 + 瞳孔
    const eyes = [
      { x: 3.2, y: 0.4, w: 3.4, h: 2.6 },
      { x: 8.6, y: 0.2, w: 3.0, h: 2.5 },
    ];
    for (let i = 0; i < eyes.length; i++) {
      const e = eyes[i];
      ctx.beginPath();
      ctx.ellipse(e.x, e.y, e.w, e.h, 0, 0, TAU);
      ctx.fillStyle = MONO ? '#ffffff' : '#f4f6ff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(e.x + 0.5, e.y + 0.2, mood === 'beast' ? 1.1 : 1.55, 0, TAU);
      ctx.fillStyle = MONO ? '#ffffff' : (mood === 'beast' ? '#c8a13a' : '#1a1622');
      ctx.fill();
      if (mood === 'beast') {
        ctx.beginPath();
        ctx.ellipse(e.x + 0.5, e.y + 0.2, 0.45, 1.1, 0, 0, TAU);
        ctx.fillStyle = MONO ? '#ffffff' : '#000000';
        ctx.fill();
      }
    }

    // 眉毛（性格）
    ctx.strokeStyle = brow;
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    if (mood === 'angry') {
      ctx.moveTo(0.4, -4.4); ctx.lineTo(6.2, -2.6);
      ctx.moveTo(7.0, -2.6); ctx.lineTo(11.6, -4.6);
    } else if (mood === 'sly') {
      ctx.moveTo(0.6, -3.2); ctx.quadraticCurveTo(3.4, -4.8, 6.2, -3.6);
      ctx.moveTo(7.2, -3.6); ctx.quadraticCurveTo(9.6, -4.6, 11.4, -3.0);
    } else if (mood === 'focus') {
      ctx.moveTo(0.6, -3.8); ctx.lineTo(6.2, -3.4);
      ctx.moveTo(7.2, -3.4); ctx.lineTo(11.4, -3.9);
    } else if (mood === 'grim') {
      ctx.moveTo(0.4, -4.2); ctx.lineTo(6.0, -3.2);
      ctx.moveTo(7.2, -3.2); ctx.lineTo(11.6, -4.4);
    } else if (mood === 'beast') {
      ctx.moveTo(0.2, -5.0); ctx.lineTo(6.4, -2.2);
      ctx.moveTo(6.8, -2.2); ctx.lineTo(12.0, -5.2);
    } else {
      ctx.moveTo(0.8, -4.0); ctx.quadraticCurveTo(3.4, -5.4, 6.2, -4.0);
      ctx.moveTo(7.2, -4.0); ctx.quadraticCurveTo(9.8, -5.2, 11.6, -3.8);
    }
    ctx.stroke();

    // 嘴
    ctx.strokeStyle = MONO ? '#ffffff' : shade(C.skin, -96);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    if (mood === 'angry' || mood === 'beast') {
      ctx.moveTo(4.4, 9.4); ctx.lineTo(10.2, 8.2);
      if (mood === 'beast') { ctx.moveTo(6.2, 8.6); ctx.lineTo(6.6, 10.6); }
    } else if (mood === 'sly') {
      ctx.moveTo(4.6, 9.0); ctx.quadraticCurveTo(7.6, 11.0, 10.4, 8.6);
    } else {
      ctx.moveTo(4.6, 9.2); ctx.lineTo(9.8, 9.0);
    }
    ctx.stroke();
  }

  /**
   * 绘制一只角色。
   * @param {CanvasRenderingContext2D} ctx 上下文
   * @param {Object} f 具备 x,y,facing,pose,palette,build,onGround,hitFlash,glow,alpha 的战斗对象
   * @param {number} time 全局时间（秒）
   */
  Art.drawFighter = function (ctx, f, time) {
    const pal = f.palette || (BVN.CHAR_BY_ID[f.id] || {}).palette;
    if (!pal || !f.pose) return;
    const g = skeleton(f.pose);
    const look = LOOKS[f.build] || LOOKS.ronin;

    BASE = f.alpha == null ? 1 : f.alpha;
    ctx.save();
    ctx.globalAlpha = BASE;
    ctx.translate(f.x, f.y);
    ctx.scale(f.facing, 1);

    // 自动贴地（站立时让最低的脚踩在 y=0）
    if (f.onGround && Math.abs(f.pose.rot) < 0.02) {
      ctx.translate(0, -Math.max(g.footF.y, g.footB.y, -6));
    }
    if (Math.abs(f.pose.rot) >= 0.02) {
      ctx.translate(0, 12);
      ctx.translate(0, -70);
      ctx.rotate(f.pose.rot);
      ctx.translate(0, 70);
    }

    if (f.glow > 0) {
      ctx.shadowColor = pal.glow;
      ctx.shadowBlur = 20;
    }

    drawBody(ctx, g, f, pal, time, look);

    // 受击闪白（整只角色一起叠白）
    if (f.hitFlash > 0) {
      ctx.globalAlpha = Math.min(0.82, f.hitFlash / 3) * BASE;
      Art.noFx = true;
      MONO = true;
      drawBody(ctx, g, f, WHITE_PAL, time, look);
      MONO = false;
      Art.noFx = false;
      ctx.globalAlpha = BASE;
    }

    ctx.restore();
    BASE = 1;
  };

  function drawBody(ctx, g, f, C0, T, look) {
    // 服装主色可由角色覆盖（例如般若的黑和服、拳击的赤膊）
    const fab = typeof look.fabric === 'function' ? look.fabric(C0) : look.fabric;
    const C = fab ? Object.assign({}, C0, { main: fab }) : C0;
    const back = shade(C.main, -30);
    const skinBack = shade(C.skin, -26);

    if (look.ground) look.ground(ctx, g, f, C, T);
    if (look.back) look.back(ctx, g, f, C, T);

    // 后臂 / 后腿
    // 长袖角色（和服 / 长袍 / 大衣）：前臂由袖布包住，只露出手
    const foreF = look.sleeve ? shade(C.main, 8) : null;
    const foreB = look.sleeve ? back : null;
    drawArm(ctx, g, { main: back, skin: skinBack, outline: C.outline }, 1, foreB);
    if (look.arm) look.arm(ctx, g, f, C, T, 1);
    drawFist(ctx, g.handB, Math.atan2(g.handB.y - g.elbowB.y, g.handB.x - g.elbowB.x), 4.4, C, skinBack);
    const legSkin = look.bareLegs ? C.skin : shade(C.main, -6);
    drawLeg(ctx, g, { main: shade(C.main, -16), skin: shade(legSkin, -26), outline: C.outline }, 1);
    drawFoot(ctx, g.footB, g.kneeB, C, 1, look.foot);
    if (look.legBack) look.legBack(ctx, g, f, C, T);

    // 下装（裙 / 袴 / 长袍下摆）
    if (look.hem) look.hem(ctx, g, f, C, T);

    // 躯干
    drawTorsoBase(ctx, g, C);
    if (look.torso) look.torso(ctx, g, f, C, T);

    // 前腿
    drawLeg(ctx, g, { main: C.main, skin: legSkin, outline: C.outline }, 0);
    drawFoot(ctx, g.footF, g.kneeF, C, 0, look.foot);
    if (look.legFront) look.legFront(ctx, g, f, C, T);

    // 头
    if (look.head) look.head(ctx, g, f, C, T);
    else drawHeadBase(ctx, g, f, C, T, { mood: look.mood });

    // 前臂（袖子在手臂之下画，避免盖住手臂轮廓）
    if (look.armFront) look.armFront(ctx, g, f, C, T);
    drawArm(ctx, g, C, 0, foreF);
    drawFist(ctx, g.handF, Math.atan2(g.handF.y - g.elbowF.y, g.handF.x - g.elbowF.x), 4.8, C, C.skin);

    if (look.front) look.front(ctx, g, f, C, T);
  }

  /* 通用小件 ------------------------------------------------- */

  /** 和服大袖：从肘部垂下的一块布（画在手臂之下，不遮挡手臂轮廓）。 */
  function hangingSleeve(ctx, el, shoulder, C, color, len, w, sway) {
    const dx = el.x - shoulder.x;
    const dy = el.y - shoulder.y;
    const l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l;
    const ny = dx / l;
    const a = { x: el.x + nx * w * 0.5, y: el.y + ny * w * 0.5 };
    const b = { x: el.x - nx * w * 0.5, y: el.y - ny * w * 0.5 };
    ctx.beginPath();
    ctx.moveTo(a.x + sway * 0.4, a.y - 8);
    ctx.lineTo(b.x + sway * 0.4, b.y - 8);
    ctx.quadraticCurveTo(b.x + sway, b.y + len * 0.6, b.x + sway, b.y + len);
    ctx.quadraticCurveTo((a.x + b.x) / 2 + sway, b.y + len + 8, a.x + sway, a.y + len);
    ctx.quadraticCurveTo(a.x + sway * 0.7, a.y + len * 0.5, a.x + sway * 0.4, a.y - 8);
    ctx.closePath();
    ctx.fillStyle = MONO ? '#ffffff' : color;
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 2.6;
    ctx.lineJoin = 'round';
    ctx.stroke();
    if (!MONO) {
      ctx.strokeStyle = rgba(shade(color, 55), 0.4);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(lerp(a.x, b.x, 0.24) + sway, lerp(a.y, b.y, 0.24) + 2);
      ctx.lineTo(lerp(a.x, b.x, 0.24) + sway, lerp(a.y, b.y, 0.24) + len * 0.86);
      ctx.stroke();
    }
  }

  /** 布料飘动：由两点 + 相位生成下摆曲线。 */
  function cloth(ctx, pts, fill, outline, lw) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fillStyle = MONO ? '#ffffff' : fill;
    ctx.fill();
    if (outline) {
      ctx.strokeStyle = outline;
      ctx.lineWidth = lw == null ? 3 : lw;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
  }

  /**
   * 布带：两点之间的一段有宽度的布（深色描边 + 本色填充）。
   * 用来画衣领 / 腰带 / 袖口这类「有厚度」的部件——
   * 直接用 1~3px 的 stroke 画，在暗色衣服上会读成一道划痕。
   * @param {Object} p0 起点
   * @param {Object} p1 终点
   * @param {number} w 带宽
   * @param {string} fill 填充色
   * @param {Object} C 调色板（取 outline）
   * @param {number} [ow=2.6] 描边宽
   */
  function ribbon(ctx, p0, p1, w, fill, C, ow) {
    ctx.lineCap = 'butt';
    if (!MONO) {
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = w + (ow == null ? 2.8 : ow) * 2;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
    ctx.strokeStyle = MONO ? '#ffffff' : fill;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
    ctx.lineCap = 'round';
  }

  /* ============================================================
   *  4. 八角色外观
   * ============================================================ */

  const LOOKS = {};

  /* ---------------- 般若：黑白和服 + 红鬼面具 ---------------- */
  LOOKS.hannya = {
    mood: 'angry',
    foot: 'shoe',
    fabric: '#1b1d25',
    sleeve: true,
    back: function (ctx, g, f, C, T) {
      // 和服后袖
      hangingSleeve(ctx, g.elbowB, g.shB, C, shade(C.main, -34), 30, 21, Math.sin(T * 2) * 1.6);
    },
    armFront: function (ctx, g, f, C, T) {
      hangingSleeve(ctx, g.elbowF, g.shF, C, C.main, 33, 24, Math.sin(T * 2 + 0.9) * 2.4);
    },
    hem: function (ctx, g, f, C, T) {
      const sw = Math.sin(T * 2.2) * 2.2;
      const a = at(g, 0.12, 14);
      const b = at(g, 0.12, -14);
      cloth(ctx, [
        a, { x: a.x + 4 + sw, y: a.y + 46 }, { x: b.x - 4 - sw, y: b.y + 50 }, b,
      ], shade(C.main, -18), C.outline, 3.4);
      // 下摆滚边（深金）+ 开衩缝
      if (!MONO) {
        ctx.strokeStyle = rgba(shade(C.trim, -55), 0.9);
        ctx.lineWidth = 4.2;
        ctx.beginPath();
        ctx.moveTo(a.x + 2 + sw, a.y + 44);
        ctx.quadraticCurveTo((a.x + b.x) / 2, a.y + 52, b.x - 2 - sw, b.y + 47);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth = 2.4;
        for (let i = 0; i < 2; i++) {
          const px = lerp(a.x, b.x, 0.34 + i * 0.34);
          ctx.beginPath();
          ctx.moveTo(px, a.y + 8);
          ctx.lineTo(px - 3, a.y + 44);
          ctx.stroke();
        }
        // 暗金家纹（黑底上唯一能读出纹样的元素）
        ctx.strokeStyle = 'rgba(122,101,53,0.6)';
        ctx.lineWidth = 1.8;
        for (let i = 0; i < 3; i++) {
          const px = lerp(a.x, b.x, 0.2 + i * 0.3);
          ctx.beginPath();
          ctx.arc(px, a.y + 30, 6.5, -2.4, 2.0);
          ctx.stroke();
        }
      }
    },
    torso: function (ctx, g, f, C, T) {
      // 和服衣领：从后颈绕过肩线，斜下到胸腹（侧视只看到一片）
      // 用「粗描边 + 本色」两层画，才有布带的厚度
      function collar(width, fill, ow, vOff) {
        const p0 = at(g, 1.0, -7 + vOff);
        const p1 = at(g, 0.86, 13 + vOff);
        const p2 = at(g, 0.34, 8 + vOff);
        ctx.lineCap = 'round';
        for (let pass = 0; pass < (MONO ? 1 : 2); pass++) {
          ctx.strokeStyle = pass === 0 ? C.outline : (MONO ? '#ffffff' : fill);
          ctx.lineWidth = pass === 0 ? width + ow * 2 : width;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.quadraticCurveTo(p1.x, p1.y, p2.x, p2.y);
          ctx.stroke();
        }
      }
      // 外襟（黑，宽）
      collar(9, shade(C.main, 28), 2.2, 0);
      // 内襦袢（白，窄，压在外襟内侧）
      collar(4.6, '#ded7c6', 1.8, 3.4);
      // 腰带
      const w1 = at(g, 0.16, 15);
      const w2 = at(g, 0.16, -15);
      ribbon(ctx, w1, w2, 11, C.accent, C, 2.4);
      // 腰带结 + 金属扣高光
      const k = at(g, 0.16, -13);
      roundRect(ctx, k.x - 5.5, k.y - 5, 11, 10, 3);
      ctx.fillStyle = MONO ? '#ffffff' : shade(C.accent, -18);
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 2;
      ctx.stroke();
      if (!MONO) {
        ell(ctx, k.x - 1.5, k.y - 2, 3.2, 1.8);
        ctx.fillStyle = 'rgba(255,226,150,0.85)';
        ctx.fill();
        // 腰带上的暗金纹（两段）
        ctx.strokeStyle = rgba('#7a6535', 0.55);
        ctx.lineWidth = 1.6;
        for (let i = 0; i < 2; i++) {
          const q = at(g, 0.16, 4 + i * 7);
          ctx.beginPath();
          ctx.moveTo(q.x - 4, q.y);
          ctx.lineTo(q.x + 4, q.y);
          ctx.stroke();
        }
      }
      // 金线纹样（细，但用双层避免读成划痕）
      if (!MONO) {
        ctx.strokeStyle = rgba(shade(C.trim, -40), 0.55);
        ctx.lineWidth = 3.2;
        for (let i = 0; i < 2; i++) {
          const p = at(g, 0.46 + i * 0.22, 9 - i * 3);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 5, -0.5, 2.0);
          ctx.stroke();
        }
        ctx.strokeStyle = rgba(C.trim, 0.9);
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 2; i++) {
          const p = at(g, 0.46 + i * 0.22, 9 - i * 3);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 5, -0.5, 2.0);
          ctx.stroke();
        }
      }
    },
    head: function (ctx, g, f, C, T) {
      // ① 头颅 + 脖子 + 耳：不画五官，整张脸交给鬼面
      drawHeadBase(ctx, g, f, C, T, { noFace: true, noGlasses: true });

      // ② 冲冠短发（压在面具之下，只从面具边缘露出来）
      ctx.save();
      ctx.translate(g.head.x, g.head.y);
      ctx.rotate(g.headAng);
      ctx.beginPath();
      ctx.moveTo(-12, -4);
      ctx.quadraticCurveTo(-13, -16, -2, -17.5);
      ctx.quadraticCurveTo(8, -18.5, 12, -10);
      ctx.lineTo(8, -12);
      ctx.lineTo(9, -6.5);
      ctx.lineTo(3.5, -11);
      ctx.lineTo(1.5, -5.5);
      ctx.lineTo(-3, -10.5);
      ctx.lineTo(-5.5, -4.5);
      ctx.closePath();
      ctx.fillStyle = MONO ? '#ffffff' : C.hair;
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.restore();

      // ③ 红鬼面：贴合脸部、盖住整张脸，下缘停在唇下
      ctx.save();
      ctx.translate(g.head.x, g.head.y);
      ctx.rotate(g.headAng);
      const bob = Math.sin(T * 1.6) * 0.5;

      // ④ 下巴：先铺一块灰肤色下颌，随后被面具压住上半 —— 下缘自然露出一小条，
      // 才能读出「人戴着面具」。画在面具之前，边界就自动跟着面具轮廓走。
      ell(ctx, 0, 12.6 + bob, 8.0, 5.8);
      ctx.fillStyle = MONO ? '#ffffff' : shade(C.skin, -6);
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 2;
      ctx.stroke();

      // 面具主体（额宽、颊收、下颌圆的正脸壳）
      const mg = ctx.createLinearGradient(-10, -14, 12, 12);
      mg.addColorStop(0, '#f0665a');
      mg.addColorStop(0.5, '#cf3529');
      mg.addColorStop(1, '#7d1712');
      ctx.beginPath();
      ctx.moveTo(-13, -8 + bob);
      ctx.quadraticCurveTo(-13, -16 + bob, 0, -17 + bob);
      ctx.quadraticCurveTo(13, -16 + bob, 15, -7 + bob);
      ctx.quadraticCurveTo(17, 1 + bob, 12, 7 + bob);
      ctx.quadraticCurveTo(7, 12 + bob, 1, 12 + bob);
      ctx.quadraticCurveTo(-7, 12 + bob, -12, 5 + bob);
      ctx.quadraticCurveTo(-15, -1 + bob, -13, -8 + bob);
      ctx.closePath();
      ctx.fillStyle = MONO ? '#ffffff' : mg;
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 2.6;
      ctx.lineJoin = 'round';
      ctx.stroke();

      if (!MONO) {
        // 额头高光 + 颊部阴影：让面具读成「立体壳」而不是红贴纸
        ctx.strokeStyle = 'rgba(255,190,170,0.5)';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(-9, -12 + bob);
        ctx.quadraticCurveTo(0, -16 + bob, 9, -11 + bob);
        ctx.stroke();
        ctx.fillStyle = 'rgba(90,14,10,0.4)';
        ctx.beginPath();
        ctx.moveTo(-13, -2 + bob);
        ctx.quadraticCurveTo(-10, 8, -3, 11.4);
        ctx.quadraticCurveTo(-10, 8.6, -12.6, 2.4);
        ctx.closePath();
        ctx.fill();

        // 眉骨怒挑（深红棱）
        ctx.fillStyle = '#6d130f';
        ctx.beginPath();
        ctx.moveTo(-11.4, -8.4 + bob); ctx.lineTo(1, -11.4 + bob);
        ctx.lineTo(1, -7.6 + bob); ctx.lineTo(-10.4, -5 + bob);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(13.4, -8.2 + bob); ctx.lineTo(3, -11.4 + bob);
        ctx.lineTo(3, -7.6 + bob); ctx.lineTo(12.8, -4.6 + bob);
        ctx.closePath(); ctx.fill();

        // 金色锯齿眼洞（内无眼珠）
        ctx.fillStyle = '#ffe089';
        ctx.beginPath();
        ctx.moveTo(-9.6, -4.8 + bob); ctx.lineTo(-2.2, -6.8 + bob);
        ctx.lineTo(-3.4, -1.4 + bob); ctx.lineTo(-9.2, -0.2 + bob);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(12.8, -4.6 + bob); ctx.lineTo(4.4, -6.6 + bob);
        ctx.lineTo(5.4, -1.2 + bob); ctx.lineTo(12.2, 0 + bob);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#d99a26';
        ctx.beginPath();
        ctx.moveTo(-8.4, -3.8 + bob); ctx.lineTo(-3.6, -5.4 + bob);
        ctx.lineTo(-4.4, -2 + bob); ctx.lineTo(-8.2, -1.2 + bob);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(11.6, -3.6 + bob); ctx.lineTo(5.6, -5.2 + bob);
        ctx.lineTo(6.4, -1.8 + bob); ctx.lineTo(11, -0.8 + bob);
        ctx.closePath(); ctx.fill();

        // 细金属框 = 「全员细框眼镜」彩蛋：架在眼洞外沿
        ctx.strokeStyle = 'rgba(226,244,255,0.95)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(-10.6, -5.8 + bob); ctx.lineTo(-1.6, -7.6 + bob);
        ctx.lineTo(-2.8, 0 + bob); ctx.lineTo(-10.2, 0.8 + bob);
        ctx.closePath(); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(13.8, -5.6 + bob); ctx.lineTo(3.8, -7.4 + bob);
        ctx.lineTo(4.8, 0.2 + bob); ctx.lineTo(13, 1 + bob);
        ctx.closePath(); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-1.8, -4.8 + bob); ctx.lineTo(3.4, -5.2 + bob);
        ctx.stroke();

        // 咧到嘴角的嘴 + 上下獠牙
        ctx.fillStyle = '#3a0806';
        ctx.beginPath();
        ctx.moveTo(-2, 4.4 + bob);
        ctx.quadraticCurveTo(5, 8.6 + bob, 13.6, 4 + bob);
        ctx.quadraticCurveTo(5.4, 12.4 + bob, -2, 4.4 + bob);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fff6e2';
        const fangs = [[0.6, 5.2, 2.2, 9.4], [3.4, 6.6, 4.8, 10.8], [6.6, 7, 7.6, 10.6]];
        for (let i = 0; i < fangs.length; i++) {
          const q = fangs[i];
          ctx.beginPath();
          ctx.moveTo(q[0], q[1] + bob);
          ctx.lineTo(q[2], q[3] + bob);
          ctx.lineTo(q[2] + 1.6, q[1] + 0.6 + bob);
          ctx.closePath(); ctx.fill();
        }
        ctx.beginPath();
        ctx.moveTo(9.2, 5.2 + bob); ctx.lineTo(10.2, 2.2 + bob); ctx.lineTo(11.6, 5 + bob);
        ctx.closePath(); ctx.fill();

        // 下缘胡须纹
        ctx.strokeStyle = 'rgba(70,10,8,0.72)';
        ctx.lineWidth = 1.4;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(-6 + i * 5, 9.4 + bob);
          ctx.lineTo(-4.4 + i * 5, 11.6 + bob);
          ctx.stroke();
        }
        // 迎光侧 rim light（暗背景上把红面提出来）
        ctx.strokeStyle = 'rgba(255,182,130,0.34)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(16.4, -6 + bob);
        ctx.quadraticCurveTo(18.4, 1 + bob, 13, 7.4 + bob);
        ctx.stroke();
      }

      // 额头双角：锥形（根粗尖细）+ 向两侧外撇。
      // 用 taper 而不是等宽 stroke —— 等宽圆弧在大倍率下会读成「香蕉」，
      // 收尖之后才像鬼角。起点压在面具顶缘之后，避免读成「贴在额头上的条」。
      function horn(sign) {
        const p0 = { x: sign * 6.2, y: -15.4 + bob };
        const p1 = { x: sign * 12.8, y: -18.6 + bob };
        const p2 = { x: sign * 12.4, y: -26.6 + bob };
        const pts = [];
        const ws = [];
        const N = 6;
        for (let i = 0; i <= N; i++) {
          const t = i / N;
          const u = 1 - t;
          pts.push({
            x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
            y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
          });
          ws.push(lerp(2.75, 0.5, t * t * 0.7 + t * 0.3));
        }
        taper(ctx, pts, ws, '#f2e6cd', C.outline, 2.4, MONO ? null : 'rgba(255,255,255,0.45)');
      }
      horn(1);
      horn(-1);
      ctx.restore();
    },
    front: function () {
      // 面具与刀均由 head / 手臂部分负责，这里留空
    },
  };

  /* ---------------- 天使：白袍 + 三层羽翼 + 光环 ---------------- */
  LOOKS.angel = {
    mood: 'calm',
    foot: 'shoe',
    fabric: '#eef1f8',
    sleeve: true,
    back: function (ctx, g, f, C, T) {
      const flap = Math.sin(T * 2.1) * 0.16;
      drawWing(ctx, g, C, T, -1, 1.0 + flap, 122);
      // 长袍后摆
      const sw = Math.sin(T * 1.8) * 3;
      const a = at(g, 0.1, -13);
      cloth(ctx, [
        a, { x: a.x - 16 - sw, y: a.y + 60 }, { x: a.x + 10, y: a.y + 56 }, at(g, 0.1, 6),
      ], shade(C.main, -40), C.outline, 3);
      hangingSleeve(ctx, g.elbowB, g.shB, C, shade(C.main, -22), 26, 19, Math.sin(T * 2.4) * 2);
    },
    armFront: function (ctx, g, f, C, T) {
      hangingSleeve(ctx, g.elbowF, g.shF, C, C.main, 28, 21, Math.sin(T * 2.4 + 1) * 2.4);
    },
    hem: function (ctx, g, f, C, T) {
      const sw = Math.sin(T * 2.4) * 2.4;
      const fr = at(g, 0.12, 15);
      const bk = at(g, 0.12, -15);
      cloth(ctx, [
        fr, { x: fr.x + 6 + sw, y: fr.y + 54 }, { x: fr.x - 2, y: fr.y + 66 },
        { x: bk.x + 3, y: bk.y + 64 }, { x: bk.x - 8 - sw, y: bk.y + 52 }, bk,
      ], C.main, C.outline, 3.2);
      if (!MONO) {
        ctx.strokeStyle = rgba(shade(C.main, -70), 0.5);
        ctx.lineWidth = 1.4;
        for (let i = 0; i < 4; i++) {
          const t = 0.16 + i * 0.24;
          ctx.beginPath();
          ctx.moveTo(lerp(fr.x, bk.x, t), lerp(fr.y, bk.y, t));
          ctx.lineTo(lerp(fr.x, bk.x, t) + Math.sin(T * 2 + i) * 2, lerp(fr.y, bk.y, t) + 58);
          ctx.stroke();
        }
        // 袍脚金边
        ctx.strokeStyle = rgba(C.trim, 0.85);
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(fr.x + 4, fr.y + 58);
        ctx.quadraticCurveTo((fr.x + bk.x) / 2, fr.y + 70, bk.x - 6, bk.y + 56);
        ctx.stroke();
      }
    },
    torso: function (ctx, g, f, C, T) {
      // 腰绳
      const w1 = at(g, 0.2, 15);
      const w2 = at(g, 0.2, -15);
      ctx.beginPath();
      ctx.moveTo(w1.x, w1.y);
      ctx.lineTo(w2.x, w2.y);
      ctx.strokeStyle = MONO ? '#ffffff' : C.trim;
      ctx.lineWidth = 6;
      ctx.stroke();
      // 胸口金纹（十字）
      const cc = at(g, 0.74, 11);
      if (!MONO) {
        ctx.strokeStyle = rgba(C.trim, 0.9);
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(cc.x - 4, cc.y - 6);
        ctx.lineTo(cc.x + 2, cc.y + 6);
        ctx.moveTo(cc.x - 5, cc.y + 1);
        ctx.lineTo(cc.x + 3, cc.y - 1);
        ctx.stroke();
      }
      // 领口
      const n1 = at(g, 1.0, 12);
      const n2 = at(g, 0.62, 2);
      ctx.strokeStyle = MONO ? '#ffffff' : shade(C.main, -26);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(n1.x, n1.y);
      ctx.lineTo(n2.x, n2.y);
      ctx.stroke();
    },
    head: function (ctx, g, f, C, T) {
      // 长发（先画，压在肩后）
      ctx.save();
      ctx.translate(g.head.x, g.head.y);
      ctx.rotate(g.headAng);
      const sw = Math.sin(T * 1.7) * 2.5;
      ctx.beginPath();
      ctx.moveTo(-11, -6);
      ctx.quadraticCurveTo(-20 - sw, 14, -16 - sw, 34);
      ctx.quadraticCurveTo(-8, 26, -6, 8);
      ctx.closePath();
      ctx.fillStyle = MONO ? '#ffffff' : shade(C.hair, -22);
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.restore();

      drawHeadBase(ctx, g, f, C, T, { mood: 'calm' });

      // 前发
      ctx.save();
      ctx.translate(g.head.x, g.head.y);
      ctx.rotate(g.headAng);
      ctx.beginPath();
      ctx.moveTo(-12, -2);
      ctx.quadraticCurveTo(-13, -17, 0, -18);
      ctx.quadraticCurveTo(11, -18, 13, -6);
      ctx.lineTo(9, -9);
      ctx.lineTo(7, -3);
      ctx.lineTo(2, -10);
      ctx.lineTo(-3, -4);
      ctx.lineTo(-7, -9);
      ctx.closePath();
      ctx.fillStyle = MONO ? '#ffffff' : C.hair;
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      // 光环
      ctx.strokeStyle = MONO ? '#ffffff' : C.glow;
      ctx.lineWidth = 2.2;
      ctx.globalAlpha = BASE * (0.75 + Math.sin(T * 3) * 0.2);
      ell(ctx, 2, -25, 8.6, 2.8);
      ctx.stroke();
      ctx.globalAlpha = BASE;
      ctx.restore();
    },
    front: function (ctx, g, f, C, T) {
      // 袖口金边
      if (MONO) return;
      const a = g.elbowF;
      ctx.strokeStyle = rgba(C.trim, 0.7);
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(a.x - 11, a.y + 26);
      ctx.lineTo(a.x + 11, a.y + 26);
      ctx.stroke();
    },
  };

  /** 天使之翼：膜 + 羽片，自肩后向上后方展开（越长越靠后）。 */
  function drawWing(ctx, g, C, T, dir, span, size) {
    const root = at(g, 0.84, -10);
    const n = 6;
    const flap = Math.sin(T * 2.2) * 0.09;

    // 翼膜
    ctx.beginPath();
    ctx.moveTo(root.x, root.y);
    for (let i = 0; i < n; i++) {
      const a = -2.30 - i * 0.14 + flap;
      const len = size * (0.92 - i * 0.07) * span;
      ctx.lineTo(root.x + Math.cos(a) * len * dir, root.y + Math.sin(a) * len);
    }
    ctx.quadraticCurveTo(root.x - 8 * dir, root.y + 14, root.x, root.y);
    ctx.closePath();
    ctx.fillStyle = MONO ? '#ffffff' : rgba(C.sub, 0.28);
    ctx.fill();

    // 羽片
    for (let i = 0; i < n; i++) {
      const a = -2.30 - i * 0.14 + flap;
      const len = size * (0.92 - i * 0.07) * span;
      const tipX = root.x + Math.cos(a) * len * dir;
      const tipY = root.y + Math.sin(a) * len;
      const baseX = root.x + Math.cos(a) * len * 0.3 * dir;
      const baseY = root.y + Math.sin(a) * len * 0.3;
      const w = 6 - i * 0.35;
      const nx = -Math.sin(a) * dir;
      const ny = Math.cos(a);
      ctx.beginPath();
      ctx.moveTo(baseX + nx * w, baseY + ny * w);
      ctx.quadraticCurveTo(
        lerp(baseX, tipX, 0.7) + nx * w * 0.8, lerp(baseY, tipY, 0.7) + ny * w * 0.8,
        tipX, tipY
      );
      ctx.quadraticCurveTo(
        lerp(baseX, tipX, 0.7) - nx * w * 0.7, lerp(baseY, tipY, 0.7) - ny * w * 0.7,
        baseX - nx * w, baseY - ny * w
      );
      ctx.closePath();
      ctx.fillStyle = MONO ? '#ffffff' : (i % 2 ? shade(C.main, -6) : C.main);
      ctx.fill();
      ctx.strokeStyle = MONO ? '#ffffff' : rgba(C.outline, 0.5);
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // 翼缘暖光（沿翼缘描一道低透明橙边，不用粒子，避免糊成色块）
    if (!MONO) {
      ctx.globalAlpha = BASE * 0.5;
      ctx.strokeStyle = 'rgba(255,196,110,0.85)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = -2.30 - i * 0.14 + flap;
        const len = size * (0.92 - i * 0.07) * span;
        const x = root.x + Math.cos(a) * len * dir;
        const y = root.y + Math.sin(a) * len;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.globalAlpha = BASE;
    }
  }

  /* ---------------- 拳击：赤膊 + 红拳套 + 辫子 ---------------- */
  LOOKS.boxer = {
    mood: 'angry',
    foot: 'shoe',
    bareLegs: true,
    fabric: function (C) { return C.skin; },
    hem: function (ctx, g, f, C, T) {
      // 红黑短裤（盖住髋部到大腿中段）
      const fr = at(g, 0.18, 14);
      const bk = at(g, 0.18, -14);
      cloth(ctx, [
        fr, { x: fr.x + 3, y: fr.y + 34 }, { x: fr.x - 9, y: fr.y + 36 },
        { x: bk.x + 9, y: bk.y + 35 }, { x: bk.x - 3, y: bk.y + 33 }, bk,
      ], MONO ? '#ffffff' : '#c0302a', C.outline, 2.8);
      if (!MONO) {
        // 侧条
        ctx.strokeStyle = '#1c2130';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(fr.x + 2, fr.y + 2);
        ctx.lineTo(fr.x - 4, fr.y + 32);
        ctx.stroke();
      }
    },
    torso: function (ctx, g, f, C, T) {
      // 裸露胸腹 + 肌肉阴影线
      if (!MONO) {
        ctx.strokeStyle = rgba(shade(C.skin, -95), 0.42);
        ctx.lineWidth = 1.7;
        // 胸肌下缘
        const p1 = at(g, 0.88, 13);
        const p2 = at(g, 0.66, 12);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.quadraticCurveTo(at(g, 0.74, 4).x, at(g, 0.72, 4).y, p2.x, p2.y);
        ctx.stroke();
        // 腹直肌两条
        for (let i = 0; i < 2; i++) {
          const yy = 0.56 - i * 0.15;
          const a = at(g, yy, 9);
          const b = at(g, yy - 0.1, 9);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        // 胸口中线
        ctx.beginPath();
        ctx.moveTo(at(g, 0.95, 4).x, at(g, 0.95, 4).y);
        ctx.lineTo(at(g, 0.6, 2).x, at(g, 0.6, 2).y);
        ctx.stroke();
      }
      // 金腰带 + U 扣（压在短裤上沿）
      const w1 = at(g, 0.2, 15);
      const w2 = at(g, 0.2, -15);
      ctx.beginPath();
      ctx.moveTo(w1.x, w1.y);
      ctx.lineTo(w2.x, w2.y);
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 11;
      ctx.stroke();
      ctx.strokeStyle = MONO ? '#ffffff' : C.accent;
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(at(g, 0.2, 11).x, at(g, 0.2, 11).y, 4.4, 0, TAU);
      ctx.stroke();
    },
    head: function (ctx, g, f, C, T) {
      drawHeadBase(ctx, g, f, C, T, { mood: 'angry' });
      ctx.save();
      ctx.translate(g.head.x, g.head.y);
      ctx.rotate(g.headAng);
      // 寸头 + 3 条辫子
      ctx.beginPath();
      ctx.moveTo(-12, -3);
      ctx.quadraticCurveTo(-13, -17, 1, -18);
      ctx.quadraticCurveTo(12, -17, 13, -7);
      ctx.lineTo(8, -11);
      ctx.lineTo(2, -12.5);
      ctx.lineTo(-4, -11.5);
      ctx.closePath();
      ctx.fillStyle = MONO ? '#ffffff' : C.hair;
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      // 辫子（3 条粗辫垂到肩下）
      const sway = Math.sin(T * 2.6) * 2;
      for (let i = 0; i < 3; i++) {
        const bx = -11 + i * 3.4;
        ctx.beginPath();
        ctx.moveTo(bx, -7);
        ctx.quadraticCurveTo(bx - 5 + sway, 6 + i * 2, bx - 7 + sway, 24 + i * 3);
        ctx.strokeStyle = C.outline;
        ctx.lineWidth = 6.4;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.strokeStyle = MONO ? '#ffffff' : C.hair;
        ctx.lineWidth = 4.2;
        ctx.stroke();
        // 辫节
        if (!MONO) {
          ctx.strokeStyle = 'rgba(0,0,0,0.45)';
          ctx.lineWidth = 1.4;
          for (let k = 1; k < 3; k++) {
            const t = k / 3;
            ctx.beginPath();
            ctx.moveTo(lerp(bx, bx - 7 + sway, t) - 2.4, lerp(-7, 24 + i * 3, t));
            ctx.lineTo(lerp(bx, bx - 7 + sway, t) + 2.4, lerp(-7, 24 + i * 3, t));
            ctx.stroke();
          }
        }
      }
      ctx.restore();
    },
    armFront: function (ctx, g, f, C, T) {
      // 大拳套（出拳时沿方向拉伸 1.3 倍）
      const punching = f.state === 'attack' && f.attackKey && f.attackKey !== 'ult';
      const stretch = punching ? 1.3 : 1.0;
      const p = g.handF;
      const ang = Math.atan2(p.y - g.elbowF.y, p.x - g.elbowF.x);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(ang);
      ctx.scale(stretch, 1);
      roundRect(ctx, -10, -11, 21, 22, 8);
      const gg = ctx.createLinearGradient(-10, -10, 11, 11);
      gg.addColorStop(0, '#e5453a');
      gg.addColorStop(1, '#8f1a13');
      ctx.fillStyle = MONO ? '#ffffff' : gg;
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 3;
      ctx.stroke();
      if (!MONO) {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(-6, -7);
        ctx.lineTo(4, -8);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.moveTo(9, -8);
        ctx.lineTo(9, 8);
        ctx.stroke();
      }
      ctx.restore();
    },
    front: function () {
      // 拳套随手臂绘制（armFront 前手 + back 后手）
    },
    back: function (ctx, g, f, C, T) {
      // 后手拳套（画在躯干之前，避免压在腰带上）
      const p = g.handB;
      const ang = Math.atan2(p.y - g.elbowB.y, p.x - g.elbowB.x);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(ang);
      roundRect(ctx, -7.5, -8.5, 16.5, 18, 6.5);
      ctx.fillStyle = MONO ? '#ffffff' : '#7d1712';
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.restore();
    },
  };

  /* ---------------- 舞女：纱衣 + 高腰长裙 + 飘带 ---------------- */
  LOOKS.dancer = {
    mood: 'sly',
    foot: 'shoe',
    bareLegs: true,
    back: function (ctx, g, f, C, T) {
      hangingSleeve(ctx, g.elbowB, g.shB, C, rgba(C.main, 0.55), 26, 18, Math.sin(T * 2.8) * 2);
      // 4 条飘带（正弦流线，单条最长 150px，绘制在角色身后层）
      const cols = [C.main, C.accent, C.sub, C.trim];
      const root = at(g, 0.24, -12);
      for (let i = 0; i < 4; i++) {
        const ph = T * 1.6 + i * 1.1;
        const len = Math.min(150, 132 + i * 7);
        const dir = i % 2 === 0 ? 1 : 0.6;
        ctx.beginPath();
        ctx.moveTo(root.x, root.y - i * 3);
        for (let s = 1; s <= 10; s++) {
          const t = s / 10;
          const x = root.x - t * len * 0.6 * dir + Math.sin(ph + t * 3.4) * 17 * t;
          const y = root.y + t * len * 0.58 + Math.cos(ph + t * 2.6) * 8 * t;
          ctx.lineTo(x, y);
        }
        const grad = ctx.createLinearGradient(root.x, root.y, root.x - 90, root.y + 100);
        grad.addColorStop(0, MONO ? '#ffffff' : cols[i]);
        grad.addColorStop(1, MONO ? '#ffffff' : rgba(cols[i], 0.15));
        ctx.strokeStyle = grad;
        ctx.lineWidth = 7 - i * 0.8;
        ctx.lineCap = 'round';
        ctx.globalAlpha = BASE * (0.92 - i * 0.08);
        ctx.stroke();
        ctx.globalAlpha = BASE;
      }
    },
    hem: function (ctx, g, f, C, T) {
      // 三层裙，越往下越透
      const layers = [
        { y: 22, w: 20, a: 0.92, col: C.main },
        { y: 42, w: 27, a: 0.6, col: shade(C.main, -30) },
        { y: 60, w: 33, a: 0.34, col: C.trim },
      ];
      for (let i = 0; i < layers.length; i++) {
        const L = layers[i];
        const sw = Math.sin(T * 2.6 + i) * 3;
        const a = at(g, 0.1, L.w);
        const b = at(g, 0.1, -L.w);
        ctx.globalAlpha = BASE * L.a;
        cloth(ctx, [
          at(g, 0.24, L.w * 0.5), { x: a.x + 5 + sw, y: a.y + L.y },
          { x: (a.x + b.x) / 2, y: a.y + L.y + 6 }, { x: b.x - 5 - sw, y: b.y + L.y },
          at(g, 0.24, -L.w * 0.5),
        ], L.col, MONO ? null : C.outline, 2.6);
        ctx.globalAlpha = BASE;
      }
      // 金腰链
      if (!MONO) {
        ctx.strokeStyle = rgba(C.trim, 0.9);
        ctx.lineWidth = 2;
        for (let i = 0; i < 5; i++) {
          const p = at(g, 0.26, 12 - i * 6);
          ell(ctx, p.x, p.y + 3 + Math.sin(T * 3 + i) * 1.2, 2.6, 3.4);
          ctx.stroke();
        }
      }
    },
    torso: function (ctx, g, f, C, T) {
      // 半透明纱
      ctx.globalAlpha = BASE * 0.8;
      torsoPath(ctx, g);
      ctx.fillStyle = MONO ? '#ffffff' : rgba(C.sub, 0.55);
      ctx.fill();
      ctx.globalAlpha = BASE;
      // 领口交叉
      ctx.strokeStyle = MONO ? '#ffffff' : C.trim;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(at(g, 1.0, 12).x, at(g, 1.0, 12).y);
      ctx.lineTo(at(g, 0.4, -4).x, at(g, 0.4, -4).y);
      ctx.stroke();
    },
    head: function (ctx, g, f, C, T) {
      drawHeadBase(ctx, g, f, C, T, { mood: 'sly' });
      ctx.save();
      ctx.translate(g.head.x, g.head.y);
      ctx.rotate(g.headAng);
      // 发 + 高髻
      ctx.beginPath();
      ctx.moveTo(-12, -2);
      ctx.quadraticCurveTo(-14, -17, 0, -19);
      ctx.quadraticCurveTo(12, -18, 13, -5);
      ctx.lineTo(8, -10);
      ctx.lineTo(-4, -10);
      ctx.closePath();
      ctx.fillStyle = MONO ? '#ffffff' : C.hair;
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 2;
      ctx.stroke();
      circle(ctx, -3, -20, 7);
      ctx.fillStyle = MONO ? '#ffffff' : shade(C.hair, -14);
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.stroke();
      // 金花 + 步摇
      if (!MONO) {
        ctx.fillStyle = C.trim;
        for (let i = 0; i < 5; i++) {
          const a = i * TAU / 5 + T * 0.2;
          ell(ctx, -3 + Math.cos(a) * 4, -20 + Math.sin(a) * 4, 2.6, 2.6);
          ctx.fill();
        }
        ctx.strokeStyle = C.trim;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(-9, -18);
        ctx.quadraticCurveTo(-13 + Math.sin(T * 3) * 2, -6, -12 + Math.sin(T * 3) * 3, 2);
        ctx.stroke();
        ctx.fillStyle = C.accent;
        ell(ctx, -12 + Math.sin(T * 3) * 3, 3.5, 2, 2.4);
        ctx.fill();
      }
      ctx.restore();
    },
    armFront: function (ctx, g, f, C, T) {
      hangingSleeve(ctx, g.elbowF, g.shF, C, rgba(C.main, 0.62), 28, 20, Math.sin(T * 2.8 + 1) * 2.4);
    },
  };

  /* ---------------- 恶龙：长颈龙头 + 龙翼 + 尾巴 ---------------- */
  LOOKS.dragon = {
    mood: 'beast',
    foot: 'bare',
    bareLegs: true,
    ground: function (ctx, g, f, C, T) {
      if (MONO) return;
      // 脚下腐绿火焰（3 层）+ 地面辉光
      const bx = 0;
      const by = -2;
      const gr = ctx.createRadialGradient(bx, by, 4, bx, by, 46);
      gr.addColorStop(0, 'rgba(141,255,106,0.42)');
      gr.addColorStop(1, 'rgba(60,160,60,0)');
      ctx.fillStyle = gr;
      ell(ctx, bx, by, 46, 14);
      ctx.fill();
      for (let i = 0; i < 3; i++) {
        const h = 16 + i * 8 + Math.sin(T * 7 + i * 2) * 4;
        ctx.beginPath();
        ctx.moveTo(-16 + i * 6, by);
        ctx.quadraticCurveTo(-10 + i * 6 + Math.sin(T * 6 + i) * 5, by - h * 0.6, -4 + i * 6, by - h);
        ctx.quadraticCurveTo(2 + i * 6, by - h * 0.4, 6 + i * 6, by);
        ctx.closePath();
        ctx.fillStyle = 'rgba(141,255,106,' + (0.34 - i * 0.08) + ')';
        ctx.fill();
      }
    },
    back: function (ctx, g, f, C, T) {
      // 尾巴（3 段）
      const r = at(g, 0.05, -12);
      const sway = Math.sin(T * 2.4) * 7;
      const p1 = { x: r.x - 22, y: r.y + 14 + sway * 0.3 };
      const p2 = { x: r.x - 40, y: r.y + 34 + sway * 0.6 };
      const p3 = { x: r.x - 36, y: r.y + 56 + sway };
      ctx.beginPath();
      ctx.moveTo(r.x, r.y - 6);
      ctx.quadraticCurveTo(p1.x, p1.y, p2.x, p2.y);
      ctx.quadraticCurveTo(p3.x, p3.y, p3.x - 8, p3.y + 8);
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 15;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.strokeStyle = MONO ? '#ffffff' : C.main;
      ctx.lineWidth = 10;
      ctx.stroke();
      // 尾刺
      if (!MONO) {
        ctx.fillStyle = '#cfe3b6';
        ctx.strokeStyle = C.outline;
        ctx.lineWidth = 1.6;
        for (let i = 0; i < 3; i++) {
          const t = 0.35 + i * 0.22;
          const x = lerp(r.x, p2.x, t) - 4;
          const y = lerp(r.y, p2.y, t);
          ctx.beginPath();
          ctx.moveTo(x, y - 5);
          ctx.lineTo(x - 8, y - 13);
          ctx.lineTo(x + 1, y - 9);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }
      // 龙翼（2 片膜 + 骨架）
      drawDragonWing(ctx, at(g, 0.74, -11), -1, C, T, 66);
    },
    hem: function (ctx, g, f, C, T) {
      // 鳞甲下摆
      const fr = at(g, 0.12, 14);
      const bk = at(g, 0.12, -14);
      cloth(ctx, [
        fr, { x: fr.x + 3, y: fr.y + 30 }, { x: bk.x - 3, y: bk.y + 30 }, bk,
      ], shade(C.main, -26), C.outline, 3);
    },
    torso: function (ctx, g, f, C, T) {
      if (!MONO) {
        // 胸腹鳞
        ctx.strokeStyle = rgba(shade(C.main, 60), 0.55);
        ctx.lineWidth = 1.6;
        for (let i = 0; i < 4; i++) {
          const p = at(g, 0.3 + i * 0.16, 6);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 6, -1.2, 1.2);
          ctx.stroke();
        }
      }
    },
    head: function (ctx, g, f, C, T) {
      // 长颈：约 1.5 个头长的颈部曲线（3 段），idle 缓慢左右摆动、攻击时前伸
      const base = at(g, 0.94, 2);
      const hd0 = g.head;
      const atk = f && f.state === 'attack' ? 1 : 0;
      const reach = 34 + atk * 14;
      const hd = { x: hd0.x + 5 + atk * 12, y: hd0.y - reach };
      const sway = Math.sin(T * 1.7) * 5 * (1 - atk * 0.7);
      const p1 = { x: base.x - 3 + sway * 0.4, y: base.y - reach * 0.36 };
      const p2 = { x: hd.x - 8 + sway, y: hd.y + reach * 0.34 };
      const p3 = { x: hd.x - 2 + sway * 0.5, y: hd.y + reach * 0.1 };

      // 颈部锥形：根部粗、近头细
      taperPath(ctx, [base, p1, p2, p3, hd], [10.4, 9.2, 7.8, 7.0, 6.4]);
      ctx.fillStyle = MONO ? '#ffffff' : C.main;
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 3;
      ctx.stroke();
      if (!MONO) {
        // 颈部迎光侧明暗
        ctx.strokeStyle = 'rgba(0,0,0,0.22)';
        ctx.lineWidth = 3.4;
        ctx.beginPath();
        ctx.moveTo(p1.x - 4, p1.y);
        ctx.quadraticCurveTo(p3.x - 6, p3.y, hd.x - 4, hd.y + 4);
        ctx.stroke();
        // 颈部背刺
        ctx.fillStyle = '#cfe3b6';
        ctx.strokeStyle = C.outline;
        ctx.lineWidth = 1.6;
        for (let i = 0; i < 4; i++) {
          const t = 0.18 + i * 0.2;
          const x = lerp(base.x, p2.x, t) + sway * t - 4;
          const y = lerp(base.y, p2.y, t);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - 8, y - 10);
          ctx.lineTo(x + 2, y - 4);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }

      // 龙头（挂在颈部顶端）
      ctx.save();
      ctx.translate(hd.x, hd.y);
      ctx.rotate(g.headAng * 0.7 - 0.1 + atk * 0.1);
      ctx.scale(0.98, 0.98);
      // 头颅
      ctx.beginPath();
      ctx.moveTo(-11, -8);
      ctx.quadraticCurveTo(4, -13, 13, -6);
      ctx.quadraticCurveTo(21, -3, 20, 3);
      ctx.quadraticCurveTo(9, 9, -2, 8);
      ctx.quadraticCurveTo(-12, 6, -11, -8);
      ctx.closePath();
      const hg = ctx.createLinearGradient(-10, -8, 14, 8);
      hg.addColorStop(0, shade(C.main, 20));
      hg.addColorStop(1, shade(C.main, -34));
      ctx.fillStyle = MONO ? '#ffffff' : hg;
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 2.6;
      ctx.stroke();
      // 吻部（上颚 + 下颚）
      if (!MONO) {
        ctx.beginPath();
        ctx.moveTo(12, -3);
        ctx.lineTo(23, -1);
        ctx.lineTo(14, 2);
        ctx.closePath();
        ctx.fillStyle = shade(C.main, 10);
        ctx.fill();
        // 下颚
        ctx.beginPath();
        ctx.moveTo(6, 5);
        ctx.lineTo(19, 4);
        ctx.lineTo(8, 10);
        ctx.closePath();
        ctx.fillStyle = shade(C.main, -24);
        ctx.fill();
        // 獠牙
        ctx.fillStyle = '#fff8e8';
        for (let i = 0; i < 3; i++) {
          const x = 8 + i * 4.4;
          ctx.beginPath();
          ctx.moveTo(x, 4);
          ctx.lineTo(x + 1.6, 8.6);
          ctx.lineTo(x + 3, 4);
          ctx.closePath();
          ctx.fill();
        }
        // 独角
        ctx.strokeStyle = '#f2e6cd';
        ctx.lineWidth = 3.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.quadraticCurveTo(-2, -22, 8, -24);
        ctx.stroke();
        // 竖瞳
        ctx.beginPath();
        ctx.ellipse(6, -4.4, 3.4, 2.6, 0, 0, TAU);
        ctx.fillStyle = '#f4e8b0';
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(6, -4.4, 0.8, 2.4, 0, 0, TAU);
        ctx.fillStyle = '#101008';
        ctx.fill();
        // 鼻孔
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ell(ctx, 19, 0.6, 1.4, 1);
        ctx.fill();
      }
      // 眼镜（全员彩蛋：龙的鼻梁上也架一副）
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = MONO ? '#ffffff' : 'rgba(226,244,255,0.9)';
      roundRect(ctx, 2.6, -7.4, 8.4, 6.4, 2);
      ctx.stroke();
      roundRect(ctx, 12.4, -6.8, 8.2, 6, 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(11, -4.6);
      ctx.lineTo(12.4, -4.4);
      ctx.stroke();
      ctx.restore();
    },
    legFront: function (ctx, g, f, C, T) {
      // 爪
      if (MONO) return;
      const p = g.footF;
      ctx.strokeStyle = '#f2e6cd';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(p.x + 4 + i * 2, p.y + 2);
        ctx.lineTo(p.x + 11 + i * 3, p.y + 8 - i * 2);
        ctx.stroke();
      }
    },
  };

  /** 龙翼：膜 + 骨架 + 锯齿后缘。 */
  function drawDragonWing(ctx, root, dir, C, T, size) {
    const flap = Math.sin(T * 1.9) * 0.12;
    const tips = [];
    for (let i = 0; i < 4; i++) {
      const a = -2.62 + i * 0.30 + flap;
      tips.push({ x: root.x + Math.cos(a) * size * dir, y: root.y + Math.sin(a) * size });
    }
    // 膜（带锯齿后缘）
    ctx.beginPath();
    ctx.moveTo(root.x, root.y);
    for (let i = 0; i < tips.length; i++) {
      const p = tips[i];
      ctx.quadraticCurveTo(
        lerp(root.x, p.x, 0.55), lerp(root.y, p.y, 0.55) - 10,
        p.x, p.y
      );
      if (i < tips.length - 1) {
        const nx = tips[i + 1];
        // 两羽尖之间的凹口
        ctx.quadraticCurveTo(
          lerp(p.x, nx.x, 0.5) - 4 * dir, lerp(p.y, nx.y, 0.5) + 10,
          nx.x, nx.y
        );
      }
    }
    ctx.quadraticCurveTo(root.x - 6 * dir, root.y + 18, root.x, root.y);
    ctx.closePath();
    ctx.fillStyle = MONO ? '#ffffff' : rgba(C.sub, 0.55);
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    // 骨架
    ctx.strokeStyle = MONO ? '#ffffff' : shade(C.main, -14);
    ctx.lineWidth = 2.8;
    ctx.lineCap = 'round';
    for (let i = 0; i < tips.length; i++) {
      ctx.beginPath();
      ctx.moveTo(root.x, root.y);
      ctx.quadraticCurveTo(
        lerp(root.x, tips[i].x, 0.5), lerp(root.y, tips[i].y, 0.5) - 6,
        tips[i].x, tips[i].y
      );
      ctx.stroke();
    }
  }

  /* ---------------- 术士：黑风衣 + 法阵 + 法球 ---------------- */
  LOOKS.warlock = {
    mood: 'calm',
    foot: 'shoe',
    sleeve: true,
    ground: function (ctx, g, f, C, T) {
      if (MONO) return;
      // 脚下五芒星法阵（缓慢旋转）
      const cx = 0;
      const cy = -4;
      const rot = T * 0.35;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, 0.34);
      ctx.rotate(rot);
      ctx.globalAlpha = BASE * (0.5 + Math.sin(T * 2) * 0.12);
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 2;
      circle(ctx, 0, 0, 46);
      ctx.stroke();
      ctx.beginPath();
      circle(ctx, 0, 0, 36);
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * TAU * 2 / 5;
        const x = Math.cos(a) * 42;
        const y = Math.sin(a) * 42;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = rgba(C.accent, 0.85);
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * TAU / 5;
        circle(ctx, Math.cos(a) * 36, Math.sin(a) * 36, 1.8);
        ctx.fill();
      }
      ctx.globalAlpha = BASE;
      ctx.restore();
    },
    back: function (ctx, g, f, C, T) {
      // 风衣后摆（3 片）
      const sw = Math.sin(T * 2.1) * 3;
      hangingSleeve(ctx, g.elbowB, g.shB, C, shade(C.main, -26), 34, 20, sw * 0.6);
      for (let i = 0; i < 3; i++) {
        const x0 = at(g, 0.14, -14 + i * 2);
        cloth(ctx, [
          x0,
          { x: x0.x - 6 - i * 7 + sw, y: x0.y + 34 },
          { x: x0.x - 10 - i * 9 + sw * 1.3, y: x0.y + 64 },
          { x: x0.x + 6, y: x0.y + 58 },
        ], shade(C.main, -18 + i * 6), C.outline, 2.6);
      }
    },
    torso: function (ctx, g, f, C, T) {
      // 高立领
      const n1 = at(g, 1.02, 8);
      const n2 = at(g, 1.02, -11);
      cloth(ctx, [
        { x: n1.x, y: n1.y }, { x: n2.x, y: n2.y },
        { x: n2.x - 3, y: n2.y - 12 }, { x: n1.x + 3, y: n1.y - 10 },
      ], shade(C.main, 10), C.outline, 2.4);
      // 内搭马甲
      ctx.beginPath();
      ctx.moveTo(at(g, 0.92, 11).x, at(g, 0.92, 11).y);
      ctx.lineTo(at(g, 0.26, 9).x, at(g, 0.26, 9).y);
      ctx.lineTo(at(g, 0.26, -6).x, at(g, 0.26, -6).y);
      ctx.lineTo(at(g, 0.92, -7).x, at(g, 0.92, -7).y);
      ctx.closePath();
      ctx.fillStyle = MONO ? '#ffffff' : shade(C.sub, -20);
      ctx.fill();
      // 双排铜扣
      if (!MONO) {
        ctx.fillStyle = C.trim;
        for (let i = 0; i < 4; i++) {
          const a = at(g, 0.82 - i * 0.16, 6);
          const b = at(g, 0.82 - i * 0.16, -1);
          circle(ctx, a.x, a.y, 1.6);
          ctx.fill();
          circle(ctx, b.x, b.y, 1.6);
          ctx.fill();
        }
      }
    },
    armFront: function (ctx, g, f, C, T) {
      hangingSleeve(ctx, g.elbowF, g.shF, C, C.main, 36, 21, Math.sin(T * 2.1 + 1) * 2.6);
    },
    front: function (ctx, g, f, C, T) {
      if (MONO) return;
      // 悬浮法球（呼吸缩放 + 光晕）
      const p = g.handF;
      const s = 1 + Math.sin(T * 2.6) * 0.12;
      const x = p.x + 10;
      const y = p.y - 18 + Math.sin(T * 1.8) * 3;
      const gl = ctx.createRadialGradient(x, y, 1, x, y, 26);
      gl.addColorStop(0, 'rgba(190,120,255,0.6)');
      gl.addColorStop(1, 'rgba(120,50,220,0)');
      ctx.fillStyle = gl;
      circle(ctx, x, y, 26);
      ctx.fill();
      const og = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, 8 * s);
      og.addColorStop(0, '#efe0ff');
      og.addColorStop(0.5, C.accent);
      og.addColorStop(1, '#3b1a66');
      ctx.fillStyle = og;
      circle(ctx, x, y, 8 * s);
      ctx.fill();
    },
  };

  /* ---------------- 游侠：披风 + 皮甲 + 长弓 ---------------- */
  LOOKS.ranger = {
    mood: 'focus',
    foot: 'shoe',
    back: function (ctx, g, f, C, T) {
      // 披风
      const sw = Math.sin(T * 2.2) * 4;
      const s = at(g, 0.92, -10);
      ctx.beginPath();
      ctx.moveTo(s.x + 8, s.y - 4);
      ctx.quadraticCurveTo(s.x - 26 + sw, s.y + 24, s.x - 34 + sw * 1.4, s.y + 62);
      ctx.lineTo(s.x - 2, s.y + 54 + sw * 0.4);
      ctx.lineTo(s.x + 4, s.y + 6);
      ctx.closePath();
      const cg = ctx.createLinearGradient(s.x, s.y, s.x - 30, s.y + 60);
      cg.addColorStop(0, shade(C.main, 16));
      cg.addColorStop(1, shade(C.main, -34));
      ctx.fillStyle = MONO ? '#ffffff' : cg;
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 2.8;
      ctx.stroke();
      // 肩上扣环
      if (!MONO) {
        circle(ctx, s.x + 5, s.y - 2, 3.6);
        ctx.fillStyle = C.trim;
        ctx.fill();
        ctx.strokeStyle = C.outline;
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
      // 箭袋 + 3 支箭羽
      const q = at(g, 0.5, -16);
      ctx.save();
      ctx.translate(q.x, q.y);
      ctx.rotate(-0.34);
      roundRect(ctx, -6, -22, 13, 40, 5);
      ctx.fillStyle = MONO ? '#ffffff' : shade(C.sub, -6);
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 2.4;
      ctx.stroke();
      if (!MONO) {
        for (let i = 0; i < 3; i++) {
          ctx.strokeStyle = '#d8c9a0';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-3 + i * 3, -22);
          ctx.lineTo(-3 + i * 3, -33);
          ctx.stroke();
          ctx.fillStyle = C.accent;
          ctx.beginPath();
          ctx.moveTo(-3 + i * 3, -33);
          ctx.lineTo(-7 + i * 3, -28);
          ctx.lineTo(1 + i * 3, -28);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.restore();
    },
    torso: function (ctx, g, f, C, T) {
      // 皮甲胸片
      ctx.beginPath();
      ctx.moveTo(at(g, 0.96, 13).x, at(g, 0.96, 13).y);
      ctx.lineTo(at(g, 0.42, 11).x, at(g, 0.42, 11).y);
      ctx.lineTo(at(g, 0.42, -9).x, at(g, 0.42, -9).y);
      ctx.lineTo(at(g, 0.96, -11).x, at(g, 0.96, -11).y);
      ctx.closePath();
      ctx.fillStyle = MONO ? '#ffffff' : shade(C.sub, 1 + 0);
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 2.4;
      ctx.stroke();
      // 胸甲分片线 + 铆钉
      if (!MONO) {
        ctx.strokeStyle = rgba(C.trim, 0.55);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(at(g, 0.86, 12).x, at(g, 0.86, 12).y);
        ctx.lineTo(at(g, 0.5, 10).x, at(g, 0.5, 10).y);
        ctx.stroke();
        ctx.fillStyle = C.trim;
        for (let i = 0; i < 3; i++) {
          const p = at(g, 0.9 - i * 0.16, 9);
          circle(ctx, p.x, p.y, 1.4);
          ctx.fill();
        }
      }
      // 腰带
      const w1 = at(g, 0.26, 14);
      const w2 = at(g, 0.26, -13);
      ctx.beginPath();
      ctx.moveTo(w1.x, w1.y);
      ctx.lineTo(w2.x, w2.y);
      ctx.strokeStyle = MONO ? '#ffffff' : shade(C.sub, -18);
      ctx.lineWidth = 6;
      ctx.stroke();
    },
    head: function (ctx, g, f, C, T) {
      drawHeadBase(ctx, g, f, C, T, { mood: 'focus' });
      ctx.save();
      ctx.translate(g.head.x, g.head.y);
      ctx.rotate(g.headAng);
      // 短发 + 额带
      ctx.beginPath();
      ctx.moveTo(-12, -3);
      ctx.quadraticCurveTo(-13, -17, 1, -18);
      ctx.quadraticCurveTo(12, -17, 13, -6);
      ctx.lineTo(7, -10);
      ctx.lineTo(0, -11.5);
      ctx.lineTo(-6, -10);
      ctx.closePath();
      ctx.fillStyle = MONO ? '#ffffff' : C.hair;
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 2;
      ctx.stroke();
      // 额带
      ctx.strokeStyle = MONO ? '#ffffff' : C.accent;
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(-11.5, -7.5);
      ctx.lineTo(12.5, -9.5);
      ctx.stroke();
      ctx.restore();
    },
    front: function (ctx, g, f, C, T) {
      // 长弓：竖向持弓（弦垂直），拉弓时弓臂弯曲加深、弦被拉开
      const drawing = f.state === 'attack' && (f.attackKey === 'skill' || f.attackKey === 'ult');
      const pull = drawing ? 1 : 0.25;
      const p = g.handF;
      ctx.save();
      ctx.translate(p.x + 6, p.y - 2);
      ctx.rotate(-0.1);
      const tipY = 48;
      const bend = 26 + pull * 10;   // 弓腹（朝前）的凸出量
      const nock = -6 - pull * 16;   // 弦被拉开后的握弦点 x

      // 弓身：先描深色轮廓再加本色，得到有厚度的弓臂
      ctx.lineCap = 'round';
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(0, -tipY);
      ctx.quadraticCurveTo(bend, -tipY * 0.44, bend, 0);
      ctx.quadraticCurveTo(bend, tipY * 0.44, 0, tipY);
      ctx.stroke();
      ctx.strokeStyle = MONO ? '#ffffff' : '#7a5334';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, -tipY);
      ctx.quadraticCurveTo(bend, -tipY * 0.44, bend, 0);
      ctx.quadraticCurveTo(bend, tipY * 0.44, 0, tipY);
      ctx.stroke();
      if (!MONO) {
        // 弓背高光
        ctx.strokeStyle = 'rgba(210,168,110,0.75)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(1, -tipY + 2);
        ctx.quadraticCurveTo(bend - 3, -tipY * 0.44, bend - 3, 0);
        ctx.quadraticCurveTo(bend - 3, tipY * 0.44, 1, tipY - 2);
        ctx.stroke();
      }
      // 握把（riser）
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 11;
      ctx.beginPath();
      ctx.moveTo(bend - 5, -9);
      ctx.lineTo(bend - 5, 9);
      ctx.stroke();
      ctx.strokeStyle = MONO ? '#ffffff' : '#4a3524';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(bend - 5, -9);
      ctx.lineTo(bend - 5, 9);
      ctx.stroke();

      // 弓弦：两段直线在握弦点交汇（拉弓时明显向后凹）
      ctx.strokeStyle = MONO ? '#ffffff' : 'rgba(232,238,252,0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -tipY);
      ctx.lineTo(nock, 0);
      ctx.lineTo(0, tipY);
      ctx.stroke();

      if (drawing && !MONO) {
        // 搭箭：从握弦点穿出弓把
        ctx.strokeStyle = '#e8dcc0';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(nock, 0);
        ctx.lineTo(bend + 34, 0);
        ctx.stroke();
        ctx.fillStyle = '#dff4ff';
        ctx.beginPath();
        ctx.moveTo(bend + 41, 0);
        ctx.lineTo(bend + 32, -4.4);
        ctx.lineTo(bend + 32, 4.4);
        ctx.closePath();
        ctx.fill();
        // 尾羽
        ctx.fillStyle = C.accent;
        ctx.beginPath();
        ctx.moveTo(nock + 1, 0);
        ctx.lineTo(nock + 11, -5);
        ctx.lineTo(nock + 11, 5);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    },
  };

  /* ---------------- 浪人：黑和服 + 袴 + 武士髻 + 太刀 ---------------- */
  LOOKS.ronin = {
    mood: 'grim',
    foot: 'shoe',
    sleeve: true,
    back: function (ctx, g, f, C, T) {
      // 刀鞘挂腰（身后）
      const h = at(g, 0.16, -12);
      ctx.save();
      ctx.translate(h.x, h.y);
      ctx.rotate(-0.28 + Math.sin(T * 1.4) * 0.02);
      roundRect(ctx, -34, -3, 44, 6, 3);
      ctx.fillStyle = MONO ? '#ffffff' : shade(C.main, -30);
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    },
    hem: function (ctx, g, f, C, T) {
      // 袴（下摆分两片）
      const sw = Math.sin(T * 2) * 2.5;
      const fr = at(g, 0.1, 14);
      const bk = at(g, 0.1, -14);
      cloth(ctx, [
        fr, { x: fr.x + 9 + sw, y: fr.y + 52 }, { x: fr.x - 4, y: fr.y + 56 },
        { x: fr.x - 16, y: fr.y + 50 },
      ], C.main, C.outline, 3);
      cloth(ctx, [
        bk, { x: bk.x - 8 - sw, y: bk.y + 54 }, { x: bk.x + 4, y: bk.y + 57 },
        { x: bk.x + 14, y: bk.y + 50 },
      ], shade(C.main, -14), C.outline, 3);
      if (!MONO) {
        ctx.strokeStyle = rgba(C.sub, 0.85);
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(fr.x - 4 + i * 3, fr.y + 6);
          ctx.lineTo(fr.x - 8 + i * 5, fr.y + 48);
          ctx.stroke();
        }
      }
    },
    torso: function (ctx, g, f, C, T) {
      // 白襦袢领口 + 黑襟
      const n1 = at(g, 1.0, 12);
      const n2 = at(g, 0.34, 2);
      ctx.strokeStyle = MONO ? '#ffffff' : '#e8e4dc';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(n1.x, n1.y);
      ctx.lineTo(n2.x, n2.y);
      ctx.stroke();
      ctx.strokeStyle = MONO ? '#ffffff' : shade(C.main, -10);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(n1.x + 2, n1.y + 1);
      ctx.lineTo(n2.x + 2, n2.y + 1);
      ctx.stroke();
      // 宽腰带
      const w1 = at(g, 0.2, 15);
      const w2 = at(g, 0.2, -15);
      ctx.beginPath();
      ctx.moveTo(w1.x, w1.y);
      ctx.lineTo(w2.x, w2.y);
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 12;
      ctx.stroke();
      ctx.strokeStyle = MONO ? '#ffffff' : shade(C.accent, -30);
      ctx.lineWidth = 8;
      ctx.stroke();
    },
    head: function (ctx, g, f, C, T) {
      drawHeadBase(ctx, g, f, C, T, { mood: 'grim' });
      ctx.save();
      ctx.translate(g.head.x, g.head.y);
      ctx.rotate(g.headAng);
      // 剃青的两侧 + 顶髻
      ctx.beginPath();
      ctx.moveTo(-12, -6);
      ctx.quadraticCurveTo(-12, -17, 1, -18.5);
      ctx.quadraticCurveTo(12, -17, 12.5, -7);
      ctx.lineTo(6, -10);
      ctx.lineTo(-6, -10);
      ctx.closePath();
      ctx.fillStyle = MONO ? '#ffffff' : shade(C.hair, -10);
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 2;
      ctx.stroke();
      // 小圆髻
      circle(ctx, -2, -20, 5.2);
      ctx.fillStyle = MONO ? '#ffffff' : C.hair;
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.stroke();
      ctx.restore();
    },
    front: function (ctx, g, f, C, T) {
      const attacking = f.state === 'attack';
      const p = g.handF;
      // 刀柄（握在手中）
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(attacking ? -0.9 : 0.6);
      roundRect(ctx, -3, -16, 6, 18, 2.4);
      ctx.fillStyle = MONO ? '#ffffff' : shade(C.sub, -20);
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      // 刀镡
      circle(ctx, 0, -16, 4.2);
      ctx.fillStyle = MONO ? '#ffffff' : C.trim;
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.stroke();
      // 刀身
      if (attacking) {
        ctx.beginPath();
        ctx.moveTo(0, -20);
        ctx.quadraticCurveTo(3, -64, 6, -96);
        ctx.lineTo(0, -92);
        ctx.closePath();
        ctx.fillStyle = MONO ? '#ffffff' : '#dfe8f2';
        ctx.fill();
        ctx.strokeStyle = C.outline;
        ctx.lineWidth = 1.6;
        ctx.stroke();
        if (!MONO) {
          // 两段刀光拖尾
          ctx.strokeStyle = rgba(C.glow, 0.5);
          ctx.lineWidth = 9;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(-2, -26);
          ctx.quadraticCurveTo(-16, -56, -6, -88);
          ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.55)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(-1, -30);
          ctx.quadraticCurveTo(-10, -56, -4, -84);
          ctx.stroke();
        }
      }
      ctx.restore();
    },
  };

  /* ============================================================
   *  5. 场景背景 → 已拆分到 js/art-bg.js
   *     （背景不依赖角色绘制的 MONO/BASE，独立成文件更易维护）
   * ============================================================ */

  /** 接触阴影（alpha 随离地高度衰减）。 */
  Art.drawShadow = function (ctx, f) {
    const h = Math.max(0, BVN.CFG.GROUND_Y - f.y);
    const k = Math.max(0.22, 1 - h / 420);
    ctx.beginPath();
    ctx.ellipse(f.x, BVN.CFG.GROUND_Y + 3, 34 * k, 9 * k, 0, 0, TAU);
    ctx.fillStyle = 'rgba(0,0,0,' + (0.42 * k).toFixed(3) + ')';
    ctx.fill();
  };

  /* ---------- 立绘 ---------- */

  Art.load = function (onDone) {
    const list = BVN.ROSTER;
    Art.total = list.length;
    Art.loaded = 0;
    list.forEach(function (c) {
      const img = new Image();
      img.onload = function () {
        Art.loaded++;
        if (Art.loaded >= Art.total && onDone) onDone();
      };
      img.onerror = function () {
        Art.loaded++;
        if (Art.loaded >= Art.total && onDone) onDone();
      };
      img.src = c.img;
      Art.images[c.id] = img;
    });
  };

  Art.img = function (id) {
    return Art.images[id];
  };

  /**
   * 以 cover 方式把立绘绘入矩形，并按「人脸锚点」定位裁切窗口。
   * @param {CanvasRenderingContext2D} ctx 目标上下文
   * @param {HTMLImageElement} img 已加载的立绘
   * @param {number} x 目标矩形左上角 x
   * @param {number} y 目标矩形左上角 y
   * @param {number} w 目标矩形宽
   * @param {number} h 目标矩形高
   * @param {number} [fx=0.5] 人脸中心在源图中的归一化 x
   * @param {number} [fy=0.34] 人脸中心在源图中的归一化 y
   * @param {number} [zoom=1] 额外放大倍数：>1 时窗口收紧、以人脸锚点为中心，
   *                          用于把「全身构图」的立绘裁成胸像（脸更大更好认）
   */
  Art.drawCover = function (ctx, img, x, y, w, h, fx, fy, zoom) {
    if (!img || !img.width || !img.height) {
      ctx.fillStyle = '#1a1c26';
      ctx.fillRect(x, y, w, h);
      return;
    }
    if (w <= 0 || h <= 0) return;
    const ax = fx == null ? 0.5 : clamp(fx, 0, 1);
    const ay = fy == null ? 0.34 : clamp(fy, 0, 1);
    const z = zoom == null ? 1 : clamp(zoom, 1, 6);
    const ir = img.width / img.height;
    const rr = w / h;
    // ① 先用 cover 求「刚好铺满」的窗口
    let sw = img.width;
    let sh = img.height;
    if (ir > rr) sw = img.height * rr; else sh = img.width / rr;
    // ② 再按 zoom 收紧窗口（宽高同比例缩，保持目标长宽比）
    sw /= z;
    sh /= z;
    const maxSx = Math.max(0, img.width - sw);
    const maxSy = Math.max(0, img.height - sh);
    const sx = Math.min(maxSx, Math.max(0, img.width * ax - sw * 0.5));
    const sy = Math.min(maxSy, Math.max(0, img.height * ay - sh * 0.5));
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  };

  /**
   * 内部绘制原语（供 js/art-bg.js 使用）。
   * 背景只读这些纯函数，不碰 MONO / BASE 这类随帧变化的状态，
   * 所以拆文件后行为与拆分前完全一致。
   */
  Art._ = {
    shade: shade,
    rgba: rgba,
    lerp: lerp,
    clamp: clamp,
    circle: circle,
    ell: ell,
    poly: poly,
    pt: pt,
    roundRect: roundRect,
    taper: taper,
    taperPath: taperPath,
  };

  /* ============================================================
   *  5. 对外接口（第三期新增：供 js/art-assist.js 注册援助骨骼外观）
   *     只暴露，不改任何既有绘制逻辑，也不改已注册的 8 个角色外观。
   * ============================================================ */

  /**
   * 注册一套角色外观。look 的钩子集合与内置 LOOKS 完全一致：
   * mood/foot/fabric/sleeve/bareLegs/ground/back/arm/legBack/hem/torso/legFront/head/armFront/front。
   * 注册键必须与 def.build 一致（art-assist 里 = ASSISTS[].build = ASSISTS[].id）；
   * 写错键会静默回退 LOOKS.ronin（表现为"变成浪人"，一眼可发现）。
   * @param {string} buildId 外观键
   * @param {Object} lookFn 钩子集合（可含 fabric/sleeve/mood/foot 等数据字段）
   * @returns {boolean} 是否注册成功
   */
  Art.registerLook = function (buildId, lookFn) {
    if (typeof buildId !== 'string' || buildId === '') return false;
    if (!lookFn || typeof lookFn !== 'object') return false;
    LOOKS[buildId] = lookFn;
    return true;
  };

  /**
   * 绘制原语工具箱。art-assist.js 只允许通过它取原语，
   * 从而保证 7 个援助与 8 个角色共用同一套描边/明暗/配色规范。
   */
  Art.kit = {
    shade: shade,       // 明暗派生
    rgba: rgba,         // 透明度派生
    ell: ell,           // 椭圆路径
    circle: circle,     // 圆路径
    taperPath: taperPath, // 变宽折线路径（刀光/绳索/拂尘/链）
    cloth: cloth,       // 布片（下摆/披风/外套）
    ribbon: ribbon,     // 飘带
    at: at,             // 沿骨骼取点 at(g,u,v)
    pt: pt,             // 极坐标偏移 pt(origin, angle, len)
    roundRect: roundRect, // 圆角矩形
  };

  BVN.Art = Art;
})(window.BVN);

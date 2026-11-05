/* js/super.js — 超级技能（奥义）系统：资源校验 / 全屏演出 / 命中派发 / 8 套差异化终结动画
 *
 * 数据源：BVN.SUPERS（js/data.js，8 条，字段 name/kanji/romaji/quote/total/phases/
 *         hit/cam/tint/fx/portrait）。本文件只消费数据，不硬编码任何角色的帧数或颜色。
 *
 * 生命周期（设计稿 §2.6 / §3）：
 *   tryActivate(side, G)  本地发起：校验 → 扣资源 → 建 G.superLock → 施法者进 'attack'
 *   beginRemote(side, id, G) 联机客机端：只演出不结算（hitDone 恒 true）
 *   update(G, dt)         每帧推进 t / 阶段 / 霸体续期 / hit 帧一次性结算 / 结束收尾
 *   drawCutscene(ctx, G)  全屏绘制（压暗 + 色带 + 真人立绘 CG + 终结文字 + FX）
 *   abort(G)              断线 / 回合切换：清锁并让施法者回到可行动状态
 *   isActive(G)           是否有演出在进行
 *   updateCharge(G, dt)   自然充能（CFG.SUPER_GAIN_REGEN，单位「点/秒」，必须 ×dt）
 *
 * 约束：纯原生 Canvas2D，无框架无 ESM，不新增图片；演出期不污染 roundState。
 */
window.BVN = window.BVN || {};

(function (BVN) {
  'use strict';

  const CFG = BVN.CFG;
  const W = CFG.W;
  const H = CFG.H;

  /* ===================== 数学 / 缓存工具 ===================== */

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOutCubic(t) { const u = 1 - t; return 1 - u * u * u; }
  function easeInOutSine(t) { return -(Math.cos(Math.PI * t) - 1) / 2; }
  function easeOutBack(t) { const c = 1.70158; const u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; }
  /** 确定性伪随机（同一 index 永远同一值 → 演出可复现、可截图比对） */
  function hash01(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  /* 渐变缓存：演出共 120 帧，绝不能每帧 createLinearGradient（性能硬要求） */
  const CACHE = {};
  function grad(ctx, key, build) {
    let g = CACHE[key];
    if (!g) { g = build(ctx); CACHE[key] = g; }
    return g;
  }
  function dropCache() { for (const k in CACHE) { delete CACHE[k]; } }

  /* ===================== 文本（独立于 game.js 的私有 text） ===================== */

  function drawText(ctx, str, x, y, size, color, opt) {
    const o = opt || {};
    ctx.font = (o.weight || '900') + ' ' + Math.round(size) + 'px ' + CFG.FONT;
    ctx.textAlign = o.align || 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    if (o.stroke) {
      ctx.lineWidth = o.strokeW || Math.max(3, size * 0.1);
      ctx.strokeStyle = o.stroke;
      ctx.strokeText(str, x, y);
    }
    if (o.glow) {
      ctx.shadowColor = o.glow;
      ctx.shadowBlur = o.blur || 24;
    }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
    ctx.shadowBlur = 0;
  }

  /* ===================== 阶段工具 ===================== */

  function phaseOf(def, name) {
    const ps = (def && def.phases) || [];
    for (let i = 0; i < ps.length; i++) if (ps[i].n === name) return ps[i];
    return null;
  }

  /** t 落在哪个段（phases 允许重叠，例如 cut 0-34 与 text 20-62 → 取后出现者） */
  function phaseAt(def, t) {
    const ps = (def && def.phases) || [];
    let cur = 'cut';
    for (let i = 0; i < ps.length; i++) {
      if (t >= ps[i].s && t < ps[i].e) cur = ps[i].n;
    }
    return cur;
  }

  /* =====================================================================
   *  8 套终结动画 FX
   *  统一签名：fx(ctx, env)
   *    env = { k, t, def, lock, G, side, a }
   *      k   : anim 段进度 0..1（out 段恒为 1）
   *      t   : 演出内帧号
   *      a   : 全局透明度（out 段淡出时 <1）
   *  全部为确定性几何绘制，不用 Math.random、不用图片、不用 shadowBlur。
   * ===================================================================== */

  /* ---------- 1. hannya 百鬼夜行·终：16 只鬼影自地平线八方升起围圈 → 同时俯冲 ---------- */
  function drawOni(ctx, x, y, s, alpha, phase) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(1, 1 + 0.12 * Math.sin(phase));
    // 身体：上宽下窄的鬼影
    ctx.beginPath();
    ctx.moveTo(-s * 0.5, s * 0.35);
    ctx.quadraticCurveTo(-s * 0.62, -s * 0.35, -s * 0.3, -s * 0.72);
    ctx.quadraticCurveTo(0, -s * 0.95, s * 0.3, -s * 0.72);
    ctx.quadraticCurveTo(s * 0.62, -s * 0.35, s * 0.5, s * 0.35);
    ctx.quadraticCurveTo(0, s * 0.62, -s * 0.5, s * 0.35);
    ctx.closePath();
    const g = grad(ctx, 'oni-body', function (c) {
      const lg = c.createLinearGradient(0, -s, 0, s);
      lg.addColorStop(0, 'rgba(40,2,2,0.95)');
      lg.addColorStop(0.55, 'rgba(96,8,6,0.9)');
      lg.addColorStop(1, 'rgba(16,0,0,0.2)');
      return lg;
    });
    ctx.fillStyle = g;
    ctx.fill();
    // 双角
    ctx.fillStyle = 'rgba(240,220,200,0.85)';
    ctx.beginPath();
    ctx.moveTo(-s * 0.34, -s * 0.66); ctx.lineTo(-s * 0.52, -s * 1.06); ctx.lineTo(-s * 0.16, -s * 0.74);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(s * 0.34, -s * 0.66); ctx.lineTo(s * 0.52, -s * 1.06); ctx.lineTo(s * 0.16, -s * 0.74);
    ctx.closePath(); ctx.fill();
    // 眼光（加色）
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,64,32,0.95)';
    ctx.beginPath(); ctx.ellipse(-s * 0.18, -s * 0.38, s * 0.09, s * 0.055, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(s * 0.18, -s * 0.38, s * 0.09, s * 0.055, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  function fxOniArmy(ctx, e) {
    const k = e.k;
    const cx = W * 0.5;
    const gy = H * 0.9;
    // 地平线赤雾
    const fog = grad(ctx, 'oni-fog', function (c) {
      const rg = c.createRadialGradient(W * 0.5, H * 0.9, 30, W * 0.5, H * 0.9, 620);
      rg.addColorStop(0, 'rgba(150,18,10,0.55)');
      rg.addColorStop(0.5, 'rgba(88,6,4,0.3)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      return rg;
    });
    ctx.globalAlpha = e.a;
    ctx.fillStyle = fog;
    ctx.fillRect(0, 0, W, H);

    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2 - Math.PI / 2;
      const rise = clamp((k - i * 0.014) / 0.45, 0, 1);
      const dive = clamp((k - 0.56) / 0.34, 0, 1);
      const R = 430 - 240 * rise - 330 * dive * dive;
      const x = cx + Math.cos(ang) * R * 1.25;
      const y = gy + Math.sin(ang) * R * 0.52 - 70 * rise + 26 * dive;
      const s = 46 + 18 * Math.sin(i * 2.3) + 34 * dive;
      drawOni(ctx, x, y, s, (0.2 + 0.75 * rise) * (1 - 0.2 * dive) * e.a, i * 1.7 + k * 6);
    }

    // 俯冲落点的赤色冲击环
    if (k > 0.82) {
      const q = clamp((k - 0.82) / 0.18, 0, 1);
      ctx.globalCompositeOperation = 'lighter';
      for (let r = 0; r < 3; r++) {
        const rr = 60 + q * (300 + r * 120);
        ctx.beginPath();
        ctx.ellipse(cx, H * 0.72, rr, rr * 0.34, 0, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,60,30,' + (0.5 * (1 - q) * e.a).toFixed(3) + ')';
        ctx.lineWidth = 10 - r * 3;
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    // 上升火星
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 40; i++) {
      const px = W * 0.5 + (hash01(i) - 0.5) * W * 1.05;
      const py = H - ((k * 1.5 + hash01(i + 90)) % 1.1) * H;
      ctx.fillStyle = 'rgba(255,110,50,' + (0.5 * e.a).toFixed(3) + ')';
      ctx.fillRect(px, py, 3, 9);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  /* ---------- 2. angel 炽翼·天罚之光：六翼剪影 + 3 道天顶巨柱 + 光羽逆向上飘 ---------- */
  function fxHolyRain(ctx, e) {
    const k = e.k;
    const cx = W * 0.5;
    ctx.globalAlpha = e.a;

    // 六翼白光剪影（3 对：翼骨 + 沿骨的羽片，向后掠 → 读得出是翅膀而不是星芒）
    ctx.save();
    ctx.translate(cx, H * 0.46);
    const spread = easeOutCubic(clamp(k / 0.45, 0, 1));
    for (let w = 0; w < 6; w++) {
      const sgn = w % 2 === 0 ? -1 : 1;              // 左右
      const tier = Math.floor(w / 2);                 // 上 / 中 / 下
      const baseA = sgn * (0.42 + tier * 0.4);
      const flap = Math.sin(k * 6 + tier) * 0.07;
      const len = (300 + tier * 76) * (0.32 + 0.68 * spread);
      ctx.save();
      ctx.rotate(baseA + flap);
      // 翼骨
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(len * 0.5, -len * 0.2, len, -len * 0.06);
      ctx.strokeStyle = 'rgba(255,252,230,' + (0.5 * spread * e.a) + ')';
      ctx.lineWidth = 3;
      ctx.stroke();
      // 沿骨的羽片（越靠翼尖越短、越淡）
      for (let f = 0; f < 8; f++) {
        const tt = f / 7;
        const bx = len * (0.08 + tt * 0.92);
        const by = -len * 0.2 * Math.sin(tt * Math.PI * 0.9);
        const fl = len * 0.46 * (1 - tt * 0.55);
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(-0.62 + tt * 0.24);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(fl * 0.55, fl * 0.16, fl, fl * 0.1);
        ctx.quadraticCurveTo(fl * 0.55, fl * 0.3, 0, 5);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,255,255,' + ((0.16 + 0.2 * (1 - tt)) * spread * e.a).toFixed(3) + ')';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,248,214,' + (0.4 * spread * e.a).toFixed(3) + ')';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }
    ctx.restore();

    // 3 道天顶白金巨柱
    const pil = grad(ctx, 'holy-pillar', function (c) {
      const lg = c.createLinearGradient(0, 0, 0, H);
      lg.addColorStop(0, 'rgba(255,255,255,0.95)');
      lg.addColorStop(0.45, 'rgba(255,240,190,0.5)');
      lg.addColorStop(1, 'rgba(255,220,140,0)');
      return lg;
    });
    const xs = [W * 0.32, W * 0.5, W * 0.68];
    for (let i = 0; i < 3; i++) {
      const p = clamp((k - 0.12 - i * 0.1) / 0.3, 0, 1);
      if (p <= 0) continue;
      const pw = 74 + 44 * Math.sin(k * 4 + i);
      ctx.save();
      ctx.globalAlpha = p * e.a * (0.55 + 0.2 * Math.sin(k * 9 + i * 2));
      ctx.fillStyle = pil;
      ctx.fillRect(xs[i] - pw / 2, 0, pw, H * (0.55 + 0.45 * p));
      ctx.restore();
    }

    // 光羽雨：逆向上飘（y 递增方向与常规重力相反）
    for (let i = 0; i < 46; i++) {
      const sway = Math.sin(k * 5 + i * 1.7) * 26;
      const px = (hash01(i) * 1.12 - 0.06) * W + sway;
      const py = H - ((k * 1.25 + hash01(i + 57)) % 1.15) * (H * 1.15);
      const rot = hash01(i + 13) * Math.PI * 2 + k * 3;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rot);
      ctx.globalAlpha = (0.35 + 0.4 * hash01(i + 31)) * e.a;
      ctx.fillStyle = i % 3 === 0 ? '#fff6cf' : '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -13);
      ctx.quadraticCurveTo(6, -3, 0, 13);
      ctx.quadraticCurveTo(-6, -3, 0, -13);
      ctx.fill();
      ctx.restore();
    }

    // 落点白金十字爆
    if (k > 0.88) {
      const q = clamp((k - 0.88) / 0.12, 0, 1);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - q) * e.a;
      ctx.strokeStyle = 'rgba(255,250,220,1)';
      ctx.lineWidth = 16 * (1 - q) + 2;
      ctx.beginPath();
      ctx.moveTo(cx - 460, H * 0.66); ctx.lineTo(cx + 460, H * 0.66);
      ctx.moveTo(cx, H * 0.66 - 320); ctx.lineTo(cx, H * 0.66 + 320);
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- 3. boxer 无限 KO 连打：12 记拳影四方向内砸 + 末记上勾拳（画面已由 grayFrames 转黑白） ---------- */
  function drawFist(ctx, x, y, s, rot, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(12,12,14,0.92)';
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = 3;
    // 拳套主体
    ctx.beginPath();
    ctx.moveTo(-s * 0.9, -s * 0.62);
    ctx.quadraticCurveTo(-s * 1.12, 0, -s * 0.9, s * 0.62);
    ctx.lineTo(s * 0.5, s * 0.66);
    ctx.quadraticCurveTo(s * 0.92, s * 0.3, s * 0.86, -s * 0.3);
    ctx.quadraticCurveTo(s * 0.72, -s * 0.78, s * 0.1, -s * 0.78);
    ctx.quadraticCurveTo(-s * 0.55, -s * 0.82, -s * 0.9, -s * 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // 四指关节
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(s * (0.1 + i * 0.24), -s * 0.62);
      ctx.lineTo(s * (0.16 + i * 0.24), s * 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  function fxRushFists(ctx, e) {
    const k = e.k;
    const cx = W * 0.5;
    const cy = H * 0.52;

    // 四方向速度线（黑白）
    ctx.save();
    ctx.globalAlpha = 0.35 * e.a;
    ctx.strokeStyle = '#ffffff';
    for (let i = 0; i < 26; i++) {
      const a = hash01(i) * Math.PI * 2;
      const r0 = 200 + hash01(i + 7) * 260;
      const len = 90 + 160 * hash01(i + 21);
      ctx.lineWidth = 1 + hash01(i + 3) * 2.4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.8);
      ctx.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len) * 0.8);
      ctx.stroke();
    }
    ctx.restore();

    // 12 记拳影：从四条边向内砸
    for (let i = 0; i < 12; i++) {
      const p = clamp((k * 1.22 - i * 0.072) / 0.3, 0, 1);
      if (p <= 0) continue;
      const q = easeOutCubic(p);
      const from = i % 4;                       // 0 左 1 右 2 上 3 下
      const jitter = (hash01(i) - 0.5);
      let sx; let sy; let ex; let ey; let rot;
      if (from === 0) { sx = -180; sy = cy + jitter * 320; ex = cx - 120; ey = cy + jitter * 120; rot = 0; }
      else if (from === 1) { sx = W + 180; sy = cy + jitter * 320; ex = cx + 120; ey = cy + jitter * 120; rot = Math.PI; }
      else if (from === 2) { sx = cx + jitter * 420; sy = -180; ex = cx + jitter * 140; ey = cy - 120; rot = Math.PI / 2; }
      else { sx = cx + jitter * 420; sy = H + 180; ex = cx + jitter * 140; ey = cy + 120; rot = -Math.PI / 2; }
      const x = lerp(sx, ex, q);
      const y = lerp(sy, ey, q);
      const s = 46 + 10 * hash01(i + 5);
      // 残影
      for (let g2 = 3; g2 >= 1; g2--) {
        drawFist(ctx, lerp(sx, x, 1 - g2 * 0.09), lerp(sy, y, 1 - g2 * 0.09), s, rot, 0.12 * e.a * p);
      }
      drawFist(ctx, x, y, s * (1 + 0.12 * (1 - q)), rot, 0.95 * e.a);
      // 命中白闪（细环，不要糊成白圆斑）
      if (p > 0.92) {
        const q2 = (p - 0.92) / 0.08;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.75 * (1 - q2)).toFixed(3) + ')';
        ctx.lineWidth = 5 * (1 - q2) + 1.5;
        ctx.beginPath();
        ctx.arc(ex, ey, 24 + 40 * q2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 末记上勾拳
    if (k > 0.8) {
      const q = clamp((k - 0.8) / 0.2, 0, 1);
      ctx.save();
      ctx.globalAlpha = e.a;
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.85 * (1 - q * 0.5)).toFixed(3) + ')';
      ctx.lineWidth = 26 * (1 - q) + 6;
      ctx.beginPath();
      ctx.moveTo(cx - 60, H + 40);
      ctx.quadraticCurveTo(cx - 40, H * 0.72, cx + 30, H * 0.14 - q * 120);
      ctx.stroke();
      drawFist(ctx, cx + 30, H * 0.2 - q * 130, 70, -Math.PI / 2.4, e.a * (1 - q * 0.3));
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- 4. dancer 千夜·散花：8 条彩带螺旋收束成笼 → 绷紧炸成花瓣雨 ---------- */
  const RIBBON_COLORS = ['#ff9ecb', '#ffd76e', '#a78bfa', '#7dd3fc', '#fca5a5', '#f9a8d4', '#a7f3d0', '#fde68a'];

  function fxRibbonVortex(ctx, e) {
    const k = e.k;
    const cx = W * 0.5;
    const cy = H * 0.5;
    const burst = clamp((k - 0.84) / 0.16, 0, 1);
    ctx.globalAlpha = e.a;

    // 中央光核
    const core = grad(ctx, 'ribbon-core', function (c) {
      const rg = c.createRadialGradient(W * 0.5, H * 0.5, 8, W * 0.5, H * 0.5, 340);
      rg.addColorStop(0, 'rgba(255,236,250,0.55)');
      rg.addColorStop(0.5, 'rgba(255,150,205,0.22)');
      rg.addColorStop(1, 'rgba(255,120,190,0)');
      return rg;
    });
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, W, H);

    // 8 条彩带：先自四角螺旋收束成笼，k>0.84 后炸开
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * Math.PI * 2 + k * 3.4;
      ctx.beginPath();
      let first = true;
      const segs = 26;
      for (let s = 0; s <= segs; s++) {
        const p = s / segs;
        const spin = a0 + p * Math.PI * 2.4;
        const tight = 1 - 0.86 * easeInOutSine(clamp(k / 0.84, 0, 1));
        const rad = (620 * (1 - p * 0.25)) * tight + 46 + burst * 520 * p;
        const x = cx + Math.cos(spin) * rad * 1.12;
        const y = cy + Math.sin(spin) * rad * 0.7;
        if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = RIBBON_COLORS[i % RIBBON_COLORS.length];
      ctx.globalAlpha = e.a * (0.75 - burst * 0.55);
      ctx.lineWidth = 16 - burst * 12;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // 绷紧瞬间的白环
    if (k > 0.8 && k < 0.95) {
      const q = clamp((k - 0.8) / 0.15, 0, 1);
      ctx.globalAlpha = (1 - q) * e.a;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 120 + q * 380, (120 + q * 380) * 0.55, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 花瓣雨（炸开后向外飞散并下落）
    if (burst > 0) {
      for (let i = 0; i < 54; i++) {
        const ang = hash01(i) * Math.PI * 2;
        const sp = 0.4 + hash01(i + 11) * 0.9;
        const r = burst * 620 * sp;
        const px = cx + Math.cos(ang) * r * 1.15;
        const py = cy + Math.sin(ang) * r * 0.7 + burst * burst * 260;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(ang + burst * 5);
        ctx.globalAlpha = e.a * (1 - burst * 0.35) * 0.9;
        ctx.fillStyle = RIBBON_COLORS[i % RIBBON_COLORS.length];
        ctx.beginPath();
        ctx.ellipse(0, 0, 13, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- 5. dragon 骸龙·吞世：地面裂成熔岩巨口 + 白骨龙首升起咬合喷绿火 ---------- */
  function fxBoneMaw(ctx, e) {
    const k = e.k;
    const cx = W * 0.5;
    const gy = H * 0.88;
    ctx.globalAlpha = e.a;

    // 熔岩裂口
    const lavaH = 40 + 300 * clamp(k / 0.5, 0, 1);
    const lava = grad(ctx, 'bone-lava', function (c) {
      const lg = c.createLinearGradient(0, H * 0.62, 0, H);
      lg.addColorStop(0, 'rgba(255,180,40,0.9)');
      lg.addColorStop(0.4, 'rgba(220,70,10,0.85)');
      lg.addColorStop(1, 'rgba(30,4,0,0.95)');
      return lg;
    });
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, gy - 30);
    for (let i = 0; i <= 16; i++) {
      const x = (i / 16) * W;
      const jag = (i % 2 === 0 ? -1 : 1) * (14 + 30 * hash01(i));
      ctx.lineTo(x, gy - lavaH * 0.18 + jag);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = lava;
    ctx.fill();
    ctx.restore();

    // 白骨龙首（升起 → 张口 → 咬合）
    const rise = clamp(k / 0.55, 0, 1);
    const headY = lerp(H + 200, H * 0.44, easeOutCubic(rise));
    const snap = clamp((k - 0.78) / 0.1, 0, 1);
    const jaw = (1 - easeOutCubic(snap)) * (0.55 * easeOutCubic(clamp((k - 0.36) / 0.3, 0, 1))) + 0.06;
    const sk = 1.35;

    ctx.save();
    ctx.translate(cx, headY);
    ctx.scale(sk, sk);
    // 颈椎（一截截骨环），把头颅和地缝连起来
    for (let i = 0; i < 7; i++) {
      const ny = 26 + i * 40;
      const nw = 44 - i * 3;
      ctx.fillStyle = 'rgba(206,208,190,' + (0.9 - i * 0.08).toFixed(3) + ')';
      ctx.beginPath();
      ctx.moveTo(-nw, ny);
      ctx.lineTo(0, ny - 22);
      ctx.lineTo(nw, ny);
      ctx.lineTo(0, ny + 20);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(110,118,88,0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // 后掠双角
    ctx.fillStyle = 'rgba(222,224,206,0.95)';
    ctx.beginPath();
    ctx.moveTo(-150, -70); ctx.quadraticCurveTo(-250, -130, -320, -96);
    ctx.quadraticCurveTo(-240, -96, -156, -50);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-110, -92); ctx.quadraticCurveTo(-190, -190, -270, -176);
    ctx.quadraticCurveTo(-186, -150, -120, -74);
    ctx.closePath(); ctx.fill();
    // 上颌：后脑 → 头顶 → 吻脊 → 鼻端 → 上齿列
    ctx.beginPath();
    ctx.moveTo(-196, -18);
    ctx.lineTo(-140, -88);
    ctx.lineTo(-10, -108);
    ctx.lineTo(110, -92);
    ctx.lineTo(196, -34);
    ctx.lineTo(200, 4);
    ctx.lineTo(60, 16);
    ctx.lineTo(-160, 22);
    ctx.closePath();
    ctx.fillStyle = 'rgba(232,234,218,0.96)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(112,120,90,0.95)';
    ctx.lineWidth = 3;
    ctx.stroke();
    // 眼窝（黑洞 + 绿点）
    ctx.fillStyle = 'rgba(18,22,14,0.92)';
    ctx.beginPath();
    ctx.ellipse(-62, -52, 34, 25, -0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(150,255,80,0.85)';
    ctx.beginPath();
    ctx.ellipse(-58, -50, 11, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // 鼻孔
    ctx.fillStyle = 'rgba(30,34,26,0.9)';
    ctx.beginPath();
    ctx.ellipse(150, -40, 12, 8, 0.3, 0, Math.PI * 2);
    ctx.fill();
    // 头骨裂纹
    ctx.strokeStyle = 'rgba(120,126,98,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-10, -104); ctx.lineTo(-4, -66); ctx.lineTo(-24, -34);
    ctx.moveTo(60, -96); ctx.lineTo(52, -62);
    ctx.stroke();
    // 上齿
    ctx.fillStyle = 'rgba(250,250,238,0.98)';
    for (let i = 0; i < 9; i++) {
      const tx = -150 + i * 40;
      ctx.beginPath();
      ctx.moveTo(tx, 6);
      ctx.lineTo(tx + 13, 6);
      ctx.lineTo(tx + 6, 32 + 10 * hash01(i));
      ctx.closePath();
      ctx.fill();
    }
    // 下颌（绕铰点旋转）
    ctx.save();
    ctx.translate(-150, 10);
    ctx.rotate(jaw);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(300, -6);
    ctx.lineTo(330, 44);
    ctx.lineTo(40, 58);
    ctx.closePath();
    ctx.fillStyle = 'rgba(206,208,190,0.94)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(110,118,88,0.85)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = 'rgba(250,250,238,0.95)';
    for (let i = 0; i < 6; i++) {
      const tx = 30 + i * 46;
      ctx.beginPath();
      ctx.moveTo(tx, 2);
      ctx.lineTo(tx + 12, 2);
      ctx.lineTo(tx + 6, -22);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // 眼窝绿光
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(150,255,80,' + (0.75 * e.a).toFixed(3) + ')';
    ctx.beginPath(); ctx.ellipse(-40, -56, 26, 20, -0.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(90, -50, 20, 15, 0.15, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // 咬合后牙缝喷绿火
    if (snap > 0.2) {
      const q = clamp((k - 0.78) / 0.22, 0, 1);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const fireY = headY + 34;
      for (let i = 0; i < 34; i++) {
        const u = hash01(i);
        const px = cx + (u - 0.5) * 460 * (0.4 + q);
        const py = fireY - q * (40 + hash01(i + 5) * 420);
        const rad = 10 + 26 * hash01(i + 9) * (1 - q * 0.4);
        const fg = grad(ctx, 'bone-fire', function (c) {
          const rg = c.createRadialGradient(0, 0, 2, 0, 0, 40);
          rg.addColorStop(0, 'rgba(210,255,120,0.95)');
          rg.addColorStop(0.45, 'rgba(90,220,60,0.6)');
          rg.addColorStop(1, 'rgba(20,120,20,0)');
          return rg;
        });
        ctx.save();
        ctx.translate(px, py);
        ctx.scale(1, 1.8);
        ctx.globalAlpha = (1 - q) * e.a;
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.arc(0, 0, rad, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- 6. warlock 深渊·十一芒：天空翻转成深渊 + 十一芒阵锁人 + 无数黑手向下拖 ---------- */
  function starPath(ctx, cx, cy, r, n, rot) {
    // 五芒用 {5/2}（步长 2），十一芒用 {11/5}（步长 5）—— 步长与 n 必须互质才成形
    const step = n === 5 ? 2 : 5;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const idx = (i * step) % n;
      const a = rot + (idx / n) * Math.PI * 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function drawHand(ctx, x, y, s, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(6,2,12,0.94)';
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.5, s * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let f = 0; f < 5; f++) {
      const a = -0.9 + f * 0.45;
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(-s * 0.07, -s * 1.25, s * 0.14, s * 0.8, s * 0.07) : ctx.rect(-s * 0.07, -s * 1.25, s * 0.14, s * 0.8);
      ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(160,110,255,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.5, s * 0.62, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function fxAbyssHands(ctx, e) {
    const k = e.k;
    const cx = W * 0.5;
    const cy = H * 0.5;
    ctx.globalAlpha = e.a;

    // 天空翻转：自上而下压下来的紫黑深渊
    const abyss = grad(ctx, 'abyss-sky', function (c) {
      const lg = c.createLinearGradient(0, 0, 0, H * 0.72);
      lg.addColorStop(0, 'rgba(8,0,20,0.96)');
      lg.addColorStop(0.55, 'rgba(40,6,80,0.72)');
      lg.addColorStop(1, 'rgba(90,30,160,0)');
      return lg;
    });
    ctx.fillStyle = abyss;
    ctx.fillRect(0, 0, W, H * (0.35 + 0.4 * clamp(k / 0.4, 0, 1)));

    // 先逆五芒（k<0.42）→ 再十一芒（k>=0.42）
    const rot = -k * 1.5;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (k < 0.42) {
      const q = clamp(k / 0.42, 0, 1);
      ctx.strokeStyle = 'rgba(196,130,255,' + (0.95 * q * e.a).toFixed(3) + ')';
      ctx.lineWidth = 5 + 5 * q;
      starPath(ctx, cx, cy, 330 + 34 * q, 5, rot);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.55 * q * e.a).toFixed(3) + ')';
      starPath(ctx, cx, cy, 330 + 34 * q, 5, rot);
      ctx.stroke();
    } else {
      const q = clamp((k - 0.42) / 0.3, 0, 1);
      ctx.strokeStyle = 'rgba(206,156,255,' + (0.95 * e.a).toFixed(3) + ')';
      ctx.lineWidth = 5;
      starPath(ctx, cx, cy, 318, 11, rot);
      ctx.stroke();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.6 * e.a).toFixed(3) + ')';
      starPath(ctx, cx, cy, 318, 11, -rot * 1.6);
      ctx.stroke();
      // 阵内符文环
      ctx.beginPath();
      ctx.arc(cx, cy, 318 * (0.5 + 0.5 * q), 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(170,100,250,' + (0.6 * e.a).toFixed(3) + ')';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();

    // 无数黑手向下拖
    const handStart = 0.08;
    for (let i = 0; i < 28; i++) {
      const p = clamp((k - handStart - i * 0.018) / 0.58, 0, 1);
      if (p <= 0) continue;
      const px = (hash01(i) * 1.1 - 0.05) * W;
      const s = 46 + 34 * hash01(i + 4);
      const py = lerp(-140, H * 0.94, easeOutCubic(p)) - (i % 3) * 46;
      drawHand(ctx, px, py, s, (0.35 + 0.6 * p) * e.a);
    }

    // 底部紫色拖拽涡流
    const sink = grad(ctx, 'abyss-sink', function (c) {
      const lg = c.createLinearGradient(0, H * 0.72, 0, H);
      lg.addColorStop(0, 'rgba(60,10,110,0)');
      lg.addColorStop(1, 'rgba(10,0,24,0.95)');
      return lg;
    });
    ctx.fillStyle = sink;
    ctx.fillRect(0, H * 0.72, W, H * 0.28);
    ctx.globalAlpha = 1;
  }

  /* ---------- 7. ranger 苍鹰·万箭：箭雨把天空压成黑幕 + 巨箭贯穿 + 落点炸开鹰羽 ---------- */
  function drawArrow(ctx, x, y, len, rot, alpha, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.globalAlpha = alpha;
    const col = color || 'rgba(232,244,255,0.95)';
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -len / 2);
    ctx.lineTo(0, len / 2);
    ctx.stroke();
    // 箭头（实心三角，指向前进方向 = +y）
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, len / 2 + 16);
    ctx.lineTo(-8, len / 2 - 2);
    ctx.lineTo(8, len / 2 - 2);
    ctx.closePath();
    ctx.fill();
    // 尾羽（两撇向后，不是第二个箭头头）
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(0, -len / 2 + 10);
    ctx.lineTo(-13, -len / 2 + 22);
    ctx.moveTo(0, -len / 2 + 10);
    ctx.lineTo(13, -len / 2 + 22);
    ctx.moveTo(0, -len / 2 + 20);
    ctx.lineTo(-13, -len / 2 + 32);
    ctx.moveTo(0, -len / 2 + 20);
    ctx.lineTo(13, -len / 2 + 32);
    ctx.stroke();
    ctx.restore();
  }

  function fxArrowStorm(ctx, e) {
    const k = e.k;
    const cx = W * 0.5;
    const cy = H * 0.5;
    ctx.globalAlpha = e.a;

    // 黑幕从顶部压下来
    const curtainH = H * (0.2 + 0.62 * clamp(k / 0.55, 0, 1));
    const curtain = grad(ctx, 'arrow-curtain', function (c) {
      const lg = c.createLinearGradient(0, 0, 0, H * 0.85);
      lg.addColorStop(0, 'rgba(2,4,10,0.95)');
      lg.addColorStop(0.7, 'rgba(8,14,30,0.8)');
      lg.addColorStop(1, 'rgba(10,20,40,0)');
      return lg;
    });
    ctx.fillStyle = curtain;
    // 波浪下沿
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(W, 0);
    ctx.lineTo(W, curtainH);
    for (let i = 12; i >= 0; i--) {
      const x = (i / 12) * W;
      ctx.lineTo(x, curtainH + Math.sin(i * 1.7 + k * 7) * 26);
    }
    ctx.closePath();
    ctx.fill();

    // 箭雨
    for (let i = 0; i < 54; i++) {
      const sp = 0.9 + hash01(i) * 0.8;
      const py = -140 + ((k * 1.7 * sp + hash01(i + 41)) % 1.25) * (H * 1.3);
      const px = hash01(i + 7) * W * 1.05 - W * 0.02;
      const tilt = (hash01(i + 19) - 0.5) * 0.35;
      drawArrow(ctx, px, py, 96 + 46 * hash01(i + 3), tilt, (0.62 + 0.36 * hash01(i + 23)) * e.a);
    }

    // 巨箭贯穿
    if (k > 0.74) {
      const q = clamp((k - 0.74) / 0.14, 0, 1);
      const x = lerp(-260, W * 0.76, easeOutCubic(q));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let t2 = 3; t2 >= 1; t2--) {
        ctx.globalAlpha = 0.16 * e.a;
        ctx.fillStyle = '#cfe8ff';
        ctx.fillRect(0, cy - 5 - t2 * 3, x - t2 * 40, 10 + t2 * 6);
      }
      ctx.globalAlpha = e.a;
      // 箭杆
      const shaft = grad(ctx, 'arrow-shaft', function (c) {
        const lg = c.createLinearGradient(0, cy - 13, 0, cy + 13);
        lg.addColorStop(0, 'rgba(255,255,255,0)');
        lg.addColorStop(0.5, 'rgba(255,255,255,0.98)');
        lg.addColorStop(1, 'rgba(255,255,255,0)');
        return lg;
      });
      ctx.fillStyle = shaft;
      ctx.fillRect(0, cy - 13, x, 26);
      // 箭头
      ctx.fillStyle = '#eaf6ff';
      ctx.beginPath();
      ctx.moveTo(x + 96, cy);
      ctx.lineTo(x - 8, cy - 46);
      ctx.lineTo(x - 8, cy + 46);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // 落点炸开的鹰羽
    if (k > 0.86) {
      const q = clamp((k - 0.86) / 0.14, 0, 1);
      const ix = W * 0.52;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - q) * e.a;
      const rg = grad(ctx, 'arrow-impact', function (c) {
        const g2 = c.createRadialGradient(W * 0.52, H * 0.5, 4, W * 0.52, H * 0.5, 300);
        g2.addColorStop(0, 'rgba(255,255,255,0.95)');
        g2.addColorStop(0.4, 'rgba(190,225,255,0.45)');
        g2.addColorStop(1, 'rgba(120,180,255,0)');
        return g2;
      });
      ctx.fillStyle = rg;
      ctx.fillRect(ix - 320, H * 0.5 - 320, 640, 640);
      ctx.restore();
      for (let i = 0; i < 26; i++) {
        const a = hash01(i) * Math.PI * 2;
        const r = q * (160 + 260 * hash01(i + 6));
        ctx.save();
        ctx.translate(ix + Math.cos(a) * r, H * 0.5 + Math.sin(a) * r * 0.7);
        ctx.rotate(a);
        ctx.globalAlpha = (1 - q) * e.a * 0.9;
        ctx.fillStyle = '#dcefff';
        ctx.beginPath();
        ctx.moveTo(0, -16);
        ctx.quadraticCurveTo(9, 0, 0, 16);
        ctx.quadraticCurveTo(-9, 0, 0, -16);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- 8. ronin 无明·十步杀：时间静止灰白 + 10 道刀光交错 + 末刀横贯血线 ---------- */
  function fxTenSlashes(ctx, e) {
    const k = e.k;
    ctx.globalAlpha = e.a;

    // 灰白静止感
    const wash = grad(ctx, 'ronin-wash', function (c) {
      const lg = c.createLinearGradient(0, 0, 0, H);
      lg.addColorStop(0, 'rgba(228,230,238,0.16)');
      lg.addColorStop(0.55, 'rgba(200,204,216,0.08)');
      lg.addColorStop(1, 'rgba(120,124,140,0.22)');
      return lg;
    });
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, W, H);

    // 10 道刀光
    for (let i = 0; i < 10; i++) {
      const p = clamp((k - i * 0.066) / 0.16, 0, 1);
      if (p <= 0) continue;
      const ang = (hash01(i) - 0.5) * 2.6 + (i % 2 === 0 ? 0.35 : -0.35);
      const dx = Math.cos(ang);
      const dy = Math.sin(ang) * 0.65;
      const cx = W * (0.2 + 0.6 * hash01(i + 17));
      const cy = H * (0.24 + 0.5 * hash01(i + 29));
      const len = (900 + 400 * hash01(i + 5)) * easeOutCubic(p);
      const fade = 1 - clamp((k - i * 0.066 - 0.16) / 0.3, 0, 1) * 0.8;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fade * e.a;
      // 外晕
      ctx.strokeStyle = 'rgba(190,210,255,0.35)';
      ctx.lineWidth = 16;
      ctx.beginPath();
      ctx.moveTo(cx - dx * len * 0.5, cy - dy * len * 0.5);
      ctx.lineTo(cx + dx * len * 0.5, cy + dy * len * 0.5);
      ctx.stroke();
      // 白核
      ctx.strokeStyle = 'rgba(255,255,255,0.98)';
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(cx - dx * len * 0.5, cy - dy * len * 0.5);
      ctx.lineTo(cx + dx * len * 0.5, cy + dy * len * 0.5);
      ctx.stroke();
      ctx.restore();
    }

    // 末刀：横贯血线
    if (k > 0.88) {
      const q = clamp((k - 0.88) / 0.12, 0, 1);
      ctx.save();
      ctx.globalAlpha = e.a * (0.6 + 0.4 * (1 - q));
      ctx.fillStyle = 'rgba(214,26,32,0.92)';
      ctx.fillRect(0, H * 0.52 - 2.5, W, 5);
      ctx.fillRect(0, H * 0.52 + 6, W, 2);
      // 血珠下垂
      for (let i = 0; i < 14; i++) {
        const px = hash01(i) * W;
        const len2 = 20 + 90 * hash01(i + 3) * q;
        ctx.fillStyle = 'rgba(190,20,26,0.75)';
        ctx.fillRect(px, H * 0.52 + 8, 2.5, len2);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  const FX_TABLE = {
    oniArmy: fxOniArmy,        // hannya  百鬼夜行·终
    holyRain: fxHolyRain,      // angel   炽翼·天罚之光
    rushFists: fxRushFists,    // boxer   无限 KO 连打
    ribbonVortex: fxRibbonVortex, // dancer 千夜·散花
    boneMaw: fxBoneMaw,        // dragon  骸龙·吞世
    abyssHands: fxAbyssHands,  // warlock 深渊·十一芒
    arrowStorm: fxArrowStorm,  // ranger  苍鹰·万箭
    tenSlashes: fxTenSlashes,  // ronin   无明·十步杀
  };

  /* =====================================================================
   *  演出绘制：压暗 → 色带 → 真人立绘 CG → FX → 终结文字/台词
   * ===================================================================== */

  function portraitReady(def) {
    const img = BVN.Art && BVN.Art.img ? BVN.Art.img(def.id) : null;
    return !!(img && img.width && img.height);
  }

  /** 立绘缺失兜底：用 Art.drawFighter 放大剪影，绝不黑屏/抛错 */
  function drawSilhouette(ctx, G, lock, def, px, py, pw, ph, alpha) {
    const f = G.fighters[lock.side];
    if (!f || !BVN.Art || !BVN.Art.drawFighter) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(px + pw * 0.5, py + ph * 0.96);
    const sc = Math.min(pw / 150, ph / 205) * 1.05;
    ctx.scale(sc, sc);
    const proxy = {
      x: 0, y: 0,
      facing: (def.portrait && def.portrait.side >= 0) ? -1 : 1,
      pose: f.pose, palette: f.palette, build: f.build,
      onGround: true, glow: 0, hitFlash: 0, alpha: 0.94,
      state: 'idle', attackKey: null, attackFrame: 0,
    };
    BVN.Art.drawFighter(ctx, proxy, 0);
    // 剪影上叠一层角色主色，保证"这不是 bug 是兜底"
    ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = alpha * 0.55;
    ctx.fillStyle = def.tint;
    ctx.fillRect(px, py, pw, ph);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  function drawPortrait(ctx, G, lock, def, t, fadeIn) {
    const p = def.portrait || { side: -1, fx: 0.5, fy: 0.34, zoom: 1 };
    const pw = W * 0.52;
    const ph = H * 1.04;
    const right = p.side >= 0;
    const slide = (1 - fadeIn) * 120 * (right ? 1 : -1);
    const px = (right ? W - pw + 56 : -56) + slide;
    const py = -10;
    const alpha = fadeIn;

    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, pw, ph);
    ctx.clip();

    if (portraitReady(def)) {
      ctx.globalAlpha = alpha;
      BVN.Art.drawCover(ctx, BVN.Art.img(def.id), px, py, pw, ph, p.fx, p.fy, p.zoom);
      // 电影感 ①：暗部压黑（底部/外侧）
      const vigKey = 'p-vig-' + def.id;
      const vig = grad(ctx, vigKey, function (c) {
        const lg = c.createLinearGradient(px, py, px, py + ph);
        lg.addColorStop(0, 'rgba(0,0,0,0)');
        lg.addColorStop(0.62, 'rgba(0,0,0,0.12)');
        lg.addColorStop(1, 'rgba(0,0,0,0.92)');
        return lg;
      });
      ctx.globalAlpha = alpha;
      ctx.fillStyle = vig;
      ctx.fillRect(px, py, pw, ph);
      // 电影感 ②：主色染色（multiply 提饱和）
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = alpha * 0.42;
      ctx.fillStyle = def.tint;
      ctx.fillRect(px, py, pw, ph);
      // 电影感 ③：亮部提亮（overlay + 径向高光）
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = alpha * 0.5;
      const hi = grad(ctx, 'p-hi-' + def.id, function (c) {
        const rg = c.createRadialGradient(px + pw * 0.5, py + ph * 0.32, 20, px + pw * 0.5, py + ph * 0.4, pw * 0.78);
        rg.addColorStop(0, 'rgba(255,255,255,0.95)');
        rg.addColorStop(0.55, 'rgba(150,150,150,0.35)');
        rg.addColorStop(1, 'rgba(0,0,0,0.9)');
        return rg;
      });
      ctx.fillStyle = hi;
      ctx.fillRect(px, py, pw, ph);
      ctx.globalCompositeOperation = 'source-over';
      // 高光边（内侧竖线）
      const edge = right ? px + 2 : px + pw - 2;
      ctx.globalAlpha = alpha * 0.8;
      ctx.fillStyle = def.tint;
      ctx.fillRect(edge - 1.5, py, 3, ph);
    } else {
      drawSilhouette(ctx, G, lock, def, px, py, pw, ph, alpha);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawCutscene(ctx, G) {
    const lock = G.superLock;
    if (!lock) return;
    const def = BVN.SUPERS && BVN.SUPERS[lock.id];
    if (!def) return;

    const t = lock.t;
    const cut = phaseOf(def, 'cut');
    const txt = phaseOf(def, 'text');
    const anim = phaseOf(def, 'anim');
    const out = phaseOf(def, 'out');
    const aIn = cut ? clamp(t / Math.max(1, cut.e), 0, 1) : 1;         // 压暗渐入
    const aOut = out ? clamp(1 - (t - out.s) / Math.max(1, out.e - out.s), 0, 1) : 1;
    const A = Math.min(1, aIn * 1.6) * aOut;                            // 全局透明度

    ctx.save();
    ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);

    // ① 整屏压暗（独占屏幕：HUD 一定要被埋掉）
    const dark = grad(ctx, 'sc-dark', function (c) {
      const lg = c.createLinearGradient(0, 0, W, H);
      lg.addColorStop(0, 'rgba(0,0,0,0.94)');
      lg.addColorStop(0.55, 'rgba(0,0,0,0.9)');
      lg.addColorStop(1, 'rgba(0,0,0,0.96)');
      return lg;
    });
    ctx.globalAlpha = 0.94 * A;
    ctx.fillStyle = dark;
    ctx.fillRect(0, 0, W, H);
    // HUD 带的额外遮盖（血条/计时器/援助栏都在 y<190，这里再压一层）
    ctx.globalAlpha = 0.72 * A;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, 190);
    ctx.globalAlpha = 0.45 * A;
    ctx.fillRect(0, H - 64, W, 64);

    // ② 角色主色斜切色带
    const bandKey = 'sc-band-' + def.id;
    const band = grad(ctx, bandKey, function (c) {
      const lg = c.createLinearGradient(0, H, W, 0);
      lg.addColorStop(0, 'rgba(255,255,255,0)');
      lg.addColorStop(0.5, 'rgba(255,255,255,0.12)');
      lg.addColorStop(1, 'rgba(255,255,255,0)');
      return lg;
    });
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 * A;
    ctx.fillStyle = band;
    ctx.translate(W * 0.5, H * 0.5);
    ctx.rotate(-0.22);
    ctx.fillStyle = def.tint;
    ctx.globalAlpha = 0.1 * A;
    for (let i = -2; i <= 2; i++) ctx.fillRect(-W, i * 130 - 26, W * 2, 52);
    ctx.restore();
    // 色带边缘补一层主色径向晕
    ctx.save();
    ctx.globalAlpha = 0.42 * A;
    const glow = grad(ctx, 'sc-glow-' + def.id, function (c) {
      const rg = c.createRadialGradient(W * 0.5, H * 0.55, 40, W * 0.5, H * 0.55, W * 0.62);
      rg.addColorStop(0, 'rgba(255,255,255,0.30)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      return rg;
    });
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // ③ 真人立绘 CG（cut 段滑入）
    const pIn = clamp((t - 2) / Math.max(1, (cut ? cut.e : 30) - 4), 0, 1);
    drawPortrait(ctx, G, lock, def, t, clamp(easeOutCubic(pIn) * 1.05, 0, 1) * Math.max(A, 0.25));

    // ④ 技能动画
    const animS = anim ? anim.s : 34;
    const animE = anim ? anim.e : (def.total - 30);
    const k = clamp((t - animS) / Math.max(1, animE - animS), 0, 1);
    const fx = FX_TABLE[def.fx];
    if (fx) {
      ctx.save();
      fx(ctx, { k: k, t: t, def: def, lock: lock, G: G, side: lock.side, a: A });
      ctx.restore();
    }

    // ⑥ 命中瞬间的统一冲击反馈（白脉冲 + 主色冲击环，画在演出内部，
    //    避免用全局 flash 把整幅压暗层洗白）
    const hitP = phaseOf(def, 'hit');
    if (hitP && t >= hitP.s) {
      const ft = t - hitP.s;
      if (ft < 9) {
        const q = ft / 9;
        ctx.save();
        ctx.globalAlpha = (1 - q) * A;
        // 径向冲击光（只炸中心，不洗白四周 → 立绘与压暗层依然清晰）
        const pulse = grad(ctx, 'sc-impact-pulse', function (c) {
          const rg = c.createRadialGradient(W * 0.5, H * 0.5, 8, W * 0.5, H * 0.5, W * 0.5);
          rg.addColorStop(0, 'rgba(255,255,255,0.80)');
          rg.addColorStop(0.14, 'rgba(255,255,255,0.30)');
          rg.addColorStop(0.42, 'rgba(255,255,255,0)');
          return rg;
        });
        ctx.fillStyle = pulse;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
      if (ft < 26) {
        const q = ft / 26;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = (1 - q) * A;
        ctx.strokeStyle = def.tint;
        ctx.lineWidth = 18 * (1 - q) + 2;
        ctx.beginPath();
        ctx.arc(W * 0.5, H * 0.5, 80 + q * 660, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // ⑤ 终结文字 / 副标 / 台词
    drawFinisher(ctx, def, t, txt, out, A);

    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawFinisher(ctx, def, t, txt, out, A) {
    const s0 = txt ? txt.s : 20;
    const e0 = txt ? txt.e : 62;
    const tk = clamp((t - s0) / 26, 0, 1);
    if (tk <= 0) return;
    const post = clamp((t - e0) / 22, 0, 1);                 // 定格后上浮缩小
    const fade = out ? clamp(1 - (t - out.s) / 14, 0, 1) : 1;
    const scale = lerp(3.2, 1, easeOutBack(tk)) * lerp(1, 0.52, post);
    const y = lerp(H * 0.47, H * 0.19, post);
    const x = W * 0.5 + (def.portrait && def.portrait.side >= 0 ? -110 : 110) * (1 - post);
    const alpha = clamp(tk * 1.6, 0, 1) * fade * lerp(1, 0.62, post) * A;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    // 残影（3 层，向内收）
    for (let g2 = 3; g2 >= 1; g2--) {
      ctx.globalAlpha = alpha * 0.1 * g2;
      drawText(ctx, def.kanji, g2 * 5, g2 * 3, 150, def.tint, { stroke: 'rgba(0,0,0,0.6)', strokeW: 8 });
    }
    ctx.globalAlpha = alpha;
    // 主字
    drawText(ctx, def.kanji, 0, 0, 150, '#ffffff', {
      stroke: 'rgba(4,4,8,0.95)', strokeW: 14, glow: def.tint, blur: 34,
    });
    // 主色内描一遍（描边光）
    ctx.lineWidth = 4;
    ctx.strokeStyle = def.tint;
    ctx.strokeText(def.kanji, 0, 0);
    // romaji
    if (def.romaji) {
      drawText(ctx, def.romaji, 0, 108, 30, 'rgba(255,255,255,0.9)', {
        stroke: 'rgba(0,0,0,0.8)', strokeW: 5, weight: '700', letterSpacing: 6,
      });
    }
    ctx.restore();

    // 台词（中下部，晚 18 帧出现）
    const qk = clamp((t - s0 - 18) / 16, 0, 1);
    if (qk > 0) {
      ctx.save();
      ctx.globalAlpha = qk * fade * A;
      drawText(ctx, '「' + def.quote + '」', W * 0.5, H * 0.78 - qk * 8, 27, 'rgba(238,242,255,0.95)', {
        stroke: 'rgba(0,0,0,0.85)', strokeW: 6, weight: '700',
      });
      ctx.restore();
    }
    // 技能名（左下/右下小字，与立绘对侧）
    const nk = clamp((t - s0 - 6) / 16, 0, 1);
    if (nk > 0) {
      ctx.save();
      ctx.globalAlpha = nk * 0.85 * fade * A;
      const right = !(def.portrait && def.portrait.side >= 0);
      drawText(ctx, def.name, right ? W - 64 : 64, H * 0.9, 24, def.tint, {
        align: right ? 'right' : 'left', stroke: 'rgba(0,0,0,0.9)', strokeW: 5,
      });
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /* =====================================================================
   *  生命周期
   * ===================================================================== */

  function finish(G, aborted) {
    const lock = G.superLock;
    if (!lock) return;
    const f = G.fighters && G.fighters[lock.side];
    G.superLock = null;
    // 收尾输入闸门：演出刚结束时 ctrl 仍锁 5 帧，
    // 防止"演出期一直按住 J"在解锁瞬间被当成一次新的按下边沿（误出一招）
    G.superGrace = aborted ? 0 : 5;
    if (f) {
      f.armorTimer = 0;
      f.armorLevel = 0;
      if (f.state === 'attack' && f.attackKey === 'super') {
        f.state = f.onGround ? 'idle' : 'fall';
        f.attackKey = null;
        f.attackDef = null;
        f.attackFrame = 0;
        f.script = null;
        f.onTick = null;
        f.hitReg = {};
      }
      f.bufLight = 0; f.bufHeavy = 0; f.bufSkill = 0; f.bufUlt = 0;
    }
    const o = G.fighters && G.fighters[1 - lock.side];
    if (o) { o.bufLight = 0; o.bufHeavy = 0; o.bufSkill = 0; o.bufUlt = 0; }
    // 联机：演出结束强制对齐一次
    if (G.mode === 'net' && BVN.Net && BVN.Net.isHost && BVN.Net.isHost() &&
      BVN.Netplay && typeof BVN.Netplay.sendSnapshot === 'function') {
      try { BVN.Netplay.sendSnapshot(true); } catch (e) { /* ignore */ }
    }
  }

  const Super = {
    FX_TABLE: FX_TABLE,

    defOf: function (id) { return (BVN.SUPERS && BVN.SUPERS[id]) || null; },
    maxCharge: function () { return CFG.SUPER_MAX; },
    isActive: function (G) { return !!(G && G.superLock); },

    /** 可用性校验（不改任何状态） */
    canUse: function (side, game) {
      const G = game;
      if (!G || !G.fighters) return false;
      if (side !== 0 && side !== 1) return false;
      if (G.phase !== 'fight' || G.roundState !== 'active') return false;
      if (G.superLock) return false;
      if (!G.superCharge || !G.superUsed) return false;
      if (G.superUsed[side]) return false;
      if ((G.superCharge[side] || 0) < CFG.SUPER_MAX) return false;
      const f = G.fighters[side];
      if (!f || f.hp <= 0) return false;
      const o = G.fighters[1 - side];
      if (!o || o.hp <= 0) return false;         // 对手已死 → 不放（避免和 KO/处决打架）
      if (typeof f.canSuper === 'function' && !f.canSuper(G)) return false;
      return !!Super.defOf(f.id);
    },

    /**
     * 本地发起奥义。
     * @param {number} side 0|1
     * @param {Object} game
     * @returns {boolean} 是否成功启动
     */
    tryActivate: function (side, game) {
      const G = game;
      if (!Super.canUse(side, G)) return false;
      const f = G.fighters[side];
      const def = BVN.SUPERS[f.id];

      // 启动瞬间清干净"冻结类"状态，否则演出第一帧就被 hitstop 冻住（设计稿 R5）
      G.hitstop = 0;
      G.slowmo = 0;
      G.superCharge[side] = 0;
      G.superUsed[side] = true;
      G.superLock = {
        side: side, id: f.id, t: 0, total: def.total,
        hitDone: false, remote: false, phase: 'cut', shakeDone: false,
      };

      // 施法者切到 attack（判定走 Super 自己的 hit 帧，windows 留空）
      f.state = 'attack';
      f.attackKey = 'super';
      f.attackDef = { total: def.total, windows: [], armorWindows: [] };
      f.attackFrame = 0;
      f.hitReg = {};
      f.script = null;
      f.onTick = null;
      f.crouchGuard = false;
      f.guarding = false;
      f.vx = 0;
      if (f.onGround) f.vy = 0;
      f.glow = Math.max(f.glow, 0.7);
      f.bufLight = 0; f.bufHeavy = 0; f.bufSkill = 0; f.bufUlt = 0;

      if (BVN.Sfx) BVN.Sfx.play('holy');
      G.flash('#ffffff', 0.55, 6);
      G.shake(12, 12);
      return true;
    },

    /** 联机客机端：只演出不结算 */
    beginRemote: function (side, id, game) {
      const G = game;
      if (!G || G.superLock) return false;
      const def = BVN.SUPERS && BVN.SUPERS[id];
      if (!def) return false;
      const f = G.fighters && G.fighters[side];
      G.hitstop = 0;
      G.slowmo = 0;
      G.superLock = {
        side: side, id: id, t: 0, total: def.total,
        hitDone: true, remote: true, phase: 'cut', shakeDone: false,
      };
      if (f) {
        f.state = 'attack';
        f.attackKey = 'super';
        f.attackDef = { total: def.total, windows: [], armorWindows: [] };
        f.attackFrame = 0;
        f.hitReg = {};
        f.vx = 0;
      }
      if (BVN.Sfx) BVN.Sfx.play('holy');
      G.flash('#ffffff', 0.4, 6);
      return true;
    },

    /** 每帧推进 */
    update: function (game) {
      const G = game;
      const lock = G.superLock;
      if (!lock) return;
      const def = BVN.SUPERS && BVN.SUPERS[lock.id];
      if (!def) { finish(G, true); return; }

      lock.t++;
      const t = lock.t;
      lock.phase = phaseAt(def, t);

      // 结束
      if (t >= lock.total) { finish(G, false); return; }

      const f = G.fighters[lock.side];
      // 被另一发奥义破防（armorBreak 3 穿 Lv3）→ 演出作废，不再结算
      if (f && f.hp <= 0) { finish(G, true); return; }
      if (f && f.state !== 'attack' && t < lock.total - 2) { finish(G, true); return; }

      // 演出期全程 Lv3 霸体（每帧续期 2 帧；不写进 data.js，也不强制清零）
      if (f) {
        f.setArmor(BVN.ARMOR.MAX, 2);
        f.glow = Math.max(f.glow, 0.35);
      }

      // 镜头震屏（数据给的帧，一次）
      if (def.cam && def.cam.shake && !lock.shakeDone && t >= def.cam.shake.frame) {
        lock.shakeDone = true;
        G.shake(def.cam.shake.mag, def.cam.shake.dur);
      }

      // 命中结算（只一次；客机不结算）
      const hitPhase = phaseOf(def, 'hit');
      if (!lock.hitDone && !lock.remote && hitPhase && t >= hitPhase.s) {
        lock.hitDone = true;
        const target = G.fighters[1 - lock.side];
        if (f && target && target.hp > 0) {
          const hit = {
            dmg: def.hit.dmg, hitstun: def.hit.hitstun, kb: def.hit.kb, lift: def.hit.lift,
            pierce: def.hit.pierce || 0, unblockable: !!def.hit.unblockable,
            armorBreak: def.hit.armorBreak || 0, sfx: def.hit.sfx || 'ko',
            gain: 0, x: target.x, y: target.y - 120,
          };
          G.applyDamage(f, target, hit);
        }
        // 冲击反馈全部在演出内部绘制（径向脉冲 + 主色冲击环），不用全局 flash，
        // 否则整幅压暗层会被洗白、立绘失去电影感。
      }

      // 拳击：整段转黑白（复用已有的灰度叠加层）
      if (def.fx === 'rushFists' && t >= (phaseOf(def, 'anim') ? phaseOf(def, 'anim').s : 34)) {
        G.grayFrames = 1;
      }
    },

    drawCutscene: drawCutscene,

    abort: function (game) {
      if (!game || !game.superLock) return;
      finish(game, true);
    },

    /** 自然充能：单位「点/秒」，必须 ×dt */
    updateCharge: function (game, dt) {
      const G = game;
      if (!G || !G.addSuper) return;
      for (let i = 0; i < 2; i++) G.addSuper(i, CFG.SUPER_GAIN_REGEN * dt);
    },

    /** 立绘/上下文变化时清缓存（resize 后渐变坐标系不变，通常无需调用） */
    clearCache: dropCache,
  };

  BVN.Super = Super;
})(window.BVN);

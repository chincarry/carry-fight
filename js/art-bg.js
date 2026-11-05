/* js/art-bg.js — 场景背景（神社雨夜 / 冥火战场，多层视差）与世界地面
 *
 * 从 art.js 拆出来的原因：背景绘制完全不依赖角色绘制的可变状态（MONO / BASE），
 * 只用到 rgba / circle / ell / roundRect 四个纯函数，所以可以安全地独立成一个文件。
 * 引入顺序：data.js → art.js → art-bg.js → ... → game.js
 */
window.BVN = window.BVN || {};

(function (BVN) {
  'use strict';

  const Art = BVN.Art;
  const CFG = BVN.CFG;
  const A = Art._;
  const rgba = A.rgba;
  const circle = A.circle;
  const ell = A.ell;
  const roundRect = A.roundRect;

  /* ============================================================
   *  5. 场景背景
   * ============================================================ */

  // 固定随机（保证每次运行图案一致）
  function rnd(seed, i) {
    let s = (seed * 1103515245 + i * 12345) & 0x7fffffff;
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return (s % 100000) / 100000;
  }

  const RAIN = (function () {
    const arr = [];
    for (let i = 0; i < 170; i++) {
      arr.push({
        x: rnd(7, i) * 1500,
        y: rnd(11, i) * 800,
        sp: 420 + rnd(13, i) * 620,
        len: 12 + rnd(17, i) * 26,
        a: 0.08 + rnd(19, i) * 0.3,
      });
    }
    return arr;
  })();

  const EMBERS = (function () {
    const arr = [];
    for (let i = 0; i < 90; i++) {
      arr.push({
        x: rnd(23, i) * 1500,
        y: rnd(29, i) * 780,
        sp: 12 + rnd(31, i) * 46,
        r: 0.8 + rnd(37, i) * 2.4,
        a: 0.2 + rnd(41, i) * 0.6,
        ph: rnd(43, i) * 6.28,
      });
    }
    return arr;
  })();

  function vignette(ctx, w, h, color, strength) {
    const g = ctx.createRadialGradient(w / 2, h * 0.52, h * 0.28, w / 2, h * 0.52, h * 0.96);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, color);
    ctx.fillStyle = g;
    ctx.globalAlpha = strength == null ? 1 : strength;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  /**
   * 屏幕空间绘制背景（含视差）。
   * @param {CanvasRenderingContext2D} ctx 上下文
   * @param {Object} cam {x,y,zoom,viewW,viewH}
   * @param {Object} theme 主题
   * @param {number} time 时间（秒）
   */
  Art.drawBackground = function (ctx, cam, theme, time) {
    const W = CFG.W;
    const H = CFG.H;
    const t = theme || BVN.THEMES.shrine;
    const px = cam ? cam.x : 0;
    const py = cam ? cam.y : 0;

    // 天空
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, t.sky[0]);
    sky.addColorStop(0.5, t.sky[1]);
    sky.addColorStop(1, t.sky[2]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    if (t.id === 'inferno') drawInferno(ctx, t, time, px, py);
    else drawShrine(ctx, t, time, px, py);

    // 竞技区柔光：把中景抬亮一点，保证角色剪影在暗背景上有对比
    const pool = ctx.createRadialGradient(W * 0.5, H * 0.86, 60, W * 0.5, H * 0.86, 640);
    pool.addColorStop(0, t.id === 'inferno' ? 'rgba(255,116,54,0.17)' : 'rgba(120,170,255,0.15)');
    pool.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = pool;
    ctx.fillRect(0, 0, W, H);

    // 雾气
    const fog = ctx.createLinearGradient(0, H * 0.45, 0, H);
    fog.addColorStop(0, 'rgba(0,0,0,0)');
    fog.addColorStop(1, t.fog);
    ctx.fillStyle = fog;
    ctx.fillRect(0, 0, W, H);

    vignette(ctx, W, H, 'rgba(0,0,0,0.42)', 1);
  };

  /** 神社雨夜 */
  function drawShrine(ctx, t, time, px, py) {
    const W = CFG.W;
    const H = CFG.H;
    const gy = H * 0.845;

    // ① 远景：云 + 月亮
    // 云必须「径向渐变到边缘为 0」，否则每一团椭圆都会留下硬直的边，
    // 在深色天空上看起来像渲染错误的多边形色块。
    ctx.save();
    const cloudOff = -px * 0.04;
    for (let i = 0; i < 6; i++) {
      const cx = ((i * 300 + cloudOff + time * 4) % (W + 420)) - 140;
      const cy = 74 + Math.sin(i * 1.7) * 46;
      const lobes = 4 + (i % 2);
      for (let k = 0; k < lobes; k++) {
        const lx = cx + (k - lobes / 2) * 52;
        const ly = cy + Math.sin(k * 1.3 + i) * 13;
        const rx = 96 - Math.abs(k - lobes / 2) * 9;
        const rg = ctx.createRadialGradient(lx, ly, 2, lx, ly, rx);
        rg.addColorStop(0, 'rgba(126,150,214,0.26)');
        rg.addColorStop(0.5, 'rgba(92,114,180,0.12)');
        rg.addColorStop(1, 'rgba(70,88,150,0)');
        ctx.fillStyle = rg;
        ctx.save();
        ctx.translate(lx, ly);
        ctx.scale(1, 0.3);
        circle(ctx, 0, 0, rx);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();

    const mx = 1010 - px * 0.05;
    const my = 108 - py * 0.05;
    const mg = ctx.createRadialGradient(mx, my, 10, mx, my, 190);
    mg.addColorStop(0, 'rgba(232,240,255,0.95)');
    mg.addColorStop(0.22, 'rgba(190,212,255,0.36)');
    mg.addColorStop(0.55, 'rgba(140,170,240,0.12)');
    mg.addColorStop(1, 'rgba(100,130,220,0)');
    ctx.fillStyle = mg;
    circle(ctx, mx, my, 190);
    ctx.fill();
    ctx.fillStyle = '#eef3ff';
    circle(ctx, mx, my, 54);
    ctx.fill();
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = '#8f9dc0';
    circle(ctx, mx - 16, my - 12, 12);
    ctx.fill();
    circle(ctx, mx + 14, my + 16, 8);
    ctx.fill();
    circle(ctx, mx + 24, my - 20, 6);
    ctx.fill();
    ctx.globalAlpha = 1;

    // ② 远景：三层山脊（亮度逐层递减，但都比天空暗 → 明确读成剪影层次）
    const ridge = [
      { off: 0.1, base: gy - 40, amp: 78, col: '#26314e', step: 210, ph: 0 },
      { off: 0.16, base: gy - 8, amp: 58, col: '#1b2439', step: 170, ph: 1.7 },
      { off: 0.24, base: gy + 26, amp: 36, col: '#131a2a', step: 140, ph: 3.2 },
    ];
    for (let i = 0; i < ridge.length; i++) {
      const R = ridge[i];
      const o = -px * R.off;
      ctx.beginPath();
      ctx.moveTo(-60, H);
      const tops = [];
      for (let k = -1; k <= 12; k++) {
        const x = k * R.step + (o % R.step);
        const h = R.base - (Math.sin(k * 0.9 + R.ph) * 0.5 + 0.5) * R.amp - Math.sin(k * 2.3 + R.ph) * R.amp * 0.22;
        tops.push({ x: x, y: h });
        ctx.lineTo(x, h);
      }
      ctx.lineTo(W + 80, H);
      ctx.closePath();
      ctx.fillStyle = R.col;
      ctx.fill();
      // 山脊月光描边（让轮廓在暗背景里浮出来）
      if (i === 0) {
        ctx.beginPath();
        for (let k = 0; k < tops.length; k++) {
          if (k === 0) ctx.moveTo(tops[k].x, tops[k].y);
          else ctx.lineTo(tops[k].x, tops[k].y);
        }
        ctx.strokeStyle = 'rgba(150,180,255,0.26)';
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }
    }

    // ③ 中景：鸟居 + 神殿屋檐
    const toriiXs = [180, 700, 1240, 1760];
    for (let i = 0; i < toriiXs.length; i++) {
      const x = toriiXs[i] - px * 0.42;
      if (x < -260 || x > W + 260) continue;
      const s = 1.05 - i * 0.06;
      drawTorii(ctx, x, gy + 6, s, '#3a2530', 'rgba(168,58,54,0.9)');
    }
    // 神殿屋檐剪影
    for (let i = 0; i < 2; i++) {
      const bx = (i === 0 ? 380 : 1120) - px * 0.38;
      drawShrineRoof(ctx, bx, gy - 6, i === 0 ? 1 : 0.86);
    }

    // ④ 中近景：石灯笼（暖光）+ 竹影
    const lampXs = [300, 980, 1520];
    for (let i = 0; i < lampXs.length; i++) {
      const x = lampXs[i] - px * 0.62;
      if (x < -120 || x > W + 120) continue;
      drawStoneLantern(ctx, x, gy + 12, 1 - i * 0.05, t.lamp, time);
    }
    // 竹影
    for (let i = 0; i < 12; i++) {
      const x = 40 + i * 132 - (px * 0.7) % 132;
      const sway = Math.sin(time * 0.9 + i) * 5;
      ctx.strokeStyle = 'rgba(10,16,14,0.7)';
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(x, gy + 20);
      ctx.quadraticCurveTo(x + sway, gy - 120, x + sway * 2.2, gy - 250);
      ctx.stroke();
      ctx.lineWidth = 2;
      for (let k = 0; k < 4; k++) {
        const yy = gy - 80 - k * 44;
        ctx.beginPath();
        ctx.moveTo(x + sway * (0.3 + k * 0.2), yy);
        ctx.lineTo(x + sway + (k % 2 ? 26 : -26), yy - 16);
        ctx.stroke();
      }
    }

    // ⑤ 雨
    ctx.save();
    ctx.lineCap = 'round';
    for (let layer = 0; layer < 3; layer++) {
      const sp = 1 + layer * 0.45;
      const alpha = 0.16 + layer * 0.14;
      ctx.strokeStyle = 'rgba(198,220,255,' + alpha.toFixed(3) + ')';
      ctx.lineWidth = 1.1 + layer * 0.6;
      for (let i = 0; i < RAIN.length; i++) {
        const r = RAIN[i];
        const y = (r.y + time * r.sp * sp) % (H + 80) - 40;
        const x = (r.x - px * (0.3 + layer * 0.2) + y * 0.16) % (W + 200) - 60;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - r.len * 0.16, y + r.len);
        ctx.stroke();
      }
    }
    ctx.restore();

    // 闪电微光
    const flash = Math.sin(time * 0.53) * Math.sin(time * 1.31);
    if (flash > 0.985) {
      ctx.globalAlpha = (flash - 0.985) * 26;
      ctx.fillStyle = 'rgba(180,205,255,0.5)';
      ctx.fillRect(0, 0, W, H * 0.7);
      ctx.globalAlpha = 1;
    }
  }

  /** 冥火战场 */
  function drawInferno(ctx, t, time, px, py) {
    const W = CFG.W;
    const H = CFG.H;
    const gy = H * 0.845;

    // ① 翻滚雷云
    const cx = -px * 0.04;
    for (let i = 0; i < 10; i++) {
      const x = ((i * 230 + cx + time * 5) % (W + 500)) - 200;
      const y = 40 + Math.sin(i * 1.4 + time * 0.2) * 34;
      const r = 120 + (i % 3) * 46;
      const grd = ctx.createRadialGradient(x, y, 10, x, y, r);
      grd.addColorStop(0, 'rgba(186,66,40,0.62)');
      grd.addColorStop(0.55, 'rgba(126,36,24,0.4)');
      grd.addColorStop(1, 'rgba(52,12,12,0)');
      ctx.fillStyle = grd;
      ell(ctx, x, y, r, r * 0.52);
      ctx.fill();
      // 云顶暖边（被下方火光打亮）
      ctx.strokeStyle = 'rgba(255,120,60,0.16)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(x, y - r * 0.12, r * 0.86, r * 0.4, 0, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
    }
    // 地平线热霾：让"远方在烧"的空气感出来
    const haze = ctx.createLinearGradient(0, gy - 300, 0, gy - 40);
    haze.addColorStop(0, 'rgba(255,96,36,0)');
    haze.addColorStop(1, 'rgba(255,110,42,0.13)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, gy - 300, W, 260);

    // 偶发闪电
    const bolt = Math.sin(time * 0.7) * Math.sin(time * 1.7);
    if (bolt > 0.94) {
      const bx = 320 + ((time * 37) % 640);
      ctx.strokeStyle = 'rgba(255,226,170,' + Math.min(0.9, (bolt - 0.94) * 9).toFixed(3) + ')';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(bx, 40);
      let by = 40;
      let bxx = bx;
      for (let i = 0; i < 6; i++) {
        by += 26;
        bxx += (rnd(3, i) - 0.5) * 34;
        ctx.lineTo(bxx, by);
      }
      ctx.stroke();
    }

    // ② 远景：城墙断壁（带雉堞 + 顶缘月光）
    // 地平线暖光：先铺一层橙红辉光，城墙压在上面才有"远方在烧"的空气感
    const hz = ctx.createLinearGradient(0, gy - 240, 0, gy);
    hz.addColorStop(0, 'rgba(255,110,40,0)');
    hz.addColorStop(1, 'rgba(255,124,44,0.14)');
    ctx.fillStyle = hz;
    ctx.fillRect(0, gy - 240, W, 240);

    const wallOff = -(px * 0.16) % 300;
    for (let i = -1; i < 7; i++) {
      const x = i * 300 + wallOff;
      const hh = 132 + ((i + 3) % 3) * 46;
      const top = gy - hh;
      ctx.fillStyle = '#2c1310';
      ctx.fillRect(x, top, 252, hh);
      // 雉堞
      for (let k = 0; k < 5; k++) {
        ctx.fillRect(x + 8 + k * 50, top - 18, 30, 18);
      }
      // 砖缝（横向 + 错缝竖线），避免读成一块纯色板
      ctx.strokeStyle = 'rgba(0,0,0,0.34)';
      ctx.lineWidth = 1.4;
      for (let r = 0; r < 5; r++) {
        const yy = top + 14 + r * 24;
        ctx.beginPath();
        ctx.moveTo(x, yy);
        ctx.lineTo(x + 252, yy);
        ctx.stroke();
        for (let c = 0; c < 6; c++) {
          const xx = x + 18 + c * 44 + (r % 2) * 22;
          ctx.beginPath();
          ctx.moveTo(xx, yy);
          ctx.lineTo(xx, yy + 24);
          ctx.stroke();
        }
      }
      // 顶缘暖轮廓
      ctx.strokeStyle = 'rgba(255,132,60,0.6)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x + 252, top);
      ctx.stroke();
      // 箭窗（内部微光）
      ctx.fillStyle = 'rgba(255,132,58,0.16)';
      ctx.fillRect(x + 60, top + 44, 16, 40);
      ctx.fillRect(x + 168, top + 34, 16, 46);
    }
    // 断裂拱门
    const archX = 700 - px * 0.2;
    ctx.fillStyle = '#2e1411';
    ctx.beginPath();
    ctx.moveTo(archX - 74, gy);
    ctx.lineTo(archX - 74, gy - 130);
    ctx.quadraticCurveTo(archX, gy - 250, archX + 74, gy - 130);
    ctx.lineTo(archX + 74, gy);
    ctx.lineTo(archX + 30, gy);
    ctx.lineTo(archX + 30, gy - 128);
    ctx.quadraticCurveTo(archX, gy - 196, archX - 30, gy - 128);
    ctx.lineTo(archX - 30, gy);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,120,54,0.5)';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // 远处骷髅兵剪影阵列
    for (let i = 0; i < 24; i++) {
      const x = i * 84 - (px * 0.22) % 84;
      const y = gy - 4;
      const sway = Math.sin(time * 0.9 + i) * 0.05;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(sway);
      ctx.scale(1.5, 1.5);
      // 身体 + 头盔 + 肩甲（比火柴人更像阵列）
      ctx.fillStyle = 'rgba(26,12,14,0.95)';
      ctx.fillRect(-3, -30, 7, 30);
      ell(ctx, 0, -34, 5.4, 5.6);
      ctx.fill();
      ctx.fillRect(-7, -27, 14, 4);
      // 迎光侧暖轮廓（否则在暗红背景上完全看不见）
      ctx.strokeStyle = 'rgba(255,132,70,0.42)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(3.4, -30);
      ctx.lineTo(3.4, 0);
      ctx.stroke();
      // 长枪（斜举）
      ctx.strokeStyle = 'rgba(34,18,16,0.95)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-12, -6);
      ctx.lineTo(8, -52);
      ctx.stroke();
      ctx.fillStyle = 'rgba(170,180,190,0.55)';
      ctx.beginPath();
      ctx.moveTo(8, -52); ctx.lineTo(5, -46); ctx.lineTo(11, -47);
      ctx.closePath(); ctx.fill();
      // 眼窝微光
      ctx.fillStyle = 'rgba(170,255,140,0.85)';
      circle(ctx, -1.6, -35, 1.2);
      ctx.fill();
      circle(ctx, 2.2, -35, 1.2);
      ctx.fill();
      ctx.restore();
    }

    // ③ 中景：断裂石柱 + 长枪破旗
    const pillarXs = [120, 430, 860, 1180, 1520];
    for (let i = 0; i < pillarXs.length; i++) {
      const x = pillarXs[i] - px * 0.42;
      if (x < -140 || x > W + 140) continue;
      drawBrokenPillar(ctx, x, gy + 8, 0.9 + (i % 3) * 0.14);
    }
    for (let i = 0; i < 5; i++) {
      const x = 160 + i * 300 - px * 0.46;
      drawBanner(ctx, x, gy + 10, time, i);
    }

    // ④ 中近景：地面裂隙辉光 + 火星 + 鬼火
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = 'rgba(120,255,110,0.5)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      const x = i * 190 - (px * 0.9) % 190;
      ctx.beginPath();
      ctx.moveTo(x, gy + 24);
      ctx.lineTo(x + 18, gy + 44);
      ctx.lineTo(x + 6, gy + 62);
      ctx.lineTo(x + 30, gy + 84);
      ctx.stroke();
    }
    ctx.restore();

    // 浮空鬼火：贴地飘，带火舌形状（不是天上的绿点）
    for (let i = 0; i < 3; i++) {
      const x = 300 + i * 380 - px * 0.55;
      const y = gy - 86 - i * 26 + Math.sin(time * 1.2 + i * 2) * 14;
      const gl = ctx.createRadialGradient(x, y, 2, x, y, 62);
      gl.addColorStop(0, 'rgba(190,255,170,0.6)');
      gl.addColorStop(0.45, 'rgba(90,220,90,0.2)');
      gl.addColorStop(1, 'rgba(40,160,60,0)');
      ctx.fillStyle = gl;
      circle(ctx, x, y, 62);
      ctx.fill();
      // 火舌（2~3 片，随时间摆动）
      for (let t = 0; t < 3; t++) {
        const h = 22 + t * 9 + Math.sin(time * 5 + i + t) * 5;
        const ox = (t - 1) * 7;
        ctx.beginPath();
        ctx.moveTo(x + ox - 6, y + 6);
        ctx.quadraticCurveTo(x + ox - 2 + Math.sin(time * 4 + t) * 4, y - h * 0.6, x + ox, y - h);
        ctx.quadraticCurveTo(x + ox + 4, y - h * 0.4, x + ox + 6, y + 6);
        ctx.closePath();
        ctx.fillStyle = 'rgba(150,255,130,' + (0.24 - t * 0.05).toFixed(2) + ')';
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(226,255,210,0.9)';
      circle(ctx, x, y - 4, 3.4 + Math.sin(time * 4 + i) * 1.1);
      ctx.fill();
    }

    ctx.save();
    for (let i = 0; i < EMBERS.length; i++) {
      const e = EMBERS[i];
      const y = (e.y + time * e.sp * 2.4) % (H + 60) - 30;
      const x = (e.x - px * 0.5 + Math.sin(time + e.ph) * 26) % (W + 120) - 60;
      ctx.globalAlpha = e.a * (0.6 + Math.sin(time * 3 + e.ph) * 0.4);
      ctx.fillStyle = i % 3 === 0 ? '#9dff7a' : '#ffb066';
      circle(ctx, W - x, H - y, e.r);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /** 鸟居：两根立柱 + 双层横梁 + 匾额。 */
  function drawTorii(ctx, x, baseY, s, col, accent) {
    ctx.save();
    ctx.translate(x, baseY);
    ctx.scale(s, s);
    const h = 250;
    ctx.fillStyle = col;
    // 立柱（略内倾）
    ctx.beginPath();
    ctx.moveTo(-64, 0);
    ctx.lineTo(-50, -h);
    ctx.lineTo(-38, -h);
    ctx.lineTo(-44, 0);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(64, 0);
    ctx.lineTo(50, -h);
    ctx.lineTo(38, -h);
    ctx.lineTo(44, 0);
    ctx.closePath();
    ctx.fill();
    // 上横梁（笠木）
    ctx.beginPath();
    ctx.moveTo(-104, -h - 26);
    ctx.quadraticCurveTo(0, -h - 10, 104, -h - 26);
    ctx.lineTo(104, -h - 12);
    ctx.quadraticCurveTo(0, -h + 4, -104, -h - 12);
    ctx.closePath();
    ctx.fill();
    // 下横梁（贯）
    ctx.fillRect(-72, -h + 34, 144, 12);
    // 匾额
    ctx.fillStyle = accent;
    ctx.fillRect(-15, -h + 2, 30, 30);
    // 月光顶缘（让剪影在夜空里有轮廓）
    ctx.strokeStyle = 'rgba(150,180,255,0.35)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-104, -h - 26);
    ctx.quadraticCurveTo(0, -h - 10, 104, -h - 26);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-64, -h + 2);
    ctx.lineTo(-64, 0);
    ctx.moveTo(64, -h + 2);
    ctx.lineTo(64, 0);
    ctx.stroke();
    ctx.restore();
  }

  /** 神殿屋檐剪影。 */
  function drawShrineRoof(ctx, x, baseY, s) {
    ctx.save();
    ctx.translate(x, baseY);
    ctx.scale(s * 0.78, s * 0.78);
    ctx.fillStyle = 'rgba(17,12,20,0.96)';
    ctx.beginPath();
    ctx.moveTo(-180, -50);
    ctx.quadraticCurveTo(-90, -120, 0, -132);
    ctx.quadraticCurveTo(90, -120, 180, -50);
    ctx.quadraticCurveTo(96, -74, 0, -76);
    ctx.quadraticCurveTo(-96, -74, -180, -50);
    ctx.closePath();
    ctx.fill();
    // 屋檐月光
    ctx.strokeStyle = 'rgba(150,180,255,0.3)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-180, -50);
    ctx.quadraticCurveTo(-90, -120, 0, -132);
    ctx.quadraticCurveTo(90, -120, 180, -50);
    ctx.stroke();
    ctx.fillStyle = 'rgba(22,16,26,0.96)';
    ctx.fillRect(-120, -50, 240, 54);
    ctx.restore();
  }

  /** 石灯笼。 */
  function drawStoneLantern(ctx, x, baseY, s, lampCol, time) {
    ctx.save();
    ctx.translate(x, baseY);
    ctx.scale(s, s);
    const fl = 0.8 + Math.sin(time * 6 + x) * 0.12;
    // 光晕
    const gl = ctx.createRadialGradient(0, -96, 4, 0, -96, 76 * fl);
    gl.addColorStop(0, 'rgba(255,214,140,0.5)');
    gl.addColorStop(1, 'rgba(255,170,60,0)');
    ctx.fillStyle = gl;
    circle(ctx, 0, -96, 76 * fl);
    ctx.fill();
    // 座
    ctx.fillStyle = 'rgba(28,30,40,0.98)';
    ctx.fillRect(-18, -14, 36, 16);
    ctx.fillRect(-11, -46, 22, 34);
    // 灯室
    ctx.fillStyle = 'rgba(34,36,48,0.98)';
    ctx.fillRect(-20, -92, 40, 34);
    // 火
    ctx.fillStyle = lampCol;
    ctx.globalAlpha = 0.9;
    roundRect(ctx, -11, -86, 22, 22, 4);
    ctx.fill();
    ctx.globalAlpha = 1;
    // 笠
    ctx.fillStyle = 'rgba(24,26,36,0.99)';
    ctx.beginPath();
    ctx.moveTo(-34, -92);
    ctx.lineTo(34, -92);
    ctx.lineTo(20, -108);
    ctx.lineTo(-20, -108);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** 断裂石柱。 */
  function drawBrokenPillar(ctx, x, baseY, s) {
    ctx.save();
    ctx.translate(x, baseY);
    ctx.scale(s, s);
    const hh = 210;
    const g = ctx.createLinearGradient(-26, 0, 26, 0);
    g.addColorStop(0, 'rgba(52,26,24,0.98)');
    g.addColorStop(1, 'rgba(38,18,17,0.98)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-26, 0);
    ctx.lineTo(-20, -hh + 30);
    ctx.lineTo(-4, -hh);
    ctx.lineTo(16, -hh + 22);
    ctx.lineTo(24, 0);
    ctx.closePath();
    ctx.fill();
    // 迎光侧边缘（暖橙轮廓光）
    ctx.strokeStyle = 'rgba(255,120,60,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-26, 0);
    ctx.lineTo(-20, -hh + 30);
    ctx.lineTo(-4, -hh);
    ctx.stroke();
    // 柱身凹槽
    ctx.strokeStyle = 'rgba(96,40,30,0.75)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-14 + i * 12, -10);
      ctx.lineTo(-10 + i * 12, -hh + 40);
      ctx.stroke();
    }
    // 基座
    ctx.fillStyle = 'rgba(30,14,14,0.98)';
    ctx.fillRect(-34, -6, 68, 18);
    ctx.strokeStyle = 'rgba(255,120,60,0.25)';
    ctx.strokeRect(-34, -6, 68, 18);
    ctx.restore();
  }

  /** 破旗 + 长枪。 */
  function drawBanner(ctx, x, baseY, time, i) {
    ctx.save();
    ctx.translate(x, baseY);
    ctx.strokeStyle = 'rgba(30,16,16,0.95)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-6, -196);
    ctx.stroke();
    // 旗
    const sw = Math.sin(time * 1.6 + i) * 8;
    ctx.beginPath();
    ctx.moveTo(-6, -190);
    ctx.quadraticCurveTo(-42 + sw, -176, -54 + sw, -150);
    ctx.lineTo(-34 + sw * 0.6, -128);
    ctx.lineTo(-10, -150);
    ctx.closePath();
    ctx.fillStyle = 'rgba(96,22,20,0.8)';
    ctx.fill();
    ctx.restore();
  }

  /* ============================================================
   *  6. 地面 / 投影 / 立绘
   * ============================================================ */

  /** 世界空间地面（在相机变换后绘制）。 */
  Art.drawGround = function (ctx, theme, time) {
    const t = theme || BVN.THEMES.shrine;
    const gy = CFG.GROUND_Y;
    const W = CFG.STAGE_W;

    if (t.id === 'inferno') {
      const g = ctx.createLinearGradient(0, gy - 8, 0, gy + 130);
      g.addColorStop(0, '#3d1d15');
      g.addColorStop(0.4, '#2a120e');
      g.addColorStop(1, '#100807');
      ctx.fillStyle = g;
      ctx.fillRect(-200, gy - 8, W + 400, 200);
      // 熔岩底光：地面下透出的橙红光
      const lava = ctx.createLinearGradient(0, gy, 0, gy + 70);
      lava.addColorStop(0, 'rgba(255,110,40,0.20)');
      lava.addColorStop(1, 'rgba(255,60,20,0)');
      ctx.fillStyle = lava;
      ctx.fillRect(-200, gy, W + 400, 70);
      // 焦土纹理
      ctx.strokeStyle = 'rgba(150,72,36,0.6)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 40; i++) {
        const x = -100 + i * 52;
        ctx.beginPath();
        ctx.moveTo(x, gy + 4);
        ctx.lineTo(x + 14, gy + 16);
        ctx.stroke();
      }
      // 发光裂隙（外发光 + 内芯）：每条形状不同，避免读成一排箭头
      for (let i = 0; i < 12; i++) {
        const x = -60 + i * 160;
        const w1 = ((i * 37) % 19) - 9;
        const w2 = ((i * 53) % 23) - 11;
        function crack(lw, col) {
          ctx.strokeStyle = col;
          ctx.lineWidth = lw;
          ctx.beginPath();
          ctx.moveTo(x, gy + 1);
          ctx.lineTo(x + 14 + w1, gy + 13);
          ctx.lineTo(x + 6 + w2, gy + 27);
          ctx.lineTo(x + 20 + w1, gy + 40);
          ctx.stroke();
        }
        crack(6, 'rgba(255,110,40,0.16)');
        crack(1.8, 'rgba(190,255,140,0.5)');
      }
      // 碎石
      ctx.fillStyle = 'rgba(58,32,26,0.92)';
      for (let i = 0; i < 26; i++) {
        const x = -40 + i * 68;
        ell(ctx, x, gy + 18 + (i % 3) * 14, 5 + (i % 4), 3);
        ctx.fill();
      }
    } else {
      const g = ctx.createLinearGradient(0, gy - 8, 0, gy + 130);
      g.addColorStop(0, '#313d55');
      g.addColorStop(0.35, '#222b3d');
      g.addColorStop(1, '#0e121c');
      ctx.fillStyle = g;
      ctx.fillRect(-200, gy - 8, W + 400, 200);
      // 湿石板：一行行石块（每块有独立明度）+ 深色砖缝
      for (let row = 0; row < 7; row++) {
        const y = gy + 4 + row * row * 3.4 + row * 10;
        const h = 5 + row * 2.4;
        const step = 78 + row * 16;
        const shift = (row % 2) * step * 0.5;
        for (let i = -3; i < 26; i++) {
          const x = -200 + i * step + shift;
          const l = 0.055 - row * 0.006 + ((i * 7 + row * 3) % 5) * 0.012;
          ctx.fillStyle = 'rgba(140,168,214,' + Math.max(0.012, l).toFixed(3) + ')';
          ctx.fillRect(x + 2, y, step - 4, h);
        }
        ctx.strokeStyle = 'rgba(150,180,235,' + (0.2 - row * 0.018).toFixed(3) + ')';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(-200, y);
        ctx.lineTo(W + 200, y + 2);
        ctx.stroke();
      }
      // 竖缝
      ctx.strokeStyle = 'rgba(120,150,205,0.11)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 26; i++) {
        const x = -100 + i * 70;
        ctx.beginPath();
        ctx.moveTo(x, gy + 6);
        ctx.lineTo(x - 14, gy + 104);
        ctx.stroke();
      }
      // 雨水反光：地面整体的横向湿亮带
      const wet = ctx.createLinearGradient(0, gy + 2, 0, gy + 96);
      wet.addColorStop(0, 'rgba(170,200,255,0.16)');
      wet.addColorStop(0.5, 'rgba(120,155,225,0.05)');
      wet.addColorStop(1, 'rgba(90,120,190,0)');
      ctx.fillStyle = wet;
      ctx.fillRect(-200, gy + 2, W + 400, 96);
      // 灯与月的湿地倒影（竖向拉伸的椭圆拖影）
      function reflect(cx, col, wide, tall, a) {
        const rg = ctx.createRadialGradient(cx, gy + 8, 2, cx, gy + 8, wide);
        rg.addColorStop(0, 'rgba(' + col + ',' + a + ')');
        rg.addColorStop(1, 'rgba(' + col + ',0)');
        ctx.fillStyle = rg;
        for (let k = 0; k < 5; k++) {
          ell(ctx, cx, gy + 12 + k * 17, wide * (1 - k * 0.13), tall * (1 - k * 0.1));
          ctx.fill();
        }
      }
      reflect(300, '255,206,132', 96, 13, 0.36);
      reflect(980, '172,206,255', 104, 15, 0.26);
      reflect(1520, '255,206,132', 82, 11, 0.24);
    }

    // 地面高光线
    ctx.strokeStyle = t.groundLine;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-200, gy);
    ctx.lineTo(W + 200, gy);
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  BVN.Art = Art;
})(window.BVN);

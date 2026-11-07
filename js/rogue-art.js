/* js/rogue-art.js — 爬塔肉鸽模式美术层（下水道场景 / 平台 / 机关 / 道具 / 7 种怪物）
 *
 * 全部为 Canvas 程序化绘制，零外部图片、零硬编码调色（颜色统一走 data 里的 colors 表，
 * 明暗由 Art.kit.shade 派生），与项目既有「骨骼 + 描边」绘制规范一致。
 */
window.BVN = window.BVN || {};

(function (BVN) {
  'use strict';

  const Art = BVN.Art;
  const K = Art.kit;
  const TAU = Math.PI * 2;

  const RA = {};

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function hash(n) {
    n = (n ^ 61) ^ (n >>> 16);
    n = n + (n << 3);
    n ^= n >>> 4;
    n = (n * 0x27d4eb2d) | 0;
    n ^= n >>> 15;
    return ((n >>> 0) / 4294967295);
  }
  function rgba(hex, a) { return K.rgba(hex, a); }
  function shade(hex, n) { return K.shade(hex, n); }

  function fillRR(ctx, x, y, w, h, r, fill) {
    Art.roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  /* =================================================================
   *  1. 背景：下水道
   * ================================================================= */

  RA.drawBackground = function (ctx, cam, time, room) {
    const W = BVN.CFG.W, H = BVN.CFG.H;
    const cx = cam.x || 0;
    const boss = !!room.boss;

    // 基础暗色
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, boss ? '#140607' : '#05090b');
    bg.addColorStop(0.42, boss ? '#1a090b' : '#0a1414');
    bg.addColorStop(0.72, boss ? '#241010' : '#10201c');
    bg.addColorStop(1, boss ? '#120607' : '#08110f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // 远处渗光
    const glow = ctx.createRadialGradient(W * 0.5, 250, 40, W * 0.5, 360, 640);
    glow.addColorStop(0, boss ? 'rgba(190,60,38,0.30)' : 'rgba(96,168,118,0.20)');
    glow.addColorStop(0.55, boss ? 'rgba(120,34,22,0.12)' : 'rgba(50,110,80,0.09)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // ---- 远景：排污涵洞与拱券（视差 0.18）
    const far = -cx * 0.18;
    for (let i = -1; i < 7; i++) {
      const x = i * 300 + (far % 300);
      const y = 118 + Math.sin(i * 1.7) * 18;
      ctx.save();
      ctx.translate(x, y);
      // 拱洞
      ctx.beginPath();
      ctx.moveTo(0, 360);
      ctx.lineTo(0, 150);
      ctx.quadraticCurveTo(0, 40, 110, 40);
      ctx.quadraticCurveTo(220, 40, 220, 150);
      ctx.lineTo(220, 360);
      ctx.closePath();
      ctx.fillStyle = 'rgba(4,8,9,0.92)';
      ctx.fill();
      // 拱边高光
      ctx.strokeStyle = boss ? 'rgba(150,70,54,0.16)' : 'rgba(90,140,110,0.16)';
      ctx.lineWidth = 3;
      ctx.stroke();
      // 洞内排气管
      ctx.strokeStyle = 'rgba(120,150,130,0.08)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(40, 360);
      ctx.lineTo(40, 130);
      ctx.quadraticCurveTo(40, 96, 74, 96);
      ctx.lineTo(180, 96);
      ctx.stroke();
      ctx.restore();
    }

    // ---- 中景砖墙（视差 0.46）
    const midX = -cx * 0.46;
    const bw = 66, bh = 38;
    const cols = Math.ceil(W / bw) + 3;
    ctx.save();
    ctx.translate(midX % bw - bw, 0);
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < 9; r++) {
        const bx = c * bw;
        const by = 92 + r * bh;
        if (by > 520) continue;
        const hv = hash(c * 97 + r * 31 + (room.w || 0));
        const tint = boss ? 'rgba(70,30,26,' : 'rgba(54,72,62,';
        ctx.fillStyle = tint + (0.28 + hv * 0.34).toFixed(2) + ')';
        ctx.fillRect(bx + 1, by + 1, bw - 3, bh - 3);
        // 砖缝苔藓
        if (hv > 0.78) {
          ctx.fillStyle = boss ? 'rgba(150,60,42,0.22)' : 'rgba(86,132,88,0.22)';
          ctx.fillRect(bx + 6, by + bh - 8, bw * (0.3 + hv * 0.4), 3);
        }
        // 竖向苔痕
        if (hv > 0.62 && hv < 0.7) {
          ctx.strokeStyle = boss ? 'rgba(120,46,34,0.25)' : 'rgba(70,120,80,0.26)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(bx + 12, by + bh);
          ctx.lineTo(bx + 12 + Math.sin(time * 0.6 + c) * 3, by + bh + 26 + hv * 30);
          ctx.stroke();
        }
      }
    }
    ctx.restore();

    // ---- 大型管道（视差 0.62 横向 / 纵向随攀爬缓慢漂移）
    const pipeX = -cx * 0.62;
    const vshift = ((cam.y || 0) * 0.22) % 260;
    for (let i = 0; i < 5; i++) {
      const x = ((i * 420 + 120 + pipeX) % (W + 500) + W + 500) % (W + 500) - 200;
      const y = 120 + (i % 2) * 74 + vshift - 130;
      drawPipe(ctx, x, y, 58, 300, time, i, boss);
    }

    // ---- 悬吊铁链
    for (let i = 0; i < 8; i++) {
      const x = ((i * 260 + 60 + -cx * 0.7) % (W + 260) + W + 260) % (W + 260) - 130;
      const len = 60 + hash(i * 53) * 120 + vshift * 0.35;
      ctx.strokeStyle = 'rgba(90,104,96,0.34)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + Math.sin(time * 0.5 + i) * 6, len);
      ctx.stroke();
      for (let s = 10; s < len; s += 12) {
        ctx.beginPath();
        ctx.ellipse(x + Math.sin(time * 0.5 + i) * (s / len), s, 4, 6, 0, 0, TAU);
        ctx.strokeStyle = 'rgba(110,126,116,0.32)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
    }

    // ---- 底部污水光带
    const wet = ctx.createLinearGradient(0, 470, 0, H);
    wet.addColorStop(0, 'rgba(0,0,0,0)');
    wet.addColorStop(0.55, boss ? 'rgba(120,34,30,0.20)' : 'rgba(36,96,66,0.24)');
    wet.addColorStop(1, boss ? 'rgba(70,14,14,0.55)' : 'rgba(8,34,26,0.62)');
    ctx.fillStyle = wet;
    ctx.fillRect(0, 470, W, H - 470);

    // 水面漂浮的荧光
    for (let i = 0; i < 26; i++) {
      const p = hash(i * 17 + 3);
      const x = ((p * W * 1.6 - cx * 0.85) % W + W) % W;
      const y = 540 + hash(i * 29) * 150 + Math.sin(time * 0.8 + i) * 5;
      ctx.globalAlpha = 0.12 + 0.2 * Math.abs(Math.sin(time * 0.7 + i * 2));
      ctx.fillStyle = boss ? '#ff8a6a' : '#6ce0a0';
      ctx.beginPath();
      ctx.ellipse(x, y, 8 + p * 12, 2.4, 0, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ---- 毒雾层
    for (let b = 0; b < 3; b++) {
      const yy = 400 + b * 96 + Math.sin(time * 0.25 + b) * 14;
      const grad = ctx.createLinearGradient(0, yy - 70, 0, yy + 70);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.5, boss ? 'rgba(150,40,30,0.10)' : 'rgba(70,140,96,0.09)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, yy - 70, W, 140);
    }

    // ---- 孢子浮尘
    for (let i = 0; i < 34; i++) {
      const p = hash(i * 41 + 7);
      const spd = 0.12 + p * 0.3;
      const x = ((p * 1600 + time * 22 * spd - cx * 0.5) % (W + 80) + W + 80) % (W + 80) - 40;
      const y = ((hash(i * 11) * H + time * 12 * spd) % H);
      ctx.globalAlpha = 0.10 + p * 0.2;
      ctx.fillStyle = boss ? '#ff9b72' : '#9be0b0';
      ctx.beginPath();
      ctx.arc(x, y, 1 + p * 2.2, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ---- 暗角
    const vg = ctx.createRadialGradient(W / 2, H * 0.45, 160, W / 2, H * 0.5, 820);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, boss ? 'rgba(6,0,0,0.86)' : 'rgba(0,4,4,0.82)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  };

  function drawPipe(ctx, x, y, w, h, time, seed, boss) {
    ctx.save();
    // 管身
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, 'rgba(36,50,44,0.85)');
    g.addColorStop(0.35, 'rgba(74,94,82,0.9)');
    g.addColorStop(0.55, 'rgba(98,120,104,0.9)');
    g.addColorStop(1, 'rgba(28,40,34,0.85)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    // 法兰
    for (let i = 0; i < 3; i++) {
      const fy = y + 24 + i * (h - 48) / 2;
      ctx.fillStyle = 'rgba(18,26,22,0.7)';
      ctx.fillRect(x - 5, fy, w + 10, 13);
      ctx.fillStyle = 'rgba(120,140,126,0.22)';
      ctx.fillRect(x - 5, fy, w + 10, 3);
    }
    // 阀门
    ctx.strokeStyle = boss ? 'rgba(150,64,48,0.6)' : 'rgba(96,124,104,0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h * 0.62, 15, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + w / 2 - 18, y + h * 0.62);
    ctx.lineTo(x + w / 2 + 18, y + h * 0.62);
    ctx.stroke();
    // 滴落的绿浆
    const drip = (time * 0.6 + seed) % 1;
    ctx.fillStyle = boss ? 'rgba(220,88,60,0.5)' : 'rgba(96,220,140,0.45)';
    ctx.beginPath();
    ctx.ellipse(x + w * 0.7, y + h + drip * 32, 3.2, 7, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /* =================================================================
   *  2. 地面 / 平台 / 酸池 / 闸门
   * ================================================================= */

  RA.drawFloor = function (ctx, f, time, boss) {
    const top = f.y;
    const w = f.w;
    // 地表石台
    const g = ctx.createLinearGradient(0, top, 0, top + 130);
    g.addColorStop(0, '#2d3a33');
    g.addColorStop(0.12, '#22302a');
    g.addColorStop(1, '#0a1210');
    ctx.fillStyle = g;
    ctx.fillRect(f.x, top, w, 720 - top + 60);

    // 砖块纹理
    const bw = 74, bh = 30;
    const cols = Math.ceil(w / bw);
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < 4; r++) {
        const bx = f.x + c * bw;
        const by = top + 20 + r * bh;
        const hv = hash(c * 37 + r * 13 + f.x);
        ctx.fillStyle = 'rgba(76,98,82,' + (0.10 + hv * 0.16).toFixed(2) + ')';
        ctx.fillRect(bx + 2, by, bw - 5, bh - 4);
      }
    }
    // 顶面：湿滑的污泥边
    const rim = ctx.createLinearGradient(0, top - 8, 0, top + 18);
    rim.addColorStop(0, boss ? 'rgba(150,62,44,0.32)' : 'rgba(88,150,104,0.32)');
    rim.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rim;
    ctx.fillRect(f.x, top - 8, w, 26);
    ctx.fillStyle = boss ? '#4a1f1a' : '#2e4436';
    ctx.fillRect(f.x, top, w, 3);
    // 苔藓垂边
    for (let i = 0; i < cols; i++) {
      const hv = hash(i * 71 + f.x);
      if (hv < 0.55) continue;
      const bx = f.x + i * bw + 8 + hv * 20;
      ctx.fillStyle = boss ? 'rgba(170,66,48,0.35)' : 'rgba(78,142,94,0.42)';
      const len = 8 + hv * 22;
      ctx.beginPath();
      ctx.moveTo(bx, top + 2);
      ctx.lineTo(bx + 7, top + 2);
      ctx.lineTo(bx + 3 + Math.sin(time * 0.9 + i) * 3, top + len);
      ctx.closePath();
      ctx.fill();
    }
  };

  RA.drawPlatform = function (ctx, p, time) {
    const x = p.x, y = p.y, w = p.w;
    if (p.kind === 'conveyor') {
      // 传送带
      ctx.fillStyle = '#20292a';
      ctx.fillRect(x, y, w, p.h || 14);
      ctx.strokeStyle = 'rgba(120,140,132,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y + 1); ctx.lineTo(x + w, y + 1);
      ctx.stroke();
      const off = (time * (p.speed || 170) * 0.6) % 40;
      ctx.strokeStyle = 'rgba(150,190,160,0.55)';
      ctx.lineWidth = 3;
      for (let cx = -40; cx < w; cx += 40) {
        let px = x + cx + (p.dir >= 0 ? off : -off);
        px = Math.max(x + 2, Math.min(x + w - 2, px));
        ctx.beginPath();
        ctx.moveTo(px, y + 3);
        ctx.lineTo(px + 10 * (p.dir >= 0 ? 1 : -1), y + 7);
        ctx.lineTo(px, y + 11);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(90,220,150,0.18)';
      ctx.fillRect(x, y + (p.h || 14) - 3, w, 3);
      return;
    }
    if (p.kind === 'moving') {
      // 锈铁浮板
      const g = ctx.createLinearGradient(0, y, 0, y + 22);
      g.addColorStop(0, '#5b625c');
      g.addColorStop(1, '#2a2f2b');
      ctx.fillStyle = g;
      Art.roundRect(ctx, x, y, w, 20, 5);
      ctx.fill();
      ctx.strokeStyle = 'rgba(12,16,14,0.9)';
      ctx.lineWidth = 2;
      Art.roundRect(ctx, x, y, w, 20, 5);
      ctx.stroke();
      ctx.fillStyle = 'rgba(160,180,164,0.5)';
      for (let i = 0; i < 4; i++) ctx.fillRect(x + 10 + i * (w - 24) / 3, y + 4, 3, 3);
      // 下方浮筒
      ctx.fillStyle = 'rgba(80,200,140,0.2)';
      ctx.fillRect(x + 6, y + 20, w - 12, 5);
      return;
    }
    // 普通 / 可破坏石板
    const shake = p.shakeT > 0 ? Math.sin(time * 60) * 2 : 0;
    ctx.save();
    ctx.translate(shake, 0);
    const g = ctx.createLinearGradient(0, y, 0, y + 26);
    g.addColorStop(0, p.kind === 'break' ? '#4a4038' : '#43514a');
    g.addColorStop(1, '#1a2420');
    ctx.fillStyle = g;
    Art.roundRect(ctx, x, y, w, 24, 4);
    ctx.fill();
    // 石缝
    ctx.strokeStyle = 'rgba(10,15,12,0.75)';
    ctx.lineWidth = 2;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(x + (w / 4) * i, y + 3);
      ctx.lineTo(x + (w / 4) * i + 2, y + 21);
      ctx.stroke();
    }
    // 顶面污泥
    ctx.fillStyle = p.kind === 'break' ? 'rgba(120,96,70,0.5)' : 'rgba(78,146,98,0.55)';
    ctx.fillRect(x + 2, y, w - 4, 3);
    // 苔藓滴
    for (let i = 0; i < 5; i++) {
      const hv = hash((x + i * 37));
      if (hv < 0.6) continue;
      const px = x + 8 + i * (w - 16) / 4;
      ctx.fillStyle = 'rgba(74,138,92,0.5)';
      ctx.beginPath();
      ctx.ellipse(px, y + 26 + hv * 14, 3, 8 + hv * 8, 0, 0, TAU);
      ctx.fill();
    }
    // 裂纹
    if (p.kind === 'break' || p.crack > 0) {
      ctx.strokeStyle = 'rgba(255,180,110,0.6)';
      ctx.lineWidth = 1.6;
      const ck = p.crack || (p.kind === 'break' ? 0.3 : 0);
      for (let i = 0; i < 3; i++) {
        const sx = x + w * (0.25 + i * 0.24);
        ctx.beginPath();
        ctx.moveTo(sx, y + 2);
        ctx.lineTo(sx + 7, y + 10 + ck * 6);
        ctx.lineTo(sx - 2, y + 20);
        ctx.stroke();
      }
    }
    ctx.restore();
  };

  RA.drawAcid = function (ctx, a, time, boss) {
    const top = a.y + 4;
    const g = ctx.createLinearGradient(0, top, 0, top + a.h);
    g.addColorStop(0, boss ? 'rgba(190,64,44,0.55)' : 'rgba(92,214,120,0.5)');
    g.addColorStop(0.5, boss ? 'rgba(120,36,26,0.55)' : 'rgba(32,140,72,0.55)');
    g.addColorStop(1, boss ? 'rgba(40,8,6,0.75)' : 'rgba(4,40,24,0.75)');
    ctx.fillStyle = g;
    ctx.fillRect(a.x, top, a.w, a.h);

    // 波纹面
    ctx.strokeStyle = boss ? 'rgba(255,140,110,0.65)' : 'rgba(140,255,170,0.62)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (let x = 0; x <= a.w; x += 12) {
      const yy = top + Math.sin(time * 1.6 + x * 0.05) * 4 + Math.sin(time * 0.9 + x * 0.11) * 2;
      if (x === 0) ctx.moveTo(a.x + x, yy); else ctx.lineTo(a.x + x, yy);
    }
    ctx.stroke();

    // 气泡
    for (let i = 0; i < 7; i++) {
      const p = hash(i * 19 + a.x);
      const bx = a.x + 10 + ((p * a.w + time * (6 + p * 12)) % (a.w - 20));
      const by = top + 14 + ((1 - ((time * (0.3 + p * 0.5) + p) % 1)) * (a.h - 20));
      ctx.globalAlpha = 0.25 + p * 0.35;
      ctx.strokeStyle = boss ? '#ff9a7a' : '#b8ffcf';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(bx, by, 2 + p * 4, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // 池底辉光
    const gl = ctx.createLinearGradient(0, top, 0, top + 40);
    gl.addColorStop(0, boss ? 'rgba(255,90,60,0.16)' : 'rgba(90,255,150,0.18)');
    gl.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(a.x, top, a.w, 46);
  };

  /* 水池：终局 BOSS 房中鳄鱼逃入 / 合体登场的地方 */
  RA.drawWater = function (ctx, a, time, boss) {
    const top = a.y + 4;
    const g = ctx.createLinearGradient(0, top, 0, top + a.h);
    g.addColorStop(0, 'rgba(46,110,124,0.62)');
    g.addColorStop(0.35, 'rgba(18,64,76,0.72)');
    g.addColorStop(1, 'rgba(3,16,22,0.88)');
    ctx.fillStyle = g;
    ctx.fillRect(a.x, top, a.w, a.h);

    // 水面波纹
    ctx.strokeStyle = 'rgba(150,240,255,0.7)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (let x = 0; x <= a.w; x += 10) {
      const yy = top + Math.sin(time * 1.8 + x * 0.06) * 4 + Math.sin(time * 1.1 + x * 0.13) * 2;
      if (x === 0) ctx.moveTo(a.x + x, yy); else ctx.lineTo(a.x + x, yy);
    }
    ctx.stroke();

    // 池底暗光与气泡
    for (let i = 0; i < 9; i++) {
      const p = hash(i * 31 + a.x);
      const bx = a.x + 12 + ((p * a.w + time * (8 + p * 16)) % (a.w - 24));
      const by = top + 16 + ((1 - ((time * (0.25 + p * 0.45) + p) % 1)) * (a.h - 22));
      ctx.globalAlpha = 0.2 + p * 0.32;
      ctx.strokeStyle = '#bff2ff';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(bx, by, 2 + p * 5, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // 水面高光
    const gl = ctx.createLinearGradient(0, top, 0, top + 34);
    gl.addColorStop(0, boss ? 'rgba(150,240,255,0.2)' : 'rgba(120,220,255,0.16)');
    gl.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(a.x, top, a.w, 38);

    // 池边石沿
    ctx.fillStyle = 'rgba(60,80,74,0.9)';
    ctx.fillRect(a.x - 4, top - 6, a.w + 8, 6);
    ctx.fillStyle = 'rgba(120,160,150,0.35)';
    ctx.fillRect(a.x - 4, top - 6, a.w + 8, 2);
  };

  RA.drawSteam = function (ctx, h, time) {
    const x = h.x, y = h.y, w = h.w;
    // 铁栅
    ctx.fillStyle = '#1b2422';
    ctx.fillRect(x - 6, y - 10, w + 12, 10);
    ctx.strokeStyle = 'rgba(120,150,134,0.55)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(x - 6 + i * (w + 12) / 4, y - 9);
      ctx.lineTo(x - 6 + i * (w + 12) / 4, y - 1);
      ctx.stroke();
    }
    const ph = h.phase; // 0 待机 1 预警 2 喷发
    if (ph === 1) {
      ctx.globalAlpha = 0.35 + 0.3 * Math.abs(Math.sin(time * 22));
      ctx.fillStyle = h.clean ? '#bfe8ff' : '#ffcf6a';
      ctx.fillRect(x - 2, y - 16, w + 4, 8);
      ctx.globalAlpha = 1;
      // 预警箭头
      ctx.fillStyle = h.clean ? 'rgba(190,235,255,0.7)' : 'rgba(255,200,90,0.75)';
      ctx.beginPath();
      ctx.moveTo(x + w / 2 - 8, y - 30);
      ctx.lineTo(x + w / 2 + 8, y - 30);
      ctx.lineTo(x + w / 2, y - 18);
      ctx.closePath();
      ctx.fill();
    } else if (ph === 2) {
      const hh = h.h || 160;
      const g = ctx.createLinearGradient(0, y - hh, 0, y);
      g.addColorStop(0, h.clean ? 'rgba(220,245,255,0)' : 'rgba(255,240,190,0)');
      g.addColorStop(0.35, h.clean ? 'rgba(210,240,255,0.42)' : 'rgba(255,236,180,0.45)');
      g.addColorStop(1, h.clean ? 'rgba(200,240,255,0.75)' : 'rgba(255,230,170,0.8)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w * 0.28, y - hh);
      ctx.quadraticCurveTo(x + w / 2, y - hh * 1.1, x + w * 0.72, y - hh);
      ctx.lineTo(x + w, y);
      ctx.closePath();
      ctx.fill();
      for (let i = 0; i < 9; i++) {
        const p = (time * 1.6 + i / 9) % 1;
        ctx.globalAlpha = 0.4 * (1 - p);
        ctx.fillStyle = h.clean ? '#e8f8ff' : '#fff2c8';
        const yy = y - p * hh;
        ctx.beginPath();
        ctx.arc(x + w / 2 + Math.sin(p * 8 + i) * w * 0.4, yy, 8 + p * 20, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  };

  RA.drawPendulum = function (ctx, h, time) {
    const ang = Math.sin((time / h.period) * TAU) * h.amp;
    const ax = h.x, ay = 0;
    const bx = ax + Math.sin(ang) * h.len;
    const by = ay + Math.cos(ang) * h.len;
    // 铁链
    ctx.strokeStyle = 'rgba(130,146,136,0.7)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let t = 0; t <= 1.001; t += 0.06) {
      const x = ax + Math.sin(ang) * h.len * t;
      const y = ay + Math.cos(ang) * h.len * t;
      if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // 尖刺球
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(ang * 0.6 + time * 0.4);
    ctx.fillStyle = '#3a443e';
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#111815';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#7c8a80';
    for (let i = 0; i < 8; i++) {
      const a2 = i / 8 * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a2) * 24, Math.sin(a2) * 24);
      ctx.lineTo(Math.cos(a2) * 44, Math.sin(a2) * 44);
      ctx.lineTo(Math.cos(a2 + 0.28) * 24, Math.sin(a2 + 0.28) * 24);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // 顶部横梁
    ctx.fillStyle = '#232d29';
    ctx.fillRect(ax - 40, 0, 80, 14);
  };

  RA.drawBall = function (ctx, b, time) {
    if (b.dead) return;
    ctx.save();
    ctx.translate(b.x, b.y - b.r);
    ctx.rotate(b.rot || 0);
    const r = b.r || 34;
    // 粪球主体
    ctx.fillStyle = '#8a4a16';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#a9611f';
    ctx.beginPath();
    ctx.arc(-r * 0.15, -r * 0.12, r * 0.82, 0, TAU);
    ctx.fill();
    // 螺旋
    ctx.strokeStyle = '#5e2f08';
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let a = 0; a < TAU * 1.6; a += 0.2) {
      const rr2 = r * (0.15 + a / (TAU * 1.6) * 0.75);
      const px = Math.cos(a) * rr2, py = Math.sin(a) * rr2;
      if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    // 高光
    ctx.fillStyle = 'rgba(230,170,100,0.45)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.35, -r * 0.4, r * 0.24, r * 0.16, -0.6, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,10,4,0.9)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.stroke();
    ctx.restore();
  };

  RA.drawGate = function (ctx, g, time) {
    const x = g.x, y = g.baseY || 600;
    const open = g.openT || 0;
    const hh = 170;
    ctx.save();
    // 门框
    ctx.fillStyle = '#1c2521';
    ctx.fillRect(x - 14, y - hh, 96, hh);
    ctx.strokeStyle = 'rgba(110,140,120,0.4)';
    ctx.lineWidth = 3;
    ctx.strokeRect(x - 14, y - hh, 96, 4);
    // 闸门（上滑开启）
    const shift = open * (hh - 20);
    ctx.translate(0, -shift);
    const grad = ctx.createLinearGradient(0, y - hh, 0, y);
    grad.addColorStop(0, '#4a3a30');
    grad.addColorStop(1, '#241d18');
    ctx.fillStyle = grad;
    ctx.fillRect(x - 6, y - hh + 6, 80, hh - 6);
    // 铁栏
    ctx.strokeStyle = 'rgba(16,20,18,0.9)';
    ctx.lineWidth = 7;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(x + 4 + i * 22, y - hh + 8);
      ctx.lineTo(x + 4 + i * 22, y);
      ctx.stroke();
    }
    // 痂皮封条
    ctx.fillStyle = 'rgba(170,64,48,0.55)';
    ctx.fillRect(x - 2, y - hh * 0.52, 74, 14);
    ctx.restore();
    // 开启提示
    if (!g.open && g.near) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      Art.roundRect(ctx, x - 4, y - hh - 48, 76, 28, 6);
      ctx.fill();
      ctx.fillStyle = '#ffe9a0';
      ctx.font = '900 16px ' + BVN.CFG.FONT;
      ctx.textAlign = 'center';
      ctx.fillText('E 离开', x + 34, y - hh - 30);
      ctx.textAlign = 'left';
    }
  };

  /* =================================================================
   *  3. 场景道具
   * ================================================================= */

  RA.drawProp = function (ctx, p, time) {
    const x = p.x, y = p.y;
    if (p.taken) return;
    const bob = Math.sin(time * 2 + (p.seed || 0)) * 4;
    ctx.save();
    ctx.translate(x, y + ((p.type === 'chest' || p.type === 'gambler') ? 0 : bob - 16));
    const item = BVN.ROGUE_DATA && BVN.ROGUE_DATA.ITEMS[p.type];
    if (item) {
      const color = item.color;
      // 光晕
      const gl = ctx.createRadialGradient(0, 0, 2, 0, 0, 34);
      gl.addColorStop(0, rgba(color, 0.35));
      gl.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = gl;
      ctx.beginPath();
      ctx.arc(0, 0, 34, 0, TAU);
      ctx.fill();
      if (p.type === 'bandage') {
        // 绷带卷
        ctx.fillStyle = '#f0e6d2';
        Art.roundRect(ctx, -15, -20, 30, 22, 8);
        ctx.fill();
        ctx.strokeStyle = 'rgba(80,70,50,0.8)';
        ctx.lineWidth = 2;
        Art.roundRect(ctx, -15, -20, 30, 22, 8);
        ctx.stroke();
        ctx.strokeStyle = '#c9b48a';
        ctx.beginPath();
        ctx.moveTo(-10, -14); ctx.lineTo(10, -14);
        ctx.moveTo(-8, -6); ctx.lineTo(8, -6);
        ctx.stroke();
      } else if (p.type === 'magnet') {
        // 马蹄磁石
        ctx.strokeStyle = color;
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.arc(0, -2, 13, Math.PI, TAU);
        ctx.stroke();
        ctx.fillStyle = '#e8e8f0';
        ctx.fillRect(-17, -2, 8, 12);
        ctx.fillRect(9, -2, 8, 12);
      } else if (p.type === 'ward') {
        // 护符玉牌
        ctx.fillStyle = color;
        Art.roundRect(ctx, -12, -18, 24, 30, 8);
        ctx.fill();
        ctx.strokeStyle = 'rgba(20,40,30,0.85)';
        ctx.lineWidth = 2;
        Art.roundRect(ctx, -12, -18, 24, 30, 8);
        ctx.stroke();
        ctx.strokeStyle = '#ffe9a0';
        ctx.beginPath();
        ctx.arc(0, -3, 6, 0, TAU);
        ctx.stroke();
      } else {
        // 瓶身
        ctx.fillStyle = rgba(color, 0.85);
        Art.roundRect(ctx, -9, -14, 18, 24, 6);
        ctx.fill();
        ctx.strokeStyle = 'rgba(10,20,16,0.85)';
        ctx.lineWidth = 2;
        Art.roundRect(ctx, -9, -14, 18, 24, 6);
        ctx.stroke();
        // 瓶塞
        ctx.fillStyle = '#d8c9a0';
        ctx.fillRect(-5, -24, 10, 10);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillRect(-6, -10, 4, 10);
      }
      if (p.type === 'incense') {
        ctx.strokeStyle = '#d8c9a0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -26);
        ctx.lineTo(0, -44);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,200,140,0.5)';
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(Math.sin(time * 1.4 + i) * 4, -46 - i * 8);
          ctx.lineTo(Math.sin(time * 1.4 + i + 1) * 7, -54 - i * 8);
          ctx.stroke();
        }
      }
    } else if (p.type === 'scrap') {
      ctx.fillStyle = '#d8b44a';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU;
        const r = (i % 2 === 0 ? 12 : 6);
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(70,42,6,0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,240,180,0.75)';
      ctx.beginPath();
      ctx.arc(-3, -3, 3, 0, TAU);
      ctx.fill();
    } else if (p.type === 'relic' && p.relic) {
      // 遗物掉落：金色光柱 + 遗物图标
      const gl3 = ctx.createRadialGradient(0, -8, 2, 0, -8, 42);
      gl3.addColorStop(0, 'rgba(255,209,102,0.45)');
      gl3.addColorStop(1, 'rgba(255,209,102,0)');
      ctx.fillStyle = gl3;
      ctx.beginPath(); ctx.arc(0, -8, 42, 0, TAU); ctx.fill();
      RA.drawRelicIcon(ctx, p.relic.icon, 0, -8, 34, '#ffd166');
      ctx.fillStyle = 'rgba(255,240,180,0.9)';
      ctx.font = '700 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('?', 0, -4);
    } else if (p.type === 'gambler') {
      // 情赌徒：紫发燕尾服，指间翻飞纸牌
      const gl2 = ctx.createRadialGradient(0, -60, 8, 0, -60, 110);
      gl2.addColorStop(0, 'rgba(160,110,230,0.28)');
      gl2.addColorStop(1, 'rgba(160,110,230,0)');
      ctx.fillStyle = gl2;
      ctx.beginPath();
      ctx.arc(0, -60, 110, 0, TAU);
      ctx.fill();
      RA.drawGambler(ctx, 0, 0, 0.92, time);
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(time * 3);
      ctx.fillStyle = '#e8c8ff';
      ctx.font = '900 15px ' + BVN.CFG.FONT;
      ctx.textAlign = 'center';
      ctx.fillText('赌', 0, -158);
      ctx.globalAlpha = 1;
    } else if (p.type === 'chest') {
      // 木箱
      ctx.fillStyle = '#3a2416';
      ctx.fillRect(-28, -40, 56, 40);
      const g2 = ctx.createLinearGradient(0, -40, 0, 0);
      g2.addColorStop(0, '#5c3a22');
      g2.addColorStop(1, '#2a1810');
      ctx.fillStyle = g2;
      ctx.fillRect(-26, -38, 52, 37);
      // 铁边
      ctx.fillStyle = '#20282a';
      ctx.fillRect(-28, -22, 56, 5);
      ctx.fillRect(-8, -40, 5, 40);
      // 痂皮锁
      ctx.fillStyle = 'rgba(180,72,54,0.8)';
      ctx.beginPath();
      ctx.arc(0, -22, 7, 0, TAU);
      ctx.fill();
      // 微光
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(time * 2.4);
      ctx.fillStyle = 'rgba(255,220,140,0.5)';
      ctx.beginPath();
      ctx.ellipse(0, -42, 26, 8, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // 交互提示
    if (p.near) {
      const py = y - (p.type === 'gambler' ? 190 : 96);
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      Art.roundRect(ctx, x - 22, py, 44, 24, 5);
      ctx.fill();
      ctx.fillStyle = '#ffe9a0';
      ctx.font = '900 14px ' + BVN.CFG.FONT;
      ctx.textAlign = 'center';
      ctx.fillText('E', x, py + 17);
      ctx.textAlign = 'left';
      if (p.type === 'gambler') {
        ctx.fillStyle = 'rgba(0,0,0,0.72)';
        Art.roundRect(ctx, x - 66, py - 26, 132, 20, 5);
        ctx.fill();
        ctx.fillStyle = '#e8c8ff';
        ctx.font = '800 12px ' + BVN.CFG.FONT;
        ctx.textAlign = 'center';
        ctx.fillText('情赌徒 · E / 点击', x, py - 12);
        ctx.textAlign = 'left';
      }
    }
  };

  /* ---- 情赌徒立绘（紫发燕尾服 + 纸牌，程序化绘制） ---- */
  RA.drawGambler = function (ctx, x, y, s, t) {
    const bob = Math.sin((t || 0) * 2.2) * 2;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.scale(s, s);
    // 阴影
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 26, 8, 0, 0, TAU);
    ctx.fill();
    // 裤腿
    ctx.fillStyle = '#2f2350';
    ctx.beginPath();
    ctx.moveTo(-15, -58); ctx.lineTo(-3, -58); ctx.lineTo(-5, -16); ctx.lineTo(-16, -16); ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(15, -58); ctx.lineTo(3, -58); ctx.lineTo(5, -16); ctx.lineTo(16, -16); ctx.closePath();
    ctx.fill();
    // 靴（金色鞋尖）
    ctx.fillStyle = '#120c1a';
    ctx.fillRect(-18, -18, 15, 18);
    ctx.fillRect(3, -18, 15, 18);
    ctx.fillStyle = '#e0b040';
    ctx.fillRect(-18, -4, 15, 4);
    ctx.fillRect(3, -4, 15, 4);
    // 燕尾
    ctx.fillStyle = '#241737';
    ctx.beginPath();
    ctx.moveTo(-18, -98); ctx.lineTo(-27, -32); ctx.lineTo(-8, -36); ctx.lineTo(-4, -98); ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(18, -98); ctx.lineTo(27, -32); ctx.lineTo(8, -36); ctx.lineTo(4, -98); ctx.closePath();
    ctx.fill();
    // 燕尾红色内衬
    ctx.fillStyle = 'rgba(192,58,82,0.65)';
    ctx.beginPath();
    ctx.moveTo(-18, -72); ctx.lineTo(-25, -38); ctx.lineTo(-12, -42); ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(18, -72); ctx.lineTo(25, -38); ctx.lineTo(12, -42); ctx.closePath();
    ctx.fill();
    // 外套
    ctx.fillStyle = '#2b1c45';
    ctx.beginPath();
    ctx.moveTo(-20, -102); ctx.lineTo(20, -102); ctx.lineTo(16, -56); ctx.lineTo(-16, -56); ctx.closePath();
    ctx.fill();
    // 翻领
    ctx.fillStyle = '#c03a52';
    ctx.beginPath();
    ctx.moveTo(-13, -102); ctx.lineTo(0, -76); ctx.lineTo(13, -102); ctx.closePath();
    ctx.fill();
    // 白衬衫
    ctx.fillStyle = '#f2ecec';
    ctx.beginPath();
    ctx.moveTo(-7, -101); ctx.lineTo(7, -101); ctx.lineTo(0, -77); ctx.closePath();
    ctx.fill();
    // 红马甲
    ctx.fillStyle = '#7d1f3a';
    ctx.fillRect(-10, -80, 20, 22);
    // 金扣
    ctx.fillStyle = '#e0b040';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(0, -74 + i * 7, 1.6, 0, TAU);
      ctx.fill();
    }
    // 领结
    ctx.fillStyle = '#d63b4f';
    ctx.beginPath();
    ctx.moveTo(0, -97); ctx.lineTo(-9, -101); ctx.lineTo(-9, -93); ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -97); ctx.lineTo(9, -101); ctx.lineTo(9, -93); ctx.closePath();
    ctx.fill();
    // 手臂
    ctx.strokeStyle = '#2b1c45';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-18, -96); ctx.lineTo(-26, -70);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(18, -96); ctx.lineTo(32, -80);
    ctx.stroke();
    // 手套
    ctx.fillStyle = '#efe4ea';
    ctx.beginPath();
    ctx.arc(-26, -68, 5, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(33, -79, 5, 0, TAU);
    ctx.fill();
    // 手中纸牌
    ctx.save();
    ctx.translate(39, -88);
    ctx.rotate(-0.35);
    ctx.fillStyle = '#f6f1e4';
    ctx.fillRect(-7, -10, 14, 19);
    ctx.strokeStyle = '#c03a52';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(-7, -10, 14, 19);
    ctx.fillStyle = '#c03a52';
    ctx.beginPath();
    ctx.moveTo(0, -5); ctx.lineTo(-4, 1); ctx.lineTo(0, 5); ctx.lineTo(4, 1); ctx.closePath();
    ctx.fill();
    ctx.restore();
    // 头
    ctx.fillStyle = '#e9c8b0';
    ctx.beginPath();
    ctx.ellipse(0, -120, 11, 13, 0, 0, TAU);
    ctx.fill();
    // 紫发
    ctx.fillStyle = '#7b4fd8';
    ctx.beginPath();
    ctx.ellipse(0, -128, 13, 9, 0, Math.PI, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-13, -126); ctx.quadraticCurveTo(-20, -104, -14, -92); ctx.lineTo(-8, -96);
    ctx.quadraticCurveTo(-12, -110, -8, -124); ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(13, -126); ctx.quadraticCurveTo(20, -104, 14, -92); ctx.lineTo(8, -96);
    ctx.quadraticCurveTo(12, -110, 8, -124); ctx.closePath();
    ctx.fill();
    // 刘海
    ctx.fillStyle = '#9a74ee';
    ctx.beginPath();
    ctx.moveTo(-12, -130); ctx.lineTo(12, -130); ctx.lineTo(4, -116); ctx.lineTo(-6, -118); ctx.closePath();
    ctx.fill();
    // 眼
    ctx.fillStyle = '#2a1a3a';
    ctx.beginPath();
    ctx.arc(-5, -117, 1.7, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(5, -117, 1.7, 0, TAU);
    ctx.fill();
    ctx.restore();
  };

  /* ---- 立绘贴图（assets/rogue/*.png，抠底后的手绘怪物）----
     加载失败或尚未解码时自动退回程序化绘制，保证 file:// 与单文件版都能跑。 */
  RA.SPRITES = {};
  RA.SPRITE_SIZE = {
    fartling:  { w: 116, h: 76 },
    poopling:  { w: 68, h: 64 },
    gasfish:   { w: 99, h: 92 },
    centipede: { w: 143, h: 48 },
    urinewisp: { w: 91, h: 68 },
    jellyfish: { w: 102, h: 80 },
    troll:     { w: 202, h: 210 },
  };

  RA.loadSprites = function () {
    if (typeof Image === 'undefined') return;
    const base = 'assets/rogue/';
    const inlined = BVN.ROGUE_SPRITE_DATA || {};
    for (const id in RA.SPRITE_SIZE) {
      const im = new Image();
      im.src = inlined[id] || (base + id + '.png');
      RA.SPRITES[id] = im;
    }
  };
  RA.loadSprites();

  function spriteReady(id) {
    const im = RA.SPRITES[id];
    return !!(im && im.complete && im.naturalWidth > 0);
  }

  /* 在 drawMonster 已经 translate + scale(m.facing) 过的坐标系里绘制（原点=脚底） */
  RA.drawSprite = function (ctx, m, time, flash) {
    const S = RA.SPRITE_SIZE[m.type];
    const im = RA.SPRITES[m.type];
    const w = S.w, h = S.h;
    const fly = m.def.kind === 'fly';
    const bob = fly ? Math.sin(time * 2.1 + (m.seed || 0)) * 4 : 0;
    const walk = m.vx || 0;
    const step = fly ? 0 : Math.sin(time * 9 + (m.seed || 0)) * Math.min(3, Math.abs(walk) * 0.02);
    const attackLean = (m.state === 'charge' || m.state === 'claw' || m.state === 'lunge') ? 0.1 : 0;

    ctx.save();
    ctx.translate(0, bob + step);
    if (attackLean) ctx.rotate(attackLean);
    ctx.filter = flash ? 'brightness(2.4) saturate(0.3)' : 'none';
    try {
      ctx.drawImage(im, -w / 2, -h, w, h);
    } catch (e) { /* 解码失败时保持空白，下一帧会退回程序化 */ }
    ctx.filter = 'none';
    ctx.restore();

    // BOSS 阶段氛围：越到后期红光越强
    if (m.def.kind === 'boss') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const pulse = 0.16 + Math.sin(time * 3) * 0.06 + (m.phase === 3 ? 0.16 : m.phase === 2 ? 0.08 : 0);
      const g = ctx.createRadialGradient(0, -h * 0.5, 10, 0, -h * 0.5, h * 0.72);
      g.addColorStop(0, 'rgba(220,70,50,' + pulse.toFixed(3) + ')');
      g.addColorStop(1, 'rgba(120,20,14,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, -h * 0.5, h * 0.72, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  };

  /* =================================================================
   *  4. 怪物绘制
   * ================================================================= */

  RA.drawMonster = function (ctx, m, time) {
    const flash = (m.hurt || 0) > 0;
    const C = m.def.colors;
    const sc = m.drawScale || 1;
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.scale(m.facing * sc, sc);

    // 地面接触阴影（飞行迷你 BOSS 不画）
    if (!(m.def.kind === 'fly' || m.def.fly)) {
      ctx.fillStyle = 'rgba(0,0,0,0.38)';
      ctx.beginPath();
      ctx.ellipse(0, 2, (m.def.w || 60) * 0.52, 8, 0, 0, TAU);
      ctx.fill();
    }

    const fn = MONSTER_DRAW[m.type] || MONSTER_DRAW.fartling;
    // 场景可破坏物（水母触须）与终局合体 BOSS 使用专属绘制，不走 RIG 骨架
    const useRig = BVN.ROGUE_RIG && BVN.ROGUE_RIG.draw && m.def.kind !== 'miniboss' &&
      m.def.kind !== 'prop' && m.type !== 'killerCroc';
    if (useRig) BVN.ROGUE_RIG.draw(ctx, m, C, time, flash);
    else if (spriteReady(m.type)) RA.drawSprite(ctx, m, time, flash);
    else fn(ctx, m, C, time, flash);
    ctx.restore();

    // 冰缓：冰蓝覆盖 + 霜粒
    if ((m.chillT || 0) > 0) {
      ctx.save();
      ctx.globalAlpha = 0.26;
      ctx.fillStyle = '#8ad8ff';
      ctx.beginPath();
      ctx.ellipse(m.x, m.y - (m.h || 60) * 0.5, (m.w || 60) * 0.62, (m.h || 60) * 0.62, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#e4f8ff';
      for (let i = 0; i < 6; i++) {
        const a = time * 1.4 + i * 1.05;
        const px = m.x + Math.cos(a) * (m.w || 60) * 0.45;
        const py = m.y - (m.h || 60) * 0.3 - Math.sin(a) * 16;
        ctx.fillRect(px, py, 2, 7);
      }
      ctx.restore();
    }
    // 束缚：地面锁链 / 藤蔓
    if ((m.rootT || 0) > 0) {
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = '#b8a0ff';
      ctx.lineWidth = 3;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.arc(m.x + i * 10, m.y - 2, 16, Math.PI, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#b8a0ff';
      ctx.beginPath();
      ctx.ellipse(m.x, m.y, (m.w || 60) * 0.45, 10, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // 血条（非 BOSS；迷你 BOSS 用更宽的血条）
    if (m.def.kind !== 'boss' && m.hp < m.hpMax) {
      const eliteW = 52 * (m.drawScale || 1);
      const w2 = m.def.kind === 'miniboss' ? Math.min(360, m.w * 0.9) : eliteW;
      const x2 = m.x - w2 / 2;
      const y2 = m.y - (m.h || 60) - 18 - (m.def.kind === 'miniboss' ? 20 : 0) - (m.def.kind === 'fly' ? 40 : 0);
      ctx.fillStyle = 'rgba(0,0,0,0.62)';
      ctx.fillRect(x2 - 2, y2 - 2, w2 + 4, 8);
      ctx.fillStyle = m.def.kind === 'miniboss' ? '#ff5f52' : (m.elite ? '#ff5f52' : '#ff6b4a');
      ctx.fillRect(x2, y2, w2 * clamp(m.hp / m.hpMax, 0, 1), 4);
    }
  };

  const MONSTER_DRAW = {};

  /* ---- 屁怪 ---- */
  MONSTER_DRAW.fartling = function (ctx, m, C, time, flash) {
    const wob = Math.sin(time * 2.2 + (m.seed || 0)) * 0.04;
    const lunge = m.state === 'puff' ? 1 : 0;
    const body = flash ? '#ffffff' : C.body;
    const dark = flash ? '#f2f2f2' : C.dark;
    const belly = flash ? '#ffffff' : C.belly;

    // 背后的沼气
    if (m.gasT > 0) {
      ctx.globalAlpha = 0.5;
      for (let i = 0; i < 6; i++) {
        const px = -30 - i * 16 - Math.sin(time * 3 + i) * 8;
        const py = -52 + Math.cos(time * 2 + i * 1.7) * 14;
        ctx.fillStyle = i % 2 ? 'rgba(150,220,150,0.5)' : 'rgba(110,190,120,0.45)';
        ctx.beginPath();
        ctx.arc(px, py, 14 + i * 3, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    ctx.save();
    ctx.scale(1 + wob, 1 - wob);
    // 腿
    ctx.fillStyle = dark;
    Art.roundRect(ctx, -26, -22, 20, 22, 6); ctx.fill();
    Art.roundRect(ctx, 8, -22, 20, 22, 6); ctx.fill();
    ctx.fillStyle = flash ? '#fff' : C.horn;
    ctx.beginPath(); ctx.ellipse(-18, -4, 13, 8, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(18, -4, 13, 8, 0, 0, TAU); ctx.fill();

    // 大肚
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(lunge * 3, -52, 44, 40, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 4;
    ctx.stroke();
    // 肚皮
    ctx.fillStyle = belly;
    ctx.beginPath();
    ctx.ellipse(lunge * 5, -44, 34, 30, 0, 0, TAU);
    ctx.fill();
    // 脓包
    ctx.fillStyle = flash ? '#fff' : C.dark;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(-26 + i * 17, -56 + (i % 2) * 14, 4.5, 0, TAU);
      ctx.fill();
    }

    // 头
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(4, -94, 26, 22, 0.1, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 4;
    ctx.stroke();
    // 角
    ctx.fillStyle = flash ? '#fff' : C.horn;
    ctx.beginPath();
    ctx.moveTo(-14, -110);
    ctx.lineTo(-26, -132);
    ctx.lineTo(-4, -116);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(18, -110);
    ctx.lineTo(28, -132);
    ctx.lineTo(8, -116);
    ctx.closePath();
    ctx.fill();
    // 眼睛
    ctx.fillStyle = C.eye;
    ctx.beginPath(); ctx.arc(12, -98, 5.2, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1a0a08';
    ctx.beginPath(); ctx.arc(13.5, -98, 2.2, 0, TAU); ctx.fill();
    // 怒眉
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(4, -106); ctx.lineTo(20, -102); ctx.stroke();
    // 大嘴
    ctx.fillStyle = '#20100c';
    ctx.beginPath();
    ctx.ellipse(lunge * 9 + 10, -86, 13 + lunge * 3, 7 + lunge * 5, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#f2ecd8';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(2 + i * 7 + lunge * 9, -91);
      ctx.lineTo(5 + i * 7 + lunge * 9, -85);
      ctx.lineTo(8 + i * 7 + lunge * 9, -91);
      ctx.closePath();
      ctx.fill();
    }

    // 手臂
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(40, -50, 13, 9, -0.5, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.arc(50, -44, 7, 0, TAU);
    ctx.fill();
    ctx.restore();

    // 喷气
    if (m.state === 'puff') {
      const k = m.timer / (m.def.atk || 40);
      if (k > 0.4) {
        ctx.globalAlpha = 0.55;
        for (let i = 0; i < 7; i++) {
          const a = Math.random() * TAU;
          ctx.fillStyle = 'rgba(160,230,150,0.45)';
          ctx.beginPath();
          ctx.arc(40 + Math.cos(a) * 22 * (1 - k + 0.4), -70 + Math.sin(a) * 18, 10 + i, 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }
  };

  /* ---- 粪精 ---- */
  MONSTER_DRAW.poopling = function (ctx, m, C, time, flash) {
    const squash = m.state === 'jump' ? 0.85 : 1;
    const body = flash ? '#fff' : C.body;
    ctx.save();
    ctx.translate(0, 0);
    // 小短腿
    ctx.fillStyle = flash ? '#fff' : C.dark;
    Art.roundRect(ctx, -18, -10, 12, 10, 4); ctx.fill();
    Art.roundRect(ctx, 7, -10, 12, 10, 4); ctx.fill();
    // 三层粪堆
    const layers = [
      { rx: 30, ry: 17, y: -22 },
      { rx: 24, ry: 15, y: -42 },
      { rx: 17, ry: 12, y: -60 },
    ];
    ctx.scale(1 / squash, squash);
    for (let i = 0; i < layers.length; i++) {
      const L = layers[i];
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.ellipse(0, L.y, L.rx, L.ry, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 3.5;
      ctx.stroke();
      // 亮面
      ctx.fillStyle = flash ? '#fff' : C.light;
      ctx.beginPath();
      ctx.ellipse(-L.rx * 0.28, L.y - L.ry * 0.28, L.rx * 0.55, L.ry * 0.4, -0.3, 0, TAU);
      ctx.fill();
    }
    // 顶端旋尖
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-8, -66);
    ctx.quadraticCurveTo(-2, -92, 12, -86);
    ctx.quadraticCurveTo(2, -80, 4, -64);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // 怒眼
    const ex = 4;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(-8 + ex, -50, 8, 6, -0.1, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(8 + ex, -50, 8, 6, 0.1, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1a0f08';
    ctx.beginPath(); ctx.arc(-6 + ex, -49, 2.6, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(10 + ex, -49, 2.6, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#1a0f08';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-14 + ex, -58); ctx.lineTo(-2 + ex, -55); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(16 + ex, -58); ctx.lineTo(4 + ex, -55); ctx.stroke();
    // 咬牙
    ctx.fillStyle = '#1a0f08';
    Art.roundRect(ctx, -8 + ex, -36, 16, 8, 4); ctx.fill();
    ctx.fillStyle = '#f4efdc';
    ctx.fillRect(-6 + ex, -35, 3, 4);
    ctx.fillRect(0 + ex, -35, 3, 4);
    ctx.fillRect(5 + ex, -35, 3, 4);
    // 小拳头
    ctx.fillStyle = flash ? '#fff' : C.dark;
    ctx.beginPath(); ctx.arc(-26, -32, 8, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(28, -32, 8, 0, TAU); ctx.fill();
    ctx.restore();
  };

  /* ---- 沼气鱼人 ---- */
  MONSTER_DRAW.gasfish = function (ctx, m, C, time, flash) {
    const open = m.state === 'charge' ? 1 : (m.state === 'shoot' ? 0.85 : 0.25);
    const bob = Math.sin(time * 2 + (m.seed || 0)) * 3;
    const body = flash ? '#fff' : C.body;
    ctx.translate(0, bob);
    // 背鳍
    ctx.fillStyle = flash ? '#fff' : C.fin;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-24 + i * 15, -78);
      ctx.lineTo(-16 + i * 15, -103 - i);
      ctx.lineTo(-6 + i * 15, -78);
      ctx.closePath();
      ctx.fill();
    }
    // 鱼身
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, -48, 40, 34, 0.06, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 4;
    ctx.stroke();
    // 肚皮
    ctx.fillStyle = flash ? '#fff' : C.belly;
    ctx.beginPath();
    ctx.ellipse(4, -36, 29, 20, 0.06, 0, TAU);
    ctx.fill();
    // 尾鳍
    ctx.fillStyle = flash ? '#fff' : C.fin;
    ctx.beginPath();
    ctx.moveTo(-38, -48);
    ctx.lineTo(-62, -66);
    ctx.lineTo(-56, -44);
    ctx.lineTo(-64, -28);
    ctx.closePath();
    ctx.fill();
    // 胸鳍
    ctx.beginPath();
    ctx.ellipse(14, -40, 14, 7, 0.7, 0, TAU);
    ctx.fill();
    // 头部 & 大嘴
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(32, -66, 24, 20, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 4;
    ctx.stroke();
    // 口腔
    const jaw = 12 + open * 22;
    ctx.fillStyle = '#1a0d0d';
    ctx.beginPath();
    ctx.moveTo(40, -72);
    ctx.lineTo(62, -66 - open * 8);
    ctx.lineTo(58, -58 + jaw);
    ctx.lineTo(34, -52 + open * 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#d94a44';
    ctx.beginPath();
    ctx.ellipse(48, -62 + open * 14, 10, 6 + open * 4, 0.1, 0, TAU);
    ctx.fill();
    // 牙
    ctx.fillStyle = '#f4efdc';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(40 + i * 6, -69 - open * 3);
      ctx.lineTo(43 + i * 6, -62 + open * 9);
      ctx.lineTo(46 + i * 6, -69 - open * 3);
      ctx.closePath();
      ctx.fill();
    }
    // 眼睛
    ctx.fillStyle = C.eye;
    ctx.beginPath(); ctx.arc(36, -80, 9, 0, TAU); ctx.fill();
    ctx.fillStyle = '#141008';
    ctx.beginPath(); ctx.arc(38, -80, 4.2, 0, TAU); ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(24, -90); ctx.lineTo(44, -86); ctx.stroke();
    // 手臂
    ctx.fillStyle = flash ? '#fff' : C.dark;
    ctx.beginPath();
    ctx.ellipse(10, -28, 8, 18, 0.4, 0, TAU);
    ctx.fill();
    // 吸气蓄力
    if (m.state === 'charge') {
      const k = 1 - m.timer / (m.def.windup || 50);
      ctx.globalAlpha = 0.4 + k * 0.4;
      for (let i = 0; i < 5; i++) {
        const a = time * 3 + i;
        ctx.fillStyle = 'rgba(160,235,150,0.6)';
        ctx.beginPath();
        ctx.arc(62 - k * 20 + Math.cos(a) * 10, -64 + Math.sin(a) * 10, 4 + k * 9, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  };

  /* ---- 大粪蜈蚣 ---- */
  MONSTER_DRAW.centipede = function (ctx, m, C, time, flash) {
    const n = 7;
    const wig = Math.sin(time * 6 + (m.seed || 0)) * 0.08;
    const lethal = m.state === 'bite';
    // 身体从后往前画
    for (let i = n - 1; i >= 0; i--) {
      const bx = -i * 20;
      const by = -18 - Math.abs(Math.sin(time * 4 + i * 0.5)) * 3 + i * 1.2;
      const r = 15 - i * 0.7;
      // 腿
      ctx.strokeStyle = flash ? '#fff' : C.dark;
      ctx.lineWidth = 4;
      for (let s = -1; s <= 1; s += 2) {
        ctx.beginPath();
        ctx.moveTo(bx, by + 4);
        ctx.lineTo(bx + s * 13 + Math.sin(time * 10 + i + s) * 4, by + 20);
        ctx.stroke();
      }
      ctx.fillStyle = flash ? '#fff' : (i === 0 ? C.dark : C.body);
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 3.5;
      ctx.stroke();
      // 节间高光
      ctx.fillStyle = flash ? '#fff' : C.light;
      ctx.beginPath();
      ctx.ellipse(bx - 2, by - 6, r * 0.6, r * 0.34, -0.25, 0, TAU);
      ctx.fill();
    }
    // 头部
    const hx = 16 + (lethal ? 12 : 0);
    const hy = -34 + (lethal ? -12 : 0);
    ctx.fillStyle = flash ? '#fff' : C.body;
    ctx.beginPath();
    ctx.ellipse(hx, hy, 26, 22, -0.15, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 4;
    ctx.stroke();
    // 头上的粪旋
    ctx.fillStyle = flash ? '#fff' : C.light;
    ctx.beginPath();
    ctx.moveTo(hx - 8, hy - 18);
    ctx.quadraticCurveTo(hx + 2, hy - 44, hx + 18, hy - 36);
    ctx.quadraticCurveTo(hx + 6, hy - 28, hx + 10, hy - 16);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 3;
    ctx.stroke();
    // 触角
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(hx + 10, hy - 18); ctx.lineTo(hx + 26, hy - 42); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hx - 4, hy - 20); ctx.lineTo(hx + 6, hy - 46); ctx.stroke();
    // 眼
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(hx + 10, hy - 6, 7.5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(hx - 4, hy - 8, 6, 0, TAU); ctx.fill();
    ctx.fillStyle = '#160c06';
    ctx.beginPath(); ctx.arc(hx + 12, hy - 5, 3, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(hx - 3, hy - 7, 2.6, 0, TAU); ctx.fill();
    // 上颚
    ctx.fillStyle = '#f4efdc';
    ctx.beginPath(); ctx.moveTo(hx + 18, hy + 4); ctx.lineTo(hx + 34, hy + 12); ctx.lineTo(hx + 16, hy + 16); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(hx + 8, hy + 10); ctx.lineTo(hx + 22, hy + 22); ctx.lineTo(hx + 4, hy + 20); ctx.closePath(); ctx.fill();
    // 壳纹
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(-i * 20 - 6, -26);
      ctx.lineTo(-i * 20 + 6, -14);
      ctx.stroke();
    }
    // 尾巴
    ctx.fillStyle = flash ? '#fff' : C.dark;
    ctx.beginPath();
    ctx.moveTo(-n * 20 + 4, -20);
    ctx.quadraticCurveTo(-n * 20 - 22, -26 + wig * 20, -n * 20 - 34, -10);
    ctx.quadraticCurveTo(-n * 20 - 16, -14, -n * 20 + 2, -10);
    ctx.closePath();
    ctx.fill();
  };

  /* ---- 尿灵 ---- */
  MONSTER_DRAW.urinewisp = function (ctx, m, C, time, flash) {
    const bob = Math.sin(time * 3 + (m.seed || 0)) * 6;
    const wob = time * 2;
    ctx.translate(0, bob);
    // 液滴轮廓
    ctx.beginPath();
    const pts = 26;
    for (let i = 0; i <= pts; i++) {
      const a = i / pts * TAU;
      const r = 30 * (1 + Math.sin(a * 3 + wob) * 0.06 + Math.sin(a * 5 - wob * 1.4) * 0.04);
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r * 1.06 - 44;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = flash ? '#fff' : C.body;
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 3.5;
    ctx.stroke();
    // 高光
    ctx.fillStyle = flash ? '#fff' : C.light;
    ctx.beginPath();
    ctx.ellipse(-11, -62, 12, 8, -0.5, 0, TAU);
    ctx.fill();
    // 气泡
    ctx.strokeStyle = flash ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 3; i++) {
      const a = time * 1.2 + i * 2.1;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 15, -44 + Math.sin(a) * 12, 2 + i, 0, TAU);
      ctx.stroke();
    }
    // 怒眼
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(-10, -48, 10, 7, -0.3, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(12, -48, 10, 7, 0.3, 0, TAU); ctx.fill();
    ctx.fillStyle = C.eye;
    ctx.beginPath(); ctx.arc(-8, -47, 3.6, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(14, -47, 3.6, 0, TAU); ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-20, -58); ctx.lineTo(-4, -54); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(22, -58); ctx.lineTo(6, -54); ctx.stroke();
    // 触手手
    ctx.fillStyle = flash ? '#fff' : C.body;
    for (let i = 0; i < 2; i++) {
      const sgn = i ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(sgn * 26, -38);
      ctx.quadraticCurveTo(sgn * 56, -32 + Math.sin(time * 4 + i) * 8, sgn * 50, -8);
      ctx.quadraticCurveTo(sgn * 44, -26, sgn * 22, -26);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    // 滴落
    ctx.fillStyle = flash ? '#fff' : C.body;
    const dy = (time * 40) % 30;
    ctx.beginPath();
    ctx.ellipse(8, -20 + dy, 5, 8, 0, 0, TAU);
    ctx.fill();
  };

  /* ---- 污垢水母 ---- */
  MONSTER_DRAW.jellyfish = function (ctx, m, C, time, flash) {
    const bob = Math.sin(time * 1.8 + (m.seed || 0)) * 8;
    ctx.translate(0, bob);
    // 触手
    ctx.strokeStyle = flash ? 'rgba(255,255,255,0.8)' : C.dark;
    ctx.lineWidth = 5;
    for (let i = 0; i < 6; i++) {
      const x0 = -22 + i * 9;
      ctx.beginPath();
      ctx.moveTo(x0, -54);
      for (let s = 1; s <= 4; s++) {
        const px = x0 + Math.sin(time * 2.4 + i * 1.2 + s * 0.6) * 10;
        const py = -54 + s * 22;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.fillStyle = flash ? '#fff' : C.dark;
      ctx.beginPath();
      ctx.arc(x0 + Math.sin(time * 2.4 + i * 1.2 + 2.4) * 10, 34, 3, 0, TAU);
      ctx.fill();
    }
    // 伞盖（半透明）
    ctx.save();
    ctx.globalAlpha = 0.92;
    const g = ctx.createLinearGradient(0, -100, 0, -44);
    g.addColorStop(0, flash ? '#fff' : C.light);
    g.addColorStop(1, flash ? '#eee' : C.body);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-40, -56);
    ctx.quadraticCurveTo(-42, -104, 0, -104);
    ctx.quadraticCurveTo(42, -104, 40, -56);
    ctx.quadraticCurveTo(20, -44, 0, -46);
    ctx.quadraticCurveTo(-20, -44, -40, -56);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.restore();
    // 内部斑点
    ctx.fillStyle = flash ? '#fff' : rgba(C.dark, 0.35);
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(-24 + i * 15, -82 + (i % 2) * 10, 3.4, 0, TAU);
      ctx.fill();
    }
    // 发光核心（弱点）
    const pulse = 1 + Math.sin(time * 3) * 0.12;
    const gl = ctx.createRadialGradient(4, -76, 2, 4, -76, 26 * pulse);
    gl.addColorStop(0, '#ffffff');
    gl.addColorStop(0.35, C.core);
    gl.addColorStop(1, rgba(C.core, 0));
    ctx.fillStyle = gl;
    ctx.beginPath();
    ctx.arc(4, -76, 26 * pulse, 0, TAU);
    ctx.fill();
    ctx.fillStyle = flash ? '#fff' : C.core;
    ctx.beginPath();
    ctx.arc(4, -76, 7 * pulse, 0, TAU);
    ctx.fill();
  };

  /* ---- 痂香巨魔（BOSS） ---- */
  MONSTER_DRAW.troll = function (ctx, m, C, time, flash) {
    const ph = m.phase || 1;
    const breathe = 1 + Math.sin(time * 1.1) * 0.02;
    const atk = m.state === 'claw' || m.state === 'slam';
    const chargeT = m.state === 'charge' ? 1 : 0;
    const stagger = m.state === 'stagger';
    // 狂暴光环
    if (ph >= 2) {
      const aura = ctx.createRadialGradient(0, -100, 30, 0, -100, 150);
      aura.addColorStop(0, ph === 3 ? 'rgba(255,60,40,0.22)' : 'rgba(200,60,40,0.12)');
      aura.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(0, -100, 150, 0, TAU);
      ctx.fill();
    }
    ctx.save();
    if (stagger) ctx.rotate(0.12);
    ctx.scale(breathe, 2 - breathe);
    const body = flash ? '#fff' : C.body;
    const dark = flash ? '#f2f2f2' : C.dark;
    const light = flash ? '#fff' : C.light;
    const scab = flash ? '#fff' : C.scab;

    // 腿
    ctx.fillStyle = dark;
    Art.roundRect(ctx, -46, -66, 34, 66, 12); ctx.fill();
    Art.roundRect(ctx, 10, -66, 34, 66, 12); ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 4;
    Art.roundRect(ctx, -46, -66, 34, 66, 12); ctx.stroke();
    Art.roundRect(ctx, 10, -66, 34, 66, 12); ctx.stroke();
    // 大脚爪
    ctx.fillStyle = scab;
    for (let s = -1; s <= 1; s += 2) {
      const bx = s > 0 ? 30 : -40;
      ctx.beginPath();
      ctx.ellipse(bx, -6, 26, 12, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 3;
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = flash ? '#fff' : C.spike;
        ctx.beginPath();
        ctx.moveTo(bx - 14 + i * 12, -2);
        ctx.lineTo(bx - 8 + i * 12, 8);
        ctx.lineTo(bx - 2 + i * 12, -2);
        ctx.closePath();
        ctx.fill();
      }
    }

    // 后臂（左）
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.ellipse(-64, -128, 24, 44, 0.5, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 4;
    ctx.stroke();
    // 后爪
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.ellipse(-72, -84, 20, 16, 0.2, 0, TAU);
    ctx.fill();
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = flash ? '#fff' : C.spike;
      ctx.beginPath();
      ctx.moveTo(-90 + i * 12, -76);
      ctx.lineTo(-82 + i * 12, -58);
      ctx.lineTo(-74 + i * 12, -76);
      ctx.closePath();
      ctx.fill();
    }

    // 躯干（驼背肌肉）
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-46, -58);
    ctx.quadraticCurveTo(-62, -140, -30, -172);
    ctx.quadraticCurveTo(0, -190, 32, -168);
    ctx.quadraticCurveTo(62, -140, 44, -58);
    ctx.quadraticCurveTo(0, -40, -46, -58);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 4.5;
    ctx.stroke();
    // 腹肌
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.ellipse(0, -104, 32, 44, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rgba(C.dark, 0.7);
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-24, -128 + i * 15);
      ctx.quadraticCurveTo(0, -122 + i * 15, 24, -128 + i * 15);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -132 + i * 15);
      ctx.lineTo(0, -112 + i * 15);
      ctx.stroke();
    }
    // 胸口的痂痂块
    ctx.fillStyle = scab;
    ctx.beginPath();
    ctx.ellipse(18, -152, 20, 14, 0.4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = rgba(C.dark, 0.55);
    ctx.beginPath();
    ctx.arc(24, -156, 5, 0, TAU);
    ctx.fill();

    // 肩甲尖刺
    for (let s = -1; s <= 1; s += 2) {
      const sx = s * 46;
      ctx.fillStyle = scab;
      ctx.beginPath();
      ctx.ellipse(sx, -166, 30, 26, s * 0.2, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 4;
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = flash ? '#fff' : C.spike;
        const ang = -0.7 + i * 0.55;
        ctx.beginPath();
        ctx.moveTo(sx + Math.cos(ang) * 18, -166 + Math.sin(ang) * 18);
        ctx.lineTo(sx + Math.cos(ang) * 52, -166 + Math.sin(ang) * 42);
        ctx.lineTo(sx + Math.cos(ang + 0.34) * 18, -166 + Math.sin(ang + 0.34) * 18);
        ctx.closePath();
        ctx.fill();
      }
    }

    // 头
    const headY = -196 + (atk ? 4 : 0);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(6, headY, 34, 30, 0.08, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 4;
    ctx.stroke();
    // 头顶痂角
    ctx.fillStyle = scab;
    ctx.beginPath();
    ctx.moveTo(-12, headY - 24);
    ctx.lineTo(-2, headY - 52);
    ctx.lineTo(10, headY - 26);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(16, headY - 24);
    ctx.lineTo(32, headY - 46);
    ctx.lineTo(30, headY - 18);
    ctx.closePath();
    ctx.fill();
    // 眼
    ctx.fillStyle = C.eye;
    ctx.beginPath(); ctx.ellipse(-8, headY - 4, 9, 6, -0.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(20, headY - 3, 8, 5.5, 0.2, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2a0b06';
    ctx.beginPath(); ctx.arc(-6, headY - 4, 3.4, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(22, headY - 3, 3, 0, TAU); ctx.fill();
    // 咆哮大嘴
    const mouthOpen = atk ? 1 : (m.state === 'roar' ? 1 : 0.25);
    ctx.fillStyle = '#1c0705';
    ctx.beginPath();
    ctx.ellipse(10, headY + 18, 18, 6 + mouthOpen * 12, 0.05, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#f4e6cc';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-4 + i * 9, headY + 14 - mouthOpen * 4);
      ctx.lineTo(0 + i * 9, headY + 22 + mouthOpen * 8);
      ctx.lineTo(4 + i * 9, headY + 14 - mouthOpen * 4);
      ctx.closePath();
      ctx.fill();
    }

    // 前臂（右）——攻击时抬爪
    ctx.save();
    if (atk || chargeT) ctx.rotate(-0.35);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(58, -118, 26, 46, -0.4, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 4;
    ctx.stroke();
    // 前爪
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.ellipse(72, -78, 24, 18, 0.15, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 3.5;
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = flash ? '#fff' : C.spike;
      ctx.beginPath();
      ctx.moveTo(56 + i * 12, -70);
      ctx.lineTo(62 + i * 12, -46);
      ctx.lineTo(68 + i * 12, -70);
      ctx.closePath();
      ctx.fill();
    }
    // 腕部痂皮
    ctx.fillStyle = rgba(scab, 0.85);
    ctx.beginPath();
    ctx.ellipse(60, -104, 17, 10, 0.4, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.restore();

    // 冲锋残影
    if (chargeT) {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = C.light;
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.ellipse(-i * 34 * m.facing, -100, 44, 86, 0, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  };

  /* =================================================================
   *  4b. 关底迷你 BOSS（五种专属外形）
   * ================================================================= */

  /* ---- 百足蜈蚣 ---- */
  MONSTER_DRAW.centipedeKing = function (ctx, m, C, time, flash) {
    const wig = Math.sin(time * 5 + (m.seed || 0));
    const n = 7;
    const body = flash ? '#fff' : C.body;
    const dark = flash ? '#f2f2f2' : C.dark;
    const light = flash ? '#fff' : C.light;
    for (let i = n - 1; i >= 0; i--) {
      const bx = -i * 38;
      const by = -50 - Math.abs(Math.sin(time * 4 + i * 0.55)) * 6 + i * 1.6;
      const r = 28 - i * 1.8;
      // 足（每节两对）
      ctx.strokeStyle = dark;
      ctx.lineWidth = 6;
      for (let s = -1; s <= 1; s += 2) {
        for (let k = 0; k < 2; k++) {
          ctx.beginPath();
          ctx.moveTo(bx, by + 8 + k * 10);
          ctx.lineTo(bx + s * (30 + k * 4) + wig * 6, by + 34 + k * 10);
          ctx.stroke();
        }
      }
      ctx.fillStyle = i === 0 ? dark : body;
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.ellipse(bx - 4, by - 11, r * 0.62, r * 0.34, -0.25, 0, TAU);
      ctx.fill();
    }
    // 头壳
    const hx = 26 + (m.state === 'charge' ? 18 : 0);
    const hy = -82 + (m.state === 'charge' ? -12 : 0);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(hx, hy, 52, 42, -0.12, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 6;
    ctx.stroke();
    // 甲壳纹
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(hx - 40 + i * 22, hy - 34);
      ctx.quadraticCurveTo(hx - 32 + i * 22, hy - 8, hx - 40 + i * 22, hy + 18);
      ctx.stroke();
    }
    // 大颚
    ctx.fillStyle = '#f4efdc';
    ctx.beginPath(); ctx.moveTo(hx + 34, hy + 2); ctx.lineTo(hx + 82, hy + 14); ctx.lineTo(hx + 36, hy + 24); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(hx + 26, hy + 18); ctx.lineTo(hx + 66, hy + 40); ctx.lineTo(hx + 20, hy + 32); ctx.closePath(); ctx.fill();
    // 三只眼
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(hx + 8 + i * 16, hy - 16 + i * 4, 8, 0, TAU); ctx.fill();
      ctx.fillStyle = C.eye;
      ctx.beginPath(); ctx.arc(hx + 9 + i * 16, hy - 16 + i * 4, 4, 0, TAU); ctx.fill();
    }
    // 尾针
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(-n * 38, -58);
    ctx.quadraticCurveTo(-n * 38 - 44, -66 + wig * 14, -n * 38 - 66, -30);
    ctx.quadraticCurveTo(-n * 38 - 30, -42, -n * 38 - 4, -36);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 4;
    ctx.stroke();
  };

  /* ---- 沼气鱼人王 ---- */
  MONSTER_DRAW.gasfishKing = function (ctx, m, C, time, flash) {
    const bob = Math.sin(time * 1.8 + (m.seed || 0)) * 5;
    const body = flash ? '#fff' : C.body;
    const dark = flash ? '#f2f2f2' : C.dark;
    const light = flash ? '#fff' : C.light;
    // 背后气囊
    ctx.fillStyle = 'rgba(155,224,138,0.22)';
    for (let i = 0; i < 5; i++) {
      const bx = -120 - (i % 3) * 26;
      const by = -170 + Math.sin(time * 2 + i) * 18 + bob;
      ctx.beginPath(); ctx.arc(bx, by, 18 + i * 3, 0, TAU); ctx.fill();
    }
    // 尾鳍
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(-72, -92);
    ctx.quadraticCurveTo(-180, -120, -160, -40);
    ctx.quadraticCurveTo(-120, -76, -70, -60);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = C.outline; ctx.lineWidth = 5; ctx.stroke();
    // 腿
    ctx.fillStyle = dark;
    Art.roundRect(ctx, -44, -48, 38, 48, 12); ctx.fill();
    Art.roundRect(ctx, 8, -48, 38, 48, 12); ctx.fill();
    // 身体
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, -118 + bob, 104, 96, 0.05, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 6;
    ctx.stroke();
    // 肚皮
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.ellipse(6, -86 + bob, 68, 52, 0.1, 0, TAU);
    ctx.fill();
    // 胸鳍
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.ellipse(-88, -112 + bob, 26, 16, -0.5, 0, TAU); ctx.fill();
    ctx.beginPath();
    ctx.ellipse(92, -112 + bob, 26, 16, 0.5, 0, TAU); ctx.fill();
    // 王冠
    ctx.fillStyle = flash ? '#fff' : C.crown;
    ctx.beginPath();
    ctx.moveTo(-44, -212 + bob);
    ctx.lineTo(-30, -258 + bob);
    ctx.lineTo(-8, -226 + bob);
    ctx.lineTo(12, -266 + bob);
    ctx.lineTo(32, -226 + bob);
    ctx.lineTo(48, -258 + bob);
    ctx.lineTo(54, -212 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = C.outline; ctx.lineWidth = 4; ctx.stroke();
    // 眼睛（三只）
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(-34 + i * 34, -158 + bob, 13, 0, TAU); ctx.fill();
      ctx.fillStyle = C.eye;
      ctx.beginPath(); ctx.arc(-32 + i * 34, -157 + bob, 6, 0, TAU); ctx.fill();
    }
    // 大嘴
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-46, -110 + bob);
    ctx.quadraticCurveTo(6, -86 + bob, 58, -110 + bob);
    ctx.stroke();
    ctx.fillStyle = '#f4efdc';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-30 + i * 20, -106 + bob);
      ctx.lineTo(-24 + i * 20, -94 + bob);
      ctx.lineTo(-18 + i * 20, -106 + bob);
      ctx.closePath();
      ctx.fill();
    }
  };

  /* ---- 紫色触手：从 (0,0) 向上生长、逐渐变细并勾卷的触手（参照水母触手参考图） ---- */
  function tentacleTube(ctx, o) {
    const len = o.len || 160;
    const w0 = o.w0 || 24, w1 = o.w1 || 4;
    const seed = o.seed || 0, time = o.time || 0, flip = o.flip || 1;
    const body = o.body || '#8f3fb8';
    const dark = o.dark || '#4a1d6b';
    const light = o.light || '#e6a8ff';
    const outline = o.outline || '#1a0626';
    const sway = Math.sin(time * 1.6 + seed) * len * 0.035;
    const p0 = { x: 0, y: 0 };
    const p1 = { x: (-0.12 * len + sway * 0.4) * flip, y: -0.52 * len };
    const p2 = { x: (0.52 * len + sway) * flip, y: -1.08 * len };
    const p3 = { x: (0.14 * len + sway * 0.5) * flip, y: -0.78 * len };
    const N = 26;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, u = 1 - t;
      const x = u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x;
      const y = u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y;
      pts.push({ x: x, y: y, w: w0 * (1 - t) + w1 * t + Math.sin(t * Math.PI) * (o.bulge || 0) });
    }
    // 粗描边
    ctx.fillStyle = outline;
    for (let i = 0; i < pts.length; i++) {
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, pts[i].w + 2.6, 0, TAU);
      ctx.fill();
    }
    // 本体
    ctx.fillStyle = body;
    for (let i = 0; i < pts.length; i++) {
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, pts[i].w, 0, TAU);
      ctx.fill();
    }
    // 内侧暗部
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = dark;
    for (let i = 0; i < pts.length; i++) {
      ctx.beginPath();
      ctx.arc(pts[i].x + pts[i].w * 0.45 * flip, pts[i].y, pts[i].w * 0.44, 0, TAU);
      ctx.fill();
    }
    // 高光
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = '#ffffff';
    for (let i = 4; i < pts.length - 4; i += 3) {
      ctx.beginPath();
      ctx.ellipse(pts[i].x - pts[i].w * 0.42 * flip, pts[i].y - 1, pts[i].w * 0.2, pts[i].w * 0.42, 0.18 * flip, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // 吸盘
    for (let i = 6; i < pts.length - 3; i += 3) {
      const a = pts[i], b = pts[Math.min(i + 1, pts.length - 1)];
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const nx = Math.cos(ang + Math.PI / 2), ny = Math.sin(ang + Math.PI / 2);
      const cx2 = a.x + nx * a.w * 0.5 * flip;
      const cy2 = a.y + ny * a.w * 0.5 * flip;
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.ellipse(cx2, cy2, a.w * 0.34, a.w * 0.25, ang, 0, TAU);
      ctx.fill();
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.ellipse(cx2, cy2, a.w * 0.16, a.w * 0.11, ang, 0, TAU);
      ctx.fill();
    }
    // 外侧瘤突
    ctx.fillStyle = dark;
    for (let i = 2; i < pts.length - 5; i += 4) {
      const a = pts[i], b = pts[Math.min(i + 1, pts.length - 1)];
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      ctx.beginPath();
      ctx.arc(a.x - Math.cos(ang + Math.PI / 2) * a.w * 0.92, a.y - Math.sin(ang + Math.PI / 2) * a.w * 0.92, a.w * 0.22, 0, TAU);
      ctx.fill();
    }
  }
  RA.tentacleTube = tentacleTube;

  /* ---- 水母母体 ---- */
  MONSTER_DRAW.jellyMother = function (ctx, m, C, time, flash) {
    const sway = Math.sin(time * 1.2 + (m.seed || 0));
    // 紫色触手（参照参考图：粗壮、卷曲、带吸盘与瘤突）
    for (let i = 0; i < 6; i++) {
      const bx = -88 + i * 35;
      ctx.save();
      ctx.translate(bx, -148 + sway * 3);
      ctx.rotate(Math.PI);
      tentacleTube(ctx, {
        len: 92 + (i % 3) * 20, w0: 10, w1: 2.4, seed: i * 1.7,
        time: time, flip: i % 2 ? 1 : -1,
        body: '#9b45c8', dark: '#4a1d6b', light: '#f0b8ff', outline: '#1a0626',
      });
      ctx.restore();
    }
    // 伞盖
    const grad = ctx.createRadialGradient(0, -190, 20, 0, -190, 150);
    grad.addColorStop(0, flash ? '#fff' : 'rgba(228,255,247,0.95)');
    grad.addColorStop(0.6, flash ? '#fff' : 'rgba(207,232,222,0.78)');
    grad.addColorStop(1, 'rgba(86,138,124,0.35)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, -190 + sway * 6, 138, 74, 0, 0, Math.PI, true);
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, -190 + sway * 6, 138, 74, 0, 0, Math.PI, true);
    ctx.stroke();
    // 伞边圆点
    ctx.fillStyle = 'rgba(86,255,224,0.55)';
    for (let i = 0; i < 7; i++) {
      const a = Math.PI + (i + 0.5) * Math.PI / 7;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 128, -190 + sway * 6 + Math.sin(a) * 62, 6, 0, TAU);
      ctx.fill();
    }
    // 荧光核心
    const pulse = 0.85 + Math.sin(time * 3) * 0.15;
    const core = ctx.createRadialGradient(0, -148, 4, 0, -148, 62 * pulse);
    core.addColorStop(0, '#eafff8');
    core.addColorStop(0.35, C.core);
    core.addColorStop(1, 'rgba(60,200,180,0)');
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(0, -148, 62 * pulse, 0, TAU); ctx.fill();
    ctx.fillStyle = flash ? '#fff' : C.core;
    ctx.beginPath(); ctx.arc(0, -148, 20, 0, TAU); ctx.fill();
    // 核心眼
    ctx.fillStyle = C.eye;
    ctx.beginPath(); ctx.arc(0, -148, 7, 0, TAU); ctx.fill();
    // 伞顶装饰
    ctx.strokeStyle = 'rgba(20,48,42,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-90, -230 + sway * 4);
    ctx.quadraticCurveTo(0, -272 + sway * 6, 90, -230 + sway * 4);
    ctx.stroke();
  };

  /* ---- 巨人之脚 ---- */
  MONSTER_DRAW.giantFoot = function (ctx, m, C, time, flash) {
    const stomp = m.state === 'stomp' || m.state === 'leap' ? 1 : 0;
    const body = flash ? '#fff' : C.body;
    const dark = flash ? '#f2f2f2' : C.dark;
    const light = flash ? '#fff' : C.light;
    // 小腿/大腿
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-92, -330);
    ctx.quadraticCurveTo(-40, -300, -34, -120);
    ctx.lineTo(74, -118);
    ctx.quadraticCurveTo(74, -286, 120, -318);
    ctx.quadraticCurveTo(40, -350, -92, -330);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 6;
    ctx.stroke();
    // 痂皮块
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(-46, -242, 30, 46, -0.3, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(42, -206, 24, 38, 0.25, 0, TAU); ctx.fill();
    ctx.fillStyle = light;
    ctx.beginPath(); ctx.ellipse(-18, -280, 34, 18, -0.1, 0, TAU); ctx.fill();
    // 踝部骨刺
    ctx.fillStyle = flash ? '#fff' : C.nail;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-50 + i * 40, -130);
      ctx.lineTo(-36 + i * 40, -196);
      ctx.lineTo(-18 + i * 40, -128);
      ctx.closePath();
      ctx.fill();
    }
    // 巨足
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-142, -8);
    ctx.quadraticCurveTo(-150, -74, -84, -86);
    ctx.quadraticCurveTo(0, -96, 78, -84);
    ctx.quadraticCurveTo(152, -70, 146, -8);
    ctx.quadraticCurveTo(0, 16 + stomp * 8, -142, -8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 6;
    ctx.stroke();
    // 脚趾
    ctx.fillStyle = flash ? '#fff' : C.nail;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.ellipse(-100 + i * 66, -24, 30, 20, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = C.outline; ctx.lineWidth = 3; ctx.stroke();
    }
    // 趾甲
    ctx.fillStyle = '#efe2c8';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-118 + i * 66, -8);
      ctx.lineTo(-100 + i * 66, 12);
      ctx.lineTo(-82 + i * 66, -8);
      ctx.closePath();
      ctx.fill();
    }
  };

  /* ---- 下水道鳄鱼 ---- */
  MONSTER_DRAW.sewerCroc = function (ctx, m, C, time, flash) {
    const snap = m.state === 'bite' ? 1 : 0;
    const body = flash ? '#fff' : C.body;
    const dark = flash ? '#f2f2f2' : C.dark;
    const light = flash ? '#fff' : C.light;
    // 长尾
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(-70, -100);
    ctx.quadraticCurveTo(-190, -120, -246, -54);
    ctx.quadraticCurveTo(-176, -66, -70, -48);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = C.outline; ctx.lineWidth = 5; ctx.stroke();
    // 腿
    ctx.fillStyle = dark;
    Art.roundRect(ctx, -128, -46, 46, 40, 10); ctx.fill();
    Art.roundRect(ctx, 22, -46, 46, 40, 10); ctx.fill();
    // 躯干
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(-16, -88, 132, 58, 0.04, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 6;
    ctx.stroke();
    // 肚皮
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.ellipse(-10, -58, 112, 26, 0.05, 0, TAU);
    ctx.fill();
    // 背甲锯齿
    ctx.fillStyle = dark;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(-120 + i * 34, -132);
      ctx.lineTo(-106 + i * 34, -172);
      ctx.lineTo(-90 + i * 34, -132);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = C.outline; ctx.lineWidth = 3; ctx.stroke();
    }
    // 长吻
    const hx = 118 + snap * 22;
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(20, -136);
    ctx.quadraticCurveTo(hx + 10, -132, hx + 58, -104);
    ctx.quadraticCurveTo(hx + 40, -70, hx - 8, -74);
    ctx.quadraticCurveTo(40, -82, 20, -136);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 5;
    ctx.stroke();
    // 上颚裂缝
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(hx + 34, -104); ctx.lineTo(hx + 6, -92); ctx.stroke();
    // 利齿
    ctx.fillStyle = '#f2ead0';
    for (let i = 0; i < 5; i++) {
      const tx = hx + 34 - i * 18;
      ctx.beginPath();
      ctx.moveTo(tx, -98);
      ctx.lineTo(tx - 6, -78 + snap * 4);
      ctx.lineTo(tx - 12, -98);
      ctx.closePath();
      ctx.fill();
    }
    // 眼
    ctx.fillStyle = C.eye;
    ctx.beginPath(); ctx.arc(78, -138, 10, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1a1204';
    ctx.beginPath(); ctx.arc(80, -138, 4, 0, TAU); ctx.fill();
    // 鼻孔
    ctx.fillStyle = C.outline;
    ctx.beginPath(); ctx.arc(hx + 48, -113, 3, 0, TAU); ctx.fill();
  };

  /* 终局合体：痂香杀手鳄（参照参考图：直立鳄鱼怪人，背生红色触手，全身血色鳞甲） */
  MONSTER_DRAW.killerCroc = function (ctx, m, C, time, flash) {
    const snap = m.state === 'bite' ? 1 : 0;
    const body = flash ? '#fff' : C.body;
    const dark = flash ? '#f2f2f2' : C.dark;
    const light = flash ? '#fff' : C.light;
    const scab = flash ? '#fff' : C.scab;
    const out = C.outline;
    const breathe = Math.sin(time * 1.4) * 3;
    const redT = C.tendril || '#e01b22';
    const redDark = '#6d080c';
    const redLight = '#ff8a6a';

    // ---- 尾巴（粗壮、带锯齿） ----
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(-48, -116);
    ctx.quadraticCurveTo(-168, -136, -262, -56);
    ctx.quadraticCurveTo(-196, -62, -146, -46);
    ctx.quadraticCurveTo(-88, -44, -40, -52);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = out; ctx.lineWidth = 5; ctx.stroke();
    ctx.fillStyle = scab;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-92 - i * 42, -118 + i * 7);
      ctx.lineTo(-108 - i * 42, -146 + i * 10);
      ctx.lineTo(-76 - i * 42, -114 + i * 6);
      ctx.closePath(); ctx.fill();
    }

    // ---- 背后红色触手（先画，藏在躯干之后） ----
    const tendrils = [
      { x: -66, y: -238, len: 196, rot: -0.62, flip: 1, w: 16 },
      { x: -34, y: -252, len: 220, rot: 0.10, flip: -1, w: 14 },
      { x: 4, y: -248, len: 184, rot: 0.58, flip: 1, w: 13 },
      { x: -86, y: -214, len: 152, rot: -1.05, flip: -1, w: 11 },
    ];
    for (let i = 0; i < tendrils.length; i++) {
      const td = tendrils[i];
      ctx.save();
      ctx.translate(td.x, td.y);
      ctx.rotate(td.rot + Math.sin(time * 1.3 + i * 1.6) * 0.08);
      tentacleTube(ctx, {
        len: td.len, w0: td.w, w1: 4, seed: i * 2.3, time: time, flip: td.flip,
        body: redT, dark: redDark, light: redLight, outline: '#2a0304',
      });
      ctx.restore();
    }

    // ---- 腿与脚爪 ----
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(-54, -74, 36, 62, -0.08, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(44, -76, 38, 64, 0.06, 0, TAU); ctx.fill();
    ctx.strokeStyle = out; ctx.lineWidth = 4; ctx.stroke();
    const foot = function (fx, fy, dir) {
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.ellipse(fx + dir * 10, fy, 44, 20, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = out; ctx.lineWidth = 4; ctx.stroke();
      ctx.fillStyle = '#e8d6b0';
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(fx + dir * 34 + i * 14, fy - 4);
        ctx.lineTo(fx + dir * 52 + i * 14, fy + 4);
        ctx.lineTo(fx + dir * 34 + i * 14, fy + 9);
        ctx.closePath(); ctx.fill();
      }
    };
    foot(-66, -8, -1);
    foot(52, -6, 1);

    // ---- 躯干 ----
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-92, -212 + breathe);
    ctx.quadraticCurveTo(-110, -152, -96, -86);
    ctx.quadraticCurveTo(0, -58, 86, -84);
    ctx.quadraticCurveTo(98, -158, 66, -234 + breathe);
    ctx.quadraticCurveTo(-22, -272, -92, -212 + breathe);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = out;
    ctx.lineWidth = 6;
    ctx.stroke();

    // 胸腹浅色甲片（横向排布）
    ctx.fillStyle = light;
    for (let i = 0; i < 4; i++) {
      const yy = -196 + i * 30 + breathe * 0.6;
      const ww = 96 + i * 8;
      Art.roundRect(ctx, -ww * 0.5, yy, ww, 24, 8);
      ctx.fill();
      ctx.strokeStyle = dark; ctx.lineWidth = 2; ctx.stroke();
    }
    // 肩胸血鳞
    ctx.fillStyle = scab;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.ellipse(-70 + i * 34, -224 - (i % 2) * 12, 17, 11, -0.15, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = redDark; ctx.lineWidth = 2; ctx.stroke();
    }
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.ellipse(-54 + i * 30, -132 - (i % 2) * 8, 13, 9, 0.1, 0, TAU);
      ctx.fill();
    }

    // ---- 手臂与利爪 ----
    const arm = function (ax, ay, ex, ey, ww) {
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(ax + ww, (ay + ey) * 0.5 + 8, ex, ey);
      ctx.lineTo(ex - 12, ey + 20);
      ctx.quadraticCurveTo(ax + ww * 0.4, (ay + ey) * 0.5 + 18, ax + 22, ay + 22);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = out; ctx.lineWidth = 4; ctx.stroke();
    };
    arm(-78, -226, -112, -152, -26);
    arm(62, -232, 122, -150, 44);
    // 爪
    const claws = function (cx, cy, dir) {
      ctx.fillStyle = '#e8d6b0';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + i * 11 * dir, cy);
        ctx.lineTo(cx + dir * 16 + i * 11 * dir, cy + 16);
        ctx.lineTo(cx + 5 * dir + i * 11 * dir, cy + 4);
        ctx.closePath(); ctx.fill();
      }
    };
    claws(-112, -148, -1);
    claws(122, -146, 1);

    // ---- 背脊锯齿 ----
    ctx.fillStyle = scab;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(-86 + i * 30, -246 + (i % 2) * 8 + breathe);
      ctx.lineTo(-74 + i * 30, -278 + (i % 2) * 6 + breathe);
      ctx.lineTo(-58 + i * 30, -244 + (i % 2) * 8 + breathe);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = redDark; ctx.lineWidth = 2; ctx.stroke();
    }

    // ---- 鳄鱼头与长颌 ----
    const hx = 190 + snap * 22;
    // 头骨
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(40, -292 + breathe, 48, 42, 0.05, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = out; ctx.lineWidth = 5; ctx.stroke();
    // 上颌
    ctx.beginPath();
    ctx.moveTo(52, -310 + breathe);
    ctx.quadraticCurveTo(hx * 0.7, -306 + breathe, hx + 26, -286 + breathe);
    ctx.quadraticCurveTo(hx + 18, -272 + breathe, hx - 6, -274 + breathe);
    ctx.quadraticCurveTo(110, -276 + breathe, 56, -266 + breathe);
    ctx.closePath();
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = out; ctx.lineWidth = 5; ctx.stroke();
    // 口腔
    ctx.fillStyle = '#3a0508';
    ctx.beginPath();
    ctx.moveTo(68, -286 + breathe);
    ctx.lineTo(hx + 4, -274 + breathe);
    ctx.lineTo(hx - 22, -246 + breathe);
    ctx.quadraticCurveTo(120, -256 + breathe, 74, -262 + breathe);
    ctx.closePath();
    ctx.fill();
    // 舌头
    ctx.fillStyle = '#912027';
    ctx.beginPath();
    ctx.ellipse(128, -258 + breathe, 34, 9, -0.12, 0, TAU);
    ctx.fill();
    // 下颌
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(66, -262 + breathe);
    ctx.quadraticCurveTo(126, -240 + breathe, 172, -246 + breathe);
    ctx.quadraticCurveTo(134, -226 + breathe, 74, -250 + breathe);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = out; ctx.lineWidth = 4; ctx.stroke();
    // 牙齿
    ctx.fillStyle = C.tooth || '#ffe9b0';
    for (let i = 0; i < 6; i++) {
      const tx = 84 + i * 17;
      ctx.beginPath();
      ctx.moveTo(tx, -278 + breathe);
      ctx.lineTo(tx + 7, -264 + breathe);
      ctx.lineTo(tx + 14, -278 + breathe);
      ctx.closePath(); ctx.fill();
    }
    for (let i = 0; i < 5; i++) {
      const tx = 88 + i * 17;
      ctx.beginPath();
      ctx.moveTo(tx, -250 + breathe);
      ctx.lineTo(tx + 6, -262 + breathe);
      ctx.lineTo(tx + 12, -250 + breathe);
      ctx.closePath(); ctx.fill();
    }
    // 鼻孔
    ctx.fillStyle = out;
    ctx.beginPath(); ctx.ellipse(hx + 10, -292 + breathe, 5, 3, 0.2, 0, TAU); ctx.fill();
    // 眼（血红发光）
    const eg = ctx.createRadialGradient(50, -306 + breathe, 2, 50, -306 + breathe, 22);
    eg.addColorStop(0, '#fff2c0');
    eg.addColorStop(0.35, C.eye || '#ff2a2a');
    eg.addColorStop(1, 'rgba(160,0,0,0)');
    ctx.fillStyle = eg;
    ctx.beginPath(); ctx.arc(50, -306 + breathe, 22, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2a0000';
    ctx.beginPath(); ctx.ellipse(53, -306 + breathe, 3, 9, 0, 0, TAU); ctx.fill();
    // 眉骨
    ctx.fillStyle = scab;
    ctx.beginPath();
    ctx.moveTo(24, -326 + breathe);
    ctx.lineTo(78, -320 + breathe);
    ctx.lineTo(68, -312 + breathe);
    ctx.lineTo(30, -314 + breathe);
    ctx.closePath(); ctx.fill();

    // ---- 前景肩部触手（增强层次） ----
    ctx.save();
    ctx.translate(30, -256);
    ctx.rotate(1.18 + Math.sin(time * 1.1) * 0.06);
    tentacleTube(ctx, {
      len: 150, w0: 12, w1: 3.5, seed: 5.4, time: time, flip: 1,
      body: redT, dark: redDark, light: redLight, outline: '#2a0304',
    });
    ctx.restore();
  };

  /* 水母母体的地面触须（可破坏目标） */
  MONSTER_DRAW.tentacleBase = function (ctx, m, C, time, flash) {
    const body = flash ? '#fff' : C.body;
    const dark = flash ? '#eee' : C.dark;
    const light = flash ? '#fff' : C.light;
    const wob = Math.sin(time * 2.6 + m.x * 0.02) * 6;
    // 地面裂纹与基座
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.7;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + 0.3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 16, -2);
      ctx.lineTo(Math.cos(a) * (44 + (i % 2) * 18), -2 + Math.sin(a) * 10);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.ellipse(0, -5, 40, 16, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 4;
    ctx.stroke();
    // 紫色卷曲触手
    ctx.save();
    ctx.translate(wob * 0.35, -8);
    tentacleTube(ctx, {
      len: 184, w0: 27, w1: 5, seed: m.x * 0.01, time: time, flip: 1,
      body: body, dark: dark, light: light, outline: C.outline, bulge: 3,
    });
    ctx.restore();
    // 顶端微光
    const pulse = 0.55 + 0.45 * Math.sin(time * 5 + m.x);
    ctx.globalAlpha = pulse * 0.75;
    ctx.fillStyle = C.core;
    ctx.beginPath(); ctx.arc(wob * 0.6 + 22, -162, 10, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  };

  RA.drawRelicIcon = function (ctx, icon, x, y, size, color) {
    const s = size / 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.4;
    switch (icon) {
      case 'badge':
        ctx.beginPath();
        ctx.moveTo(0, -s); ctx.lineTo(s, -s * 0.4); ctx.lineTo(s * 0.7, s * 0.6);
        ctx.lineTo(0, s); ctx.lineTo(-s * 0.7, s * 0.6); ctx.lineTo(-s, -s * 0.4);
        ctx.closePath(); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, -s * 0.1, s * 0.3, 0, TAU); ctx.stroke();
        break;
      case 'boots':
        ctx.beginPath();
        ctx.moveTo(-s * 0.6, -s); ctx.lineTo(s * 0.1, -s); ctx.lineTo(s * 0.1, s * 0.1);
        ctx.lineTo(s * 0.9, s * 0.1); ctx.lineTo(s * 0.9, s); ctx.lineTo(-s * 0.6, s);
        ctx.closePath(); ctx.stroke();
        break;
      case 'mask':
        ctx.beginPath(); ctx.arc(0, 0, s * 0.85, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.arc(-s * 0.35, -s * 0.1, s * 0.2, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.arc(s * 0.35, -s * 0.1, s * 0.2, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-s * 0.4, s * 0.45); ctx.quadraticCurveTo(0, s * 0.75, s * 0.4, s * 0.45); ctx.stroke();
        break;
      case 'incense':
        ctx.beginPath(); ctx.moveTo(0, s); ctx.lineTo(0, -s * 0.2); ctx.stroke();
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(0, -s * 0.3 - i * s * 0.2);
          ctx.quadraticCurveTo(s * 0.4, -s * 0.4 - i * s * 0.2, 0, -s * 0.6 - i * s * 0.2);
          ctx.stroke();
        }
        break;
      case 'pack':
        ctx.beginPath(); Art.roundRect(ctx, -s * 0.8, -s * 0.5, s * 1.6, s * 1.4, 4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-s * 0.4, -s * 0.5); ctx.quadraticCurveTo(0, -s * 1.1, s * 0.4, -s * 0.5); ctx.stroke();
        break;
      case 'ironfist':
        ctx.beginPath(); Art.roundRect(ctx, -s * 0.7, -s * 0.5, s * 1.3, s * 1.1, 5); ctx.stroke();
        for (let i = 0; i < 3; i++) {
          ctx.beginPath(); ctx.moveTo(-s * 0.5, -s * 0.5 + i * s * 0.3); ctx.lineTo(s * 0.5, -s * 0.5 + i * s * 0.3); ctx.stroke();
        }
        break;
      case 'feather':
        ctx.beginPath(); ctx.moveTo(-s * 0.7, s * 0.6); ctx.quadraticCurveTo(-s * 0.2, -s * 0.6, s * 0.8, -s * 0.8);
        ctx.quadraticCurveTo(0, 0, -s * 0.7, s * 0.6); ctx.stroke();
        break;
      case 'moss':
        ctx.beginPath();
        for (let i = 0; i < 9; i++) {
          const a = i / 9 * TAU;
          ctx.lineTo(Math.cos(a) * (s * 0.5 + (i % 2) * s * 0.4), Math.sin(a) * (s * 0.5 + (i % 2) * s * 0.4));
        }
        ctx.closePath(); ctx.stroke();
        break;
      case 'bombcharm':
        ctx.beginPath(); ctx.arc(0, s * 0.3, s * 0.6, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s * 0.4, -s * 0.2); ctx.lineTo(s * 0.7, -s * 0.8); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s * 0.55, -s * 0.7); ctx.lineTo(s * 0.9, -s * 0.5); ctx.stroke();
        break;
      case 'gloves':
        ctx.beginPath(); Art.roundRect(ctx, -s * 0.6, -s * 0.6, s * 1.2, s * 1.2, 3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-s * 0.2, -s * 0.6); ctx.lineTo(-s * 0.2, s * 0.6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s * 0.3, -s * 0.6); ctx.lineTo(s * 0.3, s * 0.6); ctx.stroke();
        break;
      case 'mirror':
        ctx.beginPath(); ctx.arc(0, -s * 0.1, s * 0.65, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, s * 0.55); ctx.lineTo(0, s); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-s * 0.4, s); ctx.lineTo(s * 0.4, s); ctx.stroke();
        break;
      case 'fist':
        ctx.beginPath(); Art.roundRect(ctx, -s * 0.6, -s * 0.45, s * 1.2, s * 1.0, 5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-s * 0.6, 0); ctx.lineTo(s * 0.6, 0); ctx.stroke();
        for (let i = 0; i < 3; i++) {
          ctx.beginPath(); ctx.moveTo(-s * 0.4 + i * s * 0.4, -s * 0.45); ctx.lineTo(-s * 0.4 + i * s * 0.4, -s * 0.05); ctx.stroke();
        }
        break;
      case 'heart':
        ctx.beginPath();
        ctx.moveTo(0, s * 0.8);
        ctx.bezierCurveTo(-s * 1.1, 0, -s * 0.55, -s * 0.9, 0, -s * 0.35);
        ctx.bezierCurveTo(s * 0.55, -s * 0.9, s * 1.1, 0, 0, s * 0.8);
        ctx.stroke();
        break;
      case 'boot':
        ctx.beginPath();
        ctx.moveTo(-s * 0.45, -s * 0.9); ctx.lineTo(s * 0.2, -s * 0.9);
        ctx.lineTo(s * 0.2, s * 0.1); ctx.lineTo(s * 0.9, s * 0.1);
        ctx.lineTo(s * 0.9, s * 0.8); ctx.lineTo(-s * 0.45, s * 0.8);
        ctx.closePath(); ctx.stroke();
        break;
      case 'hammer':
        ctx.beginPath(); Art.roundRect(ctx, -s * 0.85, -s * 0.9, s * 1.7, s * 0.7, 3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -s * 0.2); ctx.lineTo(0, s * 0.9); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-s * 0.35, s * 0.9); ctx.lineTo(s * 0.35, s * 0.9); ctx.stroke();
        break;
      case 'reach':
        ctx.beginPath(); ctx.moveTo(-s * 0.9, s * 0.6); ctx.lineTo(s * 0.7, -s * 0.6); ctx.stroke();
        ctx.beginPath(); ctx.arc(s * 0.7, -s * 0.6, s * 0.25, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-s * 0.9, s * 0.6); ctx.lineTo(-s * 0.4, s * 0.6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-s * 0.9, s * 0.6); ctx.lineTo(-s * 0.9, s * 0.1); ctx.stroke();
        break;
      case 'shield':
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.95); ctx.lineTo(s * 0.8, -s * 0.5);
        ctx.lineTo(s * 0.6, s * 0.6); ctx.lineTo(0, s * 0.95);
        ctx.lineTo(-s * 0.6, s * 0.6); ctx.lineTo(-s * 0.8, -s * 0.5);
        ctx.closePath(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -s * 0.5); ctx.lineTo(0, s * 0.5); ctx.stroke();
        break;
      case 'wing':
        ctx.beginPath(); ctx.moveTo(-s * 0.9, s * 0.5);
        ctx.quadraticCurveTo(-s * 0.2, -s * 0.1, s * 0.9, -s * 0.7);
        ctx.quadraticCurveTo(s * 0.2, s * 0.55, -s * 0.9, s * 0.5);
        ctx.stroke();
        break;
      case 'arrow':
        ctx.beginPath(); ctx.moveTo(-s * 0.9, s * 0.6); ctx.lineTo(s * 0.8, -s * 0.6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s * 0.8, -s * 0.6); ctx.lineTo(s * 0.3, -s * 0.55); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s * 0.8, -s * 0.6); ctx.lineTo(s * 0.75, -s * 0.1); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-s * 0.9, s * 0.6); ctx.lineTo(-s * 0.5, s * 0.2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-s * 0.9, s * 0.6); ctx.lineTo(-s * 0.45, s * 0.65); ctx.stroke();
        break;
      case 'rune':
        ctx.beginPath(); ctx.arc(0, 0, s * 0.85, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -s * 0.6); ctx.lineTo(0, s * 0.6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -s * 0.25); ctx.lineTo(s * 0.45, s * 0.4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -s * 0.05); ctx.lineTo(-s * 0.45, s * 0.4); ctx.stroke();
        break;
      default: // bubble
        ctx.beginPath(); ctx.arc(-s * 0.25, s * 0.2, s * 0.55, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.arc(s * 0.45, -s * 0.4, s * 0.35, 0, TAU); ctx.stroke();
        break;
    }
    ctx.restore();
  };

  RA.clamp = clamp;
  BVN.ROGUE_ART = RA;
})(window.BVN);

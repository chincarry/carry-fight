/* js/effects.js — 粒子 / 命中火花 / 伤害数字 / 刀光弧线 / 冲击环（纯世界坐标绘制，无 Path2D 复用） */
window.BVN = window.BVN || {};

(function (BVN) {
  'use strict';

  const MAX_PARTICLES = 460;

  const FX = {
    particles: [],
    numbers: [],
    sparks: [],
    arcs: [],
    rings: [],
  };

  FX.reset = function () {
    FX.particles.length = 0;
    FX.numbers.length = 0;
    FX.sparks.length = 0;
    FX.arcs.length = 0;
    FX.rings.length = 0;
  };

  function rnd(a, b) {
    return a + Math.random() * (b - a);
  }

  function pushParticle(p) {
    if (FX.particles.length >= MAX_PARTICLES) FX.particles.shift();
    FX.particles.push(p);
  }

  /** 通用粒子爆发。 */
  FX.burst = function (x, y, count, opts) {
    // 闪白重绘时抑制粒子（避免同一帧重复发射）
    if (BVN.Art && BVN.Art.noFx) return;
    const o = opts || {};
    const kind = o.kind || 'dot';
    for (let i = 0; i < count; i++) {
      const ang = o.angle != null ? o.angle + rnd(-(o.spread || 1), o.spread || 1) : rnd(0, Math.PI * 2);
      const spd = rnd(o.speedMin || 40, o.speedMax || 380);
      const life = rnd(o.lifeMin || 0.25, o.lifeMax || 0.75);
      pushParticle({
        x: x + rnd(-6, 6),
        y: y + rnd(-6, 6),
        vx: Math.cos(ang) * spd + (o.vx || 0),
        vy: Math.sin(ang) * spd + (o.vy || 0),
        life: life,
        max: life,
        size: rnd(o.sizeMin || 2, o.sizeMax || 6),
        color: Array.isArray(o.colors) ? o.colors[(Math.random() * o.colors.length) | 0] : (o.color || '#fff'),
        grav: o.grav != null ? o.grav : 900,
        drag: o.drag != null ? o.drag : 1.6,
        kind: kind,
        rot: rnd(0, Math.PI * 2),
        spin: rnd(-8, 8),
        grow: o.grow || 0,
      });
    }
  };

  /** 命中火花：白/黄星形爆散。 */
  FX.hitSpark = function (x, y, power, color) {
    const p = power || 1;
    FX.sparks.push({
      x: x, y: y, life: 0.16 + 0.06 * p, max: 0.16 + 0.06 * p,
      size: 26 * p, color: color || '#fff4c2', angle: rnd(0, Math.PI), arms: 5 + ((p * 2) | 0),
    });
    FX.burst(x, y, 6 + ((p * 6) | 0), {
      colors: ['#ffffff', '#ffe9a0', color || '#ffd166'],
      speedMin: 180, speedMax: 420 * p, sizeMin: 2, sizeMax: 4 + p * 2,
      lifeMin: 0.14, lifeMax: 0.3, grav: 420, drag: 3.4, kind: 'dot',
    });
  };

  /** 格挡火花（蓝白，带弧线）。 */
  FX.blockSpark = function (x, y, perfect) {
    FX.sparks.push({
      x: x, y: y, life: 0.2, max: 0.2, size: perfect ? 40 : 24,
      color: perfect ? '#ffffff' : '#9fd8ff', angle: rnd(0, Math.PI), arms: perfect ? 8 : 5,
    });
    if (perfect) FX.ring(x, y, '#ffffff', 150, 0.42);
    FX.burst(x, y, perfect ? 16 : 8, {
      colors: ['#ffffff', '#9fd8ff', '#5aa9ff'],
      speedMin: 120, speedMax: perfect ? 520 : 300, sizeMin: 2, sizeMax: 4,
      lifeMin: 0.2, lifeMax: 0.45, grav: 200, drag: 2.6,
    });
  };

  /** 飘伤害数字。 */
  /**
   * 伤害数字。
   * 多段命中时不能每个数字都原地叠在同一个坐标（会糊成「58 / 584」），
   * 所以：① 同源连段（短间隔、同一目标位置）合并成一个累加数字；
   *       ② 不合并的新数字按「横向 ±18px 抖动 + 每次上移 14px + 字号递减」错开。
   */
  FX.damage = function (x, y, value, opts) {
    const o = opts || {};
    const life = o.life || 0.85;
    // ① 合并：0.18 秒内、同位置（<40px）且还在有效期内的纯数字飘字 → 累加
    for (let i = FX.numbers.length - 1; i >= 0; i--) {
      const n = FX.numbers[i];
      if (n.mergedText) continue;
      if (n.text !== n.raw) continue;                    // 只合并纯数字
      if (n.max - n.life > 0.18) break;                  // 只看刚生成的
      if (Math.abs(n.x - x) > 40) continue;
      if (Math.abs(n.y0 - y) > 60) continue;
      n.value += o.rawValue != null ? o.rawValue : value;
      n.text = String(Math.round(n.value));
      n.life = Math.max(n.life, life * 0.7);
      n.size = Math.min(n.size + 1.6, n.baseSize * 1.25);
      n.pop = 1;
      return;
    }
    // ② 统计附近已有的数字，决定错开量
    let near = 0;
    for (let i = 0; i < FX.numbers.length; i++) {
      const n = FX.numbers[i];
      if (n.raw == null) continue;
      if (Math.abs(n.x0 - x) < 70 && Math.abs(n.y0 - y) < 120) near++;
    }
    const jitter = (near % 2 === 0 ? 1 : -1) * (10 + (near % 3) * 8);
    const size = Math.max(16, (o.size || 30) - near * 3);
    const t = String(o.text != null ? o.text : Math.round(value));
    const rec = {
      x: x + jitter,
      y: y - near * 14,
      x0: x,
      y0: y,
      vy: -150,
      vx: rnd(-26, 26) + jitter * 0.4,
      life: life,
      max: life,
      text: t,
      raw: t,
      value: o.rawValue != null ? o.rawValue : value,
      color: o.color || '#ffe9a0',
      size: size,
      baseSize: size,
      pop: 0,
    };
    FX.numbers.push(rec);
  };

  /** 冲击环。 */
  FX.ring = function (x, y, color, radius, life) {
    FX.rings.push({ x: x, y: y, color: color || '#fff', r: 6, maxR: radius || 120, life: life || 0.35, max: life || 0.35 });
  };

  /** 刀光弧。 */
  FX.slashArc = function (x, y, radius, from, to, color, width) {
    FX.arcs.push({
      x: x, y: y, r: radius || 100, from: from || -1.1, to: to || 1.1,
      color: color || '#fff', width: width || 10, life: 0.22, max: 0.22,
    });
  };

  /** 把过暗的飘字颜色提到可读亮度（浪人的 trim 是深灰，直接画在暗背景上看不见）。 */
  function legible(hex) {
    const m = /^#([0-9a-fA-F]{6})$/.exec(hex || '');
    if (!m) return hex || '#ffffff';
    const n = parseInt(m[1], 16);
    let r = (n >> 16) & 255;
    let g = (n >> 8) & 255;
    let b = n & 255;
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    if (l >= 190) return hex;
    const k = Math.min(1, (190 - l) / Math.max(1, 255 - l));
    r = Math.round(r + (255 - r) * k);
    g = Math.round(g + (255 - g) * k);
    b = Math.round(b + (255 - b) * k);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  /** 文字飘字（如 "MAX"、"PERFECT"、招式名）。 */
  FX.text = function (x, y, str, color, size, strong) {
    FX.numbers.push({
      x: x, y: y, vy: -60, vx: 0, life: 0.9, max: 0.9,
      text: str, color: strong ? legible(color) : (color || '#fff'),
      size: size || 26, strong: !!strong,
    });
  };

  FX.update = function (dt) {
    let i;
    for (i = FX.particles.length - 1; i >= 0; i--) {
      const p = FX.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        FX.particles[i] = FX.particles[FX.particles.length - 1];
        FX.particles.pop();
        continue;
      }
      p.vy += p.grav * dt;
      const d = 1 - p.drag * dt;
      p.vx *= d > 0 ? d : 0;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      p.size += p.grow * dt;
      if (p.kind === 'feather') p.vx += Math.sin((p.life * 9 + p.rot) || 0) * 30 * dt;
    }
    for (i = FX.numbers.length - 1; i >= 0; i--) {
      const n = FX.numbers[i];
      n.life -= dt;
      if (n.life <= 0) { FX.numbers.splice(i, 1); continue; }
      n.y += n.vy * dt;
      n.x += n.vx * dt;
      n.vy += 320 * dt;
    }
    for (i = FX.sparks.length - 1; i >= 0; i--) {
      const s = FX.sparks[i];
      s.life -= dt;
      if (s.life <= 0) { FX.sparks.splice(i, 1); }
    }
    for (i = FX.arcs.length - 1; i >= 0; i--) {
      const a = FX.arcs[i];
      a.life -= dt;
      if (a.life <= 0) { FX.arcs.splice(i, 1); }
    }
    for (i = FX.rings.length - 1; i >= 0; i--) {
      const r = FX.rings[i];
      r.life -= dt;
      if (r.life <= 0) { FX.rings.splice(i, 1); continue; }
      const t = 1 - r.life / r.max;
      r.r = 6 + r.maxR * t;
    }
  };

  /** 世界坐标系内绘制全部特效。 */
  FX.draw = function (ctx) {
    let i;

    // 冲击环
    for (i = 0; i < FX.rings.length; i++) {
      const r = FX.rings[i];
      const t = r.life / r.max;
      ctx.globalAlpha = t * 0.8;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2 + 6 * t;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 刀光弧
    for (i = 0; i < FX.arcs.length; i++) {
      const a = FX.arcs[i];
      const t = a.life / a.max;
      ctx.globalAlpha = t;
      ctx.strokeStyle = a.color;
      ctx.lineWidth = a.width * t;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(a.x, a.y, a.r, a.from, a.to);
      ctx.stroke();
      ctx.globalAlpha = t * 0.5;
      ctx.lineWidth = a.width * t * 2.4;
      ctx.beginPath();
      ctx.arc(a.x, a.y, a.r, a.from + 0.12, a.to - 0.12);
      ctx.stroke();
    }

    // 粒子
    for (i = 0; i < FX.particles.length; i++) {
      const p = FX.particles[i];
      const t = p.life / p.max;
      ctx.globalAlpha = Math.min(1, t * 1.4);
      ctx.fillStyle = p.color;
      if (p.kind === 'feather') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size * 0.5, p.size * 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (p.kind === 'streak') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * 0.6;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        ctx.stroke();
      } else if (p.kind === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (2 - t), 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.size > 2.6) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(p.x - p.size * 0.5, p.y - p.size * 0.5, p.size, p.size);
      }
    }

    // 星形火花
    for (i = 0; i < FX.sparks.length; i++) {
      const s = FX.sparks[i];
      const t = s.life / s.max;
      ctx.globalAlpha = t;
      ctx.strokeStyle = s.color;
      ctx.lineCap = 'round';
      for (let k = 0; k < s.arms; k++) {
        const ang = s.angle + (Math.PI * 2 * k) / s.arms;
        const r0 = s.size * 0.15 * (1.2 - t);
        const r1 = s.size * (1.3 - t * 0.3);
        ctx.lineWidth = 3 * t + 0.6;
        ctx.beginPath();
        ctx.moveTo(s.x + Math.cos(ang) * r0, s.y + Math.sin(ang) * r0);
        ctx.lineTo(s.x + Math.cos(ang) * r1, s.y + Math.sin(ang) * r1);
        ctx.stroke();
      }
      ctx.globalAlpha = t * 0.9;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * 0.28 * t + 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // 伤害数字
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (i = 0; i < FX.numbers.length; i++) {
      const n = FX.numbers[i];
      const t = n.life / n.max;
      const scale = t > 0.72 ? 1 + (1 - t) * 2.4 : 1;
      ctx.globalAlpha = Math.min(1, t * 1.8);
      ctx.font = '900 ' + Math.round(n.size * scale) + 'px ' + BVN.CFG.FONT;
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(n.text, n.x, n.y);
      ctx.fillStyle = n.color;
      ctx.fillText(n.text, n.x, n.y);
    }

    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  };

  BVN.FX = FX;
})(window.BVN);

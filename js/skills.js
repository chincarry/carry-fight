/* js/skills.js — 八角色技能/必杀实现 + 飞行道具与场地实体（投射物、法阵、陨石、骷髅等） */
window.BVN = window.BVN || {};

(function (BVN) {
  'use strict';

  const CFG = BVN.CFG;
  const FX = BVN.FX;

  const Skills = {};

  /* ===================== 实体工厂 ===================== */

  function make(game, o) {
    const e = Object.assign({
      x: 0, y: 0, vx: 0, vy: 0, w: 44, h: 44,
      life: 3, age: 0, dmg: 0, hitstun: 14, kb: 80, lift: 0,
      pierce: 0, sfx: 'light', single: true, rehit: 0, behind: false,
      owner: null, dead: false, activeFrom: 0, glow: '#fff', kind: 'generic', scale: 1,
      hitSet: new Set(),
    }, o);
    e.age = 0;
    game.entities.push(e);
    return e;
  }

  function target(game, owner) {
    return game.fighters[1 - owner.index];
  }

  function towardTargetX(e, game, owner, lead) {
    const t = target(game, owner);
    return t ? t.x + (lead || 0) : e.x;
  }

  /* ===================== 通用实体：鬼火球 ===================== */
  function spawnOrb(game, owner) {
    const t = target(game, owner);
    const e = make(game, {
      x: owner.x + owner.facing * 46,
      y: owner.y - 112,
      w: 46, h: 46, dmg: 45, hitstun: 18, kb: 150, life: 2.4,
      sfx: 'fire', owner: owner, glow: '#ff3b30', kind: 'orb',
    });
    e.vx = owner.facing * 340;
    e.vy = -110;
    e.update = function (dt, g) {
      e.age += dt;
      if (t && t.state !== 'ko') {
        const dx = t.x - e.x;
        const dy = (t.y - 104) - e.y;
        const d = Math.hypot(dx, dy) || 1;
        e.vx += (dx / d) * 1000 * dt;
        e.vy += (dy / d) * 1000 * dt;
        const sp = Math.hypot(e.vx, e.vy);
        const max = 540;
        if (sp > max) { e.vx = (e.vx / sp) * max; e.vy = (e.vy / sp) * max; }
      }
      e.vy += 160 * dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      if (e.age > e.life || e.x < -80 || e.x > CFG.STAGE_W + 80 || e.y > CFG.GROUND_Y) e.dead = true;
      if (Math.random() < 0.7) {
        FX.burst(e.x, e.y, 1, {
          colors: ['#ff3b30', '#ff8a5c', '#ffd166'], speedMin: 10, speedMax: 70,
          sizeMin: 2, sizeMax: 5, lifeMin: 0.2, lifeMax: 0.5, grav: -90, drag: 2,
        });
      }
    };
    e.draw = function (ctx, time) {
      const r = 20 + Math.sin(time * 16) * 2;
      const gr = ctx.createRadialGradient(e.x, e.y, 2, e.x, e.y, r * 1.7);
      gr.addColorStop(0, '#fff3e0');
      gr.addColorStop(0.35, '#ff5a3c');
      gr.addColorStop(1, 'rgba(150,10,10,0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r * 1.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(e.x, e.y, r * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = '#fff8e6';
      ctx.fill();
    };
    return e;
  }

  /* ===================== 通用实体：地面鬼影尖刺 ===================== */
  function spawnSpike(game, owner, x) {
    const e = make(game, {
      x: x, y: CFG.GROUND_Y, w: 90, h: 200, dmg: 52, hitstun: 20, kb: 110, lift: 120,
      life: 0.85, activeFrom: 0.13, sfx: 'heavy', owner: owner, behind: true, glow: '#ff2a20',
    });
    e.update = function (dt) {
      e.age += dt;
      if (e.age > e.life) e.dead = true;
      if (Math.random() < 0.5) {
        FX.burst(e.x + (Math.random() - 0.5) * 70, CFG.GROUND_Y - 40, 1, {
          colors: ['#ff3b30', '#8b0f0c'], speedMin: 60, speedMax: 200,
          sizeMin: 2, sizeMax: 5, lifeMin: 0.3, lifeMax: 0.6, grav: -200, drag: 2,
        });
      }
    };
    e.draw = function (ctx) {
      const t = Math.min(1, e.age / 0.16);
      const hgt = 190 * t;
      const w = 26;
      ctx.save();
      ctx.translate(e.x, CFG.GROUND_Y);
      // 阴影
      ctx.beginPath();
      ctx.ellipse(0, 0, 52 * t, 12, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(120,10,10,0.45)';
      ctx.fill();
      // 鬼手/尖刺
      const gr = ctx.createLinearGradient(0, 0, 0, -hgt);
      gr.addColorStop(0, 'rgba(60,0,0,0.95)');
      gr.addColorStop(0.55, 'rgba(200,30,26,0.95)');
      gr.addColorStop(1, 'rgba(255,120,90,0.9)');
      ctx.beginPath();
      ctx.moveTo(-w, 0);
      ctx.lineTo(-w * 0.5, -hgt * 0.55);
      ctx.lineTo(-w * 1.35, -hgt * 0.62);
      ctx.lineTo(-w * 0.2, -hgt * 0.9);
      ctx.lineTo(-w * 0.55, -hgt);
      ctx.lineTo(w * 0.55, -hgt * 0.96);
      ctx.lineTo(w * 0.25, -hgt * 0.86);
      ctx.lineTo(w * 1.3, -hgt * 0.58);
      ctx.lineTo(w * 0.5, -hgt * 0.5);
      ctx.lineTo(w, 0);
      ctx.closePath();
      ctx.fillStyle = gr;
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,0,0,0.9)';
      ctx.lineWidth = 3;
      ctx.stroke();
      // 顶部火光
      ctx.beginPath();
      ctx.arc(0, -hgt, 18 * t, 0, Math.PI * 2);
      const og = ctx.createRadialGradient(0, -hgt, 2, 0, -hgt, 30);
      og.addColorStop(0, 'rgba(255,220,180,0.9)');
      og.addColorStop(1, 'rgba(255,40,20,0)');
      ctx.fillStyle = og;
      ctx.fill();
      ctx.restore();
    };
    return e;
  }

  /* ===================== 通用实体：光柱 ===================== */
  function spawnPillar(game, owner, x) {
    const e = make(game, {
      x: x, y: CFG.GROUND_Y - 150, w: 76, h: 460, dmg: 60, hitstun: 22, kb: 60, lift: 0,
      life: 0.9, activeFrom: 0.18, sfx: 'holy', owner: owner, behind: false, glow: '#ffe9a0',
    });
    e.update = function (dt) {
      e.age += dt;
      if (e.age > e.life) e.dead = true;
      if (Math.random() < 0.6) {
        FX.burst(e.x + (Math.random() - 0.5) * 60, CFG.GROUND_Y - Math.random() * 260, 1, {
          colors: ['#fff6c8', '#ffe9a0', '#ffffff'], speedMin: 40, speedMax: 160,
          sizeMin: 2, sizeMax: 5, lifeMin: 0.3, lifeMax: 0.7, grav: -260, drag: 1.6,
        });
      }
    };
    e.draw = function (ctx) {
      const t = Math.min(1, e.age / 0.16);
      const fade = Math.max(0, 1 - Math.max(0, e.age - 0.55) / 0.35);
      const w = 34 * t;
      ctx.save();
      ctx.globalAlpha = fade;
      const gr = ctx.createLinearGradient(0, CFG.GROUND_Y - 470, 0, CFG.GROUND_Y);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.35, 'rgba(255,246,200,0.85)');
      gr.addColorStop(1, 'rgba(255,200,90,0.95)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.moveTo(e.x - w, CFG.GROUND_Y);
      ctx.lineTo(e.x - w * 0.45, CFG.GROUND_Y - 460);
      ctx.lineTo(e.x + w * 0.45, CFG.GROUND_Y - 460);
      ctx.lineTo(e.x + w, CFG.GROUND_Y);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(e.x, CFG.GROUND_Y, 62 * t, 14, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,240,190,0.6)';
      ctx.fill();
      ctx.restore();
    };
    return e;
  }

  /* ===================== 通用实体：箭矢 ===================== */
  /**
   * @param {Object} game
   * @param {Fighter} owner
   * @param {number} x,y 起点
   * @param {number} vx,vy 初速度
   * @param {number} dmg 伤害
   * @param {number} gravity 重力（箭雨用正数下坠）
   * @param {boolean} homing 是否对目标做有限追踪（箭雨用）
   */
  function spawnArrow(game, owner, x, y, vx, vy, dmg, gravity, homing) {
    const e = make(game, {
      // 判定盒固定值（不随绘制角度变化，避免落在 draw 里导致判定漂移）
      x: x, y: y, w: 40, h: 30, dmg: dmg, hitstun: 16, kb: 90, life: 2.4,
      sfx: 'arrow', owner: owner, glow: '#9fe6ff',
    });
    e.vx = vx;
    e.vy = vy;
    e.g = gravity || 0;
    e.homing = !!homing;
    e.angle = Math.atan2(vy, vx);
    e.update = function (dt, g) {
      e.age += dt;
      e.vy += e.g * dt;
      e.vx *= 1 - 0.4 * dt;
      if (e.homing && g) {
        const t = g.fighters[1 - owner.index];
        if (t && t.state !== 'ko') {
          // 有限水平追踪：转向速率受限，走位仍可躲开一部分
          e.vx += Math.max(-1400, Math.min(1400, (t.x - e.x) * 3.2)) * dt;
          e.vx = Math.max(-320, Math.min(320, e.vx));
        }
      }
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.angle = Math.atan2(e.vy, e.vx);
      if (e.age > e.life || e.y > CFG.GROUND_Y || e.x < -80 || e.x > CFG.STAGE_W + 80) e.dead = true;
    };
    e.draw = function (ctx) {
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      // 拖尾
      ctx.strokeStyle = 'rgba(159,230,255,0.55)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-46, 0);
      ctx.lineTo(-6, 0);
      ctx.stroke();
      // 箭杆
      ctx.strokeStyle = '#e8dcc0';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-18, 0);
      ctx.lineTo(10, 0);
      ctx.stroke();
      // 箭头
      ctx.beginPath();
      ctx.moveTo(20, 0);
      ctx.lineTo(8, -5);
      ctx.lineTo(8, 5);
      ctx.closePath();
      ctx.fillStyle = '#dff4ff';
      ctx.fill();
      // 羽
      ctx.beginPath();
      ctx.moveTo(-18, 0);
      ctx.lineTo(-24, -5);
      ctx.strokeStyle = '#c9603a';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-18, 0);
      ctx.lineTo(-24, 5);
      ctx.stroke();
      ctx.restore();
    };
    return e;
  }

  /* ===================== 通用实体：法阵诅咒 ===================== */
  function spawnCurse(game, owner, x) {
    const e = make(game, {
      x: x, y: CFG.GROUND_Y - 30, w: 130, h: 90, dmg: 90, hitstun: 24, kb: 210, lift: 260,
      life: 1.28, activeFrom: 1.0, sfx: 'dark', owner: owner, behind: true, glow: '#a05cff',
      kind: 'curse',
    });
    e.update = function (dt) {
      e.age += dt;
      if (e.age > e.life) {
        e.dead = true;
        FX.ring(e.x, CFG.GROUND_Y - 20, '#b06bff', 170, 0.5);
        FX.burst(e.x, CFG.GROUND_Y - 20, 26, {
          colors: ['#b06bff', '#6a2bb0', '#e0c8ff'], speedMin: 100, speedMax: 420,
          sizeMin: 2, sizeMax: 6, lifeMin: 0.3, lifeMax: 0.8, grav: -120, drag: 1.8,
        });
      }
    };
    e.draw = function (ctx, time) {
      const t = Math.min(1, e.age / 1.0);
      const r = 58;
      ctx.save();
      ctx.translate(e.x, CFG.GROUND_Y - 8);
      ctx.scale(1, 0.34);
      ctx.globalAlpha = 0.35 + t * 0.55;
      ctx.strokeStyle = t > 0.94 ? '#ffffff' : '#b06bff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -time * 1.6 + (Math.PI * 2 * i) / 5 - Math.PI / 2;
        const px = Math.cos(a) * r * 0.95;
        const py = Math.sin(a) * r * 0.95;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.strokeStyle = '#7b3fd4';
      ctx.lineWidth = 2;
      ctx.stroke();
      // 蓄力光柱
      ctx.restore();
      if (t > 0.4) {
        ctx.globalAlpha = (t - 0.4) * 0.8;
        const gr = ctx.createLinearGradient(0, CFG.GROUND_Y - 200, 0, CFG.GROUND_Y);
        gr.addColorStop(0, 'rgba(160,92,255,0)');
        gr.addColorStop(1, 'rgba(200,140,255,0.7)');
        ctx.fillStyle = gr;
        ctx.fillRect(e.x - 26, CFG.GROUND_Y - 200, 52, 200);
        ctx.globalAlpha = 1;
      }
    };
    return e;
  }

  /* ===================== 通用实体：陨石 ===================== */
  function spawnMeteor(game, owner, x, delay) {
    // 陨石本体只做视觉；伤害统一由落地冲击波 AoE 结算（宽度够覆盖落点附近）
    const e = make(game, {
      x: x, y: -140, w: 60, h: 60, dmg: 0,
      life: 3, sfx: 'meteor', owner: owner, glow: '#ff7a2a',
    });
    e.vy = 760;
    e.delay = delay || 0;
    e.landed = false;
    e.update = function (dt, g) {
      e.age += dt;
      if (e.age < e.delay) return;
      if (!e.landed) {
        e.y += e.vy * dt;
        if (Math.random() < 0.9) {
          FX.burst(e.x + (Math.random() - 0.5) * 24, e.y + 20, 1, {
            colors: ['#ff9a3c', '#ff5a1e', '#ffd166'], speedMin: 20, speedMax: 120,
            sizeMin: 3, sizeMax: 7, lifeMin: 0.3, lifeMax: 0.7, grav: -60, drag: 1.6,
          });
        }
        if (e.y >= CFG.GROUND_Y - 24) {
          e.landed = true;
          e.dead = true;
          FX.ring(e.x, CFG.GROUND_Y - 20, '#ff9a3c', 200, 0.45);
          FX.burst(e.x, CFG.GROUND_Y - 20, 30, {
            colors: ['#ff5a1e', '#ffd166', '#fff1c0'], speedMin: 120, speedMax: 460,
            sizeMin: 3, sizeMax: 8, lifeMin: 0.3, lifeMax: 0.9, grav: 700, drag: 1.2,
          });
          // 落地冲击波（有判定；视觉同 FX.ring）
          const aoe = make(g, {
            x: e.x, y: CFG.GROUND_Y - 55, w: 220, h: 130,
            dmg: 110, hitstun: 30, kb: 300, lift: 420, sfx: 'meteor',
            owner: owner, behind: false, glow: '#ff9a3c', kind: 'aoe',
          });
          aoe.life = 0.13;
          aoe.update = function (dt) {
            aoe.age += dt;
            if (aoe.age > aoe.life) aoe.dead = true;
          };
          aoe.draw = function (ctx) {
            const k = Math.min(1, aoe.age / 0.08);
            ctx.globalAlpha = Math.max(0, 1 - aoe.age / aoe.life) * 0.85;
            const gr = ctx.createRadialGradient(aoe.x, CFG.GROUND_Y - 40, 8, aoe.x, CFG.GROUND_Y - 40, 130 * (0.6 + k * 0.6));
            gr.addColorStop(0, 'rgba(255,244,200,0.95)');
            gr.addColorStop(0.5, 'rgba(255,122,42,0.75)');
            gr.addColorStop(1, 'rgba(150,30,0,0)');
            ctx.fillStyle = gr;
            ctx.beginPath();
            ctx.ellipse(aoe.x, CFG.GROUND_Y - 40, 115 * (0.6 + k * 0.6), 80 * (0.6 + k * 0.6), 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
          };
          // 落地余烬火海（纯视觉：伤害已由 3 颗陨石的冲击波承担，避免总量超描述）
          spawnFireZone(g, owner, e.x, 1.5, 16, 0);
        }
      }
    };
    e.draw = function (ctx, time) {
      if (e.age < e.delay) {
        // 预警
        ctx.globalAlpha = 0.25 + Math.sin(time * 20) * 0.1;
        ctx.strokeStyle = '#ff9a3c';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(e.x, CFG.GROUND_Y - 6, 46, 12, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        return;
      }
      const gr = ctx.createRadialGradient(e.x, e.y, 4, e.x, e.y, 40);
      gr.addColorStop(0, '#fff4d0');
      gr.addColorStop(0.4, '#ff7a2a');
      gr.addColorStop(1, 'rgba(120,20,0,0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(e.x - 6, e.y - 4, 16, 0, Math.PI * 2);
      ctx.fillStyle = '#3a1a10';
      ctx.fill();
    };
    return e;
  }

  /* ===================== 通用实体：地火 ===================== */

  /**
   * 生成一片地火。
   * @param {Object} game 游戏实例
   * @param {Object} owner 施放者
   * @param {number} x 中心 x
   * @param {number} [life=1.5] 持续时间（秒）
   * @param {number} [interval=16] 重复命中间隔（帧）
   * @param {number} [dmg=16] 单次伤害；传 0 表示纯视觉余烬（不参与判定）
   */
  function spawnFireZone(game, owner, x, life, interval, dmg) {
    const e = make(game, {
      x: x, y: CFG.GROUND_Y - 26, w: 118, h: 60, dmg: dmg == null ? 16 : dmg, hitstun: 6, kb: 30,
      life: life || 1.5, sfx: 'fire', owner: owner, behind: true, single: false,
      rehit: (interval || 16) / 60, glow: '#ff7a2a',
    });
    e.update = function (dt) {
      e.age += dt;
      if (e.age > e.life) e.dead = true;
      if (Math.random() < 0.5) {
        FX.burst(e.x + (Math.random() - 0.5) * 90, CFG.GROUND_Y - 10, 1, {
          colors: ['#ff9a3c', '#ff5a1e', '#ffe6b0'], speedMin: 40, speedMax: 160,
          sizeMin: 2, sizeMax: 5, lifeMin: 0.3, lifeMax: 0.7, grav: -180, drag: 1.6,
        });
      }
    };
    e.draw = function (ctx, time) {
      const a = Math.min(1, (e.life - e.age) / 0.4);
      ctx.globalAlpha = 0.85 * a;
      for (let i = 0; i < 7; i++) {
        const fx = e.x - 50 + i * 17;
        const fl = 22 + Math.sin(time * 9 + i * 1.7) * 10;
        const gr = ctx.createRadialGradient(fx, CFG.GROUND_Y - 6, 2, fx, CFG.GROUND_Y - 6, fl * 2);
        gr.addColorStop(0, 'rgba(255,240,190,0.95)');
        gr.addColorStop(0.4, 'rgba(255,120,40,0.6)');
        gr.addColorStop(1, 'rgba(150,30,0,0)');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.ellipse(fx, CFG.GROUND_Y - fl * 0.5, fl * 0.8, fl, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    return e;
  }

  /* ===================== 通用实体：骷髅冲锋 ===================== */

  /**
   * 生成一只冲锋骷髅。
   * @param {Object} game 游戏实例
   * @param {Object} owner 召唤者
   * @param {number} x 出生 x
   * @param {number} dir 冲锋方向（1 / -1）
   * @param {number} [dmg=40] 命中伤害
   */
  function spawnSkeleton(game, owner, x, dir, dmg) {
    const e = make(game, {
      x: x, y: CFG.GROUND_Y - 60, w: 60, h: 120, dmg: dmg == null ? 40 : dmg, hitstun: 20, kb: 200, lift: 60,
      life: 1.6, sfx: 'summon', owner: owner, glow: '#8ef26a',
    });
    e.vx = dir * 520;
    e.update = function (dt) {
      e.age += dt;
      e.x += e.vx * dt;
      if (e.age > e.life || e.x < -100 || e.x > CFG.STAGE_W + 100) e.dead = true;
      if (Math.random() < 0.5) {
        FX.burst(e.x, CFG.GROUND_Y - Math.random() * 90, 1, {
          colors: ['#8ef26a', '#3fbb52'], speedMin: 20, speedMax: 80,
          sizeMin: 2, sizeMax: 4, lifeMin: 0.2, lifeMax: 0.5, grav: -140, drag: 2,
        });
      }
    };
    e.draw = function (ctx, time) {
      const bob = Math.sin(time * 12 + e.x * 0.05) * 3;
      ctx.save();
      ctx.translate(e.x, CFG.GROUND_Y + bob);
      ctx.scale(dir, 1);
      ctx.globalAlpha = 0.95;
      // 骨腿
      ctx.strokeStyle = '#e6f0d8';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-4, -52);
      ctx.lineTo(-10 + Math.sin(time * 14) * 8, -2);
      ctx.moveTo(4, -52);
      ctx.lineTo(12 - Math.sin(time * 14) * 8, -2);
      ctx.stroke();
      // 骨身
      ctx.beginPath();
      ctx.moveTo(0, -52);
      ctx.lineTo(0, -96);
      ctx.stroke();
      ctx.lineWidth = 4;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-9, -60 - i * 12);
        ctx.lineTo(9, -60 - i * 12);
        ctx.stroke();
      }
      // 手臂
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, -92);
      ctx.lineTo(15, -74 + Math.sin(time * 12) * 6);
      ctx.stroke();
      // 头骨
      ctx.beginPath();
      ctx.arc(2, -110, 12, 0, Math.PI * 2);
      ctx.fillStyle = '#eef4e4';
      ctx.fill();
      ctx.strokeStyle = '#0d2418';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(6, -112, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#8ef26a';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-2, -112, 3, 0, Math.PI * 2);
      ctx.fill();
      // 绿火
      const gr = ctx.createRadialGradient(2, -110, 2, 2, -110, 34);
      gr.addColorStop(0, 'rgba(140,255,120,0.42)');
      gr.addColorStop(1, 'rgba(60,200,80,0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(2, -110, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    return e;
  }

  /* ===================== 通用实体：飘带/天女散花 ===================== */
  function spawnRibbon(game, owner, x, delay) {
    const e = make(game, {
      x: x, y: -180, w: 120, h: 280, dmg: 35, hitstun: 16, kb: 80, lift: 40,
      life: 1.1, sfx: 'slash', owner: owner, glow: '#e83f6f',
    });
    e.delay = delay || 0;
    e.vy = 900;
    e.update = function (dt) {
      e.age += dt;
      if (e.age < e.delay) return;
      if (e.y < CFG.GROUND_Y - 120) {
        e.y += e.vy * dt;
        e.vy += 1400 * dt;
      }
      if (e.age > e.life + e.delay) e.dead = true;
      if (Math.random() < 0.6) {
        FX.burst(e.x + (Math.random() - 0.5) * 30, e.y, 1, {
          colors: ['#7ef9ff', '#e83f6f', '#f0743c', '#ffe9a8'], speedMin: 20, speedMax: 90,
          sizeMin: 2, sizeMax: 5, lifeMin: 0.3, lifeMax: 0.7, grav: 60, drag: 1.4, kind: 'feather',
        });
      }
    };
    e.draw = function (ctx, time) {
      if (e.age < e.delay) {
        ctx.globalAlpha = 0.2 + Math.sin(time * 18) * 0.08;
        ctx.strokeStyle = '#e83f6f';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(e.x, CFG.GROUND_Y - 8, 34, 10, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        return;
      }
      const px = e.x;
      const py = e.y + 100;
      ctx.beginPath();
      ctx.moveTo(px, Math.max(0, py - 300));
      for (let i = 1; i <= 5; i++) {
        const t = i / 5;
        ctx.lineTo(px + Math.sin(time * 5 + i * 1.2) * 26 * t, Math.max(0, py - 300 + t * 300));
      }
      const gr = ctx.createLinearGradient(px, py - 300, px, py);
      gr.addColorStop(0, 'rgba(126,249,255,0.9)');
      gr.addColorStop(0.5, 'rgba(232,63,111,0.85)');
      gr.addColorStop(1, 'rgba(240,116,60,0.6)');
      ctx.strokeStyle = gr;
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.stroke();
    };
    return e;
  }

  /* ===================== 技能实现表 ===================== */

  const IMPL = {
    hannya: {
      skill: function (f, game) {
        f.script.push({ f: 8, fn: function (ff, g) { spawnOrb(g, ff); BVN.Sfx.play('fire'); } });
        f.script.push({ f: 15, fn: function (ff, g) { spawnOrb(g, ff); } });
        f.script.push({ f: 22, fn: function (ff, g) { spawnOrb(g, ff); } });
      },
      ult: function (f, game) {
        f.invuln = 180;
        f.glow = 3;
        game.flash('#c0392b', 0.55, 18);
        game.shake(16, 30);
        BVN.Sfx.play('dark');
        const times = [20, 38, 56, 74, 92];
        for (let i = 0; i < times.length; i++) {
          f.script.push({
            f: times[i],
            fn: function (ff, g) {
              const t = target(g, ff);
              const x = t ? t.x : ff.x + ff.facing * 120;
              spawnSpike(g, ff, x);
              g.shake(9, 10);
              BVN.Sfx.play('heavy');
            },
          });
        }
      },
    },

    angel: {
      skill: function (f, game) {
        f.script.push({
          f: 10,
          fn: function (ff, g) {
            const t = target(g, ff);
            spawnPillar(g, ff, t ? t.x : ff.x + ff.facing * 120);
            BVN.Sfx.play('holy');
          },
        });
        f.script.push({
          f: 16,
          fn: function (ff, g) {
            ff.hp = Math.min(ff.hpMax, ff.hp + 40);
            BVN.FX.text(ff.x, ff.y - 200, '+40', '#8effa8', 30);
            BVN.FX.burst(ff.x, ff.y - 90, 18, {
              colors: ['#fff6c8', '#8effa8', '#ffffff'], speedMin: 40, speedMax: 200,
              sizeMin: 2, sizeMax: 5, lifeMin: 0.4, lifeMax: 0.9, grav: -140, drag: 1.4,
            });
            BVN.Sfx.play('heal');
          },
        });
      },
      ult: function (f, game) {
        f.invuln = 110;
        f.glow = 3;
        game.flash('#fff2c0', 0.5, 14);
        BVN.Sfx.play('holy');
        f.script.push({
          f: 6,
          fn: function (ff) {
            ff.vy = -1150;
            ff.vx = 0;
            ff.onGround = false;
          },
        });
        f.script.push({
          f: 34,
          fn: function (ff, g) {
            const t = target(g, ff);
            ff.vy = 1500;
            ff.vx = t ? (t.x - ff.x) * 11 : 0;
            BVN.Sfx.play('charge');
          },
        });
        // 俯冲阶段持续追踪对手
        f.onTick = function (ff, g) {
          if (ff.attackFrame > 33 && ff.attackFrame < 62) {
            const t = target(g, ff);
            if (t) {
              const want = (t.x - ff.x) * 11;
              ff.vx = Math.max(-2300, Math.min(2300, want));
            }
          }
        };
        f.script.push({
          f: 62,
          fn: function (ff, g) {
            const e = make(g, {
              x: ff.x, y: CFG.GROUND_Y - 60, w: 340, h: 210, dmg: 170,
              hitstun: 34, kb: 520, lift: 620, sfx: 'holy', owner: ff, glow: '#ffe9a0',
            });
            e.update = function (dt) {
              e.age += dt;
              if (e.age > 0.2) e.dead = true;
            };
            e.draw = function (ctx) {
              const t = Math.min(1, e.age / 0.2);
              ctx.globalAlpha = 1 - t;
              const gr = ctx.createRadialGradient(e.x, CFG.GROUND_Y - 40, 10, e.x, CFG.GROUND_Y - 40, 190);
              gr.addColorStop(0, 'rgba(255,255,255,0.98)');
              gr.addColorStop(0.5, 'rgba(255,214,120,0.8)');
              gr.addColorStop(1, 'rgba(255,150,60,0)');
              ctx.fillStyle = gr;
              ctx.beginPath();
              ctx.ellipse(e.x, CFG.GROUND_Y - 40, 190 * (0.5 + t), 120 * (0.5 + t), 0, 0, Math.PI * 2);
              ctx.fill();
              ctx.globalAlpha = 1;
            };
            BVN.FX.ring(ff.x, CFG.GROUND_Y - 30, '#fff2c0', 300, 0.5);
            BVN.FX.burst(ff.x, CFG.GROUND_Y - 40, 40, {
              colors: ['#ffffff', '#ffe9a0', '#ffb347'], speedMin: 140, speedMax: 620,
              sizeMin: 3, sizeMax: 8, lifeMin: 0.4, lifeMax: 1.0, grav: 320, drag: 1.4, kind: 'feather',
            });
            g.shake(22, 26);
            BVN.Sfx.play('heavy');
          },
        });
      },
    },

    boxer: {
      skill: function (f, game) {
        f.vx = f.facing * 1150;
        BVN.Sfx.play('dash');
        // 突进：前 22 帧维持推进力，避免地面摩擦立刻刹停
        f.onTick = function (ff) {
          if (ff.attackFrame < 22) ff.vx = ff.facing * 1000;
        };
        f.script.push({
          f: 24,
          fn: function (ff) { ff.vx *= 0.15; },
        });
      },
      ult: function (f, game) {
        f.invuln = 40;
        f.glow = 2.4;
        BVN.Sfx.play('charge');
        // 蓄力结束后向前突进，避免 0.6 秒蓄力期间对手走开导致 100 气完全空放
        f.onTick = function (ff) {
          if (ff.attackFrame >= 36 && ff.attackFrame <= 46) ff.vx = ff.facing * 1250;
          else if (ff.attackFrame > 46) ff.vx *= 0.3;
        };
        f.script.push({
          f: 36,
          fn: function (ff) {
            BVN.Sfx.play('dash');
          },
        });
        f.script.push({
          f: 38,
          fn: function (ff, g) {
            BVN.Sfx.play('ko');
            g.flash('#ffffff', 0.4, 8);
            g.shake(20, 16);
            BVN.FX.slashArc(ff.x + ff.facing * 80, ff.y - 110, 150, -1.3, 1.3, 'rgba(255,255,255,0.9)', 14);
          },
        });
      },
    },

    dancer: {
      skill: function (f, game) {
        BVN.Sfx.play('slash');
        f.script.push({
          f: 6,
          fn: function (ff) {
            ff.spin = 1;
            BVN.FX.ring(ff.x, ff.y - 80, '#7ef9ff', 150, 0.45);
          },
        });
        // 起手把范围内的敌人拉近（飘带拉扯）：逐帧真实位移，地面摩擦也不影响
        for (let k = 0; k < 12; k++) {
          f.script.push({
            f: 8 + k,
            fn: function (ff, g) {
              const t = target(g, ff);
              if (!t || t.state === 'ko') return;
              const d = ff.x - t.x;
              if (Math.abs(d) > 96) {
                t.x += Math.sign(d) * Math.min(20, Math.abs(d) - 96);
                t.vx *= 0.35;
                if (k === 0) {
                  BVN.FX.burst(t.x, t.y - 90, 8, {
                    colors: ['#7ef9ff', '#e83f6f'], speedMin: 60, speedMax: 220,
                    sizeMin: 2, sizeMax: 5, lifeMin: 0.2, lifeMax: 0.5, grav: 100, drag: 2,
                  });
                }
              }
            },
          });
        }
        f.script.push({ f: 30, fn: function (ff) { ff.spin = 0.4; } });
        f.script.push({ f: 52, fn: function (ff) { ff.spin = 0; } });
      },
      ult: function (f, game) {
        f.invuln = 100;
        f.glow = 3;
        game.flash('#7ef9ff', 0.4, 16);
        game.setTheme('inferno', 150);
        BVN.Sfx.play('summon');
        for (let i = 0; i < 8; i++) {
          const delayF = 14 + i * 8;
          const idx = i;
          f.script.push({
            f: delayF,
            fn: function (ff, g) {
              const t = target(g, ff);
              const bx = t ? t.x : ff.x + ff.facing * 100;
              const off = (idx - 3.5) * 24;
              spawnRibbon(g, ff, Math.max(70, Math.min(CFG.STAGE_W - 70, bx + off)), 0);
              BVN.Sfx.play('slash');
            },
          });
        }
      },
    },

    dragon: {
      skill: function (f, game) {
        BVN.Sfx.play('fire');
        f.script.push({
          f: 8,
          fn: function (ff) {
            ff.vx = ff.facing * 60;
          },
        });
      },
      ult: function (f, game) {
        f.invuln = 110;
        f.glow = 3;
        game.flash('#8ef26a', 0.42, 16);
        BVN.Sfx.play('summon');
        f.script.push({
          f: 18,
          fn: function (ff, g) {
            // 骷髅从目标两侧 380px 处相向冲锋，保证 4 只都能在存活期内抵达目标
            const t0 = target(g, ff);
            const tx = t0 ? t0.x : ff.x + ff.facing * 160;
            for (let i = 0; i < 4; i++) {
              const fromLeft = (i % 2 === 0);
              const sx = Math.max(-60, Math.min(CFG.STAGE_W + 60, fromLeft ? tx - 380 : tx + 380));
              spawnSkeleton(g, ff, sx, fromLeft ? 1 : -1, 40);
            }
            g.shake(10, 14);
          },
        });
        f.script.push({
          f: 52,
          fn: function (ff, g) {
            const t = target(g, ff);
            const x = t ? t.x : ff.x + ff.facing * 100;
            const e = make(g, {
              x: x, y: CFG.GROUND_Y - 80, w: 250, h: 200, dmg: 140,
              hitstun: 30, kb: 340, lift: 480, sfx: 'heavy', owner: ff, glow: '#8ef26a',
            });
            e.update = function (dt) {
              e.age += dt;
              if (e.age > 0.25) e.dead = true;
            };
            e.draw = function (ctx, time) {
              const t2 = Math.min(1, e.age / 0.25);
              ctx.globalAlpha = 1 - t2;
              for (let i = 0; i < 6; i++) {
                const bx = e.x - 100 + i * 40;
                const h = 120 + Math.sin(time * 20 + i) * 24;
                ctx.beginPath();
                ctx.moveTo(bx - 16, CFG.GROUND_Y);
                ctx.lineTo(bx, CFG.GROUND_Y - h * (0.4 + t2));
                ctx.lineTo(bx + 16, CFG.GROUND_Y);
                ctx.closePath();
                ctx.fillStyle = 'rgba(142,242,106,0.75)';
                ctx.fill();
              }
              ctx.globalAlpha = 1;
            };
            g.shake(18, 20);
            BVN.Sfx.play('ko');
            spawnFireZone(g, ff, x, 1.2, 14, 8);
          },
        });
      },
    },

    warlock: {
      skill: function (f, game) {
        f.script.push({
          f: 8,
          fn: function (ff, g) {
            const t = target(g, ff);
            const x = t ? t.x : ff.x + ff.facing * 140;
            // 最多同时存在 2 个
            let count = 0;
            for (let i = 0; i < g.entities.length; i++) {
              if (g.entities[i].kind === 'curse' && !g.entities[i].dead) count++;
            }
            if (count >= 2) {
              for (let i = 0; i < g.entities.length; i++) {
                if (g.entities[i].kind === 'curse' && !g.entities[i].dead) { g.entities[i].dead = true; break; }
              }
            }
            spawnCurse(g, ff, x);
            BVN.Sfx.play('dark');
          },
        });
      },
      ult: function (f, game) {
        f.invuln = 110;
        f.glow = 3;
        game.flash('#a05cff', 0.5, 18);
        BVN.Sfx.play('dark');
        const offs = [-110, 0, 110];
        for (let i = 0; i < offs.length; i++) {
          const off = offs[i];
          const d = i * 14;
          f.script.push({
            f: 16 + d,
            fn: function (ff, g) {
              const t = target(g, ff);
              const x = (t ? t.x : ff.x + ff.facing * 120) + off;
              spawnMeteor(g, ff, Math.max(60, Math.min(CFG.STAGE_W - 60, x)), 0.55);
              BVN.Sfx.play('meteor');
            },
          });
        }
      },
    },

    ranger: {
      skill: function (f, game) {
        f.script.push({
          f: 6,
          fn: function (ff, g) {
            spawnArrow(g, ff, ff.x + ff.facing * 46, ff.y - 118, ff.facing * 1500, 0, 70, 0);
            BVN.Sfx.play('arrow');
          },
        });
        f.script.push({
          f: 18,
          fn: function (ff, g) {
            spawnArrow(g, ff, ff.x + ff.facing * 46, ff.y - 118, ff.facing * 1500, 0, 70, 0);
            BVN.Sfx.play('arrow');
          },
        });
      },
      ult: function (f, game) {
        f.invuln = 100;
        f.glow = 3;
        game.flash('#9fe6ff', 0.35, 12);
        BVN.Sfx.play('arrow');
        for (let i = 0; i < 12; i++) {
          const idx = i;
          f.script.push({
            f: 10 + i * 5,
            fn: function (ff, g) {
              const t = target(g, ff);
              const bx = t ? t.x : ff.x + ff.facing * 200;
              // 12 支均匀铺在目标 ±90 内，配合有限追踪保证能连续命中
              const spread = 180;
              const x = bx - spread * 0.5 + (spread / 11) * idx + (Math.random() - 0.5) * 26;
              const cx = Math.max(50, Math.min(CFG.STAGE_W - 50, x));
              const fromX = cx - 40 + Math.random() * 80;
              spawnArrow(g, ff, fromX, -60 - Math.random() * 80, (cx - fromX) * 0.2, 620, 30, 620, true);
              BVN.Sfx.play('arrow');
            },
          });
        }
      },
    },

    ronin: {
      skill: function (f, game) {
        f.invuln = 24;
        f.script.push({
          f: 6,
          fn: function (ff, g) {
            const t = target(g, ff);
            if (!t) return;
            const dir = t.x >= ff.x ? 1 : -1;
            const nx = t.x + dir * 76;
            // 残影
            for (let i = 1; i <= 4; i++) {
              ff.trail.push({
                x: ff.x + ((nx - ff.x) * i) / 5, y: ff.y, facing: ff.facing,
                pose: Object.assign({}, ff.pose), build: ff.build, palette: ff.palette,
                onGround: ff.onGround, animTime: ff.animTime, state: ff.state,
                attackKey: ff.attackKey, attackFrame: ff.attackFrame, hitFlash: 0, glow: 1,
                alpha: 0.5 - i * 0.08, life: 0.3, maxLife: 0.3,
              });
            }
            ff.x = Math.max(60, Math.min(CFG.STAGE_W - 60, nx));
            ff.facing = -dir;
            BVN.Sfx.play('dash');
            BVN.FX.burst(ff.x, ff.y - 90, 14, {
              colors: ['#ffe9c0', '#ffffff'], speedMin: 60, speedMax: 260,
              sizeMin: 2, sizeMax: 5, lifeMin: 0.2, lifeMax: 0.5, grav: 120, drag: 2.4, kind: 'streak',
            });
          },
        });
      },
      ult: function (f, game) {
        f.invuln = 130;
        f.glow = 3;
        f.script.push({
          f: 18,
          fn: function (ff, g) {
            g.freezeOpponent(ff, 36);
            g.grayFrames = 40;
            g.flash('#000000', 0.5, 10);
            BVN.Sfx.play('dark');
          },
        });
        f.script.push({
          f: 62,
          fn: function (ff, g) {
            g.flash('#ffffff', 0.85, 10);
            g.shake(24, 26);
            BVN.FX.slashArc(ff.x, ff.y - 110, 520, -1.4, 1.4, 'rgba(255,255,255,0.95)', 20);
            BVN.FX.burst(ff.x + ff.facing * 200, ff.y - 110, 30, {
              colors: ['#ffffff', '#ffe9c0'], speedMin: 200, speedMax: 700,
              sizeMin: 2, sizeMax: 6, lifeMin: 0.3, lifeMax: 0.7, grav: 400, drag: 1.6, kind: 'streak',
            });
            BVN.Sfx.play('slash');
          },
        });
      },
    },
  };

  /**
   * 释放技能或必杀（由 Fighter.startSkill 调用）。
   * @param {Object} f 释放者
   * @param {Object} game 游戏实例
   * @param {string} kind 'skill' | 'ult'
   */
  Skills.use = function (f, game, kind) {
    const table = BVN.SKILL_ATTACKS[f.id];
    if (!table || !table[kind]) return;
    const def = table[kind];
    f.state = 'attack';
    f.attackKey = kind;
    f.attackDef = def;
    f.attackFrame = 0;
    f.hitReg = {};
    f.script = [];
    f.spin = 0;
    if (f.onGround) f.vx *= 0.2;
    const impl = IMPL[f.id];
    if (impl && impl[kind]) impl[kind](f, game);
  };

  /** 实体统一更新（也做命中判定）。 */
  Skills.update = function (game, dt) {
    const list = game.entities;
    for (let i = list.length - 1; i >= 0; i--) {
      // 列表可能在打到 KO 的瞬间被清空（onKO 会 G.entities.length = 0），此时直接收尾
      if (i >= list.length) continue;
      const e = list[i];
      if (!e) continue;
      if (e.rehit > 0) {
        e.rehitTimer = (e.rehitTimer || 0) + dt;
        if (e.rehitTimer >= e.rehit) { e.rehitTimer = 0; e.hitSet.clear(); }
      }
      // 注意：age 由各实体自身的 update 递增（部分实体有延迟激活逻辑）
      if (e.update) e.update(dt, game);
      if (e.dead) {
        list[i] = list[list.length - 1];
        list.pop();
        continue;
      }
      // 命中判定（只有战斗进行中才结算，防止回合结束后残留实体继续扣血）
      if (e.dmg > 0 && e.age >= (e.activeFrom || 0) && e.owner && game.canFight()) {
        const t = game.fighters[1 - e.owner.index];
        if (t && t.state !== 'ko' && t.hp > 0 && !e.hitSet.has(t.uid)) {
          const hb = t.hurtbox();
          const er = { x: e.x - e.w / 2, y: e.y - e.h / 2, w: e.w, h: e.h };
          if (game.rectOverlap(er, hb)) {
            const hit = {
              dmg: e.dmg, hitstun: e.hitstun, kb: e.kb, lift: e.lift,
              sfx: e.sfx, pierce: e.pierce || 0, x: t.x, y: t.y - 110, gain: e.gain || 6,
            };
            const landed = game.applyDamage(e.owner, t, hit);
            if (landed) {
              e.hitSet.add(t.uid);
              if (e.single) e.dead = true;
            }
          }
        }
      }
    }
  };

  /** 实体绘制。behind=true 的实体在角色之前绘制。 */
  Skills.draw = function (ctx, game, time, behind) {
    const list = game.entities;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!!e.behind !== behind) continue;
      if (e.draw) e.draw(ctx, time, game);
    }
  };

  BVN.Skills = Skills;
})(window.BVN);

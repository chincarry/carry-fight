/* js/assist.js — 援助系统：召唤时序 / 效果解释 / 卡式绘制 / 冻结滤镜 / HUD 信息
   依赖：data.js（ASSISTS / ASSIST_USES / ASSIST_CD）、effects.js（FX）、art.js（运行时绘制）
   数据层字段语义见 data.js 中 ASSISTS.effect 注释 */
window.BVN = window.BVN || {};

(function (BVN) {
  'use strict';

  const CFG = BVN.CFG;
  const FX = BVN.FX;
  const Art = BVN.Art;
  const Sfx = BVN.Sfx;

  const IN_FRAMES = 30;    // 入场（滑入 + 光效）
  const OUT_FRAMES = 20;   // 退场

  /* 召援者可行动的状态（处于其它状态时按键无效） */
  const ACTABLE = { idle: 1, walk: 1, jump: 1, fall: 1, dash: 1, guard: 1 };

  const Assist = {
    images: {},   // 援助立绘缓存（id → HTMLImageElement）
  };

  /* ---------- 立绘预载（file:// 与 base64 内联均适用） ---------- */
  (function preload() {
    const list = BVN.ASSISTS || [];
    for (let i = 0; i < list.length; i++) {
      const img = new Image();
      img.src = list[i].img;
      Assist.images[list[i].id] = img;
    }
  })();

  Assist.img = function (id) { return Assist.images[id]; };

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /** act 阶段时长（帧）：按援助类型给出足够的演出窗口 */
  function actLen(def) {
    if (def.id === 'mage') return 44;                 // 落星需要坠落时间
    if (def.effect && def.effect.times) return def.effect.times * 10 + 12; // 多段间隔
    return 26;
  }

  /* ===================== 生命周期 ===================== */

  /** startFight 时调用：重置次数 / 冷却 / 活动援助 */
  Assist.reset = function (game) {
    if (!game) return;
    game.assistUses = [BVN.ASSIST_USES, BVN.ASSIST_USES];
    game.assistCd = [0, 0];
    game.assistRecords = [];
  };

  /** 每小局 resetRound 时调用：次数跨小局保留，冷却与场上援助清空 */
  Assist.clear = function (game) {
    if (!game) return;
    game.assistRecords = [];
    game.assistCd = [0, 0];
  };

  /** HUD 用：返回某侧援助信息 */
  Assist.hudInfo = function (side) {
    const game = BVN.Game;
    const idx = game && game.assistSel ? game.assistSel[side] : -1;
    return {
      def: idx >= 0 ? (BVN.ASSISTS[idx] || null) : null,
      usesLeft: game && game.assistUses ? game.assistUses[side] : 0,
      cd: game && game.assistCd ? game.assistCd[side] : 0,
    };
  };

  /* ===================== 召唤 ===================== */

  /**
   * 尝试召唤援助。成功返回 true。
   * 校验：战斗进行中 / 次数 > 0 / 冷却毕 / 召援者可行动。
   * 成功后：扣次数、进冷却、建活动援助记录、召援者进入 22 帧召援硬直
   * （被打断时 in 阶段的援助记录作废，但次数不退还）。
   */
  Assist.trySummon = function (side, game) {
    if (!game || game.phase !== 'fight' || game.roundState !== 'active') return false;
    if (!game.assistUses) Assist.reset(game);
    if (game.assistUses[side] <= 0) return false;
    if (game.assistCd[side] > 0) return false;
    const f = game.fighters[side];
    if (!f || f.state === 'ko' || f.hp <= 0) return false;
    if (!ACTABLE[f.state]) return false;

    const def = BVN.ASSISTS[game.assistSel ? game.assistSel[side] : 0] || BVN.ASSISTS[0];
    game.assistUses[side]--;
    game.assistCd[side] = BVN.ASSIST_CD;
    Assist.spawn(side, def, game, false);

    // 召援动作：短暂原地硬直（复用 attack 状态机，空判定框不会造成伤害）
    f.state = 'attack';
    f.attackKey = 'assist';
    f.attackDef = { total: 22, windows: [] };
    f.attackFrame = 0;
    f.hitReg = {};
    f.script = null;
    f.onTick = null;

    FX.text(f.x, f.y - 244, '援助 · ' + def.short, def.color, 24, true);
    FX.ring(f.x, f.y - 90, def.palette.glow, 140, 0.42);
    FX.burst(f.x, f.y - 90, 12, {
      colors: [def.palette.glow, '#ffffff'], speedMin: 60, speedMax: 240,
      sizeMin: 2, sizeMax: 5, lifeMin: 0.2, lifeMax: 0.5, grav: -60, drag: 2,
    });
    Sfx.play('uiPick');

    // 联机：主机广播召唤事件与最新次数（次数以主机为准）
    if (game.mode === 'net' && BVN.Net && BVN.Net.isHost && BVN.Net.isHost() && BVN.Netplay) {
      BVN.Netplay.sendRaw({ t: 'assist', side: side, id: def.id });
      BVN.Netplay.sendRaw({ t: 'au', u: [game.assistUses[0], game.assistUses[1]] });
    }
    return true;
  };

  /** 联机客机：收到主机召唤事件后在本地重建记录（只做演出，不扣次数、不重复结算伤害） */
  Assist.spawnRemote = function (side, id) {
    const game = BVN.Game;
    const def = BVN.ASSIST_BY_ID[id];
    if (!game || !def || !game.fighters || !game.fighters[side]) return;
    Assist.spawn(side, def, game, true);
  };

  /** 创建活动援助记录 */
  Assist.spawn = function (side, def, game, remote) {
    if (!game.assistRecords) game.assistRecords = [];
    const f = game.fighters[side];
    const rec = {
      side: side,
      def: def,
      t: 0,
      phase: 'in',                       // in → act → out
      x: f.x + f.facing * 130,           // 停靠点（召援者侧前上方）
      y: CFG.GROUND_Y - 150,
      sx: f.x - f.facing * 60,           // 入场起点（召援者身后地面）
      sy: CFG.GROUND_Y - 26,
      facing: f.facing,
      remote: !!remote,                  // 客机重建的记录：只演出不结算
      flash: 0,
      done: false,
      pending: [],
    };
    if (!remote) buildPending(rec, game);
    game.assistRecords.push(rec);
  };

  /** 多段援助的时间表（黑道三连击：0 / 10 / 20 帧各一段，末段击飞） */
  function buildPending(rec, game) {
    const eff = rec.def.effect;
    if (!eff || !eff.times || eff.times < 2) return;
    for (let i = 0; i < eff.times; i++) {
      const last = i === eff.times - 1;
      rec.pending.push({
        at: i * 10,
        hit: {
          dmg: eff.dmg,
          hitstun: eff.hitstun || 16,
          kb: last ? (eff.kb || 120) : 60,
          lift: last ? (eff.lift || 260) : 0,
          sfx: 'heavy',
          x: 0, y: 0,   // 命中时再填
        },
      });
    }
  }

  /* ===================== 更新 ===================== */

  Assist.update = function (game) {
    // 冷却逐帧递减（两次召唤的最小间隔）
    if (game.assistCd) {
      for (let i = 0; i < 2; i++) {
        if (game.assistCd[i] > 0) game.assistCd[i]--;
      }
    }
    const recs = game.assistRecords;
    if (!recs || !recs.length) return;
    for (let i = recs.length - 1; i >= 0; i--) {
      const rec = recs[i];
      rec.t++;

      if (rec.phase === 'in') {
        // 召援者被打断（受击 / 倒地 / KO）→ 援助作废（次数已扣，不退还）
        const sf = game.fighters[rec.side];
        if (sf && (sf.state === 'hitstun' || sf.state === 'knockdown' || sf.state === 'ko')) {
          FX.text(rec.x, rec.y, '援助中断', '#9aa2b8', 20);
          recs.splice(i, 1);
          continue;
        }
        if (rec.t >= IN_FRAMES) {
          rec.phase = 'act';
          rec.t = 0;
          rec.flash = 1;
          if (!rec.remote) {
            fireAct(rec, game);
            // 切换帧也要跑一次时间表：act 分支本帧被跳过，否则 pending 的 at:0（第一段）永不匹配
            applyPending(rec, game);
          }
        }
      } else if (rec.phase === 'act') {
        if (rec.flash > 0) rec.flash = Math.max(0, rec.flash - 0.09);
        if (!rec.remote) applyPending(rec, game);
        if (rec.t >= actLen(rec.def)) {
          rec.phase = 'out';
          rec.t = 0;
        }
      } else { // out
        if (rec.t >= OUT_FRAMES) recs.splice(i, 1);
      }
    }
  };

  /** act 阶段：到点的多段判定 */
  function applyPending(rec, game) {
    if (!rec.pending.length) return;
    const summoner = game.fighters[rec.side];
    const target = game.fighters[1 - rec.side];
    if (!summoner || !target) return;
    for (let i = rec.pending.length - 1; i >= 0; i--) {
      const p = rec.pending[i];
      if (p.at !== rec.t) continue;
      rec.pending.splice(i, 1);
      p.hit.x = target.x;
      p.hit.y = target.y - 110;
      dealHit(summoner, target, p.hit, game);
    }
  }

  /** 统一伤害出口 */
  function dealHit(summoner, target, hit, game) {
    game.applyDamage(summoner, target, hit);
    FX.ring(hit.x, hit.y, '#ffe9b0', 90, 0.3);
  }

  /** act 开始：解释 effect 字段（语义见 data.js ASSISTS 注释） */
  function fireAct(rec, game) {
    const summoner = game.fighters[rec.side];
    const target = game.fighters[1 - rec.side];
    if (!summoner || !target) return;
    const eff = rec.def.effect;

    /* 侦探：时停 —— 先结算伤害再冻结（受击会解冻，顺序不能反） */
    if (eff.freeze) {
      dealHit(summoner, target, { dmg: eff.dmg, hitstun: eff.hitstun || 12, kb: eff.kb || 0, sfx: 'heavy', x: target.x, y: target.y - 110 }, game);
      if (target.hp > 0 && target.state !== 'ko') {
        target.frozen = eff.freeze;
        FX.text(target.x, target.y - 224, 'TIME STOP', '#bfe6ff', 26, true);
        FX.ring(target.x, target.y - 100, '#bfe6ff', 160, 0.5);
      }
      return;
    }

    /* 仙人：回血回气 + 蝶影撞伤对手 */
    if (eff.heal) {
      summoner.hp = Math.min(summoner.hpMax, summoner.hp + eff.heal);
      summoner.meter = Math.min(CFG.MAX_METER, summoner.meter + (eff.meter || 0));
      FX.text(summoner.x, summoner.y - 236, '+' + eff.heal, '#8dffcf', 32, true);
      FX.burst(summoner.x, summoner.y - 110, 14, {
        colors: ['#8dffcf', '#e3d9a8', '#ffffff'], speedMin: 40, speedMax: 180,
        sizeMin: 2, sizeMax: 5, lifeMin: 0.4, lifeMax: 0.9, grav: -120, drag: 1.4, kind: 'feather',
      });
      dealHit(summoner, target, { dmg: eff.dmg, hitstun: eff.hitstun || 16, kb: eff.kb || 90, sfx: 'light', x: target.x, y: target.y - 110 }, game);
      return;
    }

    /* 探险：索钩拖拽 —— 对手被拽到召援者面前 90px */
    if (eff.pull) {
      target.x = clamp(summoner.x + summoner.facing * 90, 40, CFG.STAGE_W - 40);
      target.y = CFG.GROUND_Y;
      FX.slashArc(summoner.x + summoner.facing * 50, summoner.y - 120, 120, -0.6, 0.6, '#c6ff7a', 6);
      dealHit(summoner, target, { dmg: eff.dmg, hitstun: eff.hitstun || 34, kb: eff.kb || 60, sfx: 'heavy', x: target.x, y: target.y - 110 }, game);
      return;
    }

    /* 法师：落星 —— 用实体管线：星体坠落，与受击盒重叠时自动结算（unblockable） */
    if (rec.def.id === 'mage') {
      const star = {
        x: target.x, y: target.y - 430, vx: 0, vy: 0, w: 130, h: 200,
        life: 1.2, age: 0, dmg: eff.dmg, hitstun: eff.hitstun || 34,
        kb: eff.kb || 260, lift: eff.lift || 380, pierce: 0, sfx: 'ko',
        single: true, rehit: 0, owner: summoner, dead: false,
        activeFrom: 0.3, glow: '#c9a2ff', kind: 'assistStar',
        unblockable: true, armorBreak: 0, hitSet: new Set(),
      };
      star.update = function (dt) {
        star.age += dt;
        star.vy = Math.min(star.vy + 2400 * dt, 1500);
        star.y += star.vy * dt;
        if (star.age > star.life || star.y > CFG.GROUND_Y - 30) star.dead = true;
        if (star.age % 0.06 < dt) {
          FX.burst(star.x, star.y - 40, 3, {
            colors: ['#c9a2ff', '#e0d8ff', '#ffffff'], speedMin: 20, speedMax: 90,
            sizeMin: 2, sizeMax: 4, lifeMin: 0.15, lifeMax: 0.35, grav: -40, drag: 2,
          });
        }
      };
      star.draw = function (ctx) {
        const t = clamp(star.age * 4, 0, 1);
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.translate(star.x, star.y);
        // 光核
        const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 46);
        g.addColorStop(0, 'rgba(255,255,255,0.95)');
        g.addColorStop(0.5, 'rgba(201,162,255,0.65)');
        g.addColorStop(1, 'rgba(201,162,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, 46, 0, Math.PI * 2); ctx.fill();
        // 四芒
        ctx.rotate(star.age * 6);
        ctx.strokeStyle = '#e0d8ff';
        ctx.lineWidth = 4;
        for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * 10, Math.sin(a) * 10);
          ctx.lineTo(Math.cos(a) * (34 + 10 * t), Math.sin(a) * (34 + 10 * t));
          ctx.stroke();
        }
        ctx.restore();
      };
      game.entities.push(star);
      FX.text(target.x, target.y - 260, '星陨术', '#b06bff', 26, true);
      return;
    }

    /* 黑道多段走 pending；肌霸等单发在这里直接结算 */
    if (!eff.times) {
      dealHit(summoner, target, {
        dmg: eff.dmg, hitstun: eff.hitstun || 26, kb: eff.kb || 200, lift: eff.lift || 0,
        unblockable: !!eff.unblockable, armorBreak: eff.armorBreak || 0,
        sfx: 'ko', x: target.x, y: target.y - 110,
      }, game);
    }
  }

  /* ===================== 绘制 ===================== */

  /** 菱形路径 */
  function diamond(ctx, cx, cy, r) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();
  }

  /** 世界坐标：援助卡式召唤（立绘菱形卡 + 光晕 + 入退场滑动） */
  Assist.draw = function (ctx, game, time) {
    const recs = game.assistRecords;
    if (!recs || !recs.length) return;
    for (let i = 0; i < recs.length; i++) {
      drawCard(ctx, recs[i], time);
    }
  };

  function drawCard(ctx, rec, time) {
    const def = rec.def;
    const img = Assist.images[def.id];

    // 相位 → 位置 / 透明度 / 缩放
    let px, py, alpha = 1, scale = 1;
    if (rec.phase === 'in') {
      const p = clamp(rec.t / IN_FRAMES, 0, 1);
      const e = 1 - Math.pow(1 - p, 3);   // easeOutCubic
      px = lerp(rec.sx, rec.x, e);
      py = lerp(rec.sy, rec.y, e);
      alpha = p;
      scale = 0.55 + 0.45 * e;
    } else if (rec.phase === 'act') {
      px = rec.x;
      py = rec.y + Math.sin(time * 3) * 6;
      scale = 1 + rec.flash * 0.22;
    } else {
      const p = clamp(rec.t / OUT_FRAMES, 0, 1);
      px = rec.x + rec.facing * 70 * p;
      py = rec.y - 130 * p;
      alpha = 1 - p;
      scale = 1 + 0.12 * p;
    }

    const R = 62;

    ctx.save();
    ctx.globalAlpha = alpha;

    // 地面光台
    ctx.globalAlpha = alpha * 0.22;
    ctx.fillStyle = def.palette.glow;
    ctx.beginPath();
    ctx.ellipse(px, CFG.GROUND_Y - 4, 58 * scale, 12 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = alpha;

    // 背景光晕
    const gr = ctx.createRadialGradient(px, py, 6, px, py, R * 2);
    gr.addColorStop(0, def.palette.glow);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha * (rec.phase === 'act' ? 0.4 : 0.26);
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(px, py, R * 2, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = alpha;

    // 菱形底框
    diamond(ctx, px, py, R * scale);
    ctx.fillStyle = 'rgba(8,10,18,0.92)';
    ctx.fill();

    // 立绘（裁进菱形）
    if (img && img.width) {
      ctx.save();
      diamond(ctx, px, py, R * scale);
      ctx.clip();
      const s = R * scale * 1.42;
      Art.drawCover(ctx, img, px - s / 2, py - s / 2, s, s, def.face[0], def.face[1], def.face[2] || 1);
      // 底部渐隐保证边框可读
      const sh = ctx.createLinearGradient(0, py, 0, py + R * scale);
      sh.addColorStop(0, 'rgba(0,0,0,0)');
      sh.addColorStop(1, 'rgba(0,0,0,0.7)');
      ctx.fillStyle = sh;
      diamond(ctx, px, py, R * scale);
      ctx.fill();
      ctx.restore();
    }

    // 菱形描边
    diamond(ctx, px, py, R * scale);
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 3;
    ctx.shadowColor = def.palette.glow;
    ctx.shadowBlur = 14;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // act 闪光
    if (rec.flash > 0) {
      diamond(ctx, px, py, R * scale);
      ctx.globalAlpha = alpha * rec.flash * 0.8;
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.globalAlpha = alpha;
    }

    // 名牌
    ctx.font = '900 15px ' + CFG.FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    const label = def.short + ' · 参上';
    ctx.strokeText(label, px, py + R * scale + 20);
    ctx.fillStyle = def.color;
    ctx.fillText(label, px, py + R * scale + 20);

    ctx.restore();
  }

  /** 冻结冰霜滤镜（画在角色之上，世界坐标） */
  Assist.drawFrost = function (ctx, f, time) {
    const pulse = 0.7 + Math.sin(time * 12) * 0.3;
    const x = f.x - 32;
    const y = f.y - 180;
    ctx.save();
    ctx.globalAlpha = 0.3 + 0.14 * pulse;
    ctx.fillStyle = '#8ac4ff';
    Art.roundRect(ctx, x, y, 64, 182, 10);
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#e2f4ff';
    ctx.lineWidth = 2;
    Art.roundRect(ctx, x, y, 64, 182, 10);
    ctx.stroke();
    // 顶部冰晶
    ctx.fillStyle = 'rgba(230,246,255,0.9)';
    for (let i = 0; i < 4; i++) {
      const sx = x + 10 + i * 14;
      const hh = 14 + ((i * 7) % 10);
      ctx.beginPath();
      ctx.moveTo(sx, y + 12 - hh * 0.4);
      ctx.lineTo(sx + 5, y + 22);
      ctx.lineTo(sx - 5, y + 22);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  };

  BVN.Assist = Assist;
})(window.BVN);

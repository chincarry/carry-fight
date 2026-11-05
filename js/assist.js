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
    if (def.id === 'prisoner') return 34;             // 铁链甩出→缠→拽→砸，需要完整演出
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

  /** 创建活动援助记录
   *  rec 在第三期"实心化"：x/y 改为脚底落点（y = GROUND_Y），并挂上绘制所需的
   *  pose / animTime / facing / build / palette / attackFrame。
   *  相位语义（in → act → out）与字段名一律保持不变，联机侧不读这些新增字段。 */
  Assist.spawn = function (side, def, game, remote) {
    if (!game.assistRecords) game.assistRecords = [];
    const f = game.fighters[side];
    const aa = BVN.AssistArt;
    const rec = {
      side: side,
      def: def,
      t: 0,
      phase: 'in',                       // in → act → out
      x: f.x + f.facing * 130,           // 停靠点（朝对手方向，落在召援者身前一步）
      y: CFG.GROUND_Y,                   // ★ 脚底落点（第三期：从"卡片中心"改为落地）
      sx: f.x - f.facing * 96,           // 入场起点（召援者身后地面）
      sy: CFG.GROUND_Y,
      facing: f.facing,
      remote: !!remote,                  // 客机重建的记录：只演出不结算
      flash: 0,
      done: false,
      pending: [],
      // ---- 以下为 T03 新增的绘制态（不改动上面任何既有字段的语义）----
      build: def.build || def.id,
      palette: def.palette,
      pose: aa ? aa.pose(def.build || def.id, 'in', 0, f.facing) : Object.assign({}, BVN.POSE_DEFAULT),
      animTime: 0,
      attackFrame: 0,
      aPhase: 'in',
      aK: 0,
      actor: null,                       // 绘制用的临时战斗对象（Art.drawFighter 的入参）
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
          FX.text(rec.x, rec.y - 210, '援助中断', '#9aa2b8', 20);
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
        rec.attackFrame = rec.t;
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
    if (eff.heal || eff.healRate) {
      // 回血量按 hpMax 比例结算（第三期血量 1000→2000：绝对值 heal 已失去意义）
      const healAmt = Math.round(eff.healRate ? summoner.hpMax * eff.healRate : eff.heal);
      summoner.hp = Math.min(summoner.hpMax, summoner.hp + healAmt);
      summoner.meter = Math.min(CFG.MAX_METER, summoner.meter + (eff.meter || 0));
      FX.text(summoner.x, summoner.y - 236, '+' + healAmt, '#8dffcf', 32, true);
      FX.burst(summoner.x, summoner.y - 110, 14, {
        colors: ['#8dffcf', '#e3d9a8', '#ffffff'], speedMin: 40, speedMax: 180,
        sizeMin: 2, sizeMax: 5, lifeMin: 0.4, lifeMax: 0.9, grav: -120, drag: 1.4, kind: 'feather',
      });
      dealHit(summoner, target, { dmg: eff.dmg, hitstun: eff.hitstun || 16, kb: eff.kb || 90, sfx: 'light', x: target.x, y: target.y - 110 }, game);
      return;
    }

    /* 囚徒：镣铐拖行 —— 铁链缠腿拽到面前再砸倒（击倒而非定身，接追打好用） */
    if (rec.def.id === 'prisoner') {
      target.x = clamp(summoner.x + summoner.facing * 86, 40, CFG.STAGE_W - 40);
      target.y = CFG.GROUND_Y;
      // 铁链视觉：三节链环 + 地面冲击环
      for (let k = 0; k < 3; k++) {
        FX.slashArc(summoner.x + summoner.facing * (46 + k * 34), summoner.y - 96, 96, -0.35, 0.35, '#9fd0ff', 5);
      }
      FX.ring(summoner.x + summoner.facing * 92, CFG.GROUND_Y - 26, 'rgba(159,208,255,0.9)', 130, 0.32);
      // 招式名已由援助卡名牌承担，这里不再叠字，避免与伤害数字挤在一起
      dealHit(summoner, target, {
        dmg: eff.dmg, hitstun: eff.hitstun || 46, kb: eff.kb || 140,
        lift: eff.lift || 480, armorBreak: eff.armorBreak || 1,
        sfx: 'ko', x: target.x, y: target.y - 110,
      }, game);
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

  function easeOutCubic(p) { return 1 - Math.pow(1 - p, 3); }

  /**
   * act 内部 strike 段的帧数。
   * ★ 伤害时点契约：strike 必须从 act 第 0 帧开始 —— 现有 fireAct / pending[at:0]
   *   都在 in→act 切换的同一帧触发，把蓄力放到 act 里会让伤害晚 10+ 帧。
   *   所以蓄力（windup）被前移到 in 段尾部，act 内只有 strike → recover。
   */
  function strikeFrames(def) {
    const len = actLen(def);
    const eff = def.effect;
    if (eff && eff.times) return Math.min(len, (eff.times - 1) * 10 + 6);   // 黑道三连：末段落地 + 缓冲
    if (def.id === 'mage') return Math.min(len, 26);                        // 星体坠落约 0.43s 后命中
    return Math.min(len, Math.max(9, Math.round(len * 0.42)));
  }

  /** 当前帧 → 姿势相位与相位进度 */
  function subPhase(rec) {
    if (rec.phase === 'in') return { phase: 'in', k: clamp(rec.t / IN_FRAMES, 0, 1) };
    if (rec.phase === 'out') return { phase: 'out', k: clamp(rec.t / OUT_FRAMES, 0, 1) };
    const len = actLen(rec.def);
    const sf = strikeFrames(rec.def);
    if (rec.t <= sf) return { phase: 'strike', k: clamp(rec.t / Math.max(1, sf), 0, 1) };
    return { phase: 'recover', k: clamp((rec.t - sf) / Math.max(1, len - sf), 0, 1) };
  }

  /** 菱形路径 */
  function diamond(ctx, cx, cy, r) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();
  }

  /** 世界坐标：援助实体（骨骼角色 + 地面光台 + 头顶名牌） */
  Assist.draw = function (ctx, game, time) {
    const recs = game.assistRecords;
    if (!recs || !recs.length) return;
    for (let i = 0; i < recs.length; i++) drawEntity(ctx, recs[i], time);
  };

  function drawEntity(ctx, rec, time) {
    const def = rec.def;
    const sp = subPhase(rec);

    // ---------- 位置 / 透明度 ----------
    let px;
    let py;
    let alpha = 1;
    let onGround = true;
    let lunge = 0;
    if (rec.phase === 'in') {
      const p = clamp(rec.t / IN_FRAMES, 0, 1);
      const e = easeOutCubic(p);
      px = lerp(rec.sx, rec.x, e);
      py = CFG.GROUND_Y - Math.sin(e * Math.PI) * 14;   // 一个很小的跨步弧线，落地更实
      alpha = clamp(p * 2.4, 0, 1);                     // 快速淡入（0.4 秒内到位）
    } else if (rec.phase === 'act') {
      lunge = sp.phase === 'strike'
        ? 26 * Math.min(1, sp.k * 1.5)
        : 26 * (1 - sp.k);
      px = rec.x + rec.facing * lunge;
      py = CFG.GROUND_Y;
    } else {
      const p = clamp(rec.t / OUT_FRAMES, 0, 1);
      px = rec.x + rec.facing * (26 - 150 * easeOutCubic(p));  // 后跃（朝召援者身后退场）
      py = CFG.GROUND_Y - 150 * p;
      alpha = 1 - p;
      onGround = p < 0.28;
    }

    // ---------- 姿势 ----------
    if (BVN.AssistArt) {
      BVN.AssistArt.pose(rec.build, sp.phase, sp.k, rec.facing, { out: rec.pose, frame: rec.t });
    }
    rec.aPhase = sp.phase;
    rec.aK = sp.k;
    rec.animTime += 1 / 60;

    // ---------- 绘制入参（Art.drawFighter 需要的最小战斗对象） ----------
    const actor = rec.actor || (rec.actor = {});
    actor.x = px;
    actor.y = py;
    actor.facing = rec.facing;
    actor.build = rec.build;
    actor.palette = rec.palette;
    actor.pose = rec.pose;
    actor.onGround = onGround;
    actor.alpha = alpha;
    actor.glow = 0;
    actor.state = 'idle';
    actor.hitFlash = 0;
    actor.aPhase = sp.phase;
    actor.aK = sp.k;
    actor.attackFrame = rec.attackFrame;

    // ---------- 地面光台（身份色，随相位呼吸） ----------
    const groundA = rec.phase === 'out' ? alpha : 1;
    ctx.save();
    ctx.globalAlpha = groundA * (0.12 + (rec.phase === 'act' ? 0.05 : 0) + Math.sin(time * 3) * 0.02);
    ctx.fillStyle = def.palette.glow;
    ctx.beginPath();
    ctx.ellipse(px, CFG.GROUND_Y - 3, 44, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = groundA * 0.1;
    for (let i = 0; i < 3; i++) {   // 三圈向外扩的细环（法阵感，不抢主体）
      const rr = 22 + i * 14 + ((time * 18) % 14);
      ctx.beginPath();
      ctx.ellipse(px, CFG.GROUND_Y - 3, rr, rr * 0.24, 0, 0, Math.PI * 2);
      ctx.strokeStyle = def.palette.glow;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    ctx.restore();

    // ---------- 接触阴影 + 角色本体 ----------
    if (rec.phase !== 'out' || onGround) Art.drawShadow(ctx, actor);
    Art.drawFighter(ctx, actor, time);

    // ---------- act 亮相闪光（保留二期的白闪手感，但只做"边缘一亮"，不能糊掉配色） ----------
    if (rec.flash > 0.02) {
      ctx.save();
      ctx.globalAlpha = rec.flash * 0.16;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(px, py - 78, 40, 74, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = rec.flash * 0.10;
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();
    }

    // ---------- 头顶名牌 ----------
    const nameAlpha = rec.phase === 'act'
      ? clamp(1 - rec.t / 26, 0, 1) * 0.9
      : (rec.phase === 'in' ? clamp((rec.t / IN_FRAMES - 0.25) * 3, 0, 1) : 0);
    if (nameAlpha > 0.02) {
      ctx.save();
      ctx.globalAlpha = nameAlpha;
      ctx.font = '900 16px ' + CFG.FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.82)';
      const label = def.short + ' · 参上';
      ctx.strokeText(label, px, py - 206);
      ctx.fillStyle = def.color;
      ctx.fillText(label, px, py - 206);
      ctx.restore();
    }

    // ---------- 入场亮相：菱形立绘（实体骨骼出现后淡出，绝不双身体） ----------
    if (rec.phase === 'in') {
      const p = clamp(rec.t / IN_FRAMES, 0, 1);
      const a = p < 0.42 ? 1 : clamp(1 - (p - 0.42) / 0.32, 0, 1);
      if (a > 0.02) drawPortrait(ctx, rec, px, py - 250, a, 0.6 + 0.12 * easeOutCubic(p));
    }
  }

  /** 入场亮相用的菱形立绘（身份卡，浮在头顶上方，不占身体位置） */
  function drawPortrait(ctx, rec, px, py, alpha, scale) {
    const def = rec.def;
    const img = Assist.images[def.id];
    const R = 52 * scale;
    ctx.save();
    ctx.globalAlpha = alpha * 0.9;
    // 底框
    diamond(ctx, px, py, R);
    ctx.fillStyle = 'rgba(8,10,18,0.94)';
    ctx.fill();
    // 立绘（裁进菱形）
    if (img && img.width) {
      ctx.save();
      diamond(ctx, px, py, R);
      ctx.clip();
      const s = R * 1.42;
      Art.drawCover(ctx, img, px - s / 2, py - s / 2, s, s, def.face[0], def.face[1], def.face[2] || 1);
      ctx.restore();
    }
    // 描边 + 光晕
    diamond(ctx, px, py, R);
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 2.6;
    ctx.shadowColor = def.palette.glow;
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;
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

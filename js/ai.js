/* js/ai.js — AI 控制器（三档难度：简单 / 普通 / 困难），按距离与血量决策 */
window.BVN = window.BVN || {};

(function (BVN) {
  'use strict';

  const CFG = BVN.CFG;

  const LEVELS = {
    easy: { react: 0.30, block: 0.12, skill: 0.14, ult: 0.18, aggr: 0.46, jump: 0.06, dash: 0.12 },
    normal: { react: 0.15, block: 0.42, skill: 0.46, ult: 0.55, aggr: 0.66, jump: 0.16, dash: 0.34 },
    hard: { react: 0.06, block: 0.82, skill: 0.86, ult: 0.9, aggr: 0.88, jump: 0.3, dash: 0.62 },
  };

  // 近战有效距离（角色中心距）。轻攻判定 ox=58/w=78 → 外缘 97px，
  // 重攻 ox=72/w=104 → 外缘 124px，加上对手受击盒半宽后约 121 / 148px。
  // 取 150 作为"必定能打到"的门槛，超过就绝不按攻击键（避免站着空挥）。
  const MELEE_REACH = 150;
  AI.MELEE_REACH = MELEE_REACH;

  /**
   * @param {Fighter} fighter 自己
   * @param {Fighter} opponent 对手
   * @param {string} level 'easy'|'normal'|'hard'
   */
  function AI(fighter, opponent, level) {
    this.f = fighter;
    this.o = opponent;
    this.level = level || 'normal';
    this.cfg = LEVELS[this.level] || LEVELS.normal;
    this.timer = 0;
    this.dangerTimer = 0;
    this.blockHold = 0;
    this.plan = null;
    this.planFrame = 0;
    this.comboWant = 0;
  }

  AI.prototype.clear = function () {
    const c = this.f.ctrl;
    c.left = false; c.right = false; c.up = false; c.down = false;
    c.light = false; c.heavy = false; c.skill = false; c.ult = false; c.dash = false;
  };

  AI.prototype.update = function (dt, game) {
    const f = this.f;
    const o = this.o;
    this.clear();
    if (!o || !game.canFight() || f.state === 'ko' || f.hp <= 0) return;

    const dist = Math.abs(o.x - f.x);
    const c = f.ctrl;

    // ---------- 防守反应（带反应延迟） ----------
    const oppThreat = (o.state === 'attack' && o.attackDef && dist < 250) || (game.entities.length > 0 && this.nearestThreat(game, f) < 300);
    if (this.blockHold > 0) {
      this.blockHold -= dt;
      if (f.onGround) {
        c.down = true;
        this.applyPlan(game, dist);
        return;
      }
    }
    if (oppThreat) {
      this.dangerTimer += dt;
      if (this.dangerTimer >= this.cfg.react) {
        this.dangerTimer = 0;
        if (Math.random() < this.cfg.block) {
          this.blockHold = 0.24 + Math.random() * 0.22;
          return;
        }
      }
    } else {
      this.dangerTimer = 0;
    }

    // ---------- 决策节奏 ----------
    this.timer -= dt;
    if (this.timer <= 0 || !this.plan) {
      this.timer = this.cfg.react * (0.75 + Math.random() * 0.9) + 0.1;
      this.decide(game, dist);
      this.planFrame = 0;
    }
    this.applyPlan(game, dist);
  };

  AI.prototype.nearestThreat = function (game, f) {
    let best = 9999;
    for (let i = 0; i < game.entities.length; i++) {
      const e = game.entities[i];
      if (!e.owner || e.owner === f || e.dmg <= 0) continue;
      const d = Math.abs(e.x - f.x);
      if (d < best) best = d;
    }
    return best;
  };

  AI.prototype.applyPlan = function (game, dist) {
    const f = this.f;
    const c = f.ctrl;
    const p = this.plan;
    if (!p) return;
    this.planFrame++;
    if (p.move === -1) c.left = true;
    if (p.move === 1) c.right = true;
    if (p.block) c.down = true;
    if (this.planFrame === 1) {
      if (p.attack === 'light') c.light = true;
      else if (p.attack === 'heavy') c.heavy = true;
      else if (p.attack === 'skill') c.skill = true;
      else if (p.attack === 'ult') c.ult = true;
      else if (p.attack === 'jump') c.up = true;
      else if (p.attack === 'dash') c.dash = true;
    }
    // 上挑：先起跳，上升后立刻按轻攻（起跳后 3~8 帧内输入才算上挑）
    if (p.attack === 'rise') {
      if (this.planFrame === 1) c.up = true;
      if (this.planFrame >= 4 && this.planFrame <= 9) c.light = true;
    }
    // 下落斩：等真的开始下落（vy>0）再按重攻，否则会被当成空中轻击
    if (p.attack === 'dive') {
      if (!f.onGround && f.vy > 0) c.heavy = true;
    }
    // 「跳入 → 下落斩」一体计划：先起跳，落下来再砸
    if (p.attack === 'jumpDive') {
      if (this.planFrame === 1 && f.onGround) c.up = true;
      if (!f.onGround && f.vy > 0) c.heavy = true;
    }
    // 连招：命中后继续按轻击
    if (p.attack === 'light' && f.state === 'attack' && f.attackKey && f.attackKey !== 'heavy') {
      if (this.planFrame > 3 && this.planFrame < 26 && Math.random() < 0.55) c.light = true;
    }
    if (p.dur && this.planFrame > p.dur) {
      this.plan = null;
      this.timer = 0;
    }
    if (dist < 70 && p.move !== 0 && Math.random() < 0.04) {
      // 贴身时轻微后撤避免重叠
    }
  };

  AI.prototype.decide = function (game, dist) {
    const f = this.f;
    const o = this.o;
    const dir = o.x >= f.x ? 1 : -1;
    const toward = dir > 0 ? 1 : -1;
    const away = -toward;
    const lowHp = f.hp < f.hpMax * 0.32;
    const meterFull = f.meter >= CFG.MAX_METER;
    const canSkill = f.meter >= f.def.skill.cost && f.skillCd <= 0;
    const r = Math.random();
    const aggr = Math.min(0.98, this.cfg.aggr + (lowHp ? 0.18 : 0));

    // 对手正在下落斩：格挡对不可防御的招式无效，改用上挑硬碰（上挑克下落）
    if (o.state === 'attack' && o.attackKey === 'dive' && dist < 260 && Math.random() < this.cfg.jump + 0.22) {
      this.plan = { move: 0, attack: 'rise', dur: 16 };
      return;
    }

    // 自己正在下落且距离够近：下落斩（高伤、不可防御）
    if (!f.onGround && f.vy > 0 && dist < 250 && Math.random() < 0.45 + this.cfg.aggr * 0.3) {
      this.plan = { move: toward, attack: 'dive', dur: 22 };
      return;
    }

    // 偶尔跳向对手，为下落斩创造空间
    if (f.onGround && dist > 190 && dist < 430 && Math.random() < this.cfg.jump * 0.55) {
      this.plan = { move: toward, attack: 'jump', dur: 10 };
      return;
    }

    // 跳入 → 下落斩（高伤、不可防御，逼对手不敢一直蹲防）
    if (f.onGround && dist < 320 && Math.random() < 0.16 + this.cfg.aggr * 0.18) {
      this.plan = { move: toward, attack: 'jumpDive', dur: 50 };
      return;
    }

    // 近身上挑（打飞后接追击）
    if (dist < 170 && Math.random() < 0.12 + this.cfg.aggr * 0.1) {
      this.plan = { move: 0, attack: 'rise', dur: 24 };
      return;
    }

    // 必杀
    if (meterFull && dist < 300 && Math.random() < this.cfg.ult) {
      this.plan = { move: 0, attack: 'ult', dur: 40 };
      return;
    }

    // 对手在空中且在上方：跳起上挑（把空中对手打下来）
    if (!o.onGround && o.y < f.y - 60 && dist < 220 && Math.random() < this.cfg.jump + 0.15) {
      this.plan = { move: toward, attack: 'rise', dur: 14 };
      return;
    }

    if (dist > 460) {
      // 远距离：远程技 or 接近
      const ranged = (f.id === 'ranger' || f.id === 'warlock' || f.id === 'hannya' || f.id === 'dancer');
      if (ranged && canSkill && Math.random() < this.cfg.skill) {
        this.plan = { move: 0, attack: 'skill', dur: 30 };
        return;
      }
      if (Math.random() < this.cfg.dash) {
        this.plan = { move: toward, attack: 'dash', dur: 14 };
        return;
      }
      this.plan = { move: toward, dur: 20 + Math.random() * 20 };
      return;
    }

    if (dist > 230) {
      if (Math.random() < this.cfg.dash) {
        this.plan = { move: toward, attack: 'dash', dur: 14 };
        return;
      }
      if (canSkill && r < this.cfg.skill) {
        this.plan = { move: 0, attack: 'skill', dur: 30 };
        return;
      }
      this.plan = { move: toward, dur: 14 + Math.random() * 12 };
      return;
    }

    // 近战射程判定：轻攻有效距离 ≈126px、重攻 ≈153px。
    // 155~230px 这一段仍在"近距离"分支内，但已经打不到人，
    // 若在这里直接出招就会站着空挥（QA 实测 33%~100% 的近战起手落空）。
    // 所以先看距离够不够，不够就贴近 / 放技 / 突进。
    const MELEE_REACH = AI.MELEE_REACH;
    if (dist > MELEE_REACH) {
      if (canSkill && r < 0.18 + this.cfg.skill * 0.45) {
        this.plan = { move: 0, attack: 'skill', dur: 30 };
        return;
      }
      if (r < 0.68 && this.cfg.dash > 0) {
        this.plan = { move: toward, attack: 'dash', dur: 14 };
        return;
      }
      // 剩余情况一律贴近（不附带 attack → 不会空挥）
      this.plan = { move: toward, dur: 10 };
      return;
    }

    // 近距离（已确认在近战射程内）
    if (r < 0.14 + aggr * 0.2) {
      this.plan = { move: 0, attack: 'light', dur: 26 };
      return;
    }
    if (r < 0.52) {
      this.plan = { move: 0, attack: 'heavy', dur: 30 };
      return;
    }
    if (canSkill && r < 0.52 + this.cfg.skill * 0.35) {
      this.plan = { move: 0, attack: 'skill', dur: 30 };
      return;
    }
    if (r < 0.9) {
      this.plan = { move: away, dur: 10 };
      return;
    }
    this.plan = { move: 0, block: true, dur: 16 };
  };

  BVN.AI = AI;
  BVN.AI_LEVELS = LEVELS;
})(window.BVN);

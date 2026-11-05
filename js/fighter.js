/* js/fighter.js — Fighter 类：状态机 / 物理 / 输入响应 / 受击硬直与击倒 / 判定盒 / 姿势驱动 */
window.BVN = window.BVN || {};

(function (BVN) {
  'use strict';

  const CFG = BVN.CFG;
  const FX = BVN.FX;
  let UID = 0;

  function clamp(v, a, b) {
    return v < a ? a : (v > b ? b : v);
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /* ===================== 构造函数 ===================== */

  /**
   * @param {Object} def 角色数据（BVN.ROSTER 中的一条）
   * @param {Object} opts {index, x, facing}
   */
  function Fighter(def, opts) {
    this.def = def;
    this.id = def.id;
    this.build = def.build;
    this.name = def.name;
    this.palette = def.palette;
    this.uid = ++UID;
    this.index = opts.index;
    this.hpMax = CFG.MAX_HP;
    this.trail = [];
    this._prev = {};
    this.ctrl = {
      left: false, right: false, up: false, down: false,
      light: false, heavy: false, skill: false, ult: false, dash: false,
    };
    this.pose = Object.assign({}, BVN.POSE_DEFAULT);
    this.reset(opts.x, opts.facing || 1);
  }

  Fighter.prototype.reset = function (x, facing) {
    this.x = x;
    this.y = CFG.GROUND_Y;
    this.vx = 0;
    this.vy = 0;
    this.facing = facing;
    this.hp = this.hpMax;
    this.meter = 0;
    this.state = 'idle';
    this.animTime = Math.random() * 3;
    this.onGround = true;
    this.airJumps = this.id === 'angel' ? 1 : 0;
    this.jumpsUsed = 0;
    this.hitFlash = 0;
    this.invuln = 0;
    this.frozen = 0;
    this.glow = 0;
    this.spin = 0;
    this.dashFrames = 0;
    this.dashCd = 0;
    this.skillCd = 0;
    this.attackKey = null;
    this.attackDef = null;
    this.attackFrame = 0;
    this.hitReg = {};
    this.onTick = null;
    this.script = null;
    this.hitstunTimer = 0;
    this.knockTimer = 0;
    this.launched = false;
    this.bounced = false;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.guardStartFrame = -999;
    this.crouchGuard = false;
    this.guarding = false;
    this.bufLight = 0;
    this.bufHeavy = 0;
    this.bufSkill = 0;
    this.bufUlt = 0;
    this.trail.length = 0;
    this.pose = Object.assign({}, BVN.POSE_DEFAULT);
    this._prev = {};
    this.ctrl = {
      left: false, right: false, up: false, down: false,
      light: false, heavy: false, skill: false, ult: false, dash: false,
    };
  };

  /* ===================== 判定盒 ===================== */

  Fighter.prototype.hurtbox = function () {
    const crouch = this.crouchGuard || this.state === 'knockdown' || (this.state === 'attack' && this.attackKey === 'skill' && this.id === 'dancer');
    const h = crouch ? CFG.CROUCH_H : CFG.BODY_H;
    return { x: this.x - 29, y: this.y - h, w: 58, h: h };
  };

  /** 返回当前生效且尚未命中的攻击窗口。 */
  Fighter.prototype.activeWindows = function () {
    const out = [];
    if (this.state !== 'attack' || !this.attackDef) return out;
    const ws = this.attackDef.windows;
    if (!ws) return out;
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i];
      if (this.attackFrame >= w.s && this.attackFrame <= w.e && !this.hitReg[i]) {
        out.push({ w: w, i: i });
      }
    }
    return out;
  };

  Fighter.prototype.windowRect = function (w) {
    const cx = this.x + this.facing * w.ox;
    const cy = this.y + w.oy;
    return { x: cx - w.w / 2, y: cy - w.h / 2, w: w.w, h: w.h };
  };

  /* ===================== 主更新 ===================== */

  Fighter.prototype.update = function (dt, game) {
    if (this.frozen > 0) {
      this.frozen--;
      this.updatePose(dt, 0.5);
      return;
    }

    this.animTime += dt;
    if (this.hitFlash > 0) this.hitFlash--;
    if (this.invuln > 0) this.invuln--;
    if (this.dashCd > 0) this.dashCd--;
    if (this.skillCd > 0) this.skillCd--;
    if (this.glow > 0) this.glow = Math.max(0, this.glow - dt);
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.comboCount = 0;
    }
    if (this.state !== 'ko' && this.state !== 'knockdown') {
      const mult = this.id === 'warlock' ? 1.5 : 1;
      this.meter = Math.min(CFG.MAX_METER, this.meter + CFG.METER_REGEN * mult * dt);
    }

    // 残影衰减
    for (let i = this.trail.length - 1; i >= 0; i--) {
      this.trail[i].life -= dt;
      if (this.trail[i].life <= 0) this.trail.splice(i, 1);
    }

    const c = this.ctrl;
    const prev = this._prev;
    const press = function (k) { return !!c[k] && !prev[k]; };

    // 输入缓冲（10 帧）：出招中按下但当前还不能取消的键会被记住，
    // 避免"轻击第 2 帧按技能键、等可以取消时边沿已被消耗"导致技能永远放不出。
    if (press('light')) this.bufLight = 10;
    if (press('heavy')) this.bufHeavy = 10;
    if (press('skill')) this.bufSkill = 10;
    if (press('ult')) this.bufUlt = 10;

    if (this.state === 'ko') {
      this.updateKO(dt, game);
    } else if (this.state === 'attack') {
      this.updateAttack(dt, game, press);
    } else if (this.state === 'dash') {
      this.updateDash(dt, game);
    } else if (this.state === 'hitstun') {
      this.updateHitstun(dt, game);
    } else if (this.state === 'knockdown') {
      this.updateKnockdown(dt, game);
    } else {
      this.updateFree(dt, game, press);
    }

    this.physics(dt, game);
    this.updatePose(dt, this.state === 'attack' ? 0.42 : 0.26);

    if (this.bufLight > 0) this.bufLight--;
    if (this.bufHeavy > 0) this.bufHeavy--;
    if (this.bufSkill > 0) this.bufSkill--;
    if (this.bufUlt > 0) this.bufUlt--;

    this._prev = {
      left: c.left, right: c.right, up: c.up, down: c.down,
      light: c.light, heavy: c.heavy, skill: c.skill, ult: c.ult, dash: c.dash,
    };
  };

  /* ---------- 可自由行动（地面 / 空中） ---------- */
  Fighter.prototype.updateFree = function (dt, game, press) {
    const c = this.ctrl;
    const opp = game.opponentOf(this);
    if (opp) this.facing = opp.x >= this.x ? 1 : -1;

    const backKey = this.facing > 0 ? c.left : c.right;
    const fwdKey = this.facing > 0 ? c.right : c.left;

    // 立即行动（同时清空对应缓冲，避免同一次按键在后续帧重复触发）
    if (press('ult') && this.meter >= CFG.MAX_METER && this.skillCd <= 0) {
      this.bufUlt = 0;
      this.startSkill(game, 'ult');
      return;
    }
    if (press('skill') && this.meter >= this.def.skill.cost && this.skillCd <= 0) {
      this.bufSkill = 0;
      this.startSkill(game, 'skill');
      return;
    }
    if (press('light')) {
      this.bufLight = 0;
      this.startAttack(this.onGround ? 'light1' : 'airLight', game);
      return;
    }
    if (press('heavy')) {
      this.bufHeavy = 0;
      this.startAttack(this.onGround ? 'heavy' : 'airLight', game);
      return;
    }
    if (press('dash') && this.dashCd <= 0 && this.onGround) { this.startDash(game); return; }
    if (press('up') && (this.onGround || this.airJumps > 0)) { this.jump(game); return; }

    if (this.onGround) {
      const wantGuard = c.down || backKey;
      if (wantGuard) {
        // 首次进入防御时记录帧号（完美格挡判定用）
        if (!this.guarding) this.guardStartFrame = game.frame;
        this.guarding = true;
        this.crouchGuard = !!c.down;
        if (c.down) {
          // 下蹲防御：原地不动
          this.state = 'guard';
          this.vx = 0;
        } else {
          // 按住后方向：边后退边可防御（BvN 手感）
          this.state = 'walk';
          this.vx = -this.facing * CFG.BACK_SPEED * this.def.stats.speed;
        }
      } else {
        this.guarding = false;
        this.crouchGuard = false;
        if (fwdKey) {
          this.state = 'walk';
          this.vx = this.facing * CFG.WALK_SPEED * this.def.stats.speed;
        } else if (c.left || c.right) {
          this.state = 'walk';
          this.vx = (c.left ? -1 : 1) * CFG.BACK_SPEED * this.def.stats.speed;
        } else {
          this.state = 'idle';
        }
      }
    } else {
      this.guarding = false;
      this.state = this.vy < 0 ? 'jump' : 'fall';
      const air = (c.left ? -1 : 0) + (c.right ? 1 : 0);
      if (air !== 0) this.vx += air * 900 * dt;
      this.vx = clamp(this.vx, -CFG.WALK_SPEED * 1.35, CFG.WALK_SPEED * 1.35);
    }
  };

  /* ---------- 攻击 ---------- */
  Fighter.prototype.startAttack = function (key, game) {
    const def = BVN.ATTACKS[key];
    if (!def) return;
    this.state = 'attack';
    this.attackKey = key;
    this.attackDef = def;
    this.attackFrame = 0;
    this.hitReg = {};
    this.script = null;
    this.onTick = null;
    this.crouchGuard = false;
    this.guarding = false;
    if (this.onGround) this.vx *= 0.25;
    BVN.Sfx.play('light');
  };

  Fighter.prototype.startSkill = function (game, kind) {
    const cost = kind === 'skill' ? this.def.skill.cost : this.def.ultimate.cost;
    if (this.meter < cost) return;
    this.meter -= cost;
    this.skillCd = kind === 'skill' ? Math.round(this.def.skill.cd * 60) : 30;
    BVN.Skills.use(this, game, kind);
    if (kind === 'skill') BVN.Sfx.play('uiPick');
    game.onSkill(this, kind);
  };

  Fighter.prototype.updateAttack = function (dt, game, press) {
    const def = this.attackDef;
    if (!def) {
      this.state = this.onGround ? 'idle' : 'fall';
      return;
    }
    this.attackFrame++;

    // 脚本事件（技能用）
    if (this.script) {
      for (let i = 0; i < this.script.length; i++) {
        const ev = this.script[i];
        if (ev.f === this.attackFrame && !ev.done) {
          ev.done = true;
          ev.fn(this, game);
        }
      }
    }
    // 逐帧钩子（技能的持续位移/追踪）
    if (this.onTick) this.onTick(this, game);

    // 连招链 / 取消：使用输入缓冲，出招中提前按下的键在窗口开启时仍会生效
    const ws = def.windows;
    const lastEnd = ws && ws.length ? ws[ws.length - 1].e : 0;
    if (this.attackFrame >= lastEnd + 2) {
      if (def.next && this.bufLight > 0) {
        this.bufLight = 0;
        this.startAttack(def.next, game);
        return;
      }
      if ((this.attackKey === 'light1' || this.attackKey === 'light2') && this.bufHeavy > 0) {
        this.bufHeavy = 0;
        this.startAttack('heavy', game);
        return;
      }
      if (this.onGround && this.attackKey !== 'skill' && this.attackKey !== 'ult') {
        if (this.bufUlt > 0 && this.meter >= CFG.MAX_METER && this.skillCd <= 0) {
          this.bufUlt = 0;
          this.startSkill(game, 'ult');
          return;
        }
        if (this.bufSkill > 0 && this.meter >= this.def.skill.cost && this.skillCd <= 0) {
          this.bufSkill = 0;
          this.startSkill(game, 'skill');
          return;
        }
      }
    }

    if (this.attackFrame >= def.total) {
      this.state = this.onGround ? 'idle' : 'fall';
      this.attackKey = null;
      this.attackDef = null;
      this.script = null;
      this.onTick = null;
      this.hitReg = {};
    }
  };

  /* ---------- 冲刺 ---------- */
  Fighter.prototype.startDash = function (game) {
    const c = this.ctrl;
    const dir = c.left ? -1 : (c.right ? 1 : this.facing);
    this.state = 'dash';
    this.dashFrames = CFG.DASH_FRAMES;
    this.dashCd = CFG.DASH_COOLDOWN;
    this.facing = dir;
    this.vx = dir * CFG.DASH_SPEED * this.def.stats.speed;
    this.invuln = Math.max(this.invuln, this.id === 'dancer' ? 20 : 10);
    this.crouchGuard = false;
    this.guarding = false;
    BVN.Sfx.play('dash');
    FX.burst(this.x, this.y - 10, 6, {
      colors: ['#ffffff', '#c8d8ff'], speedMin: 40, speedMax: 180,
      sizeMin: 2, sizeMax: 4, lifeMin: 0.15, lifeMax: 0.35, grav: -40, drag: 3, angle: Math.PI, spread: 0.5,
    });
  };

  Fighter.prototype.updateDash = function (dt, game) {
    this.dashFrames--;
    this.vx *= 1 - 2.6 * dt;
    if (this.dashFrames % 3 === 0) this.pushTrail(0.34);
    if (this.dashFrames <= 0) {
      this.state = 'idle';
      this.vx *= 0.4;
    }
  };

  Fighter.prototype.pushTrail = function (life) {
    this.trail.push({
      x: this.x,
      y: this.y,
      facing: this.facing,
      pose: Object.assign({}, this.pose),
      build: this.build,
      palette: this.palette,
      onGround: this.onGround,
      animTime: this.animTime,
      state: this.state,
      attackKey: this.attackKey,
      attackFrame: this.attackFrame,
      hitFlash: 0,
      glow: this.glow,
      alpha: 0.42,
      life: life || 0.3,
      maxLife: life || 0.3,
    });
  };

  /* ---------- 跳跃 ---------- */
  Fighter.prototype.jump = function (game) {
    if (this.onGround) {
      this.vy = CFG.JUMP_VY * this.def.stats.jump;
      this.onGround = false;
      this.state = 'jump';
      this.crouchGuard = false;
      BVN.Sfx.play('jump');
      FX.burst(this.x, this.y - 6, 7, {
        colors: ['#ffffff', '#aab6d0'], speedMin: 30, speedMax: 140,
        sizeMin: 2, sizeMax: 5, lifeMin: 0.2, lifeMax: 0.45, grav: 60, drag: 2.4,
      });
    } else if (this.airJumps > 0) {
      this.airJumps--;
      this.vy = CFG.JUMP_VY * 0.82;
      this.state = 'jump';
      this.invuln = Math.max(this.invuln, 6);
      BVN.Sfx.play('jump');
      FX.ring(this.x, this.y - 40, '#ffe9b0', 90, 0.35);
      FX.burst(this.x, this.y - 60, 12, {
        colors: ['#ffffff', '#ffe9b0', '#ffb347'], speedMin: 60, speedMax: 260,
        sizeMin: 2, sizeMax: 6, lifeMin: 0.3, lifeMax: 0.7, grav: 260, drag: 1.8, kind: 'feather',
      });
    }
  };

  /* ---------- 受击硬直 ---------- */
  Fighter.prototype.updateHitstun = function (dt, game) {
    this.hitstunTimer--;
    this.vx *= 1 - 3.2 * dt;
    if (this.hitstunTimer <= 0 && this.onGround) {
      this.state = 'idle';
      this.vx = 0;
    }
  };

  /* ---------- 击倒 ---------- */
  Fighter.prototype.updateKnockdown = function (dt, game) {
    this.knockTimer--;
    this.vx *= 1 - 4.5 * dt;
    if (this.knockTimer <= 0) {
      this.state = 'idle';
      this.invuln = Math.max(this.invuln, 22);
      this.vx = 0;
      this.bounced = false;
    }
  };

  /* ---------- KO ---------- */
  Fighter.prototype.updateKO = function (dt, game) {
    this.vx *= 1 - 3 * dt;
    this.hitstunTimer = 0;
  };

  /* ===================== 物理 ===================== */

  Fighter.prototype.physics = function (dt, game) {
    if (!this.onGround) this.vy += CFG.GRAVITY * dt;

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    const half = 36;
    if (this.x < half) { this.x = half; if (this.vx < 0) this.vx = 0; }
    if (this.x > CFG.STAGE_W - half) { this.x = CFG.STAGE_W - half; if (this.vx > 0) this.vx = 0; }

    if (this.y >= CFG.GROUND_Y) {
      this.y = CFG.GROUND_Y;
      if (!this.onGround) {
        const impact = this.vy;
        this.onGround = true;
        this.vy = 0;
        this.airJumps = this.id === 'angel' ? 1 : 0;

        if (this.launched) {
          this.launched = false;
          if (!this.bounced && impact > 220 && this.hp > 0) {
            this.bounced = true;
            this.vy = -340;
            this.onGround = false;
            FX.ring(this.x, CFG.GROUND_Y, 'rgba(255,255,255,0.7)', 130, 0.35);
            FX.burst(this.x, CFG.GROUND_Y - 8, 12, {
              colors: ['#ffffff', '#c8d8ff'], speedMin: 60, speedMax: 240,
              sizeMin: 2, sizeMax: 5, lifeMin: 0.2, lifeMax: 0.5, grav: 380, drag: 2,
            });
            BVN.Sfx.play('land');
            game.shake(7, 8);
            return;
          }
          if (this.state !== 'ko') {
            this.state = 'knockdown';
            this.knockTimer = 40;
            this.bounced = false;
            FX.burst(this.x, CFG.GROUND_Y - 8, 16, {
              colors: ['#ffffff', '#aab6d0'], speedMin: 60, speedMax: 260,
              sizeMin: 2, sizeMax: 6, lifeMin: 0.25, lifeMax: 0.6, grav: 260, drag: 2,
            });
            BVN.Sfx.play('land');
            game.shake(6, 8);
            return;
          }
        }
        if (this.state === 'jump' || this.state === 'fall') {
          this.state = 'idle';
          FX.burst(this.x, this.y - 6, 6, {
            colors: ['#ffffff', '#aab6d0'], speedMin: 30, speedMax: 120,
            sizeMin: 2, sizeMax: 4, lifeMin: 0.15, lifeMax: 0.35, grav: 80, drag: 2.4,
          });
          BVN.Sfx.play('land');
        }
      }
      if (this.state === 'idle' || this.state === 'walk' || this.state === 'guard' || this.state === 'attack') {
        this.vx *= 1 - Math.min(1, 13 * dt);
      }
    } else {
      this.onGround = false;
    }
  };

  /* ===================== 受击处理 ===================== */

  /**
   * @param {Fighter} attacker
   * @param {Object} hit {dmg, hitstun, kb, lift, sfx, pierce}
   * @param {Object} game
   * @returns {boolean} 是否命中（含格挡）
   */
  Fighter.prototype.receiveHit = function (attacker, hit, game) {
    // 只有「战斗进行中」才结算伤害：防止回合已经结束、场上残留的诅咒/火海继续扣血
    if (!game.canFight()) return false;
    if (this.state === 'ko' || this.hp <= 0) return false;
    if (this.invuln > 0) return false;
    if (this.frozen > 0) return false;

    // 背面攻击不吃格挡：面朝方向在 update() 里会朝对手刷新，但瞬移穿身（浪人居合）、
    // 跳跃绕背、被击飞越顶的当帧仍可能背对攻击者，那时格挡不生效。
    const facingAttacker = (attacker.x - this.x) * this.facing >= 0;
    const guarding = (this.guarding || this.state === 'guard') && facingAttacker && this.onGround;
    const mult = attacker && attacker.outDamage ? attacker.outDamage(this) : 1;
    const rawDmg = hit.dmg * mult;

    if (guarding) {
      const perfect = (game.frame - this.guardStartFrame) <= CFG.PERFECT_GUARD_FRAMES;
      // 格挡减伤 80%（只吃 20%）；pierce 表示「穿透格挡的比例」：
      //   pierce=0   → 0.2 + 0    = 20%（标准格挡，吃 1/5）
      //   pierce=0.5 → 0.2 + 0.4  = 60%（穿透一半，与 data.js 文案一致）
      //   pierce=1   → 0.2 + 0.8  = 100%（完全无视格挡）
      const dmg = rawDmg * (0.2 + (hit.pierce || 0) * 0.8);
      this.hp = Math.max(0, this.hp - dmg);
      this.meter = Math.min(CFG.MAX_METER, this.meter + (perfect ? 15 : 5));
      this.vx = -this.facing * 120;
      if (perfect) {
        FX.text(this.x, this.y - 210, 'PERFECT GUARD', '#a8dcff', 24);
        if (this.id === 'ronin') this.invuln = Math.max(this.invuln, 20);
        BVN.Sfx.play('perfect');
      } else {
        BVN.Sfx.play('block');
      }
      game.onBlock(this, attacker, hit, perfect);
      if (this.hp <= 0) this.knockOut(game, attacker);
      return true;
    }

    // 正常命中
    this.hp = Math.max(0, this.hp - rawDmg);
    if (this.id === 'dragon') {
      this.meter = Math.min(CFG.MAX_METER, this.meter + rawDmg * 0.3);
    }
    this.hitFlash = 3;
    // 自己挨打 → 自己的连段中断（连击数挂在攻击方身上，见 Game.onHpHit）
    this.comboCount = 0;
    this.comboTimer = 0;
    this.skillCd = Math.max(this.skillCd, 0);
    this.crouchGuard = false;
    this.guarding = false;
    this.attackDef = null;
    this.attackKey = null;
    this.script = null;
    this.onTick = null;

    if (this.hp <= 0) {
      this.knockOut(game, attacker);
    } else {
      this.state = 'hitstun';
      this.hitstunTimer = hit.hitstun || 14;
    }

    const dir = this.x >= attacker.x ? 1 : -1;
    this.vx = dir * (hit.kb || 80);
    if (hit.lift) {
      this.vy = -hit.lift;
      this.onGround = false;
      this.launched = true;
      this.bounced = false;
    }
    game.onHpHit(this, attacker, hit, rawDmg);
    return true;
  };

  Fighter.prototype.knockOut = function (game, attacker) {
    this.hp = 0;
    this.state = 'ko';
    this.hitstunTimer = 0;
    this.launched = false;
    this.vy = -520;
    this.vx = (this.x >= attacker.x ? 1 : -1) * 260;
    this.onGround = false;
    this.glow = 0;
    game.onKO(this, attacker);
  };

  /** 攻击方的伤害倍率（被动）。 */
  Fighter.prototype.outDamage = function (target) {
    let m = 1;
    if (this.id === 'hannya' && this.hp < this.hpMax * 0.3) m *= 1.25;
    if (this.id === 'ranger' && Math.abs(this.x - target.x) > 500) m *= 1.15;
    return m;
  };

  /* ===================== 姿势 ===================== */

  Fighter.prototype.updatePose = function (dt, rate) {
    const target = this.poseTarget();
    const k = rate == null ? 0.26 : rate;
    const p = this.pose;
    for (const key in target) {
      if (Object.prototype.hasOwnProperty.call(target, key)) {
        if (p[key] == null) p[key] = target[key];
        else p[key] = lerp(p[key], target[key], k);
      }
    }
  };

  Fighter.prototype.poseTarget = function () {
    const P = Object.assign({}, BVN.POSE_DEFAULT);
    const t = this.animTime;
    const st = this.state;

    if (st === 'ko' || st === 'knockdown') {
      P.rot = -1.28;
      P.c = 26;
      P.t = 0.1;
      P.h = 0.22;
      P.afu = 1.7;
      P.aff = 0.35;
      P.abu = -1.5;
      P.abf = 0.3;
      P.lft = 0.55;
      P.lfs = -1.0;
      P.lbt = -0.15;
      P.lbs = -0.75;
      return P;
    }
    P.rot = 0;

    if (st === 'hitstun') {
      P.t = -0.34;
      P.h = -0.24;
      P.afu = 1.85;
      P.aff = 0.2;
      P.abu = -1.8;
      P.abf = 0.25;
      P.lft = -0.3;
      P.lfs = -0.18;
      P.lbt = 0.42;
      P.lbs = -0.3;
      P.c = 8;
      return P;
    }

    if (st === 'dash') {
      P.t = 0.5;
      P.c = 16;
      P.lft = 0.95;
      P.lfs = -0.5;
      P.lbt = -0.75;
      P.lbs = -0.55;
      P.afu = -0.9;
      P.aff = 0.5;
      P.abu = -1.2;
      P.abf = 0.4;
      return P;
    }

    if (st === 'jump') {
      P.c = 12;
      P.t = 0.16;
      P.lft = 0.85;
      P.lfs = -1.0;
      P.lbt = 0.25;
      P.lbs = -0.9;
      P.afu = 1.5;
      P.aff = 0.5;
      P.abu = -1.0;
      P.abf = 0.7;
      return P;
    }

    if (st === 'fall') {
      P.c = 8;
      P.t = -0.04;
      P.lft = 0.5;
      P.lfs = -0.42;
      P.lbt = -0.35;
      P.lbs = -0.3;
      P.afu = 1.9;
      P.aff = 0.3;
      P.abu = -1.6;
      P.abf = 0.4;
      return P;
    }

    if (st === 'guard') {
      P.c = this.crouchGuard ? 22 : 14;
      P.t = -0.06;
      P.afu = 1.05;
      P.aff = 1.5;
      P.abu = 0.85;
      P.abf = 1.55;
      P.lft = 0.34;
      P.lfs = -0.48;
      P.lbt = -0.28;
      P.lbs = -0.4;
      return P;
    }

    if (st === 'walk') {
      const s = Math.sin(t * 11);
      P.t = 0.12;
      P.c = 8;
      P.lft = 0.52 * s;
      P.lfs = -0.34 - 0.22 * Math.max(0, -s);
      P.lbt = -0.52 * s;
      P.lbs = -0.3;
      P.afu = 0.42 - s * 0.4;
      P.aff = 0.9;
      P.abu = -0.2 + s * 0.36;
      P.abf = 0.6;
      return P;
    }

    if (st === 'attack') {
      return this.attackPose(P);
    }

    // idle 呼吸
    const br = Math.sin(t * 2.4);
    P.t = 0.06 + br * 0.018;
    P.c = 7 + br * 1.6;
    P.afu = 0.5 + br * 0.05;
    P.aff = 0.85;
    P.abu = -0.3;
    P.abf = 0.6;
    P.lft = 0.22;
    P.lfs = -0.2;
    P.lbt = -0.2;
    P.lbs = -0.16;
    P.h = -0.04 + br * 0.02;
    return P;
  };

  Fighter.prototype.attackPose = function (P) {
    const key = this.attackKey;
    const def = this.attackDef;
    const total = def ? def.total : 30;
    const p = clamp(this.attackFrame / total, 0, 1);
    const f = this.attackFrame;

    if (this.spin > 0) {
      P.hipx = Math.sin(f * 0.55) * 8;
    }

    switch (key) {
      case 'light1':
      case 'light2': {
        const ext = p < 0.2 ? -0.55 : (p < 0.45 ? 1.55 : 0.8);
        P.afu = ext;
        P.aff = p < 0.45 ? 0.05 : 0.7;
        P.t = p < 0.45 ? 0.2 : 0.1;
        P.abu = -0.55;
        P.abf = 1.15;
        P.c = 9;
        P.lft = 0.3;
        P.lfs = -0.26;
        P.lbt = -0.3;
        P.lbs = -0.22;
        break;
      }
      case 'light3': {
        P.afu = p < 0.3 ? -0.9 : 2.15;
        P.aff = p < 0.3 ? 1.2 : 0.12;
        P.t = p < 0.3 ? -0.2 : 0.34;
        P.abu = 0.6;
        P.abf = 0.9;
        P.c = 11;
        P.lft = 0.34;
        P.lfs = -0.3;
        P.lbt = -0.36;
        P.lbs = -0.24;
        break;
      }
      case 'heavy': {
        P.afu = p < 0.32 ? -1.15 : (p < 0.58 ? 2.1 : 1.0);
        P.aff = p < 0.32 ? 1.45 : 0.14;
        P.t = p < 0.32 ? -0.3 : 0.32;
        P.c = p < 0.32 ? 14 : 8;
        P.abu = p < 0.32 ? -1.3 : 0.5;
        P.abf = 0.9;
        P.lft = p < 0.32 ? 0.1 : 0.42;
        P.lfs = -0.3;
        P.lbt = -0.34;
        P.lbs = -0.26;
        break;
      }
      case 'airLight': {
        P.afu = 1.35;
        P.aff = 0.15;
        P.t = 0.3;
        P.abu = -0.9;
        P.abf = 0.8;
        P.c = 12;
        P.lft = 0.95;
        P.lfs = -0.95;
        P.lbt = 0.2;
        P.lbs = -0.85;
        break;
      }
      case 'skill': {
        this.skillPose(P, p, f);
        break;
      }
      case 'ult': {
        this.ultPose(P, p, f);
        break;
      }
      default:
        break;
    }
    return P;
  };

  Fighter.prototype.skillPose = function (P, p, f) {
    switch (this.id) {
      case 'hannya':
        P.afu = 1.45;
        P.aff = 0.16;
        P.abu = 1.2;
        P.abf = 0.3;
        P.t = 0.24;
        P.c = 10;
        break;
      case 'angel':
        P.afu = 2.55;
        P.aff = 0.22;
        P.abu = 2.35;
        P.abf = 0.3;
        P.t = -0.08;
        P.c = 10;
        break;
      case 'boxer': {
        const alt = Math.floor(f / 5) % 2;
        P.afu = alt ? 1.6 : 0.9;
        P.aff = alt ? 0.06 : 1.1;
        P.abu = alt ? 0.9 : 1.6;
        P.abf = alt ? 1.1 : 0.06;
        P.t = 0.26;
        P.c = 10;
        P.lft = 0.4;
        P.lfs = -0.3;
        P.lbt = -0.4;
        P.lbs = -0.26;
        break;
      }
      case 'dancer':
        P.hipx = Math.sin(f * 0.55) * 9;
        P.afu = 1.7;
        P.aff = 0.2;
        P.abu = -1.7;
        P.abf = 0.2;
        P.t = 0.05;
        P.c = 12;
        break;
      case 'dragon':
        P.t = 0.36;
        P.c = 12;
        P.afu = 1.15;
        P.aff = 0.15;
        P.abu = 0.95;
        P.abf = 0.2;
        P.h = -0.22;
        P.lft = 0.34;
        P.lfs = -0.3;
        P.lbt = -0.36;
        P.lbs = -0.26;
        break;
      case 'warlock':
        P.afu = 1.5;
        P.aff = 0.2;
        P.abu = 1.25;
        P.abf = 0.35;
        P.t = 0.12;
        P.c = 9;
        break;
      case 'ranger':
        P.afu = 1.5;
        P.aff = 0.08;
        P.abu = 1.35;
        P.abf = -1.5;
        P.t = -0.05;
        P.c = 9;
        break;
      case 'ronin': {
        const swung = f >= 12;
        P.afu = swung ? 1.6 : 0.25;
        P.aff = swung ? 0.15 : -1.5;
        P.abu = swung ? 1.1 : -0.4;
        P.abf = 0.9;
        P.t = swung ? 0.3 : -0.15;
        P.c = 10;
        break;
      }
      default:
        break;
    }
  };

  Fighter.prototype.ultPose = function (P, p, f) {
    switch (this.id) {
      case 'hannya':
        P.afu = 2.3;
        P.aff = 0.2;
        P.abu = 2.1;
        P.abf = 0.25;
        P.t = -0.12;
        P.h = -0.2;
        P.c = 6;
        break;
      case 'angel':
        if (f < 34) {
          P.t = 0.1;
          P.afu = 2.6;
          P.aff = 0.2;
          P.abu = 2.4;
          P.abf = 0.2;
          P.lft = 0.7;
          P.lfs = -0.8;
          P.lbt = 0.5;
          P.lbs = -0.7;
          P.c = 4;
        } else {
          P.t = 1.0;
          P.afu = -1.4;
          P.aff = 0.2;
          P.abu = -1.5;
          P.abf = 0.2;
          P.lft = -0.6;
          P.lfs = -0.1;
          P.lbt = -0.8;
          P.lbs = -0.1;
          P.c = 2;
        }
        break;
      case 'boxer':
        if (f < 38) {
          P.afu = -1.5;
          P.aff = 1.6;
          P.abu = -1.4;
          P.abf = 1.5;
          P.t = -0.28;
          P.c = 18;
          P.lft = 0.4;
          P.lfs = -0.5;
          P.lbt = -0.4;
          P.lbs = -0.4;
        } else {
          P.afu = 1.6;
          P.aff = 0.04;
          P.abu = -0.9;
          P.abf = 1.2;
          P.t = 0.42;
          P.c = 8;
          P.lft = 0.5;
          P.lfs = -0.3;
          P.lbt = -0.5;
          P.lbs = -0.26;
        }
        break;
      case 'dancer':
        P.hipx = Math.sin(f * 0.5) * 10;
        P.afu = 2.6;
        P.aff = 0.2;
        P.abu = 2.4;
        P.abf = 0.25;
        P.t = -0.16;
        P.c = 4;
        break;
      case 'dragon':
        P.t = -0.14;
        P.h = -0.3;
        P.afu = 2.5;
        P.aff = 0.3;
        P.abu = 2.3;
        P.abf = 0.35;
        P.c = 6;
        break;
      case 'warlock':
        P.afu = 2.7;
        P.aff = 0.15;
        P.abu = 2.5;
        P.abf = 0.2;
        P.t = -0.2;
        P.c = 8;
        break;
      case 'ranger':
        P.afu = 2.5;
        P.aff = 0.1;
        P.abu = 1.9;
        P.abf = -0.9;
        P.t = -0.2;
        P.c = 8;
        break;
      case 'ronin':
        if (f < 56) {
          P.afu = -0.6;
          P.aff = 1.3;
          P.abu = -0.5;
          P.abf = 1.2;
          P.t = -0.24;
          P.c = 16;
        } else {
          P.afu = 2.2;
          P.aff = 0.08;
          P.abu = -1.2;
          P.abf = 0.4;
          P.t = 0.44;
          P.c = 6;
        }
        break;
      default:
        break;
    }
  };

  BVN.Fighter = Fighter;
})(window.BVN);

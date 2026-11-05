/* js/fighter.js — Fighter 类：状态机 / 物理 / 输入响应 / 受击硬直与击倒 / 判定盒 / 姿势驱动 */
window.BVN = window.BVN || {};

(function (BVN) {
  'use strict';

  const CFG = BVN.CFG;
  const FX = BVN.FX;
  let UID = 0;

  /* 「可以主动出招」的状态集合（与 assist.js 的 ACTABLE 同义）。
     超级必杀的可用性校验复用这份表，避免两处各写一份 if 链。 */
  const ACTABLE = { idle: 1, walk: 1, jump: 1, fall: 1, dash: 1, guard: 1 };

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
      // 超级必杀独立键（第三期）：P1 I / P2 6，与「必杀 ult」完全分开
      super: false,
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
    this.armorLevel = 0;
    this.armorTimer = 0;
    // 数据驱动霸体窗口（def.armorWindows）的「本次出招是否已播过进入提示」标记
    this._armorWindowOn = false;
    this.diveLanded = false;
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
      super: false,   // 每小局重建 ctrl 时也要带上奥义键，保持字段集一致
    };
  };

  /* ===================== 判定盒 ===================== */

  /**
   * 开启霸体：level 越高越难被打断（1~3）。
   * 霸体期间照常吃伤害，但不进入硬直、不被打断出招。
   */
  Fighter.prototype.setArmor = function (level, frames) {
    if (!level || level <= 0) return;
    this.armorLevel = Math.max(this.armorLevel, level);
    this.armorTimer = Math.max(this.armorTimer, frames | 0);
  };

  /* ===================== 超级必杀：只读查询 =====================
     资源（充能 / 是否已用）住在 Game 层：G.superCharge[2] / G.superUsed[2]。
     原因：Fighter.reset() 每个小局都会清场，放 Fighter 上会跨小局丢失（设计稿 §2.6 / R11）。
     这里只做只读包装，不写任何状态，演出与结算都在 BVN.Super（T04）。
     ============================================================= */

  /**
   * @param {Object} game
   * @returns {{charge:number, used:boolean, ready:boolean}}
   */
  Fighter.prototype.superState = function (game) {
    const arr = game && game.superCharge;
    const charge = arr ? clamp(arr[this.index] || 0, 0, CFG.SUPER_MAX) : 0;
    const used = !!(game && game.superUsed && game.superUsed[this.index]);
    return { charge: charge, used: used, ready: !used && charge >= CFG.SUPER_MAX };
  };

  /**
   * 奥义此刻能否释放：资源满 + 未用过 + 回合进行中 + 无演出锁 +
   * 自己活着且处于可行动状态 + 技能冷却已转好。
   * @param {Object} game
   * @returns {boolean}
   */
  Fighter.prototype.canSuper = function (game) {
    if (!game) return false;
    if (!this.superState(game).ready) return false;
    if (game.phase !== 'fight' || game.roundState !== 'active') return false;
    if (game.superLock) return false;
    if (this.hp <= 0) return false;
    if (this.skillCd > 0) return false;
    return !!ACTABLE[this.state];
  };

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
    let cy = this.y + w.oy;
    let h = w.h;

    // reachGround：判定框下沿补齐到地面。
    // 起跳后的上挑原本整块飘在空中，地面上的对手根本碰不到（天使起跳最高，最明显）；
    // 这里把下沿拉到地面并保证足够高度，上挑就成了一道「自地面撩到头顶」的竖斩。
    if (w.reachGround && !this.onGround) {
      const bottom = CFG.GROUND_Y - 4;
      const topNow = cy - h / 2;
      const bottomNow = cy + h / 2;
      if (bottom > bottomNow) {
        let top = Math.min(topNow, bottom - 300);   // 至少 300 高，覆盖地面到身体
        top = Math.max(top, bottom - 470);          // 但不要无限拉长
        cy = (top + bottom) / 2;
        h = bottom - top;
      }
    }
    return { x: cx - w.w / 2, y: cy - h / 2, w: w.w, h: h };
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
    if (this.armorTimer > 0) {
      this.armorTimer--;
      if (this.armorTimer === 0) this.armorLevel = 0;
    }
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
    /* 边沿检测只看 ctrl 的上一帧快照。
       B2（T05）：演出/输入锁解除后的第一帧由 Game 侧把 this._prev 对齐到当前 ctrl
       （见 game.js updateFight 的 _inputWasLocked 分支），所以这里保持纯粹的
       「按住不放不算按下」语义即可。 */
    const press = function (k) { return !!c[k] && !prev[k]; };

    // 输入缓冲（10 帧）：出招中按下但当前还不能取消的键会被记住，
    // 避免"轻击第 2 帧按技能键、等可以取消时边沿已被消耗"导致技能永远放不出。
    if (press('light')) this.bufLight = 10;
    if (press('heavy')) this.bufHeavy = 10;
    if (press('skill')) this.bufSkill = 10;
    if (press('ult')) this.bufUlt = 10;

    /* ---------- 超级必杀（奥义）触发 ----------
       键位独立（P1 I / P2 6），不走输入缓冲：奥义是「整场一次」的资源，
       按下当帧判定，失败就静默丢弃（不排队，避免延迟两三帧后突然放出来）。
       校验与演出全在 BVN.Super（T04 落地）；T02 阶段 tryActivate 尚未实现，
       守卫短路 → 按了也没有任何副作用，可安全先接线。 */
    if (press('super') && BVN.Super && typeof BVN.Super.tryActivate === 'function') {
      BVN.Super.tryActivate(this.index, game);   // 返回 false（未满/已用/受击/演出中）时静默
    }

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
      // ⚠ 必须带 super：漏了会让 press('super') 里 prev.super === undefined，
      //   退化成"按住即为真"——充能不满时按住 I，等自然回充到 100 会自动放出去（B1）。
      super: c.super,
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
      // 上挑：地面上「按住上方向 + 轻攻」直接起跳上挑；空中上升阶段按轻攻也是上挑
      if (this.onGround && c.up) {
        this.jump(game);
        if (!this.onGround) this.startAttack('rise', game);
        return;
      }
      if (!this.onGround && this.vy < 0) { this.startAttack('rise', game); return; }
      this.startAttack(this.onGround ? 'light1' : 'airLight', game);
      return;
    }
    if (press('heavy')) {
      this.bufHeavy = 0;
      this.startAttack(this.onGround ? 'heavy' : 'airLight', game);
      return;
    }
    // 下落攻击：空中按 ↓ / S 立刻加速下砸（上升中、顶点、下落中都可用）
    if (press('down') && !this.onGround) {
      this.startAttack('dive', game);
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
    this._armorWindowOn = false;   // 每次出招重新武装「霸体段进入提示」
    this.script = null;
    this.onTick = null;
    this.crouchGuard = false;
    this.guarding = false;
    if (this.onGround) this.vx *= 0.25;
    if (key === 'dive') {
      // 下落斩：按下即失重下砸——不是「等掉下去再打」，而是主动一脚踩向地面
      this.vy = Math.max(this.vy, 1350);
      this.vx = this.facing * 90;
      this.diveLanded = false;
      this.diveFlash = 6;
      // 起手视觉：脚跟爆气 + 一圈白色冲击环 + 明显的下坠姿态
      FX.ring(this.x, this.y - 90, 'rgba(255,240,190,0.9)', 120, 0.28);
      FX.burst(this.x, this.y - 40, 14, {
        colors: ['#fff2c0', '#ffb347', '#ffffff'], speedMin: 80, speedMax: 300,
        sizeMin: 2, sizeMax: 6, lifeMin: 0.18, lifeMax: 0.42, grav: 520, drag: 1.6, angle: Math.PI / 2, spread: 0.9,
      });
      BVN.Sfx.play('dash');
    } else if (key === 'rise') {
      // 上挑：上升期略微滞空，横向收力
      this.vx *= 0.35;
      if (this.vy > 0) this.vy *= 0.3;
    }
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

    /* ---------- 数据驱动霸体窗口（def.armorWindows，第三期需求①） ----------
       def.armorWindows = [{ s, e, level }]：attackFrame ∈ [s, e] 时给霸体，其余帧不给。
       本期只有天使必杀使用：[34, 66] = 俯冲开始 → 落地撞击判定窗结束，
       升空段(0~33)与收招(67+)仍然可被打断（设计稿 §2.4 / R14）。

       三条语义必须保留：
       1) 窗口内「每帧 setArmor(level, 2) 续期」，且 setArmor 只抬高不降低
          （Math.max）→ 不会把更高级别的霸体压回低级别。
       2) 不在窗口内时**不强制清零**，让 armorTimer 自己倒数（见 update() 的
          armorTimer--）。这样窗口尾段残留的 2 帧能自然延续，窗口切换处不会闪断。
       3) hitstop 期间 G.update 直接 return（game.js:416-420），Fighter.update 根本
          不跑 → attackFrame 不前进、armorTimer 也不递减。所以「顿帧」绝不会让
          霸体在中途自然到期，俯冲的 Lv3 不会因为一次命中顿帧而断掉。 */
    const armWs = def.armorWindows;
    if (armWs && armWs.length) {
      let armLv = 0;
      for (let i = 0; i < armWs.length; i++) {
        const aw = armWs[i];
        if (this.attackFrame >= aw.s && this.attackFrame <= aw.e && aw.level > armLv) {
          armLv = aw.level;
        }
      }
      if (armLv > 0) {
        this.setArmor(armLv, 2);
        if (!this._armorWindowOn) {
          this._armorWindowOn = true;
          // 进入霸体段的即时反馈：最高级才有专属提示（Lv2 恶龙保持既有表现，不抢戏）
          if (armLv >= BVN.ARMOR.MAX) {
            // 窗口起点正好是「升空最高点」，再往上飘 236 会飞出画面 → 夹一下世界坐标 y
            FX.text(this.x, Math.max(150, this.y - 236), 'ARMOR · Lv' + armLv, '#ffd27a', 22);
            this.glow = Math.max(this.glow, 0.35);
          }
        }
      } else {
        this._armorWindowOn = false;
      }
    }

    // 下落斩：全程持续加速下坠，形成压制感
    if (this.attackKey === 'dive' && !this.onGround) {
      this.vy = Math.min(this.vy + 2200 * dt, 1900);
      if (this.attackFrame < 6) this.vx = this.facing * 130;
    }

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
      this._armorWindowOn = false;   // 收招：允许下一轮出招重新播霸体提示
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

        // 下落斩落地：生成冲击波并强制收招
        if (this.state === 'attack' && this.attackKey === 'dive') {
          this.onDiveLand(game);
          return;
        }

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

  /**
   * 下落斩落地：砸出冲击波。
   * 主判定已经命中过就不再补刀（避免 128 + 冲击波叠成秒杀），只留视觉。
   */
  Fighter.prototype.onDiveLand = function (game) {
    const connected = Object.keys(this.hitReg || {}).length > 0;
    const hx = this.x;
    const hy = CFG.GROUND_Y;

    this.diveLanded = true;
    this.state = 'idle';
    this.attackKey = null;
    this.attackDef = null;
    this.script = null;
    this.onTick = null;
    this.vy = 0;
    this.vx *= 0.2;

    BVN.Sfx.play('ko');
    game.shake(connected ? 8 : 12, connected ? 10 : 16);
    FX.ring(hx, hy - 20, 'rgba(255,236,180,0.9)', connected ? 170 : 230, 0.42);
    FX.burst(hx, hy - 10, 22, {
      colors: ['#fff2c0', '#ffb347', '#ffffff'], speedMin: 90, speedMax: 340,
      sizeMin: 2, sizeMax: 7, lifeMin: 0.25, lifeMax: 0.6, grav: 420, drag: 2.2,
    });
    if (connected) return;

    const e = {
      x: hx + this.facing * 30, y: hy - 56, vx: 0, vy: 0, w: 220, h: 118,
      life: 0.18, age: 0, dmg: 52, hitstun: 26, kb: 260, lift: 340,
      pierce: 0, sfx: 'heavy', single: true, rehit: 0, behind: false,
      owner: this, dead: false, activeFrom: 0, glow: '#ffd27a', kind: 'diveWave', scale: 1,
      hitSet: new Set(),
    };
    e.update = function (dt) {
      e.age += dt;
      if (e.age >= e.life) e.dead = true;
    };
    e.draw = function (ctx) {
      const t = Math.min(1, e.age / e.life);
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.strokeStyle = '#ffd27a';
      ctx.lineWidth = 8 * (1 - t) + 2;
      ctx.beginPath();
      ctx.ellipse(e.x, hy - 6, 60 + 150 * t, 16 + 30 * t, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    };
    game.entities.push(e);
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
    /* 第四期：奥义（全屏演出 + 场上动作）是整场一次的必中资源——
       hit.ignoreInvuln = true 时无视起身无敌 / 闪避无敌帧（与「奥义不可格挡」同一设计裁决）。
       普通攻击仍然尊重 invuln。 */
    if (this.invuln > 0 && !(hit && hit.ignoreInvuln)) return false;
    // 冻结中被命中：冰碎解除冻结并正常结算（援助侦探的时停可被打破）
    if (this.frozen > 0) {
      this.frozen = 0;
      FX.burst(this.x, this.y - 110, 10, {
        colors: ['#bfe6ff', '#e2f4ff', '#ffffff'], speedMin: 80, speedMax: 260,
        sizeMin: 2, sizeMax: 5, lifeMin: 0.2, lifeMax: 0.45, grav: 300, drag: 2.4,
      });
      BVN.Sfx.play('block');
    }

    // 背面攻击不吃格挡：面朝方向在 update() 里会朝对手刷新，但瞬移穿身（浪人居合）、
    // 跳跃绕背、被击飞越顶的当帧仍可能背对攻击者，那时格挡不生效。
    const facingAttacker = (attacker.x - this.x) * this.facing >= 0;
    // 不可防御的招式（下落斩）：格挡直接失效
    const guarding = !hit.unblockable && (this.guarding || this.state === 'guard') && facingAttacker && this.onGround;
    const mult = attacker && attacker.outDamage ? attacker.outDamage(this) : 1;
    /* ★ 伤害缩放的唯一出口 ★
       CFG.DMG_SCALE 只在这里乘一次，格挡分支（rawDmg * 0.2…）与霸体分支自然继承，
       「血量翻倍但手感不变」只需调 CFG.DMG_SCALE 一个数（第三期用户拍板 = 1）。
       绝对不要在别处再乘第二次。 */
    const rawDmg = hit.dmg * mult * CFG.DMG_SCALE;

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

    /* ---------- 霸体判定 ----------
       1) 招式自带 armorBreak 达到/超过自身霸体等级 → 破甲（下落斩可破 Lv1~2）
       2) 双方都在霸体中时，等级高的一方压制等级低的一方（拳击 Lv3 最高）
       霸体成立：照常扣血，但不进硬直、不打断出招。 */
    if (this.armorTimer > 0 && this.armorLevel > 0) {
      const brokenBySkill = (hit.armorBreak || 0) >= this.armorLevel;
      const brokenByPriority = !!attacker && attacker.armorTimer > 0 && attacker.armorLevel > this.armorLevel;
      if (!brokenBySkill && !brokenByPriority) {
        this.hitFlash = 2;
        FX.text(this.x, this.y - 196, 'ARMOR', '#ffd27a', 20);
        FX.burst(this.x, this.y - 120, 8, {
          colors: ['#ffd27a', '#fff2c0'], speedMin: 40, speedMax: 150,
          sizeMin: 2, sizeMax: 4, lifeMin: 0.15, lifeMax: 0.3, grav: 40, drag: 3,
        });
        game.onHpHit(this, attacker, hit, rawDmg);
        if (this.hp <= 0) this.knockOut(game, attacker);
        return true;
      }
      // 被破甲：护甲直接失效，正常吃硬直
      this.armorTimer = 0;
      this.armorLevel = 0;
      FX.text(this.x, this.y - 196, 'BREAK', '#ff6b6b', 22);
    }

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
      case 'rise': {
        // 上挑：先下潜蓄力，再自下向上撩击
        const wind = f < 8;
        P.afu = wind ? 0.32 : 2.86;
        P.aff = wind ? 0.95 : -0.12;
        P.abu = wind ? -0.55 : 0.75;
        P.abf = wind ? 0.6 : 0.5;
        P.t = wind ? 0.2 : -0.24;
        P.c = wind ? 13 : 3;
        P.lft = wind ? 0.34 : 0.62;
        P.lfs = wind ? -0.5 : -0.15;
        P.lbt = wind ? -0.32 : 0.18;
        P.lbs = wind ? -0.42 : -0.62;
        break;
      }
      case 'dive': {
        // 下落斩：空中收臂蓄势 → 躯干前倾、双臂竖直下砸、双腿后扬
        const wind = f < 5;
        P.rot = wind ? -0.18 : 0.42;
        P.afu = wind ? 2.62 : 0.12;
        P.aff = wind ? 0.12 : 0.02;
        P.abu = wind ? 2.46 : -0.06;
        P.abf = wind ? 0.1 : 0.04;
        P.t = wind ? -0.22 : 0.88;
        P.c = wind ? 0 : 13;
        P.lft = wind ? 0.62 : 2.52;
        P.lfs = wind ? -0.92 : -0.22;
        P.lbt = wind ? 0.36 : 2.74;
        P.lbs = wind ? -0.92 : -0.18;
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

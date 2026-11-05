/* js/super-field.js — 场上超必杀动作（Field Move）状态机 · 第四期 T06
 *
 * ============================================================================
 *  这是什么
 * ============================================================================
 *  第三期（T04/T05）的 `BVN.Super` 是一段**全屏 CG 演出**：镜头离开战场、整屏压暗、
 *  立绘 + 汉字 + 台词，结束后直接收招回 idle。第四期要在**演出结束之后**再无缝接一段
 *  「在战场上真的打出去」的动作：施法者留在场上、镜头回到战场、全程最高霸体 + 完全免伤、
 *  按帧脚本位移 / 换姿势 / 放特效，并在指定帧对对手结算多段伤害。
 *
 *  这一段动作就是 Field Move（场上动作），数据与动画函数住在 `js/super-field-moves.js`
 *  （`BVN.FIELD_MOVES[id]`），本文件只负责**状态机**：
 *    启动 → 每帧推进（位移 / 姿势 / 特效 / 命中）→ 收尾
 *
 * ============================================================================
 *  生命周期（务必按这个顺序理解）
 * ============================================================================
 *   ① `BVN.Super.tryActivate()`        本地放奥义 → `G.superLock` 建立，全屏演出开始
 *   ② `BVN.Super.update()`             演出逐帧推进（镜头在演出侧，`updateCamera` 被跳过）
 *   ③ `t >= lock.total` → `Super.finish(G, false)` 收尾：
 *        - `G.superLock = null`、`G.superGrace = 5`、施法者 attack* 全部清零回 idle
 *        - **然后**把控制权交给本文件：`BVN.Field.start(side, id, G, lock.remote)`
 *   ④ `BVN.Field.start()`              接管成功 → `G.fieldMove` 建立，施法者重新进入 attack
 *        此时 `G.superGrace` 被归 0：真正的输入闸门换成 `G.fieldMove`（`locked` 判定）
 *   ⑤ `BVN.Field.update()`             每帧推进：`lock.t++`、`def.move/pose/fx`、
 *        多段命中结算（客机不结算）、`setArmor(MAX,2)` + `invuln=2` 每帧续期
 *   ⑥ `lock.t > lock.total` → 收尾：`G.fieldMove = null`、施法者回 idle/fall、
 *        `G.superGrace = 6`（防"按住 J 跨过结束点"在解锁瞬间白出一招，与第三期 B2 同语义）
 *
 *  ── 中断路径（全部走 `BVN.Field.abort(G)`，等价于 `end(G, true)`）──
 *    · 回合切走（`roundState !== 'active'`）+ 任一方 HP 归零
 *    · 联机断线：`Netplay.abortSuper()` / `onNetClose()` / 收到 `bye`
 *    · 数据缺失（`BVN.FIELD_MOVES[id]` 在 start 之后被删）
 *
 * ============================================================================
 *  为什么动作沿用 `attackKey = 'super'`
 * ============================================================================
 *  `'super'` 已在 `js/netplay.js` 的 `ATK_LIST` 里（下标即线上协议），且
 *  `unpackFighter()` 里 `akName === 'super'` 的帧**不回写动作状态**（避免 attackDef
 *  被 `BVN.ATTACKS` 查不到而置 null → 动作瞬间复位）。换一个新字符串会同时踩两个坑，
 *  所以场上动作复用同一个 key，只在 `G.fieldMove` 上区分「演出期 / 场上期」。
 *
 * ============================================================================
 *  状态放在哪
 * ============================================================================
 *  `G.fieldMove`（Game 层）而不是 `Fighter`：`Fighter.reset()` 每个小局都会清场，
 *  放在 Fighter 上会跨小局丢失（与 `G.superCharge` / `G.superUsed` 同理）。
 *
 * ============================================================================
 *  对外 API（5 个）
 * ============================================================================
 *    isActive(G)                     是否正在场上动作
 *    start(side, id, G, remote)      本地 / 主机发起；返回 boolean 是否接管
 *    beginRemote(side, id, G)        客机：只演出不结算（= start(..., true)）
 *    update(G, dt)                   每帧推进（必须在 fighter.update / Super.update 之后）
 *    draw(ctx, G)                    世界坐标附加绘制（必须在世界变换之内、角色之后）
 *    abort(G)                        断线 / 回合切换 / 异常：立即收尾
 */
window.BVN = window.BVN || {};

(function (BVN) {
  'use strict';

  const CFG = BVN.CFG || {};

  /** 招式名在施法者上方显示的帧数（从动作第 1 帧算起） */
  const LABEL_FRAMES = 26;
  /** 招式名淡入 / 淡出各自的帧数 */
  const LABEL_FADE_IN = 6;
  const LABEL_FADE_OUT = 8;
  /** 招式名相对施法者脚下的高度（世界坐标；与 fighter.js 里 'ARMOR · LvX' 的 -236 对齐） */
  const LABEL_DY = 240;
  /** 施法者动作期间的 attackDef.total 哨兵值：fighter.updateAttack 永远不会自然收招 */
  const NEVER_END = 999999;
  /** 最高霸体等级（BVN.ARMOR.MAX 兜底 3） */
  const ARMOR_MAX = (BVN.ARMOR && BVN.ARMOR.MAX) || 3;

  /* ===================== 小工具 ===================== */

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  /**
   * 取某一角色的场上动作定义。
   * 注意**运行时**才读 `BVN.FIELD_MOVES`：数据文件（super-field-moves.js）在
   * 本文件之前加载，但里面的表可能被后加载的内容继续追加，不能在模块初始化时缓存。
   * @param {string} id 角色 id
   * @returns {Object|null}
   */
  function defOf(id) {
    const table = BVN.FIELD_MOVES;
    if (!table) return null;
    const d = table[id];
    return (d && typeof d === 'object') ? d : null;
  }

  /**
   * 动作主色：优先 `def.tint`，其次复用奥义演出的 tint，最后兜底金色。
   * @param {string} id
   * @param {Object|null} def
   * @returns {string}
   */
  function tintOf(id, def) {
    if (def && def.tint) return def.tint;
    const s = BVN.SUPERS && BVN.SUPERS[id];
    if (s && s.tint) return s.tint;
    return '#ffd76e';
  }

  /** 多段命中表（缺省空数组，永远不返回 undefined） */
  function hitsOf(def) {
    const h = def && def.hits;
    return Array.isArray(h) ? h : [];
  }

  /** 施法者的 attackDef 哨兵：空 windows → 不产生原生判定，收招由 fieldMove 决定 */
  function sentinelDef() {
    return { total: NEVER_END, windows: [], armorWindows: [] };
  }

  /** 把施法者拉回「场上动作中」的动作状态（被快照 / AI / 脚本改动后自愈） */
  function forceAttackPose(f) {
    f.state = 'attack';
    f.attackKey = 'super';
    f.attackDef = sentinelDef();
    f.script = null;
    f.onTick = null;
  }

  /* ===================== 启动 ===================== */

  /**
   * 发起场上超必杀动作。任何一条前置条件不满足都**不接管**，返回 false，
   * 让调用方（`Super.finish`）保持原来的「回 idle」行为。
   *
   * @param {number} side 0 | 1
   * @param {string} id 角色 id（= fighter.id）
   * @param {Object} G BVN.Game
   * @param {boolean} [remote] true = 客机镜像（只演出，不结算伤害）
   * @returns {boolean} 是否接管
   */
  function start(side, id, G, remote) {
    if (!G || !G.fighters) return false;
    if (G.fieldMove) return false;                     // 已经在放，不重复启动

    const def = defOf(id);
    if (!def) return false;                            // 该角色没有场上动作数据 → 不接管

    const s = (side | 0) === 1 ? 1 : 0;
    const f = G.fighters[s];
    const o = G.fighters[1 - s];
    if (!f || f.hp <= 0) return false;                 // 施法者已倒 → 不放
    if (!o || o.hp <= 0) return false;                 // 对手已倒 → 不放（避免和 KO / 处决打架）

    const total = Math.max(1, (def.total | 0) || 150);

    G.fieldMove = {
      side: s,
      id: id,
      t: 0,
      total: total,
      hitIdx: 0,
      remote: !!remote,
      def: def,
    };

    // 施法者切入「场上动作」——必须复用 attackKey='super'（见文件头说明）
    forceAttackPose(f);
    f.attackFrame = 0;
    f.hitReg = {};
    f._armorWindowOn = false;
    f.crouchGuard = false;
    f.guarding = false;
    f.vx = 0;
    if (f.onGround) f.vy = 0;
    f.bufLight = 0;
    f.bufHeavy = 0;
    f.bufSkill = 0;
    f.bufUlt = 0;

    // 清掉「冻结类」全局计时器，否则第一帧就被 hitstop 冻住
    G.superGrace = 0;
    G.hitstop = 0;
    G.slowmo = 0;

    f.glow = Math.max(f.glow, 0.6);

    // 起始反馈
    if (typeof G.shake === 'function') G.shake(10, 10);
    if (BVN.Sfx) BVN.Sfx.play('charge');
    if (BVN.FX) BVN.FX.ring(f.x, f.y - 100, tintOf(id, def), 220, 0.45);

    // 主机广播（客机据此起同样的动作，但 remote=true 不结算）
    if (G.mode === 'net' && BVN.Net && typeof BVN.Net.isHost === 'function' && BVN.Net.isHost() &&
      BVN.Netplay && typeof BVN.Netplay.sendField === 'function') {
      try { BVN.Netplay.sendField(s, id); } catch (e) { /* 网络异常不应阻断动作 */ }
    }
    return true;
  }

  /** 客机镜像：只演出、不结算伤害 */
  function beginRemote(side, id, G) {
    return start(side, id, G, true);
  }

  /* ===================== 收尾 ===================== */

  /**
   * 收尾：清锁、把施法者放回可行动状态、恢复输入闸门。
   * @param {Object} G
   * @param {boolean} [aborted] 是否为异常中断（断线 / 回合切走）。目前两条路径的
   *        收尾动作完全一致，参数只用于日志与将来可能的差异化（保留签名）。
   */
  function end(G, aborted) {
    const lock = G && G.fieldMove;
    if (!lock) return;

    const f = G.fighters && G.fighters[lock.side];
    G.fieldMove = null;

    if (f) {
      // 只有「还是本动作的 attack 状态」才回收，避免把别人写入的状态覆盖掉
      if (f.state === 'attack' && f.attackKey === 'super') {
        f.state = f.onGround ? 'idle' : 'fall';
        f.attackKey = null;
        f.attackDef = null;
        f.attackFrame = 0;
        f.hitReg = {};
      }
      f.armorTimer = 0;
      f.armorLevel = 0;
      f.script = null;
      f.onTick = null;
      f._armorWindowOn = false;
      f.bufLight = 0;
      f.bufHeavy = 0;
      f.bufSkill = 0;
      f.bufUlt = 0;
    }

    /* 收尾输入闸门：动作刚结束的 6 帧仍旧锁输入，
       防止「动作期一直按住 J」在解锁瞬间被当成一次新的按下边沿（第三期 B2 同语义）。 */
    G.superGrace = 6;

    // 主机：动作结束后强制对齐一次快照
    if (G.mode === 'net' && BVN.Net && typeof BVN.Net.isHost === 'function' && BVN.Net.isHost() &&
      BVN.Netplay && typeof BVN.Netplay.sendSnapshot === 'function') {
      try { BVN.Netplay.sendSnapshot(true); } catch (e) { /* ignore */ }
    }

    void aborted;   // 见 jsdoc：两条路径收尾一致
  }

  /* ===================== 每帧推进 ===================== */

  /**
   * 逐帧推进场上动作。**必须在** `fighter.update()` 与 `BVN.Super.update()` 之后调用：
   *   - 在 Fighter.update 之后：`updatePose()` 的插值已经跑完，这里写的姿势是「最终值」；
   *   - 在 Super.update 之后：演出结束当帧就能立刻接上（`Super.finish → Field.start`）。
   * @param {Object} G
   * @param {number} dt
   */
  function update(G, dt) {
    const lock = G && G.fieldMove;
    if (!lock) return;

    const def = lock.def || defOf(lock.id);
    if (!def) { end(G, true); return; }

    const f = G.fighters[lock.side];
    const o = G.fighters[1 - lock.side];
    // 回合切走 / 任一方倒下 → 立刻收尾（场上动作不允许跨回合残留）
    if (G.roundState !== 'active' || !f || f.hp <= 0 || !o || o.hp <= 0) { end(G, true); return; }

    lock.t++;
    if (lock.t > lock.total) { end(G, false); return; }

    // 防御：被联机快照 / AI / 脚本改动过就拉回（保证 def.pose 有 attack 姿势可用）
    if (f.state !== 'attack' || f.attackKey !== 'super') forceAttackPose(f);

    // ① 位移脚本（可写 f.x / f.y / f.vx / f.vy / f.onGround / f.facing / f.glow）
    if (typeof def.move === 'function') def.move(f, lock.t, G);

    // ② 姿势：绝对覆盖（13 字段，null/undefined 表示「这一项不覆盖」）
    if (typeof def.pose === 'function') {
      const P = def.pose(f, lock.t);
      if (P) {
        for (const k in P) {
          if (Object.prototype.hasOwnProperty.call(P, k) && P[k] != null) f.pose[k] = P[k];
        }
      }
    }

    // ③ 特效（FX / Sfx / shake 由数据侧自由调用）
    if (typeof def.fx === 'function') def.fx(f, lock.t, G);

    // ④ 多段命中：只有单机 / 主机结算；客机的 HP 完全由主机快照写入
    const hits = hitsOf(def);
    while (!lock.remote && lock.hitIdx < hits.length &&
      ((hits[lock.hitIdx].f | 0) || 0) <= lock.t) {
      const h = hits[lock.hitIdx] || {};
      const target = G.fighters[1 - lock.side];
      if (target && target.hp > 0) {
        if (typeof G.applyDamage === 'function') {
          G.applyDamage(f, target, {
            dmg: h.dmg || 0,
            hitstun: h.hitstun || 20,
            kb: h.kb || 0,
            lift: h.lift || 0,
            pierce: 1,
            unblockable: true,
            armorBreak: 3,          // 场上超必杀：必破霸体
            ignoreInvuln: true,     // 必中：不吃对手的起身/闪避无敌帧（与奥义同一裁决）
            sfx: h.sfx || 'slash',
            gain: 0,
            x: target.x,
            y: target.y - 120,
          });
        }
        if (typeof G.shake === 'function') G.shake(h.shake != null ? h.shake : 9, 10);
      }
      lock.hitIdx++;
    }

    // ⑤ 全程最高霸体 + 完全免伤（每帧续期；Fighter.update 每帧先减 1，这里补回 2）
    f.setArmor(ARMOR_MAX, 2);
    f.invuln = Math.max(f.invuln, 2);
    f.glow = Math.max(f.glow, 0.45);
  }

  /* ===================== 绘制 ===================== */

  /**
   * 招式名（施法者上方，前 26 帧）。直接 ctx.fillText 而不用 `BVN.FX.text`：
   * FX 层的文字统一走 UI 坐标系与「飘字」生命周期，这里是**绑定在角色身上**的
   * 世界坐标标签，需要跟着镜头缩放、并且和施法者同层。
   */
  function drawLabel(ctx, f, lock) {
    const t = lock.t;
    if (t <= 0 || t > LABEL_FRAMES) return;
    const label = lock.def && lock.def.label;
    if (!label) return;

    const kIn = clamp(t / LABEL_FADE_IN, 0, 1);
    const kOut = clamp((LABEL_FRAMES - t) / LABEL_FADE_OUT, 0, 1);
    const a = Math.min(kIn, kOut);
    if (a <= 0) return;

    const y = f.y - LABEL_DY - (1 - kIn) * 16;                 // 淡入时从下往上顶一点
    const scale = 0.72 + 0.28 * (1 - Math.pow(1 - kIn, 3));    // easeOutCubic 弹入

    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(f.x, y);
    ctx.scale(scale, scale);
    ctx.font = '900 34px ' + (CFG.FONT || 'sans-serif');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(6,6,12,0.92)';
    ctx.strokeText(label, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }

  /**
   * 世界坐标附加绘制：角色之后、粒子（FX.draw）之前。
   * @param {CanvasRenderingContext2D} ctx 已处于世界变换（含镜头缩放）
   * @param {Object} G
   */
  function draw(ctx, G) {
    const lock = G && G.fieldMove;
    if (!lock || !ctx) return;

    const def = lock.def || defOf(lock.id);
    if (!def) return;

    const f = G.fighters && G.fighters[lock.side];
    if (!f) return;

    if (typeof def.draw === 'function') {
      // 用 save/restore 包住：数据侧的动画函数可以随便改 alpha / 混合模式，
      // 但绝不能把状态泄漏到后续的 FX / HUD 绘制里。
      ctx.save();
      try {
        def.draw(ctx, f, lock.t, G);
      } finally {
        ctx.restore();
      }
    }

    drawLabel(ctx, f, lock);
  }

  /* ===================== 导出 ===================== */

  const Field = {
    /** 场上动作的总帧数上限兜底（数据侧没写 total 时用） */
    DEFAULT_TOTAL: 150,
    LABEL_FRAMES: LABEL_FRAMES,

    isActive: function (G) {
      return !!(G && G.fieldMove);
    },

    start: start,
    beginRemote: beginRemote,
    update: update,
    draw: draw,

    /** 断线 / 回合切换 / 异常：立即收尾（= end(G, true)） */
    abort: function (G) {
      end(G, true);
    },
  };

  BVN.Field = Field;
})(window.BVN);

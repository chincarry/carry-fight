/* js/rogue.js — 爬塔肉鸽模式 · 第一关「痂香下水道」逻辑层
 *   横版平台 + 近战动作战斗 + 肉鸽遗物构筑 + BOSS 三阶段
 *   模块：BVN.Rogue（screen: select / play / reward / dead / win）
 *   依赖：rogue-data.js（数据）、rogue-art.js（绘制）、art.js（主角骨骼）、effects.js、audio.js
 *   接入：game.js 在 phase === 'rogue' 时转发 update / draw
 */
window.BVN = window.BVN || {};

(function (BVN) {
  'use strict';

  const CFG = BVN.CFG;
  const FX = BVN.FX;
  const Sfx = BVN.Sfx;
  const D = BVN.ROGUE_DATA;
  const RA = BVN.ROGUE_ART;
  const Art = BVN.Art;
  const K = Art.kit;

  const RG = {
    screen: 'select',
    time: 0,
    charIndex: 0,
    char: null,
    roomIndex: 0,
    room: null,
    player: null,
    monsters: [],
    projectiles: [],
    zones: [],
    props: [],
    hazards: [],
    gate: null,
    cam: { x: 0, y: 0, shake: 0, shakeT: 0 },
    scrap: 0,
    kills: 0,
    relics: [],
    relicChoices: [],
    rewardIndex: 0,
    introT: 0,
    clearT: -1,
    endT: 0,
    msg: '',
    msgT: 0,
    flash: 0,
    hitstop: 0,
    paused: false,
    runTime: 0,
    screenT: 0,
    drops: [],
    pShots: [],
    buffs: [],
    buffChoices: [],
    buffIndex: 0,
    skillCd: 0,
    skillFx: null,
    areas: [],
    areaIdx: 0,
    areaName: '',
    pending: [],
    spawnSeed: 0,
    fuses: [],
    meter: 0,
    fightCd: 0,
    relicPop: null,
    relicPopT: 0,
    relicOpen: false,
    gamble: null,
    codexTab: 0,
    codexScroll: 0,
    traps: [],
    trapCd: 0,
    bossKilled: false,
    bossIntro: null,
    introSeen: {},
    superCd: 0,
    superCut: null,
    crocEscaped: false,
    crocReturn: 0,
    killerSpawned: false,
    jellyGuard: false,
    tentacleTotal: 0,
    tentacleAlive: 0,
    cine: null,
    // 废料强化等级：生命 / 攻击 / 防御 / 敏捷 / 冷却
    upg: { hp: 0, atk: 0, def: 0, agi: 0, cd: 0 },
    upgIndex: 0,
    itemsUsed: {},
    totalDmg: 0,
    bossKills: [],
    // 模式：normal 普通爬塔 / gauntlet BOSS 连战
    mode: 'normal',
    modeIndex: 0,
    gstage: 0,
    gplan: [],
    shopIndex: 0,
    shopScrap: 0,
    // 排行榜（通关时间）
    nameInput: '',
    nameFocus: false,
    scoreSubmitted: false,
    scoreRank: null,
    scoreErr: '',
    scoreBusy: false,
    boardTab: 0,
    boardData: null,
    boardLoading: false,
    boardErr: '',
    boardFrom: 'select',
  };

  const GROUND_Y = 600;
  const BASE_HP = 420;
  const TAU = Math.PI * 2;

  /* ===================== 小工具 ===================== */

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function hitRect(x, y, r) {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }
  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function sfx(name) { try { Sfx.play(name); } catch (e) { /* 缺音效时静默 */ } }
  function toast(txt, t) { RG.msg = txt; RG.msgT = t || 2.2; }

  function keyDown(codes) {
    const G = BVN.Game;
    for (let i = 0; i < codes.length; i++) if (G.keys[codes[i]]) return true;
    return false;
  }
  function keyPress(codes) {
    const G = BVN.Game;
    for (let i = 0; i < codes.length; i++) if (G.pressed[codes[i]]) return true;
    return false;
  }

  /* ===================== 打开模式 / 角色选择 ===================== */

  RG.open = function () {
    const G = BVN.Game;
    G.phase = 'rogue';
    G.fighters.length = 0;
    G.ais.length = 0;
    G.entities.length = 0;
    G.hitstop = 0;
    G.slowmo = 0;
    FX.reset();
    RG.screen = 'select';
    RG.charIndex = 0;
    RG.endT = 0;
    RG.introT = 0;
    RG.relicChoices = [];
    RG.msg = '';
    RG.msgT = 0;
    RG.time = 0;
    RG.nameFocus = false;
    if (BVN.Leaderboard && BVN.Leaderboard.hideNameInput) BVN.Leaderboard.hideNameInput(true);
    if (BVN.Leaderboard) RG.nameInput = BVN.Leaderboard.getName();
  };

  RG.resetRun = function (charIdx, mode) {
    RG.mode = mode || RG.mode || 'normal';
    RG.modeIndex = RG.mode === 'gauntlet' ? 1 : 0;
    RG.charIndex = charIdx;
    RG.char = BVN.ROSTER[charIdx];
    RG.roomIndex = 0;
    RG.scrap = 0;
    RG.kills = 0;
    RG.relics = [];
    RG.runTime = 0;
    RG.rewardIndex = 0;
    RG.endT = 0;
    RG.clearT = -1;
    RG.screenT = 0;
    RG.buffs = [];
    RG.buffChoices = [];
    RG.buffIndex = 0;
    RG.pShots = [];
    RG.skillCd = 0;
    RG.skillFx = null;
    RG.fuses = [];
    RG.meter = 0;
    RG.fightCd = 0;
    RG.relicPop = null;
    RG.relicPopT = 0;
    RG.relicOpen = false;
    RG.gamble = null;
    RG.codexTab = 0;
    RG.codexScroll = 0;
    RG.traps = [];
    RG.trapCd = 0;
    RG.bossKilled = false;
    RG.bossIntro = null;
    RG.introSeen = {};
    RG.superCd = 0;
    RG.superCut = null;
    RG.crocEscaped = false;
    RG.crocReturn = 0;
    RG.crocVariant = null;
    RG.killerSpawned = false;
    RG.jellyGuard = false;
    RG.cine = null;
    RG.upg = { hp: 0, atk: 0, def: 0, agi: 0, cd: 0 };
    RG.upgIndex = 0;
    RG.itemsUsed = {};
    RG.totalDmg = 0;
    RG.bossKills = [];
    RG.scoreSubmitted = false;
    RG.scoreRank = null;
    RG.scoreErr = '';
    RG.scoreBusy = false;
    RG.nameFocus = false;
    RG.boardData = null;
    RG.boardErr = '';
    RG.boardLoading = false;
    if (!RG.nameInput && BVN.Leaderboard) RG.nameInput = BVN.Leaderboard.getName();
    RG.extraCd = { wave: 0, bind: 0, mend: 0, aegis: 0 };
    RG.extraFx = [];
    const maxHp = BASE_HP + (D.CHARS[RG.char.id].mods.maxHp || 0);
    RG.player = {
      x: 130, y: GROUND_Y, vx: 0, vy: 0,
      facing: 1, onGround: true, w: 46, h: 152,
      hp: maxHp, hpMax: maxHp,
      invuln: 0, hurtT: 0, hurtDir: 1,
      attack: null, combo: 0, comboT: 0,
      dashT: 0, dashCd: 0, dashDir: 1,
      rollT: 0, rollMax: 0.46, rollDir: 1, rollCd: 0,
      coyote: 0, jumpBuf: 0, jumps: 0,
      items: ['potion'], itemIdx: 0,
      antidote: 0,
      stimT: 0, wardT: 0,
      poisonT: 0, poisonTick: 0,
      ultDive: null,
      pose: Object.assign({}, BVN.POSE_DEFAULT),
      animT: 0,
      startX: 130,
      rootT: 0,
      hitIds: [],
      landing: 0,
      mods: {},
      reviveLeft: 0, reviveUsed: 0,
      shieldT: 0, shieldMul: 0,
      superAnim: null,
    };
    recalcMods();
    if (RG.mode === 'gauntlet') {
      RG.gstage = 0;
      RG.gplan = buildGauntletPlan();
      RG.shopIndex = 0;
      RG.shopScrap = 0;
      loadRoom(0);
    } else {
      RG.gstage = 0;
      RG.gplan = [];
      loadRoom(0);
    }
    RG.screen = 'play';
  };

  /* ===================== 遗物 / 属性结算 ===================== */

  function baseMods() {
    return {
      dmgMul: 1.2, moveMul: 1, dashCdMul: 1,
      heavyMul: 1, comboBoost: 0,
      maxHp: 0, roomHeal: 0, scrapMul: 1,
      lifesteal: 0, explode: false,
      acidImmune: false, gasResist: 0,
      shield: 0, doubleJump: true, extraJump: 0, infiniteJump: false,
      atkSpeed: 1, reach: 1, lowHpDmg: 0,
      rangedMul: 1.2, skillMul: 1.15, skillCdMul: 1, jumpMul: 1, healFull: false,
      meterGain: 1, ultMul: 1,
      glide: false, freeze: 0, trap: 0, thorns: 0, chain: 0, slowField: 0,
      immortal: false, instaKill: false,
      // 第五轮：复活 / 元素 / 额外技能 / 特殊遗物等级派生
      revive: 0, reviveHeal: 0,
      elemFire: 0, elemPoison: 0, elemShock: 0, elemIce: 0, elemDmg: 0,
      skills: {},
      freezeDur: 0, chainJumps: 0, chainDmg: 0,
      trapLv: 0, trapDmg: 0, trapInterval: 0, trapR: 0,
      explodeR: 0, explodeDmg: 0, slowR: 0, glideLv: 0,
    };
  }

  /* 属性结算入口：recalcMods 保留旧名字，内部统一走 applyAllMods */
  function recalcMods() { applyAllMods(); }
  /* 遗物与关卡 BUFF 共用同一套属性累加规则；
     伤害加成按乘法叠加：10% + 10% 的不同遗物 → 1.1×1.1 = 1.21（总加成 21%） */
  function applyMods(m, r, lv) {
    if (!r) return;
    const lvl = lv || 1;
    if (r.dmg) m.dmgMul *= (1 + r.dmg);
    if (r.moveMul) m.moveMul += r.moveMul;
    if (r.dashCd) m.dashCdMul -= r.dashCd;
    if (r.heavyDmg) m.heavyMul += r.heavyDmg;
    if (r.comboBoost) m.comboBoost += r.comboBoost;
    if (r.maxHp) m.maxHp += r.maxHp;
    if (r.roomHeal) m.roomHeal += r.roomHeal;
    if (r.scrap) m.scrapMul += r.scrap;
    if (r.lifesteal) m.lifesteal += r.lifesteal;
    if (r.acidImmune) m.acidImmune = true;
    if (r.gasResist) m.gasResist = Math.max(m.gasResist, r.gasResist);
    if (r.shield) m.shield = Math.min(0.45, m.shield + r.shield);
    if (r.explode) m.explode = true;
    if (r.reach) m.reach += r.reach;
    if (r.atkSpeed) m.atkSpeed += r.atkSpeed;
    if (r.doubleJump) m.doubleJump = true;
    if (r.extraJump) m.extraJump += r.extraJump;
    if (r.infiniteJump) m.infiniteJump = true;
    if (r.rangedDmg) m.rangedMul += r.rangedDmg;
    if (r.skillDmg) m.skillMul += r.skillDmg;
    if (r.skillCd) m.skillCdMul = Math.max(0.35, m.skillCdMul + r.skillCd);
    if (r.jumpBonus) m.jumpMul += r.jumpBonus;
    if (r.healFull) m.healFull = true;
    if (r.lowHpDmg) m.lowHpDmg += r.lowHpDmg;
    if (r.meterGain) m.meterGain += r.meterGain;
    if (r.ultDmg) m.ultMul += r.ultDmg;
    if (r.glide) { m.glide = true; m.glideLv = Math.max(m.glideLv, lvl); m.jumpMul += 0.05 * (lvl - 1); }
    if (r.freeze) { m.freeze = Math.min(0.9, m.freeze + r.freeze); m.freezeDur = Math.max(m.freezeDur, 1.0 + 0.25 * lvl); }
    if (r.trap) {
      // 不再按倍率叠数值：改用等级派生的伤害 / 间隔 / 半径
      m.trapLv = Math.max(m.trapLv, lvl); m.trap = m.trapLv;
      m.trapDmg = Math.max(m.trapDmg, 70 * (1 + 0.6 * (lvl - 1)));
      m.trapInterval = Math.min(m.trapInterval || 999, Math.max(1.6, 4 - 0.5 * (lvl - 1)));
      m.trapR = Math.max(m.trapR, 90 + 12 * lvl);
    }
    if (r.thorns) m.thorns += r.thorns;
    if (r.chain) {
      m.chain = Math.min(0.9, m.chain + r.chain);
      m.chainJumps = Math.max(m.chainJumps, lvl);
      m.chainDmg = Math.max(m.chainDmg, 0.45 + 0.1 * lvl);
    }
    if (r.slowField) m.slowField = Math.max(m.slowField, Math.min(0.7, r.slowField)), m.slowR = Math.max(m.slowR, 320 + 40 * lvl);
    if (r.explode) { m.explode = true; m.explodeR = Math.max(m.explodeR, 130 + 25 * lvl); m.explodeDmg = Math.max(m.explodeDmg, 10 + 6 * lvl); }
    if (r.immortal) m.immortal = true;
    if (r.instaKill) m.instaKill = true;
    /* ---- 第五轮特殊遗物等级效果 ---- */
    if (r.revive) { m.revive += lvl; m.reviveHeal = Math.max(m.reviveHeal, Math.min(0.75, 0.35 + 0.08 * lvl)); }
    if (r.elemFire) m.elemFire = Math.max(m.elemFire, lvl);
    if (r.elemPoison) m.elemPoison = Math.max(m.elemPoison, lvl);
    if (r.elemShock) m.elemShock = Math.max(m.elemShock, lvl);
    if (r.elemIce) m.elemIce = Math.max(m.elemIce, lvl);
    if (r.elemDmg) m.elemDmg += r.elemDmg * lvl;
    if (r.extraSkill) {
      const sk = r.extraSkill;
      m.skills[sk] = Math.max(m.skills[sk] || 0, lvl);
    }
  }

  /* ===================== 遗物等级（重复合成） =====================
     规则：同种遗物 2 / 4 / 8 / 16 件 → Lv2 / Lv3 / Lv4 / Lv5；满 5 级后不再出现在池中。
     效果随等级放大（见 RELIC_SCALE）。 */
  const RELIC_MAX_LV = 5;
  /* 每一级效果在上一级基础上翻倍：Lv1~Lv5 → 1 / 2 / 4 / 8 / 16 倍 */
  const RELIC_SCALE = [0, 1, 2, 4, 8, 16];

  function relicNeed(lv) { return Math.pow(2, lv - 1); }
  function relicLevelOf(count) {
    let lv = 1;
    while (lv < RELIC_MAX_LV && count >= relicNeed(lv + 1)) lv++;
    return lv;
  }
  function relicScaleOf(lv) { return RELIC_SCALE[clamp(lv, 1, RELIC_MAX_LV)] || 1; }

  /* ===================== 废料强化（每关结束） =====================
     消耗废料永久提升基础属性，等级上限 10，费用随等级递增。 */
  const UPG_MAX_LV = 10;
  const UPG_PER = { hp: 45, atk: 0.08, def: 0.04, agi: 0.06, cd: 0.06 };
  const UPG_DEFS = [
    { key: 'hp', name: '生命', icon: 'heart', base: 40, step: 24, unit: '最大生命 +' + UPG_PER.hp },
    { key: 'atk', name: '攻击', icon: 'fist', base: 48, step: 28, unit: '所有伤害 +8%' },
    { key: 'def', name: '防御', icon: 'shield', base: 52, step: 30, unit: '受到伤害 -4%' },
    { key: 'agi', name: '敏捷', icon: 'boot', base: 36, step: 20, unit: '移动速度 +6%' },
    { key: 'cd', name: '冷却', icon: 'rune', base: 58, step: 34, unit: '技能冷却 -6% · 气获取 +6%' },
  ];

  function upgCost(def) { return def.base + (RG.upg[def.key] || 0) * def.step; }

  function buyUpgrade(i) {
    const def = UPG_DEFS[i];
    if (!def || (RG.screen !== 'upgrade' && RG.screen !== 'gshop')) return;
    const lv = RG.upg[def.key] || 0;
    // 连战模式：加点无上限
    if (RG.mode !== 'gauntlet' && lv >= UPG_MAX_LV) { toast(def.name + ' 已达上限', 1.6); sfx('ui'); return; }
    const cost = upgCost(def);
    if (RG.scrap < cost) { toast('废料不足 · 需要 ' + cost, 1.6); sfx('ui'); return; }
    RG.scrap -= cost;
    RG.upg[def.key] = lv + 1;
    recalcMods();
    if (def.key === 'hp') healPlayer(UPG_PER.hp, true);
    FX.text(RG.player.x, RG.player.y - 180, def.name + ' +1', '#ffd166', 24, true);
    sfx('uiPick');
  }

  /* 这些键由 applyMods 依据 lv 单独换算，不能再乘倍率（否则 Lv5 会得到 16 倍） */
  const SPECIAL_SKIP = {
    revive: 1, elemFire: 1, elemPoison: 1, elemShock: 1, elemIce: 1, elemDmg: 1,
    extraSkill: 1, explode: 1, trap: 1, glide: 1, slowField: 1,
  };
  function scaledRelicMods(mods, lv) {
    if (!mods) return mods;
    const s = relicScaleOf(lv);
    if (s === 1) return mods;
    const out = {};
    for (const k in mods) {
      const v = mods[k];
      out[k] = (typeof v === 'number' && !SPECIAL_SKIP[k]) ? v * s : v;
    }
    if (out.freeze != null) out.freeze = Math.min(0.9, out.freeze);
    if (out.chain != null) out.chain = Math.min(0.9, out.chain);
    if (out.shield != null) out.shield = Math.min(0.45, out.shield);
    return out;
  }

  function findRelic(id) {
    for (let i = 0; i < RG.relics.length; i++) if (RG.relics[i].id === id) return RG.relics[i];
    return null;
  }

  /* 获得一件遗物：已有则叠层，返回 {entry, upgraded, maxed} 供 UI 提示 */
  function addRelic(def) {
    if (!def) return null;
    let entry = findRelic(def.id);
    if (!entry) {
      entry = {
        id: def.id, name: def.name, desc: def.desc, icon: def.icon,
        mods: def.mods, count: 0, level: 1,
      };
      RG.relics.push(entry);
    }
    if (entry.level >= RELIC_MAX_LV) return { entry: entry, upgraded: false, maxed: true };
    const oldLv = entry.level;
    entry.count++;
    entry.level = relicLevelOf(entry.count);
    applyAllMods();
    rgRelicFx(entry, entry.level > oldLv);
    return { entry: entry, upgraded: entry.level > oldLv, maxed: entry.level >= RELIC_MAX_LV };
  }

  function rgRelicFx(entry, upgraded) {
    if (!RG.player) return;
    const p = RG.player;
    if (upgraded) {
      FX.ring(p.x, p.y - 80, '#ffe9a0', 140, 0.6);
      FX.text(p.x, p.y - 190, entry.name + ' · Lv' + entry.level, '#ffd166', 24, true);
      toast('遗物升级：' + entry.name + ' Lv' + entry.level + '（' + entry.count + ' 件合成）', 2.6);
      sfx('holy');
    }
  }

  /* 可抽取的遗物池：排除已满 5 级的、以及隐藏遗物（如兑换码专属作弊遗物） */
  function relicPool() {
    return D.RELICS.filter(function (r) {
      if (r.hidden) return false;
      const e = findRelic(r.id);
      return !e || e.level < RELIC_MAX_LV;
    });
  }

  function applyAllMods() {
    const p = RG.player;
    if (!p || !RG.char) return;
    const m = baseMods();
    const cm = D.CHARS[RG.char.id].mods || {};
    if (cm.maxHp) m.maxHp += cm.maxHp;
    if (cm.moveMul) m.moveMul += cm.moveMul;
    if (cm.dashCd) m.dashCdMul -= cm.dashCd;
    if (cm.heavyMul) m.heavyMul += cm.heavyMul;
    if (cm.comboBoost) m.comboBoost += cm.comboBoost;
    if (cm.lifesteal) m.lifesteal += cm.lifesteal;
    if (cm.scrap) m.scrapMul += cm.scrap;
    if (cm.atkSpeed) m.atkSpeed += cm.atkSpeed;
    if (cm.reach) m.reach += cm.reach;
    if (cm.lowHpDmg) m.lowHpDmg += cm.lowHpDmg;
    if (cm.rangedDmg) m.rangedMul += cm.rangedDmg;
    if (cm.doubleJump) m.doubleJump = true;
    if (cm.extraJump) m.extraJump += cm.extraJump;
    if (cm.infiniteJump) m.infiniteJump = true;
    if (cm.roomHeal) m.roomHeal += cm.roomHeal;
    for (let i = 0; i < RG.relics.length; i++) {
      const r = RG.relics[i];
      applyMods(m, scaledRelicMods(r.mods, r.level || 1), r.level || 1);
    }
    for (let i = 0; i < RG.buffs.length; i++) applyMods(m, RG.buffs[i].mods, 1);
    // 废料强化：生命 / 攻击 / 防御 / 敏捷 / 冷却
    const u = RG.upg || {};
    if (u.hp) m.maxHp += u.hp * UPG_PER.hp;
    if (u.atk) m.dmgMul += u.atk * UPG_PER.atk;
    if (u.def) m.shield = Math.min(0.40, m.shield + u.def * UPG_PER.def);
    if (u.agi) m.moveMul += u.agi * UPG_PER.agi;
    if (u.cd) {
      m.skillCdMul = Math.max(0.35, m.skillCdMul - u.cd * UPG_PER.cd);
      m.meterGain += u.cd * UPG_PER.cd;
    }

    p.mods = m;
    p.hpMax = BASE_HP + m.maxHp;
    if (p.hp > p.hpMax) p.hp = p.hpMax;
    if (m.healFull) p.hp = p.hpMax;
    // 复活次数：按「总次数 - 已消耗」实时结算，遗物被夺走时也会同步下降
    p.reviveUsed = p.reviveUsed || 0;
    p.reviveLeft = Math.max(0, m.revive - p.reviveUsed);
  }

  /* ===================== 房间装载 ===================== */

  function clonePlatform(p) {
    return {
      x: p.x, y: p.y, w: p.w, h: p.h || 24,
      kind: p.break ? 'break' : (p.kind || 'plat'),
      active: true, breakT: 0, respawn: 0, shakeT: 0, crack: 0,
      prevY: p.y, dy: 0, speed: 0, dir: 0,
    };
  }

  /* ===================== BOSS 连战 =====================
     11 关：前 10 关为 5 族 × 2 个不同品种（普通种 / 亚种等比例抽取），
     第 11 关先战痂香巨魔，胜后立即由杀手鳄吞食合体、再战痂香杀手鳄。 */
  const GAUNTLET_STAGES = 11;
  const GAUNTLET_FAMILIES = ['centipedeKing', 'gasfishKing', 'jellyMother', 'giantFoot', 'sewerCroc'];

  function gauntletFamilies() { return GAUNTLET_FAMILIES; }

  /* 全部品种（普通种 + 3 亚种）中随机抽 2 个不同品种 */
  function buildGauntletPlan() {
    const plan = [];
    for (let f = 0; f < GAUNTLET_FAMILIES.length; f++) {
      const fam = GAUNTLET_FAMILIES[f];
      const pool = [fam].concat((D.VARIANTS && D.VARIANTS[fam]) || []);
      const picked = [];
      while (picked.length < 2 && pool.length) {
        const i = (Math.random() * pool.length) | 0;
        picked.push(pool[i]);
        pool.splice(i, 1);
      }
      plan.push(picked[0], picked[1] || picked[0]);
    }
    // 打乱出场顺序（同族两场仍为不同品种）
    for (let i = plan.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = plan[i]; plan[i] = plan[j]; plan[j] = t;
    }
    return plan;
  }

  function gauntletRoomDef(stage) {
    const final = stage >= GAUNTLET_STAGES - 1;
    const spawns = [];
    let name;
    if (final) {
      spawns.push({ type: 'troll', x: 1700, y: 600, force: true, range: [280, 2260] });
      name = '终局 · 痂香巨魔';
    } else {
      const type = (RG.gplan && RG.gplan[stage]) || GAUNTLET_FAMILIES[stage % GAUNTLET_FAMILIES.length];
      const d = D.MONSTERS[type] || D.MONSTERS.centipedeKing;
      spawns.push({ type: type, x: 1600, y: 600, force: true, range: [280, 2260] });
      name = '连战 · 第 ' + (stage + 1) + ' 关 · ' + d.name;
    }
    return {
      id: 'gauntlet', name: name, sub: 'BOSS 连战', w: 2400, h: 720,
      hint: final ? '击败痂香巨魔 · 杀手鳄将吞噬它' : '击败首领 · 战后进入情赌徒补给',
      floors: [{ x: 0, y: 600, w: 2400, h: 120 }],
      platforms: [
        { x: 220, y: 440, w: 220, h: 22 },
        { x: 1960, y: 440, w: 220, h: 22 },
        { x: 1090, y: 340, w: 220, h: 22 },
      ],
      acid: [],
      hazards: [],
      props: [],
      zones: [{ name: name, triggerX: 0, spawns: spawns }],
      exit: 2360, exitY: 600,
      start: { x: 140, y: 600 },
      boss: final,
      water: final ? [{ x: 960, y: 596, w: 480, h: 44 }] : null,
    };
  }

  function loadRoom(idx) {
    const rd = (RG.mode === 'gauntlet') ? gauntletRoomDef(idx) : D.ROOMS[idx];
    RG.roomIndex = idx;
    RG.bossKilled = false;
    RG.room = {
      def: rd, w: rd.w, h: rd.h, platforms: [], floors: [], acid: [], hazards: [],
      water: rd.water || [],
      boss: !!rd.boss,
    };
    RG.crocEscaped = false;
    RG.crocReturn = 0;
    RG.crocVariant = null;
    RG.killerSpawned = false;
    RG.jellyGuard = false;
    RG.bossIntro = null;
    RG.superCut = null;
    let tentacleCount = 0;
    const zoneDefs = rd.zones || [];
    for (let zi = 0; zi < zoneDefs.length; zi++) {
      const sps = zoneDefs[zi].spawns || [];
      for (let sj = 0; sj < sps.length; sj++) if (sps[sj].type === 'tentacleBase') tentacleCount++;
    }
    RG.tentacleTotal = tentacleCount;
    RG.tentacleAlive = tentacleCount;
    RG.jellyGuard = tentacleCount > 0;
    // 地面
    for (let i = 0; i < rd.floors.length; i++) {
      RG.room.floors.push({ x: rd.floors[i].x, y: rd.floors[i].y, w: rd.floors[i].w, h: rd.floors[i].h || 120 });
    }
    // 平台
    for (let i = 0; i < rd.platforms.length; i++) {
      RG.room.platforms.push(clonePlatform(rd.platforms[i]));
    }
    // 酸池
    for (let i = 0; i < rd.acid.length; i++) {
      RG.room.acid.push({ x: rd.acid[i].x, y: rd.acid[i].y, w: rd.acid[i].w, h: rd.acid[i].h });
    }
    // 机关
    const hazards = [];
    for (let i = 0; i < rd.hazards.length; i++) {
      const h = rd.hazards[i];
      if (h.type === 'steam') {
        hazards.push({
          type: 'steam', x: h.x, y: h.y, w: h.w, h: h.h || 160,
          clean: !!h.clean,
          period: D.HAZARDS.steam.period / 60,
          warn: D.HAZARDS.steam.warn / 60,
          onT: D.HAZARDS.steam.on / 60,
          t: (i * 0.7) % 3, phase: 0,
        });
      } else if (h.type === 'moving') {
        const mp = clonePlatform({ x: h.x, y: h.y, w: h.w, h: h.h || 18 });
        mp.kind = 'moving';
        mp.axis = h.axis; mp.from = h.from; mp.to = h.to;
        mp.speed = h.speed; mp.mdir = 1; mp.moving = true;
        hazards.push(mp);
      } else if (h.type === 'break') {
        const bp = clonePlatform({ x: h.x, y: h.y, w: h.w, h: h.h || 22 });
        bp.kind = 'break';
        bp.crack = 0.2;
        hazards.push(bp);
      } else if (h.type === 'conveyor') {
        hazards.push({ type: 'conveyor', x: h.x, y: h.y, w: h.w, h: 10, dir: h.dir, speed: h.speed });
      } else if (h.type === 'ball') {
        hazards.push({ type: 'ball', x: h.x, y: h.y, r: 34, dir: h.dir, speed: h.speed, hp: h.hp || 34, rot: 0, dead: false, hurt: 0, alive: true });
      } else if (h.type === 'pendulum') {
        hazards.push({ type: 'pendulum', x: h.x, y: h.y || 0, len: h.len, amp: h.amp, period: h.period, dmg: h.dmg });
      }
    }
    RG.hazards = hazards;

    // 怪物：按区域分批生成，玩家爬到该区域高度才涌出
    RG.monsters = [];
    RG.pending = [];
    RG.areas = [];
    RG.areaIdx = 0;
    RG.spawnSeed = 0;
    const areaDefs = rd.zones || [{ name: rd.name, triggerX: 1e9, spawns: rd.spawns || [] }];
    for (let i = 0; i < areaDefs.length; i++) {
      RG.areas.push({ name: areaDefs[i].name, triggerX: areaDefs[i].triggerX, triggerY: areaDefs[i].triggerY, spawns: areaDefs[i].spawns, total: areaDefs[i].spawns.length });
    }
    activateArea(0);

    // 道具
    RG.props = [];
    for (let i = 0; i < rd.props.length; i++) {
      const pr = rd.props[i];
      RG.props.push({ type: pr.type, x: pr.x, y: pr.y, taken: false, seed: i * 2.1, near: false });
    }
    // 动态掉落
    RG.drops = [];

    // 投射物 / 区域 / 延迟打击
    RG.projectiles = [];
    RG.zones = [];
    RG.pShots = [];
    RG.fuses = [];
    RG.gate = {
      x: rd.exit, baseY: rd.exitY || 600, open: false, openT: 0, near: false,
      y: (rd.exitY || 600) - 120,
    };

    // 玩家落位
    const p = RG.player;
    p.x = rd.start.x;
    p.y = rd.start.y;
    p.startX = rd.start.x;
    p.vx = 0; p.vy = 0;
    p.facing = 1;
    p.onGround = true;
    p.attack = null;
    p.dashT = 0; p.dashCd = 0;
    p.rollT = 0;
    p.jumps = 0;
    p.invuln = 0; p.hurtT = 0;
    p.hp = Math.min(p.hpMax, p.hp + (p.mods.roomHeal || 0));
    p.antidote = 0;
    p.hitIds = [];

    RG.cam.x = clamp(p.x - 640, 0, Math.max(0, rd.w - CFG.W));
    RG.cam.y = clamp(p.y - 470, 0, Math.max(0, rd.h - CFG.H));
    RG.cam.shake = 0;
    RG.cam.shakeT = 0;
    RG.introT = 2.4;
    RG.clearT = -1;
    RG.endT = 0;
    RG.rewardIndex = 0;
    RG.msg = '';
    RG.msgT = 0;
    RG.time = 0;
    toast(rd.hint ? '提示：' + rd.hint : rd.name, 3.2);
  }

  /* ===================== 怪物生成 ===================== */

  /* 关卡梯度：每过一关，小怪与 BOSS 的血量/伤害/攻击频率按关卡序号放大 */
  function roomScale() {
    const i = RG.roomIndex || 0;
    // 连战模式：小怪（仅召唤物）成长较缓，首领走独立曲线
    if (RG.mode === 'gauntlet') {
      return {
        hp: Math.pow(1.35, i), dmg: Math.pow(1.2, i),
        atk: 1.05 + i * 0.06, extra: 0,
        bossHp: Math.pow(1.6085, i), bossDmg: 1 + i,
        bossAtk: 1 + i * 0.16,
      };
    }
    return {
      hp: Math.pow(1.55, i),        // 第2关×1.55，第5关约×6.5
      dmg: Math.pow(1.28, i),       // 第5关约×2.8
      atk: 1.25 + i * 0.2,          // 出招冷却推进速度
      extra: 1 + i,                 // 每个区域额外增援（第1关+1，第5关+5）
      // 关底首领独立成长：血量按关卡硬表（4000 / 8000 / 12000 / 50000 / 40000+50000）
      bossHp: Math.pow(1.9, i),
      bossDmg: Math.pow(2, i),
      bossAtk: 1 + i * 0.28,
    };
  }

  /* 关底首领血量硬表：按关卡与首领身份取值（亚种共用同一档血量） */
  const BOSS_HP_BY_ROOM = [
    { centipedeKing: 4000 },
    { gasfishKing: 8000 },
    { jellyMother: 12000 },
    { giantFoot: 50000 },
    { sewerCroc: 40000, troll: 50000, killerCroc: 100000 },
  ];
  /* BOSS 伤害倍率：每关约为上一关的 2 倍；第 4 关特意低于第 3 关 */
  const BOSS_DMG_BY_ROOM = [1, 2, 4, 3, 6];
  const TENTACLE_HP = 6000;

  /* 连战首领常量：第 1 关固定 3000 血，之后逐关递增；
     终局痂香杀手鳄约 40 万（痂香巨魔 ×1.15 后）；伤害每关 +1 倍，杀手鳄 ×1.3（>10 倍） */
  const GAUNTLET_HP_BASE = 3000;
  const GAUNTLET_HP_STEP = 1.6085;
  const GAUNTLET_SCRAP_BASE = 3000;

  function gauntletBossHp(baseType, stage) {
    let hp = Math.round(GAUNTLET_HP_BASE * Math.pow(GAUNTLET_HP_STEP, stage));
    if (baseType === 'killerCroc') hp = Math.round(hp * 1.15);
    return hp;
  }
  function gauntletBossDmg(baseType, stage) {
    let v = 1 + stage;
    if (baseType === 'killerCroc') v *= 1.3;
    return v;
  }
  /* BOSS 每次攻击附带的真实伤害（无视防御）：普通模式按房间 20→300，连战按关卡 20→300 */
  function bossTrueDmgFor(baseType, roomIdx) {
    const t = RG.mode === 'gauntlet'
      ? RG.gstage / (GAUNTLET_STAGES - 1)
      : clamp(roomIdx, 0, 4) / 4;
    return Math.round(20 + 280 * clamp(t, 0, 1));
  }
  function gauntletScrapFor(stage) { return Math.round(GAUNTLET_SCRAP_BASE * (stage + 1)); }

  function bossHpFor(baseType, roomIdx) {
    if (RG.mode === 'gauntlet') return gauntletBossHp(baseType, RG.gstage);
    const row = BOSS_HP_BY_ROOM[clamp(roomIdx, 0, 4)] || {};
    return row[baseType] || null;
  }
  function bossDmgFor(baseType, roomIdx) {
    if (RG.mode === 'gauntlet') return gauntletBossDmg(baseType, RG.gstage);
    let v = BOSS_DMG_BY_ROOM[clamp(roomIdx, 0, 4)] || 1;
    if (baseType === 'killerCroc') v *= 1.35;
    return v;
  }

  /* 亚种投放：第 1 关原种；第 2 关 T1；第 3 关 T1/T2；第 4 关 T2/T3；第 5 关 T3 */
  function variantTierCap() { return [0, 1, 2, 3, 3][clamp(RG.roomIndex, 0, 4)]; }

  function resolveMonsterType(baseType, idx, elite, mini) {
    if (mini) return baseType;
    const list = D.VARIANTS && D.VARIANTS[baseType];
    if (!list || !list.length) return baseType;
    // 关底首领：在「普通种 + 全部亚种」中等比例随机，不再按 T1/T2/T3 关卡顺序
    const d0 = D.MONSTERS[baseType];
    if (d0 && (d0.kind === 'miniboss' || d0.kind === 'boss')) {
      const pool = [baseType].concat(list);
      return pool[Math.floor(Math.random() * pool.length)];
    }
    const cap = variantTierCap();
    if (!cap) return baseType;
    const cand = [];
    for (let i = 0; i < list.length; i++) {
      const d = D.MONSTERS[list[i]];
      if (!d || !d.tier) continue;
      if (elite) { if (d.tier === cap) cand.push(list[i]); continue; }
      if (d.tier === cap) cand.push(list[i]);
      // 第 3 关 T1/T2、第 4 关 T2/T3 混排；第 5 关固定 T3，保证最强亚种只在最后出现
      else if (cap > 1 && (RG.roomIndex === 2 || RG.roomIndex === 3) && d.tier === cap - 1) cand.push(list[i]);
    }
    if (!cand.length) return baseType;
    const pick = cand[(idx + RG.roomIndex * 3) % cand.length];
    return pick || baseType;
  }

  function spawnMonster(sp, idx) {
    const mini = !!sp.mini;
    const elite = !!sp.elite && !mini;
    const resolved = sp.force ? sp.type : resolveMonsterType(sp.type, idx || 0, elite, mini);
    const def = D.MONSTERS[resolved] || D.MONSTERS[sp.type];
    const diff = roomScale();
    // 精英怪体型必须比普通怪更大（1.32 倍），配合 2.6 倍血量 / 1.6 倍伤害
    const sc = (mini ? 0.62 : 1) * (elite ? 1.32 : 1);
    const baseHp = sp.hp != null ? sp.hp : (mini ? 14 : def.hp);
    // 关底首领走独立成长曲线（血量 ×1.9/关、伤害 ×1.4/关），确保每关都比上一关强很多
    const bossTier = def.kind === 'boss' || def.kind === 'miniboss';
    const baseType = def.baseType || resolved;
    let hp;
    if (bossTier) {
      // 关底首领血量走硬表（4000 / 8000 / 12000 / 50000 / 40000·50000·100000）
      const bh = bossHpFor(baseType, RG.roomIndex);
      hp = bh != null ? bh : Math.round(baseHp * diff.bossHp);
    } else if (baseType === 'tentacleBase' && RG.roomIndex === 2) {
      // 水母母体四根触须：每根 6000 血
      hp = TENTACLE_HP;
    } else {
      hp = Math.round(baseHp * (elite ? 2.6 : 1) * diff.hp);
    }
    if (baseType === 'sewerCroc' && !mini && RG.roomIndex === 4) RG.crocVariant = resolved;
    // 地面怪一律贴地刷新（y 交给 groundBelow 校正）；飞行怪保留巡航高度
    const isFly = def.kind === 'fly' || !!def.fly;
    let sy = sp.y == null ? RG.room.def.start.y : sp.y;
    if (!isFly) sy = groundBelow(sp.x, sy);
    const m = {
      // 亚种复用基础怪的行为与骨架，只替换数值/配色（baseType）
      type: def.baseType || resolved, subType: def.baseType ? resolved : null,
      def: def,
      x: sp.x, y: sy,
      vx: 0, vy: 0, facing: 1,
      hp: hp, hpMax: hp,
      w: def.w * sc, h: def.h * sc,
      onGround: !isFly,
      baseY: sy,
      homeY: sp.flyY != null ? sp.flyY : null,
      minX: sp.range ? sp.range[0] : sp.x - 220,
      maxX: sp.range ? sp.range[1] : sp.x + 220,
      state: 'idle', timer: 0, cd: rnd(0.35, 1.1),
      hurt: 0, invuln: 0, stun: 0,
      drawScale: sc, scale: sc,
      mini: mini, elite: elite,
      dmgMul: (elite ? 1.6 : 1) * (bossTier ? bossDmgFor(baseType, RG.roomIndex) : diff.dmg),
      atkRate: (bossTier ? diff.bossAtk : diff.atk) * (def.atkRate || 1),
      armor: def.armor || 0,
      // BOSS 每次攻击的真伤（无视防御）与控制抗性计时（家族首领均为 miniboss，一并纳入）
      bossLike: bossTier && !mini,
      trueDmg: (bossTier && !mini) ? bossTrueDmgFor(baseType, RG.roomIndex) : 0,
      ccImmuneT: 0,
      poison: !!def.poison,
      phase: 1,
      gasT: 0, seed: idx * 3.7,
      rot: 0, dodgeCd: 0, poise: 0,
      guardT: 0, guardCd: rnd(0.4, 1.4), lastState: 'idle', stT: 0, air: false,
      contactCd: 0, teleg: 0, summonDone: false, telegraphs: [],
    };
    if (isFly) {
      // 飞行迷你 BOSS 默认在竞技场地面上空 300px 悬停
      const fy = sp.flyY != null ? sp.flyY
        : (def.kind === 'miniboss' ? groundBelow(sp.x, sp.y) - 300 : sp.y);
      m.y = fy;
      m.baseY = fy;
      m.homeY = fy;
    }
    RG.monsters.push(m);
    // 关底首领入场：全屏演出（每只首领每局只播一次）
    if (def.kind === 'boss' || def.kind === 'miniboss') {
      if (!RG.introSeen[resolved]) {
        RG.introSeen[resolved] = true;
        startBossIntro(def, resolved);
      }
    }
    return m;
  }

  /* ===================== 全屏 BOSS 入场演出 ===================== */
  function startBossIntro(def, type) {
    RG.bossIntro = {
      t: 0, dur: 2.7, def: def, type: type,
      name: def.name, colors: def.colors || {},
      big: def.kind === 'boss',
      fromLeft: Math.random() < 0.5,
    };
    RG.flash = Math.max(RG.flash, 0.8);
    RG.cam.shake = 18;
    RG.cam.shakeT = 0.8;
    sfx('ko');
  }

  /* ===================== 区域触发生成 =====================
     每个房间分成若干「区域」，玩家向右推进到 triggerX（或向上到 triggerY）时，
     该区域的怪逐只贴地涌出。生成前有 0.95 秒以上的预警，且落点会避开玩家。 */
  function safeSpawnX(sp) {
    const p = RG.player;
    const roomW = (RG.room && RG.room.w) || 1e9;
    let x = sp.x;
    const lo = sp.range ? sp.range[0] : x - 220;
    const hi = sp.range ? sp.range[1] : x + 220;
    if (p && Math.abs(x - p.x) < 420) {
      const dir = p.x <= x ? 1 : -1;
      let cand = p.x + dir * 460;
      if (cand < lo || cand > hi) {
        cand = (Math.abs(lo - p.x) > Math.abs(hi - p.x)) ? lo + 40 : hi - 40;
      }
      if (Math.abs(cand - p.x) < 300) {
        cand = (Math.abs(lo - p.x) > Math.abs(hi - p.x)) ? lo + 50 : hi - 50;
      }
      x = cand;
    }
    return clamp(x, 40, roomW - 40);
  }

  function queueSpawn(sp, k, extraDelay) {
    const def = D.MONSTERS[sp.type];
    const isFly = def && (def.kind === 'fly' || def.fly);
    const warnX = safeSpawnX(sp);
    const sy = sp.y == null ? RG.room.def.start.y : sp.y;
    const warnY = isFly ? (sp.flyY != null ? sp.flyY : sp.y) : groundBelow(warnX, sy);
    const dur = 0.95 + (k || 0) * 0.28 + (extraDelay || 0);
    RG.pending.push({ sp: sp, t: dur, dur: dur, warnX: warnX, warnY: warnY, idx: RG.spawnSeed++ });
  }

  function activateArea(i) {
    const z = RG.areas[i];
    if (!z) return;
    RG.areaIdx = i;
    RG.areaName = z.name;
    for (let k = 0; k < z.spawns.length; k++) queueSpawn(z.spawns[k], k, 0);
    // 数量压制：第 N 关每个区域额外增援 N 只（跳过 BOSS / 迷你 BOSS）
    if (!z.spawns.length) {
      if (i > 0) { toast('区域：' + z.name, 2.4); sfx('ui'); }
      return;
    }
    const diff = roomScale();
    let ex = 0;
    for (let e = 0; e < diff.extra; e++) {
      const src = z.spawns[e % z.spawns.length];
      const d = D.MONSTERS[src.type];
      if (!d || d.kind === 'miniboss' || d.kind === 'boss' || d.kind === 'prop') continue;
      const copy = Object.assign({}, src);
      const dir = e % 2 ? 1 : -1;
      copy.x = src.range
        ? clamp(src.x + dir * 140, src.range[0] + 20, src.range[1] - 20)
        : src.x + dir * 140;
      queueSpawn(copy, z.spawns.length + ex, 1.05 + ex * 0.3);
      ex++;
    }
    if (i > 0) {
      toast('区域：' + z.name, 2.4);
      sfx('ui');
    }
  }

  function updateSpawner(dt) {
    for (let i = RG.pending.length - 1; i >= 0; i--) {
      const q = RG.pending[i];
      q.t -= dt;
      if (q.t > 0) continue;
      // 双保险：生成落点仍与玩家过近时，挪到区间远端再等一小段
      if (RG.player && Math.abs(q.warnX - RG.player.x) < 260) {
        q.warnX = safeSpawnX(q.sp);
        if (Math.abs(q.warnX - RG.player.x) < 260) {
          q.t = 0.3;
          q.dur = Math.max(q.dur || 0.95, 0.3);
          continue;
        }
      }
      RG.pending.splice(i, 1);
      const sp2 = Object.assign({}, q.sp, { x: q.warnX });
      const m = spawnMonster(sp2, q.idx);
      if (m) {
        FX.ring(m.x, m.y - 30, '#8fd46a', 64, 0.5);
        FX.text(m.x, m.y - m.h - 24, '涌出', '#c8ff9a', 16);
      }
    }
    const nextZone = RG.areaIdx + 1;
    if (nextZone < RG.areas.length) {
      const az = RG.areas[nextZone];
      const reachedX = az.triggerX != null && RG.player.x >= az.triggerX;
      const reachedY = az.triggerY != null && RG.player.y <= az.triggerY;
      if (reachedX || reachedY) activateArea(nextZone);
    }
  }

  /* ===================== 主更新 ===================== */

  RG.update = function (dt) {
    RG.time += dt;
    // 震屏衰减必须无条件推进：结算/奖励/死亡等非战斗界面也要归零，避免画面一直抖
    if (RG.cam.shakeT > 0) {
      RG.cam.shakeT -= dt;
      if (RG.cam.shakeT <= 0) { RG.cam.shakeT = 0; RG.cam.shake = 0; }
    } else {
      RG.cam.shake = 0;
    }

    if (RG.screen === 'select') { updateSelect(); return; }
    if (RG.screen === 'codex') { updateCodex(); return; }
    if (RG.screen === 'board') { updateBoard(); return; }
    if (RG.screen === 'buff') { updateBuff(); return; }
    if (RG.screen === 'upgrade') { updateUpgrade(); return; }
    if (RG.screen === 'gshop') { updateGauntletShop(); return; }
    if (RG.screen === 'reward') { updateReward(); return; }
    if (RG.screen === 'dead' || RG.screen === 'win') { updateEnd(dt); return; }
    if (RG.screen !== 'play') return;

    RG.runTime += dt;
    if (RG.introT > 0) RG.introT -= dt;
    if (RG.msgT > 0) RG.msgT -= dt;
    if (RG.flash > 0) RG.flash -= dt * 2.4;
    if (RG.hitstop > 0) { RG.hitstop -= dt; return; }

    // 超必杀冷却（100 秒）
    if (RG.superCd > 0) RG.superCd = Math.max(0, RG.superCd - dt);
    updateExtraSkills(dt);

    // BOSS 入场：全屏演出期间冻结战斗
    if (RG.bossIntro) {
      RG.bossIntro.t += dt;
      if (RG.bossIntro.t >= RG.bossIntro.dur) RG.bossIntro = null;
      return;
    }
    // 超必杀奥义演出：冻结世界，命中帧结算一次
    if (RG.superCut) {
      const cut = RG.superCut;
      cut.t += dt;
      if (RG.player && RG.player.superAnim) RG.player.superAnim.t += dt;
      if (!cut.hit && cut.t >= (cut.hitT || 1.32)) {
        cut.hit = true;
        superStrike();
      }
      if (cut.t >= cut.dur) { RG.superCut = null; if (RG.player) RG.player.superAnim = null; }
      return;
    }
    // 过场动画（鳄鱼逃跑 / 吞噬合体）：冻结世界，定时生成杀手鳄
    if (RG.cine) {
      const ci = RG.cine;
      ci.t += dt;
      if (ci.type === 'devour' && !ci.spawned && ci.t >= ci.spawnAt) {
        ci.spawned = true;
        spawnKillerCroc();
      }
      if (ci.t >= ci.dur) RG.cine = null;
      return;
    }
    // 巨魔倒下 → 鳄鱼从水池钻出合体
    if (RG.crocReturn > 0) {
      RG.crocReturn -= dt;
      if (RG.crocReturn <= 0 && !RG.killerSpawned) spawnKillerCroc();
    }

    // 情赌徒对话/赌局：打开时暂停战斗
    if (RG.gamble) { updateGamble(dt); return; }

    // G：遗物装备栏。打开时暂停战斗，便于阅读遗物/强化说明
    if (RG.relicOpen) {
      if (keyPress(['KeyG', 'Escape'])) { RG.relicOpen = false; sfx('ui'); }
      return;
    }
    if (keyPress(['KeyG'])) { RG.relicOpen = true; sfx('ui'); return; }

    if (keyPress(['Escape'])) { BVN.Game.gotoTitle(); return; }
    if (RG.relicPopT > 0) RG.relicPopT -= dt;

    // 先刷新场景道具的可交互状态，再处理玩家输入：
    // 否则按 E 的那一帧读到的是上一帧的 near，刚走进范围时会判定落空
    updateProps(dt);
    updatePoison(dt);
    updatePlayer(dt);
    updateSpawner(dt);
    updateMonsters(dt);
    updateProjectiles(dt);
    updatePlayerShots(dt);
    updateZones(dt);
    updateFuses(dt);
    updateTraps(dt);
    updateHazards(dt);
    updateCamera(dt);

    // 过关条件：击杀关底首领（不再要求清空全图小怪）
    if (RG.mode === 'gauntlet') {
      // 连战：首领倒下 → 短暂停顿 → 补给（或最终通关）
      if (RG.bossKilled && RG.clearT < 0) {
        RG.clearT = 1.4;
        toast(RG.killerSpawned ? '痂香杀手鳄倒下 · 连战全通！' : '首领倒下 · 准备进入补给', 3);
        sfx('fight');
      }
      if (RG.clearT > 0) {
        RG.clearT -= dt;
        if (RG.clearT <= 0) { RG.clearT = 0; gauntletClear(); }
      }
    } else if (!RG.room.def.boss) {
      if (RG.bossKilled && RG.clearT < 0) {
        RG.clearT = 1;
        RG.gate.open = true;
        toast('关底首领已倒下 · 前往右侧闸门', 3);
        sfx('fight');
      }
      if (RG.clearT > 0) RG.clearT -= dt;
    } else if (RG.bossKilled && RG.endT <= 0) {
      RG.endT = 2.4;
      RG.screen = 'win';
      RG.screenT = 0;
      toast(RG.killerSpawned ? '痂香杀手鳄倒下了' : '痂香巨魔倒下了', 3);
      sfx('ko');
      FX.ring(RG.player.x, 400, '#ffd166', 420, 1.2);
    }
  };

  /* ===================== 角色选择 ===================== */

  function updateSelect() {
    if (keyPress(['ArrowLeft', 'KeyA'])) {
      RG.charIndex = (RG.charIndex + 7) % 8;
      sfx('ui');
    }
    if (keyPress(['ArrowRight', 'KeyD'])) {
      RG.charIndex = (RG.charIndex + 1) % 8;
      sfx('ui');
    }
    // 模式切换：普通爬塔 / BOSS 连战
    if (keyPress(['Tab', 'KeyM', 'ArrowUp', 'KeyW', 'ArrowDown', 'KeyS'])) {
      RG.modeIndex = RG.modeIndex ? 0 : 1;
      sfx('ui');
    }
    if (keyPress(['Enter', 'Space', 'KeyJ'])) {
      sfx('uiPick');
      RG.resetRun(RG.charIndex, RG.modeIndex ? 'gauntlet' : 'normal');
    }
    if (keyPress(['KeyL'])) {
      RG.openBoard(RG.modeIndex);
      return;
    }
    if (keyPress(['Escape', 'Backspace'])) {
      sfx('uiBack');
      BVN.Game.gotoTitle();
    }
  }

  /* ===================== 玩家更新 ===================== */

  function updatePlayer(dt) {
    const p = RG.player;
    const mods = p.mods;
    const left = keyDown(['KeyA', 'ArrowLeft']);
    const right = keyDown(['KeyD', 'ArrowRight']);

    p.invuln = Math.max(0, p.invuln - dt);
    p.hurtT = Math.max(0, p.hurtT - dt);
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.rollCd = Math.max(0, p.rollCd - dt);
    p.antidote = Math.max(0, p.antidote - dt);
    p.comboT = Math.max(0, p.comboT - dt);
    p.shotCd = Math.max(0, (p.shotCd || 0) - dt);
    RG.skillCd = Math.max(0, RG.skillCd - dt);
    RG.fightCd = Math.max(0, RG.fightCd - dt);
    if (p.stimT > 0) p.stimT = Math.max(0, p.stimT - dt);
    if (p.wardT > 0) p.wardT = Math.max(0, p.wardT - dt);
    if (p.rageT > 0) p.rageT = Math.max(0, p.rageT - dt);
    if (p.shieldT > 0) p.shieldT = Math.max(0, p.shieldT - dt);
    // 蜈蚣绞杀 / 触手缠绕：被控期间无法自主移动
    if (p.rootT > 0) p.rootT = Math.max(0, p.rootT - dt);
    if (p.rapid) updateRapid(p, dt);
    if (RG.skillFx) {
      RG.skillFx.t -= dt;
      if (RG.skillFx.t <= 0) RG.skillFx = null;
    }
    if (p.comboT === 0) p.combo = 0;
    p.animT += dt;

    // 攻击推进
    if (p.attack) {
      p.attack.t += dt;
      if (p.attack.t >= p.attack.dur) {
        p.attack = null;
      } else if (!p.attack.hit && p.attack.t >= p.attack.hitStart) {
        playerAttackCheck(p.attack);
      }
    }

    // 翻滚（空格 / R）：无长冷却，但落地后需要短暂收势，翻滚全程无敌
    if (p.rollT > 0) {
      p.rollT -= dt;
      p.vx = p.rollDir * 620;
      p.vy = Math.min(p.vy, 240);
      p.invuln = Math.max(p.invuln, 0.1);
      if (p.rollT <= 0) { p.rollCd = 0.5; p.vx *= 0.55; }
    } else if (!p.attack && p.hurtT <= 0 && p.dashT <= 0 && p.rollCd <= 0 &&
               keyPress(['Space', 'KeyR'])) {
      p.rollT = p.rollMax;
      p.rollDir = p.facing;
      p.invuln = Math.max(p.invuln, p.rollMax + 0.08);
      sfx('dash');
      FX.burst(p.x, p.y - 50, 9, { colors: ['#c9f0ff', '#ffffff'], speedMin: 40, speedMax: 210, angle: p.rollDir > 0 ? Math.PI : 0, spread: 0.5, sizeMin: 2, sizeMax: 5, lifeMin: 0.2, lifeMax: 0.4, grav: 160 });
    }

    // 冲刺
    if (p.rollT > 0) {
      // 翻滚：锁死水平移动，保留重力与落地
      p.vy += 2200 * dt;
      if (p.vy > 1100) p.vy = 1100;
    } else if (p.dashT > 0) {
      p.dashT -= dt;
      p.vx = p.dashDir * 720;
      p.vy = 0;
      if (p.dashT <= 0) p.vx *= 0.5;
    } else {
      // 水平移动
      let speed = 300 * mods.moveMul;
      if (p.slowT > 0) speed *= 0.62;
      if (p.hurtT > 0) speed *= 0.45;
      if (p.rootT > 0) p.vx = lerp(p.vx, 0, 0.7);
      else if (left && !right) { p.vx = lerp(p.vx, -speed, 0.22); p.facing = -1; }
      else if (right && !left) { p.vx = lerp(p.vx, speed, 0.22); p.facing = 1; }
      else p.vx = lerp(p.vx, 0, 0.3);
      // 重力（腐翼遗物：长按 W 滑翔，缓降）
      let grav = 2450;
      const gliding = mods.glide && !p.onGround && keyDown(['KeyW', 'ArrowUp']) && p.vy > -260;
      if (gliding) grav = 520;
      p.vy += grav * dt;
      if (p.vy > 1200) p.vy = 1200;
      if (gliding && p.vy > 235) p.vy = 235;
      if (mods.glide && p.glideFx > 0) p.glideFx -= dt;
    }

    // 跳
    if (p.onGround) { p.coyote = 0.1; if (p.jumps > 0) p.jumps = 0; }
    else p.coyote = Math.max(0, p.coyote - dt);
    if (keyPress(['KeyW', 'ArrowUp']) && p.rollT <= 0) p.jumpBuf = 0.14;
    if (p.jumpBuf > 0) p.jumpBuf -= dt;
    // 跳：全员默认二段跳；天使可无限连跳；「三段跳」类强化再加一段
    const maxJumps = mods.infiniteJump ? 999 : 2 + (mods.extraJump || 0);
    if (p.jumpBuf > 0) {
      const ok = p.onGround || p.coyote > 0 || (!p.onGround && p.jumps < maxJumps);
      if (ok) {
        p.vy = -880 * (mods.jumpMul || 1);
        p.onGround = false;
        p.coyote = 0;
        p.jumpBuf = 0;
        p.jumps = p.jumps === 0 ? 1 : p.jumps + 1;
        sfx('jump');
        FX.burst(p.x, p.y, 6, { color: '#9be0b0', speedMin: 30, speedMax: 150, sizeMin: 1.5, sizeMax: 3.5, lifeMin: 0.2, lifeMax: 0.4 });
      }
    }

    // 冲刺触发
    if (keyPress(['ShiftLeft', 'ShiftRight']) && p.dashT <= 0 && p.dashCd <= 0 && !p.attack && p.rollT <= 0) {
      p.dashT = 0.2;
      p.dashDir = p.facing;
      p.dashCd = 0.95 * mods.dashCdMul;
      p.invuln = Math.max(p.invuln, 0.32);
      sfx('dash');
      FX.burst(p.x, p.y - 70, 10, { colors: ['#a8f0c8', '#ffffff'], speedMin: 60, speedMax: 260, angle: p.dashDir > 0 ? Math.PI : 0, spread: 0.5, sizeMin: 2, sizeMax: 5, lifeMin: 0.2, lifeMax: 0.4, grav: 200 });
    }

    // 攻击
    if (!p.attack && p.hurtT <= 0 && p.rollT <= 0) {
      if (keyPress(['KeyJ', 'Digit1', 'Numpad1'])) startAttack(p, 'light');
      else if (keyPress(['KeyK', 'Digit2', 'Numpad2'])) startAttack(p, 'heavy');
    }

    // 远程（角色专属）
    if (keyPress(['KeyL', 'Digit3', 'Numpad3']) && !p.attack && p.shotCd <= 0 && p.rollT <= 0) {
      fireRanged(p);
    }

    // 技能（I 键，冷却制）
    if (keyPress(['KeyI', 'Digit4', 'Numpad4']) && RG.skillCd <= 0 && p.hurtT <= 0 && p.rollT <= 0) {
      castSkill(p);
    }

    // 格斗技 / 必杀（U / Y，消耗气槽）
    if (keyPress(['KeyU']) && p.hurtT <= 0 && p.rollT <= 0) castFight(p, 'skill');
    if (keyPress(['KeyY']) && p.hurtT <= 0 && p.rollT <= 0) castFight(p, 'ult');

    // 超必杀（V）：奥义演出 + 100 秒冷却，全屏高额伤害
    if (keyPress(['KeyV']) && RG.superCd <= 0 && !RG.superCut && p.hurtT <= 0 && p.rollT <= 0) {
      castSuper(p);
    }

    // 遗物额外技能：T 光波 / F 缚魂 / H 回血 / N 结界（每个独立按键与冷却）
    if (p.mods.skills) {
      if (keyPress(['KeyT'])) castExtraSkill(p, 'wave');
      if (keyPress(['KeyF'])) castExtraSkill(p, 'bind');
      if (keyPress(['KeyH'])) castExtraSkill(p, 'mend');
      if (keyPress(['KeyN'])) castExtraSkill(p, 'aegis');
    }

    // 使用道具（Q 键）
    if (keyPress(['KeyQ'])) useItem();

    // 交互
    let interact = keyPress(['KeyE', 'Digit5', 'Numpad5']);
    if (interact) {
      if (!tryInteract()) { /* 空地按 E 无反馈 */ }
    }

    // 与场景碰撞
    collide(p, dt);
    // 天使必杀：俯冲落地结算
    if (p.ultDive && p.onGround) {
      const u = p.ultDive;
      p.ultDive = null;
      RG.cam.shake = 16; RG.cam.shakeT = 0.5;
      FX.ring(p.x, p.y - 30, '#ffe9a0', u.radius || 260, 0.7);
      FX.burst(p.x, p.y - 40, 26, { colors: ['#ffe9a0', '#ffffff'], speedMin: 140, speedMax: 520, sizeMin: 3, sizeMax: 8, lifeMin: 0.3, lifeMax: 0.7, grav: 380 });
      areaDamage(null, p.x, p.y - 70, u.radius || 260, u.burst || 160, 'ult');
      sfx('heavy');
    }
    // 世界边界
    p.x = clamp(p.x, 24, RG.room.w - 24);
    // 酸液 / 坠落
    checkAcid(p, dt);
    // 机关伤害
    checkSteam(p);
    checkPendulum(p);
    // 接触伤害
    for (let i = 0; i < RG.monsters.length; i++) {
      const m = RG.monsters[i];
      if (m.dead) continue;
      const cx = m.x, cy = m.y - m.h * 0.5;
      if (Math.abs(cx - p.x) < (m.w + p.w) * 0.5 - 8 &&
          Math.abs(cy - (p.y - p.h * 0.5)) < (m.h + p.h) * 0.5 - 12) {
        contactHurt(m, 1);
      }
    }
    // 姿态
    updatePose(p, dt);
  }

  /* 直接照搬格斗模式（fighter.js attackPose）的轻击三段 / 重击关键帧。
     远程没有独立格斗招式，使用同源的 light3 投掷式。 */
  function rogueAttackKey(att) {
    if (att.kind === 'heavy') return 'heavy';
    if (att.kind === 'ranged') return 'ranged';
    return att.combo === 3 ? 'light3' : (att.combo === 2 ? 'light2' : 'light1');
  }

  function applyRogueAttackPose(P, key, k) {
    if (key === 'heavy') {
      P.afu = k < 0.32 ? -1.15 : (k < 0.58 ? 2.1 : 1.0);
      P.aff = k < 0.32 ? 1.45 : 0.14;
      P.t = k < 0.32 ? -0.3 : 0.32;
      P.c = k < 0.32 ? 14 : 8;
      P.abu = k < 0.32 ? -1.3 : 0.5;
      P.abf = 0.9;
      P.lft = k < 0.32 ? 0.1 : 0.42;
      P.lfs = -0.3;
      P.lbt = -0.34;
      P.lbs = -0.26;
    } else if (key === 'light3' || key === 'ranged') {
      P.afu = k < 0.3 ? -0.9 : 2.15;
      P.aff = k < 0.3 ? 1.2 : 0.12;
      P.t = k < 0.3 ? -0.2 : 0.34;
      P.abu = 0.6;
      P.abf = 0.9;
      P.c = 11;
      P.lft = 0.34;
      P.lfs = -0.3;
      P.lbt = -0.36;
      P.lbs = -0.24;
    } else {
      P.afu = k < 0.2 ? -0.55 : (k < 0.45 ? 1.55 : 0.8);
      P.aff = k < 0.45 ? 0.05 : 0.7;
      P.t = k < 0.45 ? 0.2 : 0.1;
      P.abu = -0.55;
      P.abf = 1.15;
      P.c = 9;
      P.lft = 0.3;
      P.lfs = -0.26;
      P.lbt = -0.3;
      P.lbs = -0.22;
    }
  }

  function updatePose(p, dt) {
    const target = Object.assign({}, BVN.POSE_DEFAULT);
    const run = Math.abs(p.vx) > 60 && p.onGround;
    const t = p.animT;
    if (!p.onGround) {
      target.t = 0.2;
      target.c = 14;
      target.lft = 0.9; target.lfs = -1.05;
      target.lbt = 0.2; target.lbs = -0.6;
      target.afu = 0.9; target.aff = 0.5;
      target.abu = -0.7; target.abf = 0.5;
    } else if (run) {
      const s = Math.sin(t * 12);
      target.t = 0.18;
      target.lft = 0.2 + s * 0.75;
      target.lfs = -0.2;
      target.lbt = -0.2 - s * 0.75;
      target.lbs = -0.2;
      target.afu = 0.55 - s * 0.6;
      target.abu = -0.34 + s * 0.6;
      target.c = 8;
    } else {
      target.t = 0.05 + Math.sin(t * 2) * 0.02;
      target.c = 6 + Math.sin(t * 2) * 1.2;
    }
    if (p.hurtT > 0) {
      target.t = -0.3;
      target.h = -0.2;
      target.afu = 1.7; target.abu = -1.6;
      target.c = 4;
    }
    if (p.attack) {
      const kp = clamp(p.attack.t / p.attack.dur, 0, 1);
      applyRogueAttackPose(target, rogueAttackKey(p.attack), kp);
    }
    if (p.dashT > 0) {
      target.t = 0.5; target.c = 16;
      target.lft = 0.95; target.lfs = -0.5;
      target.lbt = -0.75; target.lbs = -0.55;
      target.afu = -0.9; target.aff = 0.5;
      target.abu = -1.2; target.abf = 0.4;
    }
    const k = p.attack ? 0.4 : 0.24;
    for (const key in target) {
      if (!Object.prototype.hasOwnProperty.call(target, key)) continue;
      p.pose[key] = lerp(p.pose[key] == null ? target[key] : p.pose[key], target[key], k);
    }
  }

  function startAttack(p, kind) {
    p.hitIds = [];
    if (kind === 'light') {
      p.combo = (p.combo % 3) + 1;
      p.comboT = 0.85;
      const dur = (p.combo === 3 ? 0.4 : 0.34) / p.mods.atkSpeed;
      p.attack = { kind: 'light', combo: p.combo, t: 0, dur: dur, hitStart: 0.08, hit: false };
      if (p.onGround) p.vx += p.facing * 90;
      sfx('light');
    } else {
      p.combo = 0;
      const dur = 0.56 / p.mods.atkSpeed;
      p.attack = { kind: 'heavy', combo: 0, t: 0, dur: dur, hitStart: 0.2, hit: false };
      if (p.onGround) p.vx += p.facing * 130;
      sfx('heavy');
    }
  }

  function playerAttackCheck(att) {
    if (att.kind === 'ranged') return;
    const p = RG.player;
    const M = D.MELEE[RG.char.id] || D.MELEE.hannya;
    att.hit = true;
    const reach = 104 * M.reach * p.mods.reach * (att.kind === 'heavy' ? 1.18 : 1);
    const hh = att.kind === 'heavy' ? 156 : 132;
    const rect = {
      x: att.kind === 'heavy' ? p.x - (p.facing > 0 ? 18 : reach) : p.x + (p.facing > 0 ? 8 : -reach),
      y: p.y - hh - 6,
      w: reach + 18,
      h: hh + 10,
    };
    // 刀光（颜色与弧度按角色）
    const arc = (M.arc || 1.5) * 0.72;
    FX.slashArc(
      p.x + p.facing * 24, p.y - 86,
      att.kind === 'heavy' ? 132 : 102,
      p.facing > 0 ? -arc : Math.PI - arc * 0.55,
      p.facing > 0 ? arc : Math.PI + arc * 0.55,
      M.color || '#b9ffd6',
      att.kind === 'heavy' ? 16 : 10
    );

    let base = att.kind === 'heavy' ? (M.heavy || 30) : (M.light || 13);
    if (att.kind === 'light' && att.combo === 3) base *= 1.35 + p.mods.comboBoost;
    if (att.kind === 'heavy') base *= p.mods.heavyMul;
    base *= p.mods.dmgMul;
    if (p.rageT > 0) base *= 1 + (p.rageMul || 0);
    if (p.mods.lowHpDmg && p.hp < p.hpMax * 0.3) base *= (1 + p.mods.lowHpDmg);
    if (p.stimT > 0) base *= 1.3;

    // 同时命中场景里的滚粪球
    ballHitCheck(rect, Math.round(base * (att.kind === 'heavy' ? 1.1 : 0.8)));

    let hitAny = false;
    for (let i = RG.monsters.length - 1; i >= 0; i--) {
      const m = RG.monsters[i];
      if (m.dead || m.stun > 0 && m.invuln > 0) continue;
      const box = { x: m.x - m.w * 0.5, y: m.y - m.h, w: m.w, h: m.h };
      if (!overlap(rect, box)) continue;
      // 每个目标每次攻击只吃一次
      if (p.hitIds.indexOf(m) >= 0) continue;
      p.hitIds.push(m);
      hitAny = true;
      const dmg = computeDamage(m, base, att.kind);
      hitMonster(m, dmg, att.kind, p.x);
    }
    if (!hitAny) return;
    if (p.hitIds.length > 12) p.hitIds.length = 0;
    sfx(att.kind === 'heavy' ? 'slash' : 'light');
  }

  /* ===================== 远程 / 技能 ===================== */

  function nearestMonster(x, y, maxD) {
    let best = null, bd = maxD || 1e9;
    for (let i = 0; i < RG.monsters.length; i++) {
      const m = RG.monsters[i];
      if (m.dead) continue;
      const d = Math.hypot(m.x - x, (m.y - m.h * 0.5) - y - 20) + (m.def.kind === 'prop' ? 240 : 0);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  function fireRanged(p) {
    const R0 = D.RANGED[RG.char.id] || D.RANGED.hannya;
    p.shotCd = R0.cd;
    let dmg = (R0.dmg || 15) * (p.mods.rangedMul || 1) * (p.mods.dmgMul || 1);
    if (p.rageT > 0) dmg *= 1 + (p.rageMul || 0);
    if (p.stimT > 0) dmg *= 1.3;
    dmg = Math.round(dmg);
    const ox = p.x + p.facing * 34;
    const oy = p.y - 96;
    const count = R0.count || 1;
    const spread = R0.spread || 0;
    const baseAng = p.facing > 0 ? 0 : Math.PI;
    for (let i = 0; i < count; i++) {
      const off = count > 1 ? (i - (count - 1) * 0.5) * spread : 0;
      const ang = baseAng + off;
      RG.pShots.push({
        x: ox, y: oy,
        vx: Math.cos(ang) * R0.speed, vy: Math.sin(ang) * R0.speed,
        r: R0.r || 14, dmg: dmg, life: R0.life || 1.5, max: R0.life || 1.5,
        pierce: R0.pierce || 0, homing: !!R0.homing, explode: R0.explode || 0,
        lifesteal: R0.lifesteal || 0, color: R0.color || '#b9ffd6',
        name: R0.name, rot: 0, hitIds: [],
      });
    }
    sfx('fire');
    FX.burst(ox, oy, 5, { color: R0.color, speedMin: 40, speedMax: 180, sizeMin: 2, sizeMax: 4, lifeMin: 0.15, lifeMax: 0.3, angle: baseAng, spread: 0.5 });
    // 远程攻击动作：照搬格斗模式的投掷关键帧（仅演出，不触发近战判定）
    p.attack = { kind: 'ranged', combo: 0, t: 0, dur: 0.34, hitStart: 999, hit: true };
  }

  function updatePlayerShots(dt) {
    for (let i = RG.pShots.length - 1; i >= 0; i--) {
      const b = RG.pShots[i];
      b.life -= dt;
      if (b.homing) {
        const tgt = nearestMonster(b.x, b.y);
        if (tgt) {
          const sp = Math.hypot(b.vx, b.vy) || 1;
          const want = Math.atan2((tgt.y - tgt.h * 0.5 - 20) - b.y, tgt.x - b.x);
          let cur = Math.atan2(b.vy, b.vx);
          let d = want - cur;
          while (d > Math.PI) d -= TAU;
          while (d < -Math.PI) d += TAU;
          cur += clamp(d, -3.4 * dt, 3.4 * dt);
          b.vx = Math.cos(cur) * sp;
          b.vy = Math.sin(cur) * sp;
        }
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot = (b.rot || 0) + dt * 12;
      ballHitCheck({ x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 }, Math.round(b.dmg * 0.6));
      for (let k = RG.monsters.length - 1; k >= 0; k--) {
        const m = RG.monsters[k];
        if (m.dead || b.hitIds.indexOf(m) >= 0) continue;
        const box = { x: m.x - m.w * 0.5, y: m.y - m.h, w: m.w, h: m.h };
        if (!overlap({ x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 }, box)) continue;
        b.hitIds.push(m);
        const dmg = computeDamage(m, b.dmg, 'ranged');
        hitMonster(m, dmg, 'light', b.x);
        if (b.lifesteal) healPlayer(b.lifesteal, true);
        if (b.explode) {
          FX.ring(b.x, b.y, b.color, b.explode, 0.4);
          for (let q = 0; q < RG.monsters.length; q++) {
            const o = RG.monsters[q];
            if (o.dead || o === m) continue;
            if (Math.abs(o.x - b.x) < b.explode && Math.abs((o.y - o.h * 0.5) - b.y) < b.explode) {
              hitMonster(o, Math.round(b.dmg * 0.7), 'heavy', b.x);
            }
          }
        }
        if (b.pierce > 0) b.pierce--;
        else { RG.pShots.splice(i, 1); break; }
      }
      if (b.life <= 0 || b.x < -90 || b.x > RG.room.w + 90 || b.y < -200 || b.y > RG.room.h + 200) {
        if (RG.pShots.indexOf(b) >= 0) RG.pShots.splice(i, 1);
      }
    }
  }

  function areaDamage(p, x, y, radius, dmg, kind, srcX) {
    let total = 0;
    for (let i = 0; i < RG.monsters.length; i++) {
      const m = RG.monsters[i];
      if (m.dead) continue;
      if (Math.hypot(m.x - x, (m.y - m.h * 0.5) - y) > radius + m.w * 0.35) continue;
      const real = computeDamage(m, dmg, kind);
      hitMonster(m, real, kind, srcX != null ? srcX : (p ? p.x : x));
      total += real;
    }
    return total;
  }

  /* 延迟打击（陨石 / 诅咒 / 鬼影）：到点后在目标位置结算范围伤害 */
  function pushFuse(x, y, t, r, dmg, kind, color) {
    RG.fuses.push({ x: x, y: y, t: t, max: t, r: r, dmg: dmg, kind: kind || 'ult', color: color || '#ffd166' });
  }

  function updateFuses(dt) {
    for (let i = RG.fuses.length - 1; i >= 0; i--) {
      const f = RG.fuses[i];
      f.t -= dt;
      if (f.t > 0) continue;
      RG.fuses.splice(i, 1);
      FX.ring(f.x, f.y, f.color, f.r, 0.5);
      FX.ring(f.x, f.y, '#ffffff', f.r * 0.5, 0.3);
      FX.burst(f.x, f.y, 12, { colors: [f.color, '#ffffff'], speedMin: 60, speedMax: 330, sizeMin: 2, sizeMax: 6, lifeMin: 0.2, lifeMax: 0.5, grav: 160 });
      areaDamage(null, f.x, f.y, f.r, f.dmg, f.kind);
      RG.cam.shake = Math.max(RG.cam.shake, 7);
      RG.cam.shakeT = Math.max(RG.cam.shakeT, 0.22);
    }
  }

  function updateRapid(p, dt) {
    const r = p.rapid;
    r.t += dt;
    r.interval = r.interval || 0.07;
    while (r.t >= r.interval && r.left > 0) {
      r.t -= r.interval;
      r.left--;
      const reach = r.reach || 130;
      let hit = false;
      for (let i = 0; i < RG.monsters.length; i++) {
        const m = RG.monsters[i];
        if (m.dead) continue;
        const front = (m.x - p.x) * p.facing;
        if (front > -40 && front < reach && Math.abs((m.y - m.h * 0.5) - (p.y - 90)) < 110) {
          hitMonster(m, computeDamage(m, r.dmg, r.kind || 'light'), r.kind || 'light', p.x);
          hit = true;
        }
      }
      FX.hitSpark(p.x + p.facing * (70 + rnd(-10, 30)), p.y - 100 + rnd(-40, 40), 1.1, '#8fe0ff');
      if (hit) { RG.cam.shake = 4; RG.cam.shakeT = 0.12; }
      sfx('light');
    }
    if (r.left <= 0) p.rapid = null;
  }

  function castSkill(p) {
    const S = D.SKILLS[RG.char.id] || D.SKILLS.hannya;
    RG.skillCd = S.cd * (p.mods.skillCdMul || 1);
    const mul = (p.mods.skillMul || 1) * (p.mods.dmgMul || 1) * (p.stimT > 0 ? 1.3 : 1);
    const dmg = Math.round((S.dmg || 0) * mul);
    const cx = p.x, cy = p.y - 90;
    RG.skillFx = { name: S.name, color: S.color, t: 0.7, max: 0.7, type: S.type };
    sfx('holy');
    FX.text(p.x, p.y - 200, S.name, S.color, 26, true);

    if (S.type === 'burst') {
      p.rageT = S.buff.t;
      p.rageMul = S.buff.dmgMul;
      FX.ring(cx, cy, S.color, S.radius, 0.5);
      FX.ring(cx, cy, '#ffffff', S.radius * 0.55, 0.34);
      RG.flash = 0.35;
      RG.cam.shake = 14; RG.cam.shakeT = 0.4;
      areaDamage(p, cx, cy, S.radius, dmg, 'heavy');

    } else if (S.type === 'sky') {
      healPlayer(Math.round(p.hpMax * S.heal), true);
      FX.text(p.x, p.y - 170, '+' + Math.round(p.hpMax * S.heal), '#7dffa8', 26);
      p.vy = -720;
      p.onGround = false;
      FX.ring(cx, cy, S.color, S.radius, 0.5);
      areaDamage(p, cx, cy, S.radius, dmg, 'heavy');
      FX.burst(cx, cy, 26, { colors: ['#ffe9a0', '#ffffff'], speedMin: 60, speedMax: 340, sizeMin: 2, sizeMax: 6, lifeMin: 0.3, lifeMax: 0.7 });

    } else if (S.type === 'rapid') {
      p.rapid = { left: S.hits, t: 0, interval: 0.075, dmg: Math.round((S.dmg || 14) * mul), reach: S.reach };
      RG.skillFx.t = 1.0; RG.skillFx.max = 1.0;

    } else if (S.type === 'blink') {
      const from = p.x;
      const to = clamp(p.x + p.facing * S.dist, 24, RG.room.w - 24);
      const rect = { x: Math.min(from, to) - 40, y: p.y - 200, w: Math.abs(to - from) + 80, h: 210 };
      for (let i = 0; i < RG.monsters.length; i++) {
        const m = RG.monsters[i];
        if (m.dead) continue;
        if (overlap(rect, { x: m.x - m.w * 0.5, y: m.y - m.h, w: m.w, h: m.h })) hitMonster(m, computeDamage(m, dmg, 'heavy'), 'heavy', from);
      }
      p.x = to;
      p.invuln = Math.max(p.invuln, S.invuln || 0.7);
      p.vx *= 0.3;
      for (let g = 0; g <= 5; g++) {
        const gx = lerp(from, to, g / 5);
        FX.ring(gx, p.y - 90, S.color, 60, 0.3);
      }
      FX.text(to, p.y - 180, '残影', S.color, 22);
      RG.cam.shake = 8; RG.cam.shakeT = 0.25;

    } else if (S.type === 'armor') {
      p.shieldT = S.t;
      p.shieldMul = S.shield;
      FX.ring(cx, cy, S.color, S.radius, 0.5);
      FX.ring(cx, cy, '#ffffff', S.radius * 0.5, 0.35);
      areaDamage(p, cx, cy, S.radius, dmg, 'heavy');
      RG.cam.shake = 12; RG.cam.shakeT = 0.4;

    } else if (S.type === 'drain') {
      const total = areaDamage(p, cx, cy, S.radius, dmg, 'light');
      const heal = Math.round(total * S.healRatio);
      if (heal > 0) {
        healPlayer(heal, true);
        FX.text(p.x, p.y - 170, '+' + heal, '#c9a0ff', 26);
      }
      FX.ring(cx, cy, S.color, S.radius, 0.6);
      FX.ring(cx, cy, S.color, S.radius * 0.4, 0.45);

    } else if (S.type === 'shot') {
      RG.pShots.push({
        x: p.x + p.facing * 40, y: p.y - 92,
        vx: p.facing * (S.speed || 900), vy: 0,
        r: S.size || 26, dmg: dmg, life: 2.4, max: 2.4,
        pierce: S.pierce || 99, homing: false, explode: 0, lifesteal: 0,
        color: S.color, name: S.name, rot: 0, hitIds: [],
      });
      RG.flash = 0.25;
      RG.cam.shake = 8; RG.cam.shakeT = 0.3;

    } else if (S.type === 'draw') {
      const rect = {
        x: p.facing > 0 ? p.x : p.x - S.reach,
        y: p.y - 230, w: S.reach, h: 240,
      };
      for (let i = 0; i < RG.monsters.length; i++) {
        const m = RG.monsters[i];
        if (m.dead) continue;
        if (overlap(rect, { x: m.x - m.w * 0.5, y: m.y - m.h, w: m.w, h: m.h })) hitMonster(m, computeDamage(m, dmg, 'heavy'), 'heavy', p.x);
      }
      FX.slashArc(p.x + p.facing * S.reach * 0.45, p.y - 110, S.reach * 0.55, p.facing > 0 ? -0.6 : Math.PI - 0.6, p.facing > 0 ? 0.6 : Math.PI + 0.6, S.color, 22);
      RG.flash = 0.4;
      RG.cam.shake = 16; RG.cam.shakeT = 0.45;
    }
  }

  /* ===================== 遗物额外技能（T / F / H / N 各自独立按键） ===================== */
  const EXTRA_DEFS = {
    wave: { key: 'T', name: '圣光波', color: '#ffe9a0' },
    bind: { key: 'F', name: '缚魂锁', color: '#b8a0ff' },
    mend: { key: 'H', name: '生命之泉', color: '#7dffa8' },
    aegis: { key: 'N', name: '守护结界', color: '#bfe8ff' },
  };
  function extraCdFor(lv) { return Math.max(4, 10 - 1.2 * (lv - 1)); }

  function castExtraSkill(p, id) {
    const lv = p.mods && p.mods.skills ? (p.mods.skills[id] || 0) : 0;
    if (!lv || !RG.extraCd) return;
    if (RG.extraCd[id] > 0 || p.hurtT > 0 || p.rollT > 0) return;
    const D2 = EXTRA_DEFS[id];
    if (!D2) return;
    RG.extraCd[id] = extraCdFor(lv);
    const cx = p.x, cy = p.y - 90;
    if (id === 'wave') {
      const dmg = Math.round(88 * (1 + 0.25 * (lv - 1)) * (p.mods.skillMul || 1) * (p.mods.dmgMul || 1));
      RG.pShots.push({
        x: p.x + p.facing * 40, y: p.y - 92,
        vx: p.facing * 900, vy: 0,
        r: 30, dmg: dmg, life: 1.6, max: 1.6,
        pierce: 99, homing: false, explode: 0, lifesteal: 0,
        color: D2.color, name: D2.name, rot: 0, hitIds: [], wave: true,
      });
      FX.text(p.x, p.y - 200, D2.name + ' Lv' + lv, D2.color, 24, true);
      FX.ring(cx, cy, D2.color, 90, 0.35);
      RG.flash = Math.max(RG.flash, 0.2);
      sfx('holy');
    } else if (id === 'bind') {
      const dur = (1.5 + 0.35 * lv);
      FX.ring(cx, cy, D2.color, 500, 0.6);
      FX.ring(cx, cy, '#ffffff', 360, 0.4);
      for (let i = 0; i < RG.monsters.length; i++) {
        const m = RG.monsters[i];
        if (m.dead || m.def.kind === 'prop') continue;
        if (Math.abs(m.x - cx) < 520 && Math.abs(m.y - cy) < 360) {
          if (m.bossLike) {
            const d = bossCcApply(m, '束缚', dur);
            if (d > 0) m.rootT = Math.max(m.rootT || 0, d);
          } else {
            const ctrl = m.def.kind === 'miniboss' ? 0.7 : 1;
            m.rootT = Math.max(m.rootT || 0, dur * ctrl);
            FX.text(m.x, m.y - m.h - 12, '束缚', D2.color, 18);
          }
        }
      }
      FX.text(p.x, p.y - 200, D2.name + ' Lv' + lv, D2.color, 24, true);
      sfx('holy');
    } else if (id === 'mend') {
      const heal = Math.round(p.hpMax * (0.10 + 0.04 * lv));
      healPlayer(heal, true);
      FX.text(p.x, p.y - 190, '+' + heal, D2.color, 28);
      FX.ring(cx, cy, D2.color, 120, 0.5);
      sfx('holy');
    } else if (id === 'aegis') {
      p.shieldT = Math.max(p.shieldT || 0, 4);
      p.shieldMul = Math.min(0.55, 0.25 + 0.06 * lv);
      FX.ring(cx, cy, D2.color, 110, 0.5);
      FX.ring(cx, cy, '#ffffff', 70, 0.35);
      FX.text(p.x, p.y - 200, D2.name + ' Lv' + lv, D2.color, 24, true);
      sfx('block');
    }
  }

  function updateExtraSkills(dt) {
    if (!RG.extraCd) return;
    for (const k in RG.extraCd) if (RG.extraCd[k] > 0) RG.extraCd[k] = Math.max(0, RG.extraCd[k] - dt);
  }

  /* ===================== 超必杀（V · 奥义演出 · 100 秒冷却） ===================== */
  const SUPER_CD = 100;

  function castSuper(p) {
    const def = (BVN.SUPERS && BVN.SUPERS[RG.char.id]) || null;
    if (!def) return;
    RG.superCd = SUPER_CD;
    const dur = Math.max(2.0, Math.min(2.8, (def.total || 150) / 60));
    // 打击帧：取 phases 里的 hit 帧（无则取 55% 处）
    let hitT = dur * 0.55;
    if (def.phases && def.phases.length) {
      for (let i = 0; i < def.phases.length; i++) {
        if (def.phases[i].n === 'hit') hitT = (def.phases[i].s || 0) / 60;
      }
    }
    hitT = clamp(hitT, 0.7, dur - 0.25);
    RG.superCut = { t: 0, dur: dur, hitT: hitT, hit: false, def: def, id: RG.char.id, actStart: dur * 0.36 };
    p.superAnim = { t: 0, def: def, id: RG.char.id };
    p.attack = null;
    p.vx = 0;
    p.invuln = Math.max(p.invuln, dur + 0.6);
    RG.flash = 0.5;
    RG.cam.shake = 12; RG.cam.shakeT = 0.5;
    sfx('ko');
    FX.text(p.x, p.y - 220, def.name, def.tint || '#ffd166', 30, true);
  }

  function superStrike() {
    const p = RG.player;
    const cut = RG.superCut;
    const def = cut ? cut.def : null;
    const base = (def && def.hit && def.hit.dmg) ? def.hit.dmg : 560;
    const dmg = Math.round(base * 2.6 * (p.mods.dmgMul || 1) * (p.mods.ultMul || 1));
    const cx = p.x;
    const cy = p.y - 80;
    const R = 980;
    RG.flash = 0.85;
    RG.cam.shake = 26; RG.cam.shakeT = 0.9;
    FX.ring(cx, cy, '#ffe9a0', R * 0.9, 0.7);
    FX.ring(cx, cy, '#ffffff', R * 0.55, 0.4);
    FX.burst(cx, cy, 40, { colors: ['#ffe9a0', '#ffd166', '#ffffff'], speedMin: 160, speedMax: 900, sizeMin: 3, sizeMax: 11, lifeMin: 0.35, lifeMax: 0.9, grav: 240 });
    for (let i = RG.monsters.length - 1; i >= 0; i--) {
      const m = RG.monsters[i];
      if (m.dead) continue;
      if (Math.abs(m.x - cx) <= R && Math.abs((m.y - m.h * 0.5) - cy) <= 700) {
        hitMonster(m, dmg, 'ult', cx);
      }
    }
    toast('超必杀！' + ((def && def.name) || '') + '  ·  ' + dmg, 2.2);
    sfx('fight');
  }

  /* ===================== 格斗技 / 必杀（U / Y） ===================== */
  function castFight(p, which) {
    const all = D.FIGHT[RG.char.id] || D.FIGHT.hannya;
    const F = all && all[which];
    if (!F) return;
    const cost = F.cost || (which === 'ult' ? 100 : 25);
    if (RG.meter < cost) {
      toast(which === 'ult' ? '气不足：Y 必杀需要 100 气' : '气不足：U 格斗技需要 25 气', 1.4);
      return;
    }
    if (which === 'skill' && RG.fightCd > 0) return;
    RG.meter -= cost;
    if (which === 'skill') RG.fightCd = F.cd || 5;
    const mul = (p.mods.dmgMul || 1) * (which === 'ult' ? (p.mods.ultMul || 1) : (p.mods.skillMul || 1)) * (p.stimT > 0 ? 1.3 : 1);
    const dmg = Math.round((F.dmg || 0) * mul);
    const cx = p.x, cy = p.y - 90;
    const kind = which === 'ult' ? 'ult' : 'skill';
    const tgt = nearestMonster(cx, cy, 900);

    FX.text(cx, p.y - 216, F.name, F.color, which === 'ult' ? 36 : 26, true);
    RG.flash = which === 'ult' ? 0.55 : 0.22;
    RG.cam.shake = which === 'ult' ? 18 : 8;
    RG.cam.shakeT = which === 'ult' ? 0.6 : 0.3;
    sfx(which === 'ult' ? 'fight' : 'holy');

    switch (F.type) {
      case 'fireballs': {
        const n = F.count || 3;
        for (let i = 0; i < n; i++) {
          const ang = (p.facing > 0 ? 0 : Math.PI) + (i - (n - 1) * 0.5) * 0.26;
          RG.pShots.push({
            x: cx + p.facing * 34, y: cy,
            vx: Math.cos(ang) * 540, vy: Math.sin(ang) * 540,
            r: 17, dmg: dmg, life: 2.0, max: 2.0,
            pierce: 1, homing: true, explode: 0, lifesteal: 0,
            color: F.color, name: F.name, rot: 0, hitIds: [],
          });
        }
        break;
      }
      case 'column': {
        const tx = tgt ? tgt.x : cx + p.facing * 180;
        pushFuse(tx, p.y - 130, 0.08, 100, dmg, kind, F.color);
        if (F.heal) {
          healPlayer(F.heal, true);
          FX.text(cx, p.y - 170, '+' + F.heal, '#7dffa8', 26);
        }
        FX.ring(tx, p.y - 120, F.color, 90, 0.55);
        break;
      }
      case 'rapid': {
        p.rapid = { left: F.hits, t: 0, interval: 0.08, dmg: dmg, reach: 165, kind: kind };
        p.vx += p.facing * 180;
        RG.skillFx = { name: F.name, color: F.color, t: 0.8, max: 0.8, type: 'rapid' };
        break;
      }
      case 'spin': {
        for (let w = 0; w < (F.hits || 2); w++) pushFuse(cx, cy, 0.12 + w * 0.2, F.radius || 250, dmg, kind, F.color);
        for (let i = 0; i < RG.monsters.length; i++) {
          const m = RG.monsters[i];
          if (m.dead || m.type === 'troll') continue;
          if (Math.abs(m.x - cx) < (F.radius || 250)) m.vx += (cx > m.x ? 1 : -1) * 260;
        }
        FX.ring(cx, cy, F.color, F.radius || 250, 0.6);
        break;
      }
      case 'cone': {
        p.rapid = { left: F.hits, t: 0, interval: 0.09, dmg: dmg, reach: F.reach || 340, kind: kind };
        RG.skillFx = { name: F.name, color: F.color, t: 1.0, max: 1.0, type: 'cone' };
        FX.text(cx + p.facing * 130, cy - 30, '龙息', F.color, 24, true);
        break;
      }
      case 'curse': {
        const tx = tgt ? tgt.x : cx + p.facing * 200;
        const ty = tgt ? tgt.y - tgt.h * 0.5 : p.y - 40;
        pushFuse(tx, ty, 1.0, F.radius || 160, dmg, kind, F.color);
        FX.ring(tx, ty, F.color, 70, 0.8);
        FX.text(tx, ty - 50, '五芒', F.color, 20);
        break;
      }
      case 'arrow': {
        RG.pShots.push({
          x: cx + p.facing * 40, y: cy,
          vx: p.facing * 1200, vy: 0,
          r: 14, dmg: dmg, life: 2.2, max: 2.2,
          pierce: 99, homing: false, explode: 0, lifesteal: 0,
          color: F.color, name: F.name, rot: 0, hitIds: [],
        });
        break;
      }
      case 'blink': {
        const from = p.x;
        const to = clamp(p.x + p.facing * (F.dist || 280), 24, RG.room.w - 24);
        const rect = { x: Math.min(from, to) - 40, y: p.y - 210, w: Math.abs(to - from) + 80, h: 220 };
        for (let i = 0; i < RG.monsters.length; i++) {
          const m = RG.monsters[i];
          if (m.dead) continue;
          if (overlap(rect, { x: m.x - m.w * 0.5, y: m.y - m.h, w: m.w, h: m.h })) hitMonster(m, computeDamage(m, dmg, kind), kind, from);
        }
        FX.slashArc((from + to) * 0.5, p.y - 96, Math.abs(to - from) * 0.55 + 60, -0.4, 0.4, F.color, 20);
        p.x = to;
        p.invuln = Math.max(p.invuln, 0.9);
        p.vx *= 0.2;
        FX.ring(to, p.y - 90, F.color, 70, 0.4);
        break;
      }
      case 'waves': {
        const n = F.waves || 5;
        for (let w = 0; w < n; w++) {
          const wx = cx + p.facing * (40 + w * 80);
          pushFuse(wx, p.y - 60, 0.12 + w * 0.13, 120, dmg, kind, F.color);
        }
        FX.ring(cx, cy, F.color, 240, 0.7);
        break;
      }
      case 'dive': {
        p.vy = -980;
        p.onGround = false;
        p.invuln = Math.max(p.invuln, 1.2);
        p.ultDive = { burst: F.burst || 160, radius: F.radius || 280 };
        FX.ring(cx, cy, F.color, 120, 0.5);
        break;
      }
      case 'ko': {
        const reach = 240;
        const rect = { x: p.facing > 0 ? cx : cx - reach, y: p.y - 250, w: reach, h: 260 };
        for (let i = 0; i < RG.monsters.length; i++) {
          const m = RG.monsters[i];
          if (m.dead) continue;
          if (overlap(rect, { x: m.x - m.w * 0.5, y: m.y - m.h, w: m.w, h: m.h })) hitMonster(m, computeDamage(m, dmg, kind), kind, cx);
        }
        FX.slashArc(cx + p.facing * 110, p.y - 110, reach, p.facing > 0 ? -0.5 : Math.PI - 0.5, p.facing > 0 ? 0.5 : Math.PI + 0.5, F.color, 30);
        FX.burst(cx + p.facing * 150, cy, 22, { colors: [F.color, '#ffffff'], speedMin: 120, speedMax: 520, sizeMin: 3, sizeMax: 8, lifeMin: 0.25, lifeMax: 0.6 });
        p.vx += p.facing * 320;
        break;
      }
      case 'ribbons': {
        const n = F.hits || 8;
        for (let w = 0; w < n; w++) {
          const m = RG.monsters[(w * 3) % Math.max(1, RG.monsters.length)];
          const tx = m && !m.dead ? m.x : cx + rnd(-420, 420);
          const ty = m && !m.dead ? m.y - m.h * 0.5 : p.y - rnd(40, 220);
          pushFuse(tx, ty, 0.15 + w * 0.1, 95, dmg, kind, F.color);
        }
        break;
      }
      case 'roar': {
        const n = F.waves || 4;
        for (let w = 0; w < n; w++) {
          const wx = cx + p.facing * (90 + w * 120);
          pushFuse(wx, p.y - 70, 0.15 + w * 0.12, 120, dmg, kind, F.color);
        }
        pushFuse(cx + p.facing * 420, p.y - 70, 0.15 + n * 0.12, 260, F.burst || 140, kind, F.color);
        break;
      }
      case 'meteor': {
        const n = F.count || 3;
        for (let w = 0; w < n; w++) {
          const m = RG.monsters[w % Math.max(1, RG.monsters.length)];
          const tx = m && !m.dead ? m.x + rnd(-90, 90) : cx + p.facing * (180 + w * 140);
          const ty = (m && !m.dead ? m.y - m.h * 0.5 : p.y - 60);
          pushFuse(tx, ty, 0.35 + w * 0.22, F.radius || 190, dmg, kind, F.color);
        }
        break;
      }
      case 'arrowrain': {
        const n = F.count || 12;
        for (let w = 0; w < n; w++) {
          const m = RG.monsters[w % Math.max(1, RG.monsters.length)];
          const tx = m && !m.dead ? m.x + rnd(-160, 160) : cx + p.facing * (120 + w * 46);
          pushFuse(tx, p.y - 60, 0.18 + (w % 6) * 0.12, 80, dmg, kind, F.color);
        }
        break;
      }
      case 'slash': {
        const rect = { x: cx - 620, y: p.y - 300, w: 1240, h: 320 };
        for (let i = 0; i < RG.monsters.length; i++) {
          const m = RG.monsters[i];
          if (m.dead) continue;
          if (overlap(rect, { x: m.x - m.w * 0.5, y: m.y - m.h, w: m.w, h: m.h })) hitMonster(m, computeDamage(m, dmg, kind), kind, cx);
        }
        FX.slashArc(cx, p.y - 110, 640, -0.15, 0.15, F.color, 40);
        RG.flash = 0.7;
        break;
      }
      default:
        areaDamage(p, cx, cy, 240, dmg, kind);
    }
  }

  /* ===================== 命中结算 ===================== */

  function computeDamage(m, base, kind) {
    let dmg = base;
    const p = RG.player;
    // 痂香巨魔：背部 +30%，攻击中减伤 15%
    if (m.type === 'troll') {
      const behind = (p.x < m.x && m.facing > 0) || (p.x > m.x && m.facing < 0);
      if (behind) dmg *= 1.3;
      if (m.state === 'claw' || m.state === 'charge' || m.state === 'slam' || m.state === 'roar') dmg *= 0.85;
      if (m.state === 'stagger') dmg *= 1.4;
    } else if (m.type === 'fartling') {
      const behind = (p.x < m.x && m.facing > 0) || (p.x > m.x && m.facing < 0);
      if (behind) dmg *= 1.3;
    } else if (m.type === 'centipede') {
      const dx = p.x - m.x;
      if (dx * m.facing > 40) dmg *= 0.6;       // 头壳装甲
      else if (dx * m.facing < -30) dmg *= 1.35; // 尾段
    } else if (m.type === 'gasfish') {
      dmg *= 1.2; // 近战脆弱
    } else if (m.type === 'jellyfish') {
      // 只有核心（伞盖中心偏下）是弱点
      const coreY = m.y - 76;
      const hitY = p.y - 86;
      if (Math.abs(hitY - coreY) > 60) dmg *= 0.25;
    }
    if (m.def && m.def.kind === 'miniboss') dmg *= 0.62; // 迷你 BOSS 防御
    if (m.elite) dmg *= 0.74; // 精英怪防御更高
    if (m.armor) dmg *= (1 - m.armor); // 亚种重甲（马桶蜈蚣等）
    return Math.max(1, Math.round(dmg));
  }

  function gainMeter(v) {
    const p = RG.player;
    const mul = (p && p.mods.meterGain) || 1;
    RG.meter = clamp(RG.meter + v * mul, 0, 100);
  }

  /* BOSS 控制抗性统一入口：
     · 单次控制最长 2 秒
     · 控制结束后 15 秒内免疫其它控制
     · BOSS 正在进攻（处于出招状态）时霸体：控制不生效、动作不被打断
     返回实际生效的控制时长（0 = 被抵抗或霸体） */
  const BOSS_CC_MAX = 2;
  const BOSS_CC_IMMUNE = 15;
  function bossNeutralState(m) {
    const s = m.state;
    return !s || s === 'idle' || s === 'guard' || s === 'root' ||
      s === 'stun' || s === 'stagger' || s === 'walk' || s === 'chase';
  }
  function bossCcApply(m, label, dur) {
    if (!m || !m.bossLike) return dur;
    if (!bossNeutralState(m)) {
      FX.text(m.x, m.y - m.h - 22, '霸体 · ' + label + '无效', '#ffd166', 16, true);
      return 0;
    }
    if ((m.ccImmuneT || 0) > 0) {
      FX.text(m.x, m.y - m.h - 22, label + '免疫', '#bfe8ff', 16);
      return 0;
    }
    const d = Math.min(BOSS_CC_MAX, Math.max(0, dur));
    m.ccImmuneT = d + BOSS_CC_IMMUNE;
    FX.text(m.x, m.y - m.h - 22, label + ' ' + d.toFixed(1) + 's（抗性）', '#bfe8ff', 16);
    return d;
  }

  /* kind: light / heavy / skill / ult / ranged —— 决定击退、击飞、僵直强度 */
  function hitMonster(m, dmg, kind, fromX) {
    const p = RG.player;
    // 作弊遗物「上帝权柄」：无视无敌帧/护盾/格挡，任何一次命中都直接秒杀（含 BOSS）
    const cheat = !!(p.mods && p.mods.instaKill);
    if (!cheat && m.invuln > 0) return;
    // 水母母体的护盾：四根触须未破坏前完全无敌（作弊秒杀可击穿）
    if (!cheat && m.type === 'jellyMother' && RG.jellyGuard) {
      FX.text(m.x, m.y - m.h - 10, '触须护盾', '#ff8fd0', 18);
      FX.ring(m.x, m.y - m.h * 0.5, '#ff8fd0', 70, 0.35);
      return;
    }
    if (m.guardT > 0 && !cheat) {
      dmg = Math.round(dmg * 0.65);
      FX.text(m.x, m.y - m.h - 6, '挡', '#bfe8ff', 18);
    }
    if (cheat) dmg = Math.max(dmg, Math.ceil((m.hp || 0) + 1));
    // 数据汇总：按实际能打掉的血量累计总伤害（作弊秒杀不会把统计撑爆）
    RG.totalDmg = (RG.totalDmg || 0) + Math.min(dmg, Math.max(0, m.hp || 0));
    m.hp -= dmg;
    m.hurt = 0.12;
    m.invuln = 0.06;
    gainMeter(dmg * 0.3);
    FX.damage(m.x + rnd(-14, 14), m.y - m.h * 0.72, dmg, { size: kind === 'heavy' || kind === 'ult' ? 34 : 27, color: kind === 'heavy' || kind === 'ult' ? '#ffd166' : '#e8ffe8' });
    FX.hitSpark(m.x, m.y - m.h * 0.6, kind === 'heavy' || kind === 'ult' ? 1.5 : 0.9, m.type === 'troll' ? '#ffb08a' : '#b8ffcf');
    sfx('block');
    // 霜心：概率冻结。BOSS 走统一控制抗性（最多 2 秒，之后 15 秒免疫，进攻中霸体）
    if (p.mods.freeze > 0) {
      const ctrl = m.bossLike ? 0.18 : (m.def.kind === 'miniboss' ? 0.5 : 1);
      if (Math.random() < p.mods.freeze * ctrl) {
        const fd = p.mods.freezeDur || 1.2;
        if (m.bossLike) {
          const d = bossCcApply(m, '冻结', fd);
          if (d > 0) {
            m.freezeT = Math.max(m.freezeT || 0, d);
            FX.ring(m.x, m.y - m.h * 0.5, '#bfe8ff', 60, 0.3);
          }
        } else {
          const dur = m.def.kind === 'miniboss' ? fd * 0.6 : fd;
          m.freezeT = Math.max(m.freezeT || 0, dur);
          FX.text(m.x, m.y - m.h - 18, '冻结', '#bfe8ff', 18);
          FX.ring(m.x, m.y - m.h * 0.5, '#bfe8ff', 60, 0.3);
        }
      }
    }
    // 连锁雷种：电弧跳跃
    if (p.mods.chain > 0 && !RG.chainLock && Math.random() < p.mods.chain) chainLightning(m, dmg);
    // 元素附伤：火 / 毒 / 雷 / 冰
    applyElements(m, dmg);
    // 击退 / 击飞 / 僵直（格斗模式打击感）
    const dir = (m.x >= fromX) ? 1 : -1;
    if (m.type !== 'troll' && m.type !== 'killerCroc') {
      const kb = kind === 'ult' ? 760 : kind === 'skill' ? 490 : kind === 'heavy' ? 400 : 180;
      const lift = kind === 'ult' ? 600 : kind === 'skill' ? 340 : kind === 'heavy' ? 280 : 90;
      const stiff = kind === 'ult' ? 1.1 : kind === 'skill' ? 0.7 : kind === 'heavy' ? 0.5 : 0.22;
      if (m.bossLike) {
        // BOSS：进攻中霸体（不打断出招），非进攻状态控制最多 2 秒、之后 15 秒免疫
        const stun = bossCcApply(m, '僵直', stiff);
        if (stun > 0) {
          m.vx += dir * kb * 0.35;
          if (!m.def.fly) m.vy -= lift * 0.35;
          m.stun = Math.max(m.stun || 0, stun);
        }
      } else if (m.def.kind === 'miniboss') {
        // 迷你 BOSS（体型缩小的小怪）：击退/击飞减半，僵直封顶 0.35s，避免被无限连
        m.vx += dir * kb * 0.45;
        if (!m.def.fly) m.vy -= lift * 0.35;
        m.stun = Math.max(m.stun || 0, Math.min(0.35, stiff * 0.5));
      } else {
        m.vx += dir * kb * (m.type === 'fartling' ? 0.5 : 1);
        if (m.def.kind !== 'fly') m.vy -= lift;
        m.stun = Math.max(m.stun || 0, stiff);
      }
    } else {
      m.poise += kind === 'ult' ? 30 : kind === 'skill' ? 20 : kind === 'heavy' ? 16 : 5;
    }
    // 尿灵液化闪避
    if (m.type === 'urinewisp' && m.dodgeCd <= 0) {
      m.invuln = 0.5;
      m.dodgeCd = 2.2;
      m.vx = dir * 320;
      FX.ring(m.x, m.y - 40, '#ffe98a', 70, 0.3);
      FX.text(m.x, m.y - 100, '液化', '#ffe98a', 18);
    }
    if (m.state === 'stagger') m.poise = 0;
    if (m.hp <= 0) killMonster(m);
  }

  function killMonster(m) {
    if (m.dead) return;
    m.dead = true;
    RG.kills++;
    sfx('ko');
    // 亚种粪精：死亡时炸开一圈毒雾（与基础种的分裂形成差异）
    if (m.type === 'poopling' && (m.def.tier || 0) >= 1) {
      createZone({ k: 'gas', x: m.x - 90, y: m.y - 90, w: 180, h: 96, life: 3.0, dps: 7 * (m.dmgMul || 1), slow: 0.35, color: '#c8e07a' });
    }
    const C = m.def.colors;
    // 数据汇总：记录击败的关底首领（迷你 BOSS / 最终 BOSS）
    if (m.def.kind === 'boss' || m.def.kind === 'miniboss') {
      RG.bossKills = RG.bossKills || [];
      RG.bossKills.push(m.def.name);
    }

    // 水母触须（可破坏场景目标）：破坏计数，全部破坏后解除母体护盾
    if (m.def.kind === 'prop') {
      RG.tentacleAlive = Math.max(0, (RG.tentacleAlive || 1) - 1);
      FX.burst(m.x, m.y - 90, 22, { colors: [C.body, C.light, '#ffffff'], speedMin: 60, speedMax: 300, sizeMin: 2, sizeMax: 6, lifeMin: 0.3, lifeMax: 0.8 });
      FX.ring(m.x, m.y - 90, C.core, 120, 0.5);
      if (RG.tentacleAlive <= 0) {
        RG.jellyGuard = false;
        toast('四根触须已破坏 · 水母母体护盾消失！', 3.2);
        sfx('holy');
        RG.flash = 0.5;
      } else {
        toast('触须破坏 ' + (RG.tentacleTotal - RG.tentacleAlive) + ' / ' + RG.tentacleTotal, 2);
      }
      RG.monsters.splice(RG.monsters.indexOf(m), 1);
      return;
    }

    // 下水道鳄鱼：击败后演出「负伤逃入水池」，等待巨魔倒下再归来合体
    if (m.type === 'sewerCroc' && RG.room && RG.room.def.boss) {
      RG.crocEscaped = true;
      startCine('crocEscape', 2.8);
      sfx('ui');
      RG.monsters.splice(RG.monsters.indexOf(m), 1);
      return;
    }

    const bigKill = m.def.kind === 'boss' || m.def.kind === 'miniboss';
    // 过关判定只认关底首领：普通关看迷你 BOSS，BOSS 房看最终 BOSS
    // 若鳄鱼尚未归来，巨魔倒下不会立刻通关，而是进入鳄鱼合体演出
    if (RG.room && !RG.room.def.boss && m.def.kind === 'miniboss') RG.bossKilled = true;
    if (RG.room && RG.room.def.boss && m.def.kind === 'boss') {
      if (m.type === 'troll' && !RG.killerSpawned) {
        // 若玩家先杀巨魔，仍让鳄鱼按剧本逃入水中再归来
        for (let i = RG.monsters.length - 1; i >= 0; i--) {
          const o = RG.monsters[i];
          if (o.type === 'sewerCroc' && !o.dead) {
            o.dead = true;
            RG.monsters.splice(i, 1);
            RG.crocEscaped = true;
          }
        }
        RG.crocEscaped = true;
        // 巨魔被击败 → 播放「鳄鱼钻出水面吞噬巨魔并合体」过场
        RG.introSeen.killerCroc = true;
        startCine('devour', 5.4, 3.65);
      } else {
        RG.bossKilled = true;
      }
    }
    FX.burst(m.x, m.y - m.h * 0.5, bigKill ? 40 : 18, {
      colors: [C.body, C.dark, '#ffffff'], speedMin: 60, speedMax: 420,
      sizeMin: 2, sizeMax: bigKill ? 8 : 5, lifeMin: 0.3, lifeMax: 0.9,
    });
    FX.ring(m.x, m.y - m.h * 0.4, C.body, bigKill ? 320 : 110, 0.5);
    if (bigKill) {
      RG.cam.shake = 18; RG.cam.shakeT = 0.7;
      RG.flash = 0.6;
    }
    // 废料：小怪死后掉落废料堆，靠近自动拾取；精英/BOSS 掉落更多
    const baseGain = m.def.kind === 'boss' ? 120 : (m.def.kind === 'miniboss' ? 36 : (m.mini ? 2 : 6));
    const gain = Math.max(1, Math.round(baseGain * (m.elite ? 2 : 1) * RG.player.mods.scrapMul));
    RG.drops.push({
      type: 'scrap', x: m.x + rnd(-14, 14), y: m.y, vy: -150 - rnd(0, 40),
      value: gain, taken: false, seed: Math.random() * 6,
    });
    gainMeter(m.def.kind === 'miniboss' ? 30 : 8);
    // 遗物掉落：小怪 6%，精英怪 35%，关底迷你 BOSS / 最终 BOSS 必掉
    const relicChance = m.def.kind === 'boss' ? 1 : (m.def.kind === 'miniboss' ? 1 : (m.elite ? 0.35 : 0.06));
    if (Math.random() < relicChance) dropRelicAt(m.x, m.y, 1);
    if (m.type === 'poopling' && !m.mini && !m.elite) {
      // 分裂
      const sp = { type: 'poopling', x: m.x - 26, y: m.y, mini: true, hp: 14, range: [m.minX, m.maxX] };
      spawnMonster(sp, 10);
      spawnMonster({ type: 'poopling', x: m.x + 26, y: m.y, mini: true, hp: 14, range: [m.minX, m.maxX] }, 11);
      FX.text(m.x, m.y - 80, '分裂！', '#ffb08a', 22);
    }
    // 吸血 / 爆裂符
    const mods = RG.player.mods;
    if (mods.lifesteal) healPlayer(mods.lifesteal, true);
    if (mods.explode) {
      const r = mods.explodeR || 150;
      const ed = mods.explodeDmg || 14;
      for (let i = 0; i < RG.monsters.length; i++) {
        const o = RG.monsters[i];
        if (o === m || o.dead) continue;
        if (Math.abs(o.x - m.x) < r && Math.abs(o.y - m.y) < 160) hitMonster(o, ed, 'light', m.x);
      }
      FX.burst(m.x, m.y - 40, 16, { colors: ['#ffd166', '#ff8a4a'], speedMin: 100, speedMax: 380, sizeMin: 3, sizeMax: 7, lifeMin: 0.25, lifeMax: 0.55 });
    }
    // 药水掉落
    if (Math.random() < (m.def.kind === 'boss' ? 1 : (m.def.kind === 'miniboss' ? 0.75 : 0.16))) {
      RG.drops.push({ type: 'potion', x: m.x, y: m.y, vy: -120, taken: false, seed: Math.random() * 6 });
    }
    RG.monsters.splice(RG.monsters.indexOf(m), 1);
  }

  /* 遗物掉落：从尚未满级的遗物池随机抽取 */
  function dropRelicAt(x, y, count) {
    for (let i = 0; i < count; i++) {
      const pool = relicPool();
      if (!pool.length) {
        RG.drops.push({ type: 'scrap', x: x + rnd(-18, 18), y: y, vy: -180, value: 12, taken: false, seed: Math.random() * 6 });
        continue;
      }
      const def = pool[Math.floor(Math.random() * pool.length)];
      RG.drops.push({
        type: 'relic', relic: def, x: x + rnd(-26, 26), y: y, vy: -220 - rnd(0, 60),
        taken: false, seed: Math.random() * 6,
      });
    }
  }

  /* 过场动画入口：'crocEscape'（鳄鱼逃走） / 'devour'（鳄鱼吞噬巨魔并合体） */
  function startCine(type, dur, spawnAt) {
    RG.cine = { type: type, t: 0, dur: dur, spawnAt: spawnAt || 0, spawned: false };
  }

  /* 终局：鳄鱼从水池钻出，吞噬巨魔并合体为满血的痂香杀手鳄 */
  function spawnKillerCroc() {
    if (RG.killerSpawned) return;
    RG.killerSpawned = true;
    RG.crocEscaped = false;
    const w = (RG.room.def.water && RG.room.def.water[0]) || null;
    const cx = w ? w.x + w.w * 0.5 : RG.player.x;
    const cy = w ? w.y : RG.player.y;
    FX.ring(cx, cy - 30, '#8fffe6', 420, 1.0);
    FX.burst(cx, cy - 30, 50, { colors: ['#4f7a4a', '#8fffe6', '#e0b08a', '#ffffff'], speedMin: 120, speedMax: 560, sizeMin: 3, sizeMax: 10, lifeMin: 0.4, lifeMax: 1.2 });
    RG.cam.shake = 30; RG.cam.shakeT = 1.0;
    RG.flash = 1;
    spawnMonster({ type: 'killerCroc', x: cx, y: cy, range: [cx - 520, Math.min(RG.room.w - 80, cx + 520)] }, 20);
    const m = RG.monsters[RG.monsters.length - 1];
    if (m && m.type === 'killerCroc') {
      m.hp = m.hpMax; // 满血登场
      m.drawScale = 1.18; // 体型明显增大
      m.facing = -1;
      toast('杀手鳄吞噬了巨魔 · 痂香杀手鳄降临！', 3.6);
      sfx('ko');
    }
  }

  function healPlayer(v, silent) {
    const p = RG.player;
    p.hp = Math.min(p.hpMax, p.hp + v);
    if (!silent) FX.text(p.x, p.y - 160, '+' + v, '#7dffa8', 24);
  }

  /* 怪物造成的伤害统一走这里：按该怪物的关卡梯度系数放大，并保留击退；
     BOSS 的每次攻击额外附带真伤（无视防御、护盾、减伤） */
  function mHurt(m, dmg, kb) {
    hurtPlayer(Math.round(dmg * (m.dmgMul || 1)), m.x, kb == null ? 2 : kb, m.bossLike ? (m.trueDmg || 0) : 0);
  }
  /* 接触伤害：BOSS 贴身撞击同样附带真伤 */
  function contactHurt(m, kb) {
    hurtPlayer(Math.round((m.def.touch || 8) * (m.dmgMul || 1)), m.x, kb,
      m.bossLike ? (m.trueDmg || 0) : 0);
  }

  function applyPoison() {
    const p = RG.player;
    if (!p || p.hp <= 0) return;
    p.poisonT = Math.max(p.poisonT || 0, 3.2);
  }

  function updatePoison(dt) {
    const p = RG.player;
    if (!p || p.hp <= 0) return;
    if (p.poisonT > 0) {
      p.poisonT -= dt;
      p.poisonTick = (p.poisonTick || 0) + dt;
      if (p.poisonTick >= 0.55) {
        p.poisonTick = 0;
        hurtPlayerTiny(3, '#b06fd6');
        FX.text(p.x, p.y - 130, '毒 -3', '#c58bff', 16);
      }
    } else {
      p.poisonTick = 0;
    }
  }

  /* 涅槃羽：死亡时消耗一次复活次数，回到战斗而不是进入死亡结算 */
  function tryRevive(p) {
    if (!p || !p.mods || !p.mods.revive || (p.reviveLeft || 0) <= 0) return false;
    p.reviveLeft--;
    p.reviveUsed = (p.reviveUsed || 0) + 1;
    p.hp = Math.max(1, Math.round(p.hpMax * (p.mods.reviveHeal || 0.35)));
    p.invuln = 2.2;
    p.hurtT = 0;
    p.poisonT = 0; p.poisonTick = 0;
    RG.flash = Math.max(RG.flash, 0.75);
    FX.ring(p.x, p.y - 80, '#ffd166', 220, 0.9);
    FX.ring(p.x, p.y - 80, '#fff3c4', 150, 0.6);
    FX.text(p.x, p.y - 200, '涅槃复活', '#ffe9a0', 34, true);
    toast('涅槃复活 · 剩余 ' + p.reviveLeft + ' 次', 2.4);
    sfx('holy');
    return true;
  }

  /* trueDmg：真实伤害，无视防御 / 减伤 / 护盾，只受无敌帧影响 */
  function hurtPlayer(dmg, srcX, kb, trueDmg) {
    const p = RG.player;
    if (p.invuln > 0 || RG.screen !== 'play' || p.hp <= 0) return;
    // 作弊遗物「上帝权柄」：完全免伤
    if (p.mods && p.mods.immortal) {
      p.invuln = Math.max(p.invuln, 0.35);
      FX.text(p.x, p.y - 150, '无敌', '#ffd166', 22);
      return;
    }
    let d = dmg;
    if (p.mods.gasResist) d *= (1 - p.mods.gasResist);
    if (p.mods.shield) d *= (1 - p.mods.shield);
    if (p.wardT > 0) d *= 0.6;
    if (p.shieldT > 0) d *= (1 - (p.shieldMul || 0));
    d = Math.max(1, Math.round(d)) + Math.max(0, Math.round(trueDmg || 0));
    p.hp -= d;
    p.invuln = 0.7;
    p.hurtT = kb === 2 ? 0.42 : 0.24;
    // 倒刺甲：受击反伤周围敌人
    if (p.mods.thorns > 0) {
      for (let i = 0; i < RG.monsters.length; i++) {
        const m = RG.monsters[i];
        if (m.dead) continue;
        if (Math.abs(m.x - p.x) < 150 && Math.abs(m.y - p.y) < 180) {
          RG.chainLock = true;
          hitMonster(m, p.mods.thorns, 'light', p.x);
          RG.chainLock = false;
        }
      }
      FX.ring(p.x, p.y - 90, '#ffb08a', 110, 0.3);
    }
    p.hurtDir = srcX > p.x ? -1 : 1;
    p.vx += p.hurtDir * (kb === 2 ? 460 : 220);
    p.vy = Math.min(p.vy, -220);
    RG.cam.shake = Math.max(RG.cam.shake, kb === 2 ? 12 : 6);
    RG.cam.shakeT = 0.3;
    RG.flash = Math.min(0.7, RG.flash + 0.25);
    FX.damage(p.x, p.y - 150, d, { color: '#ff7a6a', size: 30 });
    FX.hitSpark(p.x, p.y - 90, 1, '#ff6b4a');
    sfx('block');
    if (p.hp <= 0) {
      p.hp = 0;
      if (tryRevive(p)) return;
      RG.screen = 'dead';
      RG.screenT = 0;
      RG.endT = 0;
      sfx('ko');
      FX.burst(p.x, p.y - 80, 24, { colors: ['#ff6b4a', '#ffffff'], speedMin: 80, speedMax: 400, sizeMin: 2, sizeMax: 6, lifeMin: 0.4, lifeMax: 1 });
    }
  }

  /* ===================== 物理碰撞 ===================== */

  /* 返回 x 位置、y 之下最近的可站立面（用于竖直地图里的掉落物 / 酸池落点） */
  function groundBelow(x, y) {
    let best = RG.room.h;
    const plats = RG.room.platforms.concat(RG.hazards.filter(function (h) { return h.type === 'moving'; }));
    for (let i = 0; i < plats.length; i++) {
      const pl = plats[i];
      if (!pl.active && pl.active !== undefined) continue;
      if (x < pl.x - 10 || x > pl.x + pl.w + 10) continue;
      if (pl.y >= y && pl.y < best) best = pl.y;
    }
    for (let i = 0; i < RG.room.floors.length; i++) {
      const f = RG.room.floors[i];
      if (x < f.x - 10 || x > f.x + f.w + 10) continue;
      if (f.y >= y && f.y < best) best = f.y;
    }
    return best;
  }

  /* 台阶封边：脚底低于地面顶面时，禁止水平穿入该地块，避免从阶梯接缝掉到地图下方。
     只对「脚下是实心地面」生效，飞行怪 / BOSS 不走这里。 */
  function resolveFloorWalls(ent, prevX, rad) {
    const feet = ent.y;
    for (let i = 0; i < RG.room.floors.length; i++) {
      const f = RG.room.floors[i];
      if (feet <= f.y + 8) continue;
      const left = f.x, right = f.x + f.w;
      if (ent.x + rad <= left || ent.x - rad >= right) continue;
      if (prevX + rad <= left + 1) ent.x = left - rad;
      else if (prevX - rad >= right - 1) ent.x = right + rad;
      else ent.x = (ent.x - left < right - ent.x) ? left - rad : right + rad;
      ent.vx = 0;
    }
  }

  function collide(p, dt) {
    const prevY = p.y;
    const prevX = p.x;
    p.x += p.vx * dt;
    resolveFloorWalls(p, prevX, 14);
    p.y += p.vy * dt;
    p.onGround = false;

    const plats = RG.room.platforms.concat(RG.hazards.filter(function (h) { return h.type === 'moving'; }));
    for (let i = 0; i < plats.length; i++) {
      const pl = plats[i];
      if (!pl.active && pl.active !== undefined) continue;
      if (p.vy < 0) continue;
      const top = pl.y;
      if (p.x + 12 < pl.x || p.x - 12 > pl.x + pl.w) continue;
      if (prevY <= top + 8 && p.y >= top) {
        p.y = top;
        p.vy = 0;
        p.onGround = true;
        p.standPlat = pl;
        if (pl.kind === 'break' && pl.active) {
          pl.breakT += dt;
          pl.shakeT = 0.3;
          pl.crack = Math.min(1, pl.breakT / 0.85);
        }
        break;
      }
    }
    // 地面
    if (!p.onGround) {
      let landed = false;
      for (let i = 0; i < RG.room.floors.length; i++) {
        const f = RG.room.floors[i];
        if (p.x + 12 < f.x || p.x - 12 > f.x + f.w) continue;
        if (prevY <= f.y + 8 && p.y >= f.y) { p.y = f.y; p.vy = 0; p.onGround = true; landed = true; break; }
      }
      if (landed) {
        if (p.landing <= 0) { p.landing = 0.2; sfx('land'); }
      }
    }
    if (p.landing > 0) p.landing -= dt;

    // 传送带推力
    for (let i = 0; i < RG.hazards.length; i++) {
      const h = RG.hazards[i];
      if (h.type !== 'conveyor') continue;
      if (p.onGround && p.x > h.x && p.x < h.x + h.w && Math.abs(p.y - h.y) < 14) {
        p.vx += h.dir * h.speed * 0.9 * dt;
      }
    }
  }

  function checkAcid(p, dt) {
    for (let i = 0; i < RG.room.acid.length; i++) {
      const a = RG.room.acid[i];
      if (p.x > a.x && p.x < a.x + a.w && p.y > a.y + 18) {
        // 跌落酸池：扣血并回到安全点
        hurtPlayer(p.mods.acidImmune ? 3 : 14, p.x, 1);
        p.vy = -640;
        p.y = a.y - 120;
        p.x = p.x < a.x + a.w * 0.5 ? a.x - 90 : a.x + a.w + 90;
        p.vx = 0;
        toast('酸液灼烧！', 1.4);
        sfx('dark');
        break;
      }
    }
    if (p.y > RG.room.h + 40) {
      p.y = RG.room.def.start.y;
      p.x = p.startX;
      hurtPlayer(16, p.x, 1);
    }
  }

  function steamPhase(h, dt) {
    h.t += dt;
    const cycle = h.period;
    const tt = h.t % cycle;
    if (tt < cycle - h.warn - h.onT) h.phase = 0;
    else if (tt < cycle - h.onT) h.phase = 1;
    else h.phase = 2;
  }

  function checkSteam(p) {
    for (let i = 0; i < RG.hazards.length; i++) {
      const h = RG.hazards[i];
      if (h.type !== 'steam') continue;
      steamPhase(h, 0);
      if (h.phase === 2 && p.x > h.x - 10 && p.x < h.x + h.w + 10 && p.y > h.y - h.h && p.y < h.y) {
        if (h.clean) {
          // 净化喷口：不伤人，托起玩家并回复少量生命
          p.hp = Math.min(p.hpMax, p.hp + 4);
          FX.text(p.x, p.y - 170, '+4', '#bfe8ff', 20);
        } else {
          hurtPlayer(10, h.x + h.w / 2, 2);
        }
        p.vy = -780;
        p.y = Math.min(p.y, h.y - 10);
        sfx('fire');
      }
    }
  }

  function pendulumPos(h) {
    const ang = Math.sin((RG.time / h.period) * TAU) * h.amp;
    return { x: h.x + Math.sin(ang) * h.len, y: Math.cos(ang) * h.len, ang: ang };
  }

  function checkPendulum(p) {
    for (let i = 0; i < RG.hazards.length; i++) {
      const h = RG.hazards[i];
      if (h.type !== 'pendulum') continue;
      const pos = pendulumPos(h);
      if (Math.abs(pos.x - p.x) < 44 && Math.abs(pos.y - (p.y - 90)) < 66) {
        hurtPlayer(h.dmg, pos.x, 2);
        p.vx += (p.x < pos.x ? -1 : 1) * 400;
      }
    }
  }

  /* ===================== 相机 ===================== */

  function updateCamera(dt) {
    const p = RG.player;
    const tx = clamp(p.x - CFG.W * 0.5, 0, Math.max(0, RG.room.w - CFG.W));
    const ty = clamp(p.y - CFG.H * 0.62, 0, Math.max(0, RG.room.h - CFG.H));
    RG.cam.x = lerp(RG.cam.x, tx, 0.12);
    RG.cam.y = lerp(RG.cam.y, ty, 0.1);
  }

  /* ===================== 更新：怪物 ===================== */

  /* ===================== 元素附着 / 持续伤害 ===================== */

  function elemDamage(m, raw, color) {
    if (!m || m.dead) return;
    const d = Math.max(0, Math.round(raw));
    if (d <= 0) return;
    const real = Math.min(d, Math.max(0, m.hp));
    RG.totalDmg = (RG.totalDmg || 0) + real;
    m.hp -= d;
    m.hurt = Math.max(m.hurt, 0.08);
    FX.text(m.x + rnd(-8, 8), m.y - m.h * 0.7, d, color || '#ff8a3a', 17);
    if (m.hp <= 0) killMonster(m);
  }

  function updateMonsterDots(m, dt) {
    if (m.burnT > 0) {
      m.burnT -= dt;
      m.burnTick = (m.burnTick || 0) - dt;
      if (m.burnTick <= 0) { m.burnTick = 0.45; elemDamage(m, (m.burnDps || 0) * 0.45, '#ff8a3a'); }
    }
    if (m.poisonT > 0) {
      m.poisonT -= dt;
      m.poisonTick = (m.poisonTick || 0) - dt;
      if (m.poisonTick <= 0) { m.poisonTick = 0.5; elemDamage(m, (m.poisonDps || 0) * 0.5, '#9fe06a'); }
    }
  }

  function applyElements(m, dmg) {
    const p = RG.player;
    const mm = p && p.mods;
    if (!mm || RG.elemLock || !m || m.dead) return;
    const ctrl = m.def.kind === 'boss' ? 0.5 : (m.def.kind === 'miniboss' ? 0.75 : 1);
    const em = 1 + (mm.elemDmg || 0);
    const roll = function (lv, base) { return Math.random() < Math.min(0.9, base + 0.1 * lv) * ctrl; };
    const lvFire = mm.elemFire || 0, lvP = mm.elemPoison || 0, lvS = mm.elemShock || 0, lvI = mm.elemIce || 0;
    if (lvFire && roll(lvFire, 0.16 + 0.02 * lvFire)) {
      m.burnT = Math.max(m.burnT || 0, 3 + 0.6 * lvFire);
      m.burnTick = Math.min(m.burnTick || 0.45, 0.45);
      m.burnDps = (8 + 5 * lvFire) * em;
      FX.text(m.x, m.y - m.h - 14, '灼烧', '#ff8a3a', 17);
    }
    if (lvP && roll(lvP, 0.18 + 0.02 * lvP)) {
      m.poisonT = Math.max(m.poisonT || 0, 4 + 0.8 * lvP);
      m.poisonTick = Math.min(m.poisonTick || 0.5, 0.5);
      m.poisonDps = (6 + 4 * lvP) * em;
      FX.text(m.x, m.y - m.h - 14, '中毒', '#9fe06a', 17);
    }
    if (lvS && roll(lvS, 0.16 + 0.02 * lvS)) {
      const rawStun = 0.35 + 0.10 * lvS;
      const stun = m.bossLike ? bossCcApply(m, '雷击', rawStun) : rawStun * ctrl;
      if (stun > 0) {
        m.stun = Math.max(m.stun || 0, stun);
        if (!m.bossLike) FX.text(m.x, m.y - m.h - 18, '雷击', '#8ad8ff', 18);
      }
      FX.hitSpark(m.x, m.y - m.h * 0.6, 1.1, '#8ad8ff');
      // 电弧弹向最近的另一个敌人
      let tgt = null, best = 1e9;
      for (let i = 0; i < RG.monsters.length; i++) {
        const o = RG.monsters[i];
        if (o === m || o.dead || o.def.kind === 'prop') continue;
        const dd = Math.abs(o.x - m.x) + Math.abs(o.y - m.y) * 0.5;
        if (dd < 280 && dd < best) { best = dd; tgt = o; }
      }
      if (tgt) {
        RG.elemLock = true;
        elemDamage(tgt, (30 + 10 * lvS) * em, '#8ad8ff');
        RG.elemLock = false;
      }
    }
    if (lvI && roll(lvI, 0.16 + 0.02 * lvI)) {
      m.chillT = Math.max(m.chillT || 0, 2 + 0.5 * lvI);
      m.chillMul = Math.min(0.7, 0.30 + 0.05 * lvI);
      FX.text(m.x, m.y - m.h - 14, '冰缓', '#bfe8ff', 17);
      FX.ring(m.x, m.y - m.h * 0.5, '#bfe8ff', 52, 0.25);
    }
  }

  function updateMonsters(dt) {
    const p = RG.player;
    for (let i = 0; i < RG.monsters.length; i++) {
      const m = RG.monsters[i];
      if (m.dead) continue;
      // 水母触须等场景目标：只作为可破坏物体，不移动、不攻击
      // 但受击后的无敌帧 / 冻结计时必须照常衰减，否则触须被打一下就会永久无敌
      if (m.def.kind === 'prop') {
        m.hurt = Math.max(0, m.hurt - dt);
        m.invuln = Math.max(0, m.invuln - dt);
        if (m.freezeT > 0) m.freezeT = Math.max(0, m.freezeT - dt);
        continue;
      }
      m.hurt = Math.max(0, m.hurt - dt);
      m.invuln = Math.max(0, m.invuln - dt);
      m.dodgeCd = Math.max(0, m.dodgeCd - dt);
      if (m.ccImmuneT > 0) m.ccImmuneT = Math.max(0, m.ccImmuneT - dt);
      updateMonsterDots(m, dt);
      // 攻击频率：atkRate 让冷却走得更快（关卡越深、魔化水母等亚种越高）
      m.cd = Math.max(0, m.cd - dt * (m.atkRate || 1));
      if (m.lastState !== m.state) { m.lastState = m.state; m.stT = 0; }
      else m.stT = (m.stT || 0) + dt;
      if (m.guardCd > 0) m.guardCd -= dt;
      if (m.guardT > 0) {
        m.guardT -= dt;
        m.state = 'guard';
        if (m.guardT <= 0) { m.state = 'idle'; m.stT = 0; }
      }
      if (m.freezeT > 0) {
        m.freezeT -= dt;
        m.vx = 0;
        m.vy += 1600 * dt;
        collideMonster(m, dt);
        continue;
      }
      if (m.stun > 0) { m.stun -= dt; m.vx = lerp(m.vx, 0, 0.2); m.vy += 2000 * dt; collideMonster(m, dt); continue; }
      // 缚魂锁：被束缚时原地不动、不出招
      if (m.rootT > 0) {
        m.rootT -= dt;
        m.vx = lerp(m.vx, 0, 0.6);
        m.state = 'root';
        collideMonster(m, dt);
        continue;
      }
      m.facing = p.x > m.x ? 1 : -1;
      const dx = p.x - m.x, dy = p.y - m.y;
      const dist = Math.abs(dx);

      // 防御姿态：读招后举壳/护鳍格挡（BOSS 与迷你 BOSS 同样会格挡）
      const bigGuard = m.def.kind === 'miniboss' || m.type === 'troll';
      if (p.attack && !p.attack.hit && dist < (bigGuard ? 260 : 175) && m.def.kind !== 'fly' && !m.def.fly &&
          m.guardT <= 0 && m.guardCd <= 0 && m.stun <= 0) {
        m.guardT = bigGuard ? 0.4 : 0.55;
        m.guardCd = bigGuard ? 3.2 : 2.4;
        m.state = 'guard';
        m.stT = 0;
        FX.text(m.x, m.y - m.h - 22, '格挡', '#bfe8ff', bigGuard ? 20 : 16);
      }

      // 缓速场（迟滞沙漏）：贴近玩家的敌人变慢
      const slowField = p.mods && p.mods.slowField ? p.mods.slowField : 0;

      if (m.def.kind === 'miniboss') {
        updateMiniBoss(m, dt, dist, dx, dy);
      } else if (m.def.kind === 'fly') {
        updateFlyMonster(m, dt, dist, dy);
      } else if (m.type === 'troll') {
        updateTroll(m, dt, dist, dx, dy);
      } else if (m.type === 'killerCroc') {
        updateMiniBoss(m, dt, dist, dx, dy);
      } else {
        updateGroundMonster(m, dt, dist, dx, dy);
      }
      const slowR = (p.mods && p.mods.slowR) || 320;
      if (slowField && Math.abs(dx) < slowR && Math.abs(dy) < 260) m.vx *= (1 - slowField);
      // 冰缓：降低移速（霜蚀 / 冰川之核）
      if (m.chillT > 0) { m.chillT -= dt; m.vx *= (1 - (m.chillMul || 0.3)); }
      collideMonster(m, dt);
      m.x = clamp(m.x, m.minX, m.maxX);
      m.contactCd = Math.max(0, m.contactCd - dt);
      // 近身接触伤害
      if (m.def.kind !== 'fly' || m.type === 'urinewisp') {
        if (Math.abs(m.x - p.x) < (m.w + 30) * 0.5 && Math.abs((m.y - m.h * 0.4) - (p.y - 60)) < 88) {
          if (m.contactCd <= 0) {
            contactHurt(m, (m.def.kind === 'miniboss' || m.type === 'troll') ? 2 : 1);
            m.contactCd = 0.6;
          }
        }
      }
    }
  }

  function collideMonster(m, dt) {
    const prevX = m.x;
    m.x += m.vx * dt;
    const isFly = m.def.kind === 'fly' || !!m.def.fly;
    if (isFly) return;
    if (m.type === 'troll') return;
    resolveFloorWalls(m, prevX, Math.max(16, Math.min(80, m.w * 0.42)));
    const prevY = m.y;
    m.y += m.vy * dt;
    m.vy += 2200 * dt;
    m.onGround = false;
    const plats = RG.room.platforms.concat(RG.hazards.filter(function (h) { return h.type === 'moving'; }));
    for (let i = 0; i < plats.length; i++) {
      const pl = plats[i];
      if (!pl.active && pl.active !== undefined) continue;
      if (m.vy < 0) break;
      if (m.x < pl.x || m.x > pl.x + pl.w) continue;
      if (prevY <= pl.y + 6 && m.y >= pl.y) { m.y = pl.y; m.vy = 0; m.onGround = true; break; }
    }
    if (!m.onGround) {
      for (let i = 0; i < RG.room.floors.length; i++) {
        const f = RG.room.floors[i];
        if (m.x < f.x || m.x > f.x + f.w) continue;
        if (prevY <= f.y + 6 && m.y >= f.y) { m.y = f.y; m.vy = 0; m.onGround = true; break; }
      }
    }
    if (m.vx > 0 && m.x >= m.maxX) m.vx = 0;
    if (m.vx < 0 && m.x <= m.minX) m.vx = 0;
  }

  /* ===================== 各类怪物 AI ===================== */

  function updateGroundMonster(m, dt, dist, dx, dy) {
    const p = RG.player;
    const spd = m.def.speed;
    if (m.guardT > 0) { m.vx = lerp(m.vx, 0, 0.3); return; }
    // 跳跃能力：玩家在上方时跳起追击，偶尔跳跃突进
    m.jumpCd = Math.max(0, (m.jumpCd || 0) - dt);
    if (m.onGround && m.jumpCd <= 0 && m.type !== 'poopling' && dist < 560) {
      if (dy < -110 && dist < 380) {
        m.vy = -640;
        m.vx = dx > 0 ? 220 : -220;
        m.jumpCd = 1.4;
        sfx('jump');
      } else if (dist > 400 && m.cd <= 0 && Math.random() < 0.012) {
        m.vy = -520;
        m.vx = dx > 0 ? 160 : -160;
        m.jumpCd = 2.2;
        sfx('jump');
      }
    }
    if (m.state === 'idle') {
      m.vx = lerp(m.vx, dx > 0 ? spd : -spd, 0.14);
      if (dist < 40) m.vx = 0;
    }

    if (m.type === 'fartling') {
      if (dist < 210 && m.cd <= 0) {
        m.state = 'puff'; m.timer = 0.55; m.cd = 2.8;
        sfx('fire');
      }
      if (m.state === 'puff') {
        m.vx = 0;
        m.timer -= dt;
        if (m.timer <= 0) {
          m.state = 'idle';
          // 亚种：一口气连喷三道毒屁，封锁更大范围
          const n = (m.def.tier || 0) >= 1 ? 3 : 1;
          for (let i = 0; i < n; i++) {
            createZone({
              k: 'gas', x: m.x + m.facing * (76 + i * 86), y: m.y - 74, w: 150, h: 100,
              life: 4.2 - i * 0.4, dps: 5 * (m.dmgMul || 1), slow: 0.4, color: '#9be08a',
            });
          }
          m.gasT = 2;
        }
      }
      if (m.gasT > 0) m.gasT -= dt;

    } else if (m.type === 'poopling') {
      if (m.onGround && dist < 500) {
        if (m.state !== 'jump') {
          if (m.cd <= 0) {
            m.state = 'jump';
            m.vy = -620;
            m.vx = dx > 0 ? 240 : -240;
            m.cd = 0.9;
            sfx('jump');
          }
        } else if (m.onGround) {
          m.state = 'idle';
        }
      }
      if (m.onGround && m.state === 'jump') m.state = 'idle';

    } else if (m.type === 'gasfish') {
      if (dist < 90) {
        // 近身后撤
        m.vx = (dx > 0 ? -1 : 1) * 260;
      } else if (dist > 380) {
        m.vx = lerp(m.vx, dx > 0 ? spd : -spd, 0.2);
      } else {
        m.vx = lerp(m.vx, 0, 0.25);
      }
      if (m.state === 'idle' && m.cd <= 0 && dist < 560) {
        // 亚种 T2/T3：把沼气点燃，改为喷火
        m.state = (m.def.tier || 0) >= 1 ? 'flame' : 'charge';
        m.timer = 0.95; m.cd = 2.6;
        sfx('charge');
        if (m.state === 'flame') FX.text(m.x, m.y - 96, '喷火！', '#ff9a4a', 20, true);
      }
      if (m.state === 'charge') {
        m.vx = 0;
        m.timer -= dt;
        if (m.timer <= 0) {
          m.state = 'shoot'; m.timer = 0.35;
          const bx = m.x + m.facing * 42, by = m.y - 70;
          for (let i = -1; i <= 1; i++) {
            RG.projectiles.push({
              k: 'gas', x: bx, y: by, vx: m.facing * 300, vy: -70 + i * 40,
              r: 15, dmg: Math.round(9 * (m.dmgMul || 1)), life: 2.2, grav: 0, owner: 'monster', color: '#9be08a',
              trueDmg: m.trueDmg || 0,
            });
          }
          sfx('fire');
        }
      } else if (m.state === 'shoot') {
        m.timer -= dt;
        if (m.timer <= 0) m.state = 'idle';
      } else if (m.state === 'flame') {
        m.vx = 0;
        m.timer -= dt;
        if (m.timer <= 0) {
          for (let i = 0; i < 4; i++) {
            createZone({
              k: 'fire', x: m.x + m.facing * (70 + i * 74) - 40, y: m.y - 150,
              w: 96, h: 150, life: 0.75, dps: (6 + i * 2) * (m.dmgMul || 1), slow: 0,
              color: '#ff8a3a',
            });
          }
          sfx('fire');
          m.state = 'idle'; m.cd = 3.1;
        }
      }

    } else if (m.type === 'centipede') {
      // 亚种 T2/T3：近身缠绕绞杀（短暂锁住玩家并持续掉血）
      m.coilCd = Math.max(0, (m.coilCd || 0) - dt);
      if (m.state === 'coil') {
        m.vx = 0;
        m.timer -= dt;
        m.coilTick = (m.coilTick || 0) + dt;
        if (dist < 200) {
          p.rootT = Math.max(p.rootT || 0, 0.35);
          if (m.coilTick >= 0.3) {
            m.coilTick = 0;
            mHurt(m, 7, 1);
            FX.slashArc(p.x, p.y - 80, 80, -0.4, 0.4, '#ffb08a', 18);
          }
        }
        if (m.timer <= 0) { m.state = 'idle'; m.cd = 2.2; m.coilCd = 5.5; }
        return;
      }
      if (m.state === 'idle' && (m.def.tier || 0) >= 1 && m.coilCd <= 0 && dist < 165) {
        m.state = 'coil'; m.timer = 1.0; m.coilTick = 0;
        FX.text(m.x, m.y - 96, '绞杀！', '#ff9a4a', 24, true);
        sfx('charge');
        return;
      }
      if (m.state === 'bite') {
        m.timer -= dt;
        if (m.timer > 0.32) { m.vx = 0; }
        else {
          m.vx = m.facing * 640;
          if (Math.abs(m.x - m.biteX) > 150) m.state = 'idle';
        }
        if (m.timer <= 0) m.state = 'idle';
      } else if (dist < 220 && m.cd <= 0) {
        m.state = 'bite'; m.timer = 0.62; m.biteX = m.x; m.cd = 2.2;
        FX.text(m.x, m.y - 90, '！', '#ffb08a', 28);
        sfx('charge');
      } else {
        m.vx = lerp(m.vx, dx > 0 ? spd : -spd, 0.2);
        m.hitFront = true;
        if (m.state === 'bite' && m.timer > 0.3) m.vx = 0;
        if (m.state === 'bite' && m.timer <= 0.3) m.vx = m.facing * 640;
      }
      // 突进伤害窗口
      if (m.state === 'bite' && m.timer <= 0.32 && m.timer > 0.08) {
        const p = RG.player;
        if (Math.abs(p.x - (m.x + m.facing * 50)) < 80 && Math.abs(p.y - m.y) < 110) {
          mHurt(m, 15, 2);
        }
      }
    }
  }

  function updateFlyMonster(m, dt, dist, dy) {
    const p = RG.player;
    const anchor = m.homeY != null ? m.homeY : m.y;
    if (m.type === 'urinewisp') {
      // 亚种 T2/T3：贴近玩家后点燃自身自爆
      m.boomCd = Math.max(0, (m.boomCd || 0) - dt);
      if (m.state === 'fuse') {
        m.timer -= dt;
        m.hurt = 0.14;
        m.y = lerp(m.y, p.y - 90, 0.1);
        if (m.timer <= 0) {
          const R = 180;
          if (Math.abs(p.x - m.x) < R && Math.abs(p.y - m.y) < 220) {
            hurtPlayer(Math.round(30 * (m.dmgMul || 1)), m.x, 2);
          }
          FX.ring(m.x, m.y, '#ffd23f', 230, 0.6);
          FX.burst(m.x, m.y, 26, { colors: ['#ffe98a', '#ffd23f', '#ff8a3a'], speedMin: 60, speedMax: 320, sizeMin: 2, sizeMax: 7, lifeMin: 0.3, lifeMax: 0.8 });
          RG.cam.shake = Math.max(RG.cam.shake, 10); RG.cam.shakeT = Math.max(RG.cam.shakeT, 0.25);
          sfx('ko');
          killMonster(m);
          return;
        }
        return;
      }
      // 只会悬停漂移 + 抛物线吐尿弹，不再俯冲
      m.state = 'idle';
      if ((m.def.tier || 0) >= 1 && m.boomCd <= 0 && dist < 280) {
        m.state = 'fuse'; m.timer = 0.85; m.boomCd = 999;
        FX.text(m.x, m.y - 56, '自爆！', '#ffd23f', 24, true);
        sfx('charge');
        return;
      }
      m.x += Math.cos(RG.time * 1.6 + m.seed) * 14 * dt;
      m.y = lerp(m.y, anchor - 60 + Math.sin(RG.time * 2.2 + m.seed) * 16, 0.06);
      if (dist < 620 && m.cd <= 0) {
        m.cd = 2.2;
        const toward = p.x > m.x ? 1 : -1;
        RG.projectiles.push({
          k: 'urine', x: m.x, y: m.y,
          vx: toward * (Math.abs(p.x - m.x) > 240 ? 190 : 140), vy: -260,
          r: 12, dmg: Math.round(8 * (m.dmgMul || 1)), life: 3, grav: 520,
          owner: 'monster', color: '#ffd23f',
        });
        FX.text(m.x, m.y - 54, '吐弹', '#ffe98a', 16);
        sfx('fire');
      }
      m.x = clamp(m.x, m.minX, m.maxX);
      return;
    }
    if (m.type === 'jellyfish') {
      m.x += Math.cos(RG.time * 0.9 + m.seed) * 24 * dt;
      m.y = anchor + Math.sin(RG.time * 1.7 + m.seed) * 12;
      // 亚种 T2/T3：触手缠住玩家往天上拽
      m.pullCd = Math.max(0, (m.pullCd || 0) - dt);
      if ((m.def.tier || 0) >= 1 && m.state === 'idle' && m.pullCd <= 0 && dist < 460) {
        m.state = 'pull'; m.timer = 0.9; m.pullCd = 6.5;
        FX.text(m.x, m.y - 56, '缠拽！', '#e8b6ff', 22, true);
        sfx('charge');
      }
      if (m.state === 'pull') {
        m.timer -= dt;
        if (m.timer <= 0) {
          if (Math.abs(p.x - m.x) < 460) {
            mHurt(m, 14, 1);
            p.vy = -760; p.onGround = false;
            FX.text(p.x, p.y - 190, '拽上天', '#e8b6ff', 24, true);
            FX.ring(p.x, p.y - 80, '#b06fd6', 120, 0.5);
          }
          m.state = 'idle';
          m.cd = 3.2;
        }
        return;
      }
      if (m.state === 'idle' && m.cd <= 0 && dist < 560) {
        m.state = 'drop'; m.timer = 1.2; m.cd = 4.6;
        sfx('charge');
      }
      if (m.state === 'drop') {
        m.timer -= dt;
        if (m.timer <= 0) {
          createZone({ k: 'tentacle', x: p.x - 60, y: groundBelow(p.x, p.y) - 130, w: 120, h: 130, life: 4.5, dps: 4 * (m.dmgMul || 1), slow: 0.5, poison: !!m.poison, color: '#cfe3d6' });
          // 电场脉冲
          if (Math.abs(p.x - m.x) < 180) {
            createZone({ k: 'shock', x: m.x - 150, y: m.y - 30, w: 300, h: 240, life: 0.55, dps: 10 * (m.dmgMul || 1), slow: 0, poison: !!m.poison, color: '#3ff0d0' });
          }
          sfx('holy');
          m.state = 'idle';
          m.cd = 4.6;
        }
      }
      m.x = clamp(m.x, m.minX, m.maxX);
    }
  }

  /* ===================== 迷你 BOSS AI =====================
     五个关底小 BOSS 共用同一套状态机：预警 wind → 出招 → 收招，
     动作池由 R.MONSTERS[type].mb 决定。 */
  const MB_WORDS = {
    charge: '冲锋！', sweep: '尾扫！', tail: '巨尾横扫！', poison: '毒雾喷吐！',
    bubble: '酸泡连吐！', fan: '沼气扇射！', drop: '触手垂落！', pulse: '电环脉冲！',
    spawn: '孵化尿灵！', summon: '召唤粪精！', stomp: '踏地震波！', kick: '巨足踢击！',
    leap: '巨足碾压！', bite: '长吻撕咬！', slam: '重砸！',
    tentacle: '触手拍击！', spike: '地底刺击！',
    flame: '烈焰喷射！', drag: '触手缚天！', coil: '死亡绞杀！',
    quake: '连环震地！', roll: '死亡翻滚！',
  };

  function mbBox(m) {
    return { x: m.x - m.w * 0.5, y: m.y - m.h, w: m.w, h: m.h };
  }
  function mbPlayerBox() {
    const p = RG.player;
    return { x: p.x - 24, y: p.y - 152, w: 48, h: 152 };
  }
  function mbShot(m, k, x, y, vx, vy, dmg, color, grav) {
    RG.projectiles.push({
      k: k, x: x, y: y, vx: vx, vy: vy, r: 15, dmg: dmg, life: 2.6,
      grav: grav || 0, owner: 'monster', color: color, kb: 2,
    });
  }

  function updateMiniBoss(m, dt, dist, dx, dy) {
    const p = RG.player;
    const fly = !!m.def.fly;
    const ratio = m.hp / m.hpMax;
    const phase = ratio > 0.5 ? 1 : 2;
    m.phase = phase;
    const spd = (m.def.speed || 90) + (phase === 2 ? 46 : 0);

    // 痂香杀手鳄：血量跌破 1/3 时回 100000（整场只触发一次）
    if (m.type === 'killerCroc' && !m.healed && m.hp > 0 && m.hp <= m.hpMax / 3) {
      m.healed = true;
      m.hp = Math.min(m.hpMax, m.hp + 100000);
      FX.text(m.x, m.y - m.h - 50, '+100000', '#8fffc0', 30, true);
      FX.ring(m.x, m.y - m.h * 0.5, '#3ff0a0', 280, 0.7);
      toast('杀手鳄狂暴再生：恢复 100000 生命！', 2.4);
      RG.cam.shake = 18; RG.cam.shakeT = 0.4;
      sfx('holy');
    }

    // 格挡：举壳/护鳍，减伤 65%
    if (m.guardT > 0) { m.vx = lerp(m.vx, 0, 0.3); return; }

    // 跳跃能力：玩家在高处时短跳逼近
    m.jumpCd = Math.max(0, (m.jumpCd || 0) - dt);
    if (!fly && m.state === 'idle' && m.onGround && m.jumpCd <= 0) {
      if (dy < -140 && dist < 460) {
        m.vy = -660;
        m.vx = dx > 0 ? 190 : -190;
        m.jumpCd = 2.0;
        sfx('jump');
      } else if (dist > 560 && Math.random() < 0.012) {
        m.vy = -620;
        m.vx = dx > 0 ? 240 : -240;
        m.jumpCd = 2.4;
        sfx('jump');
      }
    }

    // 飞行型悬停；地面型缓慢逼近
    if (fly) {
      const home = m.homeY != null ? m.homeY : m.y;
      m.y = home + Math.sin(RG.time * 1.5 + m.seed) * 20;
      if (dist > 320) m.vx = lerp(m.vx, dx > 0 ? 120 : -120, 0.1);
      else if (dist < 170) m.vx = lerp(m.vx, dx > 0 ? -100 : 100, 0.12);
      else m.vx = lerp(m.vx, 0, 0.12);
      if (m.state === 'idle') m.x += m.vx * dt;
    } else if (m.state === 'idle') {
      if (dist > 170) m.vx = lerp(m.vx, dx > 0 ? spd : -spd, 0.12);
      else m.vx = lerp(m.vx, 0, 0.18);
      m.x += m.vx * dt;
    }
    m.x = clamp(m.x, m.minX, m.maxX);

    if (m.state === 'idle') {
      if (m.cd > 0) return;
      const pool = m.def.mb || ['sweep'];
      // 水母母体：触须全部破坏后不再使用「触手拍击」
      let actPool = m.type === 'jellyMother'
        ? pool.filter(function (a) { return a !== 'tentacle' || RG.tentacleAlive > 0; })
        : pool;
      // 亚种 BOSS（T2/T3）追加独有招式，拉开与基础种的打法差异
      if ((m.def.tier || 0) >= 1) {
        const extra = m.type === 'gasfishKing' ? 'flame'
          : m.type === 'jellyMother' ? 'drag'
          : m.type === 'centipedeKing' ? 'coil'
          : m.type === 'giantFoot' ? 'quake'
          : m.type === 'sewerCroc' ? 'roll' : null;
        if (extra) actPool = actPool.concat([extra, extra]);
      }
      let act = actPool[(Math.random() * actPool.length) | 0];
      // 近身时优先横向攻击，避免一直后退
      if (dist < 220 && (m.type === 'sewerCroc' || m.type === 'centipedeKing' || m.type === 'giantFoot')) act = actPool[0];
      if (fly && dist > 500) act = actPool[0];
      m.state = act;
      m.timer = 0;
      m.hitDone = false;
      m.actDir = dx > 0 ? 1 : -1;
      m.wind = act === 'pulse' ? 0.9 : act === 'drop' ? 0.85 : act === 'charge' ? 0.7 : act === 'bite' ? 0.55
        : act === 'tentacle' ? 0.75 : act === 'spike' ? 0.6
        : act === 'flame' ? 0.85 : act === 'drag' ? 0.95 : act === 'coil' ? 0.65
        : act === 'quake' ? 0.75 : act === 'roll' ? 0.5 : 0.6;
      m.recover = act === 'charge' ? 0.55 : act === 'bite' ? 0.38 : act === 'leap' ? 0.7
        : act === 'roll' ? 0.45 : act === 'drag' ? 0.5 : 0.42;
      m.leapFrom = { x: m.x, y: m.y };
      m.vx = 0;
      sfx('charge');
      FX.text(m.x, m.y - m.h - 36, MB_WORDS[act] || '！', '#ffd166', 24, true);
      return;
    }

    m.timer += dt;
    if (m.timer < m.wind) {
      m.teleg = m.timer / m.wind;
      m.vx = 0;
      return;
    }
    m.teleg = 1;

    const finish = function (cd) {
      m.state = 'idle';
      m.cd = cd != null ? cd : (phase === 2 ? 1.0 : 1.5);
      m.vx = 0;
      m.teleg = 0;
    };
    const hit = function (dmg, kb) {
      if (overlap(mbBox(m), mbPlayerBox())) mHurt(m, dmg, kb || 2);
    };

    switch (m.state) {
      case 'charge':
        if (!m.charging) {
          m.charging = true;
          m.vx = m.actDir * (phase === 2 ? 820 : 660);
          sfx('heavy');
        }
        if (!m.hitDone && overlap(mbBox(m), mbPlayerBox())) {
          m.hitDone = true;
          mHurt(m, 24, 2);
          RG.cam.shake = 10; RG.cam.shakeT = 0.25;
        }
        if (m.timer > m.wind + m.recover || m.x <= m.minX + 8 || m.x >= m.maxX - 8) {
          m.charging = false;
          m.vx = m.actDir * -180;
          RG.cam.shake = 8; RG.cam.shakeT = 0.2;
          finish(phase === 2 ? 1.1 : 1.5);
        }
        return;
      case 'bite':
        if (!m.hitDone) {
          m.hitDone = true;
          m.vx = m.actDir * 520;
          hit(30, 2);
          FX.slashArc(m.x + m.actDir * 80, m.y - 70, 180, -0.6, 0.6, '#ff8a6a', 24);
          sfx('heavy');
        }
        if (m.timer > m.wind + m.recover) finish(1.3);
        return;
      case 'sweep':
      case 'tail': {
        if (!m.hitDone) {
          m.hitDone = true;
          // 收窄横扫范围，留出跳跃 / 后撤的躲避空间
          const w = m.state === 'tail' ? 420 : 300;
          const ox = m.state === 'tail' ? 0 : m.actDir * 130;
          const rect = { x: m.x + ox - w * 0.5, y: m.y - 240, w: w, h: 240 };
          if (overlap(rect, mbPlayerBox())) mHurt(m, m.state === 'tail' ? 22 : 24, 2);
          FX.slashArc(m.x + m.actDir * 110, m.y - 100, w * 0.7, m.actDir > 0 ? 0.15 : Math.PI - 0.15, m.actDir > 0 ? 1.45 : Math.PI - 1.45, '#ffb08a', 28);
          createZone({ k: 'shock', x: m.x - 180, y: m.y - 60, w: 360, h: 120, life: 0.45, dps: 10 * (m.dmgMul || 1), slow: 0, color: '#ff9a6a' });
          RG.cam.shake = 10; RG.cam.shakeT = 0.22;
          sfx('heavy');
        }
        if (m.timer > m.wind + m.recover) finish(1.5);
        return;
      }
      case 'poison':
        if (!m.hitDone) {
          m.hitDone = true;
          for (let i = 0; i < 3; i++) {
            mbShot(m, 'gas', m.x + m.actDir * 40, m.y - 80,
              m.actDir * (200 + i * 70), -300 + i * 48, Math.round(9 * (m.dmgMul || 1)), '#9be08a', 480);
          }
          sfx('fire');
        }
        if (m.timer > m.wind + m.recover) finish(1.6);
        return;
      case 'bubble':
        if (!m.hitDone) {
          m.hitDone = true;
          for (let i = 0; i < 5; i++) {
            mbShot(m, 'urine', m.x + m.actDir * 30, m.y - 70,
              m.actDir * (180 + i * 55), -260 - (i % 2) * 60, Math.round(7 * (m.dmgMul || 1)), '#ffd23f', 500);
          }
          sfx('fire');
        }
        if (m.timer > m.wind + m.recover) finish(1.5);
        return;
      case 'fan':
        if (!m.hitDone) {
          m.hitDone = true;
          for (let i = -2; i <= 2; i++) {
            mbShot(m, 'gas', m.x + m.actDir * 54, m.y - 90,
              m.actDir * 300, i * 70, Math.round(9 * (m.dmgMul || 1)), '#9be08a', 0);
          }
          sfx('fire');
        }
        if (m.timer > m.wind + m.recover) finish(1.7);
        return;
      case 'flame':
        if (!m.hitDone && m.timer > m.wind) {
          m.hitDone = true;
          for (let i = 0; i < 4; i++) {
            createZone({
              k: 'fire', x: m.x + m.actDir * (60 + i * 96) - 48, y: m.y - 170,
              w: 104, h: 170, life: 0.8, dps: (7 + i * 2) * (m.dmgMul || 1), slow: 0,
              color: '#ff8a3a',
            });
          }
          const rect = { x: m.actDir > 0 ? m.x + 20 : m.x - 420, y: m.y - 170, w: 400, h: 180 };
          if (overlap(rect, mbPlayerBox())) mHurt(m, 20, 2);
          FX.ring(m.x + m.actDir * 200, m.y - 90, '#ff8a3a', 260, 0.55);
          RG.cam.shake = 10; RG.cam.shakeT = 0.25;
          sfx('fire');
        }
        if (m.timer > m.wind + m.recover) finish(1.6);
        return;
      case 'drag':
        if (!m.hitDone && m.timer > m.wind) {
          m.hitDone = true;
          if (Math.abs(p.x - m.x) < 560) {
            p.vy = -820; p.onGround = false;
            mHurt(m, 18, 1);
            FX.text(p.x, p.y - 200, '拽上天', '#e8b6ff', 24, true);
            FX.ring(p.x, p.y - 60, '#b06fd6', 150, 0.55);
          }
          sfx('heavy');
        }
        if (m.timer > m.wind + m.recover) { p.rootT = Math.max(p.rootT || 0, 0.45); finish(1.7); }
        return;
      case 'coil':
        if (!m.hitDone && m.timer > m.wind) {
          m.hitDone = true;
          if (Math.abs(p.x - m.x) < 260) {
            p.rootT = Math.max(p.rootT || 0, 1.15);
            mHurt(m, 24, 1);
            FX.slashArc(p.x, p.y - 80, 110, -0.5, 0.5, '#ff9a4a', 22);
            FX.text(p.x, p.y - 180, '绞杀！', '#ff9a4a', 24, true);
          }
          RG.cam.shake = 12; RG.cam.shakeT = 0.25;
          sfx('heavy');
        }
        if (m.timer > m.wind + m.recover) finish(1.8);
        return;
      case 'quake':
        if (!m.hitDone && m.timer > m.wind) {
          m.hitDone = true;
          createZone({ k: 'shock', x: m.x - 520, y: m.y - 90, w: 480, h: 170, life: 0.55, dps: 13 * (m.dmgMul || 1), slow: 0.3, color: '#ff8a6a' });
          createZone({ k: 'shock', x: m.x + 40, y: m.y - 90, w: 480, h: 170, life: 0.55, dps: 13 * (m.dmgMul || 1), slow: 0.3, color: '#ff8a6a' });
          const rect = { x: m.x - 380, y: m.y - 200, w: 760, h: 200 };
          if (overlap(rect, mbPlayerBox())) mHurt(m, 22, 2);
          FX.ring(m.x, m.y - 40, '#ffb08a', 420, 0.5);
          RG.cam.shake = 18; RG.cam.shakeT = 0.35;
          sfx('heavy');
        }
        if (m.timer > m.wind + m.recover) finish(1.8);
        return;
      case 'roll':
        if (m.timer < m.wind) { m.vx = 0; }
        else {
          m.vx = m.actDir * 1000;
          if (!m.hitDone && overlap(mbBox(m), mbPlayerBox())) { m.hitDone = true; mHurt(m, 28, 2); }
          if (m.timer < m.wind + 0.28) FX.text(m.x, m.y - m.h - 24, '翻滚', '#ffd166', 18, true);
        }
        if (m.timer > m.wind + m.recover) finish(1.8);
        return;
      case 'slam':
      case 'stomp':
      case 'leap':
        if (!m.hitDone && (m.state !== 'leap' || m.timer > m.wind + 0.45)) {
          m.hitDone = true;
          const rect = { x: m.x - 220, y: m.y - 220, w: 440, h: 220 };
          if (overlap(rect, mbPlayerBox())) mHurt(m, m.state === 'leap' ? 26 : 22, 2);
          // 只向两侧甩出窄震波，可以从缝隙或跳跃躲开
          createZone({ k: 'shock', x: m.x - 300, y: m.y - 80, w: 220, h: 160, life: 0.5, dps: 12 * (m.dmgMul || 1), slow: 0, color: '#ff8a6a' });
          createZone({ k: 'shock', x: m.x + 80, y: m.y - 80, w: 220, h: 160, life: 0.5, dps: 12 * (m.dmgMul || 1), slow: 0, color: '#ff8a6a' });
          FX.ring(m.x, m.y - 40, '#ffb08a', 240, 0.45);
          RG.cam.shake = 14; RG.cam.shakeT = 0.3;
          sfx('heavy');
        }
        if (m.state === 'leap' && !m.leapStarted) {
          m.leapStarted = true;
          m.vy = -700;
          m.vx = m.actDir * 320;
        }
        if (m.timer > m.wind + m.recover) { m.leapStarted = false; finish(1.5); }
        return;
      case 'kick':
        if (!m.hitDone) {
          m.hitDone = true;
          const rect = { x: m.x + m.actDir * 20 - (m.actDir > 0 ? 0 : 280), y: m.y - 220, w: 280, h: 220 };
          if (overlap(rect, mbPlayerBox())) mHurt(m, 24, 2);
          FX.slashArc(m.x + m.actDir * 120, m.y - 90, 180, -0.4, 0.4, '#ffb08a', 24);
          sfx('heavy');
        }
        if (m.timer > m.wind + m.recover) finish(1.3);
        return;
      case 'drop':
        if (!m.hitDone) {
          m.hitDone = true;
          const gy = groundBelow(p.x, p.y);
          createZone({ k: 'tentacle', x: p.x - 80, y: gy - 150, w: 160, h: 150, life: 4.2, dps: 6 * (m.dmgMul || 1), slow: 0.55, poison: !!m.poison, color: '#b06fd6' });
          if (Math.abs(p.x - m.x) < 220) mHurt(m, 14, 1);
          FX.ring(p.x, gy - 20, '#56ffe0', 120, 0.6);
          sfx('holy');
        }
        if (m.timer > m.wind + m.recover) finish(1.8);
        return;
      case 'tentacle': {
        if (!m.hitDone) {
          m.hitDone = true;
          const gy = groundBelow(p.x, p.y);
          const w = 760;
          const rect = { x: m.x - w * 0.5, y: gy - 120, w: w, h: 130 };
          if (overlap(rect, mbPlayerBox())) mHurt(m, 24, 2);
          // 两条长触手自母体两侧同时拍向地面
          FX.slashArc(m.x - 20, gy - 100, 430, -0.5, 0.35, '#b06fd6', 34);
          FX.slashArc(m.x + 20, gy - 100, 430, Math.PI - 0.35, Math.PI + 0.5, '#b06fd6', 34);
          createZone({ k: 'shock', x: m.x - w * 0.5, y: gy - 60, w: w, h: 60, life: 0.4, dps: 9 * (m.dmgMul || 1), slow: 0.25, color: '#b06fd6' });
          RG.cam.shake = 16; RG.cam.shakeT = 0.4;
          sfx('heavy');
        }
        if (m.timer > m.wind + m.recover) finish(1.7);
        return;
      }
      case 'spike': {
        if (!m.hitDone) {
          m.hitDone = true;
          // 玩家脚下向外依次钻出 5 根小触手，每根延迟刺出
          const offsets = [0, -150, 150, -300, 300];
          for (let i = 0; i < offsets.length; i++) {
            const sx = clamp(p.x + offsets[i], 60, RG.room.w - 60);
            const sg = groundBelow(sx, p.y);
            createZone({ k: 'tentacleSpike', x: sx - 42, y: sg - 150, w: 84, h: 150, life: 0.62, dps: 0, slow: 0.35, color: '#b06fd6' });
            pushFuse(sx, sg - 46, 0.32 + i * 0.13, 72, 16 * (m.dmgMul || 1), 'tentacle', '#b06fd6');
          }
          FX.ring(p.x, groundBelow(p.x, p.y) - 10, '#b06fd6', 150, 0.5);
          sfx('meteor');
          RG.cam.shake = 8; RG.cam.shakeT = 0.3;
        }
        if (m.timer > m.wind + m.recover) finish(1.9);
        return;
      }
      case 'pulse':
        if (!m.hitDone) {
          m.hitDone = true;
          if (Math.abs(p.x - m.x) < 260) mHurt(m, 18, 2);
          createZone({ k: 'shock', x: m.x - 210, y: m.y - 110, w: 420, h: 260, life: 0.5, dps: 10 * (m.dmgMul || 1), slow: 0, poison: !!m.poison, color: '#3ff0d0' });
          FX.ring(m.x, m.y - 60, '#3ff0d0', 300, 0.55);
          RG.flash = 0.3;
          sfx('holy');
        }
        if (m.timer > m.wind + m.recover) finish(1.9);
        return;
      case 'spawn':
      case 'summon':
        if (!m.hitDone) {
          m.hitDone = true;
          // 鱼人王：一次性召唤 6 只沼气鱼人；其他迷你 BOSS 召唤 2 只粪精
          const isFishKing = m.type === 'gasfishKing';
          const n = isFishKing ? 6 : 2;
          for (let i = 0; i < n; i++) {
            const sp = {
              type: isFishKing ? 'gasfish' : 'poopling',
              x: m.x + (i - (n - 1) * 0.5) * 180,
              y: m.y,
              range: [m.minX, m.maxX],
            };
            sp.x = safeSpawnX(sp);
            spawnMonster(sp, 40 + i);
          }
          FX.text(m.x, m.y - m.h - 30, isFishKing ? '鱼人群起！' : '召唤！', '#ffb08a', 26, true);
          RG.cam.shake = 10; RG.cam.shakeT = 0.4;
          sfx('fire');
        }
        if (m.timer > m.wind + m.recover) finish(2.0);
        return;
      default:
        finish(1.4);
    }
  }

  /* ===================== BOSS AI ===================== */

  function updateTroll(m, dt, dist, dx, dy) {
    const p = RG.player;
    const ratio = m.hp / m.hpMax;
    m.phase = ratio > 0.66 ? 1 : (ratio > 0.33 ? 2 : 3);
    m.poise = Math.max(0, m.poise - dt * 6);

    if (m.state === 'stagger') {
      m.timer -= dt;
      if (m.timer <= 0) { m.state = 'idle'; m.cd = 0.6; }
      return;
    }
    if (m.state === 'claw' || m.state === 'slam' || m.state === 'charge' || m.state === 'roar' ||
        m.state === 'spikes' || m.state === 'leap' || m.state === 'sweep' || m.state === 'guard') {
      bossAction(m, dt, dist);
      return;
    }
    // 走路逼近
    const spd = m.phase === 3 ? 118 : (m.phase === 2 ? 96 : 82);
    if (dist > 180) m.vx = lerp(m.vx, dx > 0 ? spd : -spd, 0.1);
    else m.vx = lerp(m.vx, 0, 0.2);
    m.x += m.vx * dt;
    m.x = clamp(m.x, m.minX, m.maxX);
    if (m.cd > 0) return;

    // 选择动作：七种攻击形式，随阶段解锁更凶的招式
    const pool = ['claw', 'charge', 'slam', 'sweep'];
    if (m.phase >= 2) pool.push('spikes', 'leap');
    if (m.phase >= 3) pool.push('roar', 'leap', 'sweep');
    let act = pool[(Math.random() * pool.length) | 0];
    if (dist < 200) act = Math.random() < 0.5 ? 'claw' : (Math.random() < 0.5 ? 'slam' : 'sweep');
    m.state = act;
    m.timer = 0;
    m.hitDone = false;
    m.wind = act === 'roar' ? 1.1 : (act === 'spikes' ? 0.7 : (act === 'leap' ? 0.5 : (act === 'sweep' ? 0.62 : 0.52)));
    if (act === 'roar') RG.flash = 0.35;
    if (act === 'leap') m.leapFrom = { x: m.x, y: m.y };
    sfx('charge');
    FX.text(m.x, m.y - 230, act === 'roar' ? '痂香毒瘴！' : act === 'spikes' ? '痂皮喷发！' : act === 'leap' ? '痂壳碾压！' : act === 'sweep' ? '横扫！' : '！', '#ffb08a', 26, true);
  }

  function bossAction(m, dt, dist) {
    const p = RG.player;
    m.timer += dt;
    if (m.state === 'claw') {
      if (m.timer < m.wind) { m.vx = 0; m.teleg = m.timer / m.wind; return; }
      if (!m.hitDone) {
        m.hitDone = true;
        const rect = { x: p.x > m.x ? m.x : m.x - 170, y: m.y - 200, w: 170, h: 200 };
        if (overlap(rect, { x: p.x - 24, y: p.y - 150, w: 48, h: 150 })) mHurt(m, 22, 2);
        FX.slashArc(m.x + m.facing * 50, m.y - 120, 130, -1, 1, '#ff8a6a', 18);
        m.vx = m.facing * 120;
        RG.cam.shake = 8; RG.cam.shakeT = 0.2;
        sfx('heavy');
      }
      if (m.timer > m.wind + 0.36) { m.state = 'idle'; m.cd = m.phase === 3 ? 1.0 : 1.5; m.vx = 0; }
      return;
    }
    if (m.state === 'charge') {
      if (m.timer < m.wind) { m.vx = 0; m.teleg = m.timer / m.wind; return; }
      m.vx = m.facing * (m.phase === 3 ? 820 : 700);
      m.x += m.vx * dt;
      const box = { x: m.x - 80, y: m.y - 190, w: 160, h: 190 };
      if (overlap(box, { x: p.x - 24, y: p.y - 150, w: 48, h: 150 })) mHurt(m, 26, 2);
      // 撞墙硬直
      if (m.x <= m.minX + 30 || m.x >= m.maxX - 30) {
        m.state = 'stagger'; m.timer = 1.5;
        m.vx = 0;
        RG.cam.shake = 14; RG.cam.shakeT = 0.5;
        FX.ring(m.x, m.y - 100, '#ffd166', 200, 0.5);
        FX.text(m.x, m.y - 230, '撞击硬直！', '#ffd166', 26, true);
        sfx('ko');
        return;
      }
      if (m.timer > m.wind + 0.65) {
        m.state = 'idle'; m.cd = 1.2; m.vx = 0;
      }
      return;
    }
    if (m.state === 'slam') {
      if (m.timer < m.wind) { m.vx = 0; m.teleg = m.timer / m.wind; return; }
      if (!m.hitDone) {
        m.hitDone = true;
        RG.cam.shake = 16; RG.cam.shakeT = 0.55;
        FX.ring(m.x, m.baseY, '#ff8a6a', 260, 0.6);
        FX.burst(m.x, m.baseY, 26, { colors: ['#e0b08a', '#b5372f', '#ffffff'], speedMin: 90, speedMax: 430, sizeMin: 3, sizeMax: 8, lifeMin: 0.3, lifeMax: 0.8 });
        for (let s = -1; s <= 1; s += 2) {
          RG.projectiles.push({
            k: 'shock', x: m.x, y: m.baseY - 16, vx: s * 460, vy: 0, r: 18, dmg: Math.round(16 * (m.dmgMul || 1)), life: 2.6, grav: 0, owner: 'monster', color: '#ff8a6a',
            trueDmg: m.trueDmg || 0,
          });
        }
        sfx('meteor');
      }
      if (m.timer > m.wind + 0.5) { m.state = 'idle'; m.cd = 1.5; }
      return;
    }
    if (m.state === 'spikes') {
      if (m.timer < m.wind) {
        // 预警标记
        m.vx = 0;
        if (!m.marks) {
          m.marks = [];
          for (let i = 0; i < 2; i++) {
            m.marks.push({ x: clamp(p.x + (i - 0.5) * 210 + rnd(-30, 30), 60, RG.room.w - 60), t: 0 });
          }
        }
        for (let i = 0; i < m.marks.length; i++) m.marks[i].t += dt;
        return;
      }
      if (!m.hitDone) {
        m.hitDone = true;
        const marks = m.marks || [];
        for (let i = 0; i < marks.length; i++) {
          createZone({ k: 'spike', x: marks[i].x - 34, y: m.baseY - 150, w: 68, h: 150, life: 0.8, dps: 16 * (m.dmgMul || 1), slow: 0, color: '#e0b08a' });
        }
        m.marks = null;
        sfx('meteor');
        RG.cam.shake = 10; RG.cam.shakeT = 0.4;
      }
      if (m.timer > m.wind + 0.8) { m.state = 'idle'; m.cd = 1.6; }
      return;
    }
    if (m.state === 'roar') {
      if (m.timer < m.wind) { m.vx = 0; RG.flash = Math.min(0.6, m.timer / m.wind * 0.6); return; }
      if (!m.hitDone) {
        m.hitDone = true;
        RG.flash = 0.5;
        RG.cam.shake = 14; RG.cam.shakeT = 0.6;
        // 毒瘴只覆盖左右两块，中央与通风口留出可躲避的空档
        createZone({ k: 'gas', x: 0, y: m.baseY - 400, w: 460, h: 400, life: 4.2, dps: 5 * (m.dmgMul || 1), slow: 0.2, color: '#c4a35a' });
        createZone({ k: 'gas', x: 1700, y: m.baseY - 400, w: 540, h: 400, life: 4.2, dps: 5 * (m.dmgMul || 1), slow: 0.2, color: '#c4a35a' });
        FX.text(m.x, m.y - 240, '躲到通风口！', '#ffd166', 30, true);
        sfx('dark');
      }
      if (m.timer > m.wind + 1.2) { m.state = 'idle'; m.cd = 2.2; }
      return;
    }
    // 六·痂壳碾压：蓄力后腾空砸向玩家
    if (m.state === 'leap') {
      if (m.timer < m.wind) { m.vx = 0; m.teleg = m.timer / m.wind; return; }
      if (!m.hitDone) {
        m.hitDone = true;
        m.air = true;
        m.vy = -860;
        m.vx = clamp(p.x - m.x, -520, 520) * 1.15;
        sfx('jump');
      }
      if (m.air) {
        m.vy += 2600 * dt;
        m.y += m.vy * dt;
        m.x += m.vx * dt;
        m.x = clamp(m.x, m.minX, m.maxX);
        if (m.y >= m.baseY) {
          m.y = m.baseY;
          m.air = false;
          m.vx = 0;
          RG.cam.shake = 20; RG.cam.shakeT = 0.6;
          FX.ring(m.x, m.baseY, '#ffb08a', 290, 0.55);
          FX.burst(m.x, m.baseY, 24, { colors: ['#e0b08a', '#b5372f'], speedMin: 100, speedMax: 460, sizeMin: 3, sizeMax: 8, lifeMin: 0.3, lifeMax: 0.7 });
          if (Math.abs(p.x - m.x) < 230 && Math.abs(p.y - m.baseY) < 220) mHurt(m, 30, 2);
          for (let s = -1; s <= 1; s += 2) {
            RG.projectiles.push({
              k: 'shock', x: m.x, y: m.baseY - 16, vx: s * 500, vy: 0, r: 20, dmg: Math.round(18 * (m.dmgMul || 1)), life: 2.4, grav: 0, owner: 'monster', color: '#ffb08a',
              trueDmg: m.trueDmg || 0,
            });
          }
          sfx('meteor');
          m.state = 'idle';
          m.cd = 1.4;
        }
        return;
      }
      if (m.timer > m.wind + 0.4) { m.state = 'idle'; m.cd = 1.2; }
      return;
    }
    // 七·横扫：超长横斩并甩出冲击波
    if (m.state === 'sweep') {
      if (m.timer < m.wind) { m.vx = 0; m.teleg = m.timer / m.wind; return; }
      if (!m.hitDone) {
        m.hitDone = true;
        const rect = { x: m.facing > 0 ? m.x : m.x - 240, y: m.y - 220, w: 240, h: 220 };
        if (overlap(rect, { x: p.x - 24, y: p.y - 150, w: 48, h: 150 })) mHurt(m, 24, 2);
        FX.slashArc(m.x + m.facing * 80, m.y - 96, 200,
          m.facing > 0 ? -0.45 : Math.PI - 0.45,
          m.facing > 0 ? 0.45 : Math.PI + 0.45, '#ff8a6a', 20);
        RG.projectiles.push({
          k: 'shock', x: m.x + m.facing * 60, y: m.y - 34, vx: m.facing * 520, vy: 0, r: 24, dmg: Math.round(14 * (m.dmgMul || 1)), life: 2.0, grav: 0, owner: 'monster', color: '#ffb08a',
          trueDmg: m.trueDmg || 0,
        });
        m.vx = m.facing * 220;
        RG.cam.shake = 12; RG.cam.shakeT = 0.35;
        sfx('heavy');
      }
      if (m.timer > m.wind + 0.55) { m.state = 'idle'; m.cd = 1.3; m.vx = 0; }
      return;
    }
  }

  /* ===================== 投射物 / 区域 ===================== */

  function createZone(z) {
    z.t = 0;
    z.max = z.life;
    RG.zones.push(z);
    return z;
  }

  function updateProjectiles(dt) {
    const p = RG.player;
    for (let i = RG.projectiles.length - 1; i >= 0; i--) {
      const b = RG.projectiles[i];
      b.life -= dt;
      if (b.life <= 0) {
        if (b.k === 'gas') createZone({ k: 'gas', x: b.x - 60, y: b.y - 40, w: 120, h: 90, life: 2.4, dps: 4, slow: 0.3, color: '#9be08a' });
        if (b.k === 'urine') createZone({ k: 'acid', x: b.x - 50, y: groundBelow(b.x, b.y) - 4, w: 100, h: 40, life: 2.6, dps: 4, slow: 0.35, color: '#ffd23f' });
        if (b.k === 'bomb') explodeBomb(b);
        RG.projectiles.splice(i, 1);
        continue;
      }
      b.vy += (b.grav || 0) * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      // 命中玩家
      if (b.owner === 'monster') {
        const pr = { x: p.x - 20, y: p.y - 146, w: 40, h: 146 };
        if (b.x > pr.x && b.x < pr.x + pr.w && b.y > pr.y && b.y < pr.y + pr.h) {
          hurtPlayer(b.dmg, b.x, b.kb || 1, b.trueDmg || 0);
          if (b.k === 'gas') createZone({ k: 'gas', x: b.x - 60, y: b.y - 40, w: 120, h: 90, life: 2.2, dps: 4, slow: 0.3, color: '#9be08a' });
          if (b.k === 'urine') createZone({ k: 'acid', x: b.x - 50, y: groundBelow(b.x, b.y) - 4, w: 100, h: 40, life: 2.4, dps: 4, slow: 0.3, color: '#ffd23f' });
          RG.projectiles.splice(i, 1);
          continue;
        }
      }
      if (b.x < -100 || b.x > RG.room.w + 100 || b.y < -300 || b.y > RG.room.h + 200) {
        RG.projectiles.splice(i, 1);
      }
    }
  }

  function explodeBomb(b) {
    sfx('meteor');
    RG.cam.shake = 12; RG.cam.shakeT = 0.4;
    FX.ring(b.x, b.y, '#ffe9a0', 220, 0.55);
    FX.burst(b.x, b.y, 24, { colors: ['#ffe9a0', '#ffffff', '#a8f0c8'], speedMin: 80, speedMax: 420, sizeMin: 2, sizeMax: 7, lifeMin: 0.3, lifeMax: 0.7 });
    for (let i = 0; i < RG.monsters.length; i++) {
      const m = RG.monsters[i];
      if (m.dead) continue;
      if (Math.abs(m.x - b.x) < 220 && Math.abs(m.y - b.y) < 260) hitMonster(m, 60, 'heavy', b.x);
    }
  }

  /* 连锁雷种：从命中目标逐跳弹向最近的另一名敌人（跳数与每跳伤害随遗物等级提升） */
  function chainLightning(src, dmg) {
    if (RG.chainLock) return;
    const mods = (RG.player && RG.player.mods) || {};
    const jumps = Math.max(1, Math.round(mods.chainJumps || 1));
    const ratio = mods.chainDmg || 0.5;
    RG.chainLock = true;
    let cur = src, prev = dmg, guard = 0;
    const hit = [src];
    while (guard < jumps) {
      guard++;
      let best = null, bd = 340;
      for (let i = 0; i < RG.monsters.length; i++) {
        const m = RG.monsters[i];
        if (!m || m.dead || hit.indexOf(m) >= 0) continue;
        const d = Math.abs(m.x - cur.x) + Math.abs(m.y - cur.y) * 0.5;
        if (d < bd) { bd = d; best = m; }
      }
      if (!best) break;
      const dmgJ = Math.max(4, Math.round(prev * ratio * Math.pow(0.8, guard - 1)));
      const sx = (cur.x + best.x) / 2, sy = cur.y - cur.h * 0.55;
      FX.ring(best.x, best.y - best.h * 0.5, '#bfe8ff', 70, 0.3);
      FX.burst(sx, sy, 14, { colors: ['#bfe8ff', '#ffffff', '#8ad8ff'], speedMin: 60, speedMax: 300, sizeMin: 2, sizeMax: 5, lifeMin: 0.2, lifeMax: 0.45 });
      hitMonster(best, dmgJ, 'light', cur.x);
      hit.push(best);
      cur = best;
      prev = dmgJ;
    }
    RG.chainLock = false;
  }

  /* 铁蒺藜：定时在脚下布设陷阱 */
  function placeTrap() {
    const p = RG.player;
    RG.traps.push({ x: p.x, y: p.y, arm: 0.35, life: 8, dead: false });
  }

  function updateTraps(dt) {
    const p = RG.player;
    if (!p) return;
    const mods = p.mods || {};
    if (mods.trapLv > 0) {
      RG.trapCd = (RG.trapCd || 0) - dt;
      if (RG.trapCd <= 0 && p.onGround) {
        RG.trapCd = mods.trapInterval || Math.max(1.6, 4 - (mods.trapLv - 1) * 0.5);
        placeTrap();
      }
    }
    for (let i = RG.traps.length - 1; i >= 0; i--) {
      const tr = RG.traps[i];
      tr.life -= dt;
      if (tr.arm > 0) { tr.arm -= dt; }
      if (tr.life <= 0) { RG.traps.splice(i, 1); continue; }
      if (tr.arm > 0) continue;
      let hitAny = false;
      for (let j = 0; j < RG.monsters.length; j++) {
        const m = RG.monsters[j];
        if (!m || m.dead) continue;
        const trR = mods.trapR || 90;
        if (Math.abs(m.x - tr.x) < trR && Math.abs(m.y - tr.y) < 120) {
          hitAny = true;
          hitMonster(m, Math.round(mods.trapDmg || 70), 'heavy', tr.x);
        }
      }
      if (hitAny) {
        FX.ring(tr.x, tr.y - 30, '#ffb08a', 150, 0.4);
        FX.burst(tr.x, tr.y - 20, 16, { colors: ['#ffb08a', '#ffe9a0'], speedMin: 80, speedMax: 320, sizeMin: 2, sizeMax: 6, lifeMin: 0.2, lifeMax: 0.5 });
        RG.cam.shake = Math.max(RG.cam.shake, 8);
        sfx('explode');
        RG.traps.splice(i, 1);
      }
    }
  }

  function updateZones(dt) {
    const p = RG.player;
    for (let i = RG.zones.length - 1; i >= 0; i--) {
      const z = RG.zones[i];
      z.t += dt;
      z.life -= dt;
      if (z.life <= 0) { RG.zones.splice(i, 1); continue; }
      const rect = { x: p.x - 20, y: p.y - 150, w: 40, h: 150 };
      const zr = { x: z.x, y: z.y, w: z.w, h: z.h };
      if (!overlap(rect, zr)) continue;
      if (z.k === 'spike') {
        hurtPlayer(Math.round(z.dps * (z.dmgMul || 1)), z.x + z.w / 2, 2);
        p.vy = -520;
      } else {
        z.dotT = (z.dotT || 0) + dt;
        if (z.dotT > 0.35) {
          z.dotT = 0;
          if (z.k === 'acid' && p.mods.acidImmune) {
            // 免疫
          } else if (z.k === 'gas' && p.antidote > 0) {
            // 抗毒血清
          } else {
            hurtPlayerTiny(z.dps, z.color);
            if (z.poison) applyPoison();
          }
        }
        if (z.slow && !(z.k === 'acid' && p.mods.acidImmune)) {
          p.slowT = 0.15;
        }
      }
    }
  }

  function hurtPlayerTiny(d, color) {
    const p = RG.player;
    if (p.invuln > 0 || RG.screen !== 'play') return;
    if (p.mods && p.mods.immortal) { p.invuln = Math.max(p.invuln, 0.2); return; }
    let v = d;
    if (p.mods.gasResist) v *= (1 - p.mods.gasResist);
    if (p.mods.shield) v *= (1 - p.mods.shield);
    if (p.shieldT > 0) v *= (1 - (p.shieldMul || 0));
    v = Math.max(1, Math.round(v));
    p.hp -= v;
    p.hurtT = Math.max(p.hurtT, 0.1);
    FX.damage(p.x + rnd(-12, 12), p.y - 120, v, { color: color || '#b8ffcf', size: 21 });
    RG.flash = Math.min(0.5, RG.flash + 0.08);
    if (p.hp <= 0) {
      p.hp = 0;
      if (tryRevive(p)) return;
      RG.screen = 'dead'; RG.screenT = 0; RG.endT = 0;
      sfx('ko');
    }
  }

  /* ===================== 机关更新 ===================== */

  function updateHazards(dt) {
    const p = RG.player;
    for (let i = 0; i < RG.hazards.length; i++) {
      const h = RG.hazards[i];
      if (h.type === 'steam') { steamPhase(h, dt); continue; }
      if (h.type === 'moving') {
        h.prevY = h.y;
        if (h.axis === 'y') {
          h.y += h.mdir * h.speed * dt;
          if (h.y > h.to) { h.y = h.to; h.mdir = -1; }
          if (h.y < h.from) { h.y = h.from; h.mdir = 1; }
          h.dy = h.y - h.prevY;
        }
        continue;
      }
      if (h.type === 'break') {
        if (!h.active) {
          h.respawn -= dt;
          if (h.respawn <= 0) {
            h.active = true; h.breakT = 0; h.crack = 0.2;
            FX.burst(h.x + h.w / 2, h.y, 8, { color: '#8a7a60', speedMin: 20, speedMax: 120, sizeMin: 2, sizeMax: 4, lifeMin: 0.2, lifeMax: 0.5 });
          }
        } else if (h.breakT > 0.85) {
          h.active = false; h.respawn = 6;
          FX.burst(h.x + h.w / 2, h.y, 14, { colors: ['#6a5a48', '#3a3028'], speedMin: 40, speedMax: 220, sizeMin: 2, sizeMax: 6, lifeMin: 0.3, lifeMax: 0.8 });
          sfx('land');
        }
        if (h.shakeT > 0) h.shakeT -= dt;
        continue;
      }
      if (h.type === 'ball') {
        if (!h.alive) continue;
        h.rot = (h.rot || 0) + h.dir * h.speed * dt / 34;
        h.x += h.dir * h.speed * dt;
        // 撞墙反弹
        if (h.x > RG.room.w - 60) { h.x = RG.room.w - 60; h.dir = -1; }
        if (h.x < 60) { h.x = 60; h.dir = 1; }
        h.hurt = Math.max(0, h.hurt - dt);
        // 伤害玩家
        if (Math.abs(h.x - p.x) < 56 && Math.abs((h.y - 34) - (p.y - 70)) < 80) {
          hurtPlayer(14, h.x, 2);
        }
        // 被玩家攻击
        const box = { x: h.x - 34, y: h.y - 68, w: 68, h: 68 };
        for (let k = 0; k < RG.monsters.length; k++) { /* 占位：滚球独立 */ }
        continue;
      }
    }
  }

  /* 玩家攻击滚粪球（rebase） */
  function ballHitCheck(rect, dmg) {
    for (let i = 0; i < RG.hazards.length; i++) {
      const h = RG.hazards[i];
      if (h.type !== 'ball' || !h.alive) continue;
      const box = { x: h.x - 34, y: h.y - 68, w: 68, h: 68 };
      if (!overlap(rect, box)) continue;
      h.hp -= dmg;
      h.hurt = 0.12;
      FX.damage(h.x, h.y - 60, dmg, { color: '#ffd166' });
      if (h.hp <= 0) {
        h.alive = false; h.dead = true;
        FX.burst(h.x, h.y - 30, 18, { colors: ['#a9611f', '#d58a3c', '#6f3a10'], speedMin: 80, speedMax: 340, sizeMin: 3, sizeMax: 7, lifeMin: 0.3, lifeMax: 0.8 });
        RG.scrap += Math.round(10 * RG.player.mods.scrapMul);
        sfx('ko');
      }
    }
  }

  /* ===================== 道具 / 交互 ===================== */

  function updateProps(dt) {
    const p = RG.player;
    // 场景道具
    for (let i = 0; i < RG.props.length; i++) {
      const pr = RG.props[i];
      if (pr.taken) continue;
      if (pr.type === 'gambler') {
        pr.near = Math.abs(pr.x - p.x) < 130 && Math.abs(pr.y - p.y) < 220;
        continue;
      }
      pr.near = Math.abs(pr.x - p.x) < 74 && Math.abs(pr.y - p.y) < 130;
      if (pr.type === 'scrap' && Math.abs(pr.x - p.x) < 56 && Math.abs(pr.y - p.y) < 110) {
        pr.taken = true;
        RG.scrap += Math.round(8 * p.mods.scrapMul);
        FX.text(pr.x, pr.y - 40, '+' + Math.round(8 * p.mods.scrapMul), '#ffd166', 22);
        sfx('uiPick');
      }
    }
    // 掉落物
    for (let i = RG.drops.length - 1; i >= 0; i--) {
      const pr = RG.drops[i];
      pr.vy += 900 * dt;
      pr.y += pr.vy * dt;
      const gy = groundBelow(pr.x, pr.y - 24);
      if (pr.y > gy) { pr.y = gy; pr.vy = 0; }
      pr.near = Math.abs(pr.x - p.x) < 74 && Math.abs(pr.y - p.y) < 120;
      // 掉落物自动拾取（废料 / 遗物 / 药剂）
      if (!pr.taken && Math.abs(pr.x - p.x) < 62 && Math.abs(pr.y - p.y) < 132) {
        pr.taken = true;
        if (pr.type === 'scrap') {
          const v = Math.round(pr.value || 6);
          RG.scrap += v;
          FX.text(pr.x, pr.y - 40, '+' + v, '#ffd166', 22);
          sfx('uiPick');
        } else if (pr.type === 'relic' && pr.relic) {
          const res = addRelic(pr.relic);
          if (res) showRelicPop(res.entry);
          FX.ring(pr.x, pr.y - 40, '#ffd166', 90, 0.5);
          toast('拾取遗物 · ' + pr.relic.name, 2);
          sfx('holy');
        } else {
          addItem(pr.type);
          toast('拾取 ' + ((D.ITEMS[pr.type] && D.ITEMS[pr.type].name) || '道具'), 1.6);
          sfx('uiPick');
        }
      }
      if (pr.taken) RG.drops.splice(i, 1);
    }
    // 闸门
    if (RG.gate) {
      RG.gate.near = RG.room.def.boss ? false : (Math.abs(RG.gate.x - p.x) < 100 && Math.abs(RG.gate.baseY - p.y) < 190 && RG.gate.open);
      if (RG.gate.open) RG.gate.openT = Math.min(1, RG.gate.openT + dt * 1.6);
    }
    // 减速恢复
    if (p.slowT > 0) p.slowT -= dt;
  }

  /* 就近的情赌徒：每次交互时实时计算，不依赖上一帧缓存的 near */
  function nearestGambler() {
    const p = RG.player;
    let best = null, bestDx = 1e9;
    for (let i = 0; i < RG.props.length; i++) {
      const pr = RG.props[i];
      if (pr.type !== 'gambler' || pr.taken) continue;
      const dx = Math.abs(pr.x - p.x);
      const dy = Math.abs(pr.y - p.y);
      if (dx > 130 || dy > 220) continue;
      if (dx < bestDx) { bestDx = dx; best = pr; }
    }
    return best;
  }

  function tryInteract() {
    const p = RG.player;
    // 情赌徒优先（只在赌徒旁按 E，避免和闸门/宝箱抢交互）
    const gm = nearestGambler();
    if (gm) {
      openGamble(gm);
      return true;
    }
    // 闸门
    if (RG.gate && RG.gate.near) {
      enterReward();
      return true;
    }
    // 场景道具
    for (let i = 0; i < RG.props.length; i++) {
      const pr = RG.props[i];
      if (pr.taken || !pr.near) continue;
      if (pr.type === 'gambler') {
        openGamble(pr);
        return true;
      }
      if (pr.type === 'chest') {
        pr.taken = true;
        sfx('uiPick');
        FX.burst(pr.x, pr.y - 40, 20, { colors: ['#ffd166', '#ffe9a0', '#ffffff'], speedMin: 60, speedMax: 300, sizeMin: 2, sizeMax: 6, lifeMin: 0.3, lifeMax: 0.8 });
        const gained = Math.round(12 * p.mods.scrapMul);
        RG.scrap += gained;
        const relic = pickRelic();
        if (relic) {
          const got = addRelic(relic);
          const entry = got && got.entry ? got.entry : relic;
          recalcMods();
          FX.ring(pr.x, pr.y - 40, '#ffd166', 120, 0.6);
          FX.text(pr.x, pr.y - 100, '遗物 · ' + entry.name + ' Lv' + (entry.level || 1), '#ffd166', 22, true);
          showRelicPop(entry);
          toast('遗物 · ' + entry.name + ' Lv' + (entry.level || 1) + '：' + (entry.desc || ''), 3.2);
        } else {
          addItem(pickRandomItem());
          healPlayer(40, true);
          toast('遗物已集齐 · 宝箱给予道具与 40 生命', 2.2);
        }
        return true;
      }
      pr.taken = true;
      if (pr.type === 'scrap') {
        RG.scrap += Math.round(8 * p.mods.scrapMul);
      } else {
        addItem(pr.type);
        toast('拾取 ' + D.ITEMS[pr.type].name, 1.6);
      }
      sfx('uiPick');
      return true;
    }
    // 掉落物
    for (let i = 0; i < RG.drops.length; i++) {
      const pr = RG.drops[i];
      if (pr.taken || !pr.near) continue;
      pr.taken = true;
      addItem(pr.type);
      toast('拾取 ' + D.ITEMS[pr.type].name, 1.6);
      sfx('uiPick');
      return true;
    }
    return false;
  }

  function pickRandomItem() {
    const keys = Object.keys(D.ITEMS);
    return keys[(Math.random() * keys.length) | 0];
  }

  /* 获得遗物时展示作用说明（右侧弹窗 + 遗物栏可随时查看） */
  function showRelicPop(relic) {
    if (!relic) return;
    RG.relicPop = relic;
    RG.relicPopT = 3.4;
  }

  function pickRelic() {
    const pool = relicPool();
    if (!pool.length) return null;
    return pool[(Math.random() * pool.length) | 0];
  }

  function addItem(type) {
    const p = RG.player;
    if (p.items.length >= 3) p.items.shift();
    p.items.push(type);
  }

  function useItem() {
    const p = RG.player;
    if (!p.items.length) { toast('没有可用的道具', 1.4); return; }
    const type = p.items.shift();
    RG.itemsUsed[type] = (RG.itemsUsed[type] || 0) + 1;
    const it = D.ITEMS[type];
    if (type === 'potion') {
      const heal = D.HEAL_AMOUNT || 120;
      healPlayer(heal);
      toast('饮用净水药剂 · 回复 ' + heal, 1.6);
      sfx('heal');
    } else if (type === 'bandage') {
      healPlayer(200);
      toast('绷带包扎 · 回复 200 生命', 1.6);
      sfx('heal');
    } else if (type === 'stim') {
      p.stimT = 6;
      toast('注射兴奋剂 · 6 秒伤害 +30%', 1.8);
      sfx('holy');
    } else if (type === 'ward') {
      p.wardT = 6;
      toast('捏碎护符 · 6 秒减伤 40%', 1.8);
      sfx('holy');
    } else if (type === 'magnet') {
      let got = 0;
      for (let i = 0; i < RG.props.length; i++) {
        const pr = RG.props[i];
        if (pr.type === 'scrap' && !pr.taken) {
          pr.taken = true;
          got += 8;
          FX.ring(pr.x, pr.y - 20, '#c9a0ff', 40, 0.3);
        }
      }
      RG.scrap += Math.round((got + 60) * p.mods.scrapMul);
      toast('磁石吸取废料 · +' + Math.round((got + 60) * p.mods.scrapMul), 1.8);
      sfx('uiPick');
    } else if (type === 'antidote') {
      p.antidote = 12;
      toast('注射抗毒血清 · 12 秒免疫', 1.8);
      sfx('heal');
    } else if (type === 'incense') {
      for (let i = 0; i < RG.monsters.length; i++) {
        const m = RG.monsters[i];
        if (m.bossLike) {
          const d = bossCcApply(m, '眩晕', 3);
          if (d > 0) { m.stun = Math.max(m.stun || 0, d); m.state = 'idle'; }
        } else {
          m.stun = 3; m.state = 'idle';
          FX.text(m.x, m.y - 90, '眩晕', '#ff9f45', 20);
        }
      }
      toast('点燃驱瘴香薰 · 全场眩晕 3 秒', 2);
      sfx('holy');
      FX.ring(p.x, p.y - 80, '#ff9f45', 400, 0.6);
    } else if (type === 'holywater') {
      RG.projectiles.push({
        k: 'bomb', x: p.x + p.facing * 20, y: p.y - 120, vx: p.facing * 420, vy: -260,
        r: 16, dmg: 60, life: 0.9, grav: 600, owner: 'player', color: '#ffe9a0',
      });
      toast('投掷圣水炸弹', 1.4);
      sfx('fire');
    }
    if (it) FX.text(p.x, p.y - 180, it.name, '#ffe9a0', 22);
  }

  /* ===================== 奖励 / 通关 ===================== */

  function enterReward() {
    RG.rewardIndex = 0;
    RG.relicChoices = rollRelics(3);
    // 遗物全收集（12 件）时池子为空 → 跳过遗物，直接进入强化三选一
    if (!RG.relicChoices.length) {
      healPlayer(20, true);
      toast('遗物已集齐 · 休整回复 20 生命', 2.4);
      startBuffStage();
      return;
    }
    RG.screen = 'reward';
    sfx('uiPick');
  }

  /* ---------------- 关卡强化（BUFF）三选一 ---------------- */

  function startBuffStage() {
    RG.buffIndex = 0;
    RG.buffChoices = rollBuffs(3);
    if (!RG.buffChoices.length) { startUpgradeStage(); return; }
    RG.screen = 'buff';
    RG.screenT = 0;
    sfx('uiPick');
  }

  /* ---------------- 每关结束：废料强化 ---------------- */

  function startUpgradeStage() {
    RG.upgIndex = 0;
    RG.screen = 'upgrade';
    RG.screenT = 0;
    sfx('uiPick');
  }

  function updateUpgrade() {
    const n = UPG_DEFS.length;
    if (keyPress(['ArrowLeft', 'KeyA'])) { RG.upgIndex = (RG.upgIndex + n - 1) % n; sfx('ui'); }
    if (keyPress(['ArrowRight', 'KeyD'])) { RG.upgIndex = (RG.upgIndex + 1) % n; sfx('ui'); }
    for (let i = 0; i < n; i++) {
      if (keyPress(['Digit' + (i + 1), 'Numpad' + (i + 1)])) buyUpgrade(i);
    }
    if (keyPress(['Enter', 'Space', 'KeyJ'])) {
      sfx('uiPick');
      advanceRoom();
    }
  }

  function advanceRoom() {
    if (RG.mode === 'gauntlet') { startNextGauntletStage(); return; }
    RG.roomIndex++;
    if (RG.roomIndex >= D.ROOMS.length) { RG.screen = 'win'; RG.screenT = 0; return; }
    loadRoom(RG.roomIndex);
    RG.screen = 'play';
  }

  /* ---------------- 连战：击杀奖励 / 补给商店 ---------------- */

  /* 随机发放 n 件不同（尽可能）的遗物 */
  function grantGauntletRelics(n) {
    let got = 0;
    const pool = relicPool();
    while (got < n && pool.length) {
      const i = (Math.random() * pool.length) | 0;
      addRelic(pool[i]);
      pool.splice(i, 1);
      got++;
    }
    if (got) recalcMods();
    return got;
  }

  function gauntletClear() {
    const stage = RG.gstage;
    const final = stage >= GAUNTLET_STAGES - 1;
    const gain = gauntletScrapFor(stage);
    const got = grantGauntletRelics(10);
    RG.scrap += gain;
    RG.shopScrap = gain;
    if (final) {
      RG.screen = 'win';
      RG.screenT = 0;
      RG.endT = 2.4;
      toast('连战全通 · 痂香杀手鳄倒下了', 4);
      sfx('ko');
      FX.ring(RG.player.x, 400, '#ffd166', 420, 1.2);
      return;
    }
    RG.gstage++;
    RG.shopIndex = 0;
    RG.screen = 'gshop';
    RG.screenT = 0;
    // 补给：回复 40% 最大生命
    healPlayer(Math.round(RG.player.hpMax * 0.4), true);
    toast('击败首领 · +' + gain + ' 废料 · +' + got + ' 件遗物', 3.2);
    sfx('uiPick');
  }

  /* 连战商店可以购买全部非隐藏遗物 */
  function shopRelicList() {
    return D.RELICS.filter(function (r) { return !r.hidden; });
  }
  function gauntletRelicPrice(r) {
    const e = findRelic(r.id);
    const lv = e ? e.level : 0;
    return 180 + lv * 90;
  }
  function gauntletShopBuyRelic(i) {
    if (RG.screen !== 'gshop') return;
    const list = shopRelicList();
    const r = list[clamp(i, 0, list.length - 1)];
    if (!r) return;
    const e = findRelic(r.id);
    if (e && e.level >= RELIC_MAX_LV) { toast(r.name + ' 已满级（Lv' + RELIC_MAX_LV + '）', 1.6); sfx('ui'); return; }
    const price = gauntletRelicPrice(r);
    if (RG.scrap < price) { toast('废料不足 · 需要 ' + price, 1.6); sfx('ui'); return; }
    RG.scrap -= price;
    const got = addRelic(r);
    recalcMods();
    const lvTxt = got && got.entry ? ' Lv' + got.entry.level : '';
    toast('购买遗物：' + r.name + lvTxt + ' · -' + price + ' 废料', 2.2);
    FX.text(RG.player.x, RG.player.y - 180, r.name + lvTxt, '#ffd166', 24, true);
    sfx('uiPick');
  }
  function updateGauntletShop() {
    RG.screenT = (RG.screenT || 0) + 1 / 60;
    const list = shopRelicList();
    const n = list.length;
    if (keyPress(['ArrowLeft', 'KeyA'])) { RG.shopIndex = (RG.shopIndex + n - 1) % n; sfx('ui'); }
    if (keyPress(['ArrowRight', 'KeyD'])) { RG.shopIndex = (RG.shopIndex + 1) % n; sfx('ui'); }
    if (keyPress(['KeyE', 'KeyF'])) gauntletShopBuyRelic(RG.shopIndex);
    for (let i = 0; i < UPG_DEFS.length; i++) {
      if (keyPress(['Digit' + (i + 1), 'Numpad' + (i + 1)])) buyUpgrade(i);
    }
    if (keyPress(['Enter', 'Space', 'KeyJ'])) {
      sfx('uiPick');
      startNextGauntletStage();
    }
  }
  function startNextGauntletStage() {
    loadRoom(RG.gstage);
    RG.screen = 'play';
  }

  function rollBuffs(n) {
    const owned = RG.buffs.map(function (b) { return b.id; });
    const own = (D.CHAR_BUFFS[RG.char.id] || []).filter(function (b) { return owned.indexOf(b.id) < 0; });
    const gen = D.BUFFS.filter(function (b) { return owned.indexOf(b.id) < 0; });
    const out = [];
    // 保底至少一个角色专属强化
    if (own.length) out.push(own[(Math.random() * own.length) | 0]);
    const rest = gen.concat(own.filter(function (b) { return out.indexOf(b) < 0; }));
    while (out.length < n && rest.length) {
      const i = (Math.random() * rest.length) | 0;
      out.push(rest[i]);
      rest.splice(i, 1);
    }
    return out.slice(0, n);
  }

  function updateBuff() {
    const n = RG.buffChoices.length;
    if (keyPress(['ArrowLeft', 'KeyA'])) { RG.buffIndex = (RG.buffIndex + n - 1) % n; sfx('ui'); }
    if (keyPress(['ArrowRight', 'KeyD'])) { RG.buffIndex = (RG.buffIndex + 1) % n; sfx('ui'); }
    if (keyPress(['Digit1', 'Numpad1'])) chooseBuff(0);
    else if (keyPress(['Digit2', 'Numpad2'])) chooseBuff(1);
    else if (keyPress(['Digit3', 'Numpad3'])) chooseBuff(2);
    else if (keyPress(['Enter', 'Space', 'KeyJ'])) chooseBuff(RG.buffIndex);
  }

  function chooseBuff(i) {
    const b = RG.buffChoices[i];
    if (!b) return;
    RG.buffs.push(b);
    recalcMods();
    sfx('uiPick');
    FX.text(RG.player.x, RG.player.y - 180, '强化 · ' + b.name, '#ffd166', 26);
    toast('获得强化：' + b.name, 2.4);
    // 强化之后进入废料强化环节，再推进到下一关
    startUpgradeStage();
  }

  function rollRelics(n) {
    const pool = relicPool();
    const out = [];
    while (out.length < n && pool.length) {
      const i = (Math.random() * pool.length) | 0;
      out.push(pool[i]);
      pool.splice(i, 1);
    }
    return out;
  }

  function updateReward() {
    if (keyPress(['ArrowLeft', 'KeyA'])) { RG.rewardIndex = Math.max(0, RG.rewardIndex - 1); sfx('ui'); }
    if (keyPress(['ArrowRight', 'KeyD'])) { RG.rewardIndex = Math.min(RG.relicChoices.length - 1, RG.rewardIndex + 1); sfx('ui'); }
    if (keyPress(['Enter', 'Space', 'KeyJ'])) { chooseRelic(RG.rewardIndex); }
  }

  function chooseRelic(i) {
    const r = RG.relicChoices[i];
    if (!r) return;
    const got = addRelic(r);
    recalcMods();
    healPlayer(12, true);
    RG.player.hp = Math.min(RG.player.hpMax, RG.player.hp + 12);
    sfx('uiPick');
    const lvTxt = got && got.entry ? ' Lv' + got.entry.level : '';
    toast('获得遗物：' + r.name + lvTxt + ' · 回复 12 生命', 2.4);
    startBuffStage();
  }

  function updateEnd(dt) {
    RG.endT += dt;
    RG.screenT = (RG.screenT || 0) + dt;
    // 用户名输入框聚焦时，按键交给 DOM 输入框处理
    if (RG.nameFocus) return;
    if (keyPress(['KeyL'])) {
      RG.openBoard(RG.mode === 'gauntlet' ? 1 : 0);
      return;
    }
    // 通关后尚未上榜：Enter 先打开用户名输入，再考虑重开
    if (RG.screen === 'win' && !RG.scoreSubmitted && keyPress(['Enter', 'Space', 'KeyJ'])) {
      RG.editName();
      return;
    }
    if (keyPress(['KeyR', 'Enter'])) {
      sfx('uiPick');
      RG.resetRun(RG.charIndex);
    } else if (keyPress(['Escape', 'Backspace'])) {
      BVN.Game.gotoTitle();
    }
  }

  /* ===================== 排行榜 ===================== */

  function fmtLbTime(sec) {
    const s = Math.max(0, Number(sec) || 0);
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    const cs = Math.floor((s % 1) * 100);
    function two(v) { return (v < 10 ? '0' : '') + v; }
    return two(m) + ':' + two(ss) + '.' + two(cs);
  }

  function openBoard(tab) {
    RG.boardFrom = (RG.screen === 'board') ? RG.boardFrom : (RG.screen || 'select');
    RG.boardTab = tab != null ? (tab ? 1 : 0) : (RG.mode === 'gauntlet' ? 1 : 0);
    RG.boardData = null;
    RG.boardErr = '';
    RG.screen = 'board';
    RG.screenT = 0;
    sfx('uiPick');
    loadBoard();
  }

  function loadBoard() {
    const LB = BVN.Leaderboard;
    if (!LB) { RG.boardLoading = false; RG.boardErr = '排行榜模块未加载'; return; }
    const mode = RG.boardTab ? 'gauntlet' : 'normal';
    const cached = LB.cache && LB.cache[mode];
    if (cached) { RG.boardData = cached; RG.boardLoading = false; RG.boardErr = ''; return; }
    RG.boardLoading = true;
    RG.boardErr = '';
    RG.boardData = null;
    LB.fetchList(mode, 20).then(function (data) {
      if (RG.boardTab !== (mode === 'gauntlet' ? 1 : 0)) return;
      RG.boardData = data;
      RG.boardLoading = false;
    }).catch(function (err) {
      RG.boardLoading = false;
      RG.boardErr = (err && err.message) || '无法连接排行榜后端';
    });
  }

  function closeBoard() {
    sfx('ui');
    RG.screen = RG.boardFrom || 'select';
    RG.boardErr = '';
  }

  RG.openBoard = openBoard;

  function updateBoard() {
    RG.screenT = (RG.screenT || 0) + 1 / 60;
    if (keyPress(['Escape', 'Backspace'])) { closeBoard(); return; }
    if (keyPress(['Tab', 'ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'])) {
      RG.boardTab = RG.boardTab ? 0 : 1;
      sfx('ui');
      RG.boardData = null;
      RG.boardErr = '';
      loadBoard();
    }
    if (keyPress(['KeyR'])) {
      if (BVN.Leaderboard && BVN.Leaderboard.cache) BVN.Leaderboard.cache[RG.boardTab ? 'gauntlet' : 'normal'] = null;
      loadBoard();
      sfx('ui');
    }
  }

  /* 打开用户名输入框并提交成绩 */
  RG.editName = function () {
    if (RG.screen !== 'win') return;
    if (RG.scoreSubmitted) { toast('本次成绩已上榜', 1.8); return; }
    const LB = BVN.Leaderboard;
    if (!LB || !LB.showNameInput) { toast('排行榜模块未加载 · 请通过后端启动游戏', 2.6); return; }
    RG.nameFocus = true;
    LB.showNameInput(RG.nameInput, 64, 592, 300, 48, function (name) {
      RG.nameFocus = false;
      RG.nameInput = name;
      RG.submitScore();
    }, function () {
      RG.nameFocus = false;
    });
  };

  RG.submitScore = function () {
    if (RG.scoreSubmitted || RG.scoreBusy) return;
    const LB = BVN.Leaderboard;
    if (!LB) { RG.scoreErr = '排行榜模块未加载'; return; }
    const name = String(RG.nameInput || '').trim();
    if (!name) {
      RG.scoreErr = '请输入用户名';
      RG.editName();
      return;
    }
    RG.scoreBusy = true;
    RG.scoreErr = '';
    const payload = {
      name: name,
      mode: RG.mode === 'gauntlet' ? 'gauntlet' : 'normal',
      time: Math.round((RG.runTime || 0) * 100) / 100,
      char: RG.char ? RG.char.name : '',
      kills: RG.kills || 0,
      dmg: Math.round(RG.totalDmg || 0),
    };
    LB.submitScore(payload).then(function (res) {
      RG.scoreBusy = false;
      RG.scoreSubmitted = true;
      RG.scoreRank = res && res.rank != null ? res.rank : null;
      RG.scoreErr = '';
      LB.setName(name);
      sfx('uiPick');
      toast('已上榜 · 第 ' + (RG.scoreRank != null ? RG.scoreRank : '?') + ' 名', 3);
    }).catch(function (err) {
      RG.scoreBusy = false;
      RG.scoreErr = (err && err.message) || '提交失败';
      toast('上榜失败：' + RG.scoreErr, 3.2);
    });
  };

  /* ===================== 情赌徒 · 石头剪刀布 ===================== */

  const HAND_NAMES = ['石头', '剪刀', '布'];

  function openGamble(pr) {
    RG.gamble = {
      tab: 0, stage: 'bet', betType: 'hp', betIdx: 0,
      playerHand: -1, npcHand: -1, result: '', msg: D.GAMBLER.lines.greet,
      t: 0, shopIdx: 0, payload: null,
      codeBuf: '', codeT: 0,
      openedAt: RG.time,
      itemOffer: pickRandomItem(),
      relicOffer: pickRelic(),
    };
    sfx('uiPick');
  }

  function closeGamble() { RG.gamble = null; sfx('ui'); }

  function gambleRelicList() {
    return RG.relics.filter(function (r) { return r.count > 0; });
  }

  function removeRelicCopy(entry) {
    if (!entry) return;
    entry.count--;
    if (entry.count <= 0) {
      const i = RG.relics.indexOf(entry);
      if (i >= 0) RG.relics.splice(i, 1);
      if (RG.relicPop === entry) { RG.relicPop = null; RG.relicPopT = 0; }
    } else {
      entry.level = relicLevelOf(entry.count);
    }
    applyAllMods();
  }

  function gambleOptions() {
    const p = RG.player;
    const G = D.GAMBLER;
    const relics = gambleRelicList();
    return [
      { k: 'hp', name: '生命', detail: '押 ' + G.hpStake + ' 生命 · 赢回 ' + (G.hpStake * 2), ok: p.hp > G.hpStake },
      { k: 'scrap', name: '废料', detail: '押 ' + G.scrapStake + ' 废料 · 赢回 ' + (G.scrapStake * 2), ok: RG.scrap >= G.scrapStake },
      { k: 'relic', name: '遗物', detail: '押 1 件遗物 · 赢回 2 件', ok: relics.length > 0 },
      { k: 'item', name: '道具', detail: '押 1 个道具 · 赢回 2 个', ok: p.items.length > 0 },
    ];
  }

  function gambleTargetLabel(g) {
    const p = RG.player;
    if (g.betType === 'hp') return D.GAMBLER.hpStake + ' 生命';
    if (g.betType === 'scrap') return D.GAMBLER.scrapStake + ' 废料';
    if (g.betType === 'relic') {
      const list = gambleRelicList();
      const e = list[clamp(g.betIdx, 0, Math.max(0, list.length - 1))];
      return e ? (e.name + ' Lv' + e.level) : '无';
    }
    const items = p.items;
    const key = items[clamp(g.betIdx, 0, Math.max(0, items.length - 1))];
    return key ? D.ITEMS[key].name : '无';
  }

  function gambleTargetCount(g) {
    if (g.betType === 'relic') return gambleRelicList().length;
    if (g.betType === 'item') return RG.player.items.length;
    return 0;
  }

  function consumeBet(g) {
    const p = RG.player;
    const G = D.GAMBLER;
    const payload = { type: g.betType };
    if (g.betType === 'hp') {
      p.hp -= G.hpStake;
    } else if (g.betType === 'scrap') {
      RG.scrap -= G.scrapStake;
    } else if (g.betType === 'relic') {
      const list = gambleRelicList();
      const e = list[clamp(g.betIdx, 0, list.length - 1)];
      if (!e) return null;
      payload.entry = e; payload.name = e.name;
      removeRelicCopy(e);
      g.betIdx = 0;
    } else {
      const idx = clamp(g.betIdx, 0, p.items.length - 1);
      payload.item = p.items[idx];
      payload.name = D.ITEMS[payload.item] ? D.ITEMS[payload.item].name : payload.item;
      p.items.splice(idx, 1);
      g.betIdx = 0;
    }
    return payload;
  }

  function gamblePayout(payload) {
    if (!payload) return;
    const G = D.GAMBLER;
    if (payload.type === 'hp') healPlayer(G.hpStake * 2, true);
    else if (payload.type === 'scrap') RG.scrap += G.scrapStake * 2;
    else if (payload.type === 'relic' && payload.entry) { addRelic(payload.entry); addRelic(payload.entry); }
    else if (payload.type === 'item' && payload.item) { addItem(payload.item); addItem(payload.item); }
  }

  function gambleRefund(payload) {
    if (!payload) return;
    const G = D.GAMBLER;
    if (payload.type === 'hp') healPlayer(G.hpStake, true);
    else if (payload.type === 'scrap') RG.scrap += G.scrapStake;
    else if (payload.type === 'relic' && payload.entry) addRelic(payload.entry);
    else if (payload.type === 'item' && payload.item) addItem(payload.item);
  }

  function gamblePlay(g, ph) {
    g.playerHand = ph;
    g.npcHand = (Math.random() * 3) | 0;
    const nh = g.npcHand;
    if (ph === nh) {
      gambleRefund(g.payload);
      g.result = 'draw';
      g.msg = '平局！赌注原样奉还。';
      sfx('ui');
    } else if ((ph === 0 && nh === 1) || (ph === 1 && nh === 2) || (ph === 2 && nh === 0)) {
      gamblePayout(g.payload);
      g.result = 'win';
      g.msg = D.GAMBLER.lines.win;
      sfx('holy');
      if (RG.player) FX.ring(RG.player.x, RG.player.y - 80, '#ffd166', 140, 0.6);
    } else {
      g.result = 'lose';
      g.msg = D.GAMBLER.lines.lose;
      sfx('ko');
    }
    g.payload = null;
    g.stage = 'result';
  }

  function gambleRefreshShop(g) {
    g.itemOffer = pickRandomItem();
    g.relicOffer = pickRelic();
  }

  function updateGamble(dt) {
    const g = RG.gamble;
    if (!g) return;
    g.t += dt;
    // 打开当帧的 E 按键不参与关闭判定，避免「按 E 打开又立刻关掉」的闪烁
    const justOpened = RG.time - (g.openedAt || 0) < 0.25;
    if (!justOpened && keyPress(['Escape', 'KeyE'])) { closeGamble(); return; }
    if (keyPress(['Tab'])) {
      g.tab = g.tab ? 0 : 1;
      g.stage = 'bet'; g.result = ''; g.playerHand = -1; g.npcHand = -1;
      g.msg = D.GAMBLER.lines.greet;
      sfx('ui');
      return;
    }
    if (g.tab === 1) { updateGambleShop(g, dt); return; }

    if (g.stage === 'pick') {
      if (keyPress(['Digit1', 'Numpad1'])) gamblePlay(g, 0);
      else if (keyPress(['Digit2', 'Numpad2'])) gamblePlay(g, 1);
      else if (keyPress(['Digit3', 'Numpad3'])) gamblePlay(g, 2);
      return;
    }

    if (g.stage === 'result') {
      if (keyPress(['Enter', 'Space', 'KeyJ'])) {
        g.stage = 'bet'; g.result = ''; g.playerHand = -1; g.npcHand = -1;
        g.msg = D.GAMBLER.lines.greet;
        g.betIdx = 0;
        sfx('ui');
      }
      return;
    }

    // 赌注选择
    for (let i = 0; i < 4; i++) {
      if (keyPress(['Digit' + (i + 1), 'Numpad' + (i + 1)])) {
        g.betType = gambleOptions()[i].k;
        g.betIdx = 0;
        sfx('ui');
      }
    }
    if (g.betType === 'relic' || g.betType === 'item') {
      const n = gambleTargetCount(g);
      if (n > 0 && keyPress(['ArrowLeft', 'KeyA'])) { g.betIdx = (g.betIdx + n - 1) % n; sfx('ui'); }
      if (n > 0 && keyPress(['ArrowRight', 'KeyD'])) { g.betIdx = (g.betIdx + 1) % n; sfx('ui'); }
    }
    if (keyPress(['Enter', 'Space', 'KeyJ'])) {
      const opt = gambleOptions()[g.betType === 'hp' ? 0 : g.betType === 'scrap' ? 1 : g.betType === 'relic' ? 2 : 3];
      if (!opt.ok) { g.msg = D.GAMBLER.lines.broke; sfx('ui'); return; }
      const payload = consumeBet(g);
      if (!payload) { g.msg = D.GAMBLER.lines.broke; return; }
      g.payload = payload;
      g.stage = 'pick';
      g.playerHand = -1; g.npcHand = -1; g.result = '';
      g.msg = '下注已收下。出招吧 —— 1 石头 / 2 剪刀 / 3 布';
      sfx('uiPick');
    }
  }

  /* 兑换码 214：在商店页连续输入 2 → 1 → 4（1.6 秒内），领取隐藏作弊遗物 */
  function redeemCheat(g) {
    g.codeBuf = ''; g.codeT = 0;
    const def = D.RELICS.filter(function (r) { return r.id === 'cheat'; })[0];
    if (!def) return;
    if (findRelic('cheat')) {
      g.msg = '兑换码 214 已使用 · 作弊遗物已在你的遗物栏';
      toast('作弊遗物已拥有', 2);
      sfx('ui');
      return;
    }
    const res = addRelic(def);
    g.msg = '兑换码 214 生效：获得「' + def.name + '」';
    toast('兑换码生效 · 获得 ' + def.name + '：无敌 + 秒杀一切', 3.2);
    showRelicPop(res ? res.entry : def);
    sfx('holy');
    RG.flash = Math.min(0.85, RG.flash + 0.45);
    if (RG.player) FX.ring(RG.player.x, RG.player.y - 80, '#ffd166', 160, 0.7);
  }

  function updateGambleShop(g, dt) {
    // 兑换码缓冲：超过 1.6 秒没有新输入就清空
    g.codeT = Math.max(0, (g.codeT || 0) - dt);
    if (g.codeT <= 0) g.codeBuf = '';
    const codeKeys = [
      { codes: ['Digit2', 'Numpad2'], ch: '2' },
      { codes: ['Digit1', 'Numpad1'], ch: '1' },
      { codes: ['Digit4', 'Numpad4'], ch: '4' },
    ];
    for (let i = 0; i < codeKeys.length; i++) {
      if (keyPress(codeKeys[i].codes)) {
        g.codeBuf = ((g.codeBuf || '') + codeKeys[i].ch).slice(-4);
        g.codeT = 1.6;
        sfx('ui');
        if (g.codeBuf.slice(-3) === '214') redeemCheat(g);
        return;
      }
    }
    const n = 2;
    if (keyPress(['ArrowUp', 'KeyW'])) { g.shopIdx = (g.shopIdx + n - 1) % n; sfx('ui'); }
    if (keyPress(['ArrowDown', 'KeyS'])) { g.shopIdx = (g.shopIdx + 1) % n; sfx('ui'); }
    if (keyPress(['Enter', 'Space', 'KeyJ'])) {
      const G = D.GAMBLER;
      if (g.shopIdx === 0) {
        if (!g.itemOffer) { g.msg = '货架空了。'; return; }
        if (RG.scrap < G.itemPrice) { g.msg = D.GAMBLER.lines.broke; sfx('ui'); return; }
        RG.scrap -= G.itemPrice;
        addItem(g.itemOffer);
        toast('购得道具：' + D.ITEMS[g.itemOffer].name, 2);
        g.msg = '成色不错，拿好。';
        sfx('uiPick');
        g.itemOffer = pickRandomItem();
      } else {
        if (!g.relicOffer) { g.msg = '遗物都被你赢光了。'; return; }
        if (RG.scrap < G.relicPrice) { g.msg = D.GAMBLER.lines.broke; sfx('ui'); return; }
        RG.scrap -= G.relicPrice;
        addRelic(g.relicOffer);
        const e = findRelic(g.relicOffer.id);
        toast('购得遗物：' + g.relicOffer.name + (e ? ' Lv' + e.level : ''), 2.2);
        g.msg = '眼光不错，这件我留了很久。';
        sfx('uiPick');
        g.relicOffer = pickRelic();
      }
    }
  }

  /* ===================== 肉鸽情报（标题页栏目） ===================== */

  RG.openCodex = function () {
    const G = BVN.Game;
    G.phase = 'rogue';
    G.fighters.length = 0;
    G.ais.length = 0;
    G.entities.length = 0;
    RG.screen = 'codex';
    RG.codexTab = 0;
    RG.codexScroll = 0;
    RG.screenT = 0;
  };

  /* 遗物等级加成文本：用与 applyMods 相同的倍率，逐级列出实际数值 */
  const RELIC_MOD_LABELS = {
    dmg: '伤害', moveMul: '移速', dashCd: '冲刺冷却', heavyDmg: '重击', comboBoost: '连击三段',
    maxHp: '最大生命', roomHeal: '每房回复', scrap: '废料获取', lifesteal: '击杀回复',
    gasResist: '毒气减伤', shield: '受伤减免', reach: '攻击距离', atkSpeed: '攻速',
    extraJump: '额外跳跃', rangedDmg: '远程伤害', skillDmg: '技能伤害', skillCd: '技能冷却',
    jumpBonus: '跳跃高度', lowHpDmg: '残血伤害', meterGain: '气获取', ultDmg: '必杀伤害',
    freeze: '冻结概率', chain: '连锁概率', slowField: '周围减速', thorns: '反伤', trap: '陷阱',
    revive: '复活', elemFire: '火焰附着', elemPoison: '中毒附着', elemShock: '雷击附着',
    elemIce: '冰缓附着', elemDmg: '元素强度', extraSkill: '额外技能', explode: '击杀爆炸',
  };
  const RELIC_PCT_KEYS = {
    dmg: 1, moveMul: 1, dashCd: 1, heavyDmg: 1, comboBoost: 1, scrap: 1, gasResist: 1,
    shield: 1, reach: 1, atkSpeed: 1, rangedDmg: 1, skillDmg: 1, skillCd: 1, jumpBonus: 1,
    lowHpDmg: 1, meterGain: 1, ultDmg: 1, freeze: 1, chain: 1, slowField: 1,
  };

  function relicModAt(key, base, lv) {
    let v = base * relicScaleOf(lv);
    if (key === 'shield') v = Math.min(0.45, v);
    if (key === 'freeze' || key === 'chain') v = Math.min(0.9, v);
    if (key === 'gasResist') v = Math.min(0.9, v);
    return v;
  }
  function pctText(v) { return (Math.round(v * 1000) / 10) + '%'; }

  /* 特殊效果遗物：按等级给出实际效果文本（与 applyMods 的派生公式保持一致） */
  function specialRelicText(k, v0, lv) {
    switch (k) {
      case 'revive': return '复活 ' + lv + ' 次 · 回血 ' + Math.round(Math.min(75, 35 + 8 * lv)) + '%';
      case 'elemFire': return '概率 ' + pctText(Math.min(0.9, 0.16 + 0.12 * lv)) + ' · 灼烧 ' + Math.round(8 + 5 * lv) + '/秒';
      case 'elemPoison': return '概率 ' + pctText(Math.min(0.9, 0.18 + 0.12 * lv)) + ' · 中毒 ' + Math.round(6 + 4 * lv) + '/秒';
      case 'elemShock': return '概率 ' + pctText(Math.min(0.9, 0.16 + 0.12 * lv)) + ' · 僵直 ' + (0.35 + 0.1 * lv).toFixed(2) + 's';
      case 'elemIce': return '概率 ' + pctText(Math.min(0.9, 0.16 + 0.12 * lv)) + ' · 减速 ' + pctText(0.30 + 0.05 * lv);
      case 'elemDmg': return '+' + pctText(v0 * lv);
      case 'freeze': return '概率 ' + pctText(Math.min(0.9, v0 * relicScaleOf(lv))) + ' · 冻结 ' + (1.0 + 0.25 * lv).toFixed(2) + 's';
      case 'chain': return '概率 ' + pctText(Math.min(0.9, v0 * relicScaleOf(lv))) + ' · 弹射 ' + lv + ' 次';
      case 'trap': return '伤害 ' + Math.round(70 * (1 + 0.6 * (lv - 1))) + ' · 间隔 ' + (Math.max(1.6, 4 - 0.5 * (lv - 1))).toFixed(1) + 's · 半径 ' + (90 + 12 * lv);
      case 'explode': return '半径 ' + (130 + 25 * lv) + ' · 伤害 ' + (10 + 6 * lv);
      case 'slowField': return '减速 ' + pctText(Math.min(0.7, v0)) + ' · 半径 ' + (320 + 40 * lv);
      case 'glide': return '滑翔' + (lv > 1 ? ' · 跳跃高度 +' + Math.round(5 * (lv - 1)) + '%' : '');
      case 'extraSkill': {
        const d = EXTRA_DEFS[v0];
        return (d ? d.name + '（' + d.key + ' 键）' : v0) + ' · 冷却 ' + extraCdFor(lv) + 's';
      }
      default: return null;
    }
  }

  function relicLevelNote(mods) {
    if (!mods) return '';
    const keys = Object.keys(mods);
    const parts = [];
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const v0 = mods[k];
      const label = RELIC_MOD_LABELS[k] || k;
      const sp = specialRelicText(k, v0, 1);
      if (sp) {
        const arr = [];
        for (let lv = 1; lv <= RELIC_MAX_LV; lv++) arr.push(specialRelicText(k, v0, lv));
        parts.push(label + ' Lv1→5：' + arr[0] + ' → ' + arr[RELIC_MAX_LV - 1]);
        continue;
      }
      if (typeof v0 !== 'number') continue;
      const arr = [];
      for (let lv = 1; lv <= RELIC_MAX_LV; lv++) {
        const v = relicModAt(k, v0, lv);
        if (RELIC_PCT_KEYS[k]) arr.push(k === 'dashCd' ? pctText(-v) : pctText(v));
        else arr.push(Math.round(v));
      }
      parts.push(label + ' Lv1→5 ' + arr.join('/') + (k === 'extraJump' ? ' 段' : ''));
    }
    if (!parts.length) return '特殊效果 · 解锁型（等级提升触发强度）';
    return parts.join(' · ');
  }

  /* 局内遗物栏：显示当前等级的实际数值，并给出下一级会变成多少 */
  function fmtModValue(k, v) {
    if (RELIC_PCT_KEYS[k]) {
      if (k === 'dashCd') return '-' + pctText(v);
      return (v >= 0 ? '+' : '') + pctText(v);
    }
    return '+' + Math.round(v) + (k === 'extraJump' ? ' 段' : '');
  }

  /* 商店用：主加成的「当前等级 → 下一级」数值，突出遗物升级带来的提升 */
  function relicShopGainText(r, lv) {
    const mods = r.mods || {};
    const curLv = Math.max(1, lv || 1);
    const keys = Object.keys(mods);
    let k = null;
    for (let i = 0; i < keys.length; i++) {
      const kk = keys[i];
      if (typeof mods[kk] === 'number' || specialRelicText(kk, mods[kk], 1)) { k = kk; break; }
    }
    if (!k) return null;
    const label = RELIC_MOD_LABELS[k] || k;
    const sp = specialRelicText(k, mods[k], curLv);
    if (sp) {
      return {
        label: label, lv: curLv, cur: sp, special: true,
        next: curLv < RELIC_MAX_LV ? specialRelicText(k, mods[k], curLv + 1) : null,
      };
    }
    if (typeof mods[k] !== 'number') return null;
    return {
      label: label, lv: curLv,
      cur: fmtModValue(k, relicModAt(k, mods[k], curLv)),
      next: curLv < RELIC_MAX_LV ? fmtModValue(k, relicModAt(k, mods[k], curLv + 1)) : null,
    };
  }

  function relicValueText(entry) {
    const mods = entry.mods || {};
    const lv = entry.level || 1;
    const keys = Object.keys(mods);
    const parts = [];
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const v0 = mods[k];
      const label = RELIC_MOD_LABELS[k] || k;
      if (specialRelicText(k, v0, lv)) {
        const cur = specialRelicText(k, v0, lv);
        parts.push(label + ' ' + cur + (lv >= RELIC_MAX_LV ? '（满级）' : ' → Lv' + (lv + 1)));
        continue;
      }
      if (typeof v0 !== 'number') continue;
      const cur = relicModAt(k, v0, lv);
      const nxt = lv < RELIC_MAX_LV ? relicModAt(k, v0, lv + 1) : null;
      parts.push(label + ' ' + fmtModValue(k, cur) + (nxt == null ? '（满级）' : ' → ' + fmtModValue(k, nxt)));
    }
    return parts.length ? parts.join(' · ') : (entry.desc || '');
  }

  function codexSubtitle(tab) {
    if (tab === 0) return '遗物档案 · 重复获得合成 Lv2~Lv5 · 每级效果翻倍（Lv5 = 16 倍）';
    if (tab === 1) return '道具档案 · 固定加成、无等级成长 · 遗物等级数值见「遗物」页';
    if (tab === 2) return '强化档案 · 每关结束三选一 · 通用强化 + 角色专属';
    if (tab === 3) return 'NPC 档案 · 石头剪刀布赌局 · 废料商店';
    if (tab === 4) return '敌人档案 · 普通种与亚种（T1~T3）· 关底首领实装血量与招式';
    return '连战档案 · 11 关首领连战 · 废料与遗物奖励 · 情赌徒补给';
  }

  /* 关底首领实装血量（与 bossHpFor 硬表一致） */
  const CODEX_BOSS_HP = {
    centipedeKing: '4000（普通第 1 关）',
    gasfishKing: '8000（普通第 2 关）',
    jellyMother: '12000（普通第 3 关）',
    giantFoot: '50000（普通第 4 关）',
    sewerCroc: '40000（普通第 5 关）',
    troll: '50000（普通第 5 关）',
    killerCroc: '100000（普通第 5 关 · 1/3 血回复 100000）',
    tentacleBase: '6000（每根触须）',
  };

  function codexRows(tab) {
    const rows = [];
    if (tab === 0) {
      for (let i = 0; i < D.RELICS.length; i++) {
        const r = D.RELICS[i];
        if (r.hidden) continue;
        rows.push({ name: r.name, icon: r.icon, desc: r.desc, tag: '遗物', color: '#ffd166', note: relicLevelNote(r.mods) });
      }
    } else if (tab === 1) {
      const keys = Object.keys(D.ITEMS);
      for (let i = 0; i < keys.length; i++) {
        const it = D.ITEMS[keys[i]];
        rows.push({ name: it.name, icon: 'item', desc: it.desc, tag: '道具 · Q 使用', color: it.color || '#9be0b0', note: '固定加成 · 无等级成长' });
      }
    } else if (tab === 2) {
      for (let i = 0; i < D.BUFFS.length; i++) {
        const b = D.BUFFS[i];
        rows.push({ name: b.name, icon: b.icon, desc: b.desc, tag: '通用强化', color: '#a8f0c8' });
      }
      const charIds = Object.keys(D.CHAR_BUFFS);
      for (let c = 0; c < charIds.length; c++) {
        const list = D.CHAR_BUFFS[charIds[c]];
        for (let i = 0; i < list.length; i++) {
          const ch = D.CHARS[charIds[c]];
          rows.push({ name: list[i].name, icon: list[i].icon, desc: list[i].desc, tag: '专属 · ' + (ch ? ch.name : charIds[c]), color: '#c9a0ff' });
        }
      }
    } else if (tab === 3) {
      const G = D.GAMBLER;
      rows.push({ name: G.name, icon: 'npc', desc: G.desc, tag: G.title, color: '#c9a0ff', note: '赌局：押生命/废料/遗物/道具 → 石头剪刀布；赢双倍返还，输则失去，平局退还。商店：道具 ' + G.itemPrice + ' 废料、遗物 ' + G.relicPrice + ' 废料。' });
    } else if (tab === 4) {
      const keys = Object.keys(D.MONSTERS);
      for (let i = 0; i < keys.length; i++) {
        const m = D.MONSTERS[keys[i]];
        const base = m.baseType || keys[i];
        const baseDef = D.MONSTERS[base];
        const kind = m.kind === 'miniboss' ? '关底迷你 BOSS' : m.kind === 'boss' ? '最终 BOSS' : (m.kind === 'fly' || m.fly) ? '飞行' : '地面';
        const isBoss = m.kind === 'miniboss' || m.kind === 'boss';
        const hpTxt = isBoss && CODEX_BOSS_HP[base] ? CODEX_BOSS_HP[base] : ('基础生命 ' + m.hp);
        const tag = m.baseType
          ? ('亚种 T' + (m.tier || 1) + ' · 父族 ' + (baseDef ? baseDef.name : base) + ' · ' + hpTxt)
          : (kind + ' · ' + hpTxt + ' · 接触 ' + (m.touch || 0));
        rows.push({
          name: m.name, icon: 'enemy',
          tag: tag,
          desc: (D.MONSTER_INFO[keys[i]] || ''),
          moves: m.moves || [],
          color: isBoss ? '#ff8a6a' : '#93c8a8',
        });
      }
    } else {
      rows.push({
        name: 'BOSS 连战 · 模式入口', icon: 'rune', tag: '模式 · 标题页右上角切换',
        desc: '在角色选择界面右上角切换「普通爬塔 / BOSS 连战」，Enter 出发。连战为 11 关连续首领战。',
        moves: [],
        color: '#c9a0ff',
      });
      rows.push({
        name: '关卡编排 · 10 + 1', icon: 'enemy', tag: '第 1~10 关 · 第 11 关终局',
        desc: '前 10 关为 5 族首领（百足王 / 毒气鱼王 / 水母母体 / 痂香巨足 / 下水道鳄）各出 2 个不同品种，从普通种与 T1~T3 亚种中等比例随机且不重复；第 11 关先战痂香巨魔，胜后杀手鳄吞食其尸体登场。',
        moves: [],
        color: '#ff8a6a',
      });
      rows.push({
        name: '通关奖励 · 废料 + 遗物', icon: 'badge', tag: '每击败 1 个首领',
        desc: '废料 = 3000 × 关数（第 1 关 3000，第 2 关 6000……逐关递增），并额外随机获得 10 件遗物。第 11 关通关后进入结算。',
        moves: [],
        color: '#ffd166',
      });
      rows.push({
        name: '情赌徒 · 连战补给', icon: 'npc', tag: '每关之间 · 自由购买',
        desc: '每关结束后进入补给页：可浏览并购买任意遗物（价格随该遗物等级上涨，满 Lv5 不可再买），同时可花费废料强化五项属性。连战模式加点无上限（普通模式上限 Lv10）。补给时回复 40% 最大生命。',
        moves: [],
        color: '#c9a0ff',
      });
      rows.push({
        name: '数值成长 · 首领曲线', icon: 'rune', tag: '每关递增',
        desc: '第 1 关首领生命固定 3000，之后逐关递增；第 11 关痂香巨魔约 34 万，痂香杀手鳄再 ×1.15，封顶约 40 万。首领每次攻击附带真伤（第 1 关 20 → 终局 300，无视防御），且控制抗性：单次最多 2 秒、之后 15 秒免疫，出招时为霸体。伤害倍率每关 +1 倍，杀手鳄 ×1.3，终局超过 10 倍。',
        moves: [],
        color: '#ff8a6a',
      });
      rows.push({
        name: '普通模式 · 首领随机', icon: 'enemy', tag: '普通爬塔第 1~5 关',
        desc: '普通模式每关关底首领在「普通种 + 全部亚种」中等比例随机，不再按 T1/T2/T3 顺序排；血量仍按关卡硬表（4000 / 8000 / 12000 / 50000 / 40000+50000+100000）。',
        moves: [],
        color: '#93c8a8',
      });
    }
    return rows;
  }

  /* 敌人页需要更多纵向空间展示招式，因此使用更高的行高与更少的可见行 */
  function codexRowH(tab) { return tab === 4 ? 100 : 72; }
  function codexVisible(tab) { return tab === 4 ? 5 : 7; }

  function codexMaxScroll() {
    return Math.max(0, codexRows(RG.codexTab).length - codexVisible(RG.codexTab));
  }

  function updateCodex() {
    RG.screenT = (RG.screenT || 0) + 1 / 60;
    if (keyPress(['Escape', 'Backspace'])) { BVN.Game.gotoTitle(); return; }
    if (keyPress(['ArrowLeft', 'KeyA'])) { RG.codexTab = (RG.codexTab + 5) % 6; RG.codexScroll = 0; sfx('ui'); }
    if (keyPress(['ArrowRight', 'KeyD'])) { RG.codexTab = (RG.codexTab + 1) % 6; RG.codexScroll = 0; sfx('ui'); }
    if (keyPress(['ArrowUp', 'KeyW'])) { RG.codexScroll = Math.max(0, RG.codexScroll - 1); sfx('ui'); }
    if (keyPress(['ArrowDown', 'KeyS'])) { RG.codexScroll = Math.min(codexMaxScroll(), RG.codexScroll + 1); sfx('ui'); }
    for (let i = 0; i < 6; i++) {
      if (keyPress(['Digit' + (i + 1), 'Numpad' + (i + 1)])) { RG.codexTab = i; RG.codexScroll = 0; sfx('ui'); }
    }
  }

  /* ===================== 对外：鼠标动作 ===================== */

  RG.handleAction = function (action) {
    const parts = action.split(':');
    if (parts[0] !== 'rogue') return false;
    const sub = parts[1];
    if (sub === 'char') {
      RG.charIndex = parseInt(parts[2], 10) || 0;
      sfx('uiPick');
      RG.resetRun(RG.charIndex, RG.modeIndex ? 'gauntlet' : 'normal');
      return true;
    }
    if (sub === 'mode') {
      RG.modeIndex = parseInt(parts[2], 10) ? 1 : 0;
      sfx('ui');
      return true;
    }
    if (sub === 'relic') {
      RG.rewardIndex = parseInt(parts[2], 10) || 0;
      chooseRelic(RG.rewardIndex);
      return true;
    }
    if (sub === 'buff') {
      RG.buffIndex = parseInt(parts[2], 10) || 0;
      chooseBuff(RG.buffIndex);
      return true;
    }
    if (sub === 'upg') {
      if (parts[2] === 'next') {
        advanceRoom();
        sfx('uiPick');
      } else {
        buyUpgrade(parseInt(parts[2], 10) || 0);
      }
      return true;
    }
    if (sub === 'shopbuy') {
      gauntletShopBuyRelic(parseInt(parts[2], 10) || 0);
      return true;
    }
    if (sub === 'shopnext') {
      sfx('uiPick');
      startNextGauntletStage();
      return true;
    }
    if (sub === 'restart') {
      RG.resetRun(RG.charIndex);
      return true;
    }
    if (sub === 'gambler') {
      if (RG.gamble) closeGamble();
      else {
        const gm = nearestGambler();
        if (gm) openGamble(gm);
      }
      return true;
    }
    if (sub === 'title') {
      BVN.Game.gotoTitle();
      return true;
    }
    if (sub === 'editname') {
      RG.editName();
      return true;
    }
    if (sub === 'submit') {
      RG.submitScore();
      return true;
    }
    if (sub === 'board') {
      openBoard(RG.screen === 'select' ? RG.modeIndex : (RG.mode === 'gauntlet' ? 1 : 0));
      return true;
    }
    if (sub === 'boardtab') {
      const tab = parseInt(parts[2], 10) ? 1 : 0;
      if (RG.boardTab !== tab) {
        RG.boardTab = tab;
        RG.boardData = null;
        RG.boardErr = '';
        sfx('ui');
        loadBoard();
      }
      return true;
    }
    if (sub === 'boardrefresh') {
      if (BVN.Leaderboard && BVN.Leaderboard.cache) BVN.Leaderboard.cache[RG.boardTab ? 'gauntlet' : 'normal'] = null;
      loadBoard();
      sfx('ui');
      return true;
    }
    if (sub === 'boardclose') {
      closeBoard();
      return true;
    }
    return false;
  };

  /* =================================================================
   *  绘制层
   * ================================================================= */

  function txt(ctx, str, x, y, size, color, opts) {
    const o = opts || {};
    const G = BVN.Game;
    ctx.font = (o.weight || '900') + ' ' + size + 'px ' + CFG.FONT;
    ctx.textAlign = o.align || 'center';
    ctx.textBaseline = o.baseline || 'middle';
    if (o.stroke) {
      ctx.lineWidth = o.strokeW || Math.max(3, size * 0.14);
      ctx.strokeStyle = o.stroke;
      ctx.lineJoin = 'round';
      ctx.strokeText(str, x, y);
    }
    if (o.glow) {
      ctx.shadowColor = o.glow;
      ctx.shadowBlur = o.blur || 16;
    }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
    ctx.shadowBlur = 0;
  }

  function panel(ctx, x, y, w, h, fill, stroke, r) {
    Art.roundRect(ctx, x, y, w, h, r == null ? 10 : r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      Art.roundRect(ctx, x, y, w, h, r == null ? 10 : r);
      ctx.stroke();
    }
  }

  function fmtTime(s) {
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return (m < 10 ? '0' : '') + m + ':' + (ss < 10 ? '0' : '') + ss;
  }

  /* ---------------- 全屏 BOSS 入场演出 ---------------- */

  function drawBossIntro(ctx) {
    const bi = RG.bossIntro;
    if (!bi || !bi.def) return;
    const W = CFG.W, H = CFG.H;
    const t = bi.t, dur = bi.dur;
    const inT = clamp(t / 0.36, 0, 1);
    const outT = clamp((t - (dur - 0.45)) / 0.45, 0, 1);
    const a = inT * (1 - outT);
    const C = bi.colors || {};
    const tint = C.body || '#ff5a4a';
    const cx = W * 0.5, cy = H * 0.5;

    ctx.save();
    // 全屏暗幕
    ctx.globalAlpha = 0.86 * a;
    ctx.fillStyle = '#060204';
    ctx.fillRect(0, 0, W, H);

    // 放射速度线
    ctx.globalAlpha = 0.26 * a;
    ctx.strokeStyle = tint;
    ctx.lineWidth = 2;
    for (let i = 0; i < 46; i++) {
      const ang = (i / 46) * TAU + t * 0.5 + (i % 3) * 0.12;
      const r0 = 120 + ((i * 97) % 160) + (1 - inT) * 240;
      const r1 = r0 + 150 + ((i * 41) % 220);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
      ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
      ctx.stroke();
    }

    // 冲击波环
    for (let i = 0; i < 2; i++) {
      const prog = (t * 0.9 + i * 0.35) % 1;
      ctx.globalAlpha = 0.4 * a * (1 - prog);
      ctx.strokeStyle = i ? '#ffffff' : tint;
      ctx.lineWidth = 5 - i * 2;
      ctx.beginPath();
      ctx.ellipse(cx, H * 0.72, 60 + prog * 900, 34 + prog * 260, 0, 0, TAU);
      ctx.stroke();
    }

    // 怪物剪影（从画面外冲入并放大）
    const appear = clamp((t - 0.14) / 0.85, 0, 1);
    const ease = 1 - Math.pow(1 - appear, 3);
    const scale = (bi.big ? 1.85 : 1.62) * (0.86 + ease * 0.18);
    const mx = cx + (bi.fromLeft ? -1 : 1) * (1 - ease) * W * 0.7;
    const my = bi.def.fly ? H * 0.58 : H * 0.80;
    const jitter = Math.sin(t * 34) * (1 - outT) * 3;
    const fake = {
      // 亚种复用基础骨骼绘制，但 def 保留亚种配色/数值，保证登场形象与本体一致
      def: bi.def, type: bi.def.baseType || bi.type, subType: bi.def.baseType ? bi.type : null, x: 0, y: 0,
      facing: bi.fromLeft ? 1 : -1, drawScale: 1, hurt: 0,
      w: bi.def.w, h: bi.def.h, seed: 7, state: 'idle',
      hp: 1, hpMax: 1, elite: false, mini: bi.def.kind === 'miniboss',
    };
    ctx.globalAlpha = a;
    // 运动残影
    ctx.save();
    ctx.globalAlpha = 0.22 * a;
    ctx.translate(mx - (bi.fromLeft ? -1 : 1) * 46, my);
    ctx.scale(scale, scale);
    RA.drawMonster(ctx, fake, RG.time);
    ctx.restore();

    ctx.save();
    ctx.translate(mx + jitter, my);
    ctx.scale(scale, scale);
    RA.drawMonster(ctx, fake, RG.time);
    ctx.restore();

    // 底部电影黑边 + 名字条
    ctx.globalAlpha = 0.9 * a;
    ctx.fillStyle = 'rgba(3,1,2,0.92)';
    ctx.fillRect(0, H - 92, W, 92);
    ctx.fillRect(0, 0, W, 34);
    ctx.globalAlpha = a;
    ctx.fillStyle = tint;
    ctx.fillRect(0, H - 92, W, 3);
    ctx.fillRect(0, 0, W, 2);

    const nameIn = clamp((t - 0.55) / 0.5, 0, 1);
    if (nameIn > 0) {
      const slideX = (1 - nameIn) * 60;
      ctx.globalAlpha = a * nameIn;
      txt(ctx, bi.big ? '— 终 局 首 领 —' : '— 关 底 迷 你 首 领 —', W / 2 + slideX, H - 62, 16, 'rgba(255,220,190,0.8)', { letterSpacing: 6, stroke: 'rgba(0,0,0,0.8)', strokeW: 4 });
      txt(ctx, bi.name, W / 2 + slideX, H - 28, 40, '#fff3e2', {
        glow: tint, blur: 26, stroke: '#160404', strokeW: 7, letterSpacing: 4,
      });
      // 名字两侧的斜切装饰
      ctx.globalAlpha = a * nameIn * 0.75;
      ctx.fillStyle = tint;
      ctx.fillRect(W / 2 - 300, H - 42, 70, 4);
      ctx.fillRect(W / 2 + 230, H - 42, 70, 4);
    }

    // 收尾白闪
    if (outT > 0 && outT < 1) {
      ctx.globalAlpha = outT * 0.6;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  /* ---------------- 超必杀奥义演出（格斗模式同款立绘 + 奥义图） ---------------- */

  /* 复用格斗模式 Fighter.prototype.ultPose：保证肉鸽奥义姿态与格斗模式完全一致 */
  function superPoseFor(id, frame) {
    const P = Object.assign({}, BVN.POSE_DEFAULT);
    try {
      if (BVN.Fighter && BVN.Fighter.prototype.ultPose) {
        BVN.Fighter.prototype.ultPose.call({ id: id }, P, null, frame);
      }
    } catch (e) { /* 无 Fighter 时退回默认姿态 */ }
    return P;
  }

  function drawSuperCut(ctx) {
    const cut = RG.superCut;
    if (!cut) return;
    const def = cut.def || {};
    const W = CFG.W, H = CFG.H;
    const t = cut.t, dur = cut.dur;
    const hitT = cut.hitT || dur * 0.55;
    const tint = def.tint || '#ffd166';
    const inT = clamp(t / 0.3, 0, 1);
    const outA = t > dur - 0.4 ? clamp(1 - (t - (dur - 0.4)) / 0.4, 0, 1) : 1;
    const a = inT * outA;
    const cx = W / 2, cy = H * 0.52;

    ctx.save();
    // 黑幕
    ctx.globalAlpha = 0.94 * a;
    ctx.fillStyle = '#050204';
    ctx.fillRect(0, 0, W, H);

    // 速度线
    ctx.globalAlpha = 0.3 * a;
    ctx.strokeStyle = tint;
    ctx.lineWidth = 2;
    for (let i = 0; i < 54; i++) {
      const ang = (i / 54) * TAU + t * 0.7 + (i % 4) * 0.09;
      const r0 = 160 + ((i * 73) % 200);
      const r1 = r0 + 180 + ((i * 31) % 260);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
      ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
      ctx.stroke();
    }

    // 立绘（左右滑入 + 色调光）
    const pt = def.portrait || { side: 'right', fx: 0.5, fy: 0.3, zoom: 1.5 };
    const appear = clamp((t - 0.04) / 0.42, 0, 1);
    const ee = 1 - Math.pow(1 - appear, 3);
    const pw = W * 0.52, ph = H * 0.94;
    const sideLeft = pt.side === 'left' || (typeof pt.side === 'number' && pt.side < 0);
    const px = (sideLeft ? 26 : W - 26 - pw) + (1 - ee) * (sideLeft ? -260 : 260);
    const py = H * 0.03;
    ctx.globalAlpha = a;
    ctx.save();
    Art.roundRect(ctx, px, py, pw, ph, 10);
    ctx.clip();
    const img = Art.img(cut.id);
    if (img) {
      Art.drawCover(ctx, img, px, py, pw, ph, pt.fx, pt.fy, pt.zoom || 1.5);
    } else {
      ctx.fillStyle = '#1a1010';
      ctx.fillRect(px, py, pw, ph);
    }
    // 叠色与底部渐隐
    ctx.globalAlpha = a * 0.2;
    ctx.fillStyle = tint;
    ctx.fillRect(px, py, pw, ph);
    ctx.globalAlpha = a;
    const gg = ctx.createLinearGradient(0, py + ph * 0.5, 0, py + ph);
    gg.addColorStop(0, 'rgba(5,2,4,0)');
    gg.addColorStop(1, 'rgba(5,2,4,0.9)');
    ctx.fillStyle = gg;
    ctx.fillRect(px, py, pw, ph);
    ctx.restore();
    // 立绘描边
    ctx.globalAlpha = a;
    ctx.strokeStyle = tint;
    ctx.lineWidth = 3;
    Art.roundRect(ctx, px, py, pw, ph, 10);
    ctx.stroke();

    // 奥义文字（对立一侧）
    const tx = sideLeft ? W * 0.74 : W * 0.26;
    const align = 'center';
    const txtIn = clamp((t - 0.42) / 0.45, 0, 1);
    if (txtIn > 0) {
      ctx.globalAlpha = a * txtIn;
      const dy = (1 - txtIn) * 24;
      txt(ctx, def.kanji || '', tx, H * 0.34 + dy, 92, '#fff6e8', {
        glow: tint, blur: 34, stroke: '#160404', strokeW: 10, letterSpacing: 4, align: align,
      });
      txt(ctx, def.name || '', tx, H * 0.47 + dy, 38, tint, {
        stroke: '#160404', strokeW: 6, letterSpacing: 3, align: align,
      });
      if (def.romaji) {
        txt(ctx, def.romaji, tx, H * 0.53 + dy, 15, 'rgba(255,235,220,0.72)', {
          letterSpacing: 4, align: align,
        });
      }
      if (def.quote) {
        txt(ctx, '「' + def.quote + '」', tx, H * 0.60 + dy, 17, 'rgba(230,210,200,0.86)', {
          align: align, weight: '700',
        });
      }
    }

    // 命中瞬间：冲击环 + 白光
    if (cut.hit) {
      const p2 = clamp((t - hitT) / 0.55, 0, 1);
      ctx.globalAlpha = (1 - p2) * a;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 80 + p2 * 760, 60 + p2 * 440, 0, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = (1 - p2) * 0.55 * a;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);
    }

    // ---- 阶段 B：角色本体奥义动作（与格斗模式 ultPose 一致，不再只有立绘）----
    const actStart = dur * 0.36;
    if (t >= actStart && RG.player) {
      const q = clamp((t - actStart) / Math.max(0.001, dur - actStart), 0, 1);
      const fade = clamp(q * 3, 0, 1) * outA;
      const p = RG.player;
      // 立绘/文字退到背景，只留角色动作
      ctx.globalAlpha = 0.62 * fade;
      ctx.fillStyle = '#050204';
      ctx.fillRect(0, 0, W, H);
      // 角色主色聚光
      const spot = ctx.createRadialGradient(cx, H * 0.6, 24, cx, H * 0.6, 560);
      spot.addColorStop(0, tint);
      spot.addColorStop(0.42, 'rgba(30,10,10,0.35)');
      spot.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.24 * fade;
      ctx.fillStyle = spot;
      ctx.fillRect(0, 0, W, H);
      // 冲击前的蓄力环
      if (q < 0.55) {
        const ch = q / 0.55;
        ctx.globalAlpha = 0.4 * (1 - ch) * fade;
        ctx.strokeStyle = tint;
        ctx.lineWidth = 3;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.ellipse(cx, H * 0.62, 90 + ch * (260 + i * 90), (90 + ch * (260 + i * 90)) * 0.42, 0, 0, TAU);
          ctx.stroke();
        }
      }
      const facing = p.facing >= 0 ? 1 : -1;
      const lunge = Math.sin(q * Math.PI) * 132;
      const mx = cx + facing * lunge * 0.42;
      const my = H * 0.88;
      // 残影（同一 ultPose 帧序列）
      for (let i = 3; i >= 1; i--) {
        ctx.globalAlpha = 0.12 * fade;
        Art.drawFighter(ctx, {
          x: mx - facing * i * 34, y: my, id: cut.id, build: RG.char.build,
          palette: (BVN.CHAR_BY_ID[cut.id] || {}).palette,
          facing: facing, pose: superPoseFor(cut.id, (q - i * 0.035) * (def.total || 150)),
          onGround: true, glow: 0, hitFlash: 0, alpha: 0.6,
        }, RG.time * 60);
      }
      // 角色本体（1.55 倍放大，关键帧与格斗模式同一套）
      const S = 1.55;
      ctx.save();
      ctx.translate(mx, my);
      ctx.scale(facing * S, S);
      ctx.globalAlpha = fade;
      Art.drawFighter(ctx, {
        x: 0, y: 0, id: cut.id, build: RG.char.build,
        palette: (BVN.CHAR_BY_ID[cut.id] || {}).palette,
        facing: 1, pose: superPoseFor(cut.id, q * (def.total || 150)),
        onGround: true, glow: 1, hitFlash: (cut.hit && t - hitT < 0.18) ? 8 : 0, alpha: 1,
      }, RG.time * 60);
      ctx.restore();
      // 底部奥义名
      ctx.globalAlpha = fade;
      txt(ctx, (def.name || '') + ' · ' + (RG.char.name || ''), cx, H * 0.84, 22, tint, {
        stroke: '#120404', strokeW: 5, letterSpacing: 3,
      });
    }

    // 上下黑边（电影感）
    ctx.globalAlpha = 0.95 * a;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, 46);
    ctx.fillRect(0, H - 46, W, 46);
    ctx.restore();
  }

  /* ---------------- 过场动画：下水道鳄鱼逃跑 / 吞噬巨魔并血色合体 ---------------- */
  function drawCine(ctx) {
    const ci = RG.cine;
    if (!ci) return;
    const W = CFG.W, H = CFG.H;
    const t = ci.t, dur = ci.dur;
    const a = Math.min(clamp(t / 0.3, 0, 1), clamp((dur - t) / 0.4, 0, 1));
    const ground = H - 136;
    const M = D.MONSTERS;
    const fake = function (type, x, y, facing, scale, state) {
      const def = M[type];
      return {
        def: def, type: type, x: x, y: y, facing: facing || 1, drawScale: scale || 1,
        hurt: 0, w: def.w, h: def.h, seed: 3, state: state || 'idle', hp: 1, hpMax: 1,
        elite: false, mini: false,
      };
    };

    ctx.save();
    // 暗幕
    ctx.globalAlpha = 0.95 * a;
    ctx.fillStyle = '#030506';
    ctx.fillRect(0, 0, W, H);

    // 背景微光与污水池
    ctx.globalAlpha = a;
    const bg = ctx.createRadialGradient(W * 0.58, H * 0.45, 40, W * 0.58, H * 0.45, W * 0.65);
    bg.addColorStop(0, 'rgba(70,40,60,0.24)');
    bg.addColorStop(0.55, 'rgba(20,26,22,0.16)');
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const wy = ground + 4;
    const wg = ctx.createLinearGradient(0, wy - 26, 0, H);
    wg.addColorStop(0, 'rgba(58,96,78,0.9)');
    wg.addColorStop(0.35, 'rgba(24,52,44,0.92)');
    wg.addColorStop(1, 'rgba(5,12,11,0.96)');
    ctx.fillStyle = wg;
    ctx.fillRect(0, wy - 26, W, H - wy + 26);
    // 水波
    ctx.strokeStyle = 'rgba(150,220,190,0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.ellipse(W * 0.7, wy + 4 + i * 18, 120 + i * 48 + Math.sin(t * 2 + i) * 14, 10 + i * 4, 0, 0, TAU);
      ctx.stroke();
    }

    // 上下电影黑边（先画，字幕最后叠加）
    ctx.globalAlpha = 0.94 * a;
    ctx.fillStyle = '#040203';
    ctx.fillRect(0, 0, W, 46);
    ctx.fillRect(0, H - 78, W, 78);

    // 鳄鱼过场统一走本局实际出现的亚种形象（配色/体型与本体一致）
    const crocSkin = function () {
      const d = M[RG.crocVariant] || M.sewerCroc;
      return { def: d, w: d.w, h: d.h };
    };
    const spot = function (x, y, s, type, facing, state, alpha, extra) {
      const f = fake(type, x, y, facing, s, state);
      if (extra) Object.assign(f, extra);
      ctx.globalAlpha = alpha;
      RA.drawMonster(ctx, f, RG.time);
    };

    if (ci.type === 'crocEscape') {
      // 鳄鱼负伤跃入水池
      const jump = clamp((t - 0.28) / 1.20, 0, 1);
      const ease = jump < 1 ? 1 - Math.pow(1 - jump, 2) : 1;
      const cx = lerp(W * 0.28, W * 0.76, ease);
      const cy = ground - Math.sin(Math.PI * jump) * 150;
      if (jump < 1) {
        ctx.globalAlpha = 0.18 * a;
        ctx.fillStyle = '#8fffe6';
        ctx.beginPath();
        ctx.ellipse(cx, ground, 90, 16, 0, 0, TAU);
        ctx.fill();
        spot(cx, cy, 1.35, 'sewerCroc', 1, 'idle', a, crocSkin());
      } else {
        // 入水水花
        const st = clamp((t - 1.5) / 1.2, 0, 1);
        for (let i = 0; i < 3; i++) {
          const pr = clamp(st + i * 0.18, 0, 1);
          ctx.globalAlpha = (1 - pr) * a * 0.8;
          ctx.strokeStyle = i % 2 ? '#cffff0' : '#8fffe6';
          ctx.lineWidth = 4 - i;
          ctx.beginPath();
          ctx.ellipse(W * 0.76, ground + 2, 50 + pr * 260, 12 + pr * 60, 0, 0, TAU);
          ctx.stroke();
        }
        ctx.globalAlpha = (1 - st) * a * 0.5;
        ctx.fillStyle = '#bfffe8';
        for (let i = 0; i < 10; i++) {
          const bx = W * 0.76 + Math.sin(i * 2.1) * (40 + i * 16);
          const by = ground - 20 + ((t * 60 + i * 13) % 90);
          ctx.beginPath();
          ctx.arc(bx, by, 3 + (i % 3), 0, TAU);
          ctx.fill();
        }
        // 水下潜行剪影
        ctx.globalAlpha = (1 - st) * a * 0.55;
        spot(W * 0.76 + st * 40, ground + 30 + st * 40, 1.2, 'sewerCroc', 1, 'idle', 0.55, crocSkin());
      }
      ctx.globalAlpha = a;
      ctx.fillStyle = '#8fffe6';
      ctx.fillRect(W / 2 - 190, H - 70, 380, 2);
      txt(ctx, t < 1.5 ? '下水道鳄鱼负伤，遁入污水之中……' : '它藏在暗处窥伺，等待复仇的时机。',
        W / 2, H - 42, 24, '#eafff7', { glow: '#2aa080', blur: 18, stroke: '#04100c', strokeW: 5, letterSpacing: 2 });
    } else if (ci.type === 'devour') {
      const rise = clamp(t / 1.1, 0, 1);
      const dash = clamp((t - 1.1) / 0.95, 0, 1);
      const bite = clamp((t - 2.05) / 1.1, 0, 1);
      const kRise = clamp((t - ci.spawnAt) / 0.45, 0, 1);
      const trollX = W * 0.44;
      const crocX = lerp(W * 0.78, W * 0.58, dash < 1 ? dash * dash : 1);

      // 巨魔
      if (t < ci.spawnAt + 0.1) {
        spot(trollX, ground, 1.05, 'troll', 1, 'idle', a * (1 - bite), null);
      }

      // 鳄鱼出水 → 扑咬
      if (t >= ci.spawnAt) {
        // 合体后：杀手鳄
        ctx.globalAlpha = a;
        const kg = ctx.createRadialGradient(W * 0.52, ground - 170, 30, W * 0.52, ground - 170, 330);
        kg.addColorStop(0, 'rgba(255,40,40,0.5)');
        kg.addColorStop(0.5, 'rgba(120,8,12,0.24)');
        kg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = kg;
        ctx.fillRect(0, 0, W, H);
        spot(W * 0.52, ground + (1 - kRise) * 110, 1.55, 'killerCroc', -1, 'idle', a, null);
        // 背触手红光
        ctx.globalAlpha = 0.28 * a;
        ctx.strokeStyle = '#ff3b30';
        ctx.lineWidth = 3;
        for (let i = 0; i < 8; i++) {
          const ang = -2.4 + i * 0.13 + Math.sin(t * 3 + i) * 0.05;
          const bx = W * 0.52 - 20, by = ground - 250;
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.quadraticCurveTo(bx + Math.cos(ang) * 90, by + Math.sin(ang) * 90, bx + Math.cos(ang) * 190, by + Math.sin(ang) * 190);
          ctx.stroke();
        }
      } else {
        spot(crocX, ground + (1 - rise) * 200, 1.35, 'sewerCroc', -1, bite > 0 ? 'bite' : 'idle', a, crocSkin());
        if (rise < 0.15) {
          // 出水水花
          ctx.globalAlpha = (0.15 - rise) * a * 6;
          ctx.strokeStyle = '#9fffe0';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.ellipse(W * 0.78, ground + 2, 200, 44, 0, 0, TAU);
          ctx.stroke();
        }
      }

      // 吞噬冲击白光
      if (bite > 0 && bite < 0.35) {
        ctx.globalAlpha = (1 - bite / 0.35) * 0.75 * a;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, W, H);
      }
      if (bite > 0) {
        ctx.globalAlpha = (1 - Math.min(1, bite * 1.4)) * a * 0.7;
        ctx.fillStyle = '#e01b22';
        for (let i = 0; i < 18; i++) {
          const ang = i * 0.35 + t * 1.2;
          const r = 60 + bite * (200 + (i % 5) * 50);
          ctx.beginPath();
          ctx.arc(W * 0.56 + Math.cos(ang) * r, ground - 120 + Math.sin(ang) * r * 0.6, 4 + (i % 3), 0, TAU);
          ctx.fill();
        }
      }

      // 字幕与名字
      ctx.globalAlpha = a;
      let cap = '痂香巨魔倒下…… 污水翻涌！';
      if (t >= 2.05 && t < ci.spawnAt) cap = '下水道鳄鱼撕咬、吞噬了痂香巨魔！';
      else if (t >= ci.spawnAt) cap = '血肉融合，血色鳞甲翻涌生长……';
      ctx.fillStyle = '#e01b22';
      ctx.fillRect(W / 2 - 210, H - 70, 420, 2);
      txt(ctx, cap, W / 2, H - 42, 22, '#ffe8e4', { glow: '#a01018', blur: 16, stroke: '#140304', strokeW: 5, letterSpacing: 2 });
      if (t >= ci.spawnAt + 0.15) {
        const ni = clamp((t - ci.spawnAt - 0.15) / 0.5, 0, 1);
        ctx.globalAlpha = a * ni;
        txt(ctx, '— 终 局 首 领 —', W / 2, H - 118, 16, 'rgba(255,180,170,0.85)', { letterSpacing: 6, stroke: '#140304', strokeW: 4 });
        txt(ctx, '痂香杀手鳄', W / 2, H - 82, 46, '#fff0ec', {
          glow: '#ff2418', blur: 30, stroke: '#1a0303', strokeW: 8, letterSpacing: 5,
        });
      }
    }

    ctx.restore();
  }

  RG.draw = function (ctx) {
    if (RG.screen === 'select') {
      drawSelect(ctx);
      return;
    }
    if (RG.screen === 'codex') {
      drawCodex(ctx);
      return;
    }
    if (RG.screen === 'board') {
      drawBoard(ctx);
      return;
    }
    if (!RG.room || !RG.player) { drawSelect(ctx); return; }

    drawWorldScene(ctx);

    if (RG.screen === 'play') drawHUD(ctx);
    else if (RG.screen === 'reward') drawReward(ctx);
    else if (RG.screen === 'buff') drawBuff(ctx);
    else if (RG.screen === 'upgrade') drawUpgrade(ctx);
    else if (RG.screen === 'gshop') drawGauntletShop(ctx);
    else if (RG.screen === 'dead') drawDead(ctx);
    else if (RG.screen === 'win') drawWin(ctx);

    if (RG.bossIntro) drawBossIntro(ctx);
    if (RG.superCut) drawSuperCut(ctx);
    if (RG.cine) drawCine(ctx);

    // 受击红闪
    if (RG.flash > 0) {
      ctx.fillStyle = 'rgba(190,40,30,' + (RG.flash * 0.34).toFixed(3) + ')';
      ctx.fillRect(0, 0, CFG.W, CFG.H);
    }
  };

  /* ---------------- 角色选择 ---------------- */

  function drawSelect(ctx) {
    const fakeRoom = { w: 1280, boss: false };
    RA.drawBackground(ctx, { x: RG.time * 10 }, RG.time, fakeRoom);
    ctx.fillStyle = 'rgba(2,6,6,0.8)';
    ctx.fillRect(0, 0, CFG.W, CFG.H);

    txt(ctx, '痂 香 下 水 道', 640, 66, 54, '#d9f0c4', {
      glow: '#59d98d', blur: 28, stroke: '#06100b', strokeW: 8, letterSpacing: 2,
    });
    txt(ctx, '爬塔 · 肉鸽 · 第一层 · 腐痂层', 640, 116, 20, 'rgba(180,220,190,0.85)', { letterSpacing: 4 });
    txt(ctx, '选择要爬塔的陈锴瑞', 640, 152, 16, 'rgba(150,180,164,0.72)');

    // 模式切换：普通爬塔 / BOSS 连战
    const modes = [
      { t: '普 通 爬 塔', d: '5 关 · 首领随机普通种 / 亚种' },
      { t: 'B O S S 连 战', d: '11 关 · 10 首领 + 终局杀手鳄' },
    ];
    for (let i = 0; i < modes.length; i++) {
      const on = RG.modeIndex === i;
      panel(ctx, 992, 40 + i * 52, 244, 44, on ? 'rgba(20,52,36,0.96)' : 'rgba(8,14,12,0.9)',
        on ? 'rgba(157,255,196,0.95)' : 'rgba(90,120,104,0.5)', 8);
      txt(ctx, modes[i].t, 1114, 56 + i * 52, 16, on ? '#dcffe8' : 'rgba(160,190,172,0.7)', { weight: '900' });
      txt(ctx, modes[i].d, 1114, 73 + i * 52, 11, on ? 'rgba(160,255,200,0.85)' : 'rgba(130,160,145,0.55)', { weight: '700' });
      BVN.Game.hotspots.push({ x: 992, y: 40 + i * 52, w: 244, h: 44, action: 'rogue:mode:' + i });
    }

    // 排行榜入口（通关时间）
    panel(ctx, 56, 40, 190, 44, 'rgba(8,14,12,0.9)', 'rgba(255,209,102,0.4)', 8);
    txt(ctx, 'L  排 行 榜', 151, 62, 17, '#ffd166', { weight: '900' });
    BVN.Game.hotspots.push({ x: 56, y: 40, w: 190, h: 44, action: 'rogue:board' });

    const cols = 4, cw = 268, ch = 226, gap = 20;
    const x0 = (CFG.W - (cols * cw + (cols - 1) * gap)) / 2;
    const y0 = 176;
    for (let i = 0; i < BVN.ROSTER.length; i++) {
      const c = BVN.ROSTER[i];
      const cx = x0 + (i % cols) * (cw + gap);
      const cy = y0 + Math.floor(i / cols) * (ch + 18);
      const sel = i === RG.charIndex;
      const hover = 0;
      // 卡底
      panel(ctx, cx, cy, cw, ch, 'rgba(9,16,14,0.94)', sel ? 'rgba(120,255,180,0.95)' : 'rgba(90,120,104,0.42)', 12);
      if (sel) {
        ctx.save();
        ctx.shadowColor = 'rgba(90,255,150,0.65)';
        ctx.shadowBlur = 26;
        panel(ctx, cx, cy, cw, ch, null, 'rgba(140,255,190,0.6)', 12);
        ctx.restore();
      }
      // 立绘
      ctx.save();
      Art.roundRect(ctx, cx + 4, cy + 4, cw - 8, 128, 10);
      ctx.clip();
      const img = Art.img(c.id);
      if (img) Art.drawCover(ctx, img, cx + 4, cy + 4, cw - 8, 128, c.face[0], c.face[1], c.face[2]);
      else { ctx.fillStyle = 'rgba(40,60,50,0.9)'; ctx.fillRect(cx + 4, cy + 4, cw - 8, 128); }
      const grd = ctx.createLinearGradient(0, cy + 74, 0, cy + 132);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(1, 'rgba(4,10,8,0.94)');
      ctx.fillStyle = grd;
      ctx.fillRect(cx + 4, cy + 74, cw - 8, 58);
      ctx.restore();

      txt(ctx, c.name, cx + cw / 2, cy + 118, 24, '#f2f6ee', { stroke: '#04100a', strokeW: 5 });
      const perk = D.CHARS[c.id];
      txt(ctx, '「' + perk.perk + '」', cx + cw / 2, cy + 152, 18, sel ? '#9dffc4' : '#e8c97a');
      txt(ctx, perk.desc, cx + cw / 2, cy + 184, 14, 'rgba(200,220,208,0.82)', { weight: '700' });
      txt(ctx, sel ? '按 Enter 出发' : '点击选择', cx + cw / 2, cy + ch - 16, 13, sel ? 'rgba(160,255,200,0.85)' : 'rgba(140,170,155,0.45)', { weight: '700' });

      BVN.Game.hotspots.push({ x: cx, y: cy, w: cw, h: ch, action: 'rogue:char:' + i });
    }

    txt(ctx, 'A / ← / → / D 切换角色 · Tab / M 切换模式 · L 排行榜 · Enter 出发 · Esc 返回标题', 640, 662, 16, 'rgba(170,200,180,0.8)');
    txt(ctx, RG.modeIndex
      ? 'BOSS 连战：连续 11 关 · 每击败首领获得大量废料 + 10 件遗物 · 情赌徒处自由买遗物、加点无上限'
      : '本关 4 个区域 + 1 个 BOSS，清怪开门，遗物三选一 · 关底首领在普通种与亚种中等比例随机',
      640, 688, 13, RG.modeIndex ? '#ffd166' : 'rgba(130,160,142,0.6)', { weight: '700' });
  }

  /* ---------------- 世界 ---------------- */

  function drawWorldScene(ctx) {
    const p = RG.player;
    const cam = RG.cam;
    const rx = cam.shake ? rnd(-cam.shake, cam.shake) : 0;
    const ry = cam.shake ? rnd(-cam.shake, cam.shake) * 0.6 : 0;

    RA.drawBackground(ctx, cam, RG.time, RG.room.def);

    ctx.save();
    ctx.translate(-cam.x + rx, -cam.y + ry);

    // 地面
    for (let i = 0; i < RG.room.floors.length; i++) RA.drawFloor(ctx, RG.room.floors[i], RG.time, RG.room.def.boss);
    // 酸池
    for (let i = 0; i < RG.room.acid.length; i++) RA.drawAcid(ctx, RG.room.acid[i], RG.time, RG.room.def.boss);
    // 水池（终局 BOSS 房：鳄鱼逃入 / 合体登场）
    if (RG.room.water) {
      for (let i = 0; i < RG.room.water.length; i++) RA.drawWater(ctx, RG.room.water[i], RG.time, RG.room.def.boss);
    }

    // 传送带
    for (let i = 0; i < RG.hazards.length; i++) {
      const h = RG.hazards[i];
      if (h.type === 'conveyor') {
        RA.drawPlatform(ctx, { x: h.x, y: h.y - 12, w: h.w, h: 12, kind: 'conveyor', dir: h.dir, speed: h.speed }, RG.time);
      }
    }

    // 平台
    for (let i = 0; i < RG.room.platforms.length; i++) {
      const pl = RG.room.platforms[i];
      if (pl.active === false) continue;
      RA.drawPlatform(ctx, pl, RG.time);
    }
    // 移动平台 / 可破坏平台
    for (let i = 0; i < RG.hazards.length; i++) {
      const h = RG.hazards[i];
      if (h.type === 'moving') RA.drawPlatform(ctx, { x: h.x, y: h.y, w: h.w, h: h.h, kind: 'moving' }, RG.time);
      else if (h.type === 'break' && h.active !== false) RA.drawPlatform(ctx, h, RG.time);
    }

    // 蒸汽口 / 摆锤
    for (let i = 0; i < RG.hazards.length; i++) {
      const h = RG.hazards[i];
      if (h.type === 'steam') RA.drawSteam(ctx, h, RG.time);
      else if (h.type === 'pendulum') RA.drawPendulum(ctx, h, RG.time);
    }

    // 闸门
    if (RG.gate && !RG.room.def.boss) RA.drawGate(ctx, RG.gate, RG.time);

    // 区域（毒雾 / 触手 / 酸液 / 地刺 / 电场）
    drawZones(ctx);

    // 延迟打击预警（陨石 / 诅咒 / 鬼影）
    for (let i = 0; i < RG.fuses.length; i++) {
      const f = RG.fuses[i];
      const prog = 1 - f.t / (f.max || 1);
      ctx.save();
      ctx.globalAlpha = 0.3 + 0.5 * prog;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * (0.4 + 0.6 * prog), 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 0.18 + 0.25 * prog;
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * (0.4 + 0.6 * prog), 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // 道具
    for (let i = 0; i < RG.props.length; i++) RA.drawProp(ctx, RG.props[i], RG.time);
    for (let i = 0; i < RG.drops.length; i++) RA.drawProp(ctx, RG.drops[i], RG.time);
    // 情赌徒：靠近时提供鼠标点击入口（与 E 同一出口，键位失灵也能进）
    for (let i = 0; i < RG.props.length; i++) {
      const pr = RG.props[i];
      if (pr.type !== 'gambler' || !pr.near) continue;
      BVN.Game.hotspots.push({
        x: pr.x - cam.x + rx - 60, y: pr.y - cam.y + ry - 230,
        w: 120, h: 240, action: 'rogue:gambler',
      });
    }

    // 铁蒺藜陷阱
    for (let i = 0; i < RG.traps.length; i++) {
      const tr = RG.traps[i];
      ctx.save();
      ctx.globalAlpha = tr.arm > 0 ? 0.5 : 0.9;
      ctx.fillStyle = '#57452c';
      ctx.beginPath();
      ctx.ellipse(tr.x, tr.y - 2, 26, 7, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#ffb08a';
      ctx.lineWidth = 2.5;
      for (let s = -1; s <= 1; s++) {
        ctx.beginPath();
        ctx.moveTo(tr.x + s * 12, tr.y);
        ctx.lineTo(tr.x + s * 12 - 5, tr.y - 16);
        ctx.lineTo(tr.x + s * 12 + 5, tr.y - 16);
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();
    }

    // BOSS 预警
    drawBossTelegraph(ctx);

    // 刷新预警：地面圈 + 光柱 + 收缩环
    drawSpawnWarns(ctx);

    // 怪物
    for (let i = 0; i < RG.monsters.length; i++) {
      const m = RG.monsters[i];
      if (m.dead) continue;
      RA.drawMonster(ctx, m, RG.time);
      // 水母母体护盾：四根触须未破坏前笼罩电网
      if (m.type === 'jellyMother' && RG.jellyGuard) {
        ctx.save();
        const pulse = 0.5 + 0.5 * Math.sin(RG.time * 6);
        ctx.globalAlpha = 0.18 + pulse * 0.18;
        const g2 = ctx.createRadialGradient(m.x, m.y - m.h * 0.5, 40, m.x, m.y - m.h * 0.5, m.w * 0.8);
        g2.addColorStop(0, 'rgba(120,255,240,0.05)');
        g2.addColorStop(0.72, 'rgba(120,240,255,0.55)');
        g2.addColorStop(1, 'rgba(120,240,255,0)');
        ctx.fillStyle = g2;
        ctx.beginPath();
        ctx.ellipse(m.x, m.y - m.h * 0.5, m.w * 0.8, m.h * 0.75, 0, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 0.5 + pulse * 0.3;
        ctx.strokeStyle = '#9fe8ff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(m.x, m.y - m.h * 0.5, m.w * 0.72, m.h * 0.66, 0, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
      if (m.freezeT > 0) {
        ctx.save();
        ctx.globalAlpha = 0.35 + 0.15 * Math.sin(RG.time * 8);
        ctx.fillStyle = '#bfe8ff';
        ctx.beginPath();
        ctx.ellipse(m.x, m.y - m.h * 0.5, m.w * 0.46, m.h * 0.55, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      if (m.guardT > 0) {
        ctx.save();
        ctx.strokeStyle = 'rgba(191,232,255,0.8)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(m.x + m.facing * 10, m.y - m.h * 0.5, Math.max(28, m.w * 0.4), -0.9, 0.9);
        ctx.stroke();
        ctx.restore();
      }
      if (m.elite) {
        ctx.strokeStyle = 'rgba(255,96,80,0.7)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(m.x, m.y, m.w * 0.72, 9, 0, 0, TAU);
        ctx.stroke();
        txt(ctx, '精', m.x, m.y - m.h - 20, 16, '#ff6a4a', { stroke: '#200806', strokeW: 4, weight: '900' });
      }
      if (m.stun > 0) {
        ctx.strokeStyle = 'rgba(255,180,90,0.8)';
        ctx.lineWidth = 2;
        for (let s = 0; s < 3; s++) {
          ctx.beginPath();
          ctx.arc(m.x, m.y - m.h - 26 + s * 6, 10 + s * 4, 0.4, TAU - 0.4);
          ctx.stroke();
        }
      }
    }

    // 滚粪球
    for (let i = 0; i < RG.hazards.length; i++) {
      const h = RG.hazards[i];
      if (h.type === 'ball') RA.drawBall(ctx, h, RG.time);
    }

    // 投射物
    drawProjectiles(ctx);
    drawPShots(ctx);

    // 玩家
    drawPlayer(ctx, p);

    // 粒子
    FX.draw(ctx);

    ctx.restore();
  }

  /* ===================== 玩家远程弹道绘制 ===================== */

  function drawPShots(ctx) {
    for (let i = 0; i < RG.pShots.length; i++) {
      const b = RG.pShots[i];
      const pulse = 1 + Math.sin(RG.time * 22 + i) * 0.08;
      const gl = ctx.createRadialGradient(b.x, b.y, 1, b.x, b.y, b.r * 2.1 * pulse);
      gl.addColorStop(0, '#ffffff');
      gl.addColorStop(0.35, b.color);
      gl.addColorStop(0.72, K.rgba(b.color, 0.45));
      gl.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gl;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 2.1 * pulse, 0, TAU);
      ctx.fill();
      // 拖尾
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.035, b.y - b.vy * 0.035);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      // 核心
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 0.42, 0, TAU);
      ctx.fill();
    }
  }

  function drawPlayer(ctx, p) {
    if (p.shieldT > 0) {
      ctx.save();
      ctx.globalAlpha = 0.22 + Math.sin(RG.time * 12) * 0.08;
      ctx.fillStyle = '#ffb45a';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 82, 64, 96, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = '#ffd8a0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 82, 58, 90, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    // 地面阴影
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 2, 34, 9, 0, 0, TAU);
    ctx.fill();
    // 抗毒血清光环
    if (p.antidote > 0) {
      ctx.strokeStyle = 'rgba(150,220,255,' + (0.35 + 0.2 * Math.sin(RG.time * 6)) + ')';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 80, 52, 92, 0, 0, TAU);
      ctx.stroke();
    }
    // 冲刺拖影
    if (p.dashT > 0) {
      ctx.globalAlpha = 0.28;
      for (let i = 1; i <= 3; i++) {
        ctx.fillStyle = '#9dffc4';
        ctx.beginPath();
        ctx.ellipse(p.x - p.dashDir * i * 22, p.y - 76, 26, 70, 0, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    const alpha = p.invuln > 0 ? 0.62 + 0.3 * Math.abs(Math.sin(RG.time * 22)) : 1;
    const rolling = p.rollT > 0;
    if (rolling) {
      // 翻滚拖影
      ctx.save();
      ctx.globalAlpha = 0.34;
      ctx.fillStyle = '#bfe9ff';
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.ellipse(p.x - p.rollDir * i * 26, p.y - 46, 34, 40, 0, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
      // 翻滚无敌旋转
      const prog = clamp(1 - p.rollT / (p.rollMax || 0.46), 0, 1);
      const ang = p.rollDir * prog * TAU * 1.05;
      ctx.save();
      ctx.translate(p.x, p.y - 74);
      ctx.rotate(ang);
      ctx.translate(-p.x, -(p.y - 74));
      Art.drawFighter(ctx, {
        x: p.x, y: p.y, id: RG.char.id, build: RG.char.build,
        palette: (BVN.CHAR_BY_ID[RG.char.id] || {}).palette,
        facing: p.facing, pose: p.pose, onGround: p.onGround,
        glow: 1,
        hitFlash: 0,
        alpha: alpha,
      }, RG.time * 60);
      ctx.restore();
      return;
    }
    Art.drawFighter(ctx, {
      x: p.x, y: p.y, id: RG.char.id, build: RG.char.build,
      palette: (BVN.CHAR_BY_ID[RG.char.id] || {}).palette,
      facing: p.facing, pose: p.pose, onGround: p.onGround,
      glow: p.dashT > 0 || p.antidote > 0 ? 1 : 0,
      hitFlash: p.hurtT > 0 ? 6 : 0,
      alpha: alpha,
    }, RG.time * 60);
  }

  function drawZones(ctx) {
    for (let i = 0; i < RG.zones.length; i++) {
      const z = RG.zones[i];
      const k = Math.max(0, Math.min(1, z.life / z.max));
      ctx.save();
      if (z.k === 'gas') {
        ctx.globalAlpha = 0.5 * Math.min(1, k * 2);
        for (let g = 0; g < 7; g++) {
          const px = z.x + (g / 6) * z.w + Math.sin(RG.time * 0.8 + g * 1.7) * 16;
          const py = z.y + z.h * 0.5 + Math.cos(RG.time * 1.1 + g) * 22;
          ctx.fillStyle = (g % 2) ? z.color : 'rgba(120,190,110,0.55)';
          ctx.beginPath();
          ctx.arc(px, py, 26 + (g % 3) * 8, 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = z.color;
        ctx.fillRect(z.x, z.y, z.w, z.h);
      } else if (z.k === 'fire') {
        ctx.globalAlpha = 0.62 * Math.min(1, k * 2.4);
        const tongues = 5;
        for (let g = 0; g < tongues; g++) {
          const px = z.x + 10 + g * (z.w - 20) / (tongues - 1) + Math.sin(RG.time * 9 + g * 2.1) * 7;
          const fh = z.h * (0.62 + (g % 3) * 0.14) * (1 - (1 - k) * 0.35);
          const fg = ctx.createLinearGradient(px, z.y + z.h, px, z.y + z.h - fh);
          fg.addColorStop(0, '#ffd23f');
          fg.addColorStop(0.55, '#ff7a2e');
          fg.addColorStop(1, 'rgba(255,60,20,0)');
          ctx.fillStyle = fg;
          ctx.beginPath();
          ctx.moveTo(px - 15, z.y + z.h);
          ctx.quadraticCurveTo(px - 6, z.y + z.h - fh * 0.75, px, z.y + z.h - fh);
          ctx.quadraticCurveTo(px + 6, z.y + z.h - fh * 0.75, px + 15, z.y + z.h);
          ctx.closePath();
          ctx.fill();
        }
      } else if (z.k === 'tentacle') {
        ctx.globalAlpha = 0.58 * Math.min(1, k * 2);
        const strands = 5;
        for (let g = 0; g < strands; g++) {
          const x0 = z.x + 16 + g * (z.w - 32) / (strands - 1);
          ctx.save();
          ctx.translate(x0, z.y + z.h);
          if (RA.tentacleTube) {
            RA.tentacleTube(ctx, {
              len: z.h * (0.82 + (g % 3) * 0.06), w0: 9, w1: 2.2,
              seed: g * 1.5 + z.x * 0.01, time: RG.time, flip: g % 2 ? 1 : -1,
              body: z.color, dark: '#4a1d6b', light: '#f0b8ff', outline: '#1a0626',
            });
          }
          ctx.restore();
        }
        ctx.globalAlpha = 0.14;
        ctx.fillStyle = z.color;
        ctx.fillRect(z.x, z.y, z.w, z.h);
      } else if (z.k === 'tentacleSpike') {
        const grow = z.t < 0.14 ? z.t / 0.14 : 1;
        ctx.globalAlpha = 0.9 * Math.min(1, k * 2);
        for (let g = 0; g < 2; g++) {
          ctx.save();
          ctx.translate(z.x + z.w * 0.5 + (g ? 24 : -24), z.y + z.h);
          if (RA.tentacleTube) {
            RA.tentacleTube(ctx, {
              len: z.h * grow, w0: 10, w1: 2.5, seed: g * 2.1,
              time: RG.time, flip: g ? -1 : 1,
              body: z.color, dark: '#4a1d6b', light: '#f0b8ff', outline: '#1a0626',
            });
          }
          ctx.restore();
        }
      } else if (z.k === 'acid') {
        ctx.globalAlpha = 0.7 * Math.min(1, k * 2);
        ctx.fillStyle = z.color;
        ctx.beginPath();
        ctx.ellipse(z.x + z.w / 2, z.y + 15, z.w / 2, 16, 0, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = '#fff3a0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(z.x + z.w / 2, z.y + 15, z.w / 2 - 4, 11, 0, 0, TAU);
        ctx.stroke();
      } else if (z.k === 'spike') {
        const grow = z.t < 0.12 ? z.t / 0.12 : 1;
        ctx.fillStyle = z.color;
        ctx.strokeStyle = '#2a0f08';
        ctx.lineWidth = 2;
        for (let g = 0; g < 3; g++) {
          const sx = z.x + 10 + g * (z.w - 20) / 2;
          ctx.beginPath();
          ctx.moveTo(sx - 12, z.y + z.h);
          ctx.lineTo(sx, z.y + z.h - z.h * grow);
          ctx.lineTo(sx + 12, z.y + z.h);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      } else if (z.k === 'shock') {
        ctx.globalAlpha = 0.5 * Math.min(1, k * 2);
        ctx.strokeStyle = z.color;
        ctx.lineWidth = 4;
        for (let g = 0; g < 3; g++) {
          ctx.beginPath();
          ctx.arc(z.x + z.w / 2, z.y + z.h / 2, 40 + g * 30 + (1 - k) * 90, 0, TAU);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  function drawProjectiles(ctx) {
    for (let i = 0; i < RG.projectiles.length; i++) {
      const b = RG.projectiles[i];
      ctx.save();
      if (b.k === 'gas') {
        const gl = ctx.createRadialGradient(b.x, b.y, 2, b.x, b.y, b.r * 2.2);
        gl.addColorStop(0, '#eaffd0');
        gl.addColorStop(0.5, b.color);
        gl.addColorStop(1, 'rgba(120,200,120,0)');
        ctx.fillStyle = gl;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 2.2, 0, TAU);
        ctx.fill();
      } else if (b.k === 'urine') {
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.ellipse(b.x, b.y, b.r, b.r * 1.25, Math.atan2(b.vy, b.vx), 0, TAU);
        ctx.fill();
        ctx.strokeStyle = '#fff6c0';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (b.k === 'shock') {
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, Math.PI, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,220,180,0.7)';
        ctx.beginPath();
        ctx.arc(b.x, b.y - 4, b.r * 0.5, Math.PI, TAU);
        ctx.fill();
      } else if (b.k === 'bomb') {
        ctx.fillStyle = '#ffe9a0';
        Art.roundRect(ctx, b.x - 10, b.y - 12, 20, 24, 6);
        ctx.fill();
        ctx.strokeStyle = '#7a5a20';
        ctx.lineWidth = 2;
        Art.roundRect(ctx, b.x - 10, b.y - 12, 20, 24, 6);
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.fillRect(b.x - 4, b.y - 18, 8, 8);
        ctx.globalAlpha = 0.4 + 0.3 * Math.sin(RG.time * 14);
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 22, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /* 刷新预警：在落点画出收缩圈与光柱，确保玩家有时间反应 */
  function drawSpawnWarns(ctx) {
    for (let i = 0; i < RG.pending.length; i++) {
      const q = RG.pending[i];
      if (q.warnX == null) continue;
      const prog = clamp(1 - q.t / (q.dur || 1), 0, 1);
      const def = D.MONSTERS[q.sp.type];
      const big = def && def.kind === 'miniboss';
      const col = big ? '255,110,64' : (q.sp.elite ? '255,168,64' : '143,212,106');
      const pulse = 0.5 + 0.5 * Math.abs(Math.sin(RG.time * 12 + i));
      ctx.save();
      // 地面圈
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = 'rgba(' + col + ',0.85)';
      ctx.lineWidth = big ? 4 : 2.5;
      ctx.beginPath();
      ctx.ellipse(q.warnX, q.warnY, 48 + pulse * 12, 13 + pulse * 3, 0, 0, TAU);
      ctx.stroke();
      // 收缩圈
      const rr = (big ? 78 : 48) * (1 - prog * 0.6);
      ctx.globalAlpha = 0.3 + prog * 0.4;
      ctx.beginPath();
      ctx.ellipse(q.warnX, q.warnY, rr, rr * 0.28, 0, 0, TAU);
      ctx.stroke();
      // 光柱
      ctx.globalAlpha = 0.12 + prog * 0.18;
      const grad = ctx.createLinearGradient(q.warnX, q.warnY - (big ? 260 : 170), q.warnX, q.warnY);
      grad.addColorStop(0, 'rgba(' + col + ',0)');
      grad.addColorStop(1, 'rgba(' + col + ',0.9)');
      ctx.fillStyle = grad;
      ctx.fillRect(q.warnX - (big ? 30 : 16), q.warnY - (big ? 260 : 170), big ? 60 : 32, big ? 260 : 170);
      // 警示标记
      ctx.globalAlpha = 0.65 + 0.35 * pulse;
      txt(ctx, '!', q.warnX, q.warnY - (big ? 285 : 195), big ? 30 : 22, 'rgb(' + col + ')', { stroke: '#120804', strokeW: 5, weight: '900' });
      ctx.restore();
    }
  }

  function drawBossTelegraph(ctx) {
    const bosses = RG.monsters.filter(function (m) {
      return m.type === 'troll' || (m.def && m.def.kind === 'miniboss');
    });
    const p = RG.player;
    for (let bi = 0; bi < bosses.length; bi++) {
      const boss = bosses[bi];
      ctx.save();
    if (boss.state === 'charge' && boss.timer < boss.wind) {
      const a = 0.25 + 0.4 * Math.abs(Math.sin(RG.time * 16));
      ctx.fillStyle = 'rgba(220,60,40,' + a.toFixed(2) + ')';
      const dir = p.x > boss.x ? 1 : -1;
      ctx.fillRect(boss.x, boss.y - 180, dir * 520, 180);
    }
    if (boss.state === 'claw' && boss.timer < boss.wind) {
      ctx.strokeStyle = 'rgba(255,120,80,0.7)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(boss.x + boss.facing * 60, boss.y - 110, 120, 0, TAU);
      ctx.stroke();
    }
    if (boss.state === 'slam' && boss.timer < boss.wind) {
      const k = boss.timer / boss.wind;
      ctx.strokeStyle = 'rgba(255,150,90,0.75)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(boss.x, boss.y, 90 + k * 190, 0, TAU);
      ctx.stroke();
    }
    if (boss.state === 'spikes' && boss.marks) {
      for (let i = 0; i < boss.marks.length; i++) {
        const mk = boss.marks[i];
        const k = Math.min(1, mk.t / boss.wind);
        ctx.strokeStyle = 'rgba(255,120,70,0.85)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(mk.x, boss.baseY - 2, 40, 12, 0, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,120,70,' + (0.15 + k * 0.3).toFixed(2) + ')';
        ctx.beginPath();
        ctx.ellipse(mk.x, boss.baseY - 2, 36 * k, 10 * k, 0, 0, TAU);
        ctx.fill();
        // 光柱预警
        ctx.globalAlpha = 0.12 + k * 0.18;
        ctx.fillStyle = '#ff8a6a';
        ctx.fillRect(mk.x - 18, boss.baseY - 420, 36, 420);
        ctx.globalAlpha = 1;
      }
    }
    if (boss.state === 'leap' && boss.timer < boss.wind) {
      const tx = clamp(boss.x + clamp(p.x - boss.x, -520, 520), 60, RG.room.w - 60);
      const k = Math.min(1, boss.timer / boss.wind);
      ctx.strokeStyle = 'rgba(255,160,90,0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(tx, boss.baseY - 4, 200 * k + 40, 46 * k + 10, 0, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,140,80,0.16)';
      ctx.beginPath();
      ctx.ellipse(tx, boss.baseY - 4, 200 * k, 44 * k, 0, 0, TAU);
      ctx.fill();
    }
    if (boss.state === 'sweep' && boss.timer < boss.wind) {
      const k = Math.min(1, boss.timer / boss.wind);
      ctx.fillStyle = 'rgba(255,120,80,' + (0.12 + k * 0.22).toFixed(2) + ')';
      ctx.fillRect(boss.x + (boss.facing > 0 ? 0 : -300), boss.y - 240, 300, 240);
      ctx.strokeStyle = 'rgba(255,180,120,0.7)';
      ctx.lineWidth = 2;
      ctx.strokeRect(boss.x + (boss.facing > 0 ? 0 : -300), boss.y - 240, 300, 240);
    }
    // 迷你 BOSS 专属预警
    if (boss.def && boss.def.kind === 'miniboss') {
      const k = Math.min(1, boss.timer / boss.wind);
      if (boss.state === 'tail') {
        ctx.fillStyle = 'rgba(255,140,90,' + (0.1 + k * 0.2).toFixed(2) + ')';
        ctx.fillRect(boss.x - 310, boss.y - 260, 620, 260);
        ctx.strokeStyle = 'rgba(255,180,120,0.7)';
        ctx.lineWidth = 2;
        ctx.strokeRect(boss.x - 310, boss.y - 260, 620, 260);
      }
      if (boss.state === 'bite' || boss.state === 'kick') {
        const w = boss.state === 'bite' ? 300 : 280;
        const x0 = boss.actDir > 0 ? boss.x : boss.x - w;
        ctx.fillStyle = 'rgba(255,110,70,' + (0.12 + k * 0.24).toFixed(2) + ')';
        ctx.fillRect(x0, boss.y - 220, w, 220);
        ctx.strokeStyle = 'rgba(255,170,110,0.75)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x0, boss.y - 220, w, 220);
      }
      if (boss.state === 'drop') {
        const gy = groundBelow(p.x, p.y);
        ctx.strokeStyle = 'rgba(86,255,224,0.8)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(p.x, gy - 2, 90 * k + 20, 24 * k + 6, 0, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = 'rgba(86,255,224,0.14)';
        ctx.beginPath();
        ctx.ellipse(p.x, gy - 2, 90 * k, 24 * k, 0, 0, TAU);
        ctx.fill();
      }
      if (boss.state === 'pulse') {
        ctx.strokeStyle = 'rgba(63,240,208,0.7)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(boss.x, boss.y - 60, 80 + k * 240, 0, TAU);
        ctx.stroke();
      }
      if (boss.state === 'stomp' || boss.state === 'slam') {
        ctx.strokeStyle = 'rgba(255,150,90,0.75)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(boss.x, boss.y, 70 + k * 230, 0, TAU);
        ctx.stroke();
      }
    }
      ctx.restore();
    }
  }

  /* ---------------- HUD ---------------- */

  function drawHUD(ctx) {
    const p = RG.player;
    const ratio = Math.max(0, p.hp / p.hpMax);

    // 左上：角色 / 生命 / 遗物
    panel(ctx, 22, 20, 392, 128, 'rgba(5,12,9,0.84)', 'rgba(120,180,146,0.34)', 10);
    txt(ctx, RG.char.name, 38, 42, 21, '#eaf6e6', { align: 'left', stroke: '#04100a', strokeW: 4 });
    txt(ctx, '「' + D.CHARS[RG.char.id].perk + '」', 158, 42, 14, '#9dffc4', { align: 'left', weight: '700' });
    const hpColor = ratio > 0.55 ? '#54e08a' : (ratio > 0.28 ? '#ffc75a' : '#ff5f52');
    panel(ctx, 38, 58, 356, 20, 'rgba(0,0,0,0.6)', 'rgba(120,180,146,0.3)', 6);
    const hg = ctx.createLinearGradient(38, 0, 394, 0);
    hg.addColorStop(0, hpColor);
    hg.addColorStop(1, ratio > 0.55 ? '#a8ffc0' : hpColor);
    ctx.fillStyle = hg;
    Art.roundRect(ctx, 40, 60, Math.max(0, 352 * ratio), 16, 5);
    ctx.fill();
    txt(ctx, Math.ceil(p.hp) + ' / ' + p.hpMax, 216, 68, 15, '#f4fff2', { stroke: '#031007', strokeW: 3 });
    // 遗物图标（数量多时自动压缩间距，避免溢出面板）
    const relicStep = Math.min(30, 340 / Math.max(1, RG.relics.length));
    const relicIcon = relicStep < 24 ? 13 : 16;
    for (let i = 0; i < RG.relics.length; i++) {
      const rx = 32 + i * relicStep;
      ctx.fillStyle = 'rgba(80,60,20,0.5)';
      Art.roundRect(ctx, rx, 84, 24, 24, 6);
      ctx.fill();
      RA.drawRelicIcon(ctx, RG.relics[i].icon, rx + 12, 96, relicIcon, '#ffd166');
    }
    if (!RG.relics.length) txt(ctx, '尚未获得遗物', 38, 96, 12, 'rgba(150,180,160,0.5)', { align: 'left', weight: '700' });
    // 关卡强化图标
    for (let i = 0; i < RG.buffs.length && i < 12; i++) {
      const bx0 = 32 + i * 26;
      ctx.fillStyle = 'rgba(30,70,50,0.6)';
      Art.roundRect(ctx, bx0, 108, 22, 22, 6);
      ctx.fill();
      RA.drawRelicIcon(ctx, RG.buffs[i].icon, bx0 + 11, 119, 16, '#9dffc4');
    }
    if (RG.buffs.length) txt(ctx, '强化 ×' + RG.buffs.length, 350, 120, 11, 'rgba(160,240,190,0.7)', { align: 'left', weight: '700' });

    // 右上：区域 / 废料
    panel(ctx, 1014, 20, 244, 76, 'rgba(5,12,9,0.84)', 'rgba(120,180,146,0.34)', 10);
    const gauntNow = RG.mode === 'gauntlet';
    txt(ctx, gauntNow ? ('连战 · ' + (RG.gstage + 1) + ' / ' + GAUNTLET_STAGES)
      : ('腐痂层 · ' + (RG.roomIndex + 1) + ' / ' + D.ROOMS.length),
      1030, 40, 15, 'rgba(180,220,190,0.9)', { align: 'left', weight: '700' });
    const roomLabel = gauntNow
      ? (RG.gstage >= GAUNTLET_STAGES - 1 ? '痂香巨魔' : ((D.MONSTERS[RG.gplan[RG.gstage]] || {}).name || RG.room.def.name))
      : RG.room.def.name;
    txt(ctx, roomLabel, 1030, 64, 22, '#eaf6e6', { align: 'left', stroke: '#04100a', strokeW: 4 });
    ctx.fillStyle = '#d8b44a';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU;
      const rr = (i % 2 === 0 ? 10 : 5);
      ctx.lineTo(1166 + Math.cos(a) * rr, 54 + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    txt(ctx, RG.scrap + ' 废料', 1186, 54, 16, '#ffe9a0', { align: 'left', weight: '900' });
    txt(ctx, '用时 ' + fmtTime(RG.runTime), 1186, 76, 13, 'rgba(190,210,200,0.65)', { align: 'left', weight: '700' });

    // 顶部中央：区域进度（清空全部区域才能开闸门）
    if (!RG.room.def.boss) {
      panel(ctx, 462, 20, 316, 46, 'rgba(5,12,9,0.84)', 'rgba(120,180,146,0.3)', 10);
      txt(ctx, '区域 ' + (RG.areaIdx + 1) + ' / ' + RG.areas.length, 478, 38, 13, '#9dffc4', { align: 'left', weight: '700' });
      txt(ctx, RG.areaName || '—', 478, 58, 16, '#eaf6e6', { align: 'left', stroke: '#04100a', strokeW: 3 });
      txt(ctx, '剩余 ' + (RG.monsters.length + RG.pending.length), 762, 46, 15, '#ffd166', { align: 'right', weight: '900' });
    }

    // 左上角状态
    let bx = 22, by = 152;
    if (p.antidote > 0) {
      txt(ctx, '抗毒 ' + Math.ceil(p.antidote) + 's', bx + 6, by, 13, '#9fd8ff', { align: 'left', weight: '700' });
      by += 20;
    }
    if (p.mods.infiniteJump) {
      txt(ctx, '无限连跳', bx + 6, by, 13, '#c9a0ff', { align: 'left', weight: '700' });
    } else {
      const maxJ = 2 + (p.mods.extraJump || 0);
      const left = p.onGround ? maxJ - 1 : Math.max(0, maxJ - p.jumps);
      txt(ctx, (maxJ > 2 ? '三段跳 ' : '二段跳 ') + left + '/' + (maxJ - 1), bx + 6, by, 13, 'rgba(200,230,210,0.68)', { align: 'left', weight: '700' });
    }
    by += 20;
    const supReady = RG.superCd <= 0 && !RG.superCut;
    txt(ctx, 'V 超必杀 ' + (RG.superCut ? '发动中' : (supReady ? '就绪' : Math.ceil(RG.superCd) + 's')),
      bx + 6, by, 13, supReady ? '#ffd166' : 'rgba(190,170,120,0.6)', { align: 'left', weight: '800' });
    by += 20;
    txt(ctx, 'Space 翻滚 ' + (p.rollT > 0 ? '无敌' : (p.rollCd > 0 ? '收势…' : '就绪')),
      bx + 6, by, 13, p.rollT > 0 ? '#9fe8ff' : 'rgba(190,230,240,0.7)', { align: 'left', weight: '700' });

    // BOSS 生命条
    drawBossBar(ctx);

    // 底部：道具栏
    panel(ctx, 22, 636, 330, 60, 'rgba(5,12,9,0.82)', 'rgba(120,180,146,0.3)', 10);
    txt(ctx, '道具 Q', 38, 652, 14, '#eaf6e6', { align: 'left', weight: '700' });
    if (!p.items.length) txt(ctx, '空', 38, 676, 14, 'rgba(150,180,160,0.5)', { align: 'left', weight: '700' });
    for (let i = 0; i < p.items.length; i++) {
      const it = D.ITEMS[p.items[i]];
      const ix = 82 + i * 96;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      Art.roundRect(ctx, ix, 658, 84, 28, 6);
      ctx.fill();
      ctx.fillStyle = it.color;
      Art.roundRect(ctx, ix + 6, 664, 12, 18, 3);
      ctx.fill();
      txt(ctx, it.name, ix + 24, 673, 13, '#f2f6ee', { align: 'left', weight: '700' });
    }

    // 底部：技能 / 远程
    const SK = D.SKILLS[RG.char.id] || D.SKILLS.hannya;
    const RD = D.RANGED[RG.char.id] || D.RANGED.hannya;
    const sReady = RG.skillCd <= 0;
    panel(ctx, 366, 636, 540, 60, 'rgba(5,12,9,0.82)', 'rgba(120,180,146,0.3)', 10);
    txt(ctx, 'I', 380, 652, 15, '#ffd166', { align: 'left', weight: '900' });
    txt(ctx, SK.name, 400, 652, 15, sReady ? '#eaf6e6' : 'rgba(165,195,175,0.6)', { align: 'left', weight: '800' });
    txt(ctx, sReady ? '就绪' : '冷却 ' + Math.ceil(RG.skillCd) + 's', 400, 674, 12, sReady ? '#9dffc4' : 'rgba(160,190,172,0.5)', { align: 'left', weight: '700' });
    ctx.strokeStyle = 'rgba(120,170,140,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(640, 644);
    ctx.lineTo(640, 684);
    ctx.stroke();
    txt(ctx, 'L', 660, 652, 15, '#ffd166', { align: 'left', weight: '900' });
    txt(ctx, RD.name + ' · ' + Math.round(RD.dmg * (p.mods.rangedMul || 1)) + ' 伤害', 680, 652, 15, '#eaf6e6', { align: 'left', weight: '800' });
    txt(ctx, p.shotCd > 0 ? '冷却 ' + p.shotCd.toFixed(1) + 's' : '就绪', 680, 674, 12, p.shotCd > 0 ? 'rgba(160,190,172,0.5)' : '#9dffc4', { align: 'left', weight: '700' });

    // 底部：格斗技 / 必杀 / 气槽
    const FGT = D.FIGHT[RG.char.id] || D.FIGHT.hannya;
    const skillReady = RG.meter >= (FGT.skill.cost || 25) && RG.fightCd <= 0;
    const ultReady = RG.meter >= (FGT.ult.cost || 100);
    panel(ctx, 916, 636, 342, 60, 'rgba(5,12,9,0.82)', 'rgba(120,180,146,0.3)', 10);
    txt(ctx, 'U', 928, 652, 15, '#ffd166', { align: 'left', weight: '900' });
    txt(ctx, FGT.skill.name, 947, 652, 13, skillReady ? '#eaf6e6' : 'rgba(165,195,175,0.6)', { align: 'left', weight: '800' });
    txt(ctx, RG.fightCd > 0 ? Math.ceil(RG.fightCd) + 's' : '25 气', 1250, 652, 11,
      skillReady ? '#9dffc4' : 'rgba(160,190,172,0.5)', { align: 'right', weight: '700' });
    txt(ctx, 'Y', 928, 674, 15, '#ffd166', { align: 'left', weight: '900' });
    txt(ctx, FGT.ult.name, 947, 674, 13, ultReady ? '#ffe9a0' : 'rgba(165,195,175,0.6)', { align: 'left', weight: '800' });
    // 气槽
    panel(ctx, 1086, 674, 164, 12, 'rgba(0,0,0,0.6)', 'rgba(255,209,102,0.35)', 4);
    const mg = ctx.createLinearGradient(1090, 0, 1246, 0);
    mg.addColorStop(0, '#ff9f45');
    mg.addColorStop(1, '#ffe9a0');
    ctx.fillStyle = mg;
    Art.roundRect(ctx, 1088, 676, Math.max(0, 160 * (RG.meter / 100)), 8, 3);
    ctx.fill();
    txt(ctx, Math.floor(RG.meter) + ' / 100 气', 1168, 668, 10, 'rgba(255,235,180,0.85)', { weight: '700' });

    // 遗物额外技能状态（T / F / H / N）
    if (p.mods.skills) {
      const order = ['wave', 'bind', 'mend', 'aegis'];
      let sy2 = 152;
      for (let i = 0; i < order.length; i++) {
        const kk = order[i];
        const lv = p.mods.skills[kk];
        if (!lv) continue;
        const d = EXTRA_DEFS[kk];
        const cd = RG.extraCd && RG.extraCd[kk] ? RG.extraCd[kk] : 0;
        txt(ctx, d.key + ' · ' + d.name + ' Lv' + lv + (cd > 0 ? '  ' + cd.toFixed(1) + 's' : '  就绪'),
          182, sy2, 12, cd > 0 ? 'rgba(190,200,200,0.55)' : d.color, { align: 'left', weight: '800' });
        sy2 += 18;
      }
    }

    // 临时药剂状态
    if (p.stimT > 0) txt(ctx, '兴奋 ' + Math.ceil(p.stimT) + 's', 22, by + 20, 13, '#ff9f45', { align: 'left', weight: '700' });
    if (p.wardT > 0) txt(ctx, '护符 ' + Math.ceil(p.wardT) + 's', 132, by + 20, 13, '#9dffc4', { align: 'left', weight: '700' });

    // 底部操作提示
    txt(ctx, 'A/D 移动 · W 跳跃 · J 轻击 · K 重击 · L 远程 · I 技能 · U 格斗技 · Y 必杀 · V 超必杀 · T/F/H/N 遗物技能 · Space 翻滚 · Q 道具 · E 交互 · G 遗物栏',
      640, 706, 11, 'rgba(170,200,180,0.62)', { weight: '700' });

    // 连击提示
    if (p.combo > 1) {
      txt(ctx, '连击 ×' + p.combo, p.x - RG.cam.x, p.y - 210 - RG.cam.y, 18, '#ffd166', { stroke: '#04100a', strokeW: 4 });
    }

    // 房间介绍
    if (RG.introT > 0) {
      const a = Math.min(1, RG.introT / 0.7);
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(2,8,6,0.72)';
      ctx.fillRect(0, 300, CFG.W, 120);
      txt(ctx, '区域 ' + (RG.roomIndex + 1) + ' · ' + RG.room.def.name, 640, 348, 40, '#eaf6e6', {
        glow: '#59d98d', blur: 20, stroke: '#04100a', strokeW: 6,
      });
      txt(ctx, RG.room.def.sub, 640, 388, 16, 'rgba(180,220,190,0.85)', { weight: '700' });
      ctx.globalAlpha = 1;
    }

    // 提示消息
    if (RG.msgT > 0 && RG.msg) {
      const a = Math.min(1, RG.msgT / 0.4);
      ctx.globalAlpha = a;
      panel(ctx, 340, 596, 600, 40, 'rgba(4,10,8,0.82)', 'rgba(255,209,102,0.35)', 8);
      txt(ctx, RG.msg, 640, 616, 16, '#ffe9a0', { weight: '800' });
      ctx.globalAlpha = 1;
    }

    // 清区提示
    if (RG.clearT > 0 && RG.gate && RG.gate.open && !RG.gate.near) {
      const blink = 0.4 + 0.4 * Math.abs(Math.sin(RG.time * 4));
      ctx.globalAlpha = blink;
      txt(ctx, '→ 闸门已开启', CFG.W / 2 + 300, 300, 20, '#9dffc4', { stroke: '#04100a', strokeW: 4 });
      ctx.globalAlpha = 1;
    }

    drawRelicPop(ctx);
    if (RG.relicOpen) drawRelicPanel(ctx);
    if (RG.gamble) drawGamble(ctx);
  }

  /* 拾取遗物时的作用说明弹窗 */
  function drawRelicPop(ctx) {
    if (RG.relicPopT <= 0 || !RG.relicPop) return;
    const r = RG.relicPop;
    const a = Math.min(1, RG.relicPopT / 0.4);
    ctx.globalAlpha = a;
    const x = 846, y = 292, w = 396, h = 132;
    panel(ctx, x, y, w, h, 'rgba(8,6,2,0.92)', 'rgba(255,209,102,0.5)', 10);
    ctx.fillStyle = 'rgba(80,60,20,0.55)';
    Art.roundRect(ctx, x + 16, y + 18, 54, 54, 10);
    ctx.fill();
    RA.drawRelicIcon(ctx, r.icon, x + 43, y + 45, 38, '#ffd166');
    txt(ctx, '遗物 · Lv' + (r.level || 1) + (r.level >= RELIC_MAX_LV ? ' · 满级' : ''), x + 84, y + 30, 14, 'rgba(255,233,160,0.85)', { align: 'left', weight: '800' });
    txt(ctx, r.name, x + 84, y + 54, 23, '#ffe9a0', { align: 'left', weight: '900', stroke: '#140c02', strokeW: 4 });
    const d1 = r.desc || '';
    const cut = 19;
    txt(ctx, d1.slice(0, cut), x + 16, y + 90, 13, 'rgba(235,245,225,0.92)', { align: 'left', weight: '700' });
    if (d1.length > cut) txt(ctx, d1.slice(cut), x + 16, y + 110, 13, 'rgba(235,245,225,0.92)', { align: 'left', weight: '700' });
    txt(ctx, 'G 查看遗物栏', x + w - 16, y + h - 12, 11, 'rgba(255,209,102,0.7)', { align: 'right', weight: '800' });
    ctx.globalAlpha = 1;
  }

  /* 遗物 / 强化装备栏（G 打开，打开期间暂停） */
  function drawRelicPanel(ctx) {
    ctx.fillStyle = 'rgba(2,8,6,0.86)';
    ctx.fillRect(0, 0, CFG.W, CFG.H);
    panel(ctx, 90, 62, 1100, 596, 'rgba(6,14,10,0.96)', 'rgba(255,209,102,0.4)', 12);
    txt(ctx, '遗物装备栏', 640, 102, 30, '#ffe9a0', { glow: '#b9822a', blur: 16, stroke: '#120c02', strokeW: 5 });
    txt(ctx, '遗物 ' + RG.relics.length + ' 种 · 强化 ' + RG.buffs.length + ' 道', 640, 128, 13, 'rgba(190,220,200,0.8)', { weight: '800' });

    // 左列：遗物
    txt(ctx, '遗 物', 132, 164, 16, '#ffd166', { align: 'left', weight: '900' });
    txt(ctx, '数值：当前Lv → 下一Lv', 610, 164, 11, 'rgba(255,220,150,0.65)', { align: 'right', weight: '700' });
    ctx.strokeStyle = 'rgba(255,209,102,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(132, 172); ctx.lineTo(610, 172); ctx.stroke();
    if (!RG.relics.length) {
      txt(ctx, '尚未获得遗物 · 打开宝箱或通过休整获取', 132, 200, 14, 'rgba(160,190,172,0.6)', { align: 'left', weight: '700' });
    }
    const rowH = Math.min(28, 402 / Math.max(1, RG.relics.length));
    for (let i = 0; i < RG.relics.length; i++) {
      const r = RG.relics[i];
      const ry = 184 + i * rowH;
      const lv = r.level || 1;
      RA.drawRelicIcon(ctx, r.icon, 142, ry + 8, 13, '#ffd166');
      txt(ctx, r.name + ' Lv' + lv + ' (' + (r.count || 1) + '/' + relicNeed(Math.min(RELIC_MAX_LV, lv + 1)) + ')',
        158, ry + 6, 12, '#ffe9a0', { align: 'left', weight: '800' });
      const eff = relicValueText(r);
      txt(ctx, eff.slice(0, 34), 158, ry + 18, 11, 'rgba(220,235,220,0.85)', { align: 'left', weight: '700' });
    }

    // 右列：强化
    txt(ctx, '关 卡 强 化', 700, 164, 16, '#9dffc4', { align: 'left', weight: '900' });
    ctx.strokeStyle = 'rgba(157,255,196,0.22)';
    ctx.beginPath(); ctx.moveTo(700, 172); ctx.lineTo(1150, 172); ctx.stroke();
    if (!RG.buffs.length) {
      txt(ctx, '尚未获得强化', 700, 200, 14, 'rgba(160,190,172,0.6)', { align: 'left', weight: '700' });
    }
    const bRowH = Math.min(26, 400 / Math.max(1, RG.buffs.length));
    for (let i = 0; i < RG.buffs.length; i++) {
      const b = RG.buffs[i];
      const by0 = 190 + i * bRowH;
      RA.drawRelicIcon(ctx, b.icon, 708, by0 + 7, 15, '#9dffc4');
      txt(ctx, b.name, 726, by0 + 7, 13, '#c9ffdc', { align: 'left', weight: '800' });
      const d = (b.desc || '').slice(0, 30);
      txt(ctx, d, 824, by0 + 7, 12, 'rgba(220,235,220,0.8)', { align: 'left', weight: '700' });
    }

    txt(ctx, 'G / Esc 关闭 · 打开期间战斗暂停', 640, 646, 13, 'rgba(190,220,200,0.7)', { weight: '800' });
  }

  /* ---------------- 情赌徒界面 ---------------- */

  function drawHandGlyph(ctx, x, y, s, hand, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(3, s * 0.09);
    ctx.lineCap = 'round';
    if (hand === 0) {
      ctx.beginPath();
      ctx.arc(x, y, s * 0.42, 0, TAU);
      ctx.fill();
    } else if (hand === 1) {
      ctx.beginPath();
      ctx.moveTo(x - s * 0.16, y + s * 0.42);
      ctx.lineTo(x - s * 0.42, y - s * 0.36);
      ctx.moveTo(x - s * 0.16, y + s * 0.42);
      ctx.lineTo(x + s * 0.4, y - s * 0.36);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.rect(x - s * 0.38, y - s * 0.42, s * 0.76, s * 0.84);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - s * 0.38, y - s * 0.1);
      ctx.lineTo(x + s * 0.38, y - s * 0.1);
      ctx.stroke();
    }
    ctx.restore();
  }

  function wrapText(str, maxChars) {
    const lines = [];
    let rest = str || '';
    while (rest.length > maxChars) {
      lines.push(rest.slice(0, maxChars));
      rest = rest.slice(maxChars);
    }
    lines.push(rest);
    return lines;
  }

  function drawGamble(ctx) {
    const g = RG.gamble;
    if (!g) return;
    const G = D.GAMBLER;
    const p = RG.player;
    ctx.save();
    ctx.fillStyle = 'rgba(4,5,12,0.88)';
    ctx.fillRect(0, 0, CFG.W, CFG.H);
    panel(ctx, 70, 40, 1140, 640, 'rgba(18,13,30,0.97)', 'rgba(201,160,255,0.55)', 16);

    txt(ctx, '情 赌 徒', 112, 78, 34, '#e8c8ff', { align: 'left', glow: '#8a5ad6', blur: 20, stroke: '#0b0716', strokeW: 5 });
    txt(ctx, G.title + ' · 石头剪刀布 · 赢者双倍返还', 112, 108, 13, 'rgba(210,190,240,0.8)', { align: 'left', weight: '800' });
    for (let i = 0; i < 2; i++) {
      const tx = 700 + i * 140;
      const on = g.tab === i;
      panel(ctx, tx, 62, 126, 36, on ? 'rgba(201,160,255,0.22)' : 'rgba(0,0,0,0.25)', on ? '#c9a0ff' : 'rgba(201,160,255,0.2)', 8);
      txt(ctx, i === 0 ? '赌 局' : '商 店', tx + 63, 80, 16, on ? '#f0e0ff' : 'rgba(190,170,220,0.6)', { weight: '900' });
    }
    txt(ctx, 'Tab 切换 · Esc / E 离开', 1160, 80, 12, 'rgba(190,170,220,0.7)', { align: 'right', weight: '700' });
    txt(ctx, '生命 ' + Math.round(p.hp) + '/' + Math.round(p.hpMax) + ' · 废料 ' + RG.scrap + ' · 遗物 ' + RG.relics.length + ' 种', 112, 136, 13, '#ffd166', { align: 'left', weight: '800' });

    // 左侧立绘
    panel(ctx, 100, 152, 330, 496, 'rgba(6,4,14,0.8)', 'rgba(201,160,255,0.22)', 12);
    RA.drawGambler(ctx, 265, 644, 2.05, RG.time);
    txt(ctx, G.name, 265, 176, 24, '#e8c8ff', { glow: '#8a5ad6', blur: 14, stroke: '#0b0716', strokeW: 4 });
    const descLines = wrapText(G.desc, 16);
    for (let i = 0; i < descLines.length; i++) {
      txt(ctx, descLines[i], 118, 198 + i * 16, 12, 'rgba(210,195,235,0.85)', { align: 'left', weight: '700' });
    }

    const RX = 470, RW = 700;
    panel(ctx, RX, 160, RW, 470, 'rgba(6,4,14,0.6)', 'rgba(201,160,255,0.16)', 12);

    if (g.tab === 1) {
      // ---- 商店 ----
      txt(ctx, '赌 坊 商 品', RX + 28, 192, 18, '#ffd166', { align: 'left', weight: '900' });
      const offers = [
        { name: g.itemOffer ? D.ITEMS[g.itemOffer].name : '售罄', desc: g.itemOffer ? D.ITEMS[g.itemOffer].desc : '', price: G.itemPrice, color: '#9be0b0' },
        { name: g.relicOffer ? g.relicOffer.name : '售罄', desc: g.relicOffer ? g.relicOffer.desc : '', price: G.relicPrice, color: '#ffd166' },
      ];
      for (let i = 0; i < 2; i++) {
        const oy = 210 + i * 116;
        const on = g.shopIdx === i;
        panel(ctx, RX + 24, oy, RW - 48, 100, on ? 'rgba(201,160,255,0.18)' : 'rgba(0,0,0,0.32)', on ? '#c9a0ff' : 'rgba(201,160,255,0.15)', 10);
        txt(ctx, offers[i].name, RX + 44, oy + 26, 20, offers[i].color, { align: 'left', weight: '900' });
        txt(ctx, offers[i].desc || '', RX + 44, oy + 54, 12, 'rgba(220,215,235,0.82)', { align: 'left', weight: '700' });
        txt(ctx, offers[i].price + ' 废料', RX + RW - 44, oy + 30, 18, RG.scrap >= offers[i].price ? '#ffd166' : 'rgba(200,120,100,0.8)', { align: 'right', weight: '900' });
        txt(ctx, on ? 'Enter 购买' : '', RX + RW - 44, oy + 72, 12, 'rgba(201,160,255,0.8)', { align: 'right', weight: '800' });
      }
      txt(ctx, g.msg || '', RX + 28, 470, 14, '#e8c8ff', { align: 'left', weight: '800' });
      txt(ctx, '↑↓ 选择 · Enter 购买 · Tab 回赌局', RX + 28, 606, 12, 'rgba(190,175,220,0.7)', { align: 'left', weight: '700' });
      txt(ctx, '兑换码：2 → 1 → 4 领取隐藏遗物', RX + RW - 28, 578, 12, 'rgba(255,209,102,0.82)', { align: 'right', weight: '800' });
      if (g.codeBuf) {
        txt(ctx, '输入中：' + g.codeBuf.split('').join(' '), RX + RW - 28, 602, 14, '#9dffc4', { align: 'right', weight: '900' });
      }
    } else if (g.stage === 'pick' || g.stage === 'result') {
      // ---- 猜拳 ----
      txt(ctx, g.stage === 'pick' ? '出 手 吧' : '结 算', RX + RW / 2, 196, 20, '#ffd166', { weight: '900' });
      const hands = [0, 1, 2];
      for (let i = 0; i < 3; i++) {
        const hx = RX + 130 + i * 190;
        const on = g.playerHand === i;
        panel(ctx, hx - 72, 236, 144, 168, on ? 'rgba(255,209,102,0.2)' : 'rgba(0,0,0,0.3)', on ? '#ffd166' : 'rgba(201,160,255,0.18)', 10);
        drawHandGlyph(ctx, hx, 306, 66, i, '#ffe9a0');
        txt(ctx, HAND_NAMES[i], hx, 372, 17, '#e8c8ff', { weight: '900' });
        if (g.stage === 'pick') txt(ctx, String(i + 1), hx, 218, 13, 'rgba(255,209,102,0.8)', { weight: '900' });
      }
      // 庄家手势
      panel(ctx, RX + 545, 236, 130, 168, 'rgba(0,0,0,0.35)', 'rgba(190,90,70,0.4)', 10);
      if (g.npcHand >= 0) drawHandGlyph(ctx, RX + 610, 306, 62, g.npcHand, '#ff9f8a');
      else txt(ctx, '?', RX + 610, 308, 64, 'rgba(200,170,230,0.5)', { weight: '900' });
      txt(ctx, '庄家', RX + 610, 372, 15, 'rgba(255,180,160,0.85)', { weight: '800' });

      if (g.stage === 'result') {
        const rc = g.result === 'win' ? '#9dffc4' : g.result === 'lose' ? '#ff8a6a' : '#ffd166';
        txt(ctx, g.result === 'win' ? '你 赢 了' : g.result === 'lose' ? '你 输 了' : '平 局', RX + RW / 2, 452, 30, rc, { glow: rc, blur: 16, stroke: '#0b0716', strokeW: 5 });
        txt(ctx, g.msg, RX + RW / 2, 500, 15, 'rgba(230,220,245,0.9)', { weight: '800' });
        txt(ctx, 'Enter 再来一局 · Esc 离开', RX + RW / 2, 600, 12, 'rgba(190,175,220,0.7)', { weight: '700' });
      } else {
        txt(ctx, g.msg, RX + RW / 2, 444, 14, 'rgba(230,220,245,0.9)', { weight: '800' });
        txt(ctx, '1 石头 · 2 剪刀 · 3 布', RX + RW / 2, 530, 16, '#ffd166', { weight: '900' });
        txt(ctx, '赢了双倍返还，输了下注归庄家', RX + RW / 2, 600, 12, 'rgba(190,175,220,0.7)', { weight: '700' });
      }
    } else {
      // ---- 下注 ----
      txt(ctx, '选 择 赌 注', RX + 28, 192, 18, '#ffd166', { align: 'left', weight: '900' });
      const opts = gambleOptions();
      for (let i = 0; i < 4; i++) {
        const oy = 212 + i * 74;
        const on = g.betType === opts[i].k;
        panel(ctx, RX + 24, oy, RW - 48, 62, on ? 'rgba(255,209,102,0.16)' : 'rgba(0,0,0,0.3)', on ? '#ffd166' : 'rgba(201,160,255,0.15)', 9);
        txt(ctx, String(i + 1), RX + 46, oy + 31, 20, on ? '#ffd166' : 'rgba(200,175,230,0.6)', { align: 'left', weight: '900' });
        txt(ctx, opts[i].name, RX + 82, oy + 26, 19, opts[i].ok ? '#e8c8ff' : 'rgba(150,130,180,0.6)', { align: 'left', weight: '900' });
        txt(ctx, opts[i].detail, RX + 82, oy + 48, 12, opts[i].ok ? 'rgba(215,200,240,0.8)' : 'rgba(160,120,120,0.8)', { align: 'left', weight: '700' });
        txt(ctx, opts[i].ok ? '可下注' : '不足', RX + RW - 44, oy + 32, 14, opts[i].ok ? '#9dffc4' : '#ff8a6a', { align: 'right', weight: '800' });
      }
      if (g.betType === 'relic' || g.betType === 'item') {
        txt(ctx, '押注对象：' + gambleTargetLabel(g) + '   ← → 切换', RX + 28, 512, 14, 'rgba(255,233,160,0.9)', { align: 'left', weight: '800' });
      }
      txt(ctx, g.msg || '', RX + 28, 466, 14, '#e8c8ff', { align: 'left', weight: '800' });
      txt(ctx, '1-4 选赌注 · Enter 下注 · Tab 商店', RX + 28, 606, 12, 'rgba(190,175,220,0.7)', { align: 'left', weight: '700' });
    }
    ctx.restore();
  }

  /* ---------------- 肉鸽情报（标题页） ---------------- */

  function drawCodex(ctx) {
    const tabs = ['遗物', '道具', '强化', 'NPC', '敌人', '连战'];
    ctx.save();
    ctx.fillStyle = '#050b09';
    ctx.fillRect(0, 0, CFG.W, CFG.H);
    RA.drawBackground(ctx, { x: RG.time * 18 }, RG.time, { w: 1280, boss: false });
    ctx.fillStyle = 'rgba(3,8,7,0.86)';
    ctx.fillRect(0, 0, CFG.W, CFG.H);
    panel(ctx, 56, 34, 1168, 650, 'rgba(6,14,12,0.95)', 'rgba(157,255,196,0.3)', 14);

    txt(ctx, '肉 鸽 情 报', 640, 74, 36, '#d9f0c4', { glow: '#59d98d', blur: 22, stroke: '#06100b', strokeW: 6 });
    txt(ctx, codexSubtitle(RG.codexTab), 640, 104, 13, 'rgba(180,220,190,0.75)', { weight: '800' });

    for (let i = 0; i < 6; i++) {
      const tx = 190 + i * 150;
      const on = RG.codexTab === i;
      panel(ctx, tx, 124, 140, 38, on ? 'rgba(157,255,196,0.18)' : 'rgba(0,0,0,0.3)', on ? '#9dffc4' : 'rgba(157,255,196,0.18)', 8);
      txt(ctx, (i + 1) + '  ' + tabs[i], tx + 70, 143, 15, on ? '#dcffe8' : 'rgba(170,200,180,0.65)', { weight: '900' });
    }

    const rows = codexRows(RG.codexTab);
    const start = RG.codexScroll;
    const rowH = codexRowH(RG.codexTab);
    const visible = codexVisible(RG.codexTab);
    for (let vi = 0; vi < visible; vi++) {
      const idx = start + vi;
      if (idx >= rows.length) break;
      const r = rows[idx];
      const y = 180 + vi * rowH;
      panel(ctx, 92, y, 1096, rowH - 10, 'rgba(0,0,0,0.26)', 'rgba(157,255,196,0.1)', 8);
      ctx.fillStyle = 'rgba(255,209,102,0.12)';
      Art.roundRect(ctx, 108, y + 12, 40, 40, 8);
      ctx.fill();
      RA.drawRelicIcon(ctx, r.icon === 'npc' || r.icon === 'enemy' ? 'rune' : r.icon, 128, y + 32, 26, r.color || '#ffd166');
      txt(ctx, r.name, 162, y + 20, 17, r.color || '#ffe9a0', { align: 'left', weight: '900' });
      txt(ctx, r.tag || '', 1170, y + 20, 11, 'rgba(180,210,190,0.7)', { align: 'right', weight: '800' });
      const d = wrapText(r.desc || '', 62);
      for (let li = 0; li < 2 && li < d.length; li++) {
        txt(ctx, d[li], 162, y + 38 + li * 13, 12, 'rgba(225,238,228,0.88)', { align: 'left', weight: '700' });
      }
      if (r.moves && r.moves.length) {
        // 敌人页：招式与攻击动画说明（最多 3 行）
        const ml = wrapText('招式 ▸ ' + r.moves.join(' · '), 92);
        for (let li = 0; li < 3 && li < ml.length; li++) {
          txt(ctx, ml[li], 162, y + 56 + li * 12, 10.5, 'rgba(255,214,130,0.86)', { align: 'left', weight: '700' });
        }
      } else if (r.note) {
        // 遗物页：逐级列出 Lv1~Lv5 数值；道具页：固定加成说明
        if (RG.codexTab === 1) {
          txt(ctx, r.note, 1170, y + 40, 11, 'rgba(255,209,102,0.72)', { align: 'right', weight: '700' });
        } else {
          const nl = wrapText(r.note, 106);
          txt(ctx, nl[0], 162, y + 58, 9.5, 'rgba(255,209,102,0.8)', { align: 'left', weight: '700' });
        }
      }
    }

    if (rows.length > visible) {
      const total = rows.length;
      txt(ctx, (start + 1) + '-' + Math.min(total, start + visible) + ' / ' + total, 1160, 160, 12, 'rgba(180,210,190,0.7)', { align: 'right', weight: '800' });
    }
    txt(ctx, 'A/D 或 ←→ 切换栏目 · W/S 或 ↑↓ 滚动 · Esc 返回标题', 640, 664, 13, 'rgba(180,210,190,0.75)', { weight: '800' });
    ctx.restore();
  }

  /* ---------------- 排行榜 ---------------- */

  function drawBoard(ctx) {
    ctx.save();
    ctx.fillStyle = '#050b09';
    ctx.fillRect(0, 0, CFG.W, CFG.H);
    RA.drawBackground(ctx, { x: RG.time * 18 }, RG.time, { w: 1280, boss: false });
    ctx.fillStyle = 'rgba(3,8,7,0.88)';
    ctx.fillRect(0, 0, CFG.W, CFG.H);
    panel(ctx, 56, 34, 1168, 650, 'rgba(6,14,12,0.95)', 'rgba(157,255,196,0.3)', 14);

    txt(ctx, '肉 鸽 排 行 榜', 640, 74, 36, '#d9f0c4', { glow: '#59d98d', blur: 24, stroke: '#06100b', strokeW: 7 });
    txt(ctx, '通关时间排名 · 同一玩家只计最快的一局', 640, 104, 13, 'rgba(180,220,190,0.75)', { weight: '800' });

    const tabs = ['普通爬塔', 'BOSS 连战'];
    for (let i = 0; i < 2; i++) {
      const tx = 470 + i * 180;
      const on = RG.boardTab === i;
      panel(ctx, tx, 122, 170, 40, on ? 'rgba(157,255,196,0.18)' : 'rgba(0,0,0,0.3)',
        on ? '#9dffc4' : 'rgba(157,255,196,0.18)', 8);
      txt(ctx, tabs[i], tx + 85, 142, 16, on ? '#dcffe8' : 'rgba(170,200,180,0.65)', { weight: '900' });
      BVN.Game.hotspots.push({ x: tx, y: 122, w: 170, h: 40, action: 'rogue:boardtab:' + i });
    }

    if (RG.boardData && RG.boardData.total != null) {
      txt(ctx, '共 ' + RG.boardData.total + ' 名玩家', 1160, 142, 12, 'rgba(255,209,102,0.85)', { align: 'right', weight: '800' });
    }

    const entries = RG.boardData && RG.boardData.entries ? RG.boardData.entries : [];

    // 表头
    if (entries.length) {
      panel(ctx, 92, 178, 1096, 30, 'rgba(157,255,196,0.08)', 'rgba(157,255,196,0.18)', 6);
      txt(ctx, '名次', 130, 193, 13, '#9dffc4', { weight: '900' });
      txt(ctx, '用户名', 196, 193, 13, '#9dffc4', { align: 'left', weight: '900' });
      txt(ctx, '角色', 470, 193, 13, '#9dffc4', { align: 'left', weight: '900' });
      txt(ctx, '用时', 700, 193, 13, '#9dffc4', { weight: '900' });
      txt(ctx, '击杀', 810, 193, 13, '#9dffc4', { weight: '900' });
      txt(ctx, '总伤害', 920, 193, 13, '#9dffc4', { weight: '900' });
      txt(ctx, '上榜时间', 1090, 193, 13, '#9dffc4', { weight: '900' });
    }

    const rowH = 32;
    for (let i = 0; i < entries.length && i < 11; i++) {
      const e = entries[i];
      const y = 212 + i * rowH;
      const top3 = e.rank <= 3;
      panel(ctx, 92, y, 1096, rowH - 6, top3 ? 'rgba(255,209,102,0.1)' : 'rgba(0,0,0,0.24)',
        top3 ? 'rgba(255,209,102,0.32)' : 'rgba(157,255,196,0.08)', 6);
      const rankColor = e.rank === 1 ? '#ffe066' : (e.rank === 2 ? '#d8e8f0' : (e.rank === 3 ? '#ffb47a' : 'rgba(170,200,180,0.8)'));
      txt(ctx, String(e.rank), 130, y + 13, 18, rankColor, { weight: '900' });
      txt(ctx, String(e.name || '—').slice(0, 16), 196, y + 13, 16, '#eaf6e6', { align: 'left', weight: '900' });
      txt(ctx, String(e.char || '—'), 470, y + 13, 14, 'rgba(200,222,208,0.85)', { align: 'left', weight: '800' });
      txt(ctx, fmtLbTime(e.time), 700, y + 13, 17, '#ffd166', { weight: '900' });
      txt(ctx, String(e.kills == null ? '—' : e.kills), 810, y + 13, 13, 'rgba(190,215,198,0.8)', { weight: '800' });
      txt(ctx, String(e.dmg == null ? '—' : e.dmg), 920, y + 13, 13, 'rgba(190,215,198,0.8)', { weight: '800' });
      txt(ctx, String(e.created_at || '').slice(0, 16), 1090, y + 13, 12, 'rgba(160,190,172,0.7)', { weight: '700' });
    }

    if (RG.boardLoading) {
      txt(ctx, '正在连接排行榜后端…', 640, 360, 20, 'rgba(200,230,210,0.9)', { weight: '800' });
      txt(ctx, 'python3 server/leaderboard_server.py', 640, 392, 14, 'rgba(255,209,102,0.8)', { weight: '700' });
    } else if (RG.boardErr) {
      txt(ctx, '无法读取排行榜', 640, 352, 24, '#ff8a7a', { weight: '900', glow: '#b5372f', blur: 14 });
      txt(ctx, RG.boardErr, 640, 386, 14, 'rgba(255,180,170,0.9)', { weight: '700' });
      txt(ctx, '请先启动后端：python3 server/leaderboard_server.py（默认 8787 端口）', 640, 414, 13, 'rgba(180,210,190,0.8)', { weight: '700' });
      button(ctx, 570, 446, 140, 44, 'R 重试', 'rogue:boardrefresh', true);
    } else if (!entries.length) {
      txt(ctx, '暂无通关记录', 640, 360, 24, 'rgba(200,230,210,0.85)', { weight: '900' });
      txt(ctx, '通关肉鸽模式后输入用户名即可登上排行榜', 640, 392, 14, 'rgba(160,200,175,0.75)', { weight: '700' });
    }

    button(ctx, 548, 606, 184, 44, 'Esc 返回', 'rogue:boardclose', false);
    txt(ctx, 'Tab / ←→ 切换模式 · R 刷新 · Esc 返回', 640, 668, 13, 'rgba(180,210,190,0.75)', { weight: '800' });
    ctx.restore();
  }

  function drawBossBar(ctx) {
    const mb = RG.monsters.find(function (m) { return m.def && m.def.kind === 'miniboss' && m.hp > 0; });
    const boss = mb || RG.monsters.find(function (m) { return m.def && m.def.kind === 'boss'; });
    if (!boss) return;
    const isMb = boss.def.kind === 'miniboss';
    const guarded = boss.type === 'jellyMother' && RG.jellyGuard;
    const ratio = Math.max(0, boss.hp / boss.hpMax);
    const x = 320, y = 26, w = 640, h = 24;
    panel(ctx, x - 10, y - 8, w + 20, 66, 'rgba(12,3,3,0.86)', guarded ? 'rgba(90,200,210,0.55)' : 'rgba(190,90,70,0.4)', 10);
    const label = guarded
      ? ('触须护盾生效 · 剩余 ' + RG.tentacleAlive + ' / ' + (RG.tentacleTotal || 4) + ' 根')
      : isMb
        ? ('关底迷你 BOSS · ' + (ratio > 0.5 ? '狂躁' : '濒死'))
        : (boss.def.name + ' · 第 ' + (boss.phase || 1) + ' 阶段');
    txt(ctx, label, x, y - 14 + 16, 15, guarded ? '#9fe8ff' : '#ffb08a', { align: 'left', weight: '900' });
    // 名称右对齐
    txt(ctx, boss.def.name, x + w, y + 2, 16, '#ffd6c6', { align: 'right', weight: '900', glow: '#b5372f', blur: 12 });
    panel(ctx, x, y + 10, w, h, 'rgba(0,0,0,0.6)', 'rgba(190,90,70,0.32)', 6);
    const bg = ctx.createLinearGradient(x, 0, x + w, 0);
    if (guarded) {
      bg.addColorStop(0, '#a8f0ff');
      bg.addColorStop(0.5, '#4fb8d8');
      bg.addColorStop(1, '#215b78');
    } else {
      bg.addColorStop(0, '#ff8a6a');
      bg.addColorStop(0.5, '#d8442f');
      bg.addColorStop(1, '#8a1f14');
    }
    ctx.fillStyle = bg;
    Art.roundRect(ctx, x + 2, y + 12, Math.max(0, (w - 4) * ratio), h - 4, 5);
    ctx.fill();
    // 阶段刻度（仅最终 BOSS）
    if (!isMb) {
      ctx.strokeStyle = 'rgba(255,220,180,0.7)';
      ctx.lineWidth = 2;
      for (let i = 1; i < 3; i++) {
        const px = x + w * (i === 1 ? 0.33 : 0.66);
        ctx.beginPath();
        ctx.moveTo(px, y + 10);
        ctx.lineTo(px, y + 10 + h);
        ctx.stroke();
      }
    }
    txt(ctx, Math.ceil(boss.hp) + ' / ' + boss.hpMax, x + w / 2, y + 22, 14, '#fff1e6', { stroke: '#2a0805', strokeW: 3 });
  }

  /* ---------------- 奖励页 ---------------- */

  function drawReward(ctx) {
    ctx.fillStyle = 'rgba(2,7,6,0.84)';
    ctx.fillRect(0, 0, CFG.W, CFG.H);
    // 顶部装饰
    const grad = ctx.createLinearGradient(0, 0, 0, 120);
    grad.addColorStop(0, 'rgba(40,90,60,0.35)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CFG.W, 120);

    txt(ctx, '区 域 净 化', 640, 58, 40, '#eaf6e6', { glow: '#59d98d', blur: 22, stroke: '#04100a', strokeW: 7 });
    txt(ctx, '选取一件遗物，继续向痂香深处推进', 640, 100, 17, 'rgba(190,220,200,0.9)', { weight: '700' });
    const nextName = RG.roomIndex + 1 < D.ROOMS.length ? D.ROOMS[RG.roomIndex + 1].name : D.LEVEL.next;
    txt(ctx, '下一站：' + nextName, 640, 130, 15, '#ffd166', { weight: '800' });

    const n = Math.max(1, RG.relicChoices.length);
    const cw = 286, ch = 300, gap = 26;
    const totalW = n * cw + (n - 1) * gap;
    const x0 = (CFG.W - totalW) / 2;
    for (let i = 0; i < RG.relicChoices.length; i++) {
      const r = RG.relicChoices[i];
      const cx = x0 + i * (cw + gap);
      const cy = 196;
      const sel = i === RG.rewardIndex;
      panel(ctx, cx, cy, cw, ch, sel ? 'rgba(20,34,26,0.96)' : 'rgba(8,14,12,0.92)',
        sel ? 'rgba(255,209,102,0.95)' : 'rgba(100,130,112,0.42)', 14);
      if (sel) {
        ctx.save();
        ctx.shadowColor = 'rgba(255,209,102,0.55)';
        ctx.shadowBlur = 30;
        panel(ctx, cx, cy, cw, ch, null, 'rgba(255,220,140,0.5)', 14);
        ctx.restore();
      }
      // 图标底座
      ctx.fillStyle = 'rgba(60,48,20,0.55)';
      ctx.beginPath();
      ctx.arc(cx + cw / 2, cy + 72, 40, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,209,102,0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx + cw / 2, cy + 72, 40, 0, TAU);
      ctx.stroke();
      RA.drawRelicIcon(ctx, r.icon, cx + cw / 2, cy + 72, 42, '#ffd166');

      txt(ctx, r.name, cx + cw / 2, cy + 140, 24, '#ffe9a0', { stroke: '#0a1a10', strokeW: 4 });
      txt(ctx, '遗 物', cx + cw / 2, cy + 170, 12, 'rgba(150,190,165,0.55)', { weight: '700' });
      drawWrapText(ctx, r.desc, cx + cw / 2, cy + 200, 16, 'rgba(220,236,226,0.92)', cw - 48, 24);
      txt(ctx, sel ? 'Enter 拾取' : '点击拾取', cx + cw / 2, cy + ch - 30, 14,
        sel ? '#9dffc4' : 'rgba(150,180,160,0.5)', { weight: '800' });

      BVN.Game.hotspots.push({ x: cx, y: cy, w: cw, h: ch, action: 'rogue:relic:' + i });
    }

    // 当前构筑
    const relics = RG.relics;
    txt(ctx, '当前构筑 · ' + relics.length + ' 件遗物', 640, 544, 15, 'rgba(190,220,200,0.8)', { weight: '700' });
    if (relics.length) {
      const rw = relics.length * 34;
      const rx0 = (CFG.W - rw) / 2;
      for (let i = 0; i < relics.length; i++) {
        ctx.fillStyle = 'rgba(60,48,20,0.5)';
        Art.roundRect(ctx, rx0 + i * 34, 560, 28, 28, 6);
        ctx.fill();
        RA.drawRelicIcon(ctx, relics[i].icon, rx0 + i * 34 + 14, 574, 19, '#ffd166');
      }
    }
    txt(ctx, '生命 ' + Math.ceil(RG.player.hp) + ' / ' + RG.player.hpMax + ' · 废料 ' + RG.scrap +
      ' · 用时 ' + fmtTime(RG.runTime), 640, 614, 15, 'rgba(210,230,218,0.85)', { weight: '700' });
    txt(ctx, '← → 选择 · Enter 拾取', 640, 664, 16, '#ffd166', { weight: '800' });
  }

  /* ---------------- 关卡强化三选一 ---------------- */

  function drawBuff(ctx) {
    ctx.fillStyle = 'rgba(2,8,10,0.86)';
    ctx.fillRect(0, 0, CFG.W, CFG.H);
    const grad = ctx.createLinearGradient(0, 0, 0, 130);
    grad.addColorStop(0, 'rgba(30,80,70,0.4)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CFG.W, 130);

    txt(ctx, '关 卡 强 化', 640, 56, 40, '#eaf6e6', { glow: '#3ff0d0', blur: 22, stroke: '#04100a', strokeW: 7 });
    txt(ctx, '拾取遗物之后，再选一道痂香强化（角色专属强化已为你保底）', 640, 98, 16, 'rgba(190,220,210,0.9)', { weight: '700' });
    txt(ctx, '已持有强化 ' + RG.buffs.length + ' 道 · 角色「' + RG.char.name + '」', 640, 128, 14, '#9dffc4', { weight: '800' });

    const n = Math.max(1, RG.buffChoices.length);
    const cw = 286, ch = 300, gap = 26;
    const totalW = n * cw + (n - 1) * gap;
    const x0 = (CFG.W - totalW) / 2;
    const ownList = D.CHAR_BUFFS[RG.char.id] || [];
    for (let i = 0; i < RG.buffChoices.length; i++) {
      const b = RG.buffChoices[i];
      const cx = x0 + i * (cw + gap);
      const cy = 190;
      const sel = i === RG.buffIndex;
      const own = ownList.some(function (o) { return o.id === b.id; });
      panel(ctx, cx, cy, cw, ch, sel ? 'rgba(16,36,30,0.96)' : 'rgba(8,14,12,0.92)',
        sel ? 'rgba(90,255,200,0.9)' : 'rgba(100,140,124,0.42)', 14);
      if (sel) {
        ctx.save();
        ctx.shadowColor = 'rgba(63,240,208,0.45)';
        ctx.shadowBlur = 30;
        panel(ctx, cx, cy, cw, ch, null, 'rgba(150,255,225,0.45)', 14);
        ctx.restore();
      }
      // 图标底座
      ctx.fillStyle = own ? 'rgba(30,80,60,0.6)' : 'rgba(60,48,20,0.55)';
      ctx.beginPath();
      ctx.arc(cx + cw / 2, cy + 70, 40, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = own ? 'rgba(90,255,200,0.45)' : 'rgba(255,209,102,0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx + cw / 2, cy + 70, 40, 0, TAU);
      ctx.stroke();
      RA.drawRelicIcon(ctx, b.icon, cx + cw / 2, cy + 70, 42, own ? '#9dffc4' : '#ffd166');

      txt(ctx, b.name, cx + cw / 2, cy + 138, 24, own ? '#c8ffe6' : '#ffe9a0', { stroke: '#0a1a10', strokeW: 4 });
      txt(ctx, own ? '角 色 专 属' : '通 用 强 化', cx + cw / 2, cy + 168, 12,
        own ? 'rgba(140,255,210,0.85)' : 'rgba(160,190,175,0.55)', { weight: '800' });
      drawWrapText(ctx, b.desc, cx + cw / 2, cy + 200, 16, 'rgba(220,236,226,0.92)', cw - 48, 24);
      txt(ctx, sel ? 'Enter 领取' : '点击领取', cx + cw / 2, cy + ch - 30, 14,
        sel ? '#9dffc4' : 'rgba(150,180,160,0.5)', { weight: '800' });

      BVN.Game.hotspots.push({ x: cx, y: cy, w: cw, h: ch, action: 'rogue:buff:' + i });
    }

    txt(ctx, '生命 ' + Math.ceil(RG.player.hp) + ' / ' + RG.player.hpMax + ' · 废料 ' + RG.scrap +
      ' · 用时 ' + fmtTime(RG.runTime), 640, 596, 15, 'rgba(210,230,218,0.85)', { weight: '700' });
    txt(ctx, '← → 选择 · 1 / 2 / 3 快捷 · Enter 领取', 640, 648, 16, '#9dffc4', { weight: '800' });
  }

  /* ---------------- 每关结束：废料强化 ---------------- */

  function upgTotalText(def, lv) {
    if (!lv) return '无加成';
    if (def.key === 'hp') return '+' + (lv * UPG_PER.hp) + ' 生命';
    if (def.key === 'atk') return '+' + Math.round(lv * UPG_PER.atk * 100) + '% 伤害';
    if (def.key === 'def') return '-' + Math.round(lv * UPG_PER.def * 100) + '% 受伤';
    if (def.key === 'agi') return '+' + Math.round(lv * UPG_PER.agi * 100) + '% 移速';
    if (def.key === 'cd') {
      const n = Math.round(lv * UPG_PER.cd * 100);
      return '-' + n + '% CD / +' + n + '% 气';
    }
    return '';
  }

  function drawUpgrade(ctx) {
    ctx.fillStyle = 'rgba(3,10,8,0.92)';
    ctx.fillRect(0, 0, CFG.W, CFG.H);
    const grad = ctx.createLinearGradient(0, 0, 0, 150);
    grad.addColorStop(0, 'rgba(80,70,20,0.42)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CFG.W, 150);

    txt(ctx, '废 料 强 化', 640, 54, 40, '#ffe9a0', { glow: '#b9822a', blur: 22, stroke: '#120c02', strokeW: 7 });
    txt(ctx, '第 ' + (RG.roomIndex + 1) + ' 关结束 · 消耗废料永久提升基础属性（每项上限 Lv' + UPG_MAX_LV + '）',
      640, 96, 15, 'rgba(230,215,170,0.9)', { weight: '700' });
    txt(ctx, '持有废料 ' + RG.scrap, 640, 126, 18, '#ffd166', { weight: '900' });

    const n = UPG_DEFS.length, gap = 16;
    const cw = (CFG.W - 128 - gap * (n - 1)) / n;
    const cy = 164, ch = 334;
    for (let i = 0; i < n; i++) {
      const def = UPG_DEFS[i];
      const lv = RG.upg[def.key] || 0;
      const cost = upgCost(def);
      const maxed = lv >= UPG_MAX_LV;
      const can = !maxed && RG.scrap >= cost;
      const cx = 64 + i * (cw + gap);
      const sel = i === RG.upgIndex;
      panel(ctx, cx, cy, cw, ch, sel ? 'rgba(34,30,12,0.96)' : 'rgba(12,14,10,0.92)',
        sel ? 'rgba(255,209,102,0.9)' : 'rgba(140,130,90,0.42)', 14);
      ctx.fillStyle = 'rgba(70,60,20,0.55)';
      ctx.beginPath(); ctx.arc(cx + cw / 2, cy + 62, 34, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,209,102,0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx + cw / 2, cy + 62, 34, 0, TAU); ctx.stroke();
      RA.drawRelicIcon(ctx, def.icon, cx + cw / 2, cy + 62, 34, '#ffd166');

      txt(ctx, def.name, cx + cw / 2, cy + 118, 22, '#ffe9a0', { stroke: '#0a0803', strokeW: 4 });
      txt(ctx, 'Lv ' + lv + ' / ' + UPG_MAX_LV, cx + cw / 2, cy + 146, 14, '#9dffc4', { weight: '800' });
      txt(ctx, def.unit, cx + cw / 2, cy + 172, 12, 'rgba(210,225,210,0.8)', { weight: '700' });
      txt(ctx, '当前：' + upgTotalText(def, lv), cx + cw / 2, cy + 202, 13, '#eaf6e6', { weight: '800' });
      if (!maxed) txt(ctx, '下一级：' + upgTotalText(def, lv + 1), cx + cw / 2, cy + 224, 12, 'rgba(180,230,190,0.85)', { weight: '700' });
      txt(ctx, maxed ? '已 满 级' : (can ? '花费 ' + cost + ' 废料' : '废料不足 · ' + cost),
        cx + cw / 2, cy + 262, 14, maxed ? '#9dffc4' : (can ? '#ffd166' : '#ff8a7a'), { weight: '900' });
      txt(ctx, '按 ' + (i + 1) + ' 购买', cx + cw / 2, cy + ch - 24, 12,
        sel ? '#ffe9a0' : 'rgba(160,190,170,0.6)', { weight: '800' });
      BVN.Game.hotspots.push({ x: cx, y: cy, w: cw, h: ch, action: 'rogue:upg:' + i });
    }

    txt(ctx, '废料 ' + RG.scrap + ' · 生命 ' + Math.ceil(RG.player.hp) + ' / ' + RG.player.hpMax + ' · 用时 ' + fmtTime(RG.runTime),
      640, 536, 14, 'rgba(210,230,218,0.85)', { weight: '700' });
    button(ctx, 480, 558, 320, 52, '进入下一关（Enter）', 'rogue:upgnext', true);
    txt(ctx, '1 ~ 5 购买 · ← → 选择 · Enter / Space 继续', 640, 644, 15, '#ffd166', { weight: '800' });
  }

  /* ---------------- 连战：情赌徒补给（自由购买遗物 + 无上限加点） ---------------- */

  function drawGauntletShop(ctx) {
    ctx.fillStyle = 'rgba(4,10,9,0.93)';
    ctx.fillRect(0, 0, CFG.W, CFG.H);
    const grad = ctx.createLinearGradient(0, 0, 0, 180);
    grad.addColorStop(0, 'rgba(90,50,150,0.36)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CFG.W, 180);

    txt(ctx, '情 赌 徒 · 连 战 补 给', 640, 50, 38, '#e8c8ff', { glow: '#a35fe0', blur: 22, stroke: '#100616', strokeW: 7 });
    txt(ctx, '第 ' + (RG.gstage + 1) + ' / ' + GAUNTLET_STAGES + ' 关备战 · 已通过 ' + RG.gstage +
      ' 关 · 本关奖励 +' + (RG.shopScrap || 0) + ' 废料 + 10 件遗物', 640, 84, 14, 'rgba(225,210,240,0.9)', { weight: '800' });
    txt(ctx, '持有废料 ' + RG.scrap + ' · 生命 ' + Math.ceil(RG.player.hp) + ' / ' + RG.player.hpMax, 640, 108, 16, '#ffd166', { weight: '900' });

    // ---- 遗物商店（全部遗物可选） ----
    const list = shopRelicList();
    const n = list.length;
    const cw = 200, gap = 16, ch = 226, cy = 128;
    // 数值行可能较长：按卡片宽度自动缩小字号，避免溢出卡片
    const fitTxt = function (str, x, y, size, color, weight) {
      let s = size;
      ctx.font = weight + ' ' + s + 'px ' + CFG.FONT;
      while (s > 7.5 && ctx.measureText(str).width > cw - 12) {
        s -= 0.5;
        ctx.font = weight + ' ' + s + 'px ' + CFG.FONT;
      }
      txt(ctx, str, x, y, s, color, { weight: weight });
    };
    for (let k = -2; k <= 2; k++) {
      const idx = ((RG.shopIndex + k) % n + n) % n;
      const r = list[idx];
      const cx = 640 + k * (cw + gap) - cw / 2;
      const on = k === 0;
      const e = findRelic(r.id);
      const lv = e ? e.level : 0;
      const maxed = lv >= RELIC_MAX_LV;
      const price = gauntletRelicPrice(r);
      panel(ctx, cx, cy, cw, ch, on ? 'rgba(30,20,44,0.96)' : 'rgba(10,12,16,0.92)',
        on ? 'rgba(201,160,255,0.95)' : 'rgba(120,100,150,0.36)', 12);
      RA.drawRelicIcon(ctx, r.icon, cx + cw / 2, cy + 52, 40, on ? '#e8c8ff' : 'rgba(220,200,240,0.8)');
      txt(ctx, r.name, cx + cw / 2, cy + 104, 17, on ? '#f2e6ff' : 'rgba(210,200,225,0.8)', { stroke: '#0a0610', strokeW: 4 });
      txt(ctx, maxed ? '已满级 Lv' + RELIC_MAX_LV : ('持有 Lv' + (lv || 0) + ' → Lv' + (lv ? relicLevelOf((e.count || 0) + 1) : 1)),
        cx + cw / 2, cy + 130, 12, maxed ? '#9dffc4' : 'rgba(230,215,250,0.82)', { weight: '800' });
      const nl = wrapText(r.desc || '', 30);
      if (nl.length) txt(ctx, nl[0], cx + cw / 2, cy + 148, 9.5, 'rgba(210,200,230,0.72)', { weight: '700' });
      // 遗物升级加成：当前等级 → 下一级的实际数值
      const gain = relicShopGainText(r, lv);
      if (gain) {
        const tag = gain.special ? '' : gain.label + ' ';
        fitTxt((lv ? '当前' : '入手') + ' Lv' + gain.lv + '：' + tag + gain.cur,
          cx + cw / 2, cy + 163, 10, '#d8f4e2', '800');
        if (gain.next) {
          fitTxt('升 Lv' + (gain.lv + 1) + '：' + tag + gain.next,
            cx + cw / 2, cy + 177, 10, '#ffd166', '900');
        } else {
          fitTxt('已满级 Lv' + RELIC_MAX_LV + '（收益封顶）', cx + cw / 2, cy + 177, 10, '#9dffc4', '800');
        }
      }
      txt(ctx, maxed ? '无 法 提 升' : (RG.scrap >= price ? '花费 ' + price + ' 废料' : '废料不足 · ' + price),
        cx + cw / 2, cy + ch - 30, 14, maxed ? '#9dffc4' : (RG.scrap >= price ? '#ffd166' : '#ff8a7a'), { weight: '900' });
      txt(ctx, on ? 'E 购买' : '← → 浏览', cx + cw / 2, cy + ch - 10, 11,
        on ? '#e8c8ff' : 'rgba(160,145,185,0.55)', { weight: '800' });
      BVN.Game.hotspots.push({ x: cx, y: cy, w: cw, h: ch, action: 'rogue:shopbuy:' + idx });
    }

    // ---- 属性强化（无上限） ----
    txt(ctx, '属 性 强 化 · 连战模式加点无上限（每级费用线性递增）', 640, 380, 15, '#9dffc4', { weight: '900' });
    const m = UPG_DEFS.length, g2 = 16;
    const cw2 = (CFG.W - 128 - g2 * (m - 1)) / m;
    const cy2 = 398, ch2 = 150;
    for (let i = 0; i < m; i++) {
      const def = UPG_DEFS[i];
      const lv = RG.upg[def.key] || 0;
      const cost = upgCost(def);
      const can = RG.scrap >= cost;
      const cx = 64 + i * (cw2 + g2);
      const sel = i === RG.upgIndex;
      panel(ctx, cx, cy2, cw2, ch2, can ? 'rgba(18,22,14,0.94)' : 'rgba(12,12,10,0.9)',
        sel ? 'rgba(255,209,102,0.7)' : 'rgba(140,130,90,0.32)', 10);
      RA.drawRelicIcon(ctx, def.icon, cx + 34, cy2 + 38, 22, '#ffd166');
      txt(ctx, def.name, cx + 60, cy2 + 32, 18, '#ffe9a0', { align: 'left', weight: '900' });
      txt(ctx, 'Lv ' + lv, cx + 60, cy2 + 54, 12, '#9dffc4', { align: 'left', weight: '800' });
      txt(ctx, def.unit, cx + cw2 / 2, cy2 + 82, 10.5, 'rgba(210,225,210,0.8)', { weight: '700' });
      txt(ctx, '当前 ' + upgTotalText(def, lv), cx + cw2 / 2, cy2 + 104, 11, '#eaf6e6', { weight: '800' });
      txt(ctx, can ? '花费 ' + cost : '废料不足 · ' + cost, cx + cw2 / 2, cy2 + 128, 13, can ? '#ffd166' : '#ff8a7a', { weight: '900' });
      BVN.Game.hotspots.push({ x: cx, y: cy2, w: cw2, h: ch2, action: 'rogue:upg:' + i });
    }

    button(ctx, 480, 574, 320, 50, '进入第 ' + (RG.gstage + 1) + ' 关（Enter）', 'rogue:shopnext', true);
    txt(ctx, '← → 浏览遗物 · E 购买 · 1 ~ 5 强化属性（无上限） · Enter / Space 进入下一关', 640, 650, 14, '#ffd166', { weight: '800' });
  }


  function drawWrapText(ctx, str, cx, y, size, color, maxW, lh) {
    ctx.font = '700 ' + size + 'px ' + CFG.FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    let line = '';
    let yy = y;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ctx.measureText(line + ch).width > maxW && line) {
        ctx.fillText(line, cx, yy);
        line = ch;
        yy += lh;
      } else {
        line += ch;
      }
    }
    if (line) ctx.fillText(line, cx, yy);
  }

  /* ---------------- 阵亡 / 通关 ---------------- */

  /* 通关 / 阵亡数据汇总：属性、遗物、强化、道具、战绩、首领 */
  function drawRunSummary(ctx, top) {
    const p = RG.player, m = p.mods || {};
    const x0 = 64, w = 1152, h = 406;
    panel(ctx, x0, top, w, h, 'rgba(6,14,10,0.78)', 'rgba(120,190,150,0.32)', 14);
    ctx.strokeStyle = 'rgba(120,190,150,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0 + 360, top + 16); ctx.lineTo(x0 + 360, top + h - 16); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x0 + 824, top + 16); ctx.lineTo(x0 + 824, top + h - 16); ctx.stroke();

    /* ---- 左列：属性 + 战绩 ---- */
    const ax = x0 + 26;
    txt(ctx, '属 性', ax, top + 28, 16, '#9dffc4', { align: 'left', weight: '900' });
    const attrs = [
      ['生命上限', Math.round(p.hp) + ' / ' + Math.round(p.hpMax)],
      ['攻击加成', '+' + Math.round(((m.dmgMul || 1.2) - 1) * 100) + '%'],
      ['受伤减免', Math.round((m.shield || 0) * 100) + '%'],
      ['移动速度', '+' + Math.round(((m.moveMul || 1) - 1) * 100) + '%'],
      ['技能冷却', '-' + Math.round((1 - (m.skillCdMul || 1)) * 100) + '%'],
      ['气获取', '+' + Math.round(((m.meterGain || 1) - 1) * 100) + '%'],
    ];
    for (let i = 0; i < attrs.length; i++) {
      const ry = top + 58 + i * 25;
      txt(ctx, attrs[i][0], ax, ry, 13, 'rgba(170,200,184,0.85)', { align: 'left', weight: '700' });
      txt(ctx, attrs[i][1], ax + 306, ry, 13, '#eaf6e6', { align: 'right', weight: '800' });
    }

    txt(ctx, '战 绩', ax, top + 226, 16, '#ffd166', { align: 'left', weight: '900' });
    const upgLv = (RG.upg.hp || 0) + (RG.upg.atk || 0) + (RG.upg.def || 0) + (RG.upg.agi || 0) + (RG.upg.cd || 0);
    const feats = [
      ['到达关卡', 'ROOM ' + (RG.roomIndex + 1) + (RG.room ? ' · ' + RG.room.def.name : '')],
      ['击杀敌人', RG.kills + ' 只'],
      ['累计总伤害', Math.round(RG.totalDmg || 0) + ''],
      ['游戏时长', fmtTime(RG.runTime)],
      ['剩余废料', RG.scrap + ''],
      ['废料强化', upgLv + ' 级'],
    ];
    for (let i = 0; i < feats.length; i++) {
      const ry = top + 254 + i * 23;
      txt(ctx, feats[i][0], ax, ry, 13, 'rgba(170,200,184,0.85)', { align: 'left', weight: '700' });
      txt(ctx, String(feats[i][1]), ax + 306, ry, 13, '#eaf6e6', { align: 'right', weight: '800' });
    }

    /* ---- 中列：遗物 + 强化 ---- */
    const bx = x0 + 382;
    txt(ctx, '遗 物（' + RG.relics.length + ' 种）', bx, top + 28, 16, '#ffd166', { align: 'left', weight: '900' });
    if (!RG.relics.length) {
      txt(ctx, '无', bx + 8, top + 56, 12, 'rgba(160,190,172,0.6)', { align: 'left', weight: '700' });
    }
    for (let i = 0; i < RG.relics.length && i < 16; i++) {
      const r = RG.relics[i];
      const col = Math.floor(i / 8), row = i % 8;
      const rx = bx + col * 218;
      const ry = top + 54 + row * 22;
      RA.drawRelicIcon(ctx, r.icon, rx + 8, ry, 11, '#ffd166');
      txt(ctx, (r.name + ' Lv' + (r.level || 1)).slice(0, 12), rx + 20, ry, 12, '#ffe9a0', { align: 'left', weight: '800' });
    }

    txt(ctx, '关 卡 强 化（' + RG.buffs.length + ' 道）', bx, top + 232, 16, '#9dffc4', { align: 'left', weight: '900' });
    if (!RG.buffs.length) {
      txt(ctx, '无', bx + 8, top + 260, 12, 'rgba(160,190,172,0.6)', { align: 'left', weight: '700' });
    }
    for (let i = 0; i < RG.buffs.length && i < 10; i++) {
      const b = RG.buffs[i];
      const col = Math.floor(i / 5), row = i % 5;
      txt(ctx, ('· ' + b.name).slice(0, 13), bx + col * 218, top + 258 + row * 22, 12,
        'rgba(200,255,224,0.88)', { align: 'left', weight: '700' });
    }

    /* ---- 右列：道具使用 + 击败首领 ---- */
    const cx2 = x0 + 846;
    txt(ctx, '道 具 使 用', cx2, top + 28, 16, '#9ad8ff', { align: 'left', weight: '900' });
    const usedKeys = Object.keys(RG.itemsUsed || {}).filter(function (k) { return RG.itemsUsed[k] > 0; });
    if (!usedKeys.length) {
      txt(ctx, '未使用道具', cx2 + 8, top + 56, 12, 'rgba(160,190,172,0.6)', { align: 'left', weight: '700' });
    }
    let usedTotal = 0;
    for (let i = 0; i < usedKeys.length && i < 8; i++) {
      const k = usedKeys[i];
      const cnt = RG.itemsUsed[k];
      usedTotal += cnt;
      const nm = (D.ITEMS[k] && D.ITEMS[k].name) || k;
      txt(ctx, nm.slice(0, 10), cx2, top + 54 + i * 22, 12, 'rgba(220,235,240,0.88)', { align: 'left', weight: '700' });
      txt(ctx, '× ' + cnt, cx2 + 272, top + 54 + i * 22, 12, '#9ad8ff', { align: 'right', weight: '800' });
    }
    if (usedKeys.length) {
      txt(ctx, '合计 ' + usedTotal + ' 次', cx2 + 272, top + 28, 12,
        'rgba(150,200,225,0.8)', { align: 'right', weight: '800' });
    }

    txt(ctx, '击 败 首 领', cx2, top + 232, 16, '#ff9a8a', { align: 'left', weight: '900' });
    if (!RG.bossKills.length) {
      txt(ctx, '尚无首领战绩', cx2 + 8, top + 260, 12, 'rgba(210,170,160,0.6)', { align: 'left', weight: '700' });
    }
    for (let i = 0; i < RG.bossKills.length && i < 6; i++) {
      txt(ctx, ('✦ ' + RG.bossKills[i]).slice(0, 14), cx2, top + 258 + i * 22, 12,
        'rgba(255,210,190,0.9)', { align: 'left', weight: '800' });
    }
  }

  function button(ctx, x, y, w, h, label, action, primary) {
    panel(ctx, x, y, w, h, primary ? 'rgba(90,200,130,0.22)' : 'rgba(20,30,26,0.8)',
      primary ? 'rgba(140,255,190,0.85)' : 'rgba(120,160,140,0.45)', 10);
    txt(ctx, label, x + w / 2, y + h / 2, 18, primary ? '#d9ffe6' : 'rgba(210,230,218,0.85)', { weight: '800' });
    BVN.Game.hotspots.push({ x: x, y: y, w: w, h: h, action: action });
  }

  function drawDead(ctx) {
    ctx.fillStyle = 'rgba(18,3,3,0.86)';
    ctx.fillRect(0, 0, CFG.W, CFG.H);
    const a = Math.min(1, (RG.endT || 0) / 1.2);
    ctx.globalAlpha = a;
    txt(ctx, '阵 亡', 640, 86, 68, '#ff5f52', { glow: '#b5372f', blur: 34, stroke: '#1a0403', strokeW: 9 });
    txt(ctx, '下水道吞没了又一个挑战者 · 以下是本次爬塔的数据汇总', 640, 138, 16, 'rgba(230,190,180,0.9)', { weight: '700' });

    drawRunSummary(ctx, 160);

    button(ctx, 442, 580, 180, 48, 'R 重来', 'rogue:restart', true);
    button(ctx, 638, 580, 180, 48, 'Esc 返回标题', 'rogue:title', false);
    txt(ctx, '生命归零 · 本次爬塔结束', 640, 652, 13, 'rgba(200,160,150,0.7)', { weight: '700' });
    ctx.globalAlpha = 1;
  }

  function drawWin(ctx) {
    ctx.fillStyle = 'rgba(2,10,6,0.86)';
    ctx.fillRect(0, 0, CFG.W, CFG.H);
    const a = Math.min(1, (RG.endT || 0) / 1.2);
    ctx.globalAlpha = a;
    const grad = ctx.createLinearGradient(0, 60, 0, 240);
    grad.addColorStop(0, 'rgba(90,220,140,0.22)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 60, CFG.W, 200);

    const gaunt = RG.mode === 'gauntlet';
    txt(ctx, gaunt ? '连 战 全 通' : '净 化 完 成', 640, 84, 62, '#eaf6e6', { glow: '#59d98d', blur: 30, stroke: '#04100a', strokeW: 8 });
    txt(ctx, gaunt ? '痂香杀手鳄已被击倒 · 11 关首领连战全通' : '痂香下水道 · 痂香巨魔已被击倒', 640, 132, 18, '#ffd166', { weight: '800' });
    const next = D.LEVEL.next;
    txt(ctx, gaunt ? '连战战绩已计入数据汇总 · 以下是本次连战的数据' : ('解锁：' + next + ' · 以下是本次爬塔的数据汇总'),
      640, 156, 13, 'rgba(190,220,200,0.85)', { weight: '700' });

    drawRunSummary(ctx, 178);

    // ---- 排行榜提交区（用户名 + 通关时间） ----
    panel(ctx, 64, 592, 300, 48, 'rgba(6,16,12,0.94)',
      RG.nameFocus ? 'rgba(255,225,160,0.95)' : 'rgba(157,255,196,0.5)', 10);
    txt(ctx, RG.nameInput || '输入用户名…', 80, 616, 18,
      RG.nameInput ? '#ffe9b0' : 'rgba(180,200,190,0.55)',
      { align: 'left', weight: '800', stroke: '#04100a', strokeW: 3 });
    BVN.Game.hotspots.push({ x: 64, y: 592, w: 300, h: 48, action: 'rogue:editname' });

    const submitLabel = RG.scoreSubmitted ? '已 上 榜' : (RG.scoreBusy ? '提交中…' : '提交上榜');
    button(ctx, 376, 592, 150, 48, submitLabel, 'rogue:submit', !RG.scoreSubmitted && !RG.scoreBusy);
    button(ctx, 538, 592, 150, 48, 'L 排行榜', 'rogue:board', false);
    button(ctx, 700, 592, 150, 48, 'R 再爬一次', 'rogue:restart', false);
    button(ctx, 862, 592, 170, 48, 'Esc 返回标题', 'rogue:title', false);

    txt(ctx, '用时 ' + fmtLbTime(RG.runTime), 1216, 605, 15, '#ffd166', { align: 'right', weight: '900' });
    let status = '', statusColor = 'rgba(160,200,175,0.75)';
    if (RG.scoreSubmitted) {
      status = '已上榜 · 第 ' + (RG.scoreRank != null ? RG.scoreRank : '?') + ' 名';
      statusColor = '#9dffc4';
    } else if (RG.scoreBusy) {
      status = '正在提交成绩…';
      statusColor = 'rgba(255,225,160,0.9)';
    } else if (RG.scoreErr) {
      status = RG.scoreErr;
      statusColor = '#ff8a7a';
    } else {
      status = '输入用户名后提交';
    }
    txt(ctx, status, 1216, 628, 13, statusColor, { align: 'right', weight: '800' });
    txt(ctx, '第二层「发酵墓窖」正在腐熟中……', 640, 664, 13, 'rgba(150,190,165,0.7)', { weight: '700' });
    ctx.globalAlpha = 1;
  }

  /* 供绘制层使用的内部引用 */
  RG._ = {
    loadRoom: loadRoom,
    recalcMods: recalcMods,
    ballHitCheck: ballHitCheck,
    pickRandomItem: pickRandomItem,
    toast: toast,
    GROUND_Y: GROUND_Y,
    BASE_HP: BASE_HP,
    addRelic: addRelic,
    findRelic: findRelic,
    removeRelicCopy: removeRelicCopy,
    relicLevelOf: relicLevelOf,
    relicNeed: relicNeed,
    relicPool: relicPool,
    codexRows: codexRows,
    openGamble: openGamble,
    closeGamble: closeGamble,
    nearestGambler: nearestGambler,
    updateGamble: updateGamble,
    gamblePlay: gamblePlay,
    gambleOptions: gambleOptions,
    RELIC_MAX_LV: RELIC_MAX_LV,
    RELIC_SCALE: RELIC_SCALE,
    roomScale: roomScale,
    bossHpFor: bossHpFor,
    bossDmgFor: bossDmgFor,
    GAUNTLET_STAGES: GAUNTLET_STAGES,
    gauntletFamilies: gauntletFamilies,
    buildGauntletPlan: buildGauntletPlan,
    gauntletRoomDef: gauntletRoomDef,
    gauntletScrapFor: gauntletScrapFor,
    gauntletClear: gauntletClear,
    gauntletShopBuyRelic: gauntletShopBuyRelic,
    grantGauntletRelics: grantGauntletRelics,
    shopRelicList: shopRelicList,
    startNextGauntletStage: startNextGauntletStage,
    spawnMonster: spawnMonster,
    activateArea: activateArea,
    applyPoison: applyPoison,
    updatePoison: updatePoison,
    hitMonster: hitMonster,
    hurtPlayer: hurtPlayer,
    wrapText: wrapText,
    UPG_DEFS: UPG_DEFS,
    UPG_PER: UPG_PER,
    UPG_MAX_LV: UPG_MAX_LV,
    upgCost: upgCost,
    buyUpgrade: buyUpgrade,
    startUpgradeStage: startUpgradeStage,
    relicValueText: relicValueText,
    drawRunSummary: drawRunSummary,
    resolveMonsterType: resolveMonsterType,
    tryRevive: tryRevive,
    applyElements: applyElements,
    updateMonsterDots: updateMonsterDots,
    castExtraSkill: castExtraSkill,
    extraCdFor: extraCdFor,
    specialRelicText: specialRelicText,
    drawSuperCut: drawSuperCut,
    superPoseFor: superPoseFor,
  };

  BVN.Rogue = RG;
})(window.BVN);

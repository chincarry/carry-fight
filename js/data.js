/* js/data.js — 全局常量 / 角色数据表 / 招式帧数据（角色数据与战斗逻辑完全分离，新增角色只需加一条） */
window.BVN = window.BVN || {};

(function (BVN) {
  'use strict';

  /* ===================== 全局配置 ===================== */
  const CFG = {
    W: 1280,
    H: 720,
    STEP: 1 / 60,
    STAGE_W: 1680,
    GROUND_Y: 600,
    GRAVITY: 2300,
    MAX_HP: 1000,
    MAX_METER: 100,
    METER_REGEN: 8,
    ROUND_TIME: 99,
    ROUNDS_TO_WIN: 2,
    BODY_W: 60,
    BODY_H: 176,
    CROUCH_H: 116,
    WALK_SPEED: 268,
    BACK_SPEED: 214,
    JUMP_VY: -930,
    DASH_SPEED: 700,
    DASH_FRAMES: 15,
    DASH_COOLDOWN: 22,
    SKILL_CD: 60,
    HITSTOP_LIGHT: 2,
    HITSTOP_HEAVY: 4,
    COMBO_WINDOW: 1.2,
    PERFECT_GUARD_FRAMES: 6,
    FONT: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif',
  };

  BVN.CFG = CFG;

  /* ===================== 通用招式帧数据 =====================
     每个招式：total = 总帧数；windows = 判定框列表
     window 字段：
       s/e        生效起始/结束帧（含）
       dmg        伤害
       w/h        判定框宽高
       ox/oy      相对角色脚底原点的偏移（ox 沿朝向方向）
       hitstun    受击硬直帧
       kb         水平击退速度
       lift       上抛速度（>0 触发击飞）
       gain       命中回气
       sfx        音效名
       pierce     可穿透格挡比例（0~1）
       pull       把敌人拉向自己的速度
  ========================================================= */
  const ATTACKS = {
    light1: {
      name: '轻击',
      total: 17,
      windows: [{ s: 4, e: 7, dmg: 34, w: 78, h: 48, ox: 58, oy: -110, hitstun: 14, kb: 70, gain: 6, sfx: 'light' }],
      next: 'light2',
    },
    light2: {
      name: '轻击·二段',
      total: 17,
      windows: [{ s: 3, e: 6, dmg: 34, w: 80, h: 48, ox: 60, oy: -104, hitstun: 14, kb: 70, gain: 6, sfx: 'light' }],
      next: 'light3',
    },
    light3: {
      name: '轻击·终结',
      total: 32,
      windows: [{
        s: 6, e: 11, dmg: 58, w: 96, h: 58, ox: 66, oy: -104,
        hitstun: 20, kb: 230, lift: 330, gain: 9, sfx: 'heavy',
      }],
      next: null,
    },
    heavy: {
      name: '重击',
      total: 44,
      windows: [{
        s: 12, e: 17, dmg: 88, w: 104, h: 66, ox: 72, oy: -102,
        hitstun: 26, kb: 330, lift: 520, gain: 10, sfx: 'heavy',
      }],
      next: null,
    },
    airLight: {
      name: '空中轻击',
      total: 24,
      windows: [{ s: 4, e: 10, dmg: 46, w: 88, h: 74, ox: 56, oy: -74, hitstun: 18, kb: 130, gain: 6, sfx: 'light' }],
      next: null,
    },
    /* ---------- 上挑攻击：起跳上升阶段出手，带击飞，但起手 8 帧可被普攻打断 ----------
       判定框刻意做成一条「自脚下直撩到头顶」的竖直长条（reachGround）：
       角色起跳后脚底已经离地，若按普通相对坐标算，判定框会整体浮在空中，
       打不到站在地上的对手（天使起跳最高，最明显）。reachGround 会把判定框
       下沿补到地面，保证任何时候都能挑到地上的敌人。 */
    rise: {
      name: '上挑',
      total: 34,
      windows: [{
        s: 7, e: 16, dmg: 74, w: 104, h: 250, ox: 40, oy: -140,
        hitstun: 30, kb: 130, lift: 700, gain: 8, sfx: 'heavy',
        tilt: true,        // 对下落斩有最高优先权（见 game.js resolveHits 的两趟结算）
        reachGround: true, // 判定框下沿补到地面，解决「空中上挑打不到地面角色」
      }],
      next: null,
    },
    /* ---------- 下落攻击：空中按 ↓/S 立刻加速下砸，高伤大范围、不可防御，但会被上挑打飞 ---------- */
    dive: {
      name: '下落斩',
      total: 50,
      windows: [{
        s: 3, e: 44, dmg: 128, w: 176, h: 168, ox: 34, oy: -62,
        hitstun: 30, kb: 210, lift: 300, gain: 0, sfx: 'ko',
        unblockable: true,   // 格挡也吃满伤害
        armorBreak: 2,       // 可打穿 Lv1~Lv2 霸体，但打不穿拳击的 Lv3
      }],
      next: null,
    },
  };

  /* ===================== 霸体等级 =====================
     Lv0 无霸体（默认）→ 被打断、吃硬直
     Lv2 龙鳞霸体（恶龙必杀）
     Lv3 最高优先（拳击必杀）：任何招式的 armorBreak 都破不掉
     高一等级的霸体可以无视低一等级的对手出招，反过来则被压制。
  ========================================================= */
  BVN.ARMOR = { NONE: 0, DRAGON: 2, BOXER: 3, MAX: 3 };

  /* ===================== 技能 / 必杀 帧数据 ===================== */
  const SKILL_ATTACKS = {
    hannya: {
      skill: { total: 42, windows: [] },
      ult: { total: 180, windows: [], cutscene: 'hannya' },
    },
    angel: {
      skill: { total: 40, windows: [] },
      ult: { total: 110, windows: [{ s: 58, e: 66, dmg: 150, w: 120, h: 150, ox: 0, oy: -80, hitstun: 26, kb: 180, gain: 0, sfx: 'heavy' }] },
    },
    boxer: {
      skill: {
        total: 46,
        windows: [
          { s: 8, e: 11, dmg: 22, w: 66, h: 42, ox: 56, oy: -108, hitstun: 10, kb: 24, gain: 4, sfx: 'light' },
          { s: 13, e: 16, dmg: 22, w: 66, h: 42, ox: 56, oy: -108, hitstun: 10, kb: 24, gain: 4, sfx: 'light' },
          { s: 18, e: 21, dmg: 22, w: 66, h: 42, ox: 56, oy: -108, hitstun: 10, kb: 24, gain: 4, sfx: 'light' },
          { s: 23, e: 26, dmg: 22, w: 66, h: 42, ox: 56, oy: -108, hitstun: 10, kb: 24, gain: 4, sfx: 'light' },
          { s: 28, e: 34, dmg: 22, w: 76, h: 46, ox: 60, oy: -108, hitstun: 14, kb: 120, gain: 4, sfx: 'heavy' },
        ],
      },
      ult: {
        total: 76,
        windows: [{ s: 40, e: 48, dmg: 300, w: 150, h: 82, ox: 90, oy: -102, hitstun: 40, kb: 780, lift: 620, gain: 0, sfx: 'ko' }],
      },
    },
    dancer: {
      skill: {
        total: 58,
        windows: [
          { s: 10, e: 28, dmg: 35, w: 220, h: 140, ox: 60, oy: -92, hitstun: 16, kb: 40, gain: 4, sfx: 'slash', pull: 260 },
          { s: 32, e: 50, dmg: 35, w: 220, h: 140, ox: 60, oy: -92, hitstun: 16, kb: 150, gain: 4, sfx: 'slash' },
        ],
      },
      ult: { total: 130, windows: [] },
    },
    dragon: {
      skill: {
        total: 64,
        windows: [
          { s: 14, e: 17, dmg: 12, w: 220, h: 120, ox: 118, oy: -110, hitstun: 6, kb: 0, gain: 2, sfx: 'fire', pierce: 0.5 },
          { s: 20, e: 23, dmg: 12, w: 232, h: 124, ox: 124, oy: -110, hitstun: 6, kb: 0, gain: 2, sfx: 'fire', pierce: 0.5 },
          { s: 26, e: 29, dmg: 12, w: 244, h: 128, ox: 130, oy: -110, hitstun: 6, kb: 0, gain: 2, sfx: 'fire', pierce: 0.5 },
          { s: 32, e: 35, dmg: 12, w: 256, h: 132, ox: 136, oy: -110, hitstun: 6, kb: 0, gain: 2, sfx: 'fire', pierce: 0.5 },
          { s: 38, e: 41, dmg: 12, w: 268, h: 136, ox: 142, oy: -110, hitstun: 6, kb: 0, gain: 2, sfx: 'fire', pierce: 0.5 },
          { s: 44, e: 47, dmg: 12, w: 280, h: 140, ox: 148, oy: -110, hitstun: 6, kb: 0, gain: 2, sfx: 'fire', pierce: 0.5 },
          { s: 50, e: 53, dmg: 12, w: 292, h: 144, ox: 154, oy: -110, hitstun: 8, kb: 60, gain: 2, sfx: 'fire', pierce: 0.5 },
        ],
      },
      ult: { total: 120, windows: [] },
    },
    warlock: {
      skill: { total: 36, windows: [] },
      ult: { total: 110, windows: [] },
    },
    ranger: {
      skill: { total: 30, windows: [] },
      ult: { total: 100, windows: [] },
    },
    ronin: {
      skill: {
        total: 38,
        windows: [{ s: 12, e: 17, dmg: 110, w: 130, h: 120, ox: 40, oy: -96, hitstun: 24, kb: 230, gain: 8, sfx: 'slash' }],
      },
      ult: { total: 130, windows: [{ s: 64, e: 72, dmg: 320, w: 1400, h: 300, ox: 0, oy: -100, hitstun: 40, kb: 620, lift: 560, gain: 0, sfx: 'slash' }] },
    },
  };

  /* ===================== 八角色数据表 ===================== */
  const ROSTER = [
    {
      id: 'hannya',
      build: 'hannya',
      name: '般若陈锴瑞',
      title: '鬼面 · 狂骨',
      tag: '爆发 / 反击',
      img: 'assets/chars/hannya.jpg',
      // 立绘人脸锚点（归一化来源图坐标），用于 cover 裁切，见 Art.drawCover
      face: [0.3, 0.41, 1.3],
      palette: {
        main: '#8d9199', sub: '#33363d', accent: '#c0392b', trim: '#d9c07a',
        skin: '#c2c5cb', hair: '#1b1c21', outline: '#08080b', glow: '#ff3b30',
      },
      stats: { speed: 1.0, jump: 1.0, weight: 1.08 },
      skill: { name: '鬼火·业炎', cost: 25, cd: 1.4, desc: '向前喷吐 3 枚追踪红焰弹，每枚 45 伤。' },
      ultimate: { name: '百鬼夜行', cost: 100, desc: '全屏红闪，鬼影自地穿出连续 5 段冲击，总 260 伤。' },
      passive: { name: '狂骨', desc: '生命低于 30% 时，造成伤害 +25%。' },
    },
    {
      id: 'angel',
      build: 'angel',
      name: '天使陈锴瑞',
      title: '炽翼 · 天罚',
      tag: '均衡 / 续航',
      img: 'assets/chars/angel.jpg',
      face: [0.57, 0.18, 2.2],
      palette: {
        main: '#f4f6ff', sub: '#ffd98a', accent: '#ff9f45', trim: '#ffe9b0',
        skin: '#ffd9c0', hair: '#ffeaa8', outline: '#241c16', glow: '#ffd76e',
      },
      stats: { speed: 1.05, jump: 1.06, weight: 0.95 },
      skill: { name: '圣光十字', cost: 25, cd: 1.6, desc: '敌人头顶降下光柱（60 伤），自身回复 40 生命。' },
      ultimate: { name: '炽翼天罚', cost: 100, desc: '升空后俯冲撞击 150 伤，落地光羽爆散 170 伤并击飞（合计 320）。' },
      passive: { name: '二段跳', desc: '空中可再次跳跃（第二段带光羽）。' },
    },
    {
      id: 'boxer',
      build: 'boxer',
      name: '拳击陈锴瑞',
      title: '钢铁 · KO',
      tag: '速攻 / 连段',
      img: 'assets/chars/boxer.jpg',
      face: [0.5, 0.32, 1],
      palette: {
        main: '#d93a30', sub: '#1c2130', accent: '#f5c33b', trim: '#f0f2f6',
        skin: '#e8b08a', hair: '#141414', outline: '#0a0a0c', glow: '#ff8a3d',
      },
      stats: { speed: 1.12, jump: 1.0, weight: 1.0 },
      armor: 3,   // 霸体最高优先：下落攻击的 armorBreak 也破不掉
      skill: { name: '连环拳风暴', cost: 25, cd: 1.2, desc: '突进 + 5 段快速刺拳（每段 22，硬直极短）。' },
      ultimate: { name: 'KO 铁拳', cost: 100, desc: '蓄力 0.6 秒全程最高级霸体（Lv3，不可被打断），单发重拳 300 伤 + 大击退。' },
      passive: { name: '钢铁节奏', desc: '轻击出手最快，每次命中额外 +3 气。' },
    },
    {
      id: 'dancer',
      build: 'dancer',
      name: '舞女陈锴瑞',
      title: '飞天 · 旋舞',
      tag: '控场 / 拉扯',
      img: 'assets/chars/dancer.jpg',
      face: [0.52, 0.17, 3],
      palette: {
        main: '#37d6c6', sub: '#f0743c', accent: '#e83f6f', trim: '#ffe9a8',
        skin: '#f3c9a6', hair: '#2b1a30', outline: '#1a0f1e', glow: '#7ef9ff',
      },
      stats: { speed: 1.08, jump: 1.08, weight: 0.92 },
      skill: { name: '飘带旋舞', cost: 25, cd: 1.5, desc: '原地旋转，彩带 2 段范围攻击（各 35 伤）并拉扯敌人。' },
      ultimate: { name: '天女散花', cost: 100, desc: '沙漠幻境中 8 条丝带自天而降依次打击（每条 35）。' },
      passive: { name: '凌波微步', desc: '冲刺无敌帧翻倍。' },
    },
    {
      id: 'dragon',
      build: 'dragon',
      name: '恶龙陈锴瑞',
      title: '腐火 · 亡灵',
      tag: '持续 / 消耗',
      img: 'assets/chars/dragon.jpg',
      face: [0.5, 0.17, 2.6],
      palette: {
        main: '#2f7d4f', sub: '#12351f', accent: '#8ef26a', trim: '#d8f4c0',
        skin: '#4b8f61', hair: '#0d2418', outline: '#06130c', glow: '#8dff6a',
      },
      stats: { speed: 0.94, jump: 0.96, weight: 1.16 },
      armor: 2,   // 龙鳞霸体：低于拳击的 Lv3，且会被下落攻击打穿
      skill: { name: '腐绿龙息', cost: 25, cd: 1.8, desc: '锥形持续喷焰 0.8 秒，穿透 50% 格挡。' },
      ultimate: { name: '亡灵龙吼', cost: 100, desc: '召唤 4 只骷髅冲锋（各 40）+ 地裂绿火爆发（140）+ 1.2 秒火海灼烧，合计约 340。施法全程 Lv2 霸体。' },
      passive: { name: '龙鳞蓄能', desc: '受伤时 30% 伤害转化为气。' },
    },
    {
      id: 'warlock',
      build: 'warlock',
      name: '术士陈锴瑞',
      title: '深渊 · 五芒',
      tag: '预判 / 爆发',
      img: 'assets/chars/warlock.jpg',
      face: [0.55, 0.19, 2.4],
      palette: {
        main: '#241a33', sub: '#7b3fd4', accent: '#b06bff', trim: '#e0c8ff',
        skin: '#dcbfae', hair: '#191022', outline: '#0a0610', glow: '#a05cff',
      },
      stats: { speed: 0.98, jump: 1.0, weight: 1.02 },
      skill: { name: '五芒诅咒', cost: 25, cd: 1.3, desc: '敌人脚下布阵，1 秒后爆发 90 伤（可走位躲开，最多 2 个）。' },
      ultimate: { name: '暗黑陨石', cost: 100, desc: '天降 3 颗陨石（各 110，合计 330），落点炸开冲击波并在原地留下 1.5 秒余烬。' },
      passive: { name: '深渊回响', desc: '气自然回复速度 +50%。' },
    },
    {
      id: 'ranger',
      build: 'ranger',
      name: '游侠陈锴瑞',
      title: '穿云 · 箭雨',
      tag: '远程 / 风筝',
      img: 'assets/chars/ranger.jpg',
      face: [0.38, 0.41, 1.8],
      palette: {
        main: '#5fb0d8', sub: '#2f4b5c', accent: '#c9a24a', trim: '#dfeaf2',
        skin: '#e5b58f', hair: '#3a2a1c', outline: '#111a20', glow: '#9fe6ff',
      },
      stats: { speed: 1.04, jump: 1.04, weight: 0.96 },
      skill: { name: '穿云箭', cost: 25, cd: 1.0, desc: '高速箭矢 70 伤，空中可用，可连发 2 发。' },
      ultimate: { name: '箭雨风暴', cost: 100, desc: '向天射出 12 支箭，覆盖敌方半场（每支 30）。' },
      passive: { name: '鹰眼', desc: '距离 > 500 时造成伤害 +15%。' },
    },
    {
      id: 'ronin',
      build: 'ronin',
      name: '浪人陈锴瑞',
      title: '居合 · 无明',
      tag: '机动 / 斩杀',
      img: 'assets/chars/ronin.jpg',
      face: [0.46, 0.25, 2],
      palette: {
        main: '#1d1d24', sub: '#4a4a55', accent: '#b6342c', trim: '#8d8d99',
        skin: '#e0b48f', hair: '#12121a', outline: '#08080b', glow: '#ffe9c0',
      },
      stats: { speed: 1.06, jump: 1.02, weight: 0.98 },
      skill: { name: '居合·瞬闪', cost: 25, cd: 1.4, desc: '瞬移 260px 穿过敌人并斩击 110 伤，穿透时无敌。' },
      ultimate: { name: '无明一刀', cost: 100, desc: '时间凝滞 0.5 秒后全屏横斩 320 伤并击飞。' },
      passive: { name: '心眼', desc: '完美格挡额外回气并获得 20 帧无敌。' },
    },
  ];

  /* ===================== 援助角色（每人限选 1 名，一整场 3 次） =====================
     effect 由 js/assist.js 解释：
       freeze   冻结对手帧数          heal     给自己回血
       dmg      命中伤害              kb/lift  击退与上抛
       times    段数                  pull     把对手拉向自己
     =============================================================== */
  const ASSISTS = [
    {
      id: 'detective',
      build: 'detective',
      name: '侦探于沛頎',
      short: '侦探',
      title: '雨雾 · 秒表',
      tag: '控场',
      img: 'assets/assists/detective.jpg',
      face: [0.5, 0.17, 1.5],
      color: '#c9a24a',
      palette: {
        main: '#5a3620', sub: '#2b1a12', accent: '#c9a24a', trim: '#e8d4a0',
        skin: '#e9c3a2', hair: '#1b1410', outline: '#0d0908', glow: '#ffd27a',
      },
      move: '秒表 · 时停',
      desc: '甩开怀表锁住时间：对手定格 45 帧（0.75 秒），并受 50 伤。',
      effect: { freeze: 45, dmg: 50, hitstun: 12, kb: 0 },
    },
    {
      id: 'immortal',
      build: 'immortal',
      name: '仙人杨子一',
      short: '仙人',
      title: '云海 · 青蝶',
      tag: '续航',
      img: 'assets/assists/immortal.jpg',
      face: [0.33, 0.23, 1.55],
      color: '#7ef2c0',
      palette: {
        main: '#1b3a6b', sub: '#0d1f3c', accent: '#7ef2c0', trim: '#e3d9a8',
        skin: '#efc9a6', hair: '#141018', outline: '#080a14', glow: '#8dffcf',
      },
      move: '青蝶 · 回春',
      desc: '召来青蝶为你回 200 生命与 20 气，蝶影同时撞伤对手 45。',
      effect: { heal: 200, meter: 20, dmg: 45, hitstun: 16, kb: 90 },
    },
    {
      id: 'yakuza',
      build: 'yakuza',
      name: '黑道孙啸晨',
      short: '黑道',
      title: '红厅 · 清算',
      tag: '爆发',
      img: 'assets/assists/yakuza.jpg',
      face: [0.42, 0.26, 1.75],
      color: '#ff5a4a',
      palette: {
        main: '#1b1c22', sub: '#0d0d12', accent: '#b5232c', trim: '#d8c8a0',
        skin: '#e4bb9a', hair: '#100e12', outline: '#050508', glow: '#ff6a5a',
      },
      move: '黑道 · 清算',
      desc: '三连重击（各 52，合计 156），最后一击把对手打翻。',
      effect: { dmg: 52, times: 3, hitstun: 16, kb: 120, lift: 260 },
    },
    {
      id: 'muscle',
      build: 'muscle',
      name: '肌霸郭亚祥',
      short: '肌霸',
      title: '钢铁 · 冲击',
      tag: '破甲',
      img: 'assets/assists/muscle.jpg',
      face: [0.47, 0.17, 1.6],
      color: '#ffa53d',
      palette: {
        main: '#c8763a', sub: '#8a4a22', accent: '#ffa53d', trim: '#f0e2c8',
        skin: '#d99a68', hair: '#12100e', outline: '#0c0806', glow: '#ffb347',
      },
      move: '钢铁 · 冲撞',
      desc: '肩撞单发 120 伤，破 Lv2 霸体并大击退，是拆招利器。',
      effect: { dmg: 120, hitstun: 30, kb: 520, lift: 420, armorBreak: 2, unblockable: true },
    },
    {
      id: 'explorer',
      build: 'explorer',
      name: '探险肖牧辰',
      short: '探险',
      title: '雨林 · 索钩',
      tag: '起手',
      img: 'assets/assists/explorer.jpg',
      face: [0.45, 0.28, 1.6],
      color: '#9fd45a',
      palette: {
        main: '#8b8a5a', sub: '#4c4b2c', accent: '#9fd45a', trim: '#e8e2c0',
        skin: '#d9a97c', hair: '#141018', outline: '#0a0a08', glow: '#c6ff7a',
      },
      move: '索钩 · 拖拽',
      desc: '绳索套住对手拽到你面前（80 伤），直接接上连段。',
      effect: { dmg: 80, hitstun: 34, kb: 60, pull: true },
    },
    {
      id: 'mage',
      build: 'mage',
      name: '法师陆景西',
      short: '法师',
      title: '星辉 · 陨落',
      tag: '轰击',
      img: 'assets/assists/mage.jpg',
      face: [0.31, 0.38, 1.5],
      color: '#b06bff',
      palette: {
        main: '#2b2a6b', sub: '#161540', accent: '#b06bff', trim: '#e0d8ff',
        skin: '#e8c3a8', hair: '#141018', outline: '#08061a', glow: '#c9a2ff',
      },
      move: '星陨术',
      desc: '在对手头顶落下星辰（170 伤），无视格挡。',
      effect: { dmg: 170, hitstun: 34, kb: 260, lift: 380, unblockable: true },
    },
  ];

  /* ===================== 场景主题 ===================== */
  // 天空亮度决定整屏观感：过暗会让整个画面糊成一块死色。
  // 三档渐变刻意拉开（顶深 → 中带 → 地平线亮），保证分层能被眼睛读出来。
  const THEMES = {
    shrine: {
      id: 'shrine',
      name: '神社雨夜',
      sky: ['#101932', '#1d2a4e', '#35446f'],
      fog: 'rgba(120,150,225,0.09)',
      ground: '#1a2233',
      groundLine: '#4a6394',
      lamp: '#ffd27a',
      particle: 'rain',
    },
    inferno: {
      id: 'inferno',
      name: '冥火战场',
      sky: ['#280c0e', '#451512', '#6d2a13'],
      fog: 'rgba(255,110,50,0.10)',
      ground: '#25130f',
      groundLine: '#c2491a',
      lamp: '#7dff8a',
      particle: 'ember',
    },
  };

  /* ===================== 键位映射 ===================== */
  const KEYS = {
    p1: {
      left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'],
      light: ['KeyJ'], heavy: ['KeyK'], skill: ['KeyL'], ult: ['KeyU'],
      assist: ['KeyE'],
      dash: ['ShiftLeft', 'ShiftRight'],
    },
    p2: {
      left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'],
      light: ['Digit1', 'Numpad1'], heavy: ['Digit2', 'Numpad2'],
      skill: ['Digit3', 'Numpad3'], ult: ['Digit4', 'Numpad4'],
      assist: ['Digit5', 'Numpad5'],
      dash: ['Digit0', 'Numpad0'],
    },
  };

  /* ===================== 姿态默认值（供 fighter / art 共用） ===================== */
  const POSE_DEFAULT = {
    t: 0.05, h: -0.04,
    afu: 0.55, aff: 0.78,
    abu: -0.34, abf: 0.52,
    lft: 0.2, lfs: -0.16,
    lbt: -0.2, lbs: -0.1,
    c: 6, rot: 0, hipx: 0,
  };

  BVN.ATTACKS = ATTACKS;
  BVN.SKILL_ATTACKS = SKILL_ATTACKS;
  BVN.ROSTER = ROSTER;
  BVN.ASSISTS = ASSISTS;
  BVN.ASSIST_USES = 3;      // 一整场（三小局）只能用 3 次
  BVN.ASSIST_CD = 75;       // 两次召唤之间的最短间隔（帧），防止一口气三连
  BVN.THEMES = THEMES;
  BVN.KEYS = KEYS;
  BVN.POSE_DEFAULT = POSE_DEFAULT;
  BVN.CHAR_BY_ID = ROSTER.reduce(function (acc, c) { acc[c.id] = c; return acc; }, {});
  BVN.ASSIST_BY_ID = ASSISTS.reduce(function (acc, c) { acc[c.id] = c; return acc; }, {});
})(window.BVN);

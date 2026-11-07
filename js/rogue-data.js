/* js/rogue-data.js — 爬塔肉鸽模式·第一关「痂香下水道」数据层
 *
 * 设计契约（本文件是肉鸽模式的唯一数据源，逻辑层 rogue.js 只解释执行）：
 *   风格      : 阴暗潮湿下水道 + 霓虹毒绿，粗描边卡通怪物（骨骼动画由 rogue-rig.js 绘制）
 *   主色      : 污绿 #6f9b63 / 痂红 #b5372f / 尿黄 #ffd23f / 污水青 #2f4a44
 *   画布      : 1280×720 视窗；每关为 5 倍横向长廊（宽 28700~32700）+ 关底迷你 BOSS 竞技场
 *   操作      : A/D 移动 · W 跳 · J 轻击 · K 重击 · L 远程 · I 技能 · U 格斗技 · Y 必杀
 *              · Q 道具 · Shift 冲刺 · E 交互 · G 遗物栏
 *   结构      : 5 个房间（4 普通 + 1 BOSS），自左向右推进；清怪后闸门开在右侧
 *   奖励      : 每关结束 → 遗物三选一（装备）→ 角色强化三选一（BUFF）→ 下一关；宝箱也能开出遗物
 *   遗物      : 可重复获得并自动合成，2/4/8/16 件 → Lv2/3/4/5；Lv5 满级后不再出现
 *   NPC       : 情赌徒（每关一名）—— 石头剪刀布赌生命/废料/遗物/道具，赢则双倍返还；兼售道具与遗物
 *   关底      : R1 百足蜈蚣 / R2 沼气鱼人王 / R3 水母母体 / R4 巨人之脚 / R5 下水道鳄鱼（再战痂香巨魔）
 *   数值口径  : 玩家 300 血；小怪 30~160（精英 ×2.6 血、×1.6 伤、体型 1.32×）；迷你 BOSS 620~880；BOSS 1280
 */
window.BVN = window.BVN || {};

(function (BVN) {
  'use strict';

  const R = {};

  /* ===================== 角色 Roguelike 特性 ===================== */
  R.CHARS = {
    hannya: { perk: '狂骨', desc: '生命低于 30% 时伤害 +25%', mods: { lowHpDmg: 0.25 } },
    angel: { perk: '无限连跳', desc: '空中可以无限次跳跃', mods: { infiniteJump: true } },
    boxer: { perk: '钢铁连打', desc: '轻击出手更快，三段连击伤害 +12%', mods: { atkSpeed: 0.18, comboBoost: 0.12 } },
    dancer: { perk: '碎步', desc: '移动 +12%，冲刺冷却 -40%', mods: { moveMul: 0.12, dashCd: 0.4 } },
    dragon: { perk: '龙鳞', desc: '最大生命 +100', mods: { maxHp: 100 } },
    warlock: { perk: '蚀魂', desc: '击杀敌人回复 12 生命', mods: { lifesteal: 12 } },
    ranger: { perk: '长弓', desc: '远程伤害 +25%，攻击距离 +30%', mods: { reach: 0.3, rangedDmg: 0.25 } },
    ronin: { perk: '居合', desc: '重击伤害 +25%，重击击退更强', mods: { heavyMul: 0.25 } },
  };

  /* ===================== 近战（每个角色一套手感） =====================
     light/heavy 为基础伤害；reach 为攻击距离倍率；arc 为横扫弧度；color 为刀光颜色
     hits 为一次轻击的段数（拳击类可多段） */
  R.MELEE = {
    hannya: { light: 16, heavy: 38, reach: 1.45, arc: 1.5, color: '#ff6a4a', hits: 1 },
    angel: { light: 13, heavy: 30, reach: 1.60, arc: 1.8, color: '#ffe9a0', hits: 1 },
    boxer: { light: 10, heavy: 32, reach: 1.25, arc: 1.1, color: '#8fe0ff', hits: 2 },
    dancer: { light: 14, heavy: 29, reach: 1.70, arc: 2.1, color: '#e0a0ff', hits: 1 },
    dragon: { light: 15, heavy: 42, reach: 1.30, arc: 1.3, color: '#ffb45a', hits: 1 },
    warlock: { light: 13, heavy: 31, reach: 1.50, arc: 1.6, color: '#b06aff', hits: 1 },
    ranger: { light: 12, heavy: 34, reach: 1.75, arc: 1.9, color: '#9be0b0', hits: 1 },
    ronin: { light: 17, heavy: 46, reach: 1.60, arc: 1.7, color: '#ffd166', hits: 1 },
  };

  /* ===================== 远程（每个角色一发，形状/弹道不同） =====================
     speed 像素/秒；count 连发数；spread 扇形弧度；pierce 可穿透敌人数；
     homing 追踪；explode 命中爆炸半径；lifesteal 命中回血 */
  R.RANGED = {
    hannya: { name: '鬼火弹', dmg: 22, speed: 520, count: 1, spread: 0, color: '#ff6a4a', r: 16, pierce: 2, life: 2.4, cd: 0.55, homing: false, explode: 0, lifesteal: 0 },
    angel: { name: '光羽', dmg: 12, speed: 640, count: 3, spread: 0.22, color: '#ffe9a0', r: 10, pierce: 0, life: 1.8, cd: 0.5, homing: false, explode: 0, lifesteal: 0 },
    boxer: { name: '音速拳风', dmg: 15, speed: 780, count: 1, spread: 0, color: '#8fe0ff', r: 14, pierce: 1, life: 0.85, cd: 0.3, homing: false, explode: 0, lifesteal: 0 },
    dancer: { name: '回旋飞扇', dmg: 16, speed: 520, count: 2, spread: 0.3, color: '#e0a0ff', r: 14, pierce: 1, life: 2.1, cd: 0.5, homing: false, explode: 0, lifesteal: 0 },
    dragon: { name: '龙息球', dmg: 34, speed: 430, count: 1, spread: 0, color: '#ffb45a', r: 22, pierce: 1, life: 1.65, cd: 0.75, homing: false, explode: 70, lifesteal: 0 },
    warlock: { name: '蚀魂弹', dmg: 18, speed: 480, count: 1, spread: 0, color: '#b06aff', r: 16, pierce: 0, life: 2.8, cd: 0.5, homing: true, explode: 0, lifesteal: 5 },
    ranger: { name: '贯日箭', dmg: 42, speed: 900, count: 1, spread: 0, color: '#9be0b0', r: 12, pierce: 99, life: 3.0, cd: 0.9, homing: false, explode: 0, lifesteal: 0 },
    ronin: { name: '袖中飞刀', dmg: 22, speed: 820, count: 1, spread: 0, color: '#ffd166', r: 10, pierce: 2, life: 1.8, cd: 0.4, homing: false, explode: 0, lifesteal: 0 },
  };

  /* ===================== 技能（I 键，带冷却） =====================
     type:
       burst  环身爆发 / sky 升空回复 / rapid 连续多段 / blink 瞬移斩
       armor  护体减伤 / drain 吸取周围生命 / shot 贯穿巨弹 / draw 居合一闪
  */
  R.SKILLS = {
    hannya: {
      name: '狂骨·鬼哭斩', cd: 9, color: '#ff6a4a', type: 'burst',
      dmg: 110, radius: 230, buff: { dmgMul: 0.45, t: 3.5 },
      desc: '环身爆发鬼气斩，并进入 3.5 秒狂骨状态（伤害 +45%）',
    },
    angel: {
      name: '炽翼·升天', cd: 11, color: '#ffe9a0', type: 'sky',
      dmg: 70, radius: 210, heal: 0.18,
      desc: '展翼升空，回复 18% 生命，落地时震荡周围敌人',
    },
    boxer: {
      name: '钢铁连打', cd: 8, color: '#8fe0ff', type: 'rapid',
      dmg: 14, hits: 9, reach: 130,
      desc: '向前方倾泻 9 连重拳，可边打边推进',
    },
    dancer: {
      name: '碎步·幻影', cd: 7, color: '#e0a0ff', type: 'blink',
      dmg: 75, dist: 340, invuln: 0.85,
      desc: '瞬移穿过敌群，残影在原地炸裂，期间无敌',
    },
    dragon: {
      name: '龙鳞·震雷', cd: 12, color: '#ffb45a', type: 'armor',
      dmg: 85, radius: 240, shield: 0.6, t: 5,
      desc: '龙鳞覆体 5 秒减伤 60%，并释放一圈雷震',
    },
    warlock: {
      name: '蚀魂·吮命', cd: 10, color: '#b06aff', type: 'drain',
      dmg: 80, radius: 280, healRatio: 0.6,
      desc: '抽取周围敌人的生命，伤害的 60% 转化为治疗',
    },
    ranger: {
      name: '长弓·贯日', cd: 9, color: '#9be0b0', type: 'shot',
      dmg: 150, speed: 900, pierce: 99, size: 26,
      desc: '射出贯穿全场的大箭，命中越多伤害越高',
    },
    ronin: {
      name: '居合·一闪', cd: 10, color: '#ffd166', type: 'draw',
      dmg: 190, reach: 430,
      desc: '向前一闪拔刀，超长距离的单体高伤斩击',
    },
  };

  /* ===================== 怪物数据 =====================
     各族差异（攻击 / 防御模式）：
       fartling  屁怪     : 慢、肉；喷滞留毒屁云；受击不易击退；背后受击 +30%
       poopling  粪精     : 连续弹跳踩踏；死亡分裂成 2 只小粪精；轻、易击飞
       gasfish   沼气鱼人 : 远程吸气 → 三连沼气弹；近身会后撤闪避；近战受伤 +20%
       centipede 大粪蜈蚣 : 贴地突进；头部装甲减伤 40%，尾段脆弱 +35%；抬头撕咬
       urinewisp 尿灵     : 高速浮空俯冲；抛物线尿弹留酸池；受击后短暂液化无敌并后跳
       jellyfish 污垢水母 : 高空悬浮；垂降触手毒区 + 电场脉冲；只有发光核心是弱点
       troll     痂香巨魔 : BOSS 三阶段，七种攻击，攻击带霸体，背部痂壳 +30% 伤害
   */
  R.MONSTERS = {
    fartling: {
      name: '屁怪', hp: 96, w: 84, h: 92, kind: 'ground', speed: 54, touch: 10,
      colors: { body: '#5f9a78', dark: '#33593f', belly: '#c8cd7c', horn: '#d6bd7d', outline: '#13211a', eye: '#ff4b3e' },
      desc: '肚囊里全是沼气的胖子，会喷出滞留毒雾，背对它会吃更多伤害。',
      moves: [
        '沼气喷吐：鼓起肚囊蓄气 0.55 秒，向前喷出毒气云（4.2 秒，减速 40%）',
        '扑身撞击：贴身时向前顶撞',
        '跳跃追击：玩家在高处时起跳扑近',
      ],
    },
    poopling: {
      name: '粪精', hp: 40, w: 52, h: 52, kind: 'ground', speed: 0, touch: 11,
      colors: { body: '#a9611f', light: '#d58a3c', dark: '#6f3a10', outline: '#241206', eye: '#ffffff' },
      desc: '弹跳的小粪团，被杀死时会分裂。',
      moves: [
        '弹跳踩踏：弹起 620 高度扑向玩家，落地后再次起跳',
        '死亡裂解：被击杀时分裂成 2 只小粪精',
      ],
    },
    gasfish: {
      name: '沼气鱼人', hp: 66, w: 78, h: 82, kind: 'ground', speed: 42, touch: 9,
      colors: { body: '#5d7a5f', dark: '#33463a', belly: '#c9c487', fin: '#2f4a3d', outline: '#111c16', eye: '#ffd34f' },
      desc: '下水道鱼人，吸气后喷出三连沼气弹，被贴脸时会护鳍后撤。',
      moves: [
        '沼气三连：吸气蓄力 0.95 秒，向前扇形吐出 3 枚沼气弹',
        '护鳍后撤：玩家贴脸时向后急退',
        '跳跃换位：玩家在高处时短跳调整位置',
      ],
    },
    centipede: {
      name: '大粪蜈蚣', hp: 160, w: 108, h: 58, kind: 'ground', speed: 76, touch: 12,
      colors: { body: '#d58a2b', dark: '#a25a12', light: '#eda24a', outline: '#2a1505', eye: '#ffffff' },
      desc: '节肢装甲的长虫，头壳减伤，尾段脆弱。',
      moves: [
        '昂头突刺：昂头蓄势 0.3 秒，随后以 640 速度贴地冲咬（15 伤）',
        '甲壳减伤：头壳减伤 40%，尾段受击 +35%',
        '跳跃追击：玩家在高处时起跳扑近',
      ],
    },
    urinewisp: {
      name: '尿灵', hp: 10, w: 62, h: 68, kind: 'fly', speed: 0, touch: 10,
      colors: { body: '#ffd23f', light: '#ffe98a', dark: '#c89000', outline: '#5b3d00', eye: '#241a00' },
      desc: '只会悬停漂移的尿黄色液灵，每隔两秒吐一枚抛物线尿弹，不再俯冲。',
      moves: [
        '吐尿弹：每 2.2 秒向玩家抛出一枚抛物线尿弹，落地留下酸池',
        '液灵漂移：悬停左右漂移，不再俯冲',
      ],
    },
    jellyfish: {
      name: '污垢水母', hp: 10, w: 86, h: 84, kind: 'fly', speed: 0, touch: 10,
      colors: { body: '#cfe3d6', light: '#eef7ef', dark: '#5c7a6c', outline: '#1b2a23', core: '#3ff0d0' },
      desc: '垂落触手毒区的浮空水母，只有核心可造成全额伤害。',
      moves: [
        '触手垂落：蓄力 1.2 秒，在玩家脚下垂落触手毒区（4.5 秒，减速 50%）',
        '电场脉冲：垂落瞬间若玩家在 180 内，释放环形电击',
        '核心弱点：只有发光核心受到全额伤害',
      ],
    },

    /* ===== 亚种怪物：随关卡推进出现 ===== */
    centipedeToilet: {
      name: '马桶蜈蚣', hp: 260, w: 118, h: 64, kind: 'ground', baseType: 'centipede', speed: 66, touch: 16,
      armor: 0.5,
      colors: { body: '#a6bfcc', dark: '#5c7686', light: '#e4f1f6', outline: '#0c1720', eye: '#8fffe6' },
      desc: '寄生在马桶瓷壳里的变异蜈蚣，甲壳减伤 50%，移动更慢但撞击更重。',
      moves: [
        '瓷壳突刺：继承昂头突刺，冲速稍慢但撞击更重（接触 16 伤）',
        '瓷甲硬壳：全身甲壳减伤 50%，格挡更硬',
        '跳跃追击：玩家在高处时起跳扑近',
      ],
    },
    jellyDemon: {
      name: '魔化水母', hp: 16, w: 96, h: 92, kind: 'fly', baseType: 'jellyfish', speed: 0, touch: 12,
      atkRate: 2.2, poison: true,
      colors: { body: '#b06fd6', light: '#e8b6ff', dark: '#5a2f74', outline: '#180722', core: '#ff5fd0', eye: '#5cffb0' },
      desc: '被沼气魔化的水母，脉冲频率加倍，触手带毒，命中后持续掉血。',
      moves: [
        '魔化触手：蓄力频率 ×2.2，触手毒区命中后持续掉血',
        '毒电场脉冲：电击附带毒性，持续伤害更高',
        '核心弱点：只有发光核心受到全额伤害',
      ],
    },
    troll: {
      name: '痂香巨魔', hp: 1600, w: 260, h: 340, kind: 'boss', speed: 0, touch: 22,
      colors: {
        body: '#b5372f', light: '#d8584a', dark: '#7a1f1a', scab: '#e0b08a',
        spike: '#e6c39a', outline: '#210b09', eye: '#ffd34f',
      },
      desc: '痂香下水道的关底巨魔，体型巨大，三阶段共七种攻击方式。',
      phases: [0.66, 0.33],
      moves: [
        '裂爪：蓄力 0.52 秒后向前爪击（22 伤）',
        '痂壳冲撞：700（三阶段 820）速度冲撞（26 伤），撞墙硬直 1.5 秒',
        '砸地：双拳砸地，向左右甩出冲击波（16 伤）',
        '横扫：300 宽横扫 + 680 速度冲击波（16 伤）',
        '痂皮喷发：二阶段，三处预警地刺（20 持续伤）',
        '痂壳碾压：二/三阶段，跃起砸向玩家（30 伤）+ 双向震波',
        '痂香毒瘴：三阶段，全屏毒气 5.2 秒，需躲进通风口',
        '阶段切换：66% / 33% 血量时提速，撞墙会硬直',
      ],
    },

    /* ===== 五关关底迷你 BOSS ===== */
    centipedeKing: {
      name: '百足蜈蚣', hp: 900, w: 330, h: 150, kind: 'miniboss', speed: 0, touch: 20,
      colors: { body: '#d98b2c', dark: '#8a4d10', light: '#f0b054', outline: '#2a1204', eye: '#fff36a' },
      desc: '盘踞在锈蚀进水口的巨型蜈蚣，会贴地冲锋、尾扫与喷毒。',
      mb: ['charge', 'sweep', 'poison'],
      moves: [
        '贴地冲锋：预警 0.7 秒后以 660（二阶段 820）速度冲撞，撞墙硬直 1.5 秒',
        '巨尾横扫：380 宽尾扫 + 地面冲击波',
        '毒雾喷吐：抛出 3 枚抛物线毒弹',
        '二阶段：血量 50% 以下移动与出招更快',
      ],
    },
    gasfishKing: {
      name: '沼气鱼人王', hp: 1980, w: 260, h: 220, kind: 'miniboss', speed: 0, touch: 18,
      colors: { body: '#5d8a66', dark: '#2f4a37', light: '#cfc27a', outline: '#0f1c15', eye: '#ffd34f', crown: '#ffd166' },
      desc: '沉淀池的鱼人首领，戴王冠，能扇射沼气弹并召唤大量鱼人。',
      mb: ['fan', 'slam', 'summon'],
      moves: [
        '沼气扇射：向前方扇形连吐 5 枚沼气弹',
        '重砸：砸地掀起双向震波（可跳跃躲避）',
        '召集群鱼：一次性召唤 6 只沼气鱼人助战',
        '二阶段：血量 50% 以下提速',
      ],
    },
    jellyMother: {
      name: '水母母体', hp: 760, w: 260, h: 260, kind: 'miniboss', fly: true, speed: 0, touch: 16,
      colors: { body: '#cfe8de', light: '#f4fffb', dark: '#5c8a7c', outline: '#14302a', core: '#56ffe0', eye: '#ff8fd0' },
      desc: '沼气泵房上空的母体水母，开局笼罩护盾，必须先破坏地面四根触须才能攻击本体。',
      mb: ['tentacle', 'spike', 'drop', 'pulse', 'spawn'],
      moves: [
        '触须护盾：地面四根水母触须全部破坏前，母体免疫一切伤害',
        '触手拍击：长触手横扫身前地面（24 伤），触须全部破坏后不再使用',
        '地底刺击：玩家脚下连续钻出 3 根小触手，每根 16 伤并挑飞',
        '触手垂落：蓄力 0.85 秒，在玩家脚下铺触手毒区',
        '电环脉冲：蓄力 0.9 秒后释放 420 宽电环，全屏闪光',
        '孵化幼体：召唤 2 只粪精幼体',
        '悬空漂浮：空中上下漂浮，玩家靠近时后退',
      ],
    },
    giantFoot: {
      name: '巨人之脚', hp: 4000, w: 260, h: 320, kind: 'miniboss', speed: 0, touch: 24,
      colors: { body: '#c05a45', dark: '#7d2f22', light: '#e2a07a', outline: '#240a06', eye: '#ffe066', nail: '#e8d6b0' },
      desc: '腐臭回廊里仍在行走的巨人残足，踏地会掀起双向震波。',
      mb: ['stomp', 'kick', 'leap'],
      moves: [
        '踏地震波：踏地掀起左右双向震波',
        '巨足踢击：向前方 280 宽范围猛踢（24 伤）',
        '巨足碾压：跃起砸向玩家，落地 26 伤并掀起震波',
        '二阶段：血量 50% 以下提速',
      ],
    },
    sewerCroc: {
      name: '下水道鳄鱼', hp: 1100, w: 400, h: 180, kind: 'miniboss', speed: 0, touch: 22,
      colors: { body: '#4f7a4a', dark: '#2b4a2a', light: '#cdbf82', outline: '#0c1a0c', eye: '#ffcc33', tooth: '#f2ead0' },
      desc: '痂香祭坛前的巨鳄，长吻撕咬、巨尾横扫并吐出酸泡。',
      mb: ['bite', 'tail', 'bubble'],
      moves: [
        '长吻撕咬：预警 0.55 秒后向前扑咬（30 伤 + 击飞）',
        '巨尾横扫：420 宽长尾扫 + 冲击波（22 伤）',
        '酸泡连吐：连续吐出 5 枚抛物线酸泡（7 伤）',
        '二阶段：血量 50% 以下提速',
      ],
    },
    /* ===== 终局合体 BOSS：痂香杀手鳄 ===== */
    killerCroc: {
      name: '痂香杀手鳄', hp: 3200, w: 580, h: 360, kind: 'boss', speed: 96, touch: 28,
      colors: { body: '#c02026', dark: '#5e0a10', light: '#e8c9a0', outline: '#1c0304', eye: '#ff2a2a', tooth: '#ffe9b0', scab: '#8a1618', tendril: '#e01b22' },
      desc: '吞噬痂香巨魔后合体而成的究极杀手鳄：背生血红触手、全身血色鳞甲，体型与力量翻倍，满血登场。',
      moves: [
        '杀手撕咬：短前摇后向前扑咬（30 伤 + 击飞）',
        '痂香冲撞：高速冲撞（28 伤），撞墙硬直 1.6 秒',
        '巨尾横扫：260 宽尾扫 + 单向冲击波（18 伤）',
        '酸血喷吐：吐出 3 枚抛物线酸泡（12 伤）',
        '杀手碾压：跃起砸向玩家（34 伤），落地只向面朝方向震波',
        '二阶段：66% / 33% 血量时提速',
      ],
      phases: [0.66, 0.33],
      mb: ['bite', 'charge', 'tail', 'bubble', 'leap'],
    },
    /* ===== 水母母体的四根地面触须（可破坏） ===== */
    tentacleBase: {
      name: '水母触须', hp: 150, w: 48, h: 180, kind: 'prop', speed: 0, touch: 0,
      hidden: true,
      colors: { body: '#b06fd6', light: '#e8b6ff', dark: '#5a2f74', outline: '#180722', core: '#ff5fd0' },
      desc: '扎在地面上的水母触须，全部破坏后母体护盾才会消失。',
      moves: ['受击断裂：破坏后母体护罩减弱'],
    },

    /* ===== 常规怪亚种：每族 3 档，tier 越高越强 ===== */
    fartlingA: { name: '酸嗝屁怪', baseType: 'fartling', tier: 1, hp: 120, w: 84, h: 92, kind: 'ground', speed: 60, touch: 12,
      colors: { body: '#7aa66b', dark: '#3f5a34', belly: '#d9d98a', horn: '#e0c98a', outline: '#142014', eye: '#ff6b4a' },
      desc: '吞了过量酸液的屁怪，嗝出的毒雾更浓。', moves: ['浓酸喷吐：毒气云更持久', '扑身撞击', '跳跃追击'] },
    fartlingB: { name: '胀气肥怪', baseType: 'fartling', tier: 2, hp: 168, w: 84, h: 92, kind: 'ground', speed: 62, touch: 15, armor: 0.15, atkRate: 1.1,
      colors: { body: '#a8a84f', dark: '#5c5c24', belly: '#e8e08a', horn: '#d8c070', outline: '#201d08', eye: '#ff4b3e' },
      desc: '肚皮胀成球状的肥怪，皮糙肉厚，喷气更频繁。', moves: ['胀气喷吐：出招间隔更短', '肥躯撞击（15 伤）', '跳跃追击'] },
    fartlingC: { name: '毒沼暴食者', baseType: 'fartling', tier: 3, hp: 225, w: 84, h: 92, kind: 'ground', speed: 68, touch: 18, poison: true, atkRate: 1.2,
      colors: { body: '#6b4f82', dark: '#3a2647', belly: '#b0a04f', horn: '#c8b070', outline: '#1a0f20', eye: '#ff2a2a' },
      desc: '沼气池底爬出的暴食亚种，毒气与撞击都带毒。', moves: ['毒沼喷吐（附带中毒）', '毒躯撞击（18 伤）', '跳跃追击'] },

    pooplingA: { name: '硬壳粪精', baseType: 'poopling', tier: 1, hp: 54, w: 52, h: 52, kind: 'ground', speed: 0, touch: 13, armor: 0.2,
      colors: { body: '#8a7350', light: '#b59a70', dark: '#54422a', outline: '#201608', eye: '#ffffff' },
      desc: '外壳硬化的粪精，踩踏更重。', moves: ['弹跳踩踏', '硬壳：减伤 20%', '死亡裂解'] },
    pooplingB: { name: '爆粪精', baseType: 'poopling', tier: 2, hp: 74, w: 52, h: 52, kind: 'ground', speed: 0, touch: 16, atkRate: 1.2,
      colors: { body: '#c0621f', light: '#e08a3c', dark: '#7a3408', outline: '#2a1004', eye: '#ffe066' },
      desc: '体内憋着沼气的爆裂粪精，落地就炸。', moves: ['爆裂踩踏（16 伤）', '起跳更快', '死亡裂解'] },
    pooplingC: { name: '粪岩巨精', baseType: 'poopling', tier: 3, hp: 104, w: 52, h: 52, kind: 'ground', speed: 0, touch: 20, armor: 0.3,
      colors: { body: '#5c4a38', light: '#8a6f52', dark: '#33271c', outline: '#120c06', eye: '#ff6b3a' },
      desc: '粪渣沉积成的岩壳巨精，沉重难击飞。', moves: ['岩壳踩踏（20 伤）', '岩壳：减伤 30%', '死亡裂解'] },

    gasfishA: { name: '酸鳃鱼人', baseType: 'gasfish', tier: 1, hp: 86, w: 78, h: 82, kind: 'ground', speed: 48, touch: 10,
      colors: { body: '#4f8a7a', dark: '#2a4a40', belly: '#c9d887', fin: '#2f5a4d', outline: '#0c1814', eye: '#ffd34f' },
      desc: '鳃部被酸液灼穿的鱼人，吐弹更酸。', moves: ['酸弹三连', '护鳍后撤', '跳跃换位'] },
    gasfishB: { name: '沼气祭司', baseType: 'gasfish', tier: 2, hp: 120, w: 78, h: 82, kind: 'ground', speed: 46, touch: 12, atkRate: 1.15, poison: true,
      colors: { body: '#7a5a9a', dark: '#3f2a52', belly: '#c9b487', fin: '#4a2f5d', outline: '#150c1c', eye: '#8fffe6' },
      desc: '披着紫鳞的鱼人祭司，沼气弹附带中毒。', moves: ['毒沼三连（附带中毒）', '护鳍后撤', '跳跃换位'] },
    gasfishC: { name: '毒沼鱼王侍', baseType: 'gasfish', tier: 3, hp: 160, w: 78, h: 82, kind: 'ground', speed: 52, touch: 14, armor: 0.15, atkRate: 1.2,
      colors: { body: '#2f6a72', dark: '#163a40', belly: '#d8c07a', fin: '#1f4a52', outline: '#081014', eye: '#ff8a3a' },
      desc: '鱼王近侍，鳞甲防酸且出手极快。', moves: ['酸弹三连（更快）', '鳞甲：减伤 15%', '护鳍后撤'] },

    centipedeA: { name: '锈甲蜈蚣', baseType: 'centipede', tier: 1, hp: 205, w: 108, h: 58, kind: 'ground', speed: 82, touch: 14, armor: 0.3,
      colors: { body: '#b0602a', dark: '#74380e', light: '#d88a40', outline: '#241004', eye: '#ffe9a0' },
      desc: '甲壳锈蚀发红的蜈蚣，头壳更硬。', moves: ['昂头突刺', '锈甲减伤 30%', '跳跃追击'] },
    centipedeB: { name: '钴蓝蜈蚣', baseType: 'centipede', tier: 2, hp: 285, w: 108, h: 58, kind: 'ground', speed: 92, touch: 16,
      colors: { body: '#3a6ab0', dark: '#1e3a6a', light: '#7aa8e8', outline: '#0a1424', eye: '#8fffe6' },
      desc: '灌满蓝污的钴蓝蜈蚣，冲咬速度极快。', moves: ['疾速突刺（92 速）', '甲壳减伤 40%', '跳跃追击'] },
    centipedeC: { name: '赤壳蜈蚣', baseType: 'centipede', tier: 3, hp: 380, w: 108, h: 58, kind: 'ground', speed: 88, touch: 18, armor: 0.4,
      colors: { body: '#a02438', dark: '#5c0f1c', light: '#e06a70', outline: '#1c0408', eye: '#ffd166' },
      desc: '壳缘渗出赤血的巨蜈蚣，重甲厚血。', moves: ['赤壳突刺', '重甲减伤 40%', '跳跃追击'] },

    urinewispA: { name: '酸雾灵', baseType: 'urinewisp', tier: 1, hp: 15, w: 62, h: 68, kind: 'fly', speed: 0, touch: 11,
      colors: { body: '#b8e07a', light: '#e4ffb0', dark: '#6a8a2a', outline: '#2a3a08', eye: '#1c2400' },
      desc: '酸味更浓的液灵，尿弹落点酸池更大。', moves: ['酸弹抛射', '液灵漂移'] },
    urinewispB: { name: '电尿灵', baseType: 'urinewisp', tier: 2, hp: 22, w: 62, h: 68, kind: 'fly', speed: 0, touch: 13, atkRate: 1.3,
      colors: { body: '#6ad8e8', light: '#b8f4ff', dark: '#2a7a8a', outline: '#082a30', eye: '#001c24' },
      desc: '带电的尿灵，弹幕更快更密。', moves: ['电酸弹抛射', '高频漂移'] },
    urinewispC: { name: '腐毒尿灵', baseType: 'urinewisp', tier: 3, hp: 30, w: 62, h: 68, kind: 'fly', speed: 0, touch: 15, poison: true, atkRate: 1.25,
      colors: { body: '#c8a83f', light: '#f4e08a', dark: '#7a5a10', outline: '#2a2000', eye: '#3a1020' },
      desc: '混着腐毒的尿灵，酸池持续伤害更高。', moves: ['腐毒弹抛射（附带中毒）', '液灵漂移'] },

    jellyfishA: { name: '毒斑水母', baseType: 'jellyfish', tier: 1, hp: 15, w: 86, h: 84, kind: 'fly', speed: 0, touch: 11, atkRate: 1.15,
      colors: { body: '#bfe0c8', light: '#e4fff0', dark: '#4f7a62', outline: '#142a20', core: '#4fffb0' },
      desc: '触手带毒斑的水母，垂落更频繁。', moves: ['触手垂落', '电场脉冲', '核心弱点'] },
    jellyfishB: { name: '幽紫水母', baseType: 'jellyfish', tier: 2, hp: 22, w: 86, h: 84, kind: 'fly', speed: 0, touch: 13, atkRate: 1.6,
      colors: { body: '#c8a8e8', light: '#efd8ff', dark: '#6a4a8a', outline: '#1c0c2a', core: '#d06aff' },
      desc: '幽紫触手高频垂落，电击更密。', moves: ['高频触手垂落', '紫电脉冲', '核心弱点'] },
    jellyfishC: { name: '赤核水母', baseType: 'jellyfish', tier: 3, hp: 30, w: 86, h: 84, kind: 'fly', speed: 0, touch: 15, poison: true, atkRate: 1.9,
      colors: { body: '#e8b0b0', light: '#ffe0e0', dark: '#8a3a3a', outline: '#2a0c0c', core: '#ff3a3a' },
      desc: '赤红核心的水母母体幼体，毒电双属。', moves: ['毒电触手垂落', '赤电脉冲', '核心弱点'] },

    /* ===== 迷你 BOSS 亚种：每只 3 档 ===== */
    centipedeKingA: { name: '铁颚百足', baseType: 'centipedeKing', tier: 1, hp: 1150, w: 330, h: 150, kind: 'miniboss', speed: 0, touch: 20, mb: ['charge', 'sweep', 'poison'],
      colors: { body: '#7a8aa0', dark: '#3a4a5a', light: '#b8c8d8', outline: '#101820', eye: '#8fffe6' },
      desc: '铁壳巨颚的百足亚种，冲锋更猛。', moves: ['贴地冲锋', '巨尾横扫', '毒雾喷吐'] },
    centipedeKingB: { name: '熔渣百足', baseType: 'centipedeKing', tier: 2, hp: 1520, w: 330, h: 150, kind: 'miniboss', speed: 0, touch: 22, mb: ['charge', 'sweep', 'poison'],
      colors: { body: '#c05a20', dark: '#6a2808', light: '#e8a050', outline: '#240c02', eye: '#ffe066' },
      desc: '吞食熔渣的百足，甲壳灼热发红。', moves: ['熔渣冲锋', '巨尾横扫', '毒雾喷吐'] },
    centipedeKingC: { name: '深渊蜈蚣王', baseType: 'centipedeKing', tier: 3, hp: 1980, w: 330, h: 150, kind: 'miniboss', speed: 0, touch: 24, armor: 0.15, mb: ['charge', 'sweep', 'poison'],
      colors: { body: '#5a3a8a', dark: '#2f1a4a', light: '#a080d0', outline: '#100620', eye: '#ff4bd0' },
      desc: '深渊污流中长成的蜈蚣王，重甲厚血。', moves: ['深渊冲锋', '巨尾横扫', '毒雾喷吐'] },

    gasfishKingA: { name: '毒沼鱼人将', baseType: 'gasfishKing', tier: 1, hp: 2500, w: 260, h: 220, kind: 'miniboss', speed: 0, touch: 20, mb: ['fan', 'slam', 'summon'],
      colors: { body: '#4a7a5a', dark: '#244a34', light: '#cfc27a', outline: '#0c1a12', eye: '#8fffe6', crown: '#bfe8ff' },
      desc: '毒沼中崛起的鱼人将，弹幕带毒。', moves: ['毒沼扇射', '重砸', '召集群鱼'] },
    gasfishKingB: { name: '沼气大祭司', baseType: 'gasfishKing', tier: 2, hp: 3200, w: 260, h: 220, kind: 'miniboss', speed: 0, touch: 22, mb: ['fan', 'slam', 'summon'],
      colors: { body: '#6a4a8a', dark: '#3a2452', light: '#d8b8e8', outline: '#140a20', eye: '#ffd166', crown: '#ff8fd0' },
      desc: '披紫袍的沼气祭司，召鱼更频繁。', moves: ['沼气扇射', '重砸震波', '召集群鱼'] },
    gasfishKingC: { name: '渊沼鱼皇', baseType: 'gasfishKing', tier: 3, hp: 4100, w: 260, h: 220, kind: 'miniboss', speed: 0, touch: 24, armor: 0.1, mb: ['fan', 'slam', 'summon'],
      colors: { body: '#2f5a8a', dark: '#16304a', light: '#d8c87a', outline: '#081420', eye: '#ff3a3a', crown: '#ffe066' },
      desc: '深渊沉淀池的鱼皇，鳞甲护体。', moves: ['渊沼扇射', '重砸震波', '召集群鱼'] },

    jellyMotherA: { name: '幽绿水母母体', baseType: 'jellyMother', tier: 1, hp: 980, w: 260, h: 260, kind: 'miniboss', fly: true, speed: 0, touch: 18, mb: ['tentacle', 'spike', 'drop', 'pulse', 'spawn'],
      colors: { body: '#bfe8d8', light: '#e8fff4', dark: '#4f8a72', outline: '#102a20', core: '#8fffc8', eye: '#ff8fd0' },
      desc: '幽绿污池中生长的水母母体，触须更韧。', moves: ['触须护盾', '触手拍击', '地底刺击', '电环脉冲', '孵化幼体'] },
    jellyMotherB: { name: '紫电水母母体', baseType: 'jellyMother', tier: 2, hp: 1280, w: 260, h: 260, kind: 'miniboss', fly: true, speed: 0, touch: 20, atkRate: 1.2, mb: ['tentacle', 'spike', 'drop', 'pulse', 'spawn'],
      colors: { body: '#d8b0f0', light: '#f4e0ff', dark: '#6a4a8a', outline: '#1c0a2a', core: '#d06aff', eye: '#8fffe6' },
      desc: '缠绕紫电的水母母体，脉冲更频繁。', moves: ['触须护盾', '紫电触手', '地底刺击', '电环脉冲', '孵化幼体'] },
    jellyMotherC: { name: '血色水母母后', baseType: 'jellyMother', tier: 3, hp: 1650, w: 260, h: 260, kind: 'miniboss', fly: true, speed: 0, touch: 22, poison: true, atkRate: 1.3, mb: ['tentacle', 'spike', 'drop', 'pulse', 'spawn'],
      colors: { body: '#e8b0b8', light: '#ffe0e4', dark: '#8a3a44', outline: '#2a0a10', core: '#ff3a5a', eye: '#ffd166' },
      desc: '血色触须的水母母后，毒电双属。', moves: ['触须护盾', '血色触手（带毒）', '地底刺击', '电环脉冲', '孵化幼体'] },

    giantFootA: { name: '腐甲巨足', baseType: 'giantFoot', tier: 1, hp: 5000, w: 260, h: 320, kind: 'miniboss', speed: 0, touch: 26, mb: ['stomp', 'kick', 'leap'],
      colors: { body: '#a06a4a', dark: '#5c3a24', light: '#d8b08a', outline: '#1c0c06', eye: '#ffe066', nail: '#e8d6b0' },
      desc: '腐甲加厚的巨人残足，踏地更沉。', moves: ['踏地震波', '巨足踢击', '巨足碾压'] },
    giantFootB: { name: '熔岩巨足', baseType: 'giantFoot', tier: 2, hp: 6500, w: 260, h: 320, kind: 'miniboss', speed: 0, touch: 28, atkRate: 1.15, mb: ['stomp', 'kick', 'leap'],
      colors: { body: '#c05a30', dark: '#6a2a10', light: '#e8a060', outline: '#240a02', eye: '#ff4b2a', nail: '#ffe0a0' },
      desc: '踏过熔渣的巨人残足，震波更快。', moves: ['熔岩震波', '巨足踢击', '巨足碾压'] },
    giantFootC: { name: '深渊巨足', baseType: 'giantFoot', tier: 3, hp: 8400, w: 260, h: 320, kind: 'miniboss', speed: 0, touch: 30, armor: 0.1, mb: ['stomp', 'kick', 'leap'],
      colors: { body: '#4a2f6a', dark: '#24143a', light: '#8a6ab0', outline: '#0c0418', eye: '#ff3a8a', nail: '#d8c8f0' },
      desc: '深渊瘴气中肿胀的巨人残足，血厚攻高。', moves: ['深渊震波', '巨足踢击', '巨足碾压'] },

    sewerCrocA: { name: '锈鳞鳄', baseType: 'sewerCroc', tier: 1, hp: 1400, w: 400, h: 180, kind: 'miniboss', speed: 0, touch: 24, mb: ['bite', 'tail', 'bubble'],
      colors: { body: '#7a6a3a', dark: '#4a3f1e', light: '#d8c08a', outline: '#14100a', eye: '#ffe066', tooth: '#fff0c8' },
      desc: '锈色鳞甲的巨鳄亚种，咬合更重。', moves: ['长吻撕咬', '巨尾横扫', '酸泡连吐'] },
    sewerCrocB: { name: '酸血鳄', baseType: 'sewerCroc', tier: 2, hp: 1800, w: 400, h: 180, kind: 'miniboss', speed: 0, touch: 26, atkRate: 1.15, mb: ['bite', 'tail', 'bubble'],
      colors: { body: '#5a8a3a', dark: '#2a4a1e', light: '#c8e08a', outline: '#0c1a08', eye: '#ff3a3a', tooth: '#e8ffd0' },
      desc: '血液混酸的巨鳄，酸泡更毒。', moves: ['酸血撕咬', '巨尾横扫', '酸泡连吐'] },
    sewerCrocC: { name: '深渊食人鳄', baseType: 'sewerCroc', tier: 3, hp: 2350, w: 400, h: 180, kind: 'miniboss', speed: 0, touch: 28, armor: 0.12, mb: ['bite', 'tail', 'bubble'],
      colors: { body: '#3a4a6a', dark: '#1a2438', light: '#8aa0c8', outline: '#080c14', eye: '#ff2a2a', tooth: '#d8e8ff' },
      desc: '深渊污水里长成的食人鳄，鳞甲护体。', moves: ['深渊撕咬', '巨尾横扫', '酸泡连吐'] },
  };

  /* 亚种投放索引：baseType → 三条亚种 type（tier 1/2/3） */
  R.VARIANTS = {
    fartling: ['fartlingA', 'fartlingB', 'fartlingC'],
    poopling: ['pooplingA', 'pooplingB', 'pooplingC'],
    gasfish: ['gasfishA', 'gasfishB', 'gasfishC'],
    centipede: ['centipedeA', 'centipedeB', 'centipedeC'],
    urinewisp: ['urinewispA', 'urinewispB', 'urinewispC'],
    jellyfish: ['jellyfishA', 'jellyfishB', 'jellyfishC'],
    centipedeKing: ['centipedeKingA', 'centipedeKingB', 'centipedeKingC'],
    gasfishKing: ['gasfishKingA', 'gasfishKingB', 'gasfishKingC'],
    jellyMother: ['jellyMotherA', 'jellyMotherB', 'jellyMotherC'],
    giantFoot: ['giantFootA', 'giantFootB', 'giantFootC'],
    sewerCroc: ['sewerCrocA', 'sewerCrocB', 'sewerCrocC'],
  };

  /* ===================== 遗物表（装备） ===================== */
  R.RELICS = [
    { id: 'badge', name: '净化工牌', desc: '所有伤害 +15%', mods: { dmg: 0.15 }, icon: 'badge' },
    { id: 'boots', name: '加厚胶靴', desc: '免疫酸液伤害与减速', mods: { acidImmune: true }, icon: 'boots' },
    { id: 'mask', name: '防毒面罩', desc: '毒雾/沼气伤害 -60%', mods: { gasResist: 0.6 }, icon: 'mask' },
    { id: 'incense', name: '香薰护符', desc: '每进入新房间回复 40 生命', mods: { roomHeal: 40 }, icon: 'incense' },
    { id: 'pack', name: '拾荒背包', desc: '废料获取 +50%', mods: { scrap: 0.5 }, icon: 'pack' },
    { id: 'ironfist', name: '铁头功', desc: '重击伤害 +30%', mods: { heavyDmg: 0.3 }, icon: 'ironfist' },
    { id: 'feather', name: '轻身符', desc: '移动 +15%，冲刺冷却 -30%', mods: { moveMul: 0.15, dashCd: 0.3 }, icon: 'feather' },
    { id: 'moss', name: '吸血苔', desc: '击杀敌人回复 15 生命', mods: { lifesteal: 15 }, icon: 'moss' },
    { id: 'bombcharm', name: '爆裂符', desc: '击杀的敌人会小范围爆炸', mods: { explode: true }, icon: 'bombcharm' },
    { id: 'gloves', name: '连击手套', desc: '轻击第三段伤害 +50%', mods: { comboBoost: 0.5 }, icon: 'gloves' },
    { id: 'mirror', name: '护心镜', desc: '最大生命 +80，并立即回复', mods: { maxHp: 80, healFull: true }, icon: 'mirror' },
    { id: 'bubble', name: '沼气泡', desc: '受到伤害 -12%', mods: { shield: 0.12 }, icon: 'bubble' },
    { id: 'bloodwrap', name: '血痂护腕', desc: '击杀敌人回复 22 生命', mods: { lifesteal: 22 }, icon: 'heart' },
    { id: 'corrode', name: '腐蚀之牙', desc: '伤害 +8%，重击再 +15%', mods: { dmg: 0.08, heavyDmg: 0.15 }, icon: 'fist' },
    { id: 'manhole', name: '井盖重盾', desc: '受到伤害 -15%，最大生命 +30', mods: { shield: 0.15, maxHp: 30 }, icon: 'shield' },
    { id: 'hook', name: '拾荒钩爪', desc: '远程伤害 +20%，废料 +25%', mods: { rangedDmg: 0.2, scrap: 0.25 }, icon: 'arrow' },
    { id: 'jumpfeather', name: '连跳羽', desc: '额外一段空中跳跃，移动 +8%', mods: { extraJump: 1, moveMul: 0.08 }, icon: 'wing' },
    { id: 'berserk', name: '狂暴心', desc: '生命低于 30% 时伤害 +30%', mods: { lowHpDmg: 0.3 }, icon: 'rune' },

    /* ===== 特殊效果遗物（飞行 / 冻结 / 陷阱 / 反伤 / 连锁 / 缓速） ===== */
    { id: 'wings', name: '腐翼', desc: '长按 W 滑翔，空中可无限连跳', mods: { glide: true, infiniteJump: true }, icon: 'wing' },
    { id: 'frost', name: '霜心', desc: '攻击有 30% 概率冻结敌人 1.2 秒', mods: { freeze: 0.3 }, icon: 'rune' },
    { id: 'caltrop', name: '铁蒺藜', desc: '每 4 秒在脚下布设尖刺陷阱，造成 70 伤害', mods: { trap: 1 }, icon: 'bombcharm' },
    { id: 'thorn', name: '倒刺甲', desc: '受到伤害时反弹 35 伤害给周围敌人', mods: { thorns: 35 }, icon: 'shield' },
    { id: 'chain', name: '连锁雷种', desc: '命中时有 25% 概率电弧跳跃到附近敌人', mods: { chain: 0.25 }, icon: 'rune' },
    { id: 'hourglass', name: '迟滞沙漏', desc: '周围 320 内的敌人移速 -40%', mods: { slowField: 0.4 }, icon: 'incense' },
    { id: 'soulsiphon', name: '噬魂灯', desc: '击杀回复 8 生命，技能伤害 +10%', mods: { lifesteal: 8, skillDmg: 0.1 }, icon: 'heart' },
    { id: 'fan', name: '回旋飞扇', desc: '远程伤害 +35%，远程冷却 -15%', mods: { rangedDmg: 0.35, atkSpeed: 0.15 }, icon: 'arrow' },

    /* ===== 第五轮新增 20 件遗物（复活 / 元素附伤 / 额外按键技能 / 高阶属性） ===== */
    { id: 'phoenix', name: '涅槃羽', desc: '死亡时消耗 1 次复活，回复 35% 生命；每级 +1 次、+8% 回复', mods: { revive: 1 }, icon: 'wing' },
    { id: 'ember', name: '余烬符', desc: '攻击有概率点燃敌人，持续灼烧', mods: { elemFire: 1 }, icon: 'rune' },
    { id: 'venom', name: '毒髓', desc: '攻击有概率使敌人中毒持续掉血', mods: { elemPoison: 1 }, icon: 'heart' },
    { id: 'thunder', name: '雷纹', desc: '攻击有概率雷击僵直并弹射电弧', mods: { elemShock: 1 }, icon: 'rune' },
    { id: 'frostbite', name: '霜蚀', desc: '攻击附加冰缓，降低敌人移速', mods: { elemIce: 1 }, icon: 'rune' },
    { id: 'wave', name: '圣光波', desc: '解锁 T 键：向前释放贯穿光波', mods: { extraSkill: 'wave' }, icon: 'arrow' },
    { id: 'bind', name: '缚魂锁', desc: '解锁 F 键：束缚周围敌人', mods: { extraSkill: 'bind' }, icon: 'rune' },
    { id: 'mend', name: '生命之泉', desc: '解锁 H 键：回复自身生命', mods: { extraSkill: 'mend' }, icon: 'heart' },
    { id: 'aegis', name: '守护结界', desc: '解锁 N 键：短时大幅减伤', mods: { extraSkill: 'aegis' }, icon: 'shield' },
    { id: 'elementalist', name: '元素使者', desc: '所有元素效果强度 +14%', mods: { elemDmg: 0.14 }, icon: 'rune' },
    { id: 'pyroclasm', name: '熔岩之心', desc: '火焰附着 + 所有伤害 +15%', mods: { elemFire: 1, dmg: 0.15 }, icon: 'fist' },
    { id: 'plague', name: '疫病之种', desc: '中毒附着 + 周围减速', mods: { elemPoison: 1, slowField: 0.2 }, icon: 'mask' },
    { id: 'glacier', name: '冰川之核', desc: '冰缓附着 + 冻结概率', mods: { elemIce: 1, freeze: 0.1 }, icon: 'rune' },
    { id: 'stormcaller', name: '风暴之眼', desc: '雷击附着 + 连锁概率', mods: { elemShock: 1, chain: 0.15 }, icon: 'rune' },
    { id: 'vampire', name: '血族圣痕', desc: '击杀回复 20，残血伤害 +20%', mods: { lifesteal: 20, lowHpDmg: 0.2 }, icon: 'heart' },
    { id: 'bulwark', name: '守护者', desc: '受到伤害 -15%，反伤 +20', mods: { shield: 0.15, thorns: 20 }, icon: 'shield' },
    { id: 'manaflow', name: '灵脉', desc: '技能伤害 +25%，技能冷却 -20%', mods: { skillDmg: 0.25, skillCd: -0.2 }, icon: 'rune' },
    { id: 'zealot', name: '狂热', desc: '攻速 +15%，连击三段 +25%', mods: { atkSpeed: 0.15, comboBoost: 0.25 }, icon: 'gloves' },
    { id: 'scrapper', name: '拾荒专家', desc: '废料 +30%，远程伤害 +20%', mods: { scrap: 0.3, rangedDmg: 0.2 }, icon: 'pack' },
    { id: 'lastStand', name: '背水一战', desc: '最大生命 +60，残血伤害 +35%', mods: { maxHp: 60, lowHpDmg: 0.35 }, icon: 'rune' },

    /* ===== 隐藏作弊遗物：仅在情赌徒商店输入兑换码 214 获得，不进入普通掉落池 / 情报列表 ===== */
    { id: 'cheat', name: '作弊·上帝权柄', desc: '角色无敌，任何攻击都能秒杀敌人（含 BOSS）', mods: { immortal: true, instaKill: true }, icon: 'badge', hidden: true },
  ];

  /* ===================== 关卡 BUFF（每关结束三选一，角色有专属池） ===================== */
  R.BUFFS = [
    { id: 'b_power', name: '痂壳之力', desc: '所有伤害 +12%', mods: { dmg: 0.12 }, icon: 'fist' },
    { id: 'b_vital', name: '浊水续命', desc: '最大生命 +80 并立即回满', mods: { maxHp: 80, healFull: true }, icon: 'heart' },
    { id: 'b_swift', name: '老鼠步', desc: '移动 +12%，冲刺冷却 -22%', mods: { moveMul: 0.12, dashCd: 0.22 }, icon: 'boot' },
    { id: 'b_combo', name: '连环', desc: '轻击第三段伤害 +40%', mods: { comboBoost: 0.4 }, icon: 'fist' },
    { id: 'b_heavy', name: '重锤', desc: '重击伤害 +25%', mods: { heavyDmg: 0.25 }, icon: 'hammer' },
    { id: 'b_reach', name: '长柄', desc: '近战距离 +25%', mods: { reach: 0.25 }, icon: 'reach' },
    { id: 'b_leech', name: '腐血', desc: '击杀敌人回复 18 生命', mods: { lifesteal: 18 }, icon: 'heart' },
    { id: 'b_guard', name: '湿皮', desc: '受到伤害 -10%', mods: { shield: 0.1 }, icon: 'shield' },
    { id: 'b_jump', name: '三段跳', desc: '额外一段空中跳跃，跳跃高度 +12%', mods: { extraJump: 1, jumpBonus: 0.12 }, icon: 'wing' },
    { id: 'b_hunter', name: '猎手', desc: '远程伤害 +30%', mods: { rangedDmg: 0.3 }, icon: 'arrow' },
    { id: 'b_caster', name: '咏唱', desc: '技能冷却 -25%', mods: { skillCd: -0.25 }, icon: 'rune' },
    { id: 'b_pickup', name: '拾荒', desc: '废料获取 +40%', mods: { scrap: 0.4 }, icon: 'pack' },
    { id: 'b_spirit', name: '气脉贯通', desc: '气获取 +40%', mods: { meterGain: 0.4 }, icon: 'rune' },
    { id: 'b_spell', name: '咒力', desc: '格斗技伤害 +35%', mods: { skillDmg: 0.35 }, icon: 'rune' },
    { id: 'b_ult', name: '必杀奥义', desc: '必杀伤害 +30%', mods: { ultDmg: 0.3 }, icon: 'fist' },
    { id: 'b_bandage', name: '战地包扎', desc: '每进入新房间回复 50 生命', mods: { roomHeal: 50 }, icon: 'heart' },
    { id: 'b_speed', name: '毒瘾', desc: '轻击出手 +20%，移动 +6%', mods: { atkSpeed: 0.2, moveMul: 0.06 }, icon: 'boot' },
    { id: 'b_air', name: '轻功', desc: '跳跃高度 +20%，移动 +10%', mods: { jumpBonus: 0.2, moveMul: 0.1 }, icon: 'wing' },
  ];

  /* 角色专属 BUFF：每关的强化三选一里，至少保证出现 1 个本角色专属 */
  R.CHAR_BUFFS = {
    hannya: [
      { id: 'c_hannya_1', name: '血狂', desc: '生命低于 40% 时伤害 +35%', mods: { lowHpDmg: 0.35 }, icon: 'fist' },
      { id: 'c_hannya_2', name: '鬼气', desc: '技能伤害 +40%', mods: { skillDmg: 0.4 }, icon: 'rune' },
      { id: 'c_hannya_3', name: '修罗', desc: '重击 +20%，击杀回 12 生命', mods: { heavyDmg: 0.2, lifesteal: 12 }, icon: 'hammer' },
    ],
    angel: [
      { id: 'c_angel_1', name: '圣躯', desc: '最大生命 +120 并回满', mods: { maxHp: 120, healFull: true }, icon: 'heart' },
      { id: 'c_angel_2', name: '庇护', desc: '每进入新房间回复 60 生命', mods: { roomHeal: 60 }, icon: 'rune' },
      { id: 'c_angel_3', name: '双翼', desc: '额外一段空中跳跃，跳跃高度 +20%，移动 +10%', mods: { extraJump: 1, jumpBonus: 0.2, moveMul: 0.1 }, icon: 'wing' },
    ],
    boxer: [
      { id: 'c_boxer_1', name: '铁拳', desc: '轻击出手再快 25%', mods: { atkSpeed: 0.25 }, icon: 'fist' },
      { id: 'c_boxer_2', name: '连段', desc: '轻击第三段 +60%', mods: { comboBoost: 0.6 }, icon: 'fist' },
      { id: 'c_boxer_3', name: '铜皮', desc: '受到伤害 -15%，重击 +20%', mods: { shield: 0.15, heavyDmg: 0.2 }, icon: 'shield' },
    ],
    dancer: [
      { id: 'c_dancer_1', name: '疾风', desc: '移动 +25%', mods: { moveMul: 0.25 }, icon: 'boot' },
      { id: 'c_dancer_2', name: '残影', desc: '冲刺冷却 -35%，冲刺无敌更长', mods: { dashCd: 0.35 }, icon: 'wing' },
      { id: 'c_dancer_3', name: '舞步', desc: '受到伤害 -12%，远程 +15%', mods: { shield: 0.12, rangedDmg: 0.15 }, icon: 'shield' },
    ],
    dragon: [
      { id: 'c_dragon_1', name: '龙骨', desc: '最大生命 +150 并回满', mods: { maxHp: 150, healFull: true }, icon: 'heart' },
      { id: 'c_dragon_2', name: '龙威', desc: '重击 +35%', mods: { heavyDmg: 0.35 }, icon: 'hammer' },
      { id: 'c_dragon_3', name: '龙鳞', desc: '受到伤害 -18%', mods: { shield: 0.18 }, icon: 'shield' },
    ],
    warlock: [
      { id: 'c_warlock_1', name: '噬魂', desc: '击杀回复 30 生命', mods: { lifesteal: 30 }, icon: 'heart' },
      { id: 'c_warlock_2', name: '邪咒', desc: '技能伤害 +50%', mods: { skillDmg: 0.5 }, icon: 'rune' },
      { id: 'c_warlock_3', name: '蚀血', desc: '伤害 +10%，击杀回 10 生命', mods: { dmg: 0.1, lifesteal: 10 }, icon: 'fist' },
    ],
    ranger: [
      { id: 'c_ranger_1', name: '鹰眼', desc: '远程伤害 +45%', mods: { rangedDmg: 0.45 }, icon: 'arrow' },
      { id: 'c_ranger_2', name: '长臂', desc: '攻击距离 +35%', mods: { reach: 0.35 }, icon: 'reach' },
      { id: 'c_ranger_3', name: '猎装', desc: '重击 +20%，移动 +8%', mods: { heavyDmg: 0.2, moveMul: 0.08 }, icon: 'boot' },
    ],
    ronin: [
      { id: 'c_ronin_1', name: '刀锋', desc: '重击 +40%', mods: { heavyDmg: 0.4 }, icon: 'hammer' },
      { id: 'c_ronin_2', name: '心眼', desc: '轻击第三段 +30%，距离 +15%', mods: { comboBoost: 0.3, reach: 0.15 }, icon: 'reach' },
      { id: 'c_ronin_3', name: '武士道', desc: '伤害 +10%，受到伤害 -8%', mods: { dmg: 0.1, shield: 0.08 }, icon: 'shield' },
    ],
  };

  /* ===================== 格斗模式技能 / 必杀（U / Y 键） =====================
     直接照搬格斗模式的招式名与定位，按肉鸽数值重新配平：
       skill 耗气 25 / ult 耗气 100；type 决定实现方式（rogue.js castFight 解释） */
  R.FIGHT = {
    hannya: {
      skill: { name: '鬼火·业炎', cost: 25, cd: 6, type: 'fireballs', dmg: 45, count: 3, color: '#ff6a4a', desc: '喷出 3 枚追踪红焰弹，每枚 45 伤' },
      ult: { name: '百鬼夜行', cost: 100, type: 'waves', dmg: 52, waves: 5, radius: 340, color: '#c0392b', desc: '五道鬼影自地面穿出，每道 52 伤并击飞' },
    },
    angel: {
      skill: { name: '圣光十字', cost: 25, cd: 6, type: 'column', dmg: 60, heal: 40, color: '#ffe9a0', desc: '降下光柱 60 伤，同时回复 40 生命' },
      ult: { name: '炽翼天罚', cost: 100, type: 'dive', dmg: 150, burst: 170, radius: 280, color: '#ffe9a0', desc: '升空俯冲 150 伤，落地光羽爆散 170 伤并击飞' },
    },
    boxer: {
      skill: { name: '连环拳风暴', cost: 25, cd: 5, type: 'rapid', dmg: 22, hits: 5, color: '#8fe0ff', desc: '突进五段刺拳，每段 22 伤' },
      ult: { name: 'KO 铁拳', cost: 100, type: 'ko', dmg: 300, color: '#ffd166', desc: '蓄力重拳 300 伤，超大击退' },
    },
    dancer: {
      skill: { name: '飘带旋舞', cost: 25, cd: 6, type: 'spin', dmg: 35, hits: 2, radius: 250, color: '#e0a0ff', desc: '彩带两段旋舞，各 35 伤并把敌人拉近' },
      ult: { name: '天女散花', cost: 100, type: 'ribbons', dmg: 35, hits: 8, color: '#e0a0ff', desc: '八条丝带依次自天而降，每条 35 伤' },
    },
    dragon: {
      skill: { name: '腐绿龙息', cost: 25, cd: 6, type: 'cone', dmg: 12, hits: 7, reach: 340, color: '#ffb45a', desc: '锥形龙息连续 7 跳，每跳 12 伤' },
      ult: { name: '亡灵龙吼', cost: 100, type: 'roar', dmg: 40, waves: 4, burst: 140, color: '#8dff6a', desc: '骷髅冲锋 4×40 伤，接一发 140 的地裂爆发' },
    },
    warlock: {
      skill: { name: '五芒诅咒', cost: 25, cd: 6, type: 'curse', dmg: 90, radius: 160, color: '#b06aff', desc: '敌人脚下布阵，1 秒后爆发 90 伤' },
      ult: { name: '暗黑陨石', cost: 100, type: 'meteor', dmg: 110, count: 3, radius: 190, color: '#a05cff', desc: '天降三颗陨石，每颗 110 伤' },
    },
    ranger: {
      skill: { name: '穿云箭', cost: 25, cd: 5, type: 'arrow', dmg: 70, color: '#9be0b0', desc: '高速贯穿箭矢 70 伤' },
      ult: { name: '箭雨风暴', cost: 100, type: 'arrowrain', dmg: 30, count: 12, color: '#9be0b0', desc: '十二支箭覆盖前方，每支 30 伤' },
    },
    ronin: {
      skill: { name: '居合·瞬闪', cost: 25, cd: 6, type: 'blink', dmg: 110, dist: 280, color: '#ffd166', desc: '瞬移穿身斩 110 伤，过程中无敌' },
      ult: { name: '无明一刀', cost: 100, type: 'slash', dmg: 320, color: '#ffe9c0', desc: '全屏横斩 320 伤并击飞' },
    },
  };

  /* ===================== 道具表 ===================== */
  R.ITEMS = {
    potion: { name: '净水药剂', desc: '回复 120 生命', color: '#54e08a', key: 'Q' },
    bandage: { name: '厚重绷带', desc: '回复 200 生命', color: '#f0e6d2', key: 'Q' },
    antidote: { name: '抗毒血清', desc: '12 秒内免疫毒雾与酸液', color: '#9fd8ff', key: 'Q' },
    stim: { name: '腐血兴奋剂', desc: '6 秒内伤害 +30%', color: '#ff8a4a', key: 'Q' },
    ward: { name: '痂壳护符', desc: '6 秒内受到伤害 -40%', color: '#b8d8c0', key: 'Q' },
    magnet: { name: '拾荒磁石', desc: '吸取全场废料并额外获得 60', color: '#c9a0ff', key: 'Q' },
    holywater: { name: '圣水炸弹', desc: '投掷后范围内造成 180 伤害', color: '#ffe9a0', key: 'Q' },
    incense: { name: '驱瘴香薰', desc: '全场敌人眩晕 3 秒', color: '#ff9f45', key: 'Q' },
  };
  R.HEAL_AMOUNT = 120;

  /* ===================== 情赌徒（NPC） =====================
     每关固定一名，站在地面；E 交互。赌局为石头剪刀布，赌注可选生命/废料/遗物/道具，
     赢了双倍返还，输了失去赌注；另外可用废料购买道具与遗物。 */
  R.GAMBLER = {
    name: '情赌徒',
    title: '下水道赌坊庄家',
    desc: '紫发燕尾服的牌桌庄家，指间翻飞纸牌。他赌的不是钱，是你身上还剩下的东西。',
    hpStake: 60,          // 一次赌注：60 生命（赢回 120 治疗，输掉 60）
    scrapStake: 60,       // 一次赌注：60 废料（赢回 120）
    itemPrice: 70,        // 商店：随机道具价格
    relicPrice: 220,      // 商店：随机遗物价格
    lines: {
      greet: '来一把？石头剪刀布，你赢了，我翻倍还你。',
      win: '哈！好手气。拿去吧，双倍奉还。',
      lose: '啧，手气不佳。愿赌服输，东西归我了。',
      broke: '你身上的筹码不够啊，先去走廊里捡点废料吧。',
      bye: '随时回来，牌桌永远为你开着。',
    },
  };

  /* ===================== 机关参数 ===================== */
  R.HAZARDS = {
    steam: { period: 250, warn: 52, on: 74, dmg: 14, launch: -760 },
  };

  /* ===================== 房间表（全部横向、脚踏实地） =====================
     每关一张不同的横向地图：地面高低错落、酸坑/机关位置不同，悬空踏板仅作点缀。
     floors: 整块落脚层；platforms: 少量单向踏板；acid: 坑底酸液；hazards: 机关
     start: 出生点（左侧）；exit: 闸门 x（BOSS 房为 0）；exitY: 闸门高度
     zones: triggerX —— 玩家横向走到该 x 时该区域的怪才涌出，怪全部贴地刷新 */
  R.ROOMS = [
    {
      id: 'r1',
      name: '锈蚀进水口',
      sub: 'ROOM 1 · 横向探索 · 锈蚀闸门',
      w: 5600, h: 1320,
      hint: '一路向右推进 · 清空 4 个区域后闸门开启 · U 格斗技 / Y 必杀',
      floors: [
        { x: 0, y: 1060, w: 1560, h: 60 },
        { x: 1560, y: 980, w: 900, h: 60 },
        { x: 2460, y: 1060, w: 1100, h: 60 },
        { x: 3830, y: 920, w: 820, h: 60 },
        { x: 4650, y: 1060, w: 950, h: 60 },
      ],
      platforms: [
        { x: 300, y: 840, w: 220, h: 22 },
        { x: 4900, y: 820, w: 220, h: 22 },
      ],
      acid: [{ x: 3560, y: 1200, w: 270, h: 60 }],
      hazards: [
        { type: 'steam', x: 1180, y: 1060, w: 76, h: 180 },
        { type: 'steam', x: 3400, y: 1060, w: 76, h: 180 },
        { type: 'ball', x: 2700, y: 1060, dir: 1, speed: 300, hp: 46 },
      ],
      zones: [
        { name: '进水闸口', triggerX: 0, spawns: [
          { type: 'fartling', x: 700, y: 1060, range: [420, 1400] },
          { type: 'poopling', x: 1180, y: 1060, range: [800, 1500] },
        ] },
        { name: '沉淀斜槽', triggerX: 1700, spawns: [
          { type: 'gasfish', x: 1850, y: 980, range: [1600, 2400] },
          { type: 'poopling', x: 2150, y: 980, range: [1700, 2400] },
          { type: 'fartling', x: 2380, y: 980, range: [1700, 2450], elite: true },
        ] },
        { name: '锈蚀管廊', triggerX: 3100, spawns: [
          { type: 'centipede', x: 3250, y: 1060, range: [2500, 3540] },
          { type: 'poopling', x: 3450, y: 1060, range: [2500, 3540] },
          { type: 'urinewisp', x: 3300, y: 820, flyY: 820, range: [2700, 3800] },
        ] },
        { name: '排洪栈桥', triggerX: 4200, spawns: [
          { type: 'gasfish', x: 4250, y: 920, range: [3830, 4640] },
          { type: 'centipede', x: 4500, y: 920, range: [3830, 4640] },
          { type: 'poopling', x: 5000, y: 1060, range: [4650, 5500] },
          { type: 'jellyfish', x: 5100, y: 700, flyY: 700, range: [4650, 5520] },
        ] },
      ],
      props: [
        { type: 'potion', x: 420, y: 1060 },
        { type: 'chest', x: 1320, y: 1060 },
        { type: 'scrap', x: 1700, y: 980 },
        { type: 'bandage', x: 2250, y: 980 },
        { type: 'chest', x: 3350, y: 1060 },
        { type: 'stim', x: 4300, y: 920 },
        { type: 'chest', x: 5050, y: 1060 },
        { type: 'scrap', x: 5350, y: 1060 },
      ],
      start: { x: 160, y: 1060 },
      exit: 5500,
      exitY: 1060,
    },
    {
      id: 'r2',
      name: '沉淀池',
      sub: 'ROOM 2 · 断桥与摆锤 · 双池落差',
      w: 6200, h: 1400,
      hint: '中央断桥下是酸池 · 摆锤会横扫桥面 · 别在传送带边久站',
      floors: [
        { x: 0, y: 1160, w: 1200, h: 60 },
        { x: 1200, y: 1020, w: 1500, h: 60 },
        { x: 3400, y: 1160, w: 900, h: 60 },
        { x: 4300, y: 1020, w: 800, h: 60 },
        { x: 5100, y: 1160, w: 1100, h: 60 },
      ],
      platforms: [
        { x: 2700, y: 1060, w: 700, h: 26 },
        { x: 2300, y: 760, w: 220, h: 22 },
      ],
      acid: [{ x: 2700, y: 1380, w: 700, h: 60 }],
      hazards: [
        { type: 'pendulum', x: 3050, y: 760, len: 280, amp: 0.95, period: 2.3, dmg: 24 },
        { type: 'pendulum', x: 4750, y: 720, len: 280, amp: 0.9, period: 2.5, dmg: 24 },
        { type: 'steam', x: 1500, y: 1020, w: 76, h: 190 },
        { type: 'steam', x: 5500, y: 1160, w: 76, h: 190 },
        { type: 'moving', x: 1400, y: 700, w: 170, h: 18, axis: 'x', from: 1300, to: 2000, speed: 110 },
      ],
      zones: [
        { name: '沉淀池东岸', triggerX: 0, spawns: [
          { type: 'fartling', x: 700, y: 1160, range: [300, 1180] },
          { type: 'poopling', x: 1050, y: 1160, range: [700, 1180] },
        ] },
        { name: '断桥上层', triggerX: 1400, spawns: [
          { type: 'gasfish', x: 1550, y: 1020, range: [1250, 2680] },
          { type: 'centipede', x: 1950, y: 1020, range: [1250, 2680], elite: true },
          { type: 'poopling', x: 2350, y: 1020, range: [1250, 2680] },
        ] },
        { name: '酸池对岸', triggerX: 3000, spawns: [
          { type: 'jellyfish', x: 3500, y: 700, flyY: 700, range: [2800, 4250] },
          { type: 'centipede', x: 3650, y: 1160, range: [3400, 4280] },
          { type: 'gasfish', x: 4050, y: 1160, range: [3400, 4280] },
        ] },
        { name: '双池回廊', triggerX: 4500, spawns: [
          { type: 'fartling', x: 4450, y: 1020, range: [4300, 5080], elite: true },
          { type: 'poopling', x: 4800, y: 1020, range: [4300, 5080] },
          { type: 'urinewisp', x: 4850, y: 640, flyY: 640, range: [4300, 5600] },
          { type: 'centipede', x: 5500, y: 1160, range: [5100, 6100] },
        ] },
      ],
      props: [
        { type: 'potion', x: 380, y: 1160 },
        { type: 'chest', x: 850, y: 1160 },
        { type: 'scrap', x: 1450, y: 1020 },
        { type: 'ward', x: 2250, y: 1020 },
        { type: 'chest', x: 3100, y: 1060 },
        { type: 'stim', x: 4800, y: 1020 },
        { type: 'chest', x: 5600, y: 1160 },
        { type: 'bandage', x: 5900, y: 1160 },
      ],
      start: { x: 160, y: 1160 },
      exit: 6100,
      exitY: 1160,
    },
    {
      id: 'r3',
      name: '沼气泵房',
      sub: 'ROOM 3 · 三根毒气烟囱 · 断口酸坑',
      w: 5800, h: 1360,
      hint: '地面被酸坑断开 · 传送带会推着你走 · 蒸汽口先嘶鸣再喷发',
      floors: [
        { x: 0, y: 1180, w: 1300, h: 60 },
        { x: 1300, y: 1040, w: 1100, h: 60 },
        { x: 2500, y: 1180, w: 1400, h: 60 },
        { x: 3900, y: 1030, w: 900, h: 60 },
        { x: 4800, y: 1060, w: 1000, h: 60 },
      ],
      platforms: [
        { x: 2250, y: 780, w: 200, h: 22 },
        { x: 4200, y: 760, w: 220, h: 22 },
      ],
      acid: [{ x: 2400, y: 1300, w: 200, h: 60 }],
      hazards: [
        { type: 'conveyor', x: 700, y: 1180, w: 500, h: 10, dir: 1, speed: 180 },
        { type: 'conveyor', x: 2600, y: 1180, w: 600, h: 10, dir: -1, speed: 190 },
        { type: 'steam', x: 350, y: 1180, w: 76, h: 190 },
        { type: 'steam', x: 1750, y: 1040, w: 76, h: 190 },
        { type: 'steam', x: 4300, y: 1030, w: 76, h: 190 },
        { type: 'ball', x: 3300, y: 1180, dir: -1, speed: 320, hp: 50 },
      ],
      zones: [
        { name: '泵房进水口', triggerX: 0, spawns: [
          { type: 'gasfish', x: 750, y: 1180, range: [300, 1280] },
          { type: 'poopling', x: 1100, y: 1180, range: [600, 1280] },
        ] },
        { name: '二号阀门', triggerX: 1300, spawns: [
          { type: 'gasfish', x: 1600, y: 1040, range: [1320, 2380] },
          { type: 'centipede', x: 2050, y: 1040, range: [1320, 2380], elite: true },
          { type: 'jellyfish', x: 2000, y: 680, flyY: 680, range: [1400, 2600] },
        ] },
        { name: '断口酸坑', triggerX: 2900, spawns: [
          { type: 'centipede', x: 3000, y: 1180, range: [2520, 3880] },
          { type: 'gasfish', x: 3400, y: 1180, range: [2520, 3880] },
          { type: 'fartling', x: 3700, y: 1180, range: [2520, 3880], elite: true },
        ] },
        { name: '泵房顶棚', triggerX: 4000, spawns: [
          { type: 'urinewisp', x: 4200, y: 640, flyY: 640, range: [3920, 5400] },
          { type: 'poopling', x: 4150, y: 1030, range: [3920, 4780] },
          { type: 'centipede', x: 4500, y: 1030, range: [3920, 4780] },
        ] },
      ],
      props: [
        { type: 'potion', x: 380, y: 1180 },
        { type: 'chest', x: 950, y: 1180 },
        { type: 'magnet', x: 1650, y: 1040 },
        { type: 'chest', x: 3050, y: 1180 },
        { type: 'ward', x: 3450, y: 1180 },
        { type: 'scrap', x: 4450, y: 1030 },
        { type: 'chest', x: 5200, y: 1060 },
        { type: 'potion', x: 5500, y: 1060 },
      ],
      start: { x: 160, y: 1180 },
      exit: 5700,
      exitY: 1060,
    },
    {
      id: 'r4',
      name: '腐臭回廊',
      sub: 'ROOM 4 · 长回廊 · 摆锤与滚粪球',
      w: 6400, h: 1420,
      hint: '回廊很长，边跑边打 · 摆锤横扫地头 · 重击可打碎滚粪球',
      floors: [
        { x: 0, y: 1200, w: 1700, h: 60 },
        { x: 1700, y: 1080, w: 800, h: 60 },
        { x: 2780, y: 1180, w: 1200, h: 60 },
        { x: 3980, y: 1040, w: 900, h: 60 },
        { x: 4880, y: 1180, w: 1520, h: 60 },
      ],
      platforms: [
        { x: 300, y: 900, w: 220, h: 22 },
        { x: 6000, y: 900, w: 220, h: 22 },
      ],
      acid: [{ x: 2500, y: 1380, w: 280, h: 60 }],
      hazards: [
        { type: 'pendulum', x: 3900, y: 740, len: 280, amp: 1.0, period: 2.4, dmg: 26 },
        { type: 'pendulum', x: 5200, y: 880, len: 280, amp: 0.95, period: 2.2, dmg: 24 },
        { type: 'conveyor', x: 3000, y: 1180, w: 700, h: 10, dir: -1, speed: 190 },
        { type: 'ball', x: 900, y: 1200, dir: 1, speed: 300, hp: 46 },
      ],
      zones: [
        { name: '回廊入口', triggerX: 0, spawns: [
          { type: 'fartling', x: 650, y: 1200, range: [300, 1680] },
          { type: 'poopling', x: 1250, y: 1200, range: [700, 1680] },
        ] },
        { name: '腐肉横梁', triggerX: 1700, spawns: [
          { type: 'centipede', x: 1850, y: 1080, range: [1700, 2480] },
          { type: 'gasfish', x: 2150, y: 1080, range: [1700, 2480] },
          { type: 'fartling', x: 2380, y: 1080, range: [1700, 2480], elite: true },
        ] },
        { name: '摆锤回廊', triggerX: 3000, spawns: [
          { type: 'centipede', x: 3150, y: 1180, range: [2800, 3960] },
          { type: 'gasfish', x: 3550, y: 1180, range: [2800, 3960] },
          { type: 'jellyfish', x: 3500, y: 780, flyY: 780, range: [2800, 4000] },
        ] },
        { name: '回廊尽头', triggerX: 4100, spawns: [
          { type: 'centipede', x: 4250, y: 1040, range: [3980, 4860], elite: true },
          { type: 'urinewisp', x: 4500, y: 620, flyY: 620, range: [4000, 5400] },
          { type: 'fartling', x: 4700, y: 1040, range: [3980, 4860] },
          { type: 'poopling', x: 5400, y: 1180, range: [4900, 6300] },
        ] },
      ],
      props: [
        { type: 'potion', x: 400, y: 1200 },
        { type: 'chest', x: 1000, y: 1200 },
        { type: 'antidote', x: 2100, y: 1080 },
        { type: 'chest', x: 3200, y: 1180 },
        { type: 'bandage', x: 3700, y: 1180 },
        { type: 'stim', x: 4400, y: 1040 },
        { type: 'chest', x: 5900, y: 1180 },
        { type: 'scrap', x: 5500, y: 1180 },
      ],
      start: { x: 160, y: 1200 },
      exit: 6300,
      exitY: 1180,
    },
    {
      id: 'r5',
      name: '痂香祭坛',
      sub: 'BOSS · 痂香巨魔',
      w: 5000, h: 1200,
      boss: true,
      hint: '打背部痂壳伤害更高 · 重击能打破它的架势 · 它有七种攻击方式',
      floors: [
        { x: 0, y: 1100, w: 5000, h: 60 },
      ],
      platforms: [
        { x: 150, y: 860, w: 600, h: 24 },
        { x: 4250, y: 860, w: 600, h: 24 },
      ],
      acid: [],
      hazards: [
        { type: 'steam', x: 900, y: 1100, w: 76, h: 200, clean: true },
        { type: 'steam', x: 3600, y: 1100, w: 76, h: 200, clean: true },
      ],
      zones: [
        { name: '痂香祭坛 · 巨魔', triggerX: 0, spawns: [
          { type: 'troll', x: 2600, y: 1100, range: [300, 4700] },
        ] },
      ],
      props: [
        { type: 'potion', x: 400, y: 1100 },
        { type: 'chest', x: 900, y: 1100 },
        { type: 'chest', x: 2600, y: 1100 },
        { type: 'bandage', x: 3600, y: 1100 },
        { type: 'chest', x: 4300, y: 1100 },
        { type: 'potion', x: 4700, y: 1100 },
      ],
      start: { x: 160, y: 1100 },
      exit: 0,
      exitY: 1100,
    },
  ];

  /* ===================== 关卡加长：每关 5 倍横向长度 =====================
     做法：把已授权的横向地图作为「一段」，重复 3 次并整体偏移 x；
     最末端追加一块平整的关底竞技场，放置本关专属迷你 BOSS。
     R5 为 BOSS 房，单独生成 3 段长廊 + 鳄鱼/巨魔终局竞技场。 */
  (function expandRooms() {
    const REPEATS = 3;
    const ARENA_W = 1400;
    const BOSS_TYPES = ['centipedeKing', 'gasfishKing', 'jellyMother', 'giantFoot', 'sewerCroc'];
    const BOSS_LABEL = ['百足蜈蚣', '沼气鱼人王', '水母母体', '巨人之脚', '下水道鳄鱼'];
    /* 每个关底竞技场拥有独立的立体结构（lift 为相对地面的高度） */
    const ARENA_LAYOUT = [
      // R1 百足蜈蚣：两侧高柱台，中间低台，适合上下绕背
      [{ x: 240, lift: 230, w: 200 }, { x: 620, lift: 110, w: 260 }, { x: 1060, lift: 250, w: 210 }],
      // R2 鱼人王：浅水酸池 + 跨池踏板，强调位移
      [{ x: 260, lift: 150, w: 230 }, { x: 900, lift: 150, w: 230 }, { x: 580, lift: 300, w: 190 }],
      // R3 水母母体：四根触须 + 左右高塔
      [{ x: 180, lift: 260, w: 180 }, { x: 1120, lift: 260, w: 180 }, { x: 640, lift: 340, w: 220 }],
      // R4 巨人之脚：宽阔平坦 + 两块掩体高台
      [{ x: 200, lift: 280, w: 220 }, { x: 980, lift: 280, w: 220 }, { x: 600, lift: 120, w: 260 }],
    ];

    function shiftedHazard(h, off) {
      const c = Object.assign({}, h);
      c.x = h.x + off;
      if (h.type === 'moving') {
        c.from = h.from + off;
        c.to = h.to + off;
      }
      return c;
    }
    function shiftedZone(z, off, tag) {
      const out = { name: z.name + tag, triggerX: z.triggerX + off };
      if (z.triggerY != null) out.triggerY = z.triggerY;
      out.spawns = z.spawns.map(function (sp) {
        const ns = Object.assign({}, sp);
        ns.x = sp.x + off;
        if (sp.range) ns.range = [sp.range[0] + off, sp.range[1] + off];
        return ns;
      });
      return out;
    }
    /* 亚种投放：从第二关开始，部分蜈蚣替换为马桶蜈蚣；第三关起部分水母替换为魔化水母 */
    function mutateSpawns(zones, ri) {
      if (ri <= 0) return;
      let cen = 0, jel = 0;
      for (let z = 0; z < zones.length; z++) {
        const sps = zones[z].spawns || [];
        for (let k = 0; k < sps.length; k++) {
          const t = sps[k].type;
          if (t === 'centipede') {
            cen++;
            if (cen % 2 === 1) sps[k].type = 'centipedeToilet';
          } else if (t === 'jellyfish') {
            jel++;
            if (ri >= 2 && jel % 2 === 1) sps[k].type = 'jellyDemon';
          }
        }
      }
    }

    for (let ri = 0; ri < 4; ri++) {
      const base = R.ROOMS[ri];
      const baseW = base.w;
      const arenaY = base.floors[base.floors.length - 1].y;
      const arenaStart = baseW * REPEATS;
      const W = arenaStart + ARENA_W;
      const floors = [], platforms = [], acid = [], hazards = [], zones = [], props = [];

      for (let r = 0; r < REPEATS; r++) {
        const off = r * baseW;
        const tag = r === 0 ? '' : (' · 第' + (r + 1) + '段');
        for (let i = 0; i < base.floors.length; i++) {
          floors.push({ x: base.floors[i].x + off, y: base.floors[i].y, w: base.floors[i].w, h: base.floors[i].h });
        }
        for (let i = 0; i < base.platforms.length; i++) {
          platforms.push({ x: base.platforms[i].x + off, y: base.platforms[i].y, w: base.platforms[i].w, h: base.platforms[i].h });
        }
        // 垂直地形变化：后续段插入少量高低错落的窄台，避免一路贴地直线推进
        if (r > 0) {
          const lift = r % 2 === 1 ? 110 : 60;
          platforms.push({ x: off + baseW * 0.26, y: arenaY - 120 - lift, w: 240, h: 22 });
          platforms.push({ x: off + baseW * 0.58, y: arenaY - 50 - lift, w: 200, h: 20 });
        }
        for (let i = 0; i < base.acid.length; i++) {
          acid.push({ x: base.acid[i].x + off, y: base.acid[i].y, w: base.acid[i].w, h: base.acid[i].h });
        }
        for (let i = 0; i < base.hazards.length; i++) hazards.push(shiftedHazard(base.hazards[i], off));
        for (let i = 0; i < base.props.length; i++) {
          props.push({ type: base.props[i].type, x: base.props[i].x + off, y: base.props[i].y });
        }
        for (let i = 0; i < base.zones.length; i++) zones.push(shiftedZone(base.zones[i], off, tag));
        // 情赌徒：每个房间第二段出现一名，站在首个地面上
        if (r === 1) {
          const gf = base.floors[0];
          props.push({ type: 'gambler', x: gf.x + off + Math.min(760, gf.w * 0.55), y: gf.y });
        }
      }

      // 关底竞技场：与最后一段地面同高、连续，避免接缝坠落
      floors.push({ x: arenaStart, y: arenaY, w: ARENA_W, h: 60 });
      const layout = ARENA_LAYOUT[ri];
      for (let i = 0; i < layout.length; i++) {
        platforms.push({ x: arenaStart + layout[i].x, y: arenaY - layout[i].lift, w: layout[i].w, h: 24 });
      }
      // 每个 BOSS 房的环境机关不同
      if (ri === 0) {
        hazards.push({ type: 'pendulum', x: arenaStart + 1180, y: arenaY - 420, len: 260, amp: 0.9, period: 2.6, dmg: 22 });
      } else if (ri === 1) {
        acid.push({ x: arenaStart + 80, y: arenaY, w: 300, h: 60 });
        acid.push({ x: arenaStart + 1020, y: arenaY, w: 300, h: 60 });
        hazards.push({ type: 'steam', x: arenaStart + 520, y: arenaY, w: 76, h: 200, clean: true });
        hazards.push({ type: 'steam', x: arenaStart + 820, y: arenaY, w: 76, h: 200, clean: true });
      } else if (ri === 3) {
        hazards.push({ type: 'steam', x: arenaStart + 120, y: arenaY, w: 76, h: 200, clean: true });
        hazards.push({ type: 'steam', x: arenaStart + 1200, y: arenaY, w: 76, h: 200, clean: true });
      }
      props.push({ type: 'potion', x: arenaStart + 240, y: arenaY });
      props.push({ type: 'chest', x: arenaStart + 700, y: arenaY });
      props.push({ type: 'bandage', x: arenaStart + 1180, y: arenaY });
      // R3 水母母体：地面四根可破坏触须
      const bossSpawns = [{ type: BOSS_TYPES[ri], x: arenaStart + 760, y: arenaY, range: [arenaStart - 80, W - 140] }];
      if (ri === 2) {
        const tx = [240, 500, 1020, 1160];
        for (let ti = 0; ti < tx.length; ti++) {
          bossSpawns.push({ type: 'tentacleBase', x: arenaStart + tx[ti], y: arenaY, range: [arenaStart + tx[ti] - 20, arenaStart + tx[ti] + 20] });
        }
      }
      zones.push({
        name: base.name + ' · 关底 · ' + BOSS_LABEL[ri],
        triggerX: arenaStart - 420,
        spawns: bossSpawns,
      });

      base.floors = floors;
      base.platforms = platforms;
      base.acid = acid;
      base.hazards = hazards;
      base.zones = zones;
      base.props = props;
      mutateSpawns(base.zones, ri);
      base.w = W;
      base.exit = W - 90;
      base.exitY = arenaY;
      base.long = true;
      base.miniBoss = BOSS_TYPES[ri];
      base.sub = base.sub + ' · 3 段长廊 · 关底迷你 BOSS';
      base.hint = base.hint + ' · 关底：' + BOSS_LABEL[ri] + ' · G 遗物栏';
    }

    // ---- R5：3 段长廊 + 下水道鳄鱼 + 痂香巨魔 ----
    const b5 = R.ROOMS[4];
    const SEG = 5000, N = 3, arenaStart = SEG * N, arenaW = 2500, W = arenaStart + arenaW;
    const floors = [], platforms = [], hazards = [], zones = [], props = [];
    const POOLS = [
      [
        [{ type: 'gasfish', x: 1100, range: [500, 2200] }, { type: 'poopling', x: 1500, range: [900, 2400] }],
        [{ type: 'centipede', x: 2800, range: [2300, 3700] }, { type: 'jellyfish', x: 3000, y: 700, flyY: 700, range: [2400, 3800] }],
        [{ type: 'fartling', x: 4200, range: [3700, 4900] }, { type: 'urinewisp', x: 4300, y: 620, flyY: 620, range: [3700, 4900] }],
      ],
      [
        [{ type: 'gasfish', x: 1200, range: [500, 2300], elite: true }, { type: 'centipede', x: 1650, range: [900, 2400] }],
        [{ type: 'jellyfish', x: 2900, y: 700, flyY: 700, range: [2300, 3800] }, { type: 'urinewisp', x: 3200, y: 620, flyY: 620, range: [2400, 3900] }, { type: 'poopling', x: 2600, range: [2200, 3600] }],
        [{ type: 'centipede', x: 4300, range: [3700, 4900], elite: true }, { type: 'gasfish', x: 4000, range: [3700, 4900] }],
      ],
      [
        [{ type: 'fartling', x: 1250, range: [500, 2400], elite: true }, { type: 'poopling', x: 1600, range: [900, 2500] }],
        [{ type: 'gasfish', x: 2700, range: [2300, 3700] }, { type: 'gasfish', x: 3100, range: [2400, 3800], elite: true }],
        [{ type: 'centipede', x: 4200, range: [3700, 4900] }, { type: 'jellyfish', x: 4400, y: 700, flyY: 700, range: [3700, 4900] }, { type: 'urinewisp', x: 3900, y: 620, flyY: 620, range: [3700, 4900] }],
      ],
    ];
    const ZTRIG = [600, 2400, 3800];
    for (let r = 0; r < N; r++) {
      const off = r * SEG;
      floors.push({ x: off, y: 1100, w: SEG, h: 60 });
      // 垂直起伏：不同段落的悬空台高度交替变化，并提供一处高位跳台
      const lift = r % 2 === 1 ? 90 : 0;
      platforms.push({ x: off + 1200, y: 860 - lift, w: 260, h: 22 });
      platforms.push({ x: off + 3200, y: 900 - lift, w: 220, h: 22 });
      if (r > 0) platforms.push({ x: off + 520, y: 760 - (r % 2) * 60, w: 190, h: 20 });
      hazards.push({ type: 'steam', x: off + 2500, y: 1100, w: 76, h: 200, clean: (r % 2 === 0) });
      props.push({ type: 'potion', x: off + 400, y: 1100 });
      props.push({ type: 'chest', x: off + 1900, y: 1100 });
      props.push({ type: 'scrap', x: off + 3400, y: 1100 });
      if (r % 3 === 0) props.push({ type: 'bandage', x: off + 4400, y: 1100 });
      if (r === 1) props.push({ type: 'gambler', x: off + 2400, y: 1100 });
      const pool = POOLS[r % 3];
      for (let k = 0; k < 3; k++) {
        const spawns = pool[k].map(function (sp) {
          const ns = Object.assign({}, sp);
          ns.x = sp.x + off;
          ns.y = sp.y == null ? 1100 : sp.y;
          ns.range = [sp.range[0] + off, sp.range[1] + off];
          return ns;
        });
        zones.push({ name: '沼气长廊 · 第 ' + (r + 1) + ' 段', triggerX: off + ZTRIG[k], spawns: spawns });
      }
    }
    floors.push({ x: arenaStart, y: 1100, w: arenaW, h: 60 });
    platforms.push({ x: arenaStart + 300, y: 860, w: 300, h: 24 });
    platforms.push({ x: arenaStart + 760, y: 760, w: 220, h: 22 });
    platforms.push({ x: arenaStart + 1500, y: 860, w: 260, h: 24 });
    platforms.push({ x: arenaStart + 1980, y: 740, w: 240, h: 22 });
    hazards.push({ type: 'steam', x: arenaStart + 560, y: 1100, w: 76, h: 200, clean: true });
    hazards.push({ type: 'steam', x: arenaStart + 1760, y: 1100, w: 76, h: 200, clean: true });
    props.push({ type: 'potion', x: arenaStart + 260, y: 1100 });
    props.push({ type: 'chest', x: arenaStart + 1200, y: 1100 });
    props.push({ type: 'chest', x: arenaStart + 2150, y: 1100 });
    zones.push({
      name: '痂香祭坛 · 下水道鳄鱼', triggerX: arenaStart + 400,
      spawns: [{ type: 'sewerCroc', x: arenaStart + 850, y: 1100, range: [arenaStart + 100, arenaStart + 1700] }],
    });
    zones.push({
      name: '痂香祭坛 · 痂香巨魔', triggerX: arenaStart + 1500,
      spawns: [{ type: 'troll', x: arenaStart + 2050, y: 1100, range: [arenaStart + 1500, arenaStart + 2450] }],
    });
    /* 竞技场中央的深水池：鳄鱼逃入 / 终局合体登场处 */
    b5.water = [{ x: arenaStart + 780, y: 1096, w: 620, h: 70 }];

    b5.w = W;
    b5.h = 1200;
    b5.floors = floors;
    b5.platforms = platforms;
    b5.acid = [];
    b5.hazards = hazards;
    b5.zones = zones;
    mutateSpawns(b5.zones, 4);
    b5.props = props;
    b5.start = { x: 160, y: 1100 };
    b5.exit = 0;
    b5.exitY = 1100;
    b5.long = true;
    b5.miniBoss = 'sewerCroc';
    b5.sub = 'BOSS · 3 段沼气长廊 · 下水道鳄鱼 + 痂香巨魔';
    b5.hint = '鳄鱼受创会逃入水池，巨魔倒下后它会钻出吞噬合体 · G 遗物栏';
  })();

  /* ===================== 肉鸽情报：敌人说明 ===================== */
  R.MONSTER_INFO = {
    fartling: '沼气小鬼 · 地面近战，会蓄力扑击；低血量，成群出现。',
    poopling: '粪团子 · 会主动跳向玩家，落地溅射污液。',
    gasfish: '沼气鱼人 · 吐沼气弹，弹道较慢，可跳跃换位。',
    centipede: '百足幼虫 · 贴地爬行、速度快，会突进撕咬。',
    urinewisp: '尿光幽火 · 低血量飞行单位，绕圈骚扰，伤害极低。',
    jellyfish: '水母 · 漂浮单位，靠近后释放触须电击。',
    centipedeToilet: '马桶蜈蚣 · 亚种 · 瓷甲减伤 50%，移动更慢但撞击更重，第二关起出现。',
    jellyDemon: '魔化水母 · 亚种 · 脉冲频率×2.2，触手带毒，命中后持续掉血，第三关起出现。',
    troll: '痂香巨魔 · 最终 BOSS，三阶段；践踏、横扫、召唤沼气喷发。',
    centipedeKing: '百足蜈蚣 · 关底迷你 BOSS；冲锋、尾扫、毒雾，二阶段提速。',
    gasfishKing: '沼气鱼人王 · 关底迷你 BOSS；扇形沼气弹、砸地、召唤鱼人。',
    jellyMother: '水母母体 · 关底迷你 BOSS；悬空漂浮并笼罩护盾，必须先破坏地面四根触须才能伤到本体。',
    giantFoot: '巨人之脚 · 关底迷你 BOSS；踏地、踢击、跃起砸地，血量极高。',
    killerCroc: '痂香杀手鳄 · 终局合体 BOSS；吞噬巨魔后满血登场，背生红色触手、全身血色鳞甲，攻击更快更狠。',
    tentacleBase: '水母触须 · 地面可破坏目标；四根全部破坏后，水母母体才可被攻击。',
    sewerCroc: '下水道鳄鱼 · 关底迷你 BOSS；撕咬、尾扫、泡沫弹幕。',
  };

  /* ===================== 关卡元信息 ===================== */
  R.LEVEL = {
    name: '痂香下水道',
    sub: '第一层 · 腐痂层',
    next: '第二层 · 发酵墓窖（待续）',
  };

  BVN.ROGUE_DATA = R;
})(window.BVN);

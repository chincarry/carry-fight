# 第五轮扩展 Spec — 20 件新遗物 / 特殊遗物升级 / 怪物亚种 / 肉鸽奥义动作

## 1. 目标与范围

在现有肉鸽模式（`js/rogue-data.js` 数据层、`js/rogue.js` 逻辑层、`js/rogue-art.js` 绘制层）上完成四项需求，不重写既有系统、不新增图片资源：

1. `R.RELICS` 新增 20 件全新遗物（复活、元素附伤、额外按键技能等）。
2. 特殊效果遗物（布尔/触发型）随等级提升效果强度，并在遗物栏正确显示。
3. 为每种常规怪物新增 3 个亚种、为每个关底迷你 BOSS 新增 3 个亚种；亚种按 `roomIndex` 递进投放，越强越靠后。
4. 肉鸽超必杀（V）增加与格斗模式一致的角色奥义动作演出，不再只有立绘 cut-in。

**非目标**：不改格斗模式（`js/super.js` / `js/fighter.js`）逻辑；不改现有 24 件遗物数值；不引入外部素材。

---

## 2. 数据层改动 — `js/rogue-data.js`

### 2.1 新增 20 件遗物（追加到 `R.RELICS`，位于现有特殊遗物之后、隐藏作弊遗物之前）

| id | 名称 | desc | mods | icon |
|---|---|---|---|---|
| `phoenix` | 涅槃羽 | 死亡时消耗 1 次复活，回复 35% 生命（每级 +1 次 / +8%） | `{ revive: 1 }` | `wing` |
| `ember` | 余烬符 | 攻击有概率点燃敌人，持续灼烧 | `{ elemFire: 1 }` | `rune` |
| `venom` | 毒髓 | 攻击有概率使敌人中毒持续掉血 | `{ elemPoison: 1 }` | `heart` |
| `thunder` | 雷纹 | 攻击有概率雷击僵直并弹射电弧 | `{ elemShock: 1 }` | `rune` |
| `frostbite` | 霜蚀 | 攻击附加冰缓，降低敌人移速 | `{ elemIce: 1 }` | `rune` |
| `wave` | 圣光波 | 解锁 T 键：向前释放贯穿光波 | `{ extraSkill: 'wave' }` | `arrow` |
| `bind` | 缚魂锁 | 解锁 F 键：束缚周围敌人 | `{ extraSkill: 'bind' }` | `rune` |
| `mend` | 生命之泉 | 解锁 H 键：回复自身生命 | `{ extraSkill: 'mend' }` | `heart` |
| `aegis` | 守护结界 | 解锁 N 键：短时大幅减伤 | `{ extraSkill: 'aegis' }` | `shield` |
| `elementalist` | 元素使者 | 所有元素效果强度 +14% | `{ elemDmg: 0.14 }` | `rune` |
| `pyroclasm` | 熔岩之心 | 火焰附着 + 伤害 +15% | `{ elemFire: 1, dmg: 0.15 }` | `fist` |
| `plague` | 疫病之种 | 中毒附着 + 周围减速 | `{ elemPoison: 1, slowField: 0.2 }` | `mask` |
| `glacier` | 冰川之核 | 冰缓附着 + 冻结概率 | `{ elemIce: 1, freeze: 0.1 }` | `rune` |
| `stormcaller` | 风暴之眼 | 雷击附着 + 连锁概率 | `{ elemShock: 1, chain: 0.15 }` | `rune` |
| `vampire` | 血族圣痕 | 击杀回复 20，残血伤害 +20% | `{ lifesteal: 20, lowHpDmg: 0.2 }` | `heart` |
| `bulwark` | 守护者 | 受到伤害 -15%，反伤 +20 | `{ shield: 0.15, thorns: 20 }` | `shield` |
| `manaflow` | 灵脉 | 技能伤害 +25%，技能冷却 -20% | `{ skillDmg: 0.25, skillCd: -0.2 }` | `rune` |
| `zealot` | 狂热 | 攻速 +15%，连击三段 +25% | `{ atkSpeed: 0.15, comboBoost: 0.25 }` | `gloves` |
| `scrapper` | 拾荒专家 | 废料 +30%，远程伤害 +20% | `{ scrap: 0.3, rangedDmg: 0.2 }` | `pack` |
| `lastStand` | 背水一战 | 最大生命 +60，残血伤害 +35% | `{ maxHp: 60, lowHpDmg: 0.35 }` | `rune` |

> 合计 20 条，全部 `hidden` 缺省，进入普通掉落池。

### 2.2 新增亚种数据

- 在 `R.MONSTERS` 内追加：
  - 常规怪亚种 18 条：`fartling` / `poopling` / `gasfish` / `centipede` / `urinewisp` / `jellyfish` 各 3 条。
  - 迷你 BOSS 亚种 15 条：`centipedeKing` / `gasfishKing` / `jellyMother` / `giantFoot` / `sewerCroc` 各 3 条。
- 每条字段：`baseType`（行为/绘制骨架复用）、`tier`（1/2/3）、独立 `name`、`desc`、`colors`、`hp`、`w/h`、`touch`、`speed`、`atkRate`（可选）、`armor`/`poison`（可选）、`mb`（迷你 BOSS 必填，复制基础值）。
- 数值梯度：T1 ≈ 基础 ×1.25、T2 ≈ ×1.7、T3 ≈ ×2.3（血量）；伤害/移动/攻速同步小幅上调。
- 不新增 `troll` / `killerCroc` 亚种：二者是剧情唯一首领，其强度由既有 `roomScale().bossHp/bossDmg` 逐关成长承担。

新增索引表：

```js
R.VARIANTS = {
  fartling: ['fartlingA','fartlingB','fartlingC'],
  poopling: ['pooplingA','pooplingB','pooplingC'],
  gasfish: ['gasfishA','gasfishB','gasfishC'],
  centipede: ['centipedeA','centipedeB','centipedeC'],
  urinewisp: ['urinewispA','urinewispB','urinewispC'],
  jellyfish: ['jellyfishA','jellyfishB','jellyfishC'],
  centipedeKing: ['centipedeKingA','centipedeKingB','centipedeKingC'],
  gasfishKing: ['gasfishKingA','gasfishKingB','gasfishKingC'],
  jellyMother: ['jellyMotherA','jellyMotherB','jellyMotherC'],
  giantFoot: ['giantFootA','giantFootB','giantFootC'],
  sewerCroc: ['sewerCrocA','sewerCrocB','sewerCrocC'],
};
```

> 亚种 `type` 自带 `baseType`；`m.type` 仍解析为基础类型，所有既有 `m.type === 'xxx'` 特殊逻辑（水母护盾、鳄鱼逃跑、巨魔合体、BOSS 动作池）继续生效。

---

## 3. 逻辑层改动 — `js/rogue.js`

### 3.1 属性系统扩展

`baseMods()` 新增字段：

```js
revive: 0, reviveHeal: 0,
elemFire: 0, elemPoison: 0, elemShock: 0, elemIce: 0, elemDmg: 0,
skills: {},                 // { wave: lv, bind: lv, mend: lv, aegis: lv }
freezeDur: 0, chainJumps: 0, chainDmg: 0,
trapLv: 0, trapDmg: 0, trapInterval: 0, trapR: 0,
explodeR: 0, explodeDmg: 0, slowR: 0, glideLv: 0
```

`applyMods(m, r, lv)` 增加第三参数 `lv`（BUFF 调用时传 1）：

- `revive`：`m.revive += lv`；`m.reviveHeal = max(m.reviveHeal, 0.35 + 0.08*lv)`（上限 0.75）。
- `elemFire/venom/shock/ice`：记录为 `m.elemFire = max(m.elemFire, lv)` 等。
- `elemDmg`：累加。
- `extraSkill`：`m.skills[r.extraSkill] = max(现有, lv)`。
- `freeze`：数值仍叠概率；`m.freezeDur = max(..., 1.0 + 0.25*lv)`。
- `chain`：概率叠；`m.chainJumps = max(..., lv)`；`m.chainDmg = max(..., 0.45 + 0.1*lv)`。
- `trap`：不再按倍率叠 `m.trap`；改用 `m.trapLv = max(..., lv)`，并派生 `trapDmg = 70*(1+0.6*(lv-1))`、`trapInterval = max(1.6, 4 - 0.5*(lv-1))`、`trapR = 90 + 12*lv`。
- `explode`：`m.explode = true`；`explodeR = 130 + 25*lv`；`explodeDmg = 10 + 6*lv`。
- `slowField`：数值叠；`slowR = 320 + 40*lv`。
- `glide`：`m.glide = true`；`m.glideLv = max(..., lv)`；`m.jumpMul += 0.05*(lv-1)`。

`scaledRelicMods(mods, lv)` 跳过上述特殊键（`revive / elemFire / elemPoison / elemShock / elemIce / elemDmg / extraSkill / explode / trap / glide`），避免双重放大；`freeze / chain / shield` 保留数值缩放与上限。

`applyAllMods()` 末尾同步：

```js
p.reviveLeft = Math.max(p.reviveLeft || 0, m.revive);
```

`resetRun` 增加 `p.reviveLeft = 0; p.superAnim = null; RG.extraCd = { wave:0, bind:0, mend:0, aegis:0 };`

### 3.2 复活

新增 `tryRevive(p)`：

- 若 `p.reviveLeft > 0`：`p.reviveLeft--`，`p.hp = max(1, round(hpMax * m.reviveHeal))`，`p.invuln = 2.2`，清空 `hurtT`，`FX.ring/text`、`toast('涅槃 · 复活 x 次剩余')`、`sfx('holy')`，返回 true。
- 在 `hurtPlayer()` 与 `hurtPlayerTiny()` 的死亡分支中，`RG.screen='dead'` 之前调用；成功则直接 return，不进入死亡页。

### 3.3 元素附着

新增 `applyElements(m, dmg, kind)`，在 `hitMonster()` 的冻结/连锁之后调用：

- 火焰：概率 `min(0.85, 0.18 + 0.10*lv)`；`m.burnT = 3 + 0.6*lv`；`m.burnDps = (8 + 5*lv) * elemDmgMul`。
- 中毒：概率 `min(0.9, 0.22 + 0.10*lv)`；`m.poisonT = 4 + 0.8*lv`；`m.poisonDps = (6 + 4*lv) * elemDmgMul`。
- 雷击：概率 `min(0.8, 0.20 + 0.10*lv)`；`m.stun = max(m.stun, 0.35 + 0.10*lv)`；对最近另一敌人追加 `(30 + 10*lv)` 电击伤害（`RG.chainLock` 保护）。
- 冰缓：概率 `min(0.85, 0.20 + 0.10*lv)`；`m.chillT = 2 + 0.5*lv`；`m.chillMul = 0.30 + 0.05*lv`。
- `elemDmgMul = 1 + m.elemDmg`；BOSS 抗性：持续时间 ×0.5、概率 ×0.5。
- 表现：按元素色调用 `FX.text` + `FX.hitSpark`（火 #ff8a3a / 毒 #9fe06a / 雷 #8ad8ff / 冰 #bfe8ff）。

怪物持续伤害：在 `updateMonsters()` 每帧递减 `burnT/poisonT/chillT`，每 0.45s 结算一次 DOT（直接扣血、`m.hurt=0.1`、累计 `RG.totalDmg`、`hp<=0` 走 `killMonster`），不走 `hitMonster` 以避免元素递归；`chillT>0` 时水平速度 ×(1-chillMul)，并在 `drawMonster` 叠加冰蓝色调。

### 3.4 额外技能（独立按键）

键位（避开已占用键）：

- `KeyT` → `wave` 圣光波
- `KeyF` → `bind` 缚魂锁
- `KeyH` → `mend` 生命之泉
- `KeyN` → `aegis` 守护结界

在 `updatePlayer()` 中检测 `p.mods.skills[key] && RG.extraCd[key] <= 0` 后释放；冷却按等级 `cd = 10 - 1.2*(lv-1)`（最低 4s），全局每帧递减。

效果：

- `wave`：生成贯穿光波（`RG.pShots`，pierce 99，伤害 `88*(1+0.25*(lv-1))*skillMul`，宽 46、速度 900），命中连锁触发元素。
- `bind`：500 范围内敌人 `m.rootT = 1.5 + 0.35*lv`，期间 `updateMonsters` 跳过移动与出招（BOSS 抗性 ×0.5）。
- `mend`：回复 `round(hpMax * (0.10 + 0.04*lv))`，不超上限。
- `aegis`：`p.shieldT = 4`，`p.shieldMul = min(0.55, 0.25 + 0.06*lv)`，金色护罩（沿用既有 `shieldT/shieldMul` 减伤）。

HUD：`drawHUD` 左下新增已获得技能的按键圆钮（T/F/H/N + 名称 + 冷却秒数），未获得不显示。

### 3.5 特殊遗物升级落地

- `updateTraps()` 改为使用 `trapLv/trapInterval/trapDmg/trapR`。
- `killMonster()` 爆炸改用 `explodeR / explodeDmg`。
- `updateMonsters()` 减速场半径改用 `slowR`；冰缓处理见 3.3。
- `chainLightning()` 支持 `chainJumps` 连续跳数（每跳伤害按 `chainDmg` 递减）。
- 冻结时长改用 `freezeDur`。
- `relicLevelNote()` / `relicValueText()` 增加新键中文标签与 Lv1→5 数值；对 `revive/elem*/extraSkill/trap/explode` 输出派生值（次数、概率、持续、伤害、冷却），并移除“特殊效果恒定”错误提示。

---

## 4. 亚种投放 — `js/rogue.js`

新增：

```js
function variantTierCap() { return [0, 1, 2, 3, 3][clamp(RG.roomIndex, 0, 4)]; }
function resolveMonsterType(baseType, idx, elite, mini) { ... }
```

- `mini`（粪精分裂小体）不替换，保持基础类型。
- `cap=0`（第 1 关）不替换。
- 候选集：`elite` 只取 `tier===cap`；普通怪取 `[cap-1, cap]` 两档，`idx % 候选数` 选取，保证同关有变化且第 5 关必为 T3。
- `spawnMonster()` 先 `resolved = resolveMonsterType(...)`，再 `def = D.MONSTERS[resolved]`；`m.type = def.baseType || resolved`；`startBossIntro(def, resolved)` 与 `RG.introSeen[resolved]` 使用解析后类型。
- 难度叠加不变：亚种基础数值 × 既有 `roomScale()`。

---

## 5. 肉鸽超必杀动作 — `js/rogue.js`

### 5.1 状态与驱动

`castSuper(p)` 扩展 `RG.superCut`：

```js
{ t, dur, hitT, hit, def, id, act:0, actDur }
```

并设置 `p.superAnim = { t:0, hero:true, def }`。

`RG.update` 的冻结分支中，除推进 `cut.t` 外调用 `updateSuperPose(p, dt)`：按 `cut.t / dur` 推进 `p.superAnim.t`，用与 `fighter.js` `ultPose` 相同的关键帧数据（8 角色）驱动 `p.pose` 插值；不同阶段（蓄力 / 突进 / 终结）切换姿态段。

### 5.2 演出绘制（重写 `drawSuperCut`）

- **阶段 A（0 ~ 40% dur）**：保留现有黑幕 + 速度线 + 真人立绘 + 奥义文字。
- **阶段 B（40% ~ 结束）**：立绘淡出，屏幕中央以 1.55 倍比例绘制角色本体（`Art.drawFighter`，使用 `p.pose` 与 `glow`），配合：
  - 角色主色径向光与残影（每 0.06s 记录一次 alpha 0.25 剪影）；
  - 蓄力段的能量汇聚环；
  - `hitT` 瞬间白闪 + 主色冲击环 + 屏幕震动；
  - 角色突进位移（±120px 往返），表现“出招动作”；
  - 底部保留当前奥义名与角色名。
- 阶段 B 不再覆盖全屏纯黑，改为 0.72 压暗 + 中央聚光，确保角色动作可读。
- `drawSuperCut` 在 `drawWorldScene` 之后绘制（既有顺序），无需改 `RG.draw`。

---

## 6. 绘制层 — `js/rogue-art.js`

- `drawRelicIcon` 的图标集合已覆盖 `arrow/rune/heart/shield/...`，20 件新遗物只复用现有 icon，不新增图标绘制。
- `drawMonster`：当 `m.chillT > 0` 时在怪物身上叠加冰蓝色半透明覆盖层与霜粒；`m.rootT > 0` 时绘制地面束缚锁链/藤蔓。亚种配色通过 `m.def.colors` 自动生效。
- `drawHUD`（rogue.js 内）新增额外技能按钮；亚种不新增绘制分支。

---

## 7. 验收标准

1. 遗物总表新增 20 条，掉落池可抽到；遗物栏显示新遗物等级数值与 Lv1→5 变化。
2. 复活遗物：死亡时消耗次数并复活，剩余次数在 HUD/遗物栏可见；次数耗尽才进入死亡结算。
3. 元素：命中触发火焰/中毒/雷击/冰缓，出现对应颜色反馈，DOT 正常跳伤且击杀会计入统计。
4. 额外技能：获得遗物后按 T/F/H/N 可释放，冷却正常，未获得时按键无效。
5. 亚种：第 1 关为原种；第 2~5 关逐级出现 T1→T3 亚种；同关至少两种亚种混排；亚种名称/配色/数值与基础种不同；水母护盾、鳄鱼逃跑、巨魔吞噬等特殊逻辑不回归。
6. 奥义：V 键演出前段立绘、后段角色本体动作（8 角色姿态不同）、命中冲击与文字完整；不再出现“只有立绘没有动作”。
7. 语法检查（`osascript -l JavaScript`）、JXA 逻辑断言、`dist/index.html` 重建、无头截图验证均通过。

---

## 8. 涉及文件

- `js/rogue-data.js`：新增 20 遗物 + 33 亚种 + `R.VARIANTS`。
- `js/rogue.js`：属性系统、复活、元素、额外技能、亚种投放、超必杀动作、UI 文本。
- `js/rogue-art.js`：冰缓/束缚状态绘制。
- `dist/index.html`：构建产物重建。

## 9. 验证命令

```bash
cat /tmp/rg_head.js js/rogue-data.js js/rogue.js /tmp/rg_tail.js > /tmp/rg_test.js
osascript -l JavaScript /tmp/rg_test.js
python3 /tmp/build_single.py
```

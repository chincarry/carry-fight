# AI 交接手册 · 陈锴瑞 VS 陈锴瑞（carry-fight）

> **版本 v2 · 2026-11-08**。本文档写给下一位接手本项目的 AI/工程师。旧版 v1（2026-11-05）只覆盖格斗模式的 v1~v4；本版新增「爬塔肉鸽模式」的架构、数据契约、扩展配方、QA 流程与踩坑记录。
>
> 推荐阅读顺序：本文 §0~§3 → `开发日志.md`（五轮改动逐项记录）→ `spec.md` / `tasks.md`（第五轮规格与任务）→ `docs/design-v3.md`（格斗模式详细设计）。

---

## 0. 接手前必读（紧急）

1. **肉鸽模式代码尚未提交**。`git status` 当前显示：
   - 未跟踪：`js/rogue-data.js`、`js/rogue-rig.js`、`js/rogue-art.js`、`js/rogue.js`、`js/leaderboard.js`、`assets/rogue/`、`server/leaderboard_server.py`、`server/leaderboard.db*`、`spec.md`、`tasks.md`、`checklist.md`、`开发日志.md`；
   - 已修改未提交：`dist/index.html`、`index.html`、`js/game.js`、`tools/build-single.js`。
2. **禁止**执行 `git reset --hard`、`git checkout -- .`、`git clean -fd`。这些操作会直接抹掉五轮开发成果。接手第一步建议先提交或至少备份工作区。
3. 最近一次提交是 `9019c41 docs: AI 交接文档 + QA 验收脚手架入库`，它**不包含**肉鸽模式代码。
4. **不要手改 `dist/index.html`**。它是构建产物，改源码后必须用 `node tools/build-single.js` 重建。
5. 当前产物：`dist/index.html`，5,313,948 字节，构建时间 2026-11-08 00:00。

---

## 1. 项目速览

| 项 | 内容 |
|---|---|
| 项目 | 致敬《死神 VS 火影》的 2D 横版动作游戏「陈锴瑞 VS 陈锴瑞 · 八相乱斗」 |
| 技术栈 | 原生 HTML5 Canvas 2D + 原生 JS；零框架、零 npm 依赖、零外部 CDN；无 ES Module |
| 画布 | 固定 1280×720，逻辑 60FPS，逻辑与渲染分离 |
| 运行方式 | 根目录 `index.html` 与 `dist/index.html` 均可 `file://` 双击直接运行 |
| 命名空间 | 全局 `BVN`，各文件 IIFE 挂载；加载顺序敏感 |
| 双模式 | 格斗模式（街机 / 对战 / P2P 联机）+ 爬塔肉鸽模式（普通爬塔 / BOSS 连战 / 图鉴 / 排行榜） |
| 角色 | 8 名（hannya / angel / boxer / dancer / dragon / warlock / ranger / ronin），真人立绘 + Canvas 骨骼动画 |
| 仓库 | `github.com/chincarry/carry-fight`，主分支 `main` |
| 部署 | 用户手动把 `dist/index.html` 上传到站点根目录；AI 交付到 dist 即可 |

**模式入口**（`js/game.js` 标题菜单）：

| 菜单项 | 行为 |
|---|---|
| 0 | 街机模式 `G.gotoSelect('arcade')` |
| 1 | 肉鸽模式 `BVN.Rogue.open()` |
| 2 | 对战模式 `G.gotoSelect('versus')` |
| 3 | 联机大厅 `BVN.Netplay.enterLobby()` |
| 4 | 修改联机昵称 |
| 5 | AI 难度切换 |
| 6 | 帮助页 |
| 7 | 肉鸽图鉴 `BVN.Rogue.openCodex()` |

`game.js` 在 `G.phase === 'rogue'` 时把 `update(dt)` 与 `draw(ctx)` 转发给 `BVN.Rogue`。

---

## 2. 目录与文件地图

```
carry格斗/
├── index.html                 # 源码态入口（script 标签顺序见 §3）
├── css/style.css
├── assets/
│   ├── chars/*.jpg            # 8 角色立绘（构建时 base64 内联）
│   ├── assists/*.jpg          # 7 援助立绘
│   └── rogue/*.png            # 7 张肉鸽怪手绘贴图（构建时注入 ROGUE_SPRITE_DATA）
├── js/
│   ├── vendor/peerjs.min.js
│   ├── data.js                # CFG + 8 角色 + 奥义/技能数据
│   ├── net-config.js
│   ├── audio.js / effects.js
│   ├── art.js                 # 立绘裁切、角色骨骼、Art.kit 绘图工具
│   ├── art-bg.js / art-assist.js
│   ├── skills.js / super.js / super-field-moves.js / super-field.js
│   ├── assist.js / fighter.js / ai.js
│   ├── net.js / netplay.js
│   ├── rogue-data.js          # 肉鸽数据层（唯一数据源）
│   ├── rogue-rig.js           # 肉鸽怪物骨骼
│   ├── rogue-art.js           # 肉鸽场景/UI/怪物绘制
│   ├── rogue.js               # 肉鸽逻辑与全部界面状态机
│   ├── leaderboard.js         # 肉鸽排行榜
│   └── game.js                # 主循环、标题、帮助、模式转发
├── tools/
│   ├── build-single.js        # 单文件打包（JS_ORDER 必须与 index.html 一致）
│   └── qa-harness.js          # 格斗模式 Playwright 验收脚手架
├── server/
│   ├── leaderboard_server.py  # 排行榜后端
│   └── leaderboard.db*
├── dist/index.html            # 构建产物，勿手改
├── spec.md / tasks.md / checklist.md   # 第五轮规格、任务、验收
├── 开发日志.md                 # 五轮改动逐项日志（含附录）
├── docs/AI-HANDOVER.md        # 本文
├── docs/design-v3.md          # 格斗模式 v3/v4 设计与实施记录
├── README.md / 部署指南.md
└── 陈锴瑞VS陈锴瑞-单文件版.html  # 早期快照，可忽略
```

体量参考：`rogue.js` 约 7,667 行，`rogue-data.js` 1,189 行，`rogue-rig.js` 934 行，`rogue-art.js` 2,766 行。

---

## 3. 加载顺序铁律

`index.html` 与 `tools/build-single.js` 的 `JS_ORDER` 必须完全一致。当前顺序：

```
peerjs.min.js → data.js → net-config.js → audio.js → effects.js
→ art.js → art-bg.js → art-assist.js
→ skills.js → super.js → super-field-moves.js → super-field.js
→ assist.js → fighter.js → ai.js → net.js → netplay.js
→ rogue-data.js → rogue-rig.js → rogue-art.js → rogue.js
→ leaderboard.js → game.js
```

- 肉鸽四件套的依赖方向：`data → rig → art → logic`；`rogue.js` 只依赖前三者与 `Art/FX/Sfx/Game/Fighter`，最终被 `game.js` 反向调用。
- 新增任何 js 文件，必须同时改 `index.html` 与 `tools/build-single.js`，否则 dist 会缺文件或顺序错乱。

---

## 4. 格斗模式核心速查

### 4.1 数值契约（`js/data.js` 的 `CFG`）

| 字段 | 值 | 说明 |
|---|---|---|
| `MAX_HP` | 2000 | 第三期翻倍（原 1000） |
| `DMG_SCALE` | 1 | 伤害缩放唯一出口，位于 `Fighter.receiveHit`；血量翻倍但伤害不变是**用户明确决策** |
| `ROUND_TIME` | 150 | 回合秒数 |
| `SUPER_MAX` / 回充 | 100 / 命中 0.10、受击 0.04、每秒 1.6、完美格挡 8 | 奥义槽 |

### 4.2 霸体分级

`setArmor(level, frames)` 只升不降，计时自然回落；Lv3 最高。招式的 `armorWindows: [{s,e,level}]` 数据驱动；`unblockable` 不可防、`armorBreak` 破霸体、`ignoreInvuln` 命中必中。

### 4.3 奥义与场上动作

- 全屏奥义：`G.superLock`，五阶段 cut → text → anim → hit → out；数据 `CFG.SUPERS`（8 条，total 144~160 帧）。
- 场上超必杀：`BVN.Field` + `BVN.FIELD_MOVES`，8 套、各 186~212 帧；动作期 Lv3 霸体 + 免伤，结束后 6 帧 grace。
- 联机接线：`fld/sup/su/sc` 消息、快照 bit1024、`unpackFighter(..., keepAction)` 防止快照冲断动作。

### 4.4 援助与联机

- 7 名援助，每场 3 次；`art-assist.js` 用 `Art.registerLook` 注册骨骼外观。
- 联机为主机权威：客机收快照 + 增量消息；**双端必须同版本**。

> 以上格斗模式细节的完整版见 `docs/design-v3.md` 与旧版交接文档；肉鸽改动不应触碰 `Fighter.receiveHit`、`DMG_SCALE` 等既有口径，除非用户明确要求。

---

## 5. 肉鸽模式架构（第五期重点）

### 5.1 状态机与界面

`RG.screen` 取值：

| screen | 作用 |
|---|---|
| `select` | 选角色 + 选模式（普通爬塔 / BOSS 连战） |
| `play` | 关卡战斗 |
| `reward` | 关底后遗物三选一 |
| `buff` | 关卡强化三选一 |
| `upgrade` | 废料强化五项 |
| `gshop` | 连战模式补给商店 |
| `board` | 排行榜 |
| `codex` | 怪物 / 遗物图鉴 |
| `dead` | 死亡结算（含数据汇总） |
| `win` | 通关结算（含数据汇总） |

覆盖层（不是独立 screen）：`RG.relicOpen`（遗物栏 G）、`RG.gamble`（情赌徒）、`RG.superCut`（奥义演出）、`RG.cine`（鳄鱼/巨魔过场）、`RG.bossIntro`（首领登场）。

### 5.2 一轮流程

**普通爬塔（`RG.mode = 'normal'`）**

```
select → loadRoom(0)
  → 每关 3 段长廊 + 关底竞技场（R1~R4 迷你 BOSS，R5 双首领串场）
  → 清关 → reward（遗物三选一）
  → buff（关卡强化三选一）
  → upgrade（废料强化五项）
  → advanceRoom → 下一关
  → 第 5 关结束 → win
  → 任意时刻死亡 → dead（有复活次数则先 tryRevive）
```

**BOSS 连战（`RG.mode = 'gauntlet'`）**

`gauntletRoomDef(stage)` 动态生成单竞技场关卡，`BOSS_TYPES` 按阶段轮转；每次击败首领 → 发遗物 + 废料 → `gshop` 补给 → 下一阶段；最终阶段通关 → win。

### 5.3 数据层（`js/rogue-data.js`）

| 表 | 内容 |
|---|---|
| `R.CHARS` | 每角色的肉鸽特性 `perk/desc/mods` |
| `R.MELEE` | 轻/重击伤害、距离、弧度、段数、刀光色 |
| `R.RANGED` | 远程弹体：伤害、速度、连发、穿透、追踪、爆炸等 |
| `R.SKILLS` | I 键技能：类型、冷却、伤害、半径、附带效果 |
| `R.MONSTERS` | 基础怪 + 亚种；字段 `baseType/tier/name/hp/w/h/kind/speed/touch/colors/desc`，可选 `armor/poison/atkRate/mb` |
| `R.VARIANTS` | 基础类型 → 三条亚种 id 的索引 |
| `R.RELICS` | 遗物：`id/name/desc/mods/icon`，`hidden` 不进池 |
| `R.BUFFS` / `R.CHAR_BUFFS` | 关卡强化三选一池 |
| `R.ROOMS` | 5 关配置：区域、宽度、生成点、竞技场、boss 标记 |

`R.ROOMS` 在文件尾部由 IIFE 组装：R1~R4 用 `BOSS_TYPES` 按 `roomIndex` 填 `miniBoss`，R5 含 `sewerCroc` → `troll` 串场。

### 5.4 逻辑层（`js/rogue.js`）

**核心状态 `RG`**：`screen / mode / roomIndex / player / monsters / projectiles / zones / relics / buffs / cam / kills / scrap / runTime / totalDmg / itemsUsed / bossKills / upg / extraCd / superCut / cine`。

**玩家对象 `RG.player`** 关键字段：`hp/hpMax/mods/reviveLeft/reviveUsed/shieldT/shieldMul/superAnim/attack/pose`。

**属性结算**：

```
baseMods() → 角色特性 → 遗物（scaledRelicMods，特殊键跳过）
→ 关卡 BUFF → 废料强化 RG.upg → 写入 p.mods / hpMax / reviveLeft
```

- `SPECIAL_SKIP`：`revive/elem*/extraSkill/explode/trap/glide/slowField` 不参与 `RELIC_SCALE` 倍率，改用等级派生。
- 复活次数 = `max(0, mods.revive - p.reviveUsed)`。

**命中链路**（`hitMonster`）：

```
作弊秒杀 → 无敌帧 → 水母触须护盾 → 格挡(×0.65) → 累计总伤害 → 扣血/回气
→ 冻结 → 连锁雷 → 元素附着 → 击退/僵直/削韧 → 尿灵液化 → 死亡 killMonster
```

- 怪物伤害修正 `computeDamage()`：巨魔背部 +30%、蜈蚣头壳 -40% / 尾段 +35%、鱼人近战 +20%、水母仅核心、迷你 BOSS ×0.62、精英 ×0.74、亚种 `armor`。
- 元素 DOT 不走 `hitMonster`，直接扣血，避免递归。

**亚种投放**（`resolveMonsterType`）：

- `variantTierCap()`：`roomIndex 0~4 → [0,1,2,3,3]`。
- 精英只取当前档最高 tier；普通怪在第 3~4 关混排 `cap` 与 `cap-1`；第 5 关固定 T3。
- 粪精分裂 `mini` 不替换。
- `m.type = def.baseType || resolved`，所有行为分支继续按基础类型判断。

**额外技能**（`EXTRA_DEFS` + `castExtraSkill`）：T 圣光波 / F 缚魂锁 / H 生命之泉 / N 守护结界；`RG.extraCd` 独立冷却，`extraCdFor(lv) = max(4, 10 - 1.2×lv)`。

**奥义演出**（`castSuper` / `drawSuperCut` / `superPoseFor`）：阶段 A 立绘，阶段 B 复用 `BVN.Fighter.prototype.ultPose` 的同一套关键帧，1.55× 比例绘制角色本体 + 残影 + 聚光 + 冲击；V 键，100 秒冷却。

### 5.5 绘制层（`rogue-rig.js` / `rogue-art.js`）

- 常规怪物主路径走 `ROGUE_RIG.draw`（骨骼 + 描边），颜色来自 `m.def.colors`；亚种通过改配色复用基础骨架。
- `RA.drawSprite` 是 `assets/rogue/*.png` 的贴图回退路径；`assets/rogue` 会在构建时注入 `BVN.ROGUE_SPRITE_DATA`。
- 状态叠加：冰缓（冰蓝覆盖 + 霜粒）、束缚（紫色锁链/光圈）、BOSS 阶段红光、受伤闪白。
- 触手统一用 `tentacleTube()`；母体触手、独立触手、杀手鳄背触手复用。

---

## 6. 扩展配方（照着做就不会错）

### 6.1 新增一件遗物

1. 在 `js/rogue-data.js → R.RELICS` 增加条目：`{ id, name, desc, mods, icon }`；`icon` 复用现有图标名（如 `wing/rune/heart/shield/arrow/fist/mask/gloves/pack`）。
2. 若使用**已有数值键**（如 `dmg/maxHp/atkSpeed`），无需改逻辑，`applyMods` 已处理；在 `RELIC_MOD_LABELS` 补中文标签即可。
3. 若引入**新特殊键**：
   - 在 `baseMods()` 加默认值；
   - 在 `applyMods(m, r, lv)` 加等级派生分支；
   - 把该键加入 `SPECIAL_SKIP`，防止 Lv5 被 `RELIC_SCALE` 二次放大；
   - 在 `specialRelicText()` 加文案，保证遗物栏能显示实际数值；
   - 若需要新按键技能，见 §6.3。
4. `hidden: true` 的遗物不会进入掉落池、商店与图鉴；只有兑换码等特殊入口能发。
5. 验证：遗物总数、等级派生值、池中是否排除满级/隐藏。

### 6.2 新增一条怪物亚种

1. 在 `R.MONSTERS` 增加条目，必须含 `baseType`（指向已有基础种）与 `tier: 1|2|3`。
2. 把 id 追加进 `R.VARIANTS[baseType]` 数组；每组必须保持至少 3 条。
3. 不要写行为代码：`m.type` 保持 `baseType`，行为、骨架、特殊逻辑自动复用。
4. 关卡强度由 `tier` 与 `variantTierCap()` 控制；越强的亚种 tier 越高，不要手动指定关卡。
5. 验证：`RG._.resolveMonsterType(baseType, idx, elite, mini)` 在各 `roomIndex` 的返回；第 5 关必须只有 T3；`mini` 必须返回原种。

### 6.3 新增一个额外按键技能

1. `EXTRA_DEFS` 增加 `{ key, name, color }`；key 需避开既有键位。
2. `castExtraSkill(p, id)` 增加效果分支，等级从 `p.mods.skills[id]` 读取。
3. `updatePlayer()` 的按键区增加 `keyPress(['KeyX']) → castExtraSkill(p, id)`。
4. `RG.extraCd` 初始化与 `resetRun` 增加该 id；HUD 会遍历 `p.mods.skills` + `EXTRA_DEFS`，通常无需单独改绘制。
5. 在 `R.RELICS` 增加 `extraSkill: 'id'` 的遗物；文案走 `specialRelicText`。
6. 验证：未获得遗物时按键无效、冷却独立、等级提升效果与冷却都变化。

### 6.4 新增一种元素

1. `baseMods()` 加 `elemX`；`applyMods` 记录等级。
2. `applyElements(m, dmg)` 增加概率、持续时间、DOT 参数，并套 `elemDmgMul`。
3. `updateMonsterDots()` 增加跳伤计时与颜色反馈。
4. `R.RELICS` 增加对应遗物；`RELIC_MOD_LABELS` 与 `specialRelicText` 补文案。
5. 若需要状态绘制，在 `rogue-art.js` 的 `drawMonster` 末尾叠加。

### 6.5 新增关卡 / 首领

1. 在 `R.ROOMS` 增加房间配置（宽度、区域、生成点、竞技场）。
2. 迷你 BOSS 走 `BOSS_TYPES`；最终 BOSS 在房间数据里标 `boss: true` 并配置串场。
3. 新怪物需在 `R.MONSTERS` 定义，并在 `rogue-art.js` 增加绘制或复用骨骼。
4. 注意 `roomIndex` 会直接影响 `variantTierCap()` 与 `roomScale()`，新增关卡要同步检查投放梯度与 BOSS 成长。

### 6.6 新增角色

需要同时改四处：

1. `js/data.js`：角色基础数据、技能、奥义（格斗模式）。
2. `js/art.js`：骨骼外观 / 立绘锚点。
3. `js/rogue-data.js`：`R.CHARS` 特性、`R.MELEE`、`R.RANGED`、`R.SKILLS`。
4. `js/rogue.js`：如角色有独特机制，接在 `applyMods` 或对应 cast 分支；`superPoseFor` 会自动复用 `ultPose`。

---

## 7. 关键不变量（改代码前先对照）

1. `m.type` 必须是基础类型；亚种只改 `m.def`。任何按 `m.type` 分支的特殊逻辑都依赖这一点。
2. `mini` 分裂小体不参与亚种替换；第 5 关固定 T3；`variantTierCap = [0,1,2,3,3]`。
3. 特殊遗物键必须同时出现在 `SPECIAL_SKIP` 与 `specialRelicText`，否则会出现数值翻倍或文案不更新。
4. 复活次数只从 `reviveUsed` 反算，不要直接改 `reviveLeft`。
5. 隐藏遗物不得进入 `relicPool()`、商店、图鉴。
6. 元素 DOT 不得回调 `hitMonster`，否则会递归触发元素/连锁。
7. 玩家受伤统一走 `hurtPlayer / hurtPlayerTiny`；怪物受伤统一走 `hitMonster`（DOT 除外）。
8. 所有资源程序化或内联，禁止新增外部 CDN、网络图片、npm 依赖、ES Module。
9. 画布固定 1280×720；新增 UI 必须在该分辨率下可读。
10. 改源码后必须重建 `dist/index.html`，并验证 `file://` 下零 console error。

---

## 8. 构建与部署

```bash
# 重建单文件产物（唯一正确方式）
node tools/build-single.js

# 产物检查
ls -l dist/index.html          # 当前约 5.31 MB
```

- 构建脚本会：按 `JS_ORDER` 内联 JS、把角色/援助立绘转 base64、把 `assets/rogue/*.png` 注入 `BVN.ROGUE_SPRITE_DATA`、内联 CSS。
- 验收必须用 `file://` 直接打开 `dist/index.html`，确认无 console error；源码态与打包态可能有差异。
- 部署由用户手动完成：把 `dist/index.html` 上传到站点根目录覆盖 `index.html`，浏览器 Ctrl+F5 强刷（详见 `部署指南.md`）。

---

## 9. QA 工作流

### 9.1 肉鸽逻辑断言（JXA，无需浏览器）

历史做法是把「测试头 + 数据层 + 逻辑层 + 断言尾」拼成一个文件，用 macOS 的 JavaScriptCore 跑：

```bash
cat /tmp/rg_head.js js/rogue-data.js js/rogue.js /tmp/rg_tail.js > /tmp/rg_test.js
osascript -l JavaScript /tmp/rg_test.js
```

- `/tmp/rg_head.js`、`/tmp/rg_tail.js`、`/tmp/rg_new_tail.js` 是上一轮临时脚手架，**可能被系统清理**。若不存在，需要自建最小桩：
  - `BVN.CFG`、`BVN.FX`（reset/ring/text/hitSpark 等空函数）、`BVN.Sfx.play` 空函数；
  - `BVN.Game`（`keys/pressed` 对象）；
  - `BVN.Art`（`kit` 颜色工具、`img` 返回 null、`drawFighter` 空函数、`CHAR_BY_ID`）；
  - 然后加载 `rogue-data.js` + `rogue.js`。
- JXA 环境**没有 `print`**，断言结果要收集到数组，最后 `out.join('\n')` 返回。
- 逻辑层暴露了 `BVN.Rogue._`，可直接测试：`resolveMonsterType / tryRevive / applyElements / updateMonsterDots / castExtraSkill / extraCdFor / specialRelicText / relicLevelOf / bossHpFor / upgCost` 等。

### 9.2 无头浏览器截图

```bash
# 1) 起本地服务（避免 file:// 跨域/缓存差异）
python3 -m http.server 8806
# 2) 复制最新 dist 到脚手架
cp dist/index.html /tmp/rogue-harness/game.html
# 3) 用 Playwright 的 headless_shell 截图
~/Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell \
  --disable-gpu --no-sandbox --hide-scrollbars \
  --screenshot=/tmp/shot.png --window-size=1160,760 --virtual-time-budget=4000 \
  "http://127.0.0.1:8806/harness.html"
```

- 肉鸽截图推荐用 `/tmp/rogue-harness/` 下的 iframe 页（`v-round5-*.html` 等），它们会把 `game.html` 缩放到 0.88 并预置角色/关卡/遗物。
- 区域开场遮罩可能挡住画面；要验证亚种外观时，先把 `R.introT / bossIntro / areaIntro` 清零或让 `R.update` 正常推进，再截图。
- 战斗模式验收继续用 `tools/qa-harness.js` 的 Playwright 流程（`H.boot / H.toBattle / H.hold / H.readState / H.frameLock / H.errors`）。

### 9.3 每次改动的最低验证集

1. 逻辑断言：新增/修改的属性、掉落、投放、冷却至少各一条。
2. 旧断言回归：19 项历史断言保持 PASS。
3. 实机或截图：新增遗物在遗物栏可读；亚种名称/配色可见；奥义动作完整。
4. `node tools/build-single.js` 重建成功。
5. `file://` 打开 dist，无 console error。

---

## 10. 已踩过的坑（务必吸收）

### 10.1 格斗模式（v1~v4 遗留）

1. **立绘锚点必须实测**：CG `face:[fx,fy,zoom]` 目测全会错；用 Playwright 对 PNG 做像素连通域分析再填数。
2. **Playwright 按键**：游戏按「按住/松开」取样，`press()` 会被吞；必须 `down → 120~130ms → up`。
3. **本机代理**：环境有 `HTTP_PROXY`，Playwright/本地请求需 `--no-proxy-server`。
4. **帧级确定性**：用 `harness.frameLock()` 手动推帧，不要 sleep 猜。
5. **自检函数挂载顺序**：`FIELD_MOVES.selfCheck` 若被遍历逻辑当条目会 `undefined.reduce`。
6. **边沿检测完整性**：新增按键必须同步 `Fighter._prev` 与联机 `ctrl` 字段集。
7. **透明度乘两次**：压暗系数要单点控制。
8. **数值口径是用户决策**：不要顺手改 `DMG_SCALE`、`MAX_HP`、`ROUND_TIME`。

### 10.2 肉鸽模式（第五期新增）

9. **冻住触手无敌 BUG**：冻结状态不要并入无敌/护盾判定；冻结只限制移动与出招。
10. **第 5 关混入 T2**：混排条件只能写 `roomIndex === 2 || 3`，不能写 `>= 2`。
11. **特殊遗物被倍率二次放大**：新增特殊键必须加入 `SPECIAL_SKIP`。
12. **复活次数口径**：用 `reviveUsed` 反算，直接改 `reviveLeft` 会在增删遗物时错乱。
13. **JXA 无 `print`**：用数组收集后 `join`。
14. **奥义绘制测试缺桩**：`drawSuperCut` 依赖 `Art.img / Art.drawFighter / CHAR_BY_ID`，逻辑测试必须补桩。
15. **截图被开场遮罩挡住**：亚种验证以战斗日志 + 实体数据为准，截图为辅；必要时清零 intro 状态。
16. **dist 易忘重建**：改 `js/` 后不跑构建，实机看到的还是旧版。
17. **工作区未提交**：见 §0，任何清理型 git 命令都可能毁掉整轮成果。

---

## 11. 当前完成度与建议路线

**已完成（五轮）**：作弊遗物与兑换码、水母母体新招与触手重绘、鳄鱼逃走过场、巨魔被吞噬与杀手鳄合体、冻触手 BUG、爆率调整、遗物等级数值、废料强化、BOSS 成长、数据汇总、20 件新遗物、特殊遗物升级、33 条亚种、肉鸽奥义动作。详见 `开发日志.md`。

**没有阻塞性遗留需求**。可选方向（按性价比排序）：

1. 元素抗性怪物：给 T2/T3 亚种加火/毒/雷/冰抗性，逼玩家调整构筑。
2. T3 亚种专属招式：目前只变数值/配色，可给每个 T3 加 1 个独有技能。
3. 复活次数 HUD：血条旁常驻显示剩余次数。
4. 结算页图表化：总伤害、击杀分布、关卡耗时。
5. 构筑分享码：序列化遗物/强化/BUFF，便于复盘。

**改动前先问用户**：涉及数值口径（血量、伤害、爆率、成长曲线）与美术风格时，用户有明确的偏好历史，不要自行"顺手优化"。

---

## 12. 文档索引

| 文档 | 用途 |
|---|---|
| `README.md` | 玩法、键位、规则口径 |
| `docs/AI-HANDOVER.md` | 本文，接手入口 |
| `开发日志.md` | 五轮改动逐项记录 + 系统细节 + 排障 + 验证清单 |
| `spec.md` | 第五轮规格（20 遗物/特殊升级/亚种/奥义） |
| `tasks.md` / `checklist.md` | 第五轮任务与验收勾选 |
| `docs/design-v3.md` | 格斗模式 v3/v4 设计与实施记录（§10~§15） |
| `部署指南.md` | dist 上传与强刷步骤 |
| `server/README.md` | 排行榜后端启动说明 |

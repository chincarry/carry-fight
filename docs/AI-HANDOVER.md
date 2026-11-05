# AI 交接文档 · 陈锴瑞 VS 陈锴瑞（carry-fight）

> **写给下一个参与本项目开发的 AI/工程师**。本文档于 2026-11-05 由第四期交付完成时整理，目标是让你在 30 分钟内掌握项目全貌、避开已踩过的坑、用正确的方式继续开发。动手前请完整读完本文档，并对照 `docs/design-v3.md`（详细设计 + 各期实施记录）。

---

## 1. 项目速览

| 项 | 内容 |
|---|---|
| 项目 | 致敬《死神 VS 火影》的 2D 横版格斗游戏「陈锴瑞 VS 陈锴瑞 · 八相乱斗」 |
| 8 名可操纵角色 | 魔法师·陈锴瑞 / 天使·陈锴瑞 / 忍者·陈锴瑞 / 武士·陈锴瑞 / 拳王·陈锴瑞 / 剑圣·陈锴瑞 / 术士·陈锴瑞 / 游侠·陈锴瑞（真人立绘照片 + Canvas 骨骼动画） |
| 技术栈 | **纯原生 HTML5 Canvas 2D + 原生 JS，零框架、零 npm 依赖、零外部网络资源**。未使用 ES Module，`file://` 双击 `index.html` 即可运行 |
| 架构模式 | 全局命名空间 `BVN`（以及 `Art`/`CFG` 等子命名空间），各文件为 IIFE 挂载，加载顺序敏感 |
| 逻辑帧 | 固定步长 60FPS，逻辑与渲染分离，帧级确定性（联机依赖此性质） |
| 双模式 | 单机对战 / P2P 在线联机（peerjs，WebRTC） |
| 仓库 | `github.com/chincarry/carry-fight`，主分支 `main` |
| 交付产物 | `dist/index.html` 单文件（约 3.65MB，CSS/JS/立绘全部内联），上传到 `k7i8my.gicp.fun` 根目录即可部署 |

**已完成的四期开发**：

1. 基础游戏：8 角色、连段、防御/完美格挡、技能/必杀、AI、联机、音效
2. 第一/二期：援助系统 7 人、霸体分级 + 上挑/下落斩、头像取景修正、联机昵称
3. 第三期：**HP 翻倍至 2000（伤害数字不变）**、天使俯冲 Lv3 霸体、7 援助骨骼实体化（有真身体/招式动画，不再是贴图）、8 套全屏奥义（真人立绘 CG + 终结文字 + 差异化 FX）
4. 第四期：**场上超必杀动作**——奥义演出结束后，角色在场景内完成 3 秒左右超大骨骼动作，期间最高霸体(Lv3) + 免伤

---

## 2. 目录结构与文件地图

```
carry格斗/
├── index.html              # 源码态入口（引用各 js 文件，直接双击可玩）
├── css/                    # 样式
├── assets/                 # 真人立绘 PNG（构建时 base64 内联进 dist）
├── js/                     # ★ 全部游戏逻辑，IIFE + BVN 命名空间
│   ├── vendor/peerjs.min.js
│   ├── data.js             # (801行)  CFG 全局配置 + 8 角色基础数据 + SUPERS 奥义表 + 援助数据
│   ├── net-config.js       # 联机服务器/房间配置
│   ├── audio.js / effects.js
│   ├── art.js              # (2462行) 立绘裁切 drawCover、角色骨骼绘制、Art.kit 绘制工具箱
│   ├── art-bg.js           # 背景绘制
│   ├── art-assist.js       # (1674行) 7 名援助的骨骼外观（Art.registerLook 注册）
│   ├── skills.js           # (1117行) 每角色技能/必杀招式定义与判定窗
│   ├── super.js            # (1517行) ★ 奥义系统：全屏演出状态机 G.superLock、8 套 FX、CG 绘制
│   ├── super-field-moves.js# (3062行) ★ 第四期：8 套场上超必杀动作的逐帧数据/动画函数
│   ├── super-field.js      # (421行)  ★ 第四期：场上动作状态机 BVN.Field
│   ├── assist.js           # 援助召唤逻辑（含 7 人实体化动作）
│   ├── fighter.js          # (1336行) 战斗单位：输入、状态机、受击 receiveHit、霸体 setArmor
│   ├── ai.js               # AI 对手
│   ├── game.js             # (2269行) 主循环、回合管理、HUD、G 全局状态
│   ├── net.js / netplay.js # (1162行) P2P 联机：主机权威模拟 + 快照同步 + 增量消息
├── tools/build-single.js   # ★ 单文件打包脚本（node tools/build-single.js → dist/index.html）
├── dist/index.html         # 打包产物（18589 行，勿手改，必须用脚本重建）
├── server/                 # 联机信令相关
├── docs/design-v3.md       # ★ 三/四期完整设计文档 + §10~§15 实施记录（改系统前必读）
├── README.md / 部署指南.md
└── 陈锴瑞VS陈锴瑞-单文件版.html  # 早期单文件快照（可忽略）
```

**js 加载顺序铁律**（`index.html` 与 `tools/build-single.js` 的 JS_ORDER 必须一致）：新增文件要同时改这两处，并注意依赖方向——例如 `super.js` 在 `skills.js` 之后、`assist.js` 之前（它依赖 data/art/FX，又被后续文件反向调用）。

---

## 3. 核心系统速查

### 3.1 数值契约（js/data.js 的 CFG）

| 字段 | 值 | 说明 |
|---|---|---|
| `MAX_HP` | 2000 | 第三期翻倍（原 1000） |
| `DMG_SCALE` | **1** | 伤害缩放唯一出口（在 `Fighter.receiveHit`）。血量翻倍但伤害不变是**用户明确决策**；想联动翻倍只改这一个字段为 2 |
| `ROUND_TIME` | 150 | 回合秒数（因血量翻倍节奏变慢而从 99 调到 150） |
| `SUPER_MAX` / `SUPER_GAIN_*` | 100 / 0.10·0.04·1.6·8 | 奥义槽：上限、命中得点、受击得点、每秒回充、完美格挡奖励 |

### 3.2 霸体分级

`setArmor(level, frames)` 抬升霸体等级，**只升不降**（计时自然回落）。Lv3 为最高（对普通攻击与霸体破坏都免疫）。招式数据里用 `armorWindows: [{s:起始帧, e:结束帧, level}]` 数据驱动；`unblockable` 不可防御、`armorBreak` 破霸体、`ignoreInvuln` 无视无敌帧（奥义/场上动作命中专用，防止起身无敌帧闪掉伤害）。

### 3.3 奥义（全屏演出）· js/super.js

- 全局锁 `G.superLock = {side, id, t, total, hitDone, remote}`，演出期间全局冻结（计时器/双方输入均停）。
- 5 阶段：cut（暗幕+CG 立绘）→ text（终结文字）→ anim（8 套差异化 FX：oniArmy/holyRain/rushFists/ribbonVortex/boneMaw/abyssHands/arrowStorm/tenSlashes）→ hit（`ignoreInvuln:true` 必中）→ out。
- 数据源 `CFG.SUPERS`（8 条，total 144~160 帧，hit.dmg 480~580），portrait 字段控制 CG 取景：`face:[fx,fy,zoom]`、`lift/tintMix/onTop`。
- `finish()` 末尾若非中断，则调 `BVN.Field.start(...)` 无缝交棒给场上动作。

### 3.4 场上超必杀动作（第四期）· super-field.js + super-field-moves.js

- `G.fieldMove = {side, id, t, total, hitIdx, remote, def}`；状态机 `BVN.Field = {isActive, start, beginRemote, update, draw, abort}`。
- `BVN.FIELD_MOVES[id]`：8 套动作，各 186~212 帧、4~6 段命中（每段 260~310 伤，`unblockable + armorBreak:3 + ignoreInvuln`）。
- 动作期每帧续 `setArmor(3,2) + invuln=2`；`updateFight` 检测到 `fieldMove` 时锁双方输入、停计时器、停 AI。
- 结束后有 `superGrace = 6` 帧：**解锁帧与 `_prev` 边沿检测对齐**，防止"按住 I + 自然回充"把刚攒的奥义立刻再烧掉（B1 教训）。
- 命中判定框未逐段落地是**裁决过的既定行为**：奥义/场上动作必中，字段标注仅作文档。

### 3.5 援助系统（实体化）· assist.js + art-assist.js

- 7 名真人援助（侦探于沛頎/仙人杨子一/黑道孙啸晨/肌霸郭亚祥/探险肖牧辰/舞女刘思彤/囚徒刘鑫尧），每场 3 次，召援中被击则作废。
- 第三期起援助有**骨骼实体**：`Art.registerLook` 注册外观（颜色全部从 palette 派生，零硬编码色），三相姿势驱动 + 落地实体绘制；伤害时点与旧版完全一致（零回归）。
- CG/头像取景锚点用**像素连通域分析实测**，不靠目测（踩坑多次，见 §5）。

### 3.6 联机（主机权威）

- 主机跑完整模拟，客机收快照 + 增量消息。新增全屏/场上系统时的接线点：`sendField`/`case 'fld'`（客机 `BVN.Field.beginRemote`）、`sup/su/sc` 等奥义消息、快照掩码 **bit1024 = super 键**。
- `unpackFighter(..., keepAction)`：任何 `attackKey==='super'` 的快照**不写动作状态**，防止快照把进行中的奥义/场上动作冲断。
- **联机双端必须同版本**：旧版本不认识 `fld`/`sup` 等新消息，混版本会崩。

---

## 4. 构建与部署

```bash
# 1. 改完源码后重建单文件产物（产物勿手改）
node tools/build-single.js

# 2. 提交推送
git add -A && git commit -m "..." && git push

# 3. 部署：把 dist/index.html 上传到 k7i8my.gicp.fun 站点根目录覆盖 index.html
#    用户浏览器需 Ctrl+F5 强刷（详见 部署指南.md）
```

**验收 dist 必须走 `file://` 协议**直接打开 `dist/index.html`，确认零 console error（打包内联后行为可能与源码态有差异）。

---

## 5. 已踩过的坑（务必吸收，不要重交学费）

1. **立绘锚点必须实测**：CG `face:[fx,fy,zoom]` 目测估值全会错（天使估 0.57 实际 0.487/0.215；肌霸头像取景对准了墙面）。正确做法：写一次性 Playwright 探针对立绘做像素连通域分析，定位真脸/人体中心再填数。warlock 类暗色调立绘需 `lift/tintMix/onTop` 补光。
2. **Playwright 按键**：游戏按「按住/松开」取样，`press()` 会被吞——必须 `down → 120~130ms → up`。战斗中按 Esc 退出无效，测试里改调 `G.gotoTitle()`。
3. **本机代理**：环境有 `HTTP_PROXY`，Playwright/本地请求需加 `--no-proxy-server`，否则 502。
4. **帧级确定性**：`harness.frameLock()` 可冻结渲染循环、`lock.step(n)` 手动推帧——验证帧窗（霸体窗、命中窗）时用它逐帧对账，不要用 sleep 猜。
5. **数据自检函数挂载顺序**：`FIELD_MOVES.selfCheck` 这类挂在对象上的自检函数，如果遍历逻辑把它当条目处理会 `undefined.reduce`——先算报告再挂载（修过一次）。
6. **边沿检测完整性**：`Fighter._prev` 必须覆盖所有会被「按住 + 自动资源」触发的键（漏 `super` 导致 B1：按住 I 自动烧奥义）。新增任何按键语义都记得同步 `_prev` 和联机 `ctrl` 字段集。
7. **透明度乘两次**：全屏压暗曾在 FX 与 drawCutscene 各乘一次 0.94，实际 0.88 过黑——压暗系数要单点控制（现 0.975）。
8. **伤害对账的既有规则**：游侠伤害 +15% 是远射被动既有规则，不是 bug，对账时不要误报。
9. **血量/伤害口径是用户决策**：不要"顺手"把 DMG_SCALE 改成 2 或改回 1000 血。

---

## 6. QA 工作流

验收脚手架 `tools/qa-harness.js`（已入版本库；`/tmp/qa-v3/` 是临时目录会被清掉）：

```js
var H = require('./tools/qa-harness.js');
var page = await H.boot({ entry: 'http' });   // 源码态；'dist' 为打包态(file://)
await H.toBattle(page, 0, 7);                 // P1=角色0 P2=角色7，等到 roundState==='active'
await H.hold(page, 'KeyJ', 150);              // down→150ms→up
var st = await H.readState(page);
var lock = await H.frameLock(page);           // 帧锁，lock.step(n) 手动推帧
await H.screenshot(page, 'name');
H.errors(page);                               // 收集全部 console error
```

标准验收流程：单机 8 套奥义/场上动作逐个触发并对账双方 HP → 联机冒烟（双端 HP 一致、只扣一次）→ dist `file://` 零 error → 关键帧截图目检（32 张级别）。

---

## 7. 已知遗留事项（非阻塞）

1. **解锁帧吞输入**：场上动作结束的 6 帧 grace 期内有约 16.7ms 的输入窗口可能吞掉一次按键——影响极小，未修。
2. **hannya（武士）奥义 CG 立绘**发梢被上沿裁掉，脸完整——属素材裁切美观问题，可调 portrait 锚点改善。
3. **部署是用户手动环节**：dist 上传到 gicp.fun 由用户完成，AI 交付到 dist 即可。
4. 回合时间 150s / 血量 2000 / 伤害不变三件套是联动的用户决策，勿单独改其一。

---

## 8. 版本历史（要点）

```
487e461 feat(v4): 场上超必杀动作（奥义后 3 秒骨骼大动作，Lv3 霸体+免伤）  ← 最新，已推送
43bdd03 chore(v3): 重建单文件产物（含 B1~B8 修复）
4874f54 fix(v3): 奥义边沿检测与 CG 取景修正（QA 缺陷 B1~B8）
e51409b/f51b4cb feat(v3): T05 联机奥义同步 + 文档 + 总打包
a29b3ac feat(v3): T04 全屏奥义演出（8套FX/真人CG/终结文字）
01b91fe/e4a9e2a/eaa2748 feat(assist): 7 援助骨骼建模与实体化
ea6ad47/b776868/6f2642f feat(v3): T01 数据契约 / T02 战斗内核（血量2000/霸体窗/奥义资源）
```

`docs/design-v3.md` 的 §10~§15 是每期工程师补记的实施记录（含与设计稿的差异），比本文档更细。

---

## 9. 开发规范（本项目惯例）

- **原生优先**：不加框架、不加 npm 依赖、不用 ES Module、不引外部 CDN。动画是 Canvas 逐帧绘制 + 骨骼数据驱动，不是精灵帧图。
- **颜色零硬编码**：角色/援助外观一律从 palette 派生。
- **数据驱动**：霸体窗、命中窗、奥义表、场上动作全部是数据表 + 状态机解释执行，新招式优先加数据而非写过程代码。
- **伤害唯一出口**：一切伤害过 `Fighter.receiveHit`（含 `DMG_SCALE`、`ignoreInvuln`、格挡、霸体判断）。
- **联机改动三件套**：主机消息发送 + 客机 case 处理 + 快照掩码/keepAction 白名单，缺一即不同步。
- **每期交付链**：设计 → 实施 → QA（真实 Playwright 对账 + 截图目检 + dist 验证）→ 重建 dist → commit/push → 用户手动部署。
- 文档随代码走：大改动同步补进 `docs/design-v3.md` 新章节。

---

## 10. 给下一个 AI 的建议路线

1. 先读 `README.md`（玩法/键位/规则口径）和 `docs/design-v3.md` §1~§9（系统设计）。
2. 双击根目录 `index.html` 实际玩一局，把 8 个角色的超必杀（I 键）各放一次，亲眼看过全屏 CG + 场上大动作。
3. 需要改数值 → 只碰 `js/data.js`；加招式 → 走数据表；改演出 → `super.js`/`super-field-moves.js`。
4. 任何视觉取景/锚点问题，先写探针实测，不要目测。
5. 交付前跑一遍 §6 的标准验收，`node tools/build-single.js` 重建 dist，一并提交推送。
6. 有歧义（尤其是数值口径类）先问用户，本项目用户对"伤害不变"这类口径有明确偏好历史。

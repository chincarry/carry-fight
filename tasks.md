# 第五轮扩展 Tasks

> 依赖顺序：数据 → 属性/复活/元素 → 额外技能 → 亚种 → 奥义动作 → UI → 验证 → 构建。

## [x] T1 数据：20 件新遗物
- 文件：`js/rogue-data.js` → `R.RELICS`
- 追加 20 条（id/name/desc/mods/icon 见 `spec.md` §2.1），位于 `cheat` 之前。
- 验收：`R.RELICS` 长度 44（现有 24 + 新增 20）；每件都有 `mods` 与 `icon`。

## [x] T2 数据：33 条怪物亚种
- 文件：`js/rogue-data.js` → `R.MONSTERS`、新增 `R.VARIANTS`
- 6 种常规怪 ×3 + 5 种迷你 BOSS ×3；字段含 `baseType`、`tier`、独立 `name/colors/hp` 等。
- 验收：`Object.keys(R.VARIANTS)` 11 组，每组 3 条；所有 `baseType` 能在 `R.MONSTERS` 中找到。

## [x] T3 属性系统与特殊遗物升级
- 文件：`js/rogue.js` → `baseMods` / `applyMods(m,r,lv)` / `applyAllMods` / `scaledRelicMods`
- 新增 `revive/elem*/skills/freezeDur/chainJumps/chainDmg/trapLv/trapDmg/trapInterval/trapR/explodeR/explodeDmg/slowR/glideLv`。
- `resetRun` 初始化 `p.reviveLeft = 0`、`RG.extraCd`、`p.superAnim`。
- 验收：遗物 Lv 提升后，冻结时长、连锁跳数/伤害、陷阱伤害/间隔/范围、爆炸范围/伤害、缓速半径、复活次数/回血比例全部提升。

## [x] T4 复活系统
- 文件：`js/rogue.js` → `tryRevive(p)`；`hurtPlayer`、`hurtPlayerTiny` 死亡分支。
- 验收：带复活遗物时死亡 → 扣次数 + 回血 + 2.2s 无敌；次数为 0 才进入 `screen='dead'`。

## [x] T5 元素附着与 DOT
- 文件：`js/rogue.js` → `applyElements(m,dmg,kind)` 挂到 `hitMonster`；`updateMonsters` 结算 DOT/冰缓。
- 验收：四类元素独立触发；DOT 击杀累计 `RG.kills` 与 `RG.totalDmg`；BOSS 控制抗性生效。

## [x] T6 额外技能（T/F/H/N）
- 文件：`js/rogue.js` → `updatePlayer` 键位、`RG.extraCd` 递减、`castExtraSkill(p,key)`、`updateExtraSkills`；`drawHUD` 技能钮。
- 验收：获得对应遗物后按键生效；冷却显示；无遗物按键无反应；技能伤害受 `skillMul/dmgMul` 影响。

## [x] T7 亚种投放
- 文件：`js/rogue.js` → `variantTierCap()`、`resolveMonsterType()`、`spawnMonster()`、`startBossIntro` 调用处
- 规则：roomIndex 0→原种；1→T1；2→T1/T2；3→T2/T3；4→T3；精英取最高档；mini 不替换。
- 验收：逐关生成亚种；`m.type` 始终为基础类型；迷你 BOSS 名称/配色随亚种变化；既有特殊逻辑不回归。

## [x] T8 肉鸽奥义动作演出
- 文件：`js/rogue.js` → `castSuper` 增加 `p.superAnim`；`RG.update` 冻结分支调用 `updateSuperPose`；重写 `drawSuperCut` 阶段 B
- 移植 `js/fighter.js` `ultPose` 的 8 角色姿态为 `ROGUE_SUPER_POSE(charId, k)`。
- 验收：V 键演出 40% 后显示角色本体大比例动作 + 残影 + 命中冲击；8 角色姿态各不相同；`hitT` 伤害结算不变。

## [x] T9 遗物栏/文本
- 文件：`js/rogue.js` → `RELIC_MOD_LABELS`、`relicLevelNote`、`relicValueText`、`fmtModValue`
- 验收：新遗物在遗物栏显示正确中文与 Lv1→5 派生数值；特殊遗物不再显示“特殊效果恒定”。

## [x] T10 绘制状态
- 文件：`js/rogue-art.js` → `RA.drawMonster`
- 冰缓：冰蓝覆盖 + 霜粒；束缚：地面锁链。
- 验收：状态可见且不影响正常受击闪白与血条。

## [x] T11 验证
- JXA：遗物数量/分类、亚种解析、复活、DOT、额外技能、超必杀姿态阶段。
- 无头浏览器截图：遗物栏、强化页、亚种关卡、奥义阶段 B。
- 构建：`python3 /tmp/build_single.py`，确认 `dist/index.html` 更新且无报错。
- 清理临时服务与端口。

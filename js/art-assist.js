/* js/art-assist.js — 7 个援助角色的程序化骨骼外观（复用 art.js 的 drawBody 管线）+ 动作姿势关键帧
   第三期 T01 只建立骨架与对外接口占位，7 套 look 与姿势在 T03 实现。
   画风契约（docs/design-v3.md §2.8）：只允许通过 Art.kit 的原语与 drawBody 钩子绘制，
   颜色只能由 def.palette（C0）经 shade()/rgba() 派生，禁止硬编码主色。 */
window.BVN = window.BVN || {};

(function (BVN) {
  'use strict';

  /** 姿势字段契约（与 data.js 的 POSE_DEFAULT 完全一致） */
  const POSE_KEYS = ['t', 'h', 'afu', 'aff', 'abu', 'abf', 'lft', 'lfs', 'lbt', 'lbs', 'c', 'rot', 'hipx'];
  /** 姿势驱动的 5 个相位（act 内再分 windup/strike/recover） */
  const PHASES = ['in', 'windup', 'strike', 'recover', 'out'];

  const AssistArt = {
    POSE_KEYS: POSE_KEYS,
    PHASES: PHASES,

    /** 已注册的 build id（T03 填充；用于自检 ASSISTS[].build 是否全部覆盖） */
    REGISTERED: [],

    /* ===== 以下为 T03 的实现位置（本期保持未实现，调用方必须先判空） ===== */
    // registerAll()  -> void   启动时对 7 个 build 调用一次 Art.registerLook(build, look)
    // pose(build, phase, k, out) -> out   按相位进度 k∈[0,1] 就地改写 pose
    // label(build)   -> string 头顶名牌文字（如 '侦探 · 参上'）
  };

  BVN.AssistArt = AssistArt;
})(window.BVN);

/* js/super.js — 超级技能（奥义）系统：充能 / 可用性校验 / 全屏演出 / 命中派发 / HUD 数据
   第三期 T01 只建立骨架与对外接口占位，业务逻辑在 T04 落地。
   约束：纯原生 Canvas2D，无框架无 ESM；只依赖 data.js（SUPERS / CFG）、art.js、effects.js（FX）。 */
window.BVN = window.BVN || {};

(function (BVN) {
  'use strict';

  const CFG = BVN.CFG;

  /** 奥义演出特效表：键名与 BVN.SUPERS[id].fx 一一对应（8 套，互不相同）。
   *  T04 在此逐条实现：FX_TABLE[fx](ctx, game, lock, k)，k∈[0,1] 为该段进度。 */
  const FX_TABLE = {
    // oniArmy     : 全屏赤红压暗 → 16 只鬼影围成圈 → 同时俯冲砸向中央      (hannya)
    // holyRain    : 六翼白光剪影 + 天顶降下 3 道白金巨柱 + 满屏光羽逆向上飘 (angel)
    // rushFists   : 画面转黑白 + 12 记拳影从四方向内砸 + 末记上勾拳          (boxer)
    // ribbonVortex: 8 条彩带自四角螺旋收束成笼 → 绷紧炸开成花瓣雨            (dancer)
    // boneMaw     : 地面裂成熔岩巨口 + 白骨龙首升起咬合 + 牙缝喷绿火         (dragon)
    // abyssHands  : 天空翻转成深渊 + 十一芒阵锁敌 + 无数黑手向下拖           (warlock)
    // arrowStorm  : 天空被箭雨覆盖成黑幕 + 巨箭贯穿 + 落点炸开鹰羽          (ranger)
    // tenSlashes  : 时间静止 + 10 道刀光交错 + 最后一刀横贯血线              (ronin)
  };

  const Super = {
    /** 对外暴露的特效表（T04 在其中注册函数） */
    FX_TABLE: FX_TABLE,

    /** 取某角色奥义数据（无此角色返回 null） @returns {Object|null} */
    defOf: function (id) {
      return (BVN.SUPERS && BVN.SUPERS[id]) || null;
    },

    /** 充能上限 @returns {number} */
    maxCharge: function () {
      return CFG.SUPER_MAX;
    },

    /* ===== 以下为 T04 的实现位置（本期保持未实现，调用方必须先判空） ===== */
    // canUse(game, side)            -> boolean
    // tryActivate(game, side)       -> boolean
    // beginRemote(game, side, id)   -> void     客机只演出不结算
    // update(game, dt)              -> void     推进 superLock.t、派发 FX/音效/震屏/命中
    // drawCutscene(ctx, game)       -> void     压暗 + 立绘 + 终结文字 + 台词 + FX
    // updateCharge(game, dt)        -> void     自然充能（CFG.SUPER_GAIN_REGEN）
    // abort(game)                   -> void     断线 / 回合切换时清锁
  };

  BVN.Super = Super;
})(window.BVN);

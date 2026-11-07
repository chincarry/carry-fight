/* js/leaderboard.js — 肉鸽排行榜前后端桥接层
 *   · 同源（后端托管游戏）时走 /api；file:// 打开时回退到 http://127.0.0.1:8787/api
 *   · 可通过 window.BVN.LEADERBOARD_API 覆盖后端地址
 *   · 用户名输入使用 DOM 输入框覆盖在 Canvas 上，支持中文输入法
 */
window.BVN = window.BVN || {};

(function (BVN) {
  'use strict';

  const CFG = BVN.CFG;
  const LB = {};
  LB.cache = { normal: null, gauntlet: null };
  LB.lastError = '';
  const NAME_KEY = 'bvn.lb.name';

  function apiBase() {
    if (BVN.LEADERBOARD_API) return String(BVN.LEADERBOARD_API).replace(/\/+$/, '');
    try {
      if (location.protocol === 'http:' || location.protocol === 'https:') {
        return location.origin + '/api';
      }
    } catch (e) { /* 忽略 */ }
    return 'http://127.0.0.1:8787/api';
  }
  LB.apiBase = apiBase;

  function toError(msg) {
    const e = new Error(msg || '网络请求失败');
    return e;
  }

  function readJson(res) {
    return res.text().then(function (txt) {
      let data = null;
      try { data = txt ? JSON.parse(txt) : null; } catch (e) { /* 非 JSON */ }
      if (!res.ok) {
        throw toError((data && (data.error || (data.result && data.result.error))) || ('HTTP ' + res.status));
      }
      return data;
    });
  }

  /* ---------------- 网络接口 ---------------- */

  LB.fetchList = function (mode, limit) {
    const m = mode === 'gauntlet' ? 'gauntlet' : 'normal';
    const url = apiBase() + '/leaderboard?mode=' + encodeURIComponent(m) + '&limit=' + (limit || 20);
    return fetch(url, { method: 'GET', cache: 'no-store' })
      .then(readJson)
      .then(function (data) {
        LB.cache[m] = data;
        LB.lastError = '';
        return data;
      })
      .catch(function (err) {
        LB.lastError = (err && err.message) || '无法连接排行榜后端';
        throw err;
      });
  };

  LB.submitScore = function (entry) {
    return fetch(apiBase() + '/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry || {}),
      cache: 'no-store',
    }).then(readJson).then(function (data) {
      if (!data || !data.ok) throw toError((data && data.error) || '提交失败');
      // 提交后清空缓存，下一次打开排行榜会重新拉取
      LB.cache[entry.mode] = null;
      return data.result;
    });
  };

  /* ---------------- 用户名记忆 ---------------- */

  LB.getName = function () {
    try { return localStorage.getItem(NAME_KEY) || ''; } catch (e) { return ''; }
  };
  LB.setName = function (name) {
    try { localStorage.setItem(NAME_KEY, String(name || '').slice(0, 16)); } catch (e) { /* 忽略 */ }
  };

  /* ---------------- DOM 用户名输入框 ---------------- */

  let nameEl = null;

  function ensureInput() {
    if (nameEl) return nameEl;
    const stage = document.getElementById('stage') || document.body;
    nameEl = document.createElement('input');
    nameEl.type = 'text';
    nameEl.maxLength = 16;
    nameEl.placeholder = '输入用户名';
    nameEl.setAttribute('autocomplete', 'off');
    nameEl.setAttribute('spellcheck', 'false');
    nameEl.className = 'net-input lb-input';
    nameEl.style.position = 'absolute';
    nameEl.style.display = 'none';
    nameEl.style.zIndex = '40';
    stage.appendChild(nameEl);
    nameEl.addEventListener('keydown', function (e) {
      e.stopPropagation();
    }, true);
    return nameEl;
  }

  function placeOverCanvas(el, x, y, w, h) {
    const G = BVN.Game;
    const cr = G.canvas.getBoundingClientRect();
    const host = el.parentElement;
    const sr = host.getBoundingClientRect();
    const k = cr.width / CFG.W;
    el.style.left = Math.round(cr.left - sr.left + x * k) + 'px';
    el.style.top = Math.round(cr.top - sr.top + y * k) + 'px';
    el.style.width = Math.max(60, Math.round(w * k)) + 'px';
    el.style.height = Math.max(24, Math.round(h * k)) + 'px';
    el.style.fontSize = Math.round(21 * k) + 'px';
    el.style.padding = '0 ' + Math.round(10 * k) + 'px';
  }

  let commitCb = null;
  let cancelCb = null;

  LB.hideNameInput = function (silent) {
    const el = ensureInput();
    el.style.display = 'none';
    el.onblur = null;
    const cb = cancelCb;
    commitCb = null;
    cancelCb = null;
    if (!silent && cb) cb();
  };

  /* 在逻辑坐标 (x,y,w,h) 上显示用户名输入框；Enter 提交，Esc 取消 */
  LB.showNameInput = function (initial, x, y, w, h, onCommit, onCancel) {
    const el = ensureInput();
    const RG = BVN.Rogue;
    el.value = initial || '';
    el.style.display = 'block';
    placeOverCanvas(el, x, y, w, h);
    commitCb = onCommit || null;
    cancelCb = onCancel || null;
    el.onblur = function () {
      // 点击画布按钮时先失焦：不提交，只隐藏
      LB.hideNameInput(true);
    };
    el.oninput = function () {
      if (RG) RG.nameInput = el.value;
    };
    el.onkeydown = function (e) {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        const name = String(el.value || '').trim().slice(0, 16);
        if (!name) return;
        LB.setName(name);
        const cb = commitCb;
        commitCb = null;
        cancelCb = null;
        el.style.display = 'none';
        el.onblur = null;
        if (cb) cb(name);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        LB.hideNameInput(false);
      }
    };
    setTimeout(function () {
      try { el.focus(); el.select(); } catch (e) { /* 忽略 */ }
    }, 0);
  };

  BVN.Leaderboard = LB;
})(window.BVN);

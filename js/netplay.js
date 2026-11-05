/* js/netplay.js — 联机对战：联机大厅 / 联机选人 / 主机权威同步 / 昵称 / 延迟与掉线处理 */
window.BVN = window.BVN || {};

(function (BVN) {
  'use strict';

  const C = BVN.NetConfig;
  const CFG = BVN.CFG;

  const NP = {
    state: 'off',        // off | lobby | hosting | joining | connected | picking | fighting
    nick: '',
    peerNick: '',
    myIdx: 0,            // 0=主机(P1) 1=客机(P2)
    myPick: null,
    otherPick: null,
    myAssist: null,      // 我方援助索引（ASSISTS 下标）
    otherAssist: null,   // 对手援助索引
    assistCursor: 0,     // 联机选援助的光标
    prevRemoteAssist: false, // 对手援助键边沿检测
    prevLocalAssist: false,
    prevRemoteSuper: false,  // 对手奥义键边沿检测（T05：掩码 bit1024 是电平信号）
    lastSuperSig: '',        // 上一次广播过的奥义演出签名 'side:id'，用于"只广播一次"
    lobbyFocus: 0,       // 0=创建 1=加入
    err: '',
    info: '',
    code: '',
    codeInput: '',
    secret: '',          // 大厅里正在输入的联机码
    snap: null,
    remoteMask: 0,
    lastSnapSent: 0,
    waitT: 0,
    dcShown: false,
  };

  /* ===================== 昵称 ===================== */

  NP.loadNick = function () {
    let n = '';
    try { n = localStorage.getItem(C.nickKey) || ''; } catch (e) { n = ''; }
    NP.nick = n || C.nickDefault;
    return NP.nick;
  };

  NP.saveNick = function (n) {
    const s = String(n || '').slice(0, C.nickMax).trim() || C.nickDefault;
    NP.nick = s;
    try { localStorage.setItem(C.nickKey, s); } catch (e) { /* 隐私模式忽略 */ }
    NP.sendRaw({ t: 'nick', nick: s });
    return s;
  };

  NP.loadNick();

  /** 标题页显示用。 */
  NP.getNick = function () { return NP.nick || C.nickDefault; };

  /** 标题页「昵称设置」入口。 */
  NP.editNick = function () { showNick(NP.nick); };

  /* ===================== 昵称输入框（DOM 覆盖层） ===================== */

  let nickEl = null;
  let codeEl = null;

  function ensureDom() {
    const stage = document.getElementById('stage') || document.body;
    if (!nickEl) {
      nickEl = document.createElement('input');
      nickEl.type = 'text';
      nickEl.maxLength = C.nickMax;
      nickEl.placeholder = '输入昵称';
      nickEl.setAttribute('autocomplete', 'off');
      nickEl.className = 'net-input';
      stage.appendChild(nickEl);
      nickEl.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter') { commitNick(); }
        else if (e.key === 'Escape') { hideNick(); }
      });
      nickEl.addEventListener('blur', function () { /* 允许失焦，不自动提交 */ });
    }
    if (!codeEl) {
      codeEl = document.createElement('input');
      codeEl.type = 'text';
      codeEl.maxLength = C.codeLength;
      codeEl.placeholder = '六位联机码';
      codeEl.setAttribute('autocomplete', 'off');
      codeEl.className = 'net-input';
      stage.appendChild(codeEl);
      codeEl.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter') { doJoin(NP.codeInput); }
        else if (e.key === 'Escape') { hideCode(); }
      });
      codeEl.addEventListener('input', function () {
        const v = BVN.Net.normalizeCode(codeEl.value);
        codeEl.value = v;
        NP.codeInput = v;
      });
    }
  }

  function placeInput(el, cx, cy, w) {
    // cx/cy 为逻辑坐标（1280x720），按画布在屏幕上的实际缩放换算成像素
    const G = BVN.Game;
    const cr = G.canvas.getBoundingClientRect();
    const sr = el.parentElement.getBoundingClientRect();
    const k = cr.width / CFG.W;              // 逻辑像素 → 屏幕像素
    const left = cr.left - sr.left + (cx - w / 2) * k;
    const top = cr.top - sr.top + (cy - 22) * k;
    el.style.left = Math.round(left) + 'px';
    el.style.top = Math.round(top) + 'px';
    el.style.width = Math.round(w * k) + 'px';
    el.style.height = Math.round(44 * k) + 'px';
    el.style.fontSize = Math.round(22 * k) + 'px';
  }

  function showNick(cur) {
    ensureDom();
    hideCode();
    nickEl.value = cur || NP.nick;
    placeInput(nickEl, 640, 470, 360);
    nickEl.style.display = 'block';
    nickEl.focus();
    nickEl.select();
    NP.nickEditing = true;
  }

  function hideNick() {
    if (nickEl) nickEl.style.display = 'none';
    NP.nickEditing = false;
  }

  function commitNick() {
    NP.saveNick(nickEl.value);
    hideNick();
    const G = BVN.Game;
    if (G) { G.toast = '昵称已保存：' + NP.nick; G.toastT = 90; }
  }

  function showCode() {
    ensureDom();
    hideNick();
    codeEl.value = NP.codeInput || '';
    placeInput(codeEl, 640, 470, 300);
    codeEl.style.display = 'block';
    codeEl.focus();
    NP.codeEditing = true;
  }

  function hideCode() {
    if (codeEl) codeEl.style.display = 'none';
    NP.codeEditing = false;
  }

  NP.closeInputs = function () { hideNick(); hideCode(); };

  /* ===================== 进入 / 退出大厅 ===================== */

  NP.enterLobby = function () {
    const G = BVN.Game;
    G.phase = 'netlobby';
    G.entities.length = 0;
    G.fighters.length = 0;
    G.ais.length = 0;
    BVN.FX.reset();
    NP.state = 'lobby';
    NP.err = '';
    NP.info = '';
    NP.code = '';
    NP.codeInput = '';
    NP.snap = null;
    NP.remoteMask = 0;
    NP.dcShown = false;
    NP.myPick = null;
    NP.otherPick = null;
    NP.myAssist = null;
    NP.otherAssist = null;
    NP.assistCursor = 0;
    NP.prevRemoteAssist = false;
    NP.prevLocalAssist = false;
    NP.prevRemoteSuper = false;
    NP.lastSuperSig = '';
    NP.lobbyFocus = 0;
    NP.handshaked = false;
    NP.bindNet();
  };

  NP.leave = function (silent) {
    if (!silent) NP.sendRaw({ t: 'bye' });
    BVN.Net.close();
    NP.closeInputs();
    NP.state = 'off';
    NP.snap = null;
    NP.code = '';
    NP.handshaked = false;
    NP.abortSuper();
    const G = BVN.Game;
    if (!G) return;
    // 大厅 / 选人 / 战斗中 / 结算：统一回到标题（并清空局面，避免残留半场状态）
    if (G.phase === 'netlobby' || G.phase === 'fight' || G.phase === 'result') {
      G.mode = 'arcade';
      G.gotoTitle();
    }
  };

  /**
   * 联机侧的"清演出锁"。断线 / 主动退出时调用。
   *
   * 为什么必须做：奥义演出会把 `G.superLock` 置上并每帧锁输入，
   * 一旦对手掉线而演出还在跑，本地会一直停在"演不完的全屏黑"里（最长 2.8s 后才
   * 自己结束，且 `roundState` 仍是 active，玩家完全无法操作）。所以断线要立刻抹掉。
   */
  NP.abortSuper = function () {
    const G = BVN.Game;
    if (G && BVN.Super && BVN.Super.isActive(G)) {
      try { BVN.Super.abort(G); } catch (e) { /* 演出层异常不应阻断退出流程 */ }
    }
    if (G) G.superGrace = 0;
    NP.lastSuperSig = '';
    NP.prevRemoteSuper = false;
  };

  /** 统一的"连接已断开"处理（三处 close 回调共用）。 */
  function onNetClose(reason) {
    NP.state = 'off';
    NP.err = reason || '连接已断开';
    NP.dcShown = true;
    NP.closeInputs();
    NP.abortSuper();
  }
  NP.onNetClose = onNetClose;

  /* ===================== 网络事件绑定 ===================== */

  NP.bindNet = function () {
    const Net = BVN.Net;
    Net.on({
      open: function () {
        NP.state = 'connected';
        NP.err = '';
        NP.info = '已连接，等待对手交换信息…';
        NP.sendRaw({ t: 'hello', nick: NP.nick, ver: 1 });
      },
      data: function (d) { onData(d); },
      status: function (s) { NP.info = s; },
      close: function (reason) { onNetClose(reason); },
      error: function (msg) {
        NP.err = msg;
        NP.state = 'lobby';
      },
    });
  };

  NP.sendRaw = function (o) {
    const Net = BVN.Net;
    if (!Net.isConnected()) return false;
    return Net.send(o);
  };

  function onData(d) {
    const G = BVN.Game;
    switch (d.t) {
      case 'hello':
        NP.peerNick = String(d.nick || '对手').slice(0, C.nickMax);
        // 握手只处理一次：双方各自在 conn open 时都会发 hello，
        // 不能互相回 hello（会造成无限来回并把已选角色清空）
        if (!NP.handshaked) {
          NP.handshaked = true;
          NP.state = 'picking';
          NP.myIdx = BVN.Net.isHost() ? 0 : 1;
          G.beginNetSelect();
        }
        break;
      case 'nick':
        NP.peerNick = String(d.nick || '对手').slice(0, C.nickMax);
        break;
      case 'pick':
        NP.otherPick = d.c | 0;
        if (d.a != null) NP.otherAssist = d.a | 0;
        maybeStart();
        break;
      case 'start':
        if (BVN.Net.isHost()) break;
        NP.otherPick = d.a === NP.myIdx ? d.b : d.a;
        NP.myPick = d[NP.myIdx === 0 ? 'a' : 'b'];
        NP.myAssist = NP.myIdx === 0 ? d.aa : d.ab;
        NP.otherAssist = NP.myIdx === 0 ? d.ab : d.aa;
        G.startNetFight(d.a, d.b, d.theme, d.aa, d.ab);
        break;
      case 'i':
        if (BVN.Net.isHost()) NP.remoteMask = d.k | 0;
        break;
      case 's':
        if (!BVN.Net.isHost()) NP.snap = d;
        break;
      case 'cast':
        if (!BVN.Net.isHost()) {
          const f = G.fighters[d.i];
          if (f && BVN.Skills && BVN.Skills.use) BVN.Skills.use(f, G, d.kind);
        }
        break;
      case 'assist':
        // 主机召唤援助 → 客机本地重建演出记录（不扣次数、不重复结算伤害）
        if (!BVN.Net.isHost() && BVN.Assist) BVN.Assist.spawnRemote(d.side | 0, d.id);
        break;
      case 'au':
        // 援助剩余次数以主机为准
        if (!BVN.Net.isHost()) G.assistUses = (d.u || [3, 3]).slice(0, 2);
        break;
      case 'sup':
        /* 奥义演出开始：客机只演出、不结算。
           ① 本地已有演出锁（重复包 / 自己的演出还没走完）→ 直接忽略；
           ② 立刻把该侧的 used/charge 表现对齐主机（即使随后 30Hz 快照会覆盖，
              也不能出现"主机已扣资源、客机能量条还满着"的一帧不一致）。 */
        if (!BVN.Net.isHost() && BVN.Super) {
          const side = d.s | 0;
          if (!G.superLock && BVN.Super.beginRemote(side, d.id, G)) {
            if (G.superUsed) G.superUsed[side] = true;
            if (G.superCharge) G.superCharge[side] = 0;
          }
        }
        break;
      case 'su':
        // 奥义资源（used 位 + 充能值）：以主机为准，类比已有的 'au'
        if (!BVN.Net.isHost() && G.superUsed && G.superCharge && d.u && d.c) {
          G.superUsed = [!!d.u[0], !!d.u[1]];
          G.superCharge = [+d.c[0] || 0, +d.c[1] || 0];
        }
        break;
      case 'exec':
        // 决胜处决演出：客机同步锁定输入，走位与特效看快照
        if (!BVN.Net.isHost()) {
          G.roundState = 'exec';
          G.execWinner = d.w | 0;
          G.execLoser = 1 - G.execWinner;
          G.execHit = false;
        }
        break;
      case 'round':
        if (!BVN.Net.isHost()) {
          G.round = d.r; G.wins = d.w.slice(0, 2); G.roundState = d.rs; G.timer = d.tm;
        }
        break;
      case 'bye':
        NP.err = '对手已退出房间';
        NP.state = 'off';
        NP.dcShown = true;
        NP.abortSuper();     // 对手退出时若正在放奥义，立刻解锁，别让本地卡在全屏黑
        break;
      case 'over':
        if (!BVN.Net.isHost()) {
          G.wins = (d.w || G.wins).slice(0, 2);
          G.resultWinner = typeof d.winner === 'number' ? d.winner : 0;
          G.resultIndex = 0;
          G.phase = 'result';
        }
        break;
      case 'unpick':
        NP.otherPick = null;
        NP.otherAssist = null;
        break;
      default: break;
    }
  }

  function maybeStart() {
    if (NP.myPick === null || NP.myAssist === null) return;
    if (NP.otherPick === null || NP.otherAssist === null) return;
    if (!BVN.Net.isHost()) return;
    const G = BVN.Game;
    const theme = Math.random() < 0.5 ? 'shrine' : 'inferno';
    NP.sendRaw({ t: 'start', a: NP.myPick, b: NP.otherPick, theme: theme, aa: NP.myAssist, ab: NP.otherAssist });
    G.startNetFight(NP.myPick, NP.otherPick, theme, NP.myAssist, NP.otherAssist);
  }

  NP.pick = function (idx) {
    NP.myPick = idx;
    // 进入援助子步：零计时 + 锁定确定键，防止「选角色顺手再按一下」把援助页一帧跳过
    NP.assistT = 0;
    NP.assistArmed = false;
    NP.sendRaw({ t: 'pick', c: idx });
    if (NP.otherPick !== null) maybeStart();
  };

  /* ===================== 建房 / 加入 ===================== */

  function doHost() {
    NP.state = 'hosting';
    NP.err = '';
    NP.info = '正在创建房间…';
    BVN.Net.on({
      open: function () {
        NP.state = 'connected';
        NP.err = '';
        NP.info = '等待对手输入联机码加入…';
        NP.sendRaw({ t: 'hello', nick: NP.nick, ver: 1 });
      },
      data: onData,
      status: function (s) { NP.info = s; },
      close: function (r) { onNetClose(r); },
      error: function (m) { NP.err = m; NP.state = 'lobby'; },
    });
    BVN.Net.startHost(null, function (code) {
      NP.code = code;
      NP.info = '把联机码告诉对方，等待加入…';
    }, function (msg) {
      NP.err = msg;
      NP.state = 'lobby';
    });
  }

  function doJoin(code) {
    const c = BVN.Net.normalizeCode(code);
    if (!BVN.Net.isValidCode(c)) { NP.err = '联机码需要 6 位（不含 0/O/1/I）'; return; }
    NP.code = c;
    NP.codeInput = c;
    hideCode();
    NP.state = 'joining';
    NP.err = '';
    NP.info = '正在连接房间 ' + c + ' …';
    NP.handshaked = false;
    BVN.Net.on({
      open: function () {
        NP.state = 'connected';
        NP.err = '';
        NP.info = '已连接，等待同步…';
        NP.sendRaw({ t: 'hello', nick: NP.nick, ver: 1 });
      },
      data: onData,
      status: function (s) { NP.info = s; },
      close: function (r) { onNetClose(r); },
      error: function (m) { NP.err = m; NP.state = 'lobby'; },
    });
    BVN.Net.startJoin(c, function (msg) { NP.err = msg; NP.state = 'lobby'; });
  }

  NP.doHost = doHost;
  NP.doJoin = doJoin;

  /* ===================== 大厅更新 ===================== */

  NP.updateLobby = function (dt) {
    const G = BVN.Game;
    NP.waitT++;

    if (NP.nickEditing || NP.codeEditing) {
      // 输入框聚焦时吞掉游戏按键
      if (G.pressed && G.pressed['Escape']) { hideNick(); hideCode(); }
      return;
    }

    const canBack = true;

    if (NP.state === 'lobby') {
      if (G.pressed['ArrowLeft'] || G.pressed['KeyA'] || G.pressed['ArrowRight'] || G.pressed['KeyD']) {
        NP.lobbyFocus = 1 - NP.lobbyFocus;
        BVN.Sfx.play('ui');
      }
      if (G.pressed['KeyN']) { showNick(NP.nick); return; }
      if (G.pressed['Enter'] || G.pressed['Space'] || G.pressed['KeyJ']) {
        BVN.Sfx.play('uiPick');
        if (NP.lobbyFocus === 0) doHost();
        else { NP.codeInput = ''; showCode(); }
      }
      if (G.pressed['Escape'] && canBack) { NP.leave(true); }
      return;
    }

    if (NP.state === 'hosting' || NP.state === 'joining' || NP.state === 'connected') {
      if (G.pressed['Escape']) { NP.leave(); }
      return;
    }

    if (NP.state === 'picking') {
      updateNetSelect(dt);
      return;
    }

    if (NP.state === 'off') {
      if (G.pressed['Escape'] || G.pressed['Enter'] || G.pressed['Space']) { NP.leave(true); }
    }
  };

  /* ===================== 联机选人 ===================== */

  const CARD_W = 210;
  const CARD_H = 158;

  function cardRect(i, n) {
    const cols = 4;
    const gapX = 18;
    const gapY = 30;
    const totalW = cols * CARD_W + (cols - 1) * gapX;
    const x0 = (CFG.W - totalW) / 2;
    const y0 = 150;
    const col = i % cols;
    const row = (i / cols) | 0;
    return { x: x0 + col * (CARD_W + gapX), y: y0 + row * (CARD_H + gapY), w: CARD_W, h: CARD_H };
  }

  let selCursor = 0;

  function updateNetSelect(dt) {
    const G = BVN.Game;
    const K = BVN.KEYS;
    const left = G.pressed['KeyA'] || G.pressed['ArrowLeft'];
    const right = G.pressed['KeyD'] || G.pressed['ArrowRight'];
    const up = G.pressed['KeyW'] || G.pressed['ArrowUp'];
    const down = G.pressed['KeyS'] || G.pressed['ArrowDown'];
    const confirm = G.pressed['Enter'] || G.pressed['Space'] || G.pressed['KeyJ'];

    // 援助子步：角色已选、援助未选
    if (NP.myPick !== null && NP.myAssist === null) {
      NP.assistT = (NP.assistT || 0) + 1;
      const n = BVN.ASSISTS.length;
      if (left) { NP.assistCursor = (NP.assistCursor + n - 1) % n; BVN.Sfx.play('ui'); }
      if (right) { NP.assistCursor = (NP.assistCursor + 1) % n; BVN.Sfx.play('ui'); }
      if (G.pressed['KeyR']) { NP.assistCursor = (Math.random() * n) | 0; BVN.Sfx.play('ui'); }
      // 与单机一致的双闸门：确定键需先松开过一次，且进入本步满 12 帧
      if (!(G.keys['Enter'] || G.keys['Space'] || G.keys['KeyJ'])) NP.assistArmed = true;
      if (confirm && NP.assistArmed && NP.assistT > 12) {
        BVN.Sfx.play('uiPick');
        NP.myAssist = NP.assistCursor;
        NP.sendRaw({ t: 'pick', c: NP.myPick, a: NP.myAssist });
        maybeStart();
      }
      // Esc 退回重选角色
      if (NP.assistT > 8 && G.pressed['Escape']) {
        NP.myPick = null;
        NP.assistT = 0;
        NP.assistArmed = false;
        NP.sendRaw({ t: 'unpick' });
      }
      return;
    }

    if (NP.myPick !== null) {
      if (G.pressed['Escape']) {
        NP.myPick = null;
        NP.myAssist = null;
        NP.sendRaw({ t: 'unpick' });
      }
      return;
    }
    if (left) { selCursor = (selCursor + 7) % 8; BVN.Sfx.play('ui'); }
    if (right) { selCursor = (selCursor + 1) % 8; BVN.Sfx.play('ui'); }
    if (up) { selCursor = (selCursor + 4) % 8; BVN.Sfx.play('ui'); }
    if (down) { selCursor = (selCursor + 4) % 8; BVN.Sfx.play('ui'); }
    if (G.pressed['KeyR']) { selCursor = (Math.random() * 8) | 0; BVN.Sfx.play('ui'); }
    if (confirm) {
      BVN.Sfx.play('uiPick');
      NP.pick(selCursor);
    }
    if (G.pressed['Escape']) { NP.leave(); }
  }

  NP.updateNetSelect = updateNetSelect;
  NP.resetSelectCursor = function () {
    selCursor = 0;
    NP.myPick = null;
    NP.otherPick = null;
    NP.myAssist = null;
    NP.otherAssist = null;
    NP.assistCursor = 0;
    NP.prevRemoteAssist = false;
    NP.prevLocalAssist = false;
    NP.prevRemoteSuper = false;
    NP.lastSuperSig = '';
    NP.snap = null;
  };

  /* ===================== 战斗同步 ===================== */

  const STATE_LIST = ['idle', 'walk', 'jump', 'fall', 'crouch', 'guard', 'dash',
    'attack', 'hitstun', 'knockdown', 'ko', 'land'];
  /* ⚠ 只能往后追加，不能插队改顺序（下标即线上协议）。
     'super'（T05）= 奥义演出专用 attackKey，漏了这一项客机会把主机的
     超必杀动作解码成 ''（空串），attackDef 被置 null → 动作瞬间复位。 */
  const ATK_LIST = ['', 'light1', 'light2', 'light3', 'heavy', 'airLight', 'skill', 'ult', 'rise', 'dive', 'assist', 'super'];

  function codecIdx(list, v) {
    const i = list.indexOf(v);
    return i < 0 ? 0 : i;
  }

  function packFighter(f) {
    return {
      x: Math.round(f.x * 10) / 10,
      y: Math.round(f.y * 10) / 10,
      vx: Math.round(f.vx),
      vy: Math.round(f.vy),
      hp: Math.round(f.hp),
      mt: Math.round(f.meter),
      st: codecIdx(STATE_LIST, f.state),
      fc: f.facing,
      ak: codecIdx(ATK_LIST, f.attackKey || ''),
      af: f.attackFrame | 0,
      gd: f.guarding ? 1 : 0,
      og: f.onGround ? 1 : 0,
      hs: f.hitstunTimer > 0 ? 1 : 0,
      cm: f.comboCount | 0,
    };
  }

  /**
   * 把主机快照的一个 fighter 灌进本地。
   * @param {Object} f 本地 Fighter
   * @param {Object} s 快照里的 fighter 段
   * @param {boolean} smooth 位置是否平滑收敛
   * @param {boolean} [keepAction] true = 只同步位置/血量/气，不动动作状态。
   *        奥义演出期用：施法者的 `attackKey='super'` 没有对应的 `BVN.ATTACKS` 表项，
   *        若照常解包会被写成 `attackDef=null` → `updateAttack` 立刻把状态弹回 idle →
   *        `Super.update` 的"施法者必须仍在 attack"守卫判定演出中断 → 客机演出被提前 abort。
   */
  function unpackFighter(f, s, smooth, keepAction) {
    if (!f || !s) return;
    if (smooth) {
      const dx = s.x - f.x;
      const dy = s.y - f.y;
      // 误差小则平滑收敛，误差大直接吸附（避免穿墙/瞬移）
      if (Math.abs(dx) > 90 || Math.abs(dy) > 140) { f.x = s.x; f.y = s.y; }
      else { f.x += dx * 0.45; f.y += dy * 0.45; }
      f.vx = s.vx; f.vy = s.vy;
    } else {
      f.x = s.x; f.y = s.y; f.vx = s.vx; f.vy = s.vy;
    }
    f.hp = s.hp;
    f.meter = s.mt;
    f.facing = s.fc;
    const akName = ATK_LIST[s.ak] || '';
    // 奥义动作一律交给本地 Super 锁驱动（beginRemote 已把 attackDef 建好）；
    // 不要用 ATTACKS 表覆盖，否则就是上面注释里的"动作瞬间复位"。
    const isSuperAtk = akName === 'super';
    if (!keepAction && !isSuperAtk) {
      const st = STATE_LIST[s.st] || 'idle';
      if (f.state !== st) {
        f.state = st;
        if (st !== 'attack') { f.attackDef = null; f.script = null; f.onTick = null; }
      }
      if ((f.attackKey || '') !== akName) {
        f.attackKey = akName || null;
        f.attackDef = akName && BVN.ATTACKS[akName] ? BVN.ATTACKS[akName] : null;
      }
      f.attackFrame = s.af;
    }
    f.guarding = !!s.gd;
    f.onGround = !!s.og;
    f.comboCount = s.cm;
  }

  /** 客机：每帧把快照灌进本地模拟（对手权威、自己只校正血量/气）。 */
  NP.applySnapshot = function () {
    const G = BVN.Game;
    const s = NP.snap;
    if (!s || !G.fighters[0] || !G.fighters[1]) return;

    // 局面（回合、计时、胜场）以主机为准
    G.timer = s.tm;
    G.round = s.r;
    if (G.wins[0] !== s.w[0] || G.wins[1] !== s.w[1]) G.wins = [s.w[0], s.w[1]];
    if (G.roundState !== s.rs) {
      G.roundState = s.rs;
      G.roundT = s.rt | 0;
    }
    if (G.baseTheme !== s.th && BVN.THEMES[s.th]) {
      G.baseTheme = s.th;
      G.theme = BVN.THEMES[s.th];
    }

    // 奥义资源：30Hz 快照自带 sc/su → 即使 'su' 消息丢了也能自愈（约 +4 字节）
    if (s.su && G.superUsed) G.superUsed = [!!s.su[0], !!s.su[1]];
    if (s.sc && G.superCharge) G.superCharge = [+s.sc[0] || 0, +s.sc[1] || 0];

    const remote = G.fighters[1 - NP.myIdx];
    const own = G.fighters[NP.myIdx];

    // 演出期：施法者的动作完全由本地 Super 锁驱动，别让快照把 attackDef 冲成 null
    const supOn = !!(BVN.Super && BVN.Super.isActive(G));
    const caster = supOn && G.superLock ? (G.superLock.side | 0) : -1;
    const remoteSide = 1 - NP.myIdx;

    // 对手：位置平滑 + 状态权威
    unpackFighter(remote, NP.myIdx === 0 ? s.b : s.a, true, supOn && remoteSide === caster);

    // 自己：只校正血量/气/连击；位置偏差过大才吸附（本地预测优先）
    const mine = NP.myIdx === 0 ? s.a : s.b;
    own.hp = mine.hp;
    own.meter = mine.mt;
    own.comboCount = mine.cm;
    const dx = mine.x - own.x;
    if (Math.abs(dx) > 80) own.x = mine.x;
    else if (Math.abs(dx) > 12) own.x += dx * 0.5;
    if (mine.st === codecIdx(STATE_LIST, 'ko')) own.state = 'ko';
    if (mine.st === codecIdx(STATE_LIST, 'hitstun') && own.state !== 'hitstun') {
      own.state = 'hitstun';
      own.hitstunTimer = 6;
    }
  };

  /** 主机：广播快照。 */
  NP.sendSnapshot = function (force) {
    const G = BVN.Game;
    if (!BVN.Net.isHost() || !G.fighters[0] || !G.fighters[1]) return;
    const now = G.frame;
    const interval = Math.max(1, Math.round(60 / C.snapshotHz));
    if (!force && now - NP.lastSnapSent < interval) return;
    NP.lastSnapSent = now;
    BVN.Net.send({
      t: 's',
      a: packFighter(G.fighters[0]),
      b: packFighter(G.fighters[1]),
      tm: G.timer, r: G.round, rs: G.roundState, rt: G.roundT, w: G.wins, th: G.baseTheme,
      // 奥义资源（T05）：charge 取整、used 用 0/1，约 +4 字节
      sc: [
        Math.round(G.superCharge ? (G.superCharge[0] || 0) : 0),
        Math.round(G.superCharge ? (G.superCharge[1] || 0) : 0),
      ],
      su: [
        G.superUsed && G.superUsed[0] ? 1 : 0,
        G.superUsed && G.superUsed[1] ? 1 : 0,
      ],
    });
  };

  /** 客机：把自己的按键打包发给主机。 */
  NP.sendInput = function () {
    const G = BVN.Game;
    const K = BVN.KEYS;
    let m = 0;
    if (downAny(K.p1.left)) m |= 1;
    if (downAny(K.p1.right)) m |= 2;
    if (downAny(K.p1.up)) m |= 4;
    if (downAny(K.p1.down)) m |= 8;
    if (downAny(K.p1.light)) m |= 16;
    if (downAny(K.p1.heavy)) m |= 32;
    if (downAny(K.p1.skill)) m |= 64;
    if (downAny(K.p1.ult)) m |= 128;
    if (downAny(K.p1.dash)) m |= 256;
    if (downAny(K.p1.assist)) m |= 512;   // 援助（主机做边沿检测）
    if (downAny(K.p1.super)) m |= 1024;   // 超级奥义（主机做边沿检测，客机永不自行启动）
    NP.sendRaw({ t: 'i', n: G.frame, k: m });
  };

  function downAny(codes) {
    const G = BVN.Game;
    for (let i = 0; i < codes.length; i++) {
      if (G.keys[codes[i]] || (G.sticky[codes[i]] || 0) > 0) return true;
    }
    return false;
  }

  /** 把 11 位掩码写进指定角色的 ctrl（联机双方都用 P1 键位）。 */
  NP.maskToCtrl = function (f, m) {
    if (!f) return;
    const c = f.ctrl;
    c.left = !!(m & 1); c.right = !!(m & 2); c.up = !!(m & 4); c.down = !!(m & 8);
    c.light = !!(m & 16); c.heavy = !!(m & 32); c.skill = !!(m & 64);
    c.ult = !!(m & 128); c.dash = !!(m & 256); c.super = !!(m & 1024);
  };

  NP.localMask = function () {
    const K = BVN.KEYS;
    let m = 0;
    if (downAny(K.p1.left)) m |= 1;
    if (downAny(K.p1.right)) m |= 2;
    if (downAny(K.p1.up)) m |= 4;
    if (downAny(K.p1.down)) m |= 8;
    if (downAny(K.p1.light)) m |= 16;
    if (downAny(K.p1.heavy)) m |= 32;
    if (downAny(K.p1.skill)) m |= 64;
    if (downAny(K.p1.ult)) m |= 128;
    if (downAny(K.p1.dash)) m |= 256;
    if (downAny(K.p1.assist)) m |= 512;
    if (downAny(K.p1.super)) m |= 1024;
    return m;
  };

  /** 联机战斗的按键分配（每边只用 P1 键位控制自己的角色）。 */
  NP.readControls = function (locked) {
    const G = BVN.Game;
    const K = BVN.KEYS;
    if (!G.fighters[0] || !G.fighters[1]) return;

    // 奥义广播放在最前面：演出期 locked=true 会提前 return，但"主机刚放完奥义"
    // 这件事仍然要通知客机，否则客机永远等不到 'sup'。
    if (BVN.Net.isHost()) NP.watchSuper(G);

    const zero = function (f) {
      f.ctrl.left = f.ctrl.right = f.ctrl.up = f.ctrl.down = false;
      f.ctrl.light = f.ctrl.heavy = f.ctrl.skill = f.ctrl.ult = f.ctrl.dash = false;
      f.ctrl.super = false;
    };
    if (locked) {
      zero(G.fighters[0]); zero(G.fighters[1]);
      // T05/B2：与本地模式同款 —— 交给 game.js updateFight 在解锁首帧对齐 _prev
      G._inputWasLocked = true;
      return;
    }
    const me = G.fighters[NP.myIdx];
    const other = G.fighters[1 - NP.myIdx];
    if (!BVN.Net.isConnected()) { zero(me); zero(other); return; }
    if (BVN.Net.isHost()) {
      NP.maskToCtrl(me, NP.localMask());                 // 主机自己的键位：奥义走 Fighter 的 press('super')
      NP.maskToCtrl(other, NP.remoteMask & ~1024);       // 客机的 super 位不写进 ctrl（主机显式启动，避免双重触发）
      // 援助：掩码是电平信号，这里做边沿检测后触发召唤
      if (BVN.Assist) {
        const lb = downAny(K.p1.assist);
        if (lb && !NP.prevLocalAssist) BVN.Assist.trySummon(me.index, G);
        NP.prevLocalAssist = lb;
        const rb = !!(NP.remoteMask & 512);
        if (rb && !NP.prevRemoteAssist) BVN.Assist.trySummon(other.index, G);
        NP.prevRemoteAssist = rb;
      }
      // 奥义：客机只发 bit1024，资源校验与启动全在主机侧完成，成功后立刻广播
      if (BVN.Super) {
        const rs = !!(NP.remoteMask & 1024);
        if (rs && !NP.prevRemoteSuper && !G.superLock) {
          if (BVN.Super.tryActivate(other.index, G)) NP.watchSuper(G);
        }
        NP.prevRemoteSuper = rs;
      }
    } else {
      // 客机：本地判定永不启动奥义（主机权威）。super 位在这里被剥掉，
      // 但仍会通过 sendInput 的完整掩码发给主机。
      NP.maskToCtrl(me, NP.localMask() & ~1024);
      zero(other);
    }
  };

  /**
   * 主机：检测"刚刚开始了一场奥义演出"并广播 sup + su。
   *
   * 不侵入 Super 的原因：T04 的演出层只管演出，联机协议不该反向依赖它；
   * 这里用「签名变化」做哨兵（side:id），一次演出只广播一次，演出结束自动复位。
   */
  NP.watchSuper = function (G) {
    const lock = G && G.superLock;
    if (!lock) { NP.lastSuperSig = ''; return; }
    const sig = (lock.side | 0) + ':' + lock.id;
    if (sig === NP.lastSuperSig) return;
    NP.lastSuperSig = sig;
    NP.sendRaw({ t: 'sup', s: lock.side | 0, id: lock.id });
    NP.sendSuperRes(G);
  };

  /** 主机：广播奥义资源（used + charge），类比已有的 'au'。 */
  NP.sendSuperRes = function (G) {
    if (!G || !G.superCharge || !G.superUsed) return;
    NP.sendRaw({
      t: 'su',
      u: [G.superUsed[0] ? 1 : 0, G.superUsed[1] ? 1 : 0],
      c: [Math.round(G.superCharge[0] || 0), Math.round(G.superCharge[1] || 0)],
    });
  };

  /** 主机施法广播（客机据此在本地重建同样的特效）。 */
  NP.onSkill = function (f, kind) {
    if (!BVN.Net.isHost()) return;
    NP.sendRaw({ t: 'cast', i: f.index, kind: kind });
  };

  NP.isGuest = function () {
    return BVN.Net.isConnected() && !BVN.Net.isHost();
  };

  /* ===================== 大厅绘制 ===================== */

  function text(str, x, y, size, color, opt) {
    const G = BVN.Game;
    const ctx = G.ctx;
    const o = opt || {};
    ctx.font = (o.weight || '900') + ' ' + size + 'px ' + CFG.FONT;
    ctx.textAlign = o.align || 'center';
    ctx.textBaseline = o.baseline || 'middle';
    if (o.stroke) {
      ctx.lineWidth = o.strokeW || Math.max(3, size * 0.12);
      ctx.strokeStyle = o.stroke;
      ctx.lineJoin = 'round';
      ctx.strokeText(str, x, y);
    }
    if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = o.blur || 18; }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
    ctx.shadowBlur = 0;
    return ctx.measureText(str).width;
  }

  function panel(ctx, x, y, w, h, active) {
    ctx.fillStyle = active ? 'rgba(232,180,90,0.14)' : 'rgba(10,14,24,0.72)';
    BVN.Art.roundRect(ctx, x, y, w, h, 12);
    ctx.fill();
    ctx.strokeStyle = active ? 'rgba(240,200,120,0.95)' : 'rgba(120,140,180,0.35)';
    ctx.lineWidth = active ? 2.5 : 1.5;
    BVN.Art.roundRect(ctx, x, y, w, h, 12);
    ctx.stroke();
  }

  NP.drawLobby = function () {
    const G = BVN.Game;
    const ctx = G.ctx;
    const t = G.time;

    // 背景
    const cam = { x: 320 + Math.sin(t * 0.25) * 50, y: -32, zoom: 1, viewW: CFG.W, viewH: CFG.H };
    BVN.Art.drawBackground(ctx, cam, BVN.THEMES.shrine, t);
    ctx.fillStyle = 'rgba(4,5,10,0.78)';
    ctx.fillRect(0, 0, CFG.W, CFG.H);

    text('联 机 对 战', 640, 82, 46, '#f0c878', { glow: '#e8b45a', blur: 22, stroke: '#0a0a10', strokeW: 8 });
    text('双方输入同一个联机码即可对打', 640, 126, 18, 'rgba(210,218,236,0.75)');

    // 昵称条
    text('我的昵称', 400, 176, 15, 'rgba(180,192,216,0.7)', { align: 'right' });
    text(NP.nick, 420, 176, 22, '#ffe9b0', { align: 'left', stroke: '#0a0a10', strokeW: 4 });
    text('按 N 修改', 660, 176, 14, 'rgba(150,162,190,0.7)', { align: 'left' });

    if (NP.state === 'lobby') {
      const w = 420, h = 132;
      const lx = 640 - w - 24, rx = 640 + 24;
      const y = 250;

      panel(ctx, lx, y, w, h, NP.lobbyFocus === 0);
      text('创建房间', lx + w / 2, y + 44, 30, NP.lobbyFocus === 0 ? '#ffe9b0' : 'rgba(206,214,232,0.66)');
      text('生成一个联机码，等对方加入', lx + w / 2, y + 84, 15, 'rgba(170,182,208,0.72)');
      text('（主机为左侧 1P）', lx + w / 2, y + 108, 13, 'rgba(150,162,190,0.6)');
      G.hotspots.push({ x: lx, y: y, w: w, h: h, action: 'net:host' });

      panel(ctx, rx, y, w, h, NP.lobbyFocus === 1);
      text('加入房间', rx + w / 2, y + 44, 30, NP.lobbyFocus === 1 ? '#ffe9b0' : 'rgba(206,214,232,0.66)');
      text('输入对方给你的六位联机码', rx + w / 2, y + 84, 15, 'rgba(170,182,208,0.72)');
      text('（客机为右侧 2P）', rx + w / 2, y + 108, 13, 'rgba(150,162,190,0.6)');
      G.hotspots.push({ x: rx, y: y, w: w, h: h, action: 'net:join' });

      text('← → 选择 · Enter 确定 · N 改昵称 · Esc 返回', 640, 690, 15, 'rgba(180,190,214,0.55)');
    }

    if (NP.state === 'hosting' || NP.state === 'joining' || NP.state === 'connected') {
      const isHost = NP.state !== 'joining';
      const boxW = 620, boxH = 210;
      const bx = (CFG.W - boxW) / 2, by = 250;
      panel(ctx, bx, by, boxW, boxH, true);

      if (isHost && NP.code) {
        text('联 机 码', 640, by + 44, 17, 'rgba(200,210,230,0.8)');
        text(NP.code, 640, by + 106, 76, '#ffe9b0', {
          stroke: '#0a0a10', strokeW: 8, glow: '#e8b45a', blur: 26, letterSpacing: 14,
        });
        const pulse = 0.55 + Math.sin(t * 3) * 0.25;
        text('等待对手加入' + '…'.slice(0, 1 + ((t * 2) | 0) % 3), 640, by + 168, 18,
          'rgba(255,233,176,' + pulse.toFixed(2) + ')');
      } else {
        const dots = '…'.slice(0, 1 + ((t * 2) | 0) % 3);
        const label = isHost ? ('正在创建房间' + dots) : ('正在连接' + dots);
        text(label, 640, by + 92, 30, '#ffe9b0');
        text(isHost ? '首次连接公共信令约需 2~5 秒' : ('联机码：' + (NP.code || '——')),
          640, by + 140, 18, 'rgba(200,210,230,0.8)');
      }
      text('Esc 取消', 640, by + boxH - 18, 14, 'rgba(150,162,190,0.6)');
    }

    if (NP.state === 'off' && NP.dcShown) {
      ctx.fillStyle = 'rgba(3,4,9,0.86)';
      ctx.fillRect(0, 0, CFG.W, CFG.H);
      text('连接已断开', 640, 300, 54, '#ff7a6a', { stroke: '#12060a', strokeW: 10, glow: '#ff3b30', blur: 24 });
      text(NP.err || '对手离开了房间', 640, 356, 20, 'rgba(226,214,206,0.9)');
      text('按 Enter / Esc 返回标题', 640, 430, 16, 'rgba(180,190,214,0.7)');
    }

    if (NP.err && NP.state === 'lobby') {
      text(NP.err, 640, 430, 17, '#ff8a7a', { stroke: '#12060a', strokeW: 4 });
    }
    if (NP.info && (NP.state === 'hosting' || NP.state === 'joining')) {
      text(NP.info, 640, 500, 15, 'rgba(190,200,222,0.75)');
    }
  };

  NP.drawNetSelect = function () {
    const G = BVN.Game;
    const ctx = G.ctx;
    const t = G.time;

    const cam = { x: 900, y: -32, zoom: 1, viewW: CFG.W, viewH: CFG.H };
    BVN.Art.drawBackground(ctx, cam, BVN.THEMES.shrine, t);
    ctx.fillStyle = 'rgba(4,5,10,0.8)';
    ctx.fillRect(0, 0, CFG.W, CFG.H);

    text('选 择 角 色', 640, 62, 38, '#f0c878', { glow: '#e8b45a', blur: 20, stroke: '#0a0a10', strokeW: 8 });

    // 双方状态
    const myRole = NP.myIdx === 0 ? '1P（主机）' : '2P（客机）';
    text('你：' + NP.nick + '  ·  ' + myRole, 320, 108, 17, '#9fd0ff', { stroke: '#0a0a10', strokeW: 4 });
    const opp = NP.peerNick || '对手';
    text('对手：' + opp + (NP.otherPick !== null ? '（已选 ' + BVN.ROSTER[NP.otherPick].name + '）' : '（选择中…）'),
      960, 108, 17, NP.otherPick !== null ? '#ffd9a0' : 'rgba(200,208,228,0.62)', { stroke: '#0a0a10', strokeW: 4 });

    for (let i = 0; i < 8; i++) {
      const r = cardRect(i);
      const def = BVN.ROSTER[i];
      const mine = NP.myPick === i;
      const theirs = NP.otherPick === i;
      const cur = selCursor === i && NP.myPick === null;

      ctx.save();
      if (cur) { ctx.shadowColor = 'rgba(120,200,255,0.9)'; ctx.shadowBlur = 22; }
      if (theirs) { ctx.shadowColor = 'rgba(255,120,90,0.9)'; ctx.shadowBlur = 22; }
      ctx.fillStyle = 'rgba(8,10,18,0.9)';
      BVN.Art.roundRect(ctx, r.x, r.y, r.w, r.h, 10);
      ctx.fill();
      ctx.restore();

      const img = BVN.Art.img(def.id);
      if (img) {
        ctx.save();
        BVN.Art.roundRect(ctx, r.x, r.y, r.w, r.h, 10);
        ctx.clip();
        BVN.Art.drawCover(ctx, img, r.x, r.y, r.w, r.h, def.face[0], def.face[1], Math.min(def.face[2] || 1, 1.4));
        const g = ctx.createLinearGradient(0, r.y + r.h - 60, 0, r.y + r.h);
        g.addColorStop(0, 'rgba(4,5,10,0)');
        g.addColorStop(1, 'rgba(4,5,10,0.94)');
        ctx.fillStyle = g;
        ctx.fillRect(r.x, r.y + r.h - 60, r.w, 60);
        ctx.restore();
      }

      const col = mine ? '#7fd4ff' : (theirs ? '#ff9a7a' : (cur ? '#ffe9b0' : 'rgba(226,232,246,0.86)'));
      ctx.strokeStyle = mine ? 'rgba(120,210,255,1)' : (theirs ? 'rgba(255,150,110,0.95)' : (cur ? 'rgba(240,200,120,0.95)' : 'rgba(110,124,156,0.5)'));
      ctx.lineWidth = (mine || theirs || cur) ? 3 : 1.2;
      BVN.Art.roundRect(ctx, r.x, r.y, r.w, r.h, 10);
      ctx.stroke();

      text(def.name, r.x + r.w / 2, r.y + r.h - 26, 17, col, { stroke: '#06070c', strokeW: 5 });
      text(def.title, r.x + r.w / 2, r.y + r.h - 9, 12, 'rgba(200,208,228,0.7)');

      if (mine) text('你', r.x + 14, r.y + 16, 14, '#0a1620', { weight: '900' });
      if (mine) {
        ctx.fillStyle = 'rgba(120,210,255,0.95)';
        ctx.beginPath(); ctx.arc(r.x + 16, r.y + 16, 9, 0, Math.PI * 2); ctx.fill();
      }
      if (theirs) {
        ctx.fillStyle = 'rgba(255,150,110,0.95)';
        ctx.beginPath(); ctx.arc(r.x + 16, r.y + 16, 9, 0, Math.PI * 2); ctx.fill();
      }

      G.hotspots.push({ x: r.x, y: r.y, w: r.w, h: r.h, action: 'netsel:' + i });
    }

    // 援助选择条：角色已选、援助未选时显示
    if (NP.myPick !== null && NP.myAssist === null) {
      const n = BVN.ASSISTS.length;
      const aw = 128;
      const ah = 104;
      const agap = 12;
      const atotal = n * aw + (n - 1) * agap;
      const ax0 = (CFG.W - atotal) / 2;
      const ay = 520;
      text('选 择 援 助', 640, 496, 20, '#f0c878', { stroke: '#0a0a10', strokeW: 5 });
      for (let k = 0; k < n; k++) {
        const d = BVN.ASSISTS[k];
        const x = ax0 + k * (aw + agap);
        const cur = NP.assistCursor === k;
        ctx.fillStyle = 'rgba(8,10,18,0.9)';
        BVN.Art.roundRect(ctx, x, ay, aw, ah, 8);
        ctx.fill();
        const aimg = BVN.Assist ? BVN.Assist.img(d.id) : null;
        if (aimg) {
          ctx.save();
          BVN.Art.roundRect(ctx, x, ay, aw, ah, 8);
          ctx.clip();
          BVN.Art.drawCover(ctx, aimg, x, ay, aw, ah - 24, d.face[0], d.face[1], d.face[2] || 1);
          ctx.restore();
        }
        text(d.short, x + aw / 2, ay + ah - 12, 14, d.color, { stroke: '#06070c', strokeW: 4 });
        ctx.strokeStyle = cur ? 'rgba(240,200,120,0.95)' : 'rgba(110,124,156,0.5)';
        ctx.lineWidth = cur ? 3 : 1.2;
        BVN.Art.roundRect(ctx, x, ay, aw, ah, 8);
        ctx.stroke();
        // 鼠标可点选
        G.hotspots.push({ x: x, y: ay, w: aw, h: ah, action: 'netselA:' + k });
      }
      text('←/→ 切换 · Enter 确定 · 也可点卡片 · Esc 重选角色', 640, 664, 15, 'rgba(180,190,214,0.6)');
    } else {
      const pickName = NP.myPick !== null ? BVN.ROSTER[NP.myPick].name : null;
      if (pickName) {
        const waitAssist = NP.myAssist === null;
        text('你选择了 ' + pickName + (NP.otherPick === null ? '，等待对手…' : '，援助：' + BVN.ASSISTS[NP.myAssist].short),
          640, 640, 20, '#9fd0ff', { stroke: '#0a0a10', strokeW: 4 });
        if (waitAssist) text('', 640, 664, 12, '#fff');
      } else {
        text('← → ↑ ↓ 选择 · Enter 确定 · R 随机 · Esc 退出', 640, 640, 15, 'rgba(180,190,214,0.6)');
      }
    }
  };

  /* 点击处理（由 game.js 的 hotspot 系统转发） */
  NP.handleAction = function (act) {
    if (act === 'net:host') { NP.lobbyFocus = 0; doHost(); return true; }
    if (act === 'net:join') { NP.lobbyFocus = 1; NP.codeInput = ''; showCode(); return true; }
    if (act.indexOf('netsel:') === 0) {
      const i = parseInt(act.slice(7), 10);
      if (NP.myPick === null && !isNaN(i)) { NP.pick(i); }
      return true;
    }
    if (act.indexOf('netselA:') === 0) {
      const i = parseInt(act.slice(8), 10);
      if (NP.myPick !== null && NP.myAssist === null && !isNaN(i)) {
        NP.assistCursor = i;
        NP.myAssist = i;
        BVN.Sfx.play('uiPick');
        NP.sendRaw({ t: 'pick', c: NP.myPick, a: NP.myAssist });
        maybeStart();
      }
      return true;
    }
    return false;
  };

  /* ===================== HUD 辅助 ===================== */

  NP.hudInfo = function () {
    const connected = BVN.Net.isConnected();
    return {
      active: BVN.Game.mode === 'net' && connected,
      nick0: NP.myIdx === 0 ? NP.nick : NP.peerNick,
      nick1: NP.myIdx === 0 ? NP.peerNick : NP.nick,
      ping: BVN.Net.ping(),
      disconnected: !connected && NP.dcShown,
    };
  };

  BVN.Netplay = NP;
})(window.BVN);

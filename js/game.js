/* js/game.js — 场景状态机（标题 / 操作说明 / 选人 / VS / 战斗 / 结算）、主循环、相机、HUD */
window.BVN = window.BVN || {};

(function (BVN) {
  'use strict';

  const CFG = BVN.CFG;
  const FX = BVN.FX;
  const Art = BVN.Art;
  const Sfx = BVN.Sfx;
  const T = BVN.THEMES;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  const CARD_W = 250;
  const CARD_H = 188;
  const GAP_X = 22;
  const GAP_Y = 34;

  const G = {
    canvas: null,
    ctx: null,
    dpr: 1,

    keys: {},
    pressed: {},
    sticky: {},
    mouse: { x: 0, y: 0 },
    hotspots: [],

    phase: 'title',
    time: 0,
    frame: 0,

    fighters: [],
    ais: [],
    entities: [],
    cam: { x: 0, y: 0, zoom: 1, viewW: 1280, viewH: 720 },

    hitstop: 0,
    slowmo: 0,
    shakeMag: 0,
    shakeT: 0,
    flashColor: '#fff',
    flashAlpha: 0,
    flashT: 0,
    flashMax: 1,
    grayFrames: 0,

    theme: T.shrine,
    baseTheme: 'shrine',
    themeTimer: 0,

    menuIndex: 0,
    mode: 'arcade',
    aiLevelIndex: 1,
    helpFrom: 'title',

    sel: { c1: 0, c2: 7, turn: 0, p1: null, p2: null, aiT: 0 },

    round: 1,
    wins: [0, 0],
    roundState: 'intro',
    introT: 0,
    roundT: 0,
    timer: CFG.ROUND_TIME * 60,
    hpLag: [CFG.MAX_HP, CFG.MAX_HP],
    lastWinner: -1,
    roundAwarded: false,
    drawRounds: 0,

    vsT: 0,
    resultIndex: 0,
    resultWinner: 0,
    toast: '',
    toastT: 0,
  };

  /* ===================== 初始化 ===================== */

  G.init = function () {
    G.canvas = document.getElementById('game');
    G.ctx = G.canvas.getContext('2d');
    G.resize();
    window.addEventListener('resize', G.resize);
    bindInput();
    Art.load(function () { /* 立绘加载完成 */ });
    // 底部提示统一由画布绘制（HTML 层不再重复显示，避免与画布文字叠在一起）
    const hintEl = document.getElementById('hint');
    if (hintEl) hintEl.style.display = 'none';
    requestAnimationFrame(loop);
  };

  G.resize = function () {
    // 高分屏：用 devicePixelRatio 提高实际像素密度（最多 2 倍，避免 4K 下过度绘制）
    G.dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const bw = Math.round(CFG.W * G.dpr);
    const bh = Math.round(CFG.H * G.dpr);
    if (G.canvas.width !== bw) G.canvas.width = bw;
    if (G.canvas.height !== bh) G.canvas.height = bh;
    const scale = Math.min(window.innerWidth / CFG.W, window.innerHeight / CFG.H);
    G.canvas.style.width = Math.round(CFG.W * scale) + 'px';
    G.canvas.style.height = Math.round(CFG.H * scale) + 'px';
  };

  /* ===================== 输入 ===================== */

  function bindInput() {
    window.addEventListener('keydown', function (e) {
      if (e.repeat) { return; }
      const codes = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter', 'Tab'];
      if (codes.indexOf(e.code) >= 0) e.preventDefault();
      G.keys[e.code] = true;
      G.pressed[e.code] = true;
      G.sticky[e.code] = 2;
      Sfx.unlock();
      if (e.code === 'KeyM') {
        const m = Sfx.toggleMute();
        if (G.phase === 'title' || G.phase === 'help') G.toast = m ? '已静音' : '声音已开启';
        G.toastT = 60;
      }
      if (e.code === 'KeyF') {
        const el = document.documentElement;
        if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen();
        else if (document.exitFullscreen) document.exitFullscreen();
      }
    });
    window.addEventListener('keyup', function (e) {
      G.keys[e.code] = false;
    });
    G.canvas.addEventListener('mousemove', function (e) {
      G.mouse = toLogical(e);
    });
    G.canvas.addEventListener('mousedown', function (e) {
      Sfx.unlock();
      G.mouse = toLogical(e);
      handleClick(G.mouse);
    });
    window.addEventListener('blur', function () {
      G.keys = {};
      G.sticky = {};
    });
  }

  function toLogical(e) {
    const r = G.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * CFG.W,
      y: ((e.clientY - r.top) / r.height) * CFG.H,
    };
  }

  function inRect(p, r) {
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }

  function down(codes) {
    for (let i = 0; i < codes.length; i++) {
      if (G.keys[codes[i]] || (G.sticky[codes[i]] || 0) > 0) return true;
    }
    return false;
  }

  function press(code) {
    return !!G.pressed[code];
  }

  function anyPress(codes) {
    for (let i = 0; i < codes.length; i++) if (G.pressed[codes[i]]) return true;
    return false;
  }

  /* ===================== 场景切换 ===================== */

  G.gotoTitle = function () {
    G.phase = 'title';
    G.menuIndex = 0;
    G.entities.length = 0;
    G.fighters.length = 0;
    G.ais.length = 0;
    FX.reset();
    G.hitstop = 0;
    G.slowmo = 0;
    G.theme = T.shrine;
    G.baseTheme = 'shrine';
  };

  G.gotoSelect = function (mode) {
    G.mode = mode;
    G.phase = 'select';
    G.sel = { c1: 0, c2: 7, turn: 0, p1: null, p2: null, aiT: 0 };
    G.entities.length = 0;
    FX.reset();
  };

  G.startFight = function () {
    const p1def = BVN.ROSTER[G.sel.p1];
    const p2def = BVN.ROSTER[G.sel.p2];
    G.fighters = [
      new BVN.Fighter(p1def, { index: 0, x: 580, facing: 1 }),
      new BVN.Fighter(p2def, { index: 1, x: 1100, facing: -1 }),
    ];
    G.ais = [null, null];
    if (G.mode === 'arcade') {
      const lv = ['easy', 'normal', 'hard'][G.aiLevelIndex] || 'normal';
      G.ais[1] = new BVN.AI(G.fighters[1], G.fighters[0], lv);
    }
    G.round = 1;
    G.wins = [0, 0];
    G.drawRounds = 0;
    G.roundAwarded = false;
    G.baseTheme = Math.random() < 0.5 ? 'shrine' : 'inferno';
    G.theme = T[G.baseTheme];
    G.themeTimer = 0;
    G.phase = 'fight';
    G.resetRound();
  };

  G.resetRound = function () {
    for (let i = 0; i < 2; i++) {
      G.fighters[i].reset(i === 0 ? 580 : 1100, i === 0 ? 1 : -1);
      if (G.ais[i]) G.ais[i] = new BVN.AI(G.fighters[i], G.fighters[1 - i], G.ais[i].level);
    }
    G.entities.length = 0;
    FX.reset();
    G.hpLag = [CFG.MAX_HP, CFG.MAX_HP];
    G.timer = CFG.ROUND_TIME * 60;
    G.roundState = 'intro';
    G.introT = 0;
    G.roundT = 0;
    G.hitstop = 0;
    G.slowmo = 0;
    G.grayFrames = 0;
    G.lastWinner = -1;
    G.roundAwarded = false;
    G.cam.x = 300;
    G.cam.zoom = 1.1;
    G.theme = T[G.baseTheme];
  };

  /* ---------- 联机专用：进入选人 / 开始对战 ---------- */

  G.beginNetSelect = function () {
    BVN.Netplay.resetSelectCursor();
    BVN.Netplay.state = 'picking';
    G.mode = 'net';
    G.phase = 'netlobby';
    G.entities.length = 0;
    G.fighters.length = 0;
    G.ais.length = 0;
    FX.reset();
  };

  G.startNetFight = function (a, b, theme) {
    G.mode = 'net';
    G.sel.p1 = a;
    G.sel.p2 = b;
    G.fighters = [
      new BVN.Fighter(BVN.ROSTER[a], { index: 0, x: 580, facing: 1 }),
      new BVN.Fighter(BVN.ROSTER[b], { index: 1, x: 1100, facing: -1 }),
    ];
    G.ais = [null, null];
    G.round = 1;
    G.wins = [0, 0];
    G.drawRounds = 0;
    G.roundAwarded = false;
    G.baseTheme = theme && T[theme] ? theme : 'shrine';
    G.theme = T[G.baseTheme];
    G.themeTimer = 0;
    G.phase = 'fight';
    G.resetRound();
    BVN.Netplay.state = 'fighting';
    BVN.Netplay.lastSnapSent = -99;
    BVN.Netplay.netBuffer = 0;
  };

  G.nextRound = function () {
    // 2 胜直接结束；若连续平局导致回合数过多，按胜场多者判定（避免无限循环）
    if (G.wins[0] >= CFG.ROUNDS_TO_WIN || G.wins[1] >= CFG.ROUNDS_TO_WIN || G.round >= 5) {
      G.resultWinner = G.wins[0] >= G.wins[1] ? 0 : 1;
      G.phase = 'result';
      G.resultIndex = 0;
      // 联机：把终局结果同步给客机
      if (G.mode === 'net' && BVN.Net.isHost()) {
        G.syncRoundNow();
        BVN.Net.send({ t: 'over', w: G.wins, winner: G.resultWinner });
      }
      return;
    }
    G.round++;
    G.resetRound();
  };

  /* ===================== 主循环 ===================== */

  let acc = 0;
  let last = 0;

  function loop(now) {
    requestAnimationFrame(loop);
    if (!last) last = now;
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;
    const scale = G.slowmo > 0 ? 0.34 : 1;
    acc += dt * scale;
    let steps = 0;
    while (acc >= CFG.STEP && steps < 5) {
      G.update(CFG.STEP);
      acc -= CFG.STEP;
      steps++;
    }
    if (acc > 0.5) acc = 0;
    G.draw();
  }

  /* ===================== 更新 ===================== */

  G.update = function (dt) {
    G.time += dt;
    G.frame++;

    for (const k in G.sticky) {
      if (G.sticky[k] > 0) G.sticky[k]--;
    }
    if (G.toastT > 0) G.toastT--;

    if (G.flashT > 0) G.flashT--;
    if (G.shakeT > 0) {
      G.shakeT--;
      if (G.shakeT === 0) G.shakeMag = 0;
    }
    if (G.grayFrames > 0) G.grayFrames--;
    if (G.themeTimer > 0) {
      G.themeTimer--;
      if (G.themeTimer === 0) G.theme = T[G.baseTheme];
    }

    if (G.hitstop > 0) {
      G.hitstop--;
      G.pressed = {};
      return;
    }
    if (G.slowmo > 0) G.slowmo--;

    if (G.phase === 'title') updateTitle(dt);
    else if (G.phase === 'help') updateHelp(dt);
    else if (G.phase === 'select') updateSelect(dt);
    else if (G.phase === 'vs') updateVS(dt);
    else if (G.phase === 'fight') updateFight(dt);
    else if (G.phase === 'result') updateResult(dt);
    else if (G.phase === 'netlobby') BVN.Netplay.updateLobby(dt);

    FX.update(dt);
    G.pressed = {};
  };

  /* ---------- 标题 ---------- */

  const MENU_ITEMS = [
    { label: '街机模式', sub: '对战 AI' },
    { label: '双人对战', sub: '本地 2P' },
    { label: '联机对战', sub: '同码联机' },
    { label: '昵称设置', sub: '' },
    { label: '难度选择', sub: '' },
    { label: '操作说明', sub: '' },
  ];

  function menuRect(i) {
    const w = 380;
    const h = 54;
    const x = (CFG.W - w) / 2;
    const y = 330 + i * 60;
    return { x: x, y: y, w: w, h: h };
  }

  function updateTitle(dt) {
    if (anyPress(['ArrowUp', 'KeyW'])) { G.menuIndex = (G.menuIndex + MENU_ITEMS.length - 1) % MENU_ITEMS.length; Sfx.play('ui'); }
    if (anyPress(['ArrowDown', 'KeyS'])) { G.menuIndex = (G.menuIndex + 1) % MENU_ITEMS.length; Sfx.play('ui'); }
    if (anyPress(['Enter', 'Space', 'KeyJ'])) {
      Sfx.play('uiPick');
      const i = G.menuIndex;
      if (i === 0) G.gotoSelect('arcade');
      else if (i === 1) G.gotoSelect('versus');
      else if (i === 2) BVN.Netplay.enterLobby();
      else if (i === 3) BVN.Netplay.editNick();
      else if (i === 4) G.aiLevelIndex = (G.aiLevelIndex + 1) % 3;
      else if (i === 5) { G.phase = 'help'; G.helpFrom = 'title'; }
    }
  }

  function updateHelp(dt) {
    if (anyPress(['Escape', 'Enter', 'Space', 'KeyJ', 'Backspace'])) {
      Sfx.play('uiBack');
      G.phase = G.helpFrom;
    }
  }

  /* ---------- 选人 ---------- */

  function cardRect(i) {
    const totalW = 4 * CARD_W + 3 * GAP_X;
    const x0 = (CFG.W - totalW) / 2;
    const y0 = 118;
    const col = i % 4;
    const row = (i / 4) | 0;
    return { x: x0 + col * (CARD_W + GAP_X), y: y0 + row * (CARD_H + GAP_Y), w: CARD_W, h: CARD_H };
  }

  function moveCursor(cur, dx, dy) {
    let col = cur % 4;
    let row = (cur / 4) | 0;
    col = (col + dx + 4) % 4;
    row = (row + dy + 2) % 2;
    return row * 4 + col;
  }

  function updateSelect(dt) {
    const s = G.sel;
    if (s.turn === 2) return;

    if (s.turn === 0) {
      if (anyPress(['KeyA', 'ArrowLeft'])) { s.c1 = moveCursor(s.c1, -1, 0); Sfx.play('ui'); }
      if (anyPress(['KeyD', 'ArrowRight'])) { s.c1 = moveCursor(s.c1, 1, 0); Sfx.play('ui'); }
      if (anyPress(['KeyW', 'ArrowUp'])) { s.c1 = moveCursor(s.c1, 0, -1); Sfx.play('ui'); }
      if (anyPress(['KeyS', 'ArrowDown'])) { s.c1 = moveCursor(s.c1, 0, 1); Sfx.play('ui'); }
      if (anyPress(['KeyR'])) { s.c1 = (Math.random() * 8) | 0; Sfx.play('ui'); }
      if (anyPress(['KeyJ', 'Enter', 'Space'])) {
        s.p1 = s.c1;
        Sfx.play('uiPick');
        if (G.mode === 'arcade') {
          s.turn = 1;
          s.aiT = 0;
        } else {
          s.turn = 1;
          s.c2 = (s.p1 + 4) % 8;
        }
      }
      if (anyPress(['Escape', 'Backspace'])) { Sfx.play('uiBack'); G.phase = 'title'; }
    } else if (s.turn === 1) {
      if (G.mode === 'arcade') {
        s.aiT++;
        if (s.aiT === 1) {
          // AI 随机选取（避免与 P1 相同）
          let pick = (Math.random() * 8) | 0;
          if (pick === s.p1) pick = (pick + 3) % 8;
          s.c2 = pick;
        }
        if (s.aiT === 24) {
          s.p2 = s.c2;
          s.turn = 2;
          G.phase = 'vs';
          G.vsT = 0;
          Sfx.play('uiPick');
        }
        if (anyPress(['Escape', 'Backspace'])) { s.turn = 0; Sfx.play('uiBack'); }
      } else {
        if (anyPress(['ArrowLeft'])) { s.c2 = moveCursor(s.c2, -1, 0); Sfx.play('ui'); }
        if (anyPress(['ArrowRight'])) { s.c2 = moveCursor(s.c2, 1, 0); Sfx.play('ui'); }
        if (anyPress(['ArrowUp'])) { s.c2 = moveCursor(s.c2, 0, -1); Sfx.play('ui'); }
        if (anyPress(['ArrowDown'])) { s.c2 = moveCursor(s.c2, 0, 1); Sfx.play('ui'); }
        if (anyPress(['Digit5', 'Numpad5', 'KeyR'])) { s.c2 = (Math.random() * 8) | 0; Sfx.play('ui'); }
        if (anyPress(['Digit1', 'Numpad1', 'Enter'])) {
          s.p2 = s.c2;
          s.turn = 2;
          G.phase = 'vs';
          G.vsT = 0;
          Sfx.play('uiPick');
        }
        if (anyPress(['Escape', 'Backspace'])) { s.turn = 0; Sfx.play('uiBack'); }
      }
    }
  }

  /* ---------- VS ---------- */

  function updateVS(dt) {
    G.vsT++;
    if (G.vsT > 110 || (G.vsT > 24 && anyPress(['Enter', 'Space', 'KeyJ']))) {
      G.startFight();
    }
  }

  /* ---------- 战斗 ---------- */

  G.canFight = function () {
    return G.phase === 'fight' && G.roundState === 'active';
  };

  /** 立即向客机推一次快照（回合切换 / 终局等关键时刻）。 */
  G.syncRoundNow = function () {
    if (G.mode === 'net' && BVN.Net.isHost()) BVN.Netplay.sendSnapshot(true);
  };

  function readControls(locked) {
    const K = BVN.KEYS;
    const f1 = G.fighters[0];
    const f2 = G.fighters[1];
    const setZero = function (f) {
      f.ctrl.left = false; f.ctrl.right = false; f.ctrl.up = false; f.ctrl.down = false;
      f.ctrl.light = false; f.ctrl.heavy = false; f.ctrl.skill = false; f.ctrl.ult = false; f.ctrl.dash = false;
    };
    if (locked || !f1) { if (f1) setZero(f1); if (f2 && !G.ais[1]) setZero(f2); return; }
    f1.ctrl.left = down(K.p1.left);
    f1.ctrl.right = down(K.p1.right);
    f1.ctrl.up = down(K.p1.up);
    f1.ctrl.down = down(K.p1.down);
    f1.ctrl.light = down(K.p1.light);
    f1.ctrl.heavy = down(K.p1.heavy);
    f1.ctrl.skill = down(K.p1.skill);
    f1.ctrl.ult = down(K.p1.ult);
    f1.ctrl.dash = down(K.p1.dash);
    if (!G.ais[1]) {
      f2.ctrl.left = down(K.p2.left);
      f2.ctrl.right = down(K.p2.right);
      f2.ctrl.up = down(K.p2.up);
      f2.ctrl.down = down(K.p2.down);
      f2.ctrl.light = down(K.p2.light);
      f2.ctrl.heavy = down(K.p2.heavy);
      f2.ctrl.skill = down(K.p2.skill);
      f2.ctrl.ult = down(K.p2.ult);
      f2.ctrl.dash = down(K.p2.dash);
    }
  }

  function updateFight(dt) {
    // 联机掉线：冻结模拟，等待玩家返回标题（避免两端状态继续发散）
    if (G.mode === 'net' && !BVN.Net.isConnected()) {
      if (anyPress(['Escape']) || anyPress(['Enter'])) BVN.Netplay.leave(true);
      return;
    }
    const netOn = G.mode === 'net' && BVN.Net.isConnected();
    const guest = netOn && !BVN.Net.isHost();

    // 客机：先把主机快照灌进本地，再本地推进（视觉预测），回合与血量以主机为准
    if (guest) BVN.Netplay.applySnapshot();

    const locked = G.roundState !== 'active';
    if (netOn) BVN.Netplay.readControls(locked);
    else readControls(locked);

    if (guest) BVN.Netplay.sendInput();

    if (G.roundState === 'intro') {
      G.introT++;
      if (G.introT === 66 && !guest) Sfx.play('fight');
      if (G.introT >= 108) {
        if (guest) G.introT = 108;
        else G.roundState = 'active';
      }
    } else if (G.roundState === 'active') {
      if (!guest) {
        G.timer--;
        if (G.timer <= 0) {
          G.timer = 0;
          G.timeOver();
        }
      }
    } else {
      G.roundT++;
      if (!guest) {
        if (G.roundState === 'ko' && G.roundT > 96) {
          G.awardRound();
        } else if (G.roundState === 'roundEnd' && G.roundT > 120) {
          G.nextRound();
        }
      }
    }

    if (!guest) {
      for (let i = 0; i < 2; i++) {
        if (G.ais[i]) G.ais[i].update(dt, G);
      }
    }

    G.fighters[0].update(dt, G);
    G.fighters[1].update(dt, G);
    separate();
    resolveHits();
    BVN.Skills.update(G, dt);
    updateCamera(dt);
    updateLag();

    // 主机：广播快照
    if (netOn && !guest) BVN.Netplay.sendSnapshot();
  }

  function separate() {
    const a = G.fighters[0];
    const b = G.fighters[1];
    const minDist = 60;
    let d = b.x - a.x;
    let ad = Math.abs(d);
    if (ad < 0.001) {
      a.x -= 30;
      b.x += 30;
      return;
    }
    if (ad < minDist) {
      const push = (minDist - ad) / 2;
      const s = d > 0 ? 1 : -1;
      a.x -= s * push;
      b.x += s * push;
    }
    a.x = clamp(a.x, 40, CFG.STAGE_W - 40);
    b.x = clamp(b.x, 40, CFG.STAGE_W - 40);
  }

  /**
   * 命中结算：两趟跑。
   *   第一趟只结算「上挑」——上挑对下落斩有绝对优先权：
   *   同一帧内双方判定框重叠时，下落斩会被先打飞并取消出招，不允许互相换血。
   *   第二趟结算其余所有招式（含下落斩）。
   */
  function resolveHits() {
    strikePass(true);
    strikePass(false);
  }

  function strikePass(tiltOnly) {
    for (let i = 0; i < 2; i++) {
      const a = G.fighters[i];
      const d = G.fighters[1 - i];
      if (a.state !== 'attack' || !a.attackDef) continue;
      if (a.attackFrame === 0) continue;
      const wins = a.activeWindows();
      for (let k = 0; k < wins.length; k++) {
        const w = wins[k].w;
        if (!!w.tilt !== tiltOnly) continue;
        const rect = a.windowRect(w);
        if (G.rectOverlap(rect, d.hurtbox())) {
          const hit = {
            dmg: w.dmg, hitstun: w.hitstun, kb: w.kb, lift: w.lift || 0,
            sfx: w.sfx || 'light', pierce: w.pierce || 0, gain: w.gain || 5,
            unblockable: !!w.unblockable, armorBreak: w.armorBreak || 0,
            tilt: !!w.tilt,
            x: d.x, y: d.y - 110,
          };
          const ok = d.receiveHit(a, hit, G);
          if (ok) {
            a.hitReg[wins[k].i] = true;
            if (w.pull) {
              d.vx = (a.x > d.x ? -1 : 1) * -w.pull;
            }
          }
        }
      }
    }
  }

  G.rectOverlap = function (a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  };

  G.opponentOf = function (f) {
    return G.fighters[1 - f.index];
  };

  /** 统一伤害入口（实体与近战共用）。 */
  G.applyDamage = function (attacker, target, hit) {
    return target.receiveHit(attacker, hit, G);
  };

  /* ---------- 命中反馈 ---------- */

  G.onHpHit = function (target, attacker, hit, dmg) {
    const power = clamp(dmg / 40, 0.6, 3);
    G.hitstop = Math.max(G.hitstop, dmg >= 80 ? CFG.HITSTOP_HEAVY : CFG.HITSTOP_LIGHT);
    FX.hitSpark(hit.x || target.x, hit.y || (target.y - 110), power, '#ffe9a0');
    FX.damage(target.x, target.y - 160, dmg, {
      size: 24 + power * 8,
      color: dmg >= 80 ? '#ff8a5c' : '#ffe9a0',
    });
    G.shake(3 + power * 4, 8 + power * 4);
    Sfx.play(hit.sfx);
    if (attacker) {
      const extra = attacker.id === 'boxer' ? 3 : 0;
      attacker.meter = Math.min(CFG.MAX_METER, attacker.meter + (hit.gain || 5) + extra);
      // 连击数归属攻击方（HUD 就画在攻击方那半边屏）
      attacker.comboCount++;
      attacker.comboTimer = CFG.COMBO_WINDOW;
    }
    target.meter = Math.min(CFG.MAX_METER, target.meter + 4);
  };

  G.onBlock = function (target, attacker, hit, perfect) {
    FX.blockSpark(target.x + (attacker && attacker.x > target.x ? 26 : -26), target.y - 118, perfect);
    G.hitstop = Math.max(G.hitstop, perfect ? 4 : 2);
    G.shake(perfect ? 5 : 2, perfect ? 10 : 5);
    if (perfect) G.perfectFlash();
  };

  G.perfectFlash = function () {
    G.flash('#ffffff', 0.55, 8);
  };

  G.onKO = function (target, attacker) {
    // 幂等保护：回合已经结束（ko / roundEnd）后，残留实体不得再触发一次 KO 计分
    if (G.roundState !== 'active') return;
    G.roundState = 'ko';
    G.roundT = 0;
    G.roundAwarded = false;
    G.entities.length = 0;
    G.slowmo = 42;
    G.flash('#ffffff', 0.7, 10);
    G.shake(22, 26);
    Sfx.play('ko');
    FX.ring(target.x, target.y - 100, '#ffffff', 320, 0.6);
    FX.text(target.x, target.y - 250, 'K.O.', '#ff4d4d', 64);
  };

  G.onSkill = function (f, kind) {
    if (kind === 'ult') {
      FX.text(f.x, f.y - 240, f.def.ultimate.name, f.palette.accent, 34);
      G.shake(6, 10);
    } else {
      FX.text(f.x, f.y - 220, f.def.skill.name, f.palette.trim, 26);
    }
    // 联机：主机把施法事件广播给客机，客机在本地重建同样的特效
    if (G.mode === 'net' && BVN.Net.isHost()) BVN.Netplay.onSkill(f, kind);
  };

  G.freezeOpponent = function (f, frames) {
    const o = G.fighters[1 - f.index];
    if (o) o.frozen = frames;
  };

  G.setTheme = function (id, frames) {
    if (T[id]) {
      G.theme = T[id];
      G.themeTimer = frames;
    }
  };

  G.flash = function (color, alpha, frames) {
    G.flashColor = color;
    G.flashAlpha = alpha;
    G.flashMax = frames;
    G.flashT = frames;
  };

  G.shake = function (mag, frames) {
    G.shakeMag = Math.max(G.shakeMag, mag);
    G.shakeT = Math.max(G.shakeT, frames);
  };

  /* ---------- 回合结算 ---------- */

  G.timeOver = function () {
    if (G.roundState !== 'active') return;
    const a = G.fighters[0];
    const b = G.fighters[1];
    G.roundState = 'roundEnd';
    G.roundT = 0;
    G.roundAwarded = false;
    G.entities.length = 0;
    G.slowmo = 30;
    Sfx.play('ko');
    if (a.hp === b.hp) {
      G.lastWinner = -1;
      FX.text(640, 300, 'DRAW', '#ffd24a', 56);
    } else {
      G.lastWinner = a.hp > b.hp ? 0 : 1;
      FX.text(640, 300, 'TIME UP', '#ffd24a', 56);
    }
    G.scoreRound();
  };

  /** 结算本回合胜场（幂等：一回合只记一次，平局不计分）。 */
  G.scoreRound = function () {
    if (G.roundAwarded) return;
    G.roundAwarded = true;
    if (G.lastWinner < 0) {
      // 平局：双方都不加分，只记一次平局，避免"一局没赢却满 2 胜"
      G.drawRounds++;
      return;
    }
    G.wins[G.lastWinner] += 1;
  };

  G.awardRound = function () {
    if (G.roundAwarded) return;
    const a = G.fighters[0];
    const b = G.fighters[1];
    G.lastWinner = a.hp > b.hp ? 0 : (b.hp > a.hp ? 1 : -1);
    G.scoreRound();
    G.roundState = 'roundEnd';
    G.roundT = 0;
    G.entities.length = 0;
  };

  /* ---------- 相机 ---------- */

  function updateCamera(dt) {
    const a = G.fighters[0];
    const b = G.fighters[1];
    if (!a || !b) return;
    const mid = (a.x + b.x) / 2;
    const d = Math.abs(a.x - b.x);
    const targetZoom = 1.2 - clamp((d - 240) / 640, 0, 1) * 0.2;
    G.cam.zoom = lerp(G.cam.zoom, targetZoom, 0.06);
    const viewW = CFG.W / G.cam.zoom;
    const viewH = CFG.H / G.cam.zoom;
    G.cam.viewW = viewW;
    G.cam.viewH = viewH;
    const targetX = clamp(mid - viewW / 2, 0, CFG.STAGE_W - viewW);
    G.cam.x = lerp(G.cam.x, targetX, 0.12);
    G.cam.y = CFG.GROUND_Y + 86 - viewH;
  }

  function updateLag() {
    for (let i = 0; i < 2; i++) {
      const hp = G.fighters[i].hp;
      if (G.hpLag[i] > hp) G.hpLag[i] = Math.max(hp, G.hpLag[i] - 7);
      else G.hpLag[i] = hp;
    }
  }

  /* ---------- 结算 ---------- */

  function updateResult(dt) {
    if (anyPress(['ArrowUp', 'KeyW'])) {
      G.resultIndex = (G.resultIndex + 2) % 3;
      Sfx.play('ui');
    }
    if (anyPress(['ArrowDown', 'KeyS'])) {
      G.resultIndex = (G.resultIndex + 1) % 3;
      Sfx.play('ui');
    }
    if (anyPress(['Enter', 'Space', 'KeyJ'])) {
      Sfx.play('uiPick');
      if (G.resultIndex === 0) {
        // 再战一局（同角色）
        G.startFight();
      } else if (G.resultIndex === 1) {
        G.gotoSelect(G.mode);
      } else {
        G.gotoTitle();
      }
    }
    if (anyPress(['Escape'])) { G.gotoTitle(); }
  }

  /* ===================== 绘制 ===================== */

  G.draw = function () {
    const ctx = G.ctx;
    ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
    ctx.clearRect(0, 0, CFG.W, CFG.H);
    G.hotspots.length = 0;

    if (G.phase === 'title') drawTitle();
    else if (G.phase === 'help') drawHelp();
    else if (G.phase === 'select') drawSelect();
    else if (G.phase === 'vs') drawVS();
    else if (G.phase === 'fight') { drawWorld(); drawHUD(); }
    else if (G.phase === 'result') drawResult();
    else if (G.phase === 'netlobby') {
      if (BVN.Netplay.state === 'picking') BVN.Netplay.drawNetSelect();
      else BVN.Netplay.drawLobby();
    }

    drawOverlays(ctx);
  };

  /* ---------- 通用绘制工具 ---------- */

  function text(str, x, y, size, color, opt) {
    const ctx = G.ctx;
    const o = opt || {};
    ctx.font = (o.weight || '900') + ' ' + size + 'px ' + CFG.FONT;
    // 字距（Chromium 支持 ctx.letterSpacing；不支持时退化为 0，不影响排版）
    try { ctx.letterSpacing = (o.letterSpacing || 0) + 'px'; } catch (e) { /* 老浏览器忽略 */ }
    ctx.textAlign = o.align || 'center';
    ctx.textBaseline = o.baseline || 'middle';
    if (o.stroke) {
      ctx.lineWidth = o.strokeW || Math.max(3, size * 0.12);
      ctx.strokeStyle = o.stroke;
      ctx.lineJoin = 'round';
      ctx.strokeText(str, x, y);
    }
    if (o.glow) {
      ctx.shadowColor = o.glow;
      ctx.shadowBlur = o.blur || 18;
    }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
    ctx.shadowBlur = 0;
    const w = ctx.measureText(str).width;
    if (o.letterSpacing) { try { ctx.letterSpacing = '0px'; } catch (e) { /* ignore */ } }
    return w;
  }

  function drawMenuBg(camX) {
    const cam = { x: camX, y: -32, zoom: 1, viewW: CFG.W, viewH: CFG.H };
    Art.drawBackground(G.ctx, cam, G.theme, G.time);
    const gy = CFG.GROUND_Y - cam.y;
    const g = G.ctx.createLinearGradient(0, gy, 0, CFG.H);
    g.addColorStop(0, 'rgba(10,14,24,0.9)');
    g.addColorStop(1, '#04040a');
    G.ctx.fillStyle = g;
    G.ctx.fillRect(0, gy, CFG.W, CFG.H - gy);
  }

  /* ---------- 标题页 ---------- */

  function drawTitle() {
    const ctx = G.ctx;
    const t = G.time;
    drawMenuBg(320 + Math.sin(t * 0.25) * 60);

    // 暗角
    const vg = ctx.createRadialGradient(640, 300, 120, 640, 360, 780);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.82)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, CFG.W, CFG.H);

    const breathe = 1 + Math.sin(t * 1.6) * 0.012;

    ctx.save();
    ctx.translate(640, 176);
    ctx.scale(breathe, breathe);
    text('陈锴瑞 VS 陈锴瑞', 0, 0, 82, '#f5f0e6', { stroke: '#0a0a10', strokeW: 10, glow: '#e8b45a', blur: 26 });
    ctx.restore();

    text('八相乱斗', 640, 240, 30, '#e8b45a', { glow: '#e8b45a', blur: 14, stroke: '#101018', strokeW: 5, letterSpacing: 3 });

    // 装饰线
    ctx.strokeStyle = 'rgba(232,180,90,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(340, 274);
    ctx.lineTo(940, 274);
    ctx.stroke();

    // 菜单
    for (let i = 0; i < MENU_ITEMS.length; i++) {
      const r = menuRect(i);
      const active = i === G.menuIndex;
      const item = MENU_ITEMS[i];
      let label = item.label;
      if (i === 4) label = '难度：' + ['简单', '普通', '困难'][G.aiLevelIndex];
      if (i === 3) label = '昵称：' + BVN.Netplay.getNick();

      if (active) {
        const pulse = 0.5 + Math.sin(t * 5) * 0.16;
        ctx.fillStyle = 'rgba(232,180,90,' + (0.14 + pulse * 0.16).toFixed(3) + ')';
        Art.roundRect(ctx, r.x, r.y, r.w, r.h, 8);
        ctx.fill();
        ctx.strokeStyle = 'rgba(240,200,120,0.9)';
        ctx.lineWidth = 2;
        Art.roundRect(ctx, r.x, r.y, r.w, r.h, 8);
        ctx.stroke();
        // 指示三角
        ctx.beginPath();
        ctx.moveTo(r.x - 26, r.y + r.h / 2 - 9);
        ctx.lineTo(r.x - 8, r.y + r.h / 2);
        ctx.lineTo(r.x - 26, r.y + r.h / 2 + 9);
        ctx.closePath();
        ctx.fillStyle = '#f0c878';
        ctx.fill();
      }
      text(label, 640, r.y + r.h / 2, 27, active ? '#ffe9b0' : 'rgba(210,214,230,0.62)', {
        stroke: '#0a0a10', strokeW: 4,
      });
      G.hotspots.push({ x: r.x, y: r.y, w: r.w, h: r.h, action: 'menu:' + i });
    }

    text('↑↓ 选择 · Enter 确定 · M 静音 · F 全屏', 640, 706, 15, 'rgba(180,190,214,0.55)');

    if (G.toastT > 0 && G.toast) {
      text(G.toast, 640, 640, 18, '#ffe9b0', { stroke: '#0a0a10', strokeW: 4 });
    }
  }

  /* ---------- 操作说明 ---------- */

  function drawHelp() {
    const ctx = G.ctx;
    drawMenuBg(900);
    ctx.fillStyle = 'rgba(4,5,10,0.84)';
    ctx.fillRect(0, 0, CFG.W, CFG.H);

    text('操 作 说 明', 640, 66, 42, '#f0c878', { glow: '#e8b45a', blur: 20, stroke: '#0a0a10', strokeW: 8 });

    const rows = [
      ['', '1P（左侧）', '2P（右侧）'],
      ['移动', 'A / D', '← / →'],
      ['跳跃', 'W（天使可二段跳）', '↑'],
      ['防御', 'S 或 后方向键', '↓ 或 后方向键'],
      ['轻攻', 'J（可三连）', '1（主键盘/小键盘）'],
      ['重攻', 'K', '2'],
      ['上挑', 'W + J，或起跳上升中按 J', '↑ + 1，或上升中按 1'],
      ['下落斩', '空中下落时按 K', '空中下落时按 2'],
      ['技能 25 气', 'L', '3'],
      ['必杀 100 气', 'U', '4'],
      ['冲刺 / 闪避', 'Shift', '0'],
    ];
    const x0 = 250;
    const y0 = 118;
    const lh = 40;
    for (let i = 0; i < rows.length; i++) {
      const y = y0 + i * lh;
      const isHead = i === 0;
      if (!isHead) {
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.015)';
        ctx.fillRect(x0 - 30, y - 20, 790, 38);
      }
      text(rows[i][0], x0, y, isHead ? 19 : 20, isHead ? '#8f9bb8' : '#dfe4f2', { align: 'left' });
      text(rows[i][1], x0 + 250, y, isHead ? 19 : 20, isHead ? '#8f9bb8' : '#9fd8ff', { align: 'left' });
      text(rows[i][2], x0 + 560, y, isHead ? 19 : 20, isHead ? '#8f9bb8' : '#ff9f9f', { align: 'left' });
    }

    text('三角克制：下落斩（不可防御、高伤）＞ 上挑（击飞、起手 8 帧可被普攻打断）＞ 下落斩', 640, 566, 17, '#ffd27a');
    text('连招：J → J → J 三连；J → K 轻接重。格挡减伤 80%，受击前 6 帧内进入防御可「完美格挡」回气。', 640, 598, 16, 'rgba(200,210,230,0.8)');
    text('霸体：仅拳击（Lv3，最高）与恶龙（Lv2）必杀保留，其余角色必杀可被打断；下落斩可破 Lv2 霸体。', 640, 626, 16, 'rgba(200,210,230,0.8)');
    text('规则：3 局 2 胜 · 每局 99 秒 · 时间到血多者胜 · 气满按 U 释放必杀', 640, 654, 16, 'rgba(200,210,230,0.8)');
    text('按 Enter / Esc 返回', 640, 690, 17, '#f0c878');
  }

  /* ---------- 选人页 ---------- */

  function drawSelect() {
    const ctx = G.ctx;
    const s = G.sel;
    drawMenuBg(180);
    ctx.fillStyle = 'rgba(3,4,9,0.72)';
    ctx.fillRect(0, 0, CFG.W, CFG.H);

    text('选 择 陈 锴 瑞', 640, 56, 34, '#f0c878', { glow: '#e8b45a', blur: 16, stroke: '#0a0a10', strokeW: 7 });

    for (let i = 0; i < BVN.ROSTER.length; i++) {
      const c = BVN.ROSTER[i];
      const r = cardRect(i);
      const isP1 = s.c1 === i;
      const isP2 = s.turn >= 1 && s.c2 === i;

      // 卡底
      ctx.fillStyle = 'rgba(14,16,26,0.95)';
      Art.roundRect(ctx, r.x, r.y, r.w, r.h, 10);
      ctx.fill();

      // 立绘
      ctx.save();
      Art.roundRect(ctx, r.x + 3, r.y + 3, r.w - 6, r.h - 52, 8);
      ctx.clip();
      Art.drawCover(ctx, Art.img(c.id), r.x + 3, r.y + 3, r.w - 6, r.h - 52, c.face[0], c.face[1], c.face[2]);
      // 底部渐变遮罩：保证任意构图下名字可读
      const shade2 = ctx.createLinearGradient(0, r.y + r.h - 116, 0, r.y + r.h - 46);
      shade2.addColorStop(0, 'rgba(0,0,0,0)');
      shade2.addColorStop(1, 'rgba(0,0,0,0.92)');
      ctx.fillStyle = shade2;
      ctx.fillRect(r.x + 3, r.y + r.h - 116, r.w - 6, 70);
      // 顶部渐变：压制过亮的高光，让右上角定位标签可读
      const shade1 = ctx.createLinearGradient(0, r.y + 3, 0, r.y + 46);
      shade1.addColorStop(0, 'rgba(0,0,0,0.55)');
      shade1.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = shade1;
      ctx.fillRect(r.x + 3, r.y + 3, r.w - 6, 43);
      ctx.restore();

      // 名字底衬
      ctx.fillStyle = 'rgba(6,7,14,0.78)';
      Art.roundRect(ctx, r.x + 22, r.y + r.h - 40, r.w - 44, 30, 6);
      ctx.fill();
      // 名字
      text(c.name, r.x + r.w / 2, r.y + r.h - 26, 21, '#f2f4fa', { stroke: '#080810', strokeW: 4 });
      // 定位
      text(c.tag, r.x + r.w - 10, r.y + 20, 13, 'rgba(255,255,255,0.9)', { align: 'right', stroke: '#000', strokeW: 3 });

      // 边框
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(120,130,160,0.4)';
      Art.roundRect(ctx, r.x, r.y, r.w, r.h, 10);
      ctx.stroke();

      if (isP1) {
        const p = 0.55 + Math.sin(G.time * 6) * 0.3;
        ctx.strokeStyle = 'rgba(90,180,255,' + (0.6 + p * 0.4).toFixed(2) + ')';
        ctx.lineWidth = 4;
        Art.roundRect(ctx, r.x - 2, r.y - 2, r.w + 4, r.h + 4, 12);
        ctx.stroke();
        ctx.fillStyle = 'rgba(90,180,255,0.15)';
        ctx.fill();
      }
      if (isP2) {
        const p = 0.55 + Math.sin(G.time * 6 + 1) * 0.3;
        ctx.strokeStyle = 'rgba(255,90,90,' + (0.6 + p * 0.4).toFixed(2) + ')';
        ctx.lineWidth = 4;
        Art.roundRect(ctx, r.x - 6, r.y - 6, r.w + 12, r.h + 12, 14);
        ctx.stroke();
      }
      G.hotspots.push({ x: r.x, y: r.y, w: r.w, h: r.h, action: 'card:' + i });
    }

    // 信息栏
    const cur = s.turn === 0 ? s.c1 : s.c2;
    const info = BVN.ROSTER[cur];
    const py = 536;
    ctx.fillStyle = 'rgba(10,12,20,0.9)';
    Art.roundRect(ctx, 100, py, CFG.W - 200, 128, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(140,155,190,0.35)';
    ctx.lineWidth = 1.5;
    Art.roundRect(ctx, 100, py, CFG.W - 200, 128, 10);
    ctx.stroke();

    text(info.name, 126, py + 28, 26, '#f5f0e6', { align: 'left' });
    text(info.title, 126 + 210, py + 30, 16, 'rgba(180,190,214,0.8)', { align: 'left' });

    text('技能 · ' + info.skill.name + '（' + info.skill.cost + ' 气）', 126, py + 62, 17, '#9fd8ff', { align: 'left' });
    text('必杀 · ' + info.ultimate.name + '（100 气）', 126, py + 86, 17, '#ffb27a', { align: 'left' });
    text('被动 · ' + info.passive.name, 126, py + 110, 17, '#a8ffb8', { align: 'left' });

    text(info.skill.desc, 560, py + 62, 15, 'rgba(210,218,236,0.86)', { align: 'left' });
    text(info.ultimate.desc, 560, py + 86, 15, 'rgba(210,218,236,0.86)', { align: 'left' });
    text(info.passive.desc, 560, py + 110, 15, 'rgba(210,218,236,0.86)', { align: 'left' });

    // 状态提示：放在信息栏下沿（y=664）之下、画布底部之上，基线 694 → 距底 26px
    let hint;
    if (s.turn === 0) hint = '1P 用 A / D / W / S 移动 · J 确定 · R 随机 · Esc 返回';
    else if (s.turn === 1) hint = G.mode === 'arcade' ? 'AI 正在选择……' : '2P 用方向键移动 · 1 键确定 · R 随机 · Esc 返回';
    else hint = '';
    text(hint, 640, 694, 15, 'rgba(198,208,228,0.82)');
  }

  /* ---------- VS ---------- */

  function drawVS() {
    const ctx = G.ctx;
    const t = G.vsT;
    const k = clamp(t / 26, 0, 1);
    const p1 = BVN.ROSTER[G.sel.p1];
    const p2 = BVN.ROSTER[G.sel.p2];
    // 防御性：选人未完成时不要绘制（避免 undefined 取 id 崩溃）
    if (!p1 || !p2) return;

    ctx.fillStyle = '#04050b';
    ctx.fillRect(0, 0, CFG.W, CFG.H);

    // 斜切背景
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(720, 0);
    ctx.lineTo(560, CFG.H);
    ctx.lineTo(0, CFG.H);
    ctx.closePath();
    ctx.clip();
    const g1 = ctx.createLinearGradient(0, 0, 720, CFG.H);
    g1.addColorStop(0, 'rgba(24,60,120,0.85)');
    g1.addColorStop(1, 'rgba(6,10,24,0.95)');
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, CFG.W, CFG.H);
    const off1 = (1 - k) * -700;
    ctx.save();
    ctx.translate(off1, 0);
    Art.drawCover(ctx, Art.img(p1.id), -40, 40, 700, 640, p1.face[0], p1.face[1], Math.min(p1.face[2] || 1, 1.9));
    ctx.restore();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(CFG.W, 0);
    ctx.lineTo(720, 0);
    ctx.lineTo(560, CFG.H);
    ctx.lineTo(CFG.W, CFG.H);
    ctx.closePath();
    ctx.clip();
    const g2 = ctx.createLinearGradient(CFG.W, 0, 560, CFG.H);
    g2.addColorStop(0, 'rgba(140,30,30,0.85)');
    g2.addColorStop(1, 'rgba(24,6,6,0.95)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, CFG.W, CFG.H);
    const off2 = (1 - k) * 700;
    ctx.save();
    ctx.translate(off2, 0);
    Art.drawCover(ctx, Art.img(p2.id), 620, 40, 700, 640, p2.face[0], p2.face[1], Math.min(p2.face[2] || 1, 1.9));
    ctx.restore();
    ctx.restore();

    // VS
    const sc = clamp((t - 14) / 14, 0, 1);
    if (sc > 0) {
      ctx.save();
      ctx.translate(640, 330);
      ctx.scale(sc * 1.1, sc * 1.1);
      ctx.rotate(Math.sin(G.time * 3) * 0.03);
      text('VS', 0, 0, 130, '#ffffff', { stroke: '#101018', strokeW: 14, glow: '#ffd24a', blur: 34 });
      ctx.restore();
    }

    if (t > 20) {
      text(p1.name, 300, 620, 34, '#a8d8ff', { stroke: '#05070f', strokeW: 7 });
      text(p1.title, 300, 660, 17, 'rgba(190,220,255,0.8)');
      text(p2.name, 980, 620, 34, '#ffb0a8', { stroke: '#05070f', strokeW: 7 });
      text(p2.title, 980, 660, 17, 'rgba(255,200,195,0.8)');
    }

    if (t > 60) text('按 Enter 跳过', 640, 692, 14, 'rgba(200,210,230,0.5)');
  }

  /* ---------- 世界 ---------- */

  function drawWorld() {
    const ctx = G.ctx;
    const cam = G.cam;

    let sx = 0;
    let sy = 0;
    if (G.shakeT > 0) {
      sx = (Math.random() - 0.5) * G.shakeMag;
      sy = (Math.random() - 0.5) * G.shakeMag;
    }

    Art.drawBackground(ctx, cam, G.theme, G.time);

    const z = cam.zoom;
    const d = G.dpr;
    ctx.setTransform(z * d, 0, 0, z * d, (-cam.x * z + sx) * d, (-cam.y * z + sy) * d);

    Art.drawGround(ctx, G.theme, G.time);

    // 必杀速度线
    if (G.slowmo > 0 || G.fighters[0].glow > 0 || G.fighters[1].glow > 0) {
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      for (let i = 0; i < 26; i++) {
        const a = (G.time * 0.4 + i * 0.241) % (Math.PI * 2);
        const r0 = 260 + ((i * 97) % 240);
        const cx = 320 + 300;
        const cy = 380;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.6);
        ctx.lineTo(cx + Math.cos(a) * (r0 + 220), cy + Math.sin(a) * (r0 + 220) * 0.6);
        ctx.stroke();
      }
      ctx.restore();
    }

    BVN.Skills.draw(ctx, G, G.time, true);

    // 影子
    for (let i = 0; i < 2; i++) Art.drawShadow(ctx, G.fighters[i]);

    // 残影
    for (let i = 0; i < 2; i++) {
      const f = G.fighters[i];
      for (let k = 0; k < f.trail.length; k++) {
        const g = f.trail[k];
        if (g.life <= 0) continue;
        g.alpha = (g.life / (g.maxLife || 0.3)) * 0.45;
        Art.drawFighter(ctx, g, G.time);
      }
    }

    // 角色（被打的人先画，攻击方在上层）
    const order = G.fighters[0].state === 'attack' ? [1, 0] : [0, 1];
    for (let i = 0; i < 2; i++) Art.drawFighter(ctx, G.fighters[order[i]], G.time);

    BVN.Skills.draw(ctx, G, G.time, false);
    FX.draw(ctx);

    ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);

    // 回合提示文字
    if (G.roundState === 'intro') {
      const a = G.introT;
      if (a < 66) {
        const k2 = clamp(a / 16, 0, 1);
        ctx.save();
        ctx.globalAlpha = Math.min(1, k2 * 1.4);
        ctx.translate(640, 300);
        ctx.scale(0.7 + k2 * 0.4, 0.7 + k2 * 0.4);
        text('第 ' + G.round + ' 回合', 0, 0, 62, '#f5f0e6', { stroke: '#08080e', strokeW: 12, glow: '#e8b45a', blur: 24 });
        ctx.restore();
      } else {
        const k2 = clamp((a - 66) / 14, 0, 1);
        const fade = clamp((108 - a) / 30, 0, 1);
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(640, 300);
        ctx.scale(0.6 + k2 * 0.6, 0.6 + k2 * 0.6);
        text('FIGHT!', 0, 0, 96, '#ffd24a', { stroke: '#100800', strokeW: 14, glow: '#ff9a1f', blur: 34 });
        ctx.restore();
      }
    }
  }

  /* ---------- HUD ---------- */

  function panel(x, y, w, h, r) {
    const ctx = G.ctx;
    ctx.fillStyle = 'rgba(6,8,16,0.82)';
    Art.roundRect(ctx, x, y, w, h, r);
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,165,200,0.35)';
    ctx.lineWidth = 1.4;
    Art.roundRect(ctx, x, y, w, h, r);
    ctx.stroke();
  }

  function drawPortrait(def, x, y, size, side) {
    const ctx = G.ctx;
    const fc = def.face || [0.5, 0.34];
    // 锚点略向下偏，让头像带出肩部而不是只剩一张脸
    const fy = Math.min(0.96, fc[1] + 0.06);
    ctx.save();
    Art.roundRect(ctx, x, y, size, size, 8);
    ctx.clip();
    Art.drawCover(ctx, Art.img(def.id), x, y, size, size, fc[0], fy, (fc[2] || 1) * 0.8);
    const g = ctx.createLinearGradient(x, y, x, y + size);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, size, size);
    ctx.restore();
    ctx.strokeStyle = side === 0 ? 'rgba(90,180,255,0.85)' : 'rgba(255,110,100,0.85)';
    ctx.lineWidth = 2.5;
    Art.roundRect(ctx, x, y, size, size, 8);
    ctx.stroke();
  }

  function drawHpBlock(f, side) {
    const ctx = G.ctx;
    const def = f.def;
    const barW = 414;
    const barH = 22;
    const x = side === 0 ? 182 : CFG.W - 182 - barW;
    const y = 40;
    const ratio = clamp(f.hp / f.hpMax, 0, 1);
    const lagRatio = clamp(G.hpLag[side] / f.hpMax, 0, 1);
    const low = ratio < 0.25;

    // 外框
    panel(x - 4, y - 4, barW + 8, barH + 8, 6);

    // 空槽
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x, y, barW, barH);

    const drawFrom = function (r, color, alpha) {
      const w = barW * r;
      if (w <= 0) return;
      ctx.globalAlpha = alpha == null ? 1 : alpha;
      ctx.fillStyle = color;
      if (side === 0) ctx.fillRect(x, y, w, barH);
      else ctx.fillRect(x + barW - w, y, w, barH);
      ctx.globalAlpha = 1;
    };

    // 白色延迟条
    drawFrom(lagRatio, 'rgba(255,255,255,0.85)');

    // 实际血条
    const grad = ctx.createLinearGradient(x, y, x + barW, y);
    if (low) {
      grad.addColorStop(0, '#ff3b30');
      grad.addColorStop(1, '#8a0f0a');
    } else if (side === 0) {
      grad.addColorStop(0, '#7fe0ff');
      grad.addColorStop(0.5, '#39a8ff');
      grad.addColorStop(1, '#1c5fd0');
    } else {
      grad.addColorStop(0, '#ffb27a');
      grad.addColorStop(0.5, '#ff6a4a');
      grad.addColorStop(1, '#b81f14');
    }
    drawFrom(ratio, grad);

    // 低血闪烁
    if (low && Math.sin(G.time * 16) > 0) {
      drawFrom(ratio, 'rgba(255,255,255,0.35)');
    }

    // 高光
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, barW, 5);
    ctx.globalAlpha = 1;

    // 气条（4 格）
    const mY = y + barH + 8;
    const segGap = 5;
    const segW = (barW - segGap * 3) / 4;
    for (let i = 0; i < 4; i++) {
      const sx = side === 0 ? x + i * (segW + segGap) : x + barW - (i + 1) * (segW + segGap) + segGap;
      const filled = clamp(f.meter - i * 25, 0, 25) / 25;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      Art.roundRect(ctx, sx, mY, segW, 10, 3);
      ctx.fill();
      if (filled > 0) {
        ctx.fillStyle = f.meter >= 100 ? '#ffe27a' : def.palette.accent;
        Art.roundRect(ctx, sx, mY, segW * filled, 10, 3);
        ctx.fill();
        if (f.meter >= 100) {
          ctx.globalAlpha = 0.3 + Math.sin(G.time * 12) * 0.2;
          ctx.fillStyle = '#ffffff';
          Art.roundRect(ctx, sx, mY, segW, 10, 3);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    }

    // 名字（固定占左侧/右侧，给 MAX 标签留出对向空间，永不重叠）
    let nameStr = def.name;
    let subStr = '';
    const netInfo = G.mode === 'net' ? BVN.Netplay.hudInfo() : null;
    if (netInfo && netInfo.active) {
      const nn = side === 0 ? netInfo.nick0 : netInfo.nick1;
      if (nn) {
        nameStr = nn;
        subStr = def.name;
      }
    }
    text(nameStr, side === 0 ? x : x + barW, y + barH + 32, netInfo && netInfo.active ? 19 : 16,
      netInfo && netInfo.active ? '#ffe9b0' : 'rgba(230,236,250,0.92)', {
        align: side === 0 ? 'left' : 'right', stroke: 'rgba(0,0,0,0.85)', strokeW: 4,
      });
    if (subStr) {
      text(subStr, side === 0 ? x : x + barW, y + barH + 52, 13, 'rgba(200,212,236,0.72)', {
        align: side === 0 ? 'left' : 'right', stroke: 'rgba(0,0,0,0.8)', strokeW: 3,
      });
    }

    // 气满标签：独立胶囊，放在该半区「靠中间」的一端
    if (f.meter >= 100 && G.roundState === 'active') {
      const blink = Math.sin(G.time * 8) > -0.35;
      const pw = 104;
      const ph = 22;
      const bx = side === 0 ? x + barW - pw : x;
      const by = y + barH + 21;
      ctx.save();
      ctx.globalAlpha = blink ? 1 : 0.55;
      ctx.fillStyle = 'rgba(28,20,4,0.9)';
      Art.roundRect(ctx, bx, by, pw, ph, 6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,214,110,0.9)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      const key = side === 0 ? 'U' : '4';
      const pulse = 0.6 + Math.sin(G.time * 8) * 0.4;
      text('MAX', bx + 24, by + ph / 2, 14, '#ffe27a', { glow: '#ffb300', blur: 10 });
      text(key + ' 必杀', bx + 66, by + ph / 2, 13, 'rgba(255,232,160,' + pulse.toFixed(2) + ')');
      ctx.restore();
    }

    // 胜场标记
    for (let i = 0; i < CFG.ROUNDS_TO_WIN; i++) {
      const mx = side === 0 ? x + 6 + i * 20 : x + barW - 6 - i * 20;
      const won = G.wins[side] > i;
      ctx.beginPath();
      ctx.arc(mx, y - 18, 7, 0, Math.PI * 2);
      ctx.fillStyle = won ? '#ffd24a' : 'rgba(255,255,255,0.16)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  function drawHUD() {
    const ctx = G.ctx;
    const f1 = G.fighters[0];
    const f2 = G.fighters[1];

    drawPortrait(f1.def, 42, 28, 76, 0);
    drawPortrait(f2.def, CFG.W - 42 - 76, 28, 76, 1);

    drawHpBlock(f1, 0);
    drawHpBlock(f2, 1);

    // 计时器
    const secs = Math.ceil(G.timer / 60);
    ctx.save();
    ctx.translate(640, 56);
    ctx.beginPath();
    ctx.arc(0, 0, 42, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(6,8,16,0.9)';
    ctx.fill();
    ctx.strokeStyle = secs <= 10 ? 'rgba(255,80,80,0.95)' : 'rgba(180,195,230,0.55)';
    ctx.lineWidth = 3;
    ctx.stroke();
    text(String(secs), 0, 2, 42, secs <= 10 ? '#ff5a4a' : '#eef2ff', { glow: secs <= 10 ? '#ff2a1a' : null, blur: 16 });
    ctx.restore();

    // 联机：延迟显示 + 掉线覆盖层
    if (G.mode === 'net') {
      const ni = BVN.Netplay.hudInfo();
      if (ni.active) {
        const p = ni.ping;
        const bad = p >= BVN.NetConfig.pingBad;
        const warn = p >= BVN.NetConfig.pingWarn;
        const col = p < 0 ? 'rgba(180,190,214,0.7)' : (bad ? '#ff7a6a' : (warn ? '#ffd24a' : '#9fe6a0'));
        text('PING ' + (p < 0 ? '--' : p) + ' ms', 640, 108, 14, col, { stroke: '#08080e', strokeW: 3 });
      } else {
        ctx.fillStyle = 'rgba(3,4,9,0.72)';
        ctx.fillRect(0, 0, CFG.W, CFG.H);
        text('对手已断开连接', 640, 314, 52, '#ff7a6a', {
          stroke: '#12060a', strokeW: 10, glow: '#ff3b30', blur: 26,
        });
        text('按 Enter 返回标题', 640, 384, 18, 'rgba(226,214,206,0.85)');
      }
    }

    // 连击（金色渐变 + 弹出缩放，画在攻击方一侧，避开角色身体）
    for (let i = 0; i < 2; i++) {
      const f = G.fighters[i];
      if (f.comboCount >= 2 && f.comboTimer > 0) {
        const cx = i === 0 ? 214 : CFG.W - 214;
        const pop = clamp((CFG.COMBO_WINDOW - f.comboTimer) * 9, 0, 1);
        const size = 44 + pop * 12;
        ctx.save();
        ctx.globalAlpha = clamp(f.comboTimer * 2.2, 0, 1);
        ctx.translate(cx, 150);
        ctx.rotate((i === 0 ? -1 : 1) * 0.05);
        // 底衬（避免与背景叠影）
        ctx.fillStyle = 'rgba(8,8,14,0.42)';
        Art.roundRect(ctx, -76, -32, 152, 74, 10);
        ctx.fill();
        const grad = ctx.createLinearGradient(0, -30, 0, 26);
        grad.addColorStop(0, '#fff6d0');
        grad.addColorStop(0.45, '#ffd34a');
        grad.addColorStop(1, '#ff9a1f');
        text(f.comboCount + ' HIT', 0, -6, size, grad, {
          stroke: '#2a1200', strokeW: 9, glow: '#ff8a1f', blur: 22,
        });
        text('连 击', 0, 28, 17, '#ffe9b0', { stroke: '#2a1200', strokeW: 5 });
        ctx.restore();
      }
    }

    // 回合结束文字
    if (G.roundState === 'ko') {
      const k = clamp(G.roundT / 14, 0, 1);
      ctx.save();
      ctx.translate(640, 300);
      ctx.scale(0.5 + k * 0.6, 0.5 + k * 0.6);
      text('K.O.', 0, 0, 110, '#ff4d4d', { stroke: '#120202', strokeW: 14, glow: '#ff2a1a', blur: 30 });
      ctx.restore();
    } else if (G.roundState === 'roundEnd') {
      const name = G.lastWinner < 0 ? '平 局' : G.fighters[G.lastWinner].def.name + ' 胜';
      text(name, 640, 300, 54, '#f5f0e6', { stroke: '#08080e', strokeW: 10, glow: '#e8b45a', blur: 24 });
    } else if (G.roundState === 'active' && G.timer <= 10 * 60 && Math.ceil(G.timer / 60) <= 10) {
      if ((G.frame % 60) < 34) {
        text(String(Math.ceil(G.timer / 60)), 640, 200, 40, 'rgba(255,90,74,0.8)');
      }
    }
  }

  /* ---------- 结算 ---------- */

  function drawResult() {
    const ctx = G.ctx;
    const w = G.fighters[G.resultWinner] ? G.fighters[G.resultWinner].def : BVN.ROSTER[0];
    drawMenuBg(700);
    ctx.fillStyle = 'rgba(3,4,9,0.78)';
    ctx.fillRect(0, 0, CFG.W, CFG.H);

    Art.drawCover(ctx, Art.img(w.id), 0, 0, CFG.W, CFG.H, w.face[0], w.face[1], Math.min(w.face[2] || 1, 1.6));

    const g = ctx.createLinearGradient(0, 260, 0, CFG.H);
    g.addColorStop(0, 'rgba(3,4,9,0)');
    g.addColorStop(0.45, 'rgba(3,4,9,0.86)');
    g.addColorStop(1, 'rgba(3,4,9,0.98)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CFG.W, CFG.H);

    text('WINNER', 640, 300, 30, '#ffd24a', { glow: '#ff9a1f', blur: 22, stroke: '#0a0a10', strokeW: 6 });
    text(w.name, 640, 366, 62, '#f7f2e6', { stroke: '#08080e', strokeW: 12, glow: '#e8b45a', blur: 26 });
    text(w.title + ' · ' + w.tag, 640, 414, 20, 'rgba(230,220,200,0.82)');

    const opts = ['再战一局（同角色）', '重新选择角色', '返回标题'];
    for (let i = 0; i < opts.length; i++) {
      const r = { x: (CFG.W - 360) / 2, y: 476 + i * 56, w: 360, h: 46 };
      const active = i === G.resultIndex;
      if (active) {
        ctx.fillStyle = 'rgba(232,180,90,0.16)';
        Art.roundRect(ctx, r.x, r.y, r.w, r.h, 8);
        ctx.fill();
        ctx.strokeStyle = 'rgba(240,200,120,0.9)';
        ctx.lineWidth = 2;
        Art.roundRect(ctx, r.x, r.y, r.w, r.h, 8);
        ctx.stroke();
      }
      text(opts[i], 640, r.y + r.h / 2, 22, active ? '#ffe9b0' : 'rgba(200,208,228,0.6)');
      G.hotspots.push({ x: r.x, y: r.y, w: r.w, h: r.h, action: 'result:' + i });
    }

    text('↑↓ 选择 · Enter 确定 · Esc 返回标题', 640, 690, 15, 'rgba(180,190,214,0.55)');
  }

  /* ---------- 全屏覆盖层 ---------- */

  function drawOverlays(ctx) {
    ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);

    // 黑白（时间凝滞）
    if (G.grayFrames > 0) {
      ctx.globalCompositeOperation = 'saturation';
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, CFG.W, CFG.H);
      ctx.globalCompositeOperation = 'source-over';
    }

    // 闪光
    if (G.flashT > 0) {
      const a = (G.flashT / G.flashMax) * G.flashAlpha;
      ctx.globalAlpha = a;
      ctx.fillStyle = G.flashColor;
      ctx.fillRect(0, 0, CFG.W, CFG.H);
      ctx.globalAlpha = 1;
    }

    // 必杀暗角
    if (G.slowmo > 0) {
      const vg = ctx.createRadialGradient(640, 360, 220, 640, 360, 760);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.72)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, CFG.W, CFG.H);
    }

    // 扫描线质感
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = '#000';
    for (let y = 0; y < CFG.H; y += 4) ctx.fillRect(0, y, CFG.W, 1);
    ctx.globalAlpha = 1;
  }

  /* ===================== 鼠标 ===================== */

  function handleClick(p) {
    for (let i = 0; i < G.hotspots.length; i++) {
      const h = G.hotspots[i];
      if (!inRect(p, h)) continue;
      Sfx.play('uiPick');
      const parts = h.action.split(':');
      if (parts[0] === 'net' || parts[0] === 'netsel') {
        BVN.Netplay.handleAction(h.action);
        return;
      }
      if (parts[0] === 'menu') {
        const idx = parseInt(parts[1], 10);
        G.menuIndex = idx;
        if (idx === 0) G.gotoSelect('arcade');
        else if (idx === 1) G.gotoSelect('versus');
        else if (idx === 2) BVN.Netplay.enterLobby();
        else if (idx === 3) BVN.Netplay.editNick();
        else if (idx === 4) G.aiLevelIndex = (G.aiLevelIndex + 1) % 3;
        else if (idx === 5) { G.phase = 'help'; G.helpFrom = 'title'; }
      } else if (parts[0] === 'card') {
        const idx = parseInt(parts[1], 10);
        if (G.mode === 'versus' && G.sel.turn === 1) {
          G.sel.c2 = idx;
          G.sel.p2 = idx;
          G.sel.turn = 2;
          G.phase = 'vs';
          G.vsT = 0;
          return;
        }
        if (G.mode === 'arcade' && G.sel.turn === 1) return;
        G.sel.c1 = idx;
        G.sel.p1 = idx;
        if (G.mode === 'arcade') {
          G.sel.turn = 1;
          G.sel.aiT = 0;
        } else {
          G.sel.turn = 1;
          G.sel.c2 = (idx + 4) % 8;
        }
      } else if (parts[0] === 'result') {
        const idx = parseInt(parts[1], 10);
        G.resultIndex = idx;
        if (idx === 0) G.startFight();
        else if (idx === 1) G.gotoSelect(G.mode);
        else G.gotoTitle();
      }
      return;
    }
  }

  /* ===================== 启动 ===================== */

  BVN.Game = G;
  BVN.start = function () {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', G.init);
    } else {
      G.init();
    }
  };

  BVN.start();
})(window.BVN);

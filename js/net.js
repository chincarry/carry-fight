/* js/net.js — 联机传输层：PeerJS 信令 + WebRTC DataChannel 封装（建房 / 加入 / 心跳 / 延迟 / 掉线判定） */
window.BVN = window.BVN || {};

(function (BVN) {
  'use strict';

  const C = BVN.NetConfig;

  const Net = {
    peer: null,
    conn: null,
    host: false,
    connected: false,
    rtt: -1,
    lastRecvAt: 0,
    code: '',

    _handlers: { data: null, open: null, close: null, error: null, peer: null },
    _rttSamples: [],
    _hb: 0,
    _watch: 0,
    _connectTimer: 0,
    _ice: { host: 0, srflx: 0, relay: 0 },
  };

  /* ===================== 工具 ===================== */

  function now() { return Date.now(); }

  Net.randomCode = function () {
    let s = '';
    for (let i = 0; i < C.codeLength; i++) {
      s += C.codeAlphabet[(Math.random() * C.codeAlphabet.length) | 0];
    }
    return s;
  };

  Net.normalizeCode = function (raw) {
    let s = String(raw || '').toUpperCase();
    let out = '';
    for (let i = 0; i < s.length; i++) {
      // 把用户可能输入的易混字符纠正过来（0→O 不存在，故直接过滤）
      const ch = s[i];
      if (C.codeAlphabet.indexOf(ch) >= 0) out += ch;
      else if (ch === 'O' || ch === '0') out += 'Q';
      else if (ch === 'I' || ch === '1') out += 'J';
    }
    return out.slice(0, C.codeLength);
  };

  Net.isValidCode = function (raw) {
    const s = String(raw || '').toUpperCase();
    if (s.length !== C.codeLength) return false;
    for (let i = 0; i < s.length; i++) if (C.codeAlphabet.indexOf(s[i]) < 0) return false;
    return true;
  };

  function peerOptions() {
    return {
      host: C.peer.host,
      port: C.peer.port,
      path: C.peer.path,
      secure: C.peer.secure,
      key: C.peer.key,
      debug: 0,
      config: { iceServers: C.iceServers },
    };
  }

  function errText(type) {
    switch (type) {
      case 'unavailable-id': return '该联机码已被占用，请换一个';
      case 'peer-unavailable': return '联机码不存在，或对方还没建房';
      case 'network': return '网络异常，请检查连接';
      case 'server-error': return '信令服务器无响应，请稍后重试';
      case 'socket-error': return '与信令服务器的连接中断';
      case 'browser-incompatible': return '当前浏览器不支持联机，请用 Chrome / Edge';
      case 'webrtc': return '点对点连接失败，可能需要中继服务器';
      default: return '连接失败（' + type + '）';
    }
  }

  function fire(kind, payload) {
    const h = Net._handlers[kind];
    if (typeof h === 'function') h(payload);
  }

  /* ===================== 连接管理 ===================== */

  function setupConn(conn) {
    Net.conn = conn;
    conn.on('open', function () {
      Net.connected = true;
      Net.lastRecvAt = now();
      clearTimeout(Net._connectTimer);
      startHeartbeat();
      fire('open');
      if (Net.host) fire('peer', Net.peerNick || '');
    });
    conn.on('data', function (d) {
      Net.lastRecvAt = now();
      if (!d || typeof d !== 'object') return;
      if (d.t === 'ping') { Net.send({ t: 'pong', ts: d.ts }); return; }
      if (d.t === 'pong') {
        const rtt = now() - d.ts;
        Net._rttSamples.push(rtt);
        if (Net._rttSamples.length > 5) Net._rttSamples.shift();
        let sum = 0;
        for (let i = 0; i < Net._rttSamples.length; i++) sum += Net._rttSamples[i];
        Net.rtt = Math.round(sum / Net._rttSamples.length);
        return;
      }
      fire('data', d);
    });
    conn.on('close', function () { teardown('对方已断开连接'); });
    conn.on('error', function (e) { fire('error', errText(e && e.type)); });
  }

  function startHeartbeat() {
    clearInterval(Net._hb);
    clearInterval(Net._watch);
    Net._hb = setInterval(function () {
      if (!Net.connected) return;
      Net.send({ t: 'ping', ts: now() });
    }, C.heartbeatMs);
    Net._watch = setInterval(function () {
      if (!Net.connected) return;
      if (now() - Net.lastRecvAt > C.dropTimeoutMs) teardown('对方已断开连接');
    }, 500);
  }

  function teardown(reason) {
    const wasConnected = Net.connected;
    Net.connected = false;
    clearInterval(Net._hb);
    clearInterval(Net._watch);
    clearTimeout(Net._connectTimer);
    if (wasConnected) fire('close', reason || '连接已断开');
  }

  /* 连接超时兜底：避免 UI 永久卡在“连接中”
     —— 只在“还没拿到连接”时计时。注意建房成功后（信令已注册）必须停表，
        否则房主干等对手超过 15 秒就会被自家计时器拆房。 */
  function armConnectTimeout(onFail, msg) {
    clearTimeout(Net._connectTimer);
    Net._connectTimer = setTimeout(function () {
      if (!Net.connected) {
        onFail(msg || '连接超时：对方无响应，请检查联机码或网络');
        Net.close();
      }
    }, C.connectTimeoutMs);
  }

  /* ===================== 对外接口 ===================== */

  Net.on = function (map) {
    Net._handlers.data = map.data || null;
    Net._handlers.open = map.open || null;
    Net._handlers.close = map.close || null;
    Net._handlers.error = map.error || null;
    Net._handlers.status = map.status || null;
    return Net;
  };

  /** 建房。code 省略则随机生成。 */
  Net.startHost = function (code, onReady, onFail) {
    Net.close();
    const c = code || Net.randomCode();
    Net.code = c;
    Net.host = true;
    let opened = false;
    try {
      const p = new Peer(C.prefix + c, peerOptions());
      Net.peer = p;
      // 这个计时器只负责“信令服务器到底连上没有”，注册成功后立刻停表，房主可以无限等
      armConnectTimeout(onFail, '信令服务器无响应，请检查网络后重试');
      p.on('open', function () {
        opened = true;
        clearTimeout(Net._connectTimer);
        if (onReady) onReady(c);
      });
      p.on('connection', function (conn) { setupConn(conn); });
      p.on('error', function (e) {
        const t = e && e.type;
        if (t === 'unavailable-id') {
          clearTimeout(Net._connectTimer);
          if (onFail) onFail(errText(t));
          Net.close();
        } else if (!opened) {
          clearTimeout(Net._connectTimer);
          if (onFail) onFail(errText(t));
          Net.close();
        } else {
          fire('error', errText(t));
        }
      });
    } catch (e) {
      if (onFail) onFail('浏览器不支持联机：' + e.message);
    }
  };

  /** 加入房间。公共信令是多实例负载均衡，偶发 peer-unavailable 重试几次通常能命中。 */
  Net.startJoin = function (code, onFail, _attempt) {
    const attempt = _attempt || 1;
    Net.close();
    const c = Net.normalizeCode(code);
    Net.code = c;
    Net.host = false;
    Net.retryMsg = attempt > 1 ? '正在重试连接（第 ' + attempt + ' / 3 次）…' : '';
    try {
      const p = new Peer(null, peerOptions());
      Net.peer = p;
      armConnectTimeout(function (m) { if (onFail) onFail(m); });
      p.on('open', function () {
        const conn = p.connect(C.prefix + c, { reliable: true });
        setupConn(conn);
      });
      p.on('error', function (e) {
        const t = e && e.type;
        clearTimeout(Net._connectTimer);
        if (t === 'peer-unavailable' && attempt < 3) {
          Net.close();
          fire('status', '没找到这个房间，正在重试（第 ' + (attempt + 1) + ' / 3 次）…');
          setTimeout(function () { Net.startJoin(c, onFail, attempt + 1); }, 1200);
          return;
        }
        if (onFail) onFail(errText(t));
        Net.close();
      });
    } catch (e) {
      if (onFail) onFail('浏览器不支持联机：' + e.message);
    }
  };

  Net.send = function (obj) {
    if (!Net.conn || !Net.connected) return false;
    try { Net.conn.send(obj); return true; } catch (e) { return false; }
  };

  Net.close = function () {
    clearInterval(Net._hb);
    clearInterval(Net._watch);
    clearTimeout(Net._connectTimer);
    Net.connected = false;
    try { if (Net.conn) Net.conn.close(); } catch (e) { /* ignore */ }
    try { if (Net.peer) Net.peer.destroy(); } catch (e) { /* ignore */ }
    Net.conn = null;
    Net.peer = null;
    Net.rtt = -1;
    Net._rttSamples.length = 0;
    Net._ice = { host: 0, srflx: 0, relay: 0 };
  };

  Net.isHost = function () { return !!Net.host; };
  Net.isConnected = function () { return !!Net.connected; };
  Net.ping = function () { return Net.connected ? Net.rtt : -1; };

  /** 诊断：判断到底卡在哪一环（信令 / 打洞 / 需要中继）。 */
  Net.diag = function (cb) {
    const out = {
      isHost: Net.host, connected: Net.connected, ping: Net.rtt,
      iceState: 'unknown', candidates: { host: 0, srflx: 0, relay: 0 }, turnConfigured: !!C.turn.urls,
    };
    if (!Net.conn || !Net.conn.peerConnection) { if (cb) cb(out); return out; }
    const pc = Net.conn.peerConnection;
    out.iceState = pc.iceConnectionState || pc.connectionState || 'unknown';
    try {
      pc.getStats(null).then(function (stats) {
        stats.forEach(function (r) {
          if (r.type === 'local-candidate' || r.type === 'remote-candidate' || r.type === 'candidate') {
            const t = r.candidateType || '';
            if (out.candidates[t] !== undefined) out.candidates[t]++;
          }
        });
        if (cb) cb(out);
      }).catch(function () { if (cb) cb(out); });
    } catch (e) { if (cb) cb(out); }
    return out;
  };

  BVN.Net = Net;
})(window.BVN);

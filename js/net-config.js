/* js/net-config.js — 联机参数集中配置（用户只需改这一个文件即可替换信令 / 启用 TURN 中继） */
window.BVN = window.BVN || {};

BVN.NetConfig = {
  /* ---------- 信令服务器 ----------
     默认用 PeerJS 公共云（免费、无需部署）。
     若自建了 peerjs-server，把 host/port/path/secure 改成自己的即可。 */
  peer: {
    host: '0.peerjs.com',
    port: 443,
    path: '/',
    secure: true,
    key: 'peerjs',
  },

  /* ---------- ICE 服务器 ----------
     默认只有公共 STUN（能打洞就直连）。
     若在服务器上部署了 coturn 中继，把下面 turn 三项填上即可，
     打洞失败的网络会自动走中继（延迟略高但一定能连）。 */
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ],

  turn: {
    urls: '',        // 例：'turn:你的服务器IP:3478'  或 'turn:IP:3478?transport=tcp'
    username: '',    // coturn 里配置的用户名
    credential: '',  // coturn 里配置的密码
  },

  /* ---------- 房间与同步参数 ---------- */
  prefix: 'bvn-',            // peer id 前缀，避免与他人应用撞名
  codeLength: 6,             // 联机码长度
  codeAlphabet: '23456789ABCDEFGHJKLMNPQRSTUVWXYZ', // 去掉 0/O/1/I 等易混字符

  heartbeatMs: 1000,         // 心跳间隔
  dropTimeoutMs: 3000,       // 多久没收到包判定掉线
  connectTimeoutMs: 15000,   // 连接超时
  snapshotHz: 30,            // 主机快照频率
  inputHz: 60,               // 客机输入发送频率

  pingWarn: 150,             // 延迟告警阈值（黄）
  pingBad: 300,              // 延迟危险阈值（红）

  nickKey: 'bvn.nick',       // 昵称在 localStorage 的键
  nickDefault: '陈锴瑞',
  nickMax: 12,
};

/* 若启用了 TURN，追加进 ICE 列表（未配置时完全不影响连接） */
(function () {
  const C = BVN.NetConfig;
  if (C.turn && C.turn.urls && C.turn.username) {
    C.iceServers.push({
      urls: C.turn.urls,
      username: C.turn.username,
      credential: C.turn.credential,
    });
  }
})();

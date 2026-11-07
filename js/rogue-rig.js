/* js/rogue-rig.js — 爬塔肉鸽怪物骨骼动画绘制模块（纯 canvas 2D，无外部依赖） */
window.BVN = window.BVN || {};
(function (BVN) {
  'use strict'; const RIG = {}; const TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function easeOut(t) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 2.2); }
  function easeIn(t) { t = clamp(t, 0, 1); return Math.pow(t, 1.9); }
  function easeInOut(t) { t = clamp(t, 0, 1); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) * 0.5; }
  function backOut(t) { t = clamp(t, 0, 1); const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
  function wave(t, f, ph) { return Math.sin(t * (f || 1) + (ph || 0)); }
  function angleLerp(a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    return a + d * t; }
  function poseLerp(a, b, t) {
    if (!a) {
      const o = {};
      for (const k in b) o[k] = b[k];
      return o; }
    const o = {};
    for (const k in b) o[k] = angleLerp(a[k] == null ? 0 : a[k], b[k], t);
    return o; }
  function makeCol(C, flash) {
    const c = C || {}; const base = c.body || '#5f9a78';
    return function (hex) {
      if (flash) return '#ffffff';
      return hex || base; }; }
  function inkOf(C) {
    const c = C || {};
    return c.outline || '#13211a'; }
  function bone(x, y, ang, len, parent, opt) {
    const b = {
      x: x || 0, y: y || 0, ang: ang || 0, len: len || 10, parent: parent || null, w0: 6, w1: 4, ratio: 0.62, bend: 0,
      col: null, ink: true, line: 3, af: 0, shape: 'capsule', spike: 0, detail: null, joint: 0, glow: null, };
    if (opt) {
      for (const k in opt) b[k] = opt[k]; }
    return b; }
  function skeletonTree(list, pose, extra) {
    const entries = []; const by = {};
    for (let i = 0; i < list.length; i++) {
      const b = list[i]; const e = { name: b.name, bone: b };
      entries.push(e);
      if (b.name) by[b.name] = b; }
    const root = extra && extra.root ? extra.root : list[0]; const tree = {
      root: root, bones: entries, by: by, pose: pose || {}, ship: assignPose(entries, pose || {}), hipX: extra && extra.hipX || 0,
      bodyX: extra && extra.bodyX || 0, bodyY: extra && extra.bodyY || 0, };
    return tree; }
  function assignPose(list, pose) {
    for (let i = 0; i < list.length; i++) {
      const b = list[i].bone; const p = pose[b.name]; b.af = p == null ? b.ang : p; }
    return pose; }
  function pointTree(tree, name, px, py) {
    const b = tree.by[name];
    return b ? pointOf(b, px || 0, py || 0) : { x: px || 0, y: py || 0 }; }
  function frameOf(b) {
    if (!b) return { x: 0, y: 0, ang: 0 };
    if (!b.parent) return { x: b.x, y: b.y, ang: b.af }; const p = frameOf(b.parent); const ox = b.parent.len + b.x, oy = b.y; const cs = Math.cos(p.ang), sn = Math.sin(p.ang);
    return { x: p.x + ox * cs - oy * sn, y: p.y + ox * sn + oy * cs, ang: p.ang + b.af }; }
  function pointOf(b, px, py) {
    const f = frameOf(b); const lx = px || 0, ly = py || 0; const cs = Math.cos(f.ang), sn = Math.sin(f.ang);
    return { x: f.x + lx * cs - ly * sn, y: f.y + lx * sn + ly * cs }; }
  function drawBoneChain(ctx, tree, paint, skipRoot) {
    const list = tree.bones;
    for (let i = 0; i < list.length; i++) {
      const b = list[i].bone;
      if (b.hidden) continue;
      if (skipRoot && b === tree.root) continue; ctx.save();
      setBoneMatrix(ctx, b); const skin = paint(b); const flashWhite = !!tree.flash; const ink = flashWhite ? '#ffffff' : inkOf(tree.C); ctx.fillStyle = ink;
      if (b.shape === 'spike') spikePath(ctx, b.w0 + b.line, b.len, b.bend || 0);
      else capsulePath(ctx, b.w0 + b.line, b.w1 + b.line, b.len, b.ratio, b.bend || 0); ctx.fill();
      ctx.fillStyle = skin;
      if (b.shape === 'spike') spikePath(ctx, b.w0, b.len, b.bend || 0);
      else capsulePath(ctx, b.w0, b.w1, b.len, b.ratio, b.bend || 0); ctx.fill();
      skinShade(ctx, b, skin, tree.col);
      if (b.detail) b.detail(ctx, b, tree); drawJoint(ctx, b, skin);
      ctx.restore(); }
  }
  function setBoneMatrix(ctx, b) {
    const chain = [];
    let n = b;
    while (n) { chain.push(n); n = n.parent; }
    for (let i = chain.length - 1; i >= 0; i--) {
      const q = chain[i];
      if (q.parent) ctx.translate(q.parent.len + q.x, q.y);
      else ctx.translate(q.x, q.y); ctx.rotate(q.af); }
  }
  function spikePath(ctx, w0, len, bend) {
    const w = Math.max(1, w0), bd = bend || 0; ctx.beginPath();
    ctx.moveTo(0, -w); ctx.quadraticCurveTo(len * 0.44, -w * 0.4 + bd * 0.5, len, 0);
    ctx.quadraticCurveTo(len * 0.44, w * 0.4 + bd * 0.5, 0, w); ctx.arc(0, 0, w, Math.PI / 2, Math.PI * 1.5);
    ctx.closePath(); }
  function capsulePath(ctx, w0, w1, len, ratio, bend) {
    const r0 = Math.max(0.6, w0), r1 = Math.max(0.6, w1); const bd = bend || 0; const bx = len * ratio, by = bd; ctx.beginPath();
    ctx.moveTo(0, -r0); ctx.quadraticCurveTo(bx, -r1 * 0.9 + bd * 0.6, len, -r1);
    ctx.arc(len, 0, r1, -Math.PI / 2, Math.PI / 2); ctx.quadraticCurveTo(bx, r1 * 0.9 + bd * 0.6, 0, r0);
    ctx.arc(0, 0, r0, Math.PI / 2, Math.PI * 1.5); ctx.closePath(); }
  function skinShade(ctx, b, skin, col) {
    if (b.glow) {
      ctx.strokeStyle = b.glow; ctx.lineWidth = Math.max(1.4, b.w1 * 0.34);
      ctx.beginPath(); ctx.moveTo(b.len * 0.12, b.w0 * 0.18);
      ctx.quadraticCurveTo(b.len * b.ratio, (b.w1 * 0.3) + (b.bend || 0), b.len * 0.92, b.w1 * 0.3); ctx.stroke(); }
    ctx.fillStyle = col ? col('rgba(255,255,255,0.10)') : 'rgba(255,255,255,0.10)'; ctx.beginPath();
    ctx.ellipse(b.len * 0.55, -Math.max(1, b.w1 * 0.32), Math.max(1, b.len * 0.28), Math.max(1, b.w1 * 0.3), 0, 0, TAU); ctx.fill(); }
  function drawJoint(ctx, b, skin) {
    if (b.joint <= 0) return; ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(0, 0, b.joint, 0, TAU);
    ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 1.2; ctx.stroke(); }
  function samplePose(frames, p) {
    let a = frames[0], b = frames[frames.length - 1];
    for (let i = 0; i < frames.length - 1; i++) {
      if (p >= frames[i].t && p <= frames[i + 1].t) { a = frames[i]; b = frames[i + 1]; break; }
    }
    if (p <= frames[0].t) return poseLerp(null, frames[0].pose, 0); const span = b.t - a.t || 1;
    let k = clamp((p - a.t) / span, 0, 1); k = b.ease ? b.ease(k) : k;
    return poseLerp(a.pose, b.pose, k); }
  function withBoneEnd(ctx, b, fn) {
    ctx.save(); setBoneMatrix(ctx, b);
    ctx.translate(b.len, 0); fn();
    ctx.restore(); }
  function withBone(ctx, b, fn) {
    ctx.save(); setBoneMatrix(ctx, b);
    fn(); ctx.restore(); }
  function ellipseFill(ctx, x, y, rx, ry, rot, fill) {
    ctx.fillStyle = fill; ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), rot || 0, 0, TAU); ctx.fill(); }
  function drawEye(ctx, col, x, y, r, iris, brow, flip) {
    const dir = flip ? -1 : 1; ellipseFill(ctx, x, y, r * 1.05, r * 0.9, 0, col('#f5f0dc'));
    ellipseFill(ctx, x + dir * r * 0.22, y + r * 0.06, r * 0.55, r * 0.55, 0, col(iris || '#ff4b3e'));
    ellipseFill(ctx, x + dir * r * 0.28, y + r * 0.08, r * 0.22, r * 0.24, 0, col('#160c08')); ctx.strokeStyle = col('#160c08');
    ctx.lineWidth = Math.max(1.6, r * 0.35); ctx.beginPath();
    ctx.moveTo(x - r * 1.1, y - r * 1.1); ctx.lineTo(x + r * (0.7 + (brow || 0)), y - r * 0.6);
    ctx.stroke(); }
  function drawMouth(ctx, col, x, y, open, teeth) {
    ellipseFill(ctx, x, y, 10 + open * 8, 4 + open * 8, 0.05, col('#1c0a08'));
    if (open > 0.2) {
      const n = teeth || 3;
      for (let i = 0; i < n; i++) {
        const tx = x - 8 + i * (18 / (n - 1 || 1)); ctx.fillStyle = col('#f4e6cc');
        ctx.beginPath(); ctx.moveTo(tx - 2.4, y - 2 - open * 3);
        ctx.lineTo(tx + 0.8, y + 4 + open * 4); ctx.lineTo(tx + 3.6, y - 2 - open * 3);
        ctx.closePath(); ctx.fill(); }
    }
  }
  function drawShadow(ctx, def, col, y) {
    if (!def || def.kind === 'fly') return; ctx.fillStyle = col ? col('rgba(0,0,0,0.36)') : 'rgba(0,0,0,0.36)';
    ctx.beginPath(); ctx.ellipse(0, 2, (def.w || 60) * 0.5, 7, 0, 0, TAU);
    ctx.fill(); }
  function stateProgress(m, fallback) {
    const dur = m.timer > 0 ? m.timer : (fallback || 0.6);
    return clamp((m.stT || 0) / dur, 0, 1); }
  function hurtShake(m) {
    return (m.hurt > 0 ? Math.sin((m.hurt || 0) * 48) * 2.2 : 0); }
  RIG.draw = function (ctx, m, C, time, flash) {
    C = C || {}; const col = makeCol(C, flash); const T = time || 0; const seed = m.seed || 0; ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    switch (m.type) {
      case 'fartling': drawFartling(ctx, m, C, col, T, seed, flash); break; case 'poopling': drawPoopling(ctx, m, C, col, T, seed, flash); break;
      case 'gasfish': drawGasfish(ctx, m, C, col, T, seed, flash); break; case 'centipede': drawCentipede(ctx, m, C, col, T, seed, flash); break;
      case 'urinewisp': drawUrinewisp(ctx, m, C, col, T, seed, flash); break; case 'jellyfish': drawJellyfish(ctx, m, C, col, T, seed, flash); break;
      case 'troll': drawTroll(ctx, m, C, col, T, seed, flash); break; default: drawFartling(ctx, m, C, col, T, seed, flash); break; }
  };
  function buildFartling(C) {
    const hips = bone(-2, -24, 0, 0, null, { hidden: true, name: 'hips' }); const torso = bone(0, 0, -Math.PI / 2, 42, hips, {
      name: 'torso', w0: 29, w1: 25, ratio: 0.52, joint: 5, col: 'body', }); const head = bone(2, 0, 0.06, 22, torso, {
      name: 'head', w0: 20, w1: 14, ratio: 0.48, joint: 3, col: 'body', }); const hornA = bone(-1, -11, -0.55, 12, head, {
      name: 'hornA', w0: 4.4, w1: 1.2, ratio: 0.4, shape: 'spike', col: 'horn', line: 2.4, }); const hornB = bone(2, 10, 0.62, 10, head, {
      name: 'hornB', w0: 4, w1: 1, ratio: 0.4, shape: 'spike', col: 'horn', line: 2.4, }); const armB = bone(-8, -17, Math.PI + 0.1, 18, torso, {
      name: 'armB', w0: 8, w1: 6, ratio: 0.6, joint: 3, col: 'dark', }); const foreB = bone(0, 0, -0.35, 15, armB, { name: 'foreB', w0: 6, w1: 5, ratio: 0.6, joint: 2.5, col: 'dark' });
    const handB = bone(0, 0, -0.1, 6, foreB, { name: 'handB', w0: 5, w1: 4, ratio: 0.5, joint: 2, col: 'horn' }); const armF = bone(-10, 17, Math.PI - 0.08, 20, torso, {
      name: 'armF', w0: 9, w1: 7, ratio: 0.6, joint: 3, col: 'body', }); const foreF = bone(0, 0, -0.4, 17, armF, { name: 'foreF', w0: 7, w1: 5.5, ratio: 0.6, joint: 2.5, col: 'body' });
    const handF = bone(0, 0, -0.2, 7, foreF, { name: 'handF', w0: 6, w1: 5, ratio: 0.5, joint: 2, col: 'dark' });
    const thighB = bone(-4, -13, 1.8, 14, hips, { name: 'thighB', w0: 10, w1: 8, ratio: 0.55, joint: 3, col: 'dark' });
    const shinB = bone(0, 0, -0.3, 13, thighB, { name: 'shinB', w0: 8, w1: 6, ratio: 0.6, joint: 2.5, col: 'dark' });
    const footB = bone(0, 0, -1.42, 8, shinB, { name: 'footB', w0: 6, w1: 5, ratio: 0.4, joint: 2, col: 'horn' });
    const thighF = bone(-4, 13, 1.74, 14, hips, { name: 'thighF', w0: 10, w1: 8, ratio: 0.55, joint: 3, col: 'dark' });
    const shinF = bone(0, 0, -0.26, 13, thighF, { name: 'shinF', w0: 8, w1: 6, ratio: 0.6, joint: 2.5, col: 'dark' });
    const footF = bone(0, 0, -1.42, 8, shinF, { name: 'footF', w0: 6, w1: 5, ratio: 0.4, joint: 2, col: 'horn' });
    const list = [hips, thighB, shinB, footB, thighF, shinF, footF, armB, foreB, handB,
      torso, head, hornA, hornB, armF, foreF, handF];
    torso.detail = function (c, b, tree) {
      const k = tree.col; ellipseFill(c, b.len * 0.42, 6, 18, 15, 0, k('belly') || k('#c8cd7c'));
      c.globalAlpha = 0.5;
      for (let i = 0; i < 3; i++) {
        ellipseFill(c, b.len * 0.3 + i * 5, -8 + i * 8, 3.2, 2.6, 0, k('#ffffff')); }
      c.globalAlpha = 1; };
    head.detail = function (c, b, tree) {
      const k = tree.col; const ir = tree.C.eye || '#ff4b3e'; c.save();
      c.translate(b.len, 0); drawEye(c, k, -2, -2, 5.2, ir, 0, true);
      drawEye(c, k, 9, -1, 4.4, ir, 0, true); drawMouth(c, k, 8, 8, tree.mouthOpen || 0.18, 3);
      c.restore(); };
    return skeletonTree(list, {}, { root: hips, hipX: -2 }); }
  function poseFartling(m, time, seed) {
    const sway = wave(time, 2.2, seed) * 0.045; const breathe = wave(time, 1.5, seed + 1) * 0.03; const p = stateProgress(m, 0.55); const hi = clamp(m.hurt / 0.28, 0, 1); const base = {
      torso: -Math.PI / 2 + sway, head: 0.08 + breathe, armB: Math.PI + 0.12, foreB: -0.34, handB: -0.12,
      armF: Math.PI - 0.06, foreF: -0.4, handF: -0.16, thighB: 1.78, shinB: -0.3, footB: -1.4, thighF: 1.72, shinF: -0.24, footF: -1.4, };
    let target = base;
    if (m.state === 'chase') {
      const st = Math.sin(time * 8.5 + seed);
      target = {
        torso: -Math.PI / 2 + 0.14 + sway, head: -0.05, armB: Math.PI + 0.5 + st * 0.35, foreB: -0.6, handB: -0.2,
        armF: Math.PI - 0.5 - st * 0.35, foreF: -0.75, handF: -0.1, thighB: 1.8 + st * 0.5, shinB: -0.35 + st * 0.3, footB: -1.45,
        thighF: 1.8 - st * 0.5, shinF: -0.35 - st * 0.3, footF: -1.45, };
    } else if (m.state === 'puff') {
      target = samplePose([
        { t: 0, pose: base },
        {t: 0.42, ease: easeOut, pose: {
            torso: -Math.PI / 2 + 0.32, head: 0.34, armB: Math.PI + 0.7, foreB: -0.9, handB: -0.4, armF: Math.PI - 0.7, foreF: -0.9, handF: -0.4,
            thighB: 2.18, shinB: -0.75, footB: -1.3, thighF: 2.08, shinF: -0.7, footF: -1.3, }, },
        {t: 0.72, ease: easeIn, pose: {
            torso: -1.03, head: -0.42, armB: 2.1, foreB: 0.18, handB: 0.1, armF: 2.34, foreF: 0.22, handF: 0.1, thighB: 1.4, shinB: 0.2, footB: -1.4,
            thighF: 1.36, shinF: 0.18, footF: -1.4, }, },
        {t: 1, ease: easeInOut, pose: {
            torso: -Math.PI / 2 + 0.18, head: 0.12, armB: Math.PI + 0.3, foreB: -0.5, handB: -0.15, armF: Math.PI - 0.2, foreF: -0.55, handF: -0.15,
            thighB: 1.84, shinB: -0.36, footB: -1.4, thighF: 1.8, shinF: -0.32, footF: -1.4, }, },
      ], p);
    } else if (m.state === 'hurt') {
      target = {
        torso: -Math.PI / 2 - 0.35 * hi, head: 0.4 * hi, armB: Math.PI + 0.9, foreB: 0.2, handB: 0.2, armF: Math.PI - 0.9, foreF: 0.2, handF: 0.2,
        thighB: 1.55, shinB: -0.55, footB: -1.4, thighF: 1.5, shinF: -0.5, footF: -1.4, };
    } else if (m.state === 'stun') {
      const wob = Math.sin(time * 5.5 + seed) * 0.18;
      target = {
        torso: -Math.PI / 2 + 0.1 + wob, head: 0.35 - wob, armB: Math.PI + 0.25 + wob, foreB: -0.05, handB: -0.1,
        armF: Math.PI - 0.25 + wob, foreF: -0.05, handF: -0.1, thighB: 1.9, shinB: -0.45, footB: -1.4, thighF: 1.9, shinF: -0.45, footF: -1.4, };
    } else if (m.state === 'dead') {
      target = {
        torso: -0.18, head: 0.5, armB: 2.5, foreB: 0.4, handB: 0.2, armF: 2.9, foreF: 0.3, handF: 0.2, thighB: 1.2, shinB: 0.5, footB: -0.6,
        thighF: 1.2, shinF: 0.6, footF: -0.6, }; }
    return target; }
  function drawFartling(ctx, m, C, col, time, seed, flash) {
    const rig = buildFartling(C); rig.col = col;
    rig.C = C; rig.flash = flash; const pose = poseFartling(m, time, seed); assignPose(rig.bones, pose);
    rig.mouthOpen = (m.state === 'puff' && stateProgress(m, 0.55) > 0.45) ? 0.9
      : (m.state === 'stun' ? 0.5 : 0.18);
    drawShadow(ctx, m.def, col, 0); ctx.save();
    ctx.translate(hurtShake(m), 0);
    if (m.gasT > 0) {
      ctx.globalAlpha = 0.42;
      for (let i = 0; i < 6; i++) {
        const px = -34 - i * 15 - Math.sin(time * 3 + i) * 8; const py = -50 + Math.cos(time * 2 + i * 1.7) * 13; ctx.fillStyle = col(i % 2 ? '#9be08a' : '#6fbf74');
        ctx.beginPath(); ctx.arc(px, py, 13 + i * 2.6, 0, TAU);
        ctx.fill(); }
      ctx.globalAlpha = 1; }
    drawBoneChain(ctx, rig, function (b) { return col(C[b.col] || C.body); }); drawFartlingClaws(ctx, rig, col);
    if (m.state === 'puff' && stateProgress(m, 0.55) > 0.45) {
      const k = stateProgress(m, 0.55); ctx.globalAlpha = 0.55;
      for (let i = 0; i < 8; i++) {
        const a = (time * 4 + i * 0.8) % TAU; const r = 18 + i * 4 + k * 16; ctx.fillStyle = col(i % 2 ? '#bdf2a8' : '#8bd88a');
        ctx.beginPath(); ctx.arc(38 + Math.cos(a) * 14 + k * 26, -62 + Math.sin(a) * 16, 8 + i * 1.4, 0, TAU);
        ctx.fill(); }
      ctx.globalAlpha = 1; }
    ctx.restore(); }
  function drawFartlingClaws(ctx, rig, col) {
    withBoneEnd(ctx, rig.by.handF, function () {
      ctx.fillStyle = col(rig.C.spike || '#e6c39a');
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath(); ctx.moveTo(0, i * 4);
        ctx.lineTo(6, i * 4 + 1); ctx.lineTo(1, i * 4 + 3.4);
        ctx.closePath(); ctx.fill(); }
    }); }
  function buildPoopling(C) {
    const hips = bone(0, -7, 0, 0, null, { hidden: true, name: 'hips' }); const thighB = bone(-2, -7, 1.7, 8, hips, { name: 'thighB', w0: 6, w1: 4.5, ratio: 0.5, joint: 2, col: 'dark' });
    const shinB = bone(0, 0, -0.22, 7, thighB, { name: 'shinB', w0: 4.5, w1: 4, ratio: 0.5, joint: 1.6, col: 'dark' });
    const footB = bone(0, 0, -1.35, 5, shinB, { name: 'footB', w0: 3.6, w1: 3, ratio: 0.4, joint: 1, col: 'dark' });
    const thighF = bone(-2, 7, 1.68, 8, hips, { name: 'thighF', w0: 6, w1: 4.5, ratio: 0.5, joint: 2, col: 'dark' });
    const shinF = bone(0, 0, -0.18, 7, thighF, { name: 'shinF', w0: 4.5, w1: 4, ratio: 0.5, joint: 1.6, col: 'dark' });
    const footF = bone(0, 0, -1.35, 5, shinF, { name: 'footF', w0: 3.6, w1: 3, ratio: 0.4, joint: 1, col: 'dark' }); const pileA = bone(0, 0, -Math.PI / 2, 16, hips, {
      name: 'pileA', w0: 26, w1: 23, ratio: 0.62, joint: 4, col: 'body', }); const pileB = bone(0, 0, 0, 15, pileA, { name: 'pileB', w0: 22, w1: 16, ratio: 0.6, joint: 3, col: 'body' });
    const pileC = bone(0, 0, 0, 12, pileB, { name: 'pileC', w0: 16, w1: 10, ratio: 0.6, joint: 2.5, col: 'body' }); const tip = bone(0, 0, 0.2, 14, pileC, {
      name: 'tip', w0: 7, w1: 1.4, ratio: 0.5, shape: 'spike', col: 'body', line: 2.4, });
    const armB = bone(-4, -13, Math.PI + 0.2, 8, pileB, { name: 'armB', w0: 5, w1: 4, ratio: 0.5, col: 'dark' });
    const armF = bone(-4, 13, Math.PI - 0.2, 8, pileB, { name: 'armF', w0: 5, w1: 4, ratio: 0.5, col: 'dark' }); const list = [hips, thighB, shinB, footB, thighF, shinF, footF, armB,
      pileA, pileB, pileC, tip, armF];
    pileA.detail = function (c, b, tree) {
      const k = tree.col; c.strokeStyle = k(tree.C.dark || '#6f3a10');
      c.lineWidth = 2; c.beginPath();
      c.moveTo(-2, -b.w0 * 0.6); c.quadraticCurveTo(4, 0, b.len * 0.5, b.w0 * 0.6);
      c.stroke(); };
    pileC.detail = function (c, b, tree) {
      const k = tree.col; const ir = tree.C.eye === '#ffffff' ? '#3a2208' : (tree.C.eye || '#3a2208'); c.save();
      c.translate(b.len * 0.36, 0); drawEye(c, k, 0, -8, 7.2, ir, 0.15, true);
      drawEye(c, k, 0, 8, 7.2, ir, 0.15, true); drawMouth(c, k, -2, 0, tree.mouthOpen || 0.15, 3);
      c.restore(); };
    return skeletonTree(list, {}, { root: hips, hipX: 0 }); }
  function posePoopling(m, time, seed) {
    const p = stateProgress(m, 1.2); const bob = Math.abs(Math.sin(time * 4.2 + seed)); const base = {
      pileA: -Math.PI / 2 + 0.04, pileB: 0.05, pileC: 0.06, tip: 0.16, armB: Math.PI + 0.25, armF: Math.PI - 0.25,
      thighB: 1.78 - bob * 0.15, thighF: 1.78 - bob * 0.15, shinB: -0.2 + bob * 0.15, shinF: -0.2 + bob * 0.15, footB: -1.35, footF: -1.35, };
    let target = base;
    if (m.state === 'jump') {
      const rising = (m.vy || 0) < 0;
      target = {
        pileA: -Math.PI / 2 + (rising ? 0.16 : -0.1), pileB: rising ? -0.12 : 0.2, pileC: rising ? -0.16 : 0.24, tip: rising ? -0.3 : 0.35,
        armB: Math.PI + 0.9, armF: Math.PI - 0.9, thighB: rising ? 2.55 : 2.1, thighF: rising ? 2.35 : 2.0,
        shinB: rising ? -1.45 : -1.0, shinF: rising ? -1.35 : -0.9, footB: -1.2, footF: -1.2, };
    } else if (m.state === 'hurt') {
      target = {
        pileA: -Math.PI / 2 - 0.22, pileB: -0.28, pileC: -0.3, tip: -0.5, armB: Math.PI + 0.8, armF: Math.PI - 0.8,
        thighB: 1.4, thighF: 1.35, shinB: -0.55, shinF: -0.5, footB: -1.3, footF: -1.3, };
    } else if (m.state === 'stun') {
      const wob = Math.sin(time * 6 + seed) * 0.16;
      target = {
        pileA: -Math.PI / 2 + 0.1 + wob, pileB: 0.15 - wob, pileC: 0.2 - wob, tip: 0.3, armB: Math.PI + 0.1, armF: Math.PI - 0.1,
        thighB: 1.95, thighF: 1.9, shinB: -0.35, shinF: -0.32, footB: -1.35, footF: -1.35, };
    } else if (m.state === 'dead') {
      target = {
        pileA: -0.1, pileB: -0.55, pileC: -0.7, tip: -0.9, armB: 2.2, armF: 3.0,
        thighB: 1.25, thighF: 1.2, shinB: 0.45, shinF: 0.42, footB: -0.4, footF: -0.4, }; }
    return target; }
  function drawPoopling(ctx, m, C, col, time, seed, flash) {
    const rig = buildPoopling(C); rig.col = col;
    rig.C = C; rig.flash = flash; const pose = posePoopling(m, time, seed); assignPose(rig.bones, pose);
    const puff = (m.state === 'dead') ? 1 : 0; rig.mouthOpen = (m.state === 'stun' ? 0.55 : 0.16);
    drawShadow(ctx, m.def, col, 0); ctx.save();
    ctx.translate(hurtShake(m), -Math.abs(Math.sin(time * 4.2 + seed)) * 1.6);
    if (puff) {
      ellipseFill(ctx, 0, -2, 42, 11, 0, col(C.body)); ctx.strokeStyle = inkOf(C);
      ctx.lineWidth = 3; ctx.beginPath();
      ctx.ellipse(0, -2, 42, 11, 0, 0, TAU); ctx.stroke(); }
    drawBoneChain(ctx, rig, function (b) { return col(C[b.col] || C.body); }); ctx.globalAlpha = 0.5;
    for (let i = 0; i < 4; i++) {
      const q = pointTree(rig, 'pileB', 6 + i * 4, (i % 2 ? 9 : -9)); ellipseFill(ctx, q.x, q.y, 2.6, 2.2, 0, col(C.dark || '#6f3a10')); }
    ctx.globalAlpha = 1; ctx.restore(); }
  function buildGasfish(C) {
    const hips = bone(0, -14, 0, 0, null, { hidden: true, name: 'hips' });
    const thighB = bone(-2, -8, 1.76, 13, hips, { name: 'thighB', w0: 9, w1: 6, ratio: 0.55, joint: 2.4, col: 'dark' });
    const shinB = bone(0, 0, -0.26, 11, thighB, { name: 'shinB', w0: 6, w1: 5, ratio: 0.55, joint: 2, col: 'dark' });
    const footB = bone(0, 0, -1.4, 7, shinB, { name: 'footB', w0: 4.5, w1: 3.4, ratio: 0.4, joint: 1.2, col: 'fin' });
    const thighF = bone(-2, 8, 1.7, 13, hips, { name: 'thighF', w0: 9, w1: 6, ratio: 0.55, joint: 2.4, col: 'dark' });
    const shinF = bone(0, 0, -0.2, 11, thighF, { name: 'shinF', w0: 6, w1: 5, ratio: 0.55, joint: 2, col: 'dark' });
    const footF = bone(0, 0, -1.4, 7, shinF, { name: 'footF', w0: 4.5, w1: 3.4, ratio: 0.4, joint: 1.2, col: 'fin' }); const body = bone(0, 0, -1.48, 38, hips, {
      name: 'body', w0: 30, w1: 27, ratio: 0.56, joint: 5, col: 'body', }); const head = bone(0, 0, 0.3, 22, body, { name: 'head', w0: 22, w1: 15, ratio: 0.5, joint: 3, col: 'body' });
    const jaw = bone(5, 9, 0.82, 12, head, { name: 'jaw', w0: 5, w1: 3.2, ratio: 0.5, joint: 1.5, col: 'dark' }); const crestA = bone(4, -11, -0.35, 17, body, {
      name: 'crestA', w0: 5.2, w1: 1.4, ratio: 0.4, shape: 'spike', col: 'fin', line: 2.4, }); const crestB = bone(17, -13, -0.55, 13, body, {
      name: 'crestB', w0: 4.4, w1: 1.2, ratio: 0.4, shape: 'spike', col: 'fin', line: 2.2, });
    const tail = bone(3, -23, -1.24, 20, body, { name: 'tail', w0: 9, w1: 5, ratio: 0.6, joint: 2, col: 'fin' }); const tailFin = bone(0, 0, 0.65, 16, tail, {
      name: 'tailFin', w0: 11, w1: 2, ratio: 0.45, shape: 'spike', col: 'fin', line: 2.4, });
    const armB = bone(-5, -17, Math.PI + 0.1, 14, body, { name: 'armB', w0: 7, w1: 5, ratio: 0.55, joint: 2.2, col: 'dark' });
    const foreB = bone(0, 0, -0.42, 12, armB, { name: 'foreB', w0: 5, w1: 3.6, ratio: 0.5, joint: 1.6, col: 'fin' });
    const armF = bone(-8, 17, Math.PI - 0.08, 16, body, { name: 'armF', w0: 8, w1: 6, ratio: 0.55, joint: 2.4, col: 'body' });
    const foreF = bone(0, 0, -0.36, 13, armF, { name: 'foreF', w0: 6, w1: 4, ratio: 0.5, joint: 1.8, col: 'fin' });
    const handF = bone(0, 0, -0.12, 6, foreF, { name: 'handF', w0: 4.6, w1: 4, ratio: 0.5, col: 'body' }); const list = [hips, thighB, shinB, footB, thighF, shinF, footF, tail, tailFin,
      armB, foreB, body, crestA, crestB, head, jaw, armF, foreF, handF];
    body.detail = function (c, b, tree) {
      const k = tree.col; ellipseFill(c, b.len * 0.45, 5, 22, 16, 0, k(tree.C.belly || '#c9c487')); const g = tree.gill || 0; c.globalAlpha = 0.45 + g * 0.45;
      for (let i = 0; i < 3; i++) {
        c.strokeStyle = k(tree.C.dark || '#33463a'); c.lineWidth = 2 + g * 1.6;
        c.beginPath(); c.arc(b.len * 0.82, -6 + i * 6, 5 + g * 4, -1.2, 1.2);
        c.stroke(); }
      c.globalAlpha = 1; };
    head.detail = function (c, b, tree) {
      const k = tree.col; drawEye(c, k, b.len * 0.62, -9, 7.4, tree.C.eye || '#ffd34f', 0.1, true);
      const open = tree.mouthOpen || 0.2; ellipseFill(c, b.len * 0.85, 6, 9, 3.4 + open * 6, 0.18, k('#1a0d0d'));
      ellipseFill(c, b.len * 0.9, 6.5, 4.6, 2 + open * 3, 0, k('#d94a44')); c.fillStyle = k('#f4efdc');
      for (let i = 0; i < 4; i++) {
        c.beginPath(); c.moveTo(b.len * 0.5 + i * 4.4, 2 - open * 1.5);
        c.lineTo(b.len * 0.52 + i * 4.4, 7 + open * 3); c.lineTo(b.len * 0.55 + i * 4.4, 2 - open * 1.5);
        c.closePath(); c.fill(); }
    };
    return skeletonTree(list, {}, { root: hips, hipX: 0 }); }
  function poseGasfish(m, time, seed) {
    const p = stateProgress(m, 0.95); const sway = wave(time, 1.8, seed) * 0.05; const fin = wave(time, 4.4, seed + 1); const base = {
      body: -1.48 + sway, head: 0.28, jaw: 0.8, crestA: -0.32 + fin * 0.08, crestB: -0.5 + fin * 0.1,
      tail: -1.2 + fin * 0.22, tailFin: 0.6 + fin * 0.25, armB: Math.PI + 0.18 + fin * 0.1, foreB: -0.5 + fin * 0.14,
      armF: Math.PI - 0.12 - fin * 0.1, foreF: -0.44 + fin * 0.12, handF: -0.1, thighB: 1.78, shinB: -0.24, footB: -1.4,
      thighF: 1.73, shinF: -0.2, footF: -1.4, };
    let target = base;
    if (m.state === 'charge') {
      const k = easeOut(p);
      target = {
        body: -1.48 - 0.1 * k, head: 0.3 - 0.75 * k, jaw: 0.8 + 0.5 * k, crestA: -0.32 + 0.22 * k, crestB: -0.5 + 0.22 * k,
        tail: -1.2 - 0.25 * k, tailFin: 0.6 - 0.3 * k, armB: Math.PI + 0.5, foreB: -0.2, armF: Math.PI - 0.5, foreF: -0.2, handF: 0,
        thighB: 2.02, shinB: -0.42, footB: -1.4, thighF: 1.98, shinF: -0.4, footF: -1.4, };
    } else if (m.state === 'shoot') {
      const k = Math.sin(clamp(p, 0, 1) * Math.PI);
      target = {
        body: -1.48 + 0.34 * k, head: 0.28 + 0.32 * k, jaw: 1.15, crestA: -0.5, crestB: -0.65, tail: -1.0 - 0.1 * k, tailFin: 0.45,
        armB: Math.PI + 0.7, foreB: -0.1, armF: Math.PI - 0.72, foreF: -0.05, handF: 0.1, thighB: 1.62, shinB: -0.12, footB: -1.4,
        thighF: 1.58, shinF: -0.1, footF: -1.4, };
    } else if (m.state === 'guard') {
      target = {
        body: -1.36, head: 0.62, jaw: 0.25, crestA: -0.15, crestB: -0.3, tail: -1.32, tailFin: 0.8, armB: Math.PI + 0.95, foreB: -1.5,
        armF: Math.PI - 1.02, foreF: -1.45, handF: -0.5, thighB: 2.0, shinB: -0.58, footB: -1.4, thighF: 1.96, shinF: -0.55, footF: -1.4, };
    } else if (m.state === 'hurt') {
      const k = clamp(m.hurt / 0.3, 0, 1);
      target = {
        body: -1.48 - 0.42 * k, head: 0.3 - 0.45 * k, jaw: 1.05, crestA: -0.7, crestB: -0.85, tail: -1.05, tailFin: 0.3,
        armB: Math.PI + 1.1, foreB: 0.3, armF: Math.PI - 1.0, foreF: 0.35, handF: 0.2, thighB: 1.45, shinB: -0.65, footB: -1.3,
        thighF: 1.4, shinF: -0.6, footF: -1.3, };
    } else if (m.state === 'stun') {
      const wob = Math.sin(time * 5 + seed) * 0.15;
      target = {
        body: -1.48 + 0.12 + wob, head: 0.6 - wob, jaw: 0.45, crestA: -0.5, crestB: -0.7, tail: -1.45, tailFin: 1.0, armB: Math.PI + 0.2, foreB: -0.1,
        armF: Math.PI - 0.2, foreF: -0.1, handF: 0, thighB: 2.05, shinB: -0.5, footB: -1.4, thighF: 2.0, shinF: -0.48, footF: -1.4, }; }
    return target; }
  function drawGasfish(ctx, m, C, col, time, seed, flash) {
    const rig = buildGasfish(C); rig.col = col;
    rig.C = C; rig.flash = flash; const pose = poseGasfish(m, time, seed); assignPose(rig.bones, pose);
    const p = stateProgress(m, 0.95); rig.gill = (m.state === 'charge' ? easeOut(p) : (m.state === 'shoot' ? 0.2 : 0));
    rig.mouthOpen = (m.state === 'charge' ? 0.4 + p * 0.5
      : (m.state === 'shoot' ? 0.9 : (m.state === 'hurt' ? 0.6 : 0.22)));
    drawShadow(ctx, m.def, col, 0); ctx.save();
    ctx.translate(hurtShake(m), Math.sin(time * 2 + seed) * 2.4); drawBoneChain(ctx, rig, function (b) { return col(C[b.col] || C.body); });
    if (m.state === 'charge') {
      const k = easeOut(p); ctx.globalAlpha = 0.35 + k * 0.35; const hx = pointTree(rig, 'head', 18, 6);
      for (let i = 0; i < 5; i++) {
        const a = time * 3 + i * 1.3; ctx.fillStyle = col('#9be08a');
        ctx.beginPath(); ctx.arc(hx.x + 18 + Math.cos(a) * (10 + k * 10), hx.y + 2 + Math.sin(a) * (8 + k * 8), 3 + k * 4, 0, TAU);
        ctx.fill(); }
      ctx.globalAlpha = 1; }
    ctx.restore(); }
  function buildCentipede(C) {
    const hips = bone(-70, -24, 0, 0, null, { hidden: true, name: 'hips' }); const segs = [];
    let parent = hips;
    for (let i = 0; i < 7; i++) {
      const w = 15 - i * 1.1; const b = bone(0, 0, 0, 15.5, parent, {
        name: 'seg' + (i + 1), w0: w, w1: w - 1.2, ratio: 0.6, joint: i === 0 ? 2 : 3.2, col: i === 6 ? 'dark' : 'body',
      }); b.detail = makeShellDetail(i);
      segs.push(b); parent = b; }
    const head = bone(0, 0, 0.12, 20, segs[6], {
      name: 'head', w0: 20, w1: 16, ratio: 0.5, joint: 3, col: 'body', }); const jawA = bone(8, -9, -0.4, 13, head, {
      name: 'jawA', w0: 4.2, w1: 1.2, ratio: 0.45, shape: 'spike', col: 'spike', line: 2, }); const jawB = bone(8, 9, 0.4, 13, head, {
      name: 'jawB', w0: 4.2, w1: 1.2, ratio: 0.45, shape: 'spike', col: 'spike', line: 2, }); const antA = bone(4, -7, -0.35, 17, head, {
      name: 'antA', w0: 2.2, w1: 0.5, ratio: 0.4, shape: 'spike', col: 'outline', line: 1.4, }); const antB = bone(3, 7, 0.35, 15, head, {
      name: 'antB', w0: 2, w1: 0.5, ratio: 0.4, shape: 'spike', col: 'outline', line: 1.4, }); const legsB = [], legsF = [], shins = [];
    for (let i = 0; i < 6; i++) {
      const lb = bone(7, -7, 1.95, 14, segs[i], {
        name: 'legB' + (i + 1), w0: 4, w1: 2.6, ratio: 0.5, joint: 1.6, col: 'dark', }); const sb = bone(0, 0, -0.35, 12, lb, {
        name: 'shinB' + (i + 1), w0: 2.6, w1: 1.6, ratio: 0.5, joint: 1, col: 'dark', }); const lf = bone(7, 8, 1.8, 15, segs[i], {
        name: 'legF' + (i + 1), w0: 4.4, w1: 2.8, ratio: 0.5, joint: 1.6, col: 'dark', }); const sf = bone(0, 0, -0.3, 13, lf, {
        name: 'shinF' + (i + 1), w0: 2.8, w1: 1.7, ratio: 0.5, joint: 1, col: 'dark',
      }); legsB.push(lb, sb);
      legsF.push(lf, sf); shins.push(sb, sf); }
    head.detail = function (c, b, tree) {
      const k = tree.col; drawEye(c, k, b.len * 0.55, -8, 6.4, '#ffffff', 0.15, true);
      drawEye(c, k, b.len * 0.35, -9, 5.2, '#ffffff', 0.18, true); c.fillStyle = k(tree.C.spike || '#f4efdc');
      c.beginPath(); c.moveTo(b.len * 0.6, 5);
      c.lineTo(b.len * 1.06, 11); c.lineTo(b.len * 0.58, 15);
      c.closePath(); c.fill(); }; const list = legsB.slice(); list.push(hips);
    for (let i = 0; i < segs.length; i++) list.push(segs[i]); list.push(head, jawA, jawB, antA, antB);
    for (let i = 0; i < legsF.length; i++) list.push(legsF[i]);
    return skeletonTree(list, {}, { root: hips, hipX: -70 }); }
  function makeShellDetail(i) {
    return function (c, b, tree) {
      const k = tree.col; c.strokeStyle = k(tree.C.outline);
      c.lineWidth = 1.8; c.beginPath();
      c.arc(b.len * 0.55, 0, Math.max(2, b.w1 * 0.72), -1.35, 1.35); c.stroke();
      ellipseFill(c, b.len * 0.5, -b.w1 * 0.28, b.len * 0.32, 2, -0.05, k(tree.C.light || '#eda24a'));
      if (i % 2 === 0) {
        c.fillStyle = k(tree.C.dark || '#a25a12'); c.beginPath();
        c.arc(b.len * 0.2, -b.w1 * 0.42, 2.2, 0, TAU); c.fill(); }
    }; }
  function poseCentipede(m, time, seed) {
    const n = 7; const pose = {}; const p = stateProgress(m, 0.62); const walk = Math.sin(time * 7 + seed);
    let amp = 0.14;
    let coil = 0;
    let headAng = 0.12;
    let jaw = 0.2;
    let crouch = 0;
    if (m.state === 'idle') {
      amp = 0.12;
    } else if (m.state === 'chase') {
      amp = 0.2;
    } else if (m.state === 'bite') {
      const k = samplePose([
        { t: 0, pose: { amp: 0.18, coil: 0, head: 0.12, jaw: 0.2 } },
        { t: 0.34, ease: easeOut, pose: { amp: 0.08, coil: -0.105, head: -0.34, jaw: 0.95 } },
        { t: 0.56, ease: easeIn, pose: { amp: 0.06, coil: 0.05, head: 0.4, jaw: 1 } },
        { t: 1, ease: easeInOut, pose: { amp: 0.14, coil: 0, head: 0.12, jaw: 0.2 } },
      ], p); amp = k.amp; coil = k.coil; headAng = k.head; jaw = k.jaw;
    } else if (m.state === 'guard') {
      amp = 0.05; coil = 0.02; headAng = 0.82; jaw = 0.05; crouch = 1;
    } else if (m.state === 'hurt') {
      const k = clamp(m.hurt / 0.3, 0, 1); amp = 0.24; coil = -0.04 * k; headAng = -0.45 * k; jaw = 0.75;
    } else if (m.state === 'dead') {
      amp = 0.03; coil = 0.14; headAng = 0.35; jaw = 0.7; crouch = 1; }
    for (let i = 0; i < n; i++) {
      pose['seg' + (i + 1)] = Math.sin(time * 5.4 - i * 0.72 + seed) * amp + coil; }
    pose.head = headAng + Math.sin(time * 4 + seed) * 0.03; pose.jawA = -0.35 - jaw * 0.8;
    pose.jawB = 0.35 + jaw * 0.8; pose.antA = -0.4 - Math.sin(time * 3 + seed) * 0.2;
    pose.antB = 0.4 + Math.sin(time * 3.2 + seed) * 0.2;
    for (let i = 0; i < 6; i++) {
      const sw = Math.sin(time * 11 + i * 1.1 + seed) * 0.3; pose['legB' + (i + 1)] = 1.95 - crouch * 0.4 + sw;
      pose['legF' + (i + 1)] = 1.8 - crouch * 0.4 - sw; pose['shinB' + (i + 1)] = -0.35 + crouch * 0.25;
      pose['shinF' + (i + 1)] = -0.3 + crouch * 0.25; }
    return pose; }
  function drawCentipede(ctx, m, C, col, time, seed, flash) {
    const rig = buildCentipede(C); rig.col = col;
    rig.C = C; rig.flash = flash;
    assignPose(rig.bones, poseCentipede(m, time, seed)); drawShadow(ctx, m.def, col, 0);
    ctx.save(); ctx.translate(hurtShake(m), Math.sin(time * 6 + seed) * 1.2);
    drawBoneChain(ctx, rig, function (b) { return col(C[b.col] || C.body); });
    withBoneEnd(ctx, rig.by.seg1, function () {
      ctx.fillStyle = col(C.dark || '#a25a12'); ctx.beginPath();
      ctx.moveTo(0, -3); ctx.quadraticCurveTo(-16, -8 + Math.sin(time * 7) * 4, -24, 1);
      ctx.quadraticCurveTo(-14, 4, 0, 4); ctx.closePath();
      ctx.fill(); ctx.strokeStyle = inkOf(C);
      ctx.lineWidth = 2.2; ctx.stroke(); });
    if (m.state === 'bite' && stateProgress(m, 0.62) > 0.36) {
      ctx.globalAlpha = 0.4; const hp = pointTree(rig, 'head', 20, 0); ellipseFill(ctx, hp.x, hp.y, 16, 10, 0, col('#f4efdc'));
      ctx.globalAlpha = 1; }
    ctx.restore(); }
  function buildUrinewisp(C) {
    const hips = bone(0, -8, 0, 0, null, { hidden: true, name: 'hips' }); const body = bone(0, 0, -Math.PI / 2, 36, hips, {
      name: 'body', w0: 27, w1: 25, ratio: 0.55, joint: 5, col: 'body', }); const tip = bone(0, 0, 0.05, 18, body, {
      name: 'tip', w0: 18, w1: 5, ratio: 0.55, joint: 2, col: 'body', }); const skirtA = bone(0, -15, 1.42, 13, hips, {
      name: 'skirtA', w0: 7, w1: 2, ratio: 0.5, shape: 'spike', col: 'body', line: 2.2, }); const skirtB = bone(0, -5, 1.56, 12, hips, {
      name: 'skirtB', w0: 6, w1: 1.8, ratio: 0.5, shape: 'spike', col: 'body', line: 2.2, }); const skirtC = bone(0, 5, 1.7, 11, hips, {
      name: 'skirtC', w0: 5.5, w1: 1.6, ratio: 0.5, shape: 'spike', col: 'body', line: 2, }); const armB = bone(-9, -17, Math.PI + 0.2, 20, body, {
      name: 'armB', w0: 7, w1: 3.4, ratio: 0.55, joint: 2, col: 'body', }); const foreB = bone(0, 0, -0.4, 15, armB, {
      name: 'foreB', w0: 4, w1: 2.4, ratio: 0.5, shape: 'spike', col: 'body', line: 2.2, }); const armF = bone(-9, 17, Math.PI - 0.15, 22, body, {
      name: 'armF', w0: 7.6, w1: 3.6, ratio: 0.55, joint: 2, col: 'body', }); const foreF = bone(0, 0, -0.35, 16, armF, {
      name: 'foreF', w0: 4.2, w1: 2.6, ratio: 0.5, shape: 'spike', col: 'body', line: 2.2, }); const list = [hips, skirtC, skirtB, skirtA, armB, foreB, body, tip, armF, foreF];
    body.detail = function (c, b, tree) {
      const k = tree.col; c.globalAlpha = 0.5;
      for (let i = 0; i < 4; i++) {
        const bx = b.len * (0.25 + i * 0.13), by = (i % 2 ? 1 : -1) * (5 + i * 2); c.strokeStyle = k(tree.C.light || '#ffe98a');
        c.lineWidth = 1.4; c.beginPath();
        c.arc(bx, by, 2 + i * 0.7, 0, TAU); c.stroke(); }
      c.globalAlpha = 1; ellipseFill(c, b.len * 0.28, -b.w0 * 0.5, 9, 4.5, -0.4, k(tree.C.light || '#ffe98a'));
      drawEye(c, k, b.len * 0.66, -10, 8.2, tree.C.eye || '#241a00', 0.2, true);
      drawEye(c, k, b.len * 0.46, -12, 7.2, tree.C.eye || '#241a00', 0.2, true); };
    return skeletonTree(list, {}, { root: hips, hipX: 0 }); }
  function poseUrinewisp(m, time, seed) {
    const sway = Math.sin(time * 2.6 + seed) * 0.1; const arms = Math.sin(time * 3.2 + seed + 1); const base = {
      body: -Math.PI / 2 + sway, tip: 0.1 - sway * 0.6, armB: Math.PI + 0.18 + arms * 0.28, foreB: -0.5 + arms * 0.2,
      armF: Math.PI - 0.16 - arms * 0.28, foreF: -0.45 - arms * 0.2, skirtA: 1.36 + arms * 0.12, skirtB: 1.5 - arms * 0.1, skirtC: 1.64 + arms * 0.14, };
    let target = base;
    if (m.state === 'aim') {
      const p = stateProgress(m, 0.55);
      target = {
        body: -Math.PI / 2 - 0.16 * easeOut(p), tip: -0.35 * easeOut(p), armB: Math.PI + 0.7, foreB: -0.35, armF: Math.PI - 0.66, foreF: -0.3,
        skirtA: 1.7, skirtB: 1.8, skirtC: 1.9, };
    } else if (m.state === 'lunge') {
      const p = stateProgress(m, 0.62); const k = Math.sin(clamp(p, 0, 1) * Math.PI);
      target = {
        body: -Math.PI / 2 + 0.46 * k, tip: 0.5 * k, armB: Math.PI - 0.6 * k, foreB: -0.9, armF: Math.PI + 0.5 * k, foreF: -0.8,
        skirtA: 2.2 + k * 0.3, skirtB: 2.3, skirtC: 2.4, };
    } else if (m.state === 'retreat') {
      const p = stateProgress(m, 1.1);
      target = {
        body: -Math.PI / 2 - 0.42 * Math.sin(p * Math.PI), tip: 0.55, armB: Math.PI + 0.9, foreB: -1.2, armF: Math.PI - 0.86, foreF: -1.15,
        skirtA: 1.1, skirtB: 1.2, skirtC: 1.3, };
    } else if (m.state === 'hurt') {
      const k = clamp(m.hurt / 0.3, 0, 1);
      target = {
        body: -Math.PI / 2 + (0.3 + Math.sin(time * 16) * 0.1) * k, tip: 0.6 * k, armB: Math.PI + 1.1, foreB: 0.4, armF: Math.PI - 1.0, foreF: 0.45,
        skirtA: 1.9, skirtB: 2.0, skirtC: 2.1, }; }
    return target; }
  function drawUrinewisp(ctx, m, C, col, time, seed, flash) {
    const rig = buildUrinewisp(C); rig.col = col;
    rig.C = C; rig.flash = flash; const pose = poseUrinewisp(m, time, seed); const p = stateProgress(m, m.state === 'retreat' ? 1.1 : 0.62);
    let stretch = 0;
    if (m.state === 'aim') stretch = 0.55 * easeOut(p);
    if (m.state === 'lunge') stretch = 0.55 + 0.55 * Math.sin(clamp(p, 0, 1) * Math.PI);
    if (m.state === 'retreat') stretch = -0.28 * Math.sin(p * Math.PI);
    if (m.state === 'hurt') stretch = 0.15; rig.by.body.len = 36 + stretch * 14;
    rig.by.body.w1 = Math.max(12, 25 - stretch * 7); rig.by.tip.len = 18 + Math.max(0, stretch) * 11;
    rig.by.tip.w1 = Math.max(3, 5 - stretch * 1.6); assignPose(rig.bones, pose);
    ctx.save(); ctx.translate(hurtShake(m), Math.sin(time * 3 + seed) * 3); const wob = Math.sin(time * 3.4 + seed); ctx.fillStyle = col(C.body);
    ctx.strokeStyle = inkOf(C); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-22, -6);
    ctx.quadraticCurveTo(-20 + wob * 3, 2, 0, 3); ctx.quadraticCurveTo(20 - wob * 3, 2, 22, -6);
    ctx.quadraticCurveTo(10, -13, 0, -13); ctx.quadraticCurveTo(-10, -13, -22, -6);
    ctx.closePath(); ctx.fill();
    ctx.stroke(); drawBoneChain(ctx, rig, function (b) { return col(C[b.col] || C.body); });
    if (m.state === 'lunge' && p > 0.2) {
      const tp = pointTree(rig, 'tip', rig.by.tip.len + 6, 0); ctx.globalAlpha = 0.55;
      ellipseFill(ctx, tp.x, tp.y, 7, 3.2, Math.atan2(tp.y + 40, tp.x), col(C.light || '#ffe98a')); ctx.globalAlpha = 1; }
    if (m.state !== 'lunge') {
      const dy = (time * 34) % 28; ellipseFill(ctx, 4, -4 + dy, 4.2, 7, 0, col(C.body)); }
    ctx.restore(); }
  function buildJellyfish(C) {
    const hips = bone(0, -34, 0, 0, null, { hidden: true, name: 'hips' }); const bell = bone(0, 0, -Math.PI / 2, 28, hips, {
      name: 'bell', w0: 38, w1: 34, ratio: 0.55, joint: 4, col: 'body', });
    bell.detail = function (c, b, tree) {
      const k = tree.col; {const w = b.w0, len = b.len;
        c.beginPath(); c.moveTo(0, -w * 0.95);
        c.quadraticCurveTo(len * 0.55, -w * 1.16, len * 0.98, -w * 0.3); c.quadraticCurveTo(len * 1.08, 0, len * 0.98, w * 0.3);
        c.quadraticCurveTo(len * 0.55, w * 1.16, 0, w * 0.95); c.quadraticCurveTo(len * 0.35, 0, 0, -w * 0.95);
        c.closePath(); c.fillStyle = k(tree.C.light || '#eef7ef');
        c.fill(); c.strokeStyle = inkOf(tree.C);
        c.lineWidth = 3.4; c.stroke();
        c.fillStyle = k(tree.C.body); c.beginPath();
        c.moveTo(0, -w * 0.95);
        for (let i = 0; i < 5; i++) {
          const t = i / 4; c.lineTo(len * 0.1 + t * 2, -w * 0.95 + t * w * 1.9); }
        c.quadraticCurveTo(len * 0.42, 0, 0, -w * 0.95); c.closePath();
        c.fill(); const pulse = tree.corePulse || 1; c.fillStyle = k(tree.C.core || '#3ff0d0');
        c.beginPath(); c.arc(len * 0.42, 0, 8 * pulse, 0, TAU);
        c.fill(); c.fillStyle = k('#ffffff');
        c.beginPath(); c.arc(len * 0.38, -2, 3.4 * pulse, 0, TAU);
        c.fill(); c.fillStyle = k(tree.C.dark || '#5c7a6c');
        for (let i = 0; i < 3; i++) {
          c.globalAlpha = 0.3; c.beginPath();
          c.arc(len * (0.3 + i * 0.18), -w * 0.45 + i * 8, 2.4, 0, TAU); c.fill(); }
        c.globalAlpha = 1; }
    }; const tentacles = [];
    for (let i = 0; i < 6; i++) {
      const off = -24 + i * 9.6; const t1 = bone(0, off, Math.PI, 14, bell, {
        name: 't' + i + 'a', w0: 5.2, w1: 3.4, ratio: 0.55, joint: 1.4, col: 'dark', line: 2, });
      const t2 = bone(0, 0, 0, 14, t1, { name: 't' + i + 'b', w0: 3.4, w1: 2.2, ratio: 0.5, joint: 1, col: 'dark', line: 1.8 });
      const t3 = bone(0, 0, 0, 12, t2, { name: 't' + i + 'c', w0: 2.2, w1: 1, ratio: 0.5, joint: 0.8, col: 'dark', line: 1.6 });
      tentacles.push(t1, t2, t3); }
    const list = [hips, bell].concat(tentacles);
    return skeletonTree(list, {}, { root: hips, hipX: 0 }); }
  function poseJellyfish(m, time, seed) {
    const pose = {}; const pulse = 0.5 + 0.5 * Math.sin(time * 2.1 + seed); const base = {};
    for (let i = 0; i < 6; i++) {
      const sw = Math.sin(time * 1.9 + i * 1.05 + seed); base['t' + i + 'a'] = Math.PI + sw * 0.18;
      base['t' + i + 'b'] = Math.cos(time * 1.7 + i * 0.8 + seed) * 0.22; base['t' + i + 'c'] = Math.sin(time * 1.5 + i * 0.7 + seed) * 0.26; }
    base.bell = -Math.PI / 2;
    let target = base;
    if (m.state === 'drop') {
      const p = stateProgress(m, 1.2); const k = easeOut(Math.min(1, p * 1.4)); target = {};
      for (let i = 0; i < 6; i++) {
        target['t' + i + 'a'] = Math.PI - 0.05 + Math.sin(time * 5 + i) * 0.03 * (1 - k); target['t' + i + 'b'] = 0.08 - k * 0.12;
        target['t' + i + 'c'] = k * 0.1; }
      target.bell = -Math.PI / 2 - 0.06;
    } else if (m.state === 'guard') {
      target = {};
      for (let i = 0; i < 6; i++) {
        target['t' + i + 'a'] = Math.PI - 0.9; target['t' + i + 'b'] = -0.7;
        target['t' + i + 'c'] = -0.8; }
      target.bell = -Math.PI / 2;
    } else if (m.state === 'hurt') {
      const k = clamp(m.hurt / 0.3, 0, 1); target = {};
      for (let i = 0; i < 6; i++) {
        target['t' + i + 'a'] = Math.PI + Math.sin(time * 14 + i) * 0.4 * k; target['t' + i + 'b'] = Math.sin(time * 11 + i) * 0.4 * k;
        target['t' + i + 'c'] = Math.sin(time * 9 + i) * 0.5 * k; }
      target.bell = -Math.PI / 2 + 0.2 * k;
    } else {
      target = base; }
    return { pose: target, pulse: pulse, k: 0 }; }
  function drawJellyfish(ctx, m, C, col, time, seed, flash) {
    const rig = buildJellyfish(C); rig.col = col;
    rig.C = C; rig.flash = flash; const info = poseJellyfish(m, time, seed); const p = stateProgress(m, 1.2);
    let pulse = info.pulse;
    let lenMul = 1;
    if (m.state === 'drop') {
      pulse = 0.15; lenMul = 1.15;
    } else if (m.state === 'guard') {
      pulse = 0.9; lenMul = 0.74;
    } else if (m.state === 'hurt') {
      pulse = Math.abs(Math.sin(time * 8)) * 0.6; }
    rig.by.bell.len = 28 * lenMul; rig.by.bell.w0 = 38 * (1 - pulse * 0.12) * (m.state === 'guard' ? 0.9 : 1);
    rig.by.bell.w1 = 34 * (1 - pulse * 0.1); const dropK = m.state === 'drop' ? easeOut(Math.min(1, p * 1.4)) : 0;
    for (let i = 0; i < 6; i++) {
      const a = rig.by['t' + i + 'a']; const b = rig.by['t' + i + 'b']; const c = rig.by['t' + i + 'c']; a.len = 14 + dropK * 16;
      b.len = 14 + dropK * 12; c.len = 12 + dropK * 8;
      if (m.state === 'guard') {
        a.len = 10; b.len = 9; c.len = 7; }
    }
    rig.corePulse = 1 + Math.sin(time * 3 + seed) * 0.14; assignPose(rig.bones, info.pose);
    ctx.save(); ctx.translate(hurtShake(m), Math.sin(time * 1.8 + seed) * 7);
    drawBoneChain(ctx, rig, function (b) { return col(C[b.col] || C.body); });
    for (let i = 0; i < 6; i++) {
      const end = pointTree(rig, 't' + i + 'c', rig.by['t' + i + 'c'].len, 0); ctx.globalAlpha = 0.35 + 0.35 * Math.abs(Math.sin(time * 2.4 + i));
      ellipseFill(ctx, end.x, end.y, 3, 3, 0, col(C.core || '#3ff0d0')); }
    ctx.globalAlpha = 1;
    if (m.state === 'drop') {
      ctx.globalAlpha = 0.18 + p * 0.22; ctx.strokeStyle = col(C.core || '#3ff0d0');
      ctx.lineWidth = 2; ctx.beginPath();
      ctx.arc(0, -rig.by.bell.len - 8, 22 + p * 26, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1; }
    ctx.restore(); }
  function buildTroll(C) {
    const hips = bone(0, -80, 0, 0, null, { hidden: true, name: 'hips' });
    const thighB = bone(-4, -26, 1.8, 44, hips, { name: 'thighB', w0: 26, w1: 21, ratio: 0.55, joint: 5, col: 'dark' });
    const shinB = bone(0, 0, -0.2, 42, thighB, { name: 'shinB', w0: 20, w1: 15, ratio: 0.55, joint: 4, col: 'dark' });
    const footB = bone(0, 0, -1.38, 20, shinB, { name: 'footB', w0: 15, w1: 10, ratio: 0.45, joint: 3, col: 'scab' });
    const thighF = bone(-2, 26, 1.72, 44, hips, { name: 'thighF', w0: 27, w1: 22, ratio: 0.55, joint: 5, col: 'dark' });
    const shinF = bone(0, 0, -0.16, 42, thighF, { name: 'shinF', w0: 21, w1: 15, ratio: 0.55, joint: 4, col: 'dark' });
    const footF = bone(0, 0, -1.38, 20, shinF, { name: 'footF', w0: 16, w1: 10, ratio: 0.45, joint: 3, col: 'scab' }); const torso = bone(0, 0, -Math.PI / 2, 120, hips, {
      name: 'torso', w0: 62, w1: 54, ratio: 0.5, joint: 7, col: 'body', }); const head = bone(0, 0, 0.12, 46, torso, {
      name: 'head', w0: 37, w1: 28, ratio: 0.5, joint: 5, col: 'body', }); const hornA = bone(30, -16, -0.58, 38, head, {
      name: 'hornA', w0: 8, w1: 1.4, ratio: 0.42, shape: 'spike', col: 'scab', line: 3, }); const hornB = bone(28, 13, 0.5, 30, head, {
      name: 'hornB', w0: 7, w1: 1.2, ratio: 0.42, shape: 'spike', col: 'scab', line: 3, }); const armB = bone(-2, -44, Math.PI + 0.16, 56, torso, {
      name: 'armB', w0: 26, w1: 20, ratio: 0.55, joint: 5, col: 'dark', }); const foreB = bone(0, 0, -0.34, 52, armB, { name: 'foreB', w0: 19, w1: 15, ratio: 0.5, joint: 4, col: 'dark' });
    const handB = bone(0, 0, -0.14, 20, foreB, { name: 'handB', w0: 17, w1: 13, ratio: 0.5, joint: 3, col: 'scab' }); const armF = bone(-2, 44, Math.PI - 0.18, 56, torso, {
      name: 'armF', w0: 27, w1: 21, ratio: 0.55, joint: 5, col: 'body', }); const foreF = bone(0, 0, -0.3, 52, armF, { name: 'foreF', w0: 20, w1: 15, ratio: 0.5, joint: 4, col: 'body' });
    const handF = bone(0, 0, -0.12, 20, foreF, { name: 'handF', w0: 18, w1: 13, ratio: 0.5, joint: 3, col: 'scab' }); const spikes = [];
    for (let i = 0; i < 5; i++) {
      const b = bone(16 + i * 18, -52, -0.92, 26 + (i === 2 ? 16 : 0), torso, {
        name: 'spike' + (i + 1), w0: 9 + (i === 2 ? 4 : 0), w1: 1.6, ratio: 0.4, shape: 'spike', col: 'scab', line: 2.6,
      }); spikes.push(b); }
    const pauldronA = bone(102, -50, -0.5, 36, torso, {
      name: 'pauldronA', w0: 12, w1: 2, ratio: 0.4, shape: 'spike', col: 'spike', line: 2.6, }); const pauldronB = bone(100, 52, 0.55, 32, torso, {
      name: 'pauldronB', w0: 11, w1: 2, ratio: 0.4, shape: 'spike', col: 'spike', line: 2.6, }); const list = [hips,
      thighB, shinB, footB, thighF, shinF, footF,
      spikes[0], spikes[1], spikes[2], spikes[3], spikes[4], pauldronA,
      armB, foreB, handB,
      torso, head, hornA, hornB, pauldronB,
      armF, foreF, handF];
    torso.detail = function (c, b, tree) {
      const k = tree.col; const ph = tree.phase || 1; ellipseFill(c, b.len * 0.5, 24, 40, 30, 0, k(tree.C.light || '#d8584a'));
      c.strokeStyle = k(tree.C.dark || '#7a1f1a'); c.lineWidth = 2.4;
      for (let i = 0; i < 4; i++) {
        const ax = b.len * 0.26 + i * 20; c.beginPath();
        c.moveTo(ax, -20); c.quadraticCurveTo(ax + 5, 3, ax, 26);
        c.stroke(); }
      ellipseFill(c, b.len * 0.72, 34, 24, 17, 0.35, k(tree.C.scab || '#e0b08a'));
      ellipseFill(c, b.len * 0.74, 38, 9, 6, 0.3, k(tree.C.dark || '#7a1f1a'));
      if (ph >= 2) {
        for (let i = 0; i < 4; i++) {
          const px = b.len * (0.3 + i * 0.17), py = -32 + (i % 2) * 12; ellipseFill(c, px, py, 12, 8, 0.2, k(tree.C.scab || '#e0b08a'));
          c.strokeStyle = k('#8c2a1d'); c.lineWidth = 1.8;
          c.beginPath(); c.ellipse(px, py, 12, 8, 0.2, 0, TAU);
          c.stroke(); }
      }
      if (ph >= 3) {
        c.strokeStyle = k('#ff3a26'); c.lineWidth = 3.2;
        c.beginPath(); c.moveTo(b.len * 0.25, -12);
        c.lineTo(b.len * 0.38, 4); c.lineTo(b.len * 0.3, 18);
        c.lineTo(b.len * 0.44, 34); c.stroke();
        c.beginPath(); c.moveTo(b.len * 0.62, -24);
        c.lineTo(b.len * 0.55, -6); c.lineTo(b.len * 0.66, 12);
        c.stroke(); c.globalAlpha = 0.55;
        ellipseFill(c, b.len * 0.38, 8, 8, 14, 0.4, k('#ff6a40')); c.globalAlpha = 1; }
    };
    head.detail = function (c, b, tree) {
      const k = tree.col; const ph = tree.phase || 1; c.save();
      c.translate(b.len * 0.7, 0); drawEye(c, k, 0, -9, 9.4, tree.C.eye || '#ffd34f', 0.2, true);
      drawEye(c, k, -4, 12, 8.4, tree.C.eye || '#ffd34f', 0.2, true); c.save();
      c.translate(-16, 12); c.rotate(0.24);
      drawMouth(c, k, 0, 0, tree.mouthOpen || 0.25, 4); c.restore();
      if (ph >= 2) {
        c.strokeStyle = k('#ff3a26'); c.lineWidth = 2.4;
        c.beginPath(); c.moveTo(-2, 22);
        c.lineTo(6, 16); c.lineTo(10, 24);
        c.stroke(); }
      c.restore();
    }; handB.detail = drawTrollClaws;
    handF.detail = drawTrollClaws;
    return skeletonTree(list, {}, { root: hips, hipX: 0 }); }
  function drawTrollClaws(c, b, tree) {
    const k = tree.col; c.fillStyle = k(tree.C.spike || '#e6c39a');
    for (let i = -1; i <= 1; i++) {
      c.beginPath(); c.moveTo(2, i * 7 + 2);
      c.lineTo(b.len + 10, i * 8 - 2); c.lineTo(4, i * 7 - 4);
      c.closePath(); c.fill(); }
    c.strokeStyle = inkOf(tree.C); c.lineWidth = 1.8;
    c.beginPath(); c.arc(0, 0, b.w0 * 0.9, -1.2, 1.2);
    c.stroke(); }
  function poseTroll(m, time, seed) {
    const sway = Math.sin(time * 1.4 + seed) * 0.035; const walk = Math.sin(time * 3.4 + seed); const hi = m.hurt > 0 ? clamp(m.hurt / 0.35, 0, 1) : 0; const p = stateProgress(m, 0.8);
    const base = {
      torso: -Math.PI / 2 + sway, head: 0.12, hornA: -0.58, hornB: 0.5, spike1: -0.92, spike2: -0.92, spike3: -0.92, spike4: -0.92, spike5: -0.92,
      pauldronA: -0.5, pauldronB: 0.55, armB: Math.PI + 0.16 + Math.sin(time * 1.2 + seed) * 0.04, foreB: -0.34, handB: -0.14,
      armF: Math.PI - 0.18 + Math.sin(time * 1.5 + seed + 1) * 0.04, foreF: -0.3, handF: -0.12, thighB: 1.8, shinB: -0.2, footB: -1.38,
      thighF: 1.72, shinF: -0.16, footF: -1.38, };
    let target = base;
    let mouth = 0.25;
    if (m.state === 'walk') {
      target = {
        torso: -Math.PI / 2 + 0.1 + Math.sin(time * 3.4 + seed) * 0.04, head: 0.08, hornA: -0.58, hornB: 0.5,
        spike1: -0.92, spike2: -0.92, spike3: -0.92, spike4: -0.92, spike5: -0.92, pauldronA: -0.5, pauldronB: 0.55,
        armB: Math.PI + 0.24 + walk * 0.35, foreB: -0.42, handB: -0.1, armF: Math.PI - 0.24 - walk * 0.35, foreF: -0.48, handF: -0.15,
        thighB: 1.82 + walk * 0.42, shinB: -0.2 + walk * 0.22, footB: -1.38, thighF: 1.82 - walk * 0.42, shinF: -0.2 - walk * 0.22, footF: -1.38, };
    } else if (m.state === 'claw') {
      const q = samplePose([
        { t: 0, pose: base },
        {t: 0.34, ease: easeOut, pose: {
            torso: -Math.PI / 2 - 0.22, head: -0.06, armF: 0.55, foreF: -0.75, handF: -0.3, armB: Math.PI + 0.6, foreB: -0.5,
            thighB: 2.1, thighF: 2.02, shinB: -0.55, shinF: -0.5, }, },
        {t: 0.56, ease: easeIn, pose: {
            torso: -Math.PI / 2 + 0.48, head: 0.38, armF: 2.05, foreF: -0.12, handF: 0.18, armB: Math.PI + 0.1, foreB: -0.3,
            thighB: 1.5, thighF: 1.44, shinB: 0.08, shinF: 0.06, }, },
        { t: 1, ease: easeInOut, pose: base },
      ], p); target = q;
      mouth = p > 0.34 ? 0.5 : 0.25;
    } else if (m.state === 'charge') {
      const q = samplePose([
        { t: 0, pose: base },
        {t: 0.42, ease: easeOut, pose: {
            torso: -Math.PI / 2 - 0.42, head: -0.25, armB: Math.PI + 0.75, foreB: -0.8, handB: -0.2, armF: Math.PI - 0.75, foreF: -0.8, handF: -0.2,
            thighB: 2.25, thighF: 2.18, shinB: -0.78, shinF: -0.72, footB: -1.2, footF: -1.2,
            spike1: -1.05, spike2: -1.05, spike3: -1.05, spike4: -1.05, spike5: -1.05, }, },
        {t: 0.72, ease: easeIn, pose: {
            torso: -Math.PI / 2 + 0.62, head: 0.5, armB: Math.PI + 0.28, foreB: -0.2, handB: 0, armF: Math.PI - 0.28, foreF: -0.2, handF: 0,
            thighB: 1.46, thighF: 1.4, shinB: 0.14, shinF: 0.12, footB: -1.38, footF: -1.38,
            spike1: -0.7, spike2: -0.7, spike3: -0.7, spike4: -0.7, spike5: -0.7, }, },
        { t: 1, ease: easeInOut, pose: base },
      ], p); target = q;
      mouth = p > 0.5 ? 0.6 : 0.2;
    } else if (m.state === 'slam') {
      const q = samplePose([
        { t: 0, pose: base },
        {t: 0.36, ease: easeOut, pose: {
            torso: -Math.PI / 2 - 0.24, head: -0.2, armB: 0.34, foreB: -0.6, handB: -0.3, armF: 0.26, foreF: -0.65, handF: -0.3,
            thighB: 2.05, thighF: 2.0, shinB: -0.55, shinF: -0.5, spike1: -0.55, spike2: -0.55, spike3: -0.55, spike4: -0.55, spike5: -0.55, }, },
        {t: 0.62, ease: easeIn, pose: {
            torso: -Math.PI / 2 + 0.58, head: 0.55, armB: 2.95, foreB: 0.12, handB: 0.2, armF: 2.78, foreF: 0.1, handF: 0.2,
            thighB: 2.0, thighF: 1.94, shinB: -0.6, shinF: -0.55, spike1: -0.7, spike2: -0.7, spike3: -0.7, spike4: -0.7, spike5: -0.7, }, },
        { t: 1, ease: easeInOut, pose: base },
      ], p); target = q;
      mouth = p > 0.5 ? 0.7 : 0.2;
    } else if (m.state === 'spikes') {
      const q = samplePose([
        { t: 0, pose: base },
        {t: 0.4, ease: easeOut, pose: {
            torso: -Math.PI / 2 - 0.13, head: -0.18, spike1: -0.35, spike2: -0.35, spike3: -0.35, spike4: -0.35, spike5: -0.35,
            pauldronA: 0.15, pauldronB: -0.1, armB: Math.PI + 0.85, foreB: 0.1, armF: Math.PI - 0.85, foreF: 0.1,
            thighB: 2.1, thighF: 2.05, shinB: -0.55, shinF: -0.5, }, },
        {t: 0.62, ease: backOut, pose: {
            torso: -Math.PI / 2 + 0.16, head: 0.3, spike1: -1.1, spike2: -1.1, spike3: -1.1, spike4: -1.1, spike5: -1.1,
            pauldronA: -0.9, pauldronB: 1.0, armB: Math.PI + 0.4, foreB: -0.3, armF: Math.PI - 0.4, foreF: -0.3,
            thighB: 1.66, thighF: 1.6, shinB: -0.1, shinF: -0.08, }, },
        { t: 1, ease: easeInOut, pose: base },
      ], p); target = q;
      mouth = 0.7;
    } else if (m.state === 'roar') {
      const k = Math.sin(Math.min(1, p) * Math.PI);
      target = {
        torso: -Math.PI / 2 - 0.3 * k + sway, head: -0.5 * k, hornA: -0.58, hornB: 0.5,
        spike1: -0.92, spike2: -0.92, spike3: -0.92, spike4: -0.92, spike5: -0.92, pauldronA: -0.5 - 0.3 * k, pauldronB: 0.55 + 0.3 * k,
        armB: Math.PI + 0.9 - 0.4 * k, foreB: -0.55 - 0.4 * k, handB: -0.2, armF: Math.PI - 0.9 + 0.4 * k, foreF: -0.55 - 0.4 * k, handF: -0.2,
        thighB: 1.9 + 0.12 * k, thighF: 1.86 + 0.12 * k, shinB: -0.28, shinF: -0.24, footB: -1.38, footF: -1.38, };
      mouth = 0.35 + k * 0.75;
    } else if (m.state === 'leap') {
      const q = samplePose([
        { t: 0, pose: base },
        {t: 0.3, ease: easeOut, pose: {
            torso: -Math.PI / 2 + 0.1, head: 0.15, armB: Math.PI + 0.8, foreB: -0.6, armF: Math.PI - 0.8, foreF: -0.6,
            thighB: 2.32, thighF: 2.24, shinB: -0.8, shinF: -0.74, }, },
        {t: 0.62, ease: easeIn, pose: {
            torso: -Math.PI / 2 + 0.44, head: 0.4, armB: 1.55, foreB: -0.7, handB: -0.1, armF: 1.35, foreF: -0.6, handF: -0.1,
            thighB: 2.55, thighF: 2.35, shinB: -1.25, shinF: -1.15, footB: -0.9, footF: -0.9,
            spike1: -0.7, spike2: -0.7, spike3: -0.7, spike4: -0.7, spike5: -0.7, }, },
        { t: 1, ease: easeInOut, pose: base },
      ], p); target = q;
      mouth = 0.65;
    } else if (m.state === 'sweep') {
      target = {
        torso: -Math.PI / 2 + 0.72, head: 0.5, hornA: -0.58, hornB: 0.5, spike1: -0.9, spike2: -0.9, spike3: -0.9, spike4: -0.9, spike5: -0.9,
        pauldronA: -0.5, pauldronB: 0.55, armB: Math.PI + 0.3, foreB: -0.1, handB: 0.1,
        armF: 1.92 + Math.sin(time * 9) * 0.12, foreF: 0.05, handF: 0.15, thighB: 2.24, thighF: 2.16, shinB: -0.85, shinF: -0.8,
        footB: -1.2, footF: -1.2, };
      mouth = 0.45;
    } else if (m.state === 'guard') {
      target = {
        torso: -Math.PI / 2 - 0.1, head: 0.22, hornA: -0.7, hornB: 0.62, spike1: -0.92, spike2: -0.92, spike3: -0.92, spike4: -0.92, spike5: -0.92,
        pauldronA: -0.7, pauldronB: 0.75, armB: 2.7, foreB: -2.1, handB: -0.4, armF: 2.85, foreF: -2.05, handF: -0.4,
        thighB: 2.12, thighF: 2.06, shinB: -0.62, shinF: -0.58, footB: -1.3, footF: -1.3, };
      mouth = 0.12;
    } else if (m.state === 'stagger') {
      const k = Math.sin(Math.min(1, p) * Math.PI);
      target = {
        torso: -Math.PI / 2 - 0.55 * k, head: 0.2 + 0.3 * k, hornA: -0.5, hornB: 0.4,
        spike1: -0.75, spike2: -0.75, spike3: -0.75, spike4: -0.75, spike5: -0.75, pauldronA: -0.3, pauldronB: 0.35,
        armB: 1.2 * k + Math.PI + 0.2, foreB: 0.3, handB: 0.2, armF: 1.1 * k + Math.PI - 0.2, foreF: 0.35, handF: 0.2,
        thighB: 1.5, thighF: 1.45, shinB: -0.35, shinF: -0.3, footB: -1.3, footF: -1.3, };
      mouth = 0.5;
    } else if (m.state === 'hurt') {
      target = {
        torso: -Math.PI / 2 - 0.32 * hi, head: 0.28 * hi, hornA: -0.5, hornB: 0.42,
        spike1: -0.75, spike2: -0.75, spike3: -0.75, spike4: -0.75, spike5: -0.75, pauldronA: -0.35, pauldronB: 0.4,
        armB: Math.PI + 1.0, foreB: 0.35, handB: 0.3, armF: Math.PI - 0.95, foreF: 0.4, handF: 0.3,
        thighB: 1.55, thighF: 1.5, shinB: -0.45, shinF: -0.4, footB: -1.3, footF: -1.3, };
      mouth = 0.75;
    } else if (m.state === 'dead') {
      target = {
        torso: -0.16, head: 0.42, hornA: -0.3, hornB: 0.25, spike1: -1.1, spike2: -1.1, spike3: -1.1, spike4: -1.1, spike5: -1.1,
        pauldronA: -0.9, pauldronB: 1.0, armB: 2.5, foreB: 0.4, handB: 0.2, armF: 3.0, foreF: 0.35, handF: 0.2,
        thighB: 1.2, thighF: 1.15, shinB: 0.5, shinF: 0.45, footB: -0.4, footF: -0.4, };
      mouth = 0.55; }
    const ph = m.phase || 1;
    if (ph >= 2 && m.state !== 'dead') {
      const mul = ph >= 3 ? 1.24 : 1.1; const keys = ['torso', 'head', 'armB', 'armF', 'foreB', 'foreF'];
      for (let i = 0; i < keys.length; i++) {
        const kk = keys[i]; target[kk] = base[kk] + (target[kk] - base[kk]) * mul; }
    }
    return { pose: target, mouth: mouth }; }
  function drawTroll(ctx, m, C, col, time, seed, flash) {
    const rig = buildTroll(C); rig.col = col;
    rig.C = C; rig.flash = flash; const ph = m.phase || 1; rig.phase = ph; const info = poseTroll(m, time, seed); rig.mouthOpen = info.mouth;
    assignPose(rig.bones, info.pose); const p = stateProgress(m, 0.9); const stomp = Math.sin(time * 3.4 + seed);
    if (m.state === 'roar') {
      const k = Math.sin(Math.min(1, p) * Math.PI); rig.by.torso.w0 = 62 + k * 11;
      rig.by.torso.w1 = 54 + k * 9;
    } else {
      rig.by.torso.w0 = 62 + ph * 1.2; rig.by.torso.w1 = 54 + ph; }
    const spikeBase = [26, 26, 42, 26, 26];
    for (let i = 0; i < 5; i++) {
      const sp = rig.by['spike' + (i + 1)];
      let mul = 1 + (ph >= 2 ? 0.1 : 0) + (ph >= 3 ? 0.12 : 0);
      if (m.state === 'spikes') mul += Math.sin(clamp(p, 0, 1) * Math.PI) * 0.55; sp.len = spikeBase[i] * mul; }
    ctx.fillStyle = col('rgba(0,0,0,0.4)'); ctx.beginPath();
    ctx.ellipse(0, 2, 112 - ph * 6, 12, 0, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(hurtShake(m), (m.onGround === false ? -6 : 0) + stomp * 1.2);
    if (ph >= 2) {
      ctx.globalAlpha = 0.16 + 0.06 * Math.sin(time * 3); ctx.strokeStyle = col('#ff3a26');
      ctx.lineWidth = 2.4; ctx.beginPath();
      ctx.ellipse(0, -110, 74, 118, 0, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1; }
    drawBoneChain(ctx, rig, function (b) {
      if (b.name && b.name === 'torso' && ph >= 2) return col(C.body);
      return col(C[b.col] || C.body); });
    if (ph >= 3) {
      for (let i = 0; i < 5; i++) {
        const sp = rig.by['spike' + (i + 1)];
        withBone(ctx, sp, function () {
          ctx.strokeStyle = col('#ff5a3a'); ctx.globalAlpha = 0.75;
          ctx.lineWidth = 2.2; ctx.beginPath();
          ctx.moveTo(sp.len * 0.1, 0); ctx.lineTo(sp.len * 0.78, 0);
          ctx.stroke(); ctx.globalAlpha = 1; }); }
    }
    if (m.state === 'slam' && p > 0.5) {
      const k = clamp((p - 0.5) / 0.5, 0, 1); const hf = pointTree(rig, 'handF', rig.by.handF.len + 8, 0);
      const hb = pointTree(rig, 'handB', rig.by.handB.len + 8, 0); ctx.globalAlpha = 0.55 * (1 - k * 0.5);
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = col(i % 2 ? '#cbb18b' : '#8f7a5e'); const dx = (i - 2) * 26; ctx.beginPath();
        ctx.ellipse(hf.x + dx, hf.y + 8, 12 + k * 10, 5 + k * 4, 0, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 1; }
    if (m.state === 'charge' && p > 0.4 && p < 0.9) {
      ctx.globalAlpha = 0.5; ctx.strokeStyle = col('#f4efdc');
      ctx.lineWidth = 3;
      for (let i = 0; i < 4; i++) {
        const y = -70 - i * 44; ctx.beginPath();
        ctx.moveTo(-110 - i * 12, y); ctx.lineTo(-176 - i * 20, y + 5);
        ctx.stroke(); }
      ctx.globalAlpha = 1; }
    if (m.state === 'roar') {
      const k = Math.sin(Math.min(1, p) * Math.PI); const hp = pointTree(rig, 'head', rig.by.head.len + 10, 12); ctx.globalAlpha = 0.25 + 0.3 * k;
      ctx.strokeStyle = col('#ffe9a8'); ctx.lineWidth = 2.6;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.arc(hp.x, hp.y, 20 + i * 16 + k * 14, -0.9, 0.9);
        ctx.stroke(); }
      ctx.globalAlpha = 1; }
    ctx.restore(); }
  BVN.ROGUE_RIG = RIG;
})(window.BVN);

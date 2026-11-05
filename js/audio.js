/* js/audio.js — WebAudio 程序化合成音效（无任何外部音频文件），含静音开关与自动播放解锁 */
window.BVN = window.BVN || {};

(function (BVN) {
  'use strict';

  const SFX = {
    ctx: null,
    master: null,
    comp: null,
    noiseBuf: null,
    muted: false,
    ready: false,
  };

  /** 首次用户交互时初始化 / 恢复音频上下文（浏览器自动播放策略）。 */
  SFX.unlock = function () {
    try {
      if (!SFX.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        SFX.ctx = new AC();
        SFX.master = SFX.ctx.createGain();
        SFX.master.gain.value = 0.5;
        SFX.comp = SFX.ctx.createDynamicsCompressor();
        SFX.comp.threshold.value = -18;
        SFX.comp.knee.value = 24;
        SFX.comp.ratio.value = 6;
        SFX.master.connect(SFX.comp);
        SFX.comp.connect(SFX.ctx.destination);
        // 预生成 1 秒白噪声 buffer
        const rate = SFX.ctx.sampleRate;
        const buf = SFX.ctx.createBuffer(1, rate, rate);
        const d = buf.getChannelData(0);
        let seed = 12345;
        for (let i = 0; i < d.length; i++) {
          seed = (seed * 1103515245 + 12345) & 0x7fffffff;
          d[i] = (seed / 0x3fffffff) - 1;
        }
        SFX.noiseBuf = buf;
        SFX.ready = true;
      }
      if (SFX.ctx.state === 'suspended') SFX.ctx.resume();
    } catch (err) {
      SFX.ready = false;
    }
  };

  SFX.toggleMute = function () {
    SFX.muted = !SFX.muted;
    if (SFX.master) SFX.master.gain.value = SFX.muted ? 0 : 0.5;
    return SFX.muted;
  };

  function now() {
    return SFX.ctx ? SFX.ctx.currentTime : 0;
  }

  /** 振荡器音符：type 波形，f0→f1 频率滑音，dur 时长，vol 音量，delay 延迟。 */
  function tone(type, f0, f1, dur, vol, delay, dest) {
    if (!SFX.ready || SFX.muted) return;
    const t = now() + (delay || 0);
    const osc = SFX.ctx.createOscillator();
    const g = SFX.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, f0), t);
    if (f1 && f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + Math.min(0.012, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(dest || SFX.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** 噪声层：type 滤波类型，f0→f1 截止频率扫频。 */
  function noise(dur, vol, type, f0, f1, delay, q) {
    if (!SFX.ready || SFX.muted) return;
    const t = now() + (delay || 0);
    const src = SFX.ctx.createBufferSource();
    src.buffer = SFX.noiseBuf;
    src.playbackRate.value = 1;
    const filt = SFX.ctx.createBiquadFilter();
    filt.type = type || 'bandpass';
    filt.frequency.setValueAtTime(Math.max(30, f0), t);
    if (f1 && f1 !== f0) filt.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    filt.Q.value = q || 1;
    const g = SFX.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(SFX.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /** 播放命名音效。 */
  SFX.play = function (name) {
    if (!SFX.ready || SFX.muted) return;
    switch (name) {
      case 'light':
        tone('square', 620, 300, 0.07, 0.16);
        noise(0.06, 0.12, 'highpass', 1800, 900, 0, 1);
        break;
      case 'heavy':
        tone('sawtooth', 160, 55, 0.2, 0.24);
        noise(0.14, 0.2, 'lowpass', 1200, 200, 0, 1);
        break;
      case 'slash':
        noise(0.16, 0.22, 'bandpass', 5200, 700, 0, 1.4);
        tone('triangle', 1400, 420, 0.1, 0.08);
        break;
      case 'fire':
        noise(0.3, 0.18, 'lowpass', 900, 160, 0, 0.7);
        tone('sine', 220, 90, 0.22, 0.07);
        break;
      case 'holy':
        tone('sine', 660, 1320, 0.3, 0.14);
        tone('sine', 990, 1980, 0.3, 0.09, 0.03);
        tone('triangle', 1320, 2640, 0.24, 0.06, 0.06);
        break;
      case 'dark':
        tone('sine', 130, 60, 0.35, 0.16);
        tone('sawtooth', 190, 70, 0.3, 0.09, 0.02);
        noise(0.35, 0.1, 'lowpass', 500, 120, 0, 1);
        break;
      case 'arrow':
        noise(0.1, 0.16, 'bandpass', 3200, 1400, 0, 2);
        tone('triangle', 900, 1500, 0.06, 0.07);
        break;
      case 'block':
        tone('square', 320, 180, 0.09, 0.16);
        noise(0.08, 0.16, 'bandpass', 2200, 1200, 0, 2);
        break;
      case 'perfect':
        tone('triangle', 1200, 2400, 0.12, 0.18);
        tone('sine', 1800, 3000, 0.16, 0.12, 0.04);
        break;
      case 'ko':
        tone('sawtooth', 240, 34, 0.9, 0.24);
        noise(0.7, 0.16, 'lowpass', 900, 60, 0, 0.8);
        break;
      case 'charge':
        tone('sawtooth', 90, 420, 0.6, 0.1);
        break;
      case 'meteor':
        noise(0.5, 0.2, 'lowpass', 1600, 80, 0, 0.8);
        tone('sine', 110, 40, 0.45, 0.16);
        break;
      case 'summon':
        tone('sine', 300, 120, 0.4, 0.12);
        noise(0.4, 0.1, 'lowpass', 700, 150, 0, 1);
        break;
      case 'ui':
        tone('square', 880, 1200, 0.06, 0.1);
        break;
      case 'uiBack':
        tone('square', 420, 260, 0.08, 0.1);
        break;
      case 'uiPick':
        tone('triangle', 660, 990, 0.12, 0.13);
        tone('sine', 1320, 1760, 0.14, 0.08, 0.05);
        break;
      case 'tick':
        tone('square', 1500, 1500, 0.04, 0.08);
        break;
      case 'fight':
        tone('sawtooth', 180, 720, 0.28, 0.18);
        noise(0.3, 0.14, 'highpass', 900, 3000, 0, 1);
        break;
      case 'jump':
        tone('sine', 300, 620, 0.09, 0.07);
        break;
      case 'dash':
        noise(0.14, 0.14, 'bandpass', 700, 2600, 0, 1.6);
        break;
      case 'land':
        noise(0.1, 0.12, 'lowpass', 500, 120, 0, 1);
        break;
      case 'heal':
        tone('sine', 520, 1040, 0.25, 0.1);
        tone('sine', 780, 1560, 0.25, 0.07, 0.08);
        break;
      default:
        tone('square', 520, 320, 0.07, 0.1);
        break;
    }
  };

  BVN.Sfx = SFX;
})(window.BVN);

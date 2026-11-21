const muteKey = 'inspection-shift-mute';
let receivedGesture = false;
let muted;
let audio;
let master;
let noise;
let phoneCall = null;
let ringOutput = null;
let ringVersion = 0;

export function bindAudio(page) {
  const captureGesture = (event) => {
    if (event.isTrusted) receivedGesture = true;
  };
  for (const event of ['pointerdown', 'touchstart', 'keydown', 'click']) {
    page.addEventListener(event, captureGesture, { capture: true, passive: true });
  }
  page.addEventListener('visibilitychange', refreshPhoneRing);
  page.defaultView.addEventListener('pagehide', silencePhoneRing);
  page.defaultView.addEventListener('pageshow', () => {
    if (!ringOutput) refreshPhoneRing();
  });
}

export function isMuted() {
  if (muted === undefined) {
    try {
      muted = globalThis.localStorage?.getItem(muteKey) === 'true';
    } catch {
      muted = false;
    }
  }
  return muted;
}

export function setMuted(value) {
  const changed = isMuted() !== Boolean(value);
  muted = Boolean(value);
  try {
    globalThis.localStorage?.setItem(muteKey, String(muted));
  } catch {
    // Private or embedded windows may not expose writable storage.
  }
  if (master && audio.state !== 'closed') {
    const now = audio.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setTargetAtTime(muted ? 0 : 0.2, now, 0.012);
  }
  if (changed) refreshPhoneRing();
  return muted;
}

function audioAvailable() {
  return !isMuted() && !globalThis.document?.hidden;
}

async function getAudio() {
  if (!audioAvailable()) return null;
  const view = globalThis.window;
  const AudioContext = view?.AudioContext ?? view?.webkitAudioContext;
  if (!AudioContext || (!receivedGesture && !view.navigator.userActivation?.hasBeenActive)) return null;
  try {
    if (!audio || audio.state === 'closed') {
      audio = new AudioContext();
      master = audio.createGain();
      master.gain.value = 0.2;
      const limiter = audio.createDynamicsCompressor();
      limiter.threshold.value = -15;
      limiter.knee.value = 13;
      limiter.ratio.value = 7;
      limiter.attack.value = 0.004;
      limiter.release.value = 0.09;
      master.connect(limiter);
      limiter.connect(audio.destination);
      noise = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
      const samples = noise.getChannelData(0);
      let trail = 0;
      for (let index = 0; index < samples.length; index++) {
        const white = Math.random() * 2 - 1;
        trail = 0.8 * trail + 0.2 * white;
        samples[index] = 0.74 * white + 0.26 * trail;
      }
    }
    if (audio.state !== 'running') await audio.resume();
    return audio.state === 'running' && audioAvailable() ? audio : null;
  } catch {
    // The app remains fully usable when audio is disabled by the browser.
    return null;
  }
}

function envelope(ctx, start, duration, volume, attack, output) {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  gain.connect(output);
  return gain;
}

function tone(ctx, time, { from, to = from, duration, level, type = 'sine', attack = 0.004 }, output = master) {
  const osc = ctx.createOscillator();
  const gain = envelope(ctx, time, duration, level, attack, output);
  osc.type = type;
  osc.frequency.setValueAtTime(from, time);
  if (from !== to) osc.frequency.exponentialRampToValueAtTime(to, time + duration);
  osc.connect(gain);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
  osc.start(time);
  osc.stop(time + duration);
}

function rustle(ctx, time, { from, to = from, duration, level, q = 0.8, attack = 0.004 }, output = master) {
  const source = ctx.createBufferSource();
  source.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, time);
  if (to !== from) filter.frequency.exponentialRampToValueAtTime(to, time + duration);
  const gain = envelope(ctx, time, duration, level, attack, output);
  source.connect(filter);
  filter.connect(gain);
  source.onended = () => {
    source.disconnect();
    filter.disconnect();
    gain.disconnect();
  };
  source.start(time, Math.random() * (1 - duration), duration);
}

function wood(ctx, time, strength = 1) {
  tone(ctx, time, { from: 122, to: 56, duration: 0.095, level: 0.34 * strength });
  rustle(ctx, time, { from: 460, to: 280, duration: 0.092, level: 0.56 * strength, q: 0.65 });
  rustle(ctx, time + 0.004, { from: 1980, to: 1130, duration: 0.034, level: 0.29 * strength });
}

function deskBell(ctx, time, level = 1) {
  tone(ctx, time, { from: 789, duration: 0.44, level: 0.25 * level });
  tone(ctx, time, { from: 1593, duration: 0.28, level: 0.16 * level });
  tone(ctx, time, { from: 2425, duration: 0.16, level: 0.07 * level });
  rustle(ctx, time, { from: 2550, duration: 0.04, level: 0.12 * level });
}

function footfall(ctx, time, strength) {
  tone(ctx, time, { from: 109, to: 63, duration: 0.073, level: 0.13 * strength, attack: 0.01 });
  rustle(ctx, time, { from: 540, to: 300, duration: 0.085, level: 0.21 * strength, q: 0.65, attack: 0.014 });
}

function deliverPapers(ctx, time, delay = 0) {
  rustle(ctx, time + delay + 0.018, { from: 1420, to: 840, duration: 0.205, level: 0.23, attack: 0.022 });
  rustle(ctx, time + delay + 0.084, { from: 2840, to: 1580, duration: 0.175, level: 0.18, attack: 0.02 });
  rustle(ctx, time + 0.235, { from: 2130, to: 1050, duration: 0.105, level: 0.14, attack: 0.011 });
  wood(ctx, time + 0.352, 0.15);
}

const effects = {
  paper(ctx, time) {
    rustle(ctx, time, { from: 2450, to: 1050, duration: 0.135, level: 0.34, attack: 0.016 });
    rustle(ctx, time + 0.03, { from: 3800, to: 2220, duration: 0.072, level: 0.2 });
  },
  delivery(ctx, time) {
    deliverPapers(ctx, time);
  },
  arrival(ctx, time) {
    footfall(ctx, time, 0.68);
    footfall(ctx, time + 0.083, 0.94);
    deliverPapers(ctx, time, 0.10);
  },
  handover(ctx, time) {
    rustle(ctx, time + 0.02, { from: 3120, to: 1680, duration: 0.115, level: 0.25, attack: 0.012 });
    rustle(ctx, time + 0.108, { from: 1830, to: 920, duration: 0.112, level: 0.14, attack: 0.022 });
    rustle(ctx, time + 0.329, { from: 2160, to: 820, duration: 0.063, level: 0.18, attack: 0.008 });
    tone(ctx, time + 0.348, { from: 153, to: 75, duration: 0.043, level: 0.07 });
  },
  cargo(ctx, time, route) {
    if (route === 'held') {
      rustle(ctx, time + 0.04, { from: 850, to: 420, duration: 0.40, level: 0.23, q: 0.66, attack: 0.065 });
      rustle(ctx, time + 0.23, { from: 1330, to: 560, duration: 0.23, level: 0.13, attack: 0.03 });
      wood(ctx, time + 0.548, 0.20);
      return;
    }
    rustle(ctx, time + 0.064, { from: 450, to: 305, duration: 0.625, level: 0.22, q: 0.52, attack: 0.10 });
    rustle(ctx, time + 0.203, { from: 1010, to: 520, duration: 0.385, level: 0.13, q: 0.63, attack: 0.055 });
    tone(ctx, time + 0.19, { from: 91, to: 73, duration: 0.37, level: 0.06, attack: 0.06 });
  },
  bell: deskBell,
  stamp(ctx, time) {
    wood(ctx, time);
    rustle(ctx, time + 0.085, { from: 1650, to: 650, duration: 0.075, level: 0.27 });
  },
  print(ctx, time) {
    wood(ctx, time);
    tone(ctx, time + 0.042, { from: 187, to: 124, duration: 0.125, level: 0.11, type: 'triangle', attack: 0.014 });
    for (let tooth = 0; tooth < 3; tooth++) {
      rustle(ctx, time + 0.055 + tooth * 0.038, { from: 1540, to: 810, duration: 0.038, level: 0.19 - tooth * 0.03 });
    }
    rustle(ctx, time + 0.142, { from: 2360, to: 1250, duration: 0.068, level: 0.15, attack: 0.011 });
  },
  ring(ctx, time, output) {
    for (const [delay, pitch, overtone] of [[0, 1035, 1740], [0.10, 1175, 1940], [0.49, 1035, 1740], [0.59, 1175, 1940]]) {
      const strike = time + delay;
      tone(ctx, strike, { from: pitch, duration: 0.206, level: 0.21, type: 'triangle' }, output);
      tone(ctx, strike, { from: overtone, duration: 0.132, level: 0.102 }, output);
      rustle(ctx, strike, { from: 2760, to: 1520, duration: 0.033, level: 0.13 }, output);
    }
  },
  dialTone(ctx, time) {
    tone(ctx, time, { from: 425, duration: .125, level: .22, attack: .012 });
  },
  click(ctx, time) {
    rustle(ctx, time, { from: 1450, to: 510, duration: 0.035, level: 0.3 });
    tone(ctx, time, { from: 185, to: 96, duration: 0.044, level: 0.21 });
  },
  clasp(ctx, time) {
    rustle(ctx, time, { from: 1650, to: 2450, duration: 0.052, level: 0.2 });
    tone(ctx, time + 0.024, { from: 740, to: 290, duration: 0.033, level: 0.23 });
  },
  tug(ctx, time) {
    rustle(ctx, time, { from: 880, to: 490, duration: 0.087, level: 0.24, attack: 0.014 });
  },
  claspRelease(ctx, time) {
    rustle(ctx, time, { from: 1880, to: 970, duration: 0.068, level: 0.27, attack: 0.008 });
    tone(ctx, time + 0.037, { from: 460, to: 235, duration: 0.078, level: 0.18 });
  },
  shutter(ctx, time) {
    rustle(ctx, time, { from: 920, to: 330, duration: 0.47, level: 0.43, attack: 0.06 });
    for (let step = 0; step < 5; step++) wood(ctx, time + 0.05 + step * 0.072, 0.22 + step * 0.04);
    wood(ctx, time + 0.43, 0.61);
  },
  slide(ctx, time) {
    rustle(ctx, time, { from: 1020, to: 410, duration: 0.22, level: 0.32, attack: 0.03 });
    wood(ctx, time + 0.185, 0.18);
  },
  knock(ctx, time) {
    wood(ctx, time, .44);
    wood(ctx, time + .095, .34);
  },
  ok(ctx, time) {
    tone(ctx, time, { from: 392, duration: 0.17, level: 0.16 });
    tone(ctx, time + 0.073, { from: 523.25, duration: 0.24, level: 0.18 });
  },
};

function silencePhoneRing() {
  ringVersion++;
  ringOutput?.disconnect();
  ringOutput = null;
}

async function startPhoneRing(version) {
  const ctx = await getAudio();
  if (!ctx || version !== ringVersion) return;
  ringOutput = ctx.createGain();
  ringOutput.connect(master);
  effects.ring(ctx, ctx.currentTime + 0.012, ringOutput);
}

function refreshPhoneRing() {
  silencePhoneRing();
  if (phoneCall) void startPhoneRing(ringVersion);
}

export function setPhoneRinging(key) {
  if (key === phoneCall) return;
  phoneCall = key;
  refreshPhoneRing();
}

export async function playSound(kind, detail) {
  if (!Object.prototype.hasOwnProperty.call(effects, kind)) return false;
  const ctx = await getAudio();
  if (!ctx) return false;
  effects[kind](ctx, ctx.currentTime + 0.012, detail);
  return true;
}

const bindings = new WeakMap();

function fullscreenElement(page) {
  return page.fullscreenElement ?? page.webkitFullscreenElement ?? null;
}

function viewportSize(view) {
  const visual = view.visualViewport;
  const atNormalZoom = visual && Math.abs(visual.scale - 1) < 0.02;
  return {
    width: Math.round(atNormalZoom ? visual.width : view.innerWidth),
    height: Math.round(atNormalZoom ? visual.height : view.innerHeight),
    left: atNormalZoom ? visual.offsetLeft : 0,
    top: atNormalZoom ? visual.offsetTop : 0,
  };
}

function scrollParent(target, shell, axis, view) {
  for (let element = target; element && shell.contains(element); element = element.parentElement) {
    const style = view.getComputedStyle(element);
    const vertical = axis === 'y';
    const overflow = vertical ? style.overflowY : style.overflowX;
    const canScroll = vertical
      ? element.scrollHeight > element.clientHeight
      : element.scrollWidth > element.clientWidth;
    if (canScroll && ['auto', 'scroll'].includes(overflow)) return element;
  }
  return null;
}

/** Convert screen coordinates to coordinates in the game shell. */
export function stagePoint(shell, clientX, clientY) {
  const bounds = shell.getBoundingClientRect();
  return shell.dataset.rotated === 'true'
    ? { x: clientY - bounds.top, y: bounds.right - clientX }
    : { x: clientX - bounds.left, y: clientY - bounds.top };
}

/**
 * Bind the viewport to a persistent game shell. Normal portrait phones display
 * the board clockwise while the browser remains in its current orientation.
 */
export function bindViewport(root, onChange) {
  bindings.get(root)?.dispose();
  const page = root.ownerDocument;
  const view = page.defaultView;
  const coarse = view.matchMedia('(pointer: coarse)');
  const mobile = /Android|iPhone|iPod|iPad/i.test(view.navigator.userAgent)
    || (view.navigator.platform === 'MacIntel' && view.navigator.maxTouchPoints > 1);
  let immersive = false;
  let frame = 0;
  let previous;
  let previousScreen;
  let touch;
  const off = [];

  function listen(target, event, handler, options) {
    if (!target?.addEventListener) return;
    target.addEventListener(event, handler, options);
    off.push(() => target.removeEventListener(event, handler, options));
  }

  function sync() {
    frame = 0;
    const screen = viewportSize(view);
    const fullscreen = Boolean(fullscreenElement(page));
    if (fullscreen) immersive = false;
    const rotated = screen.height > screen.width
      && (mobile || (coarse.matches && screen.width <= 650));
    const state = {
      width: rotated ? screen.height : screen.width,
      height: rotated ? screen.width : screen.height,
      rotated,
      fullscreen,
      immersive,
    };

    if (!previousScreen || ['width', 'height', 'left', 'top'].some(key => screen[key] !== previousScreen[key])) {
      root.style.setProperty('--screen-width', `${screen.width}px`);
      root.style.setProperty('--screen-height', `${screen.height}px`);
      root.style.setProperty('--screen-left', `${screen.left}px`);
      root.style.setProperty('--screen-top', `${screen.top}px`);
      previousScreen = screen;
    }
    if (!previous || Object.keys(state).some(key => state[key] !== previous[key])) {
      root.style.setProperty('--stage-width', `${state.width}px`);
      root.style.setProperty('--stage-height', `${state.height}px`);
      root.dataset.rotated = String(rotated);
      root.dataset.fullscreen = String(fullscreen || immersive);
      root.dataset.immersive = String(immersive);
      page.documentElement.toggleAttribute('data-shift-rotated', rotated);
      page.documentElement.toggleAttribute('data-shift-immersive', immersive);
      previous = state;
      onChange?.(state);
    }
    return state;
  }

  function scheduleSync() {
    if (!frame) frame = view.requestAnimationFrame(sync);
  }

  function clearTouch() {
    touch = undefined;
  }

  function startTouch(event) {
    clearTouch();
    if (!previous?.rotated || event.touches.length !== 1 || !(event.target instanceof view.Element)) return;
    if (event.target.closest('[data-drag], input, select, textarea, [contenteditable="true"]')) return;
    const finger = event.touches[0];
    touch = { target: event.target, x: finger.clientX, y: finger.clientY };
  }

  function moveTouch(event) {
    if (!touch || event.touches.length !== 1) return;
    const finger = event.touches[0];
    const dx = finger.clientX - touch.x;
    const dy = finger.clientY - touch.y;
    if (!touch.axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
      touch.axis = Math.abs(dx) >= Math.abs(dy) ? 'y' : 'x';
      touch.scroller = scrollParent(touch.target, root, touch.axis, view);
    }
    if (!touch.scroller) return;
    if (touch.axis === 'y') touch.scroller.scrollTop += dx;
    else touch.scroller.scrollLeft -= dy;
    touch.x = finger.clientX;
    touch.y = finger.clientY;
    if (event.cancelable) event.preventDefault();
  }

  function captureGesture(event) {
    if (event.isTrusted) receivedGesture = true;
  }

  listen(view, 'resize', scheduleSync);
  listen(view, 'orientationchange', scheduleSync);
  listen(view.screen.orientation, 'change', scheduleSync);
  listen(view.visualViewport, 'resize', scheduleSync);
  listen(view.visualViewport, 'scroll', scheduleSync);
  listen(coarse, 'change', scheduleSync);
  listen(page, 'fullscreenchange', scheduleSync);
  listen(page, 'webkitfullscreenchange', scheduleSync);
  listen(page, 'keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented || !immersive) return;
    if (root.querySelector('dialog[open], [aria-modal="true"]:not([hidden])')) return;
    immersive = false;
    scheduleSync();
  });
  listen(page, 'pointerdown', captureGesture, { capture: true, passive: true });
  listen(page, 'touchstart', captureGesture, { capture: true, passive: true });
  listen(page, 'keydown', captureGesture, { capture: true });
  listen(root, 'touchstart', startTouch, { passive: true });
  listen(root, 'touchmove', moveTouch, { passive: false });
  listen(root, 'touchend', clearTouch);
  listen(root, 'touchcancel', clearTouch);

  function dispose() {
    off.forEach(remove => remove());
    if (frame) view.cancelAnimationFrame(frame);
    page.documentElement.removeAttribute('data-shift-rotated');
    page.documentElement.removeAttribute('data-shift-immersive');
    delete root.dataset.rotated;
    delete root.dataset.immersive;
    delete root.dataset.fullscreen;
    bindings.delete(root);
  }

  bindings.set(root, {
    dispose,
    update() {
      if (frame) view.cancelAnimationFrame(frame);
      return sync();
    },
    setImmersive(value) {
      immersive = value;
    },
    get immersive() {
      return immersive;
    },
  });
  sync();
  return dispose;
}

/** Try browser fullscreen and fall back to an immersive in-page board. */
export async function toggleFullscreen(root) {
  if (!bindings.has(root)) bindViewport(root);
  const binding = bindings.get(root);
  const page = root.ownerDocument;
  if (fullscreenElement(page)) {
    const exit = page.exitFullscreen ?? page.webkitExitFullscreen;
    try {
      await exit?.call(page);
    } catch {
      // The browser may already have left fullscreen.
    }
    return binding.update();
  }
  if (binding.immersive) {
    binding.setImmersive(false);
    return binding.update();
  }

  const target = page.documentElement;
  const enter = target.requestFullscreen ?? target.webkitRequestFullscreen;
  if (enter) {
    try {
      await enter.call(target);
      return binding.update();
    } catch {
      // Embedded mobile browsers sometimes expose this method but decline it.
    }
  }
  binding.setImmersive(true);
  return binding.update();
}

const muteKey = 'inspection-shift-mute';
let receivedGesture = false;
let muted;
let audio;
let master;
let noise;

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
  return muted;
}

async function getAudio() {
  if (isMuted()) return null;
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
    return audio.state === 'running' && !isMuted() ? audio : null;
  } catch {
    // The app remains fully usable when audio is disabled by the browser.
    return null;
  }
}

function envelope(ctx, start, duration, volume, attack) {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  gain.connect(master);
  return gain;
}

function tone(ctx, time, { from, to = from, duration, level, type = 'sine', attack = 0.004 }) {
  const osc = ctx.createOscillator();
  const gain = envelope(ctx, time, duration, level, attack);
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

function rustle(ctx, time, { from, to = from, duration, level, q = 0.8, attack = 0.004 }) {
  const source = ctx.createBufferSource();
  source.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, time);
  if (to !== from) filter.frequency.exponentialRampToValueAtTime(to, time + duration);
  const gain = envelope(ctx, time, duration, level, attack);
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

const effects = {
  paper(ctx, time) {
    rustle(ctx, time, { from: 2450, to: 1050, duration: 0.135, level: 0.34, attack: 0.016 });
    rustle(ctx, time + 0.03, { from: 3800, to: 2220, duration: 0.072, level: 0.2 });
  },
  bell: deskBell,
  stamp(ctx, time) {
    wood(ctx, time);
    rustle(ctx, time + 0.085, { from: 1650, to: 650, duration: 0.075, level: 0.27 });
  },
  ring(ctx, time) {
    deskBell(ctx, time, 0.7);
    deskBell(ctx, time + 0.14, 0.64);
    deskBell(ctx, time + 0.56, 0.7);
    deskBell(ctx, time + 0.7, 0.64);
  },
  click(ctx, time) {
    rustle(ctx, time, { from: 1450, to: 510, duration: 0.035, level: 0.3 });
    tone(ctx, time, { from: 185, to: 96, duration: 0.044, level: 0.21 });
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
  ok(ctx, time) {
    tone(ctx, time, { from: 392, duration: 0.17, level: 0.16 });
    tone(ctx, time + 0.073, { from: 523.25, duration: 0.24, level: 0.18 });
  },
};

export async function playSound(kind) {
  if (!Object.prototype.hasOwnProperty.call(effects, kind)) return false;
  const ctx = await getAudio();
  if (!ctx) return false;
  effects[kind](ctx, ctx.currentTime + 0.012);
  return true;
}

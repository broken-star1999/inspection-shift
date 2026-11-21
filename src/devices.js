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

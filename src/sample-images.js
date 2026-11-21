const images = new Map();

export function sampleImage(path, ownerDocument) {
  const url = new URL(path, ownerDocument.baseURI).href;
  let image = images.get(url);
  if (!image) {
    image = ownerDocument.createElement('img');
    image.decoding = 'async';
    image.draggable = false;
    image.src = url;
    images.set(url, image);
  }
  return image;
}

export function updateSampleImage(image, state = image.complete ? (image.naturalWidth ? 'ready' : 'failed') : 'loading') {
  const object = image.parentElement;
  if (!object?.hasAttribute('data-sample-art') || object.dataset.imageState === state) return;
  object.dataset.imageState = state;
  const notice = object.parentElement.querySelector('.sample-image-notice');
  if (!notice) return;
  const retry = notice.querySelector('[data-act="sample-image-retry"]');
  const status = notice.querySelector('[role="status"]');
  const side = object.dataset.sampleSide;
  notice.hidden = state === 'ready';
  retry.disabled = retry.hidden = state !== 'failed';
  status.textContent = state === 'ready' ? '' : state === 'failed' ? `${side}图未能加载` : `正在加载${side}图…`;
}

export function mountSampleImage(object) {
  if (!object) return;
  const image = sampleImage(object.dataset.sampleArt, object.ownerDocument);
  image.alt = object.dataset.sampleAlt;
  object.prepend(image);
  updateSampleImage(image);
}

export function retrySampleImage(stage) {
  const image = stage?.querySelector('[data-image-state="failed"] > img');
  if (!image) return;
  const retry = stage.querySelector('[data-act="sample-image-retry"]');
  if (retry === image.ownerDocument.activeElement) stage.focus({ preventScroll: true });
  const url = new URL(image.src);
  url.searchParams.set('retry', Date.now().toString());
  image.src = url.href;
  updateSampleImage(image, 'loading');
}

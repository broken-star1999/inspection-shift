const epsilon = 1e-10;

/** Build a screen-to-desk mapper from screen corners in TL, TR, BR, BL order. */
export function createDeskProjection(corners, width, height) {
  if (corners?.length !== 4 || !Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return null;
  if (corners.some((point) => !Number.isFinite(point?.x) || !Number.isFinite(point?.y))) return null;

  // Translate away the screen origin before building a unit-square homography.
  const [origin, ...edges] = corners;
  const [top, opposite, left] = edges.map(({ x, y }) => ({ x: x - origin.x, y: y - origin.y }));
  const dx1 = top.x - opposite.x;
  const dx2 = left.x - opposite.x;
  const dy1 = top.y - opposite.y;
  const dy2 = left.y - opposite.y;
  const size = Math.max(1, Math.abs(top.x), Math.abs(top.y), Math.abs(left.x), Math.abs(left.y));
  const tolerance = size * size * epsilon;
  const across = dx1 * dy2 - dx2 * dy1;
  const adjacent = top.x * left.y - left.x * top.y;
  if (Math.abs(across) <= tolerance || Math.abs(adjacent) <= tolerance) return null;

  const dx = opposite.x - top.x - left.x;
  const dy = opposite.y - top.y - left.y;
  const g = (dx * dy2 - dx2 * dy) / across;
  const h = (dx1 * dy - dx * dy1) / across;
  const a = top.x * (1 + g);
  const b = left.x * (1 + h);
  const d = top.y * (1 + g);
  const e = left.y * (1 + h);

  return (clientX, clientY) => {
    const x = clientX - origin.x;
    const y = clientY - origin.y;
    // Rearrange the two projective equations, then solve for unit desk u, v.
    const ax = a - x * g;
    const bx = b - x * h;
    const dy = d - y * g;
    const ey = e - y * h;
    const determinant = ax * ey - bx * dy;
    if (Math.abs(determinant) <= tolerance) {
      // A pointer far outside the desk can reach the projective horizon.
      return {
        x: width * (x * left.y - y * left.x) / adjacent,
        y: height * (top.x * y - top.y * x) / adjacent,
      };
    }
    return {
      x: width * (x * ey - bx * y) / determinant,
      y: height * (ax * y - x * dy) / determinant,
    };
  };
}

export function captureDeskProjection(desk) {
  const width = desk?.clientWidth;
  const height = desk?.clientHeight;
  if (!width || !height || !desk.ownerDocument) return null;

  const document = desk.ownerDocument;
  const fragment = document.createDocumentFragment();
  const markers = [[0, 0], [width, 0], [width, height], [0, height]].map(([left, top]) => {
    const marker = document.createElement('span');
    marker.setAttribute('aria-hidden', 'true');
    Object.assign(marker.style, {
      position: 'absolute',
      display: 'block',
      left: `${left}px`,
      top: `${top}px`,
      width: '0',
      height: '0',
      padding: '0',
      border: '0',
      margin: '0',
      transform: 'none',
      visibility: 'hidden',
      pointerEvents: 'none',
    });
    fragment.append(marker);
    return marker;
  });

  desk.append(fragment);
  try {
    const corners = markers.map((marker) => {
      const { left, top } = marker.getBoundingClientRect();
      return { x: left, y: top };
    });
    return createDeskProjection(corners, width, height);
  } finally {
    markers.forEach((marker) => marker.remove());
  }
}

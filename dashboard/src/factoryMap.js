export const STORAGE_KEY = 'live_tracking_factory_bounds';

/** Denah per gedung — tampil bareng, kalibrasi terpisah. */
export const FLOORPLANS = [
  {
    id: 'gedung-utama',
    label: 'Gedung Utama',
    url: '/maps/factory-floor.svg',
    imageSize: { width: 1024, height: 576 },
  },
  {
    id: 'gm1',
    label: 'GM1',
    url: '/maps/gm1.svg',
    imageSize: { width: 1024, height: 576 },
  },
  {
    id: 'gm2',
    label: 'GM2',
    url: '/maps/gm2.svg',
      imageSize: { width: 1024, height: 576 },
    },
  {
    id: 'gm3',
    label: 'GM3',
    url: '/maps/gm3.svg',
    imageSize: { width: 1024, height: 576 },
  },
];

export const DEFAULT_OVERLAY_ID = FLOORPLANS[0].id;

/** @deprecated gunakan FLOORPLANS */
export const FLOORPLAN_URL = FLOORPLANS[0].url;
export const IMAGE_SIZE = FLOORPLANS[0].imageSize;

/** Posisi ruang Robotic di denah utama (0-1, dari kiri/atas). */
export const ROBOTIC_ANCHOR = { x: 0.11, y: 0.4 };

export function getFloorplan(id) {
  return FLOORPLANS.find((plan) => plan.id === id) || FLOORPLANS[0];
}

export function normalizeRotation(deg) {
  let value = ((Number(deg) || 0) + 180) % 360;
  if (value < 0) value += 360;
  return Number((value - 180).toFixed(1));
}

function rotatePoint(lat, lng, centerLat, centerLng, rotationDeg) {
  const dx = lng - centerLng;
  const dy = lat - centerLat;
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const x2 = dx * cos + dy * sin;
  const y2 = -dx * sin + dy * cos;
  return [centerLat + y2, centerLng + x2];
}

export function overlayCorners(bounds) {
  const rotation = Number(bounds.rotation) || 0;
  const centerLat = (bounds.south + bounds.north) / 2;
  const centerLng = (bounds.west + bounds.east) / 2;

  return {
    topLeft: rotatePoint(bounds.north, bounds.west, centerLat, centerLng, rotation),
    topRight: rotatePoint(bounds.north, bounds.east, centerLat, centerLng, rotation),
    bottomLeft: rotatePoint(bounds.south, bounds.west, centerLat, centerLng, rotation),
    bottomRight: rotatePoint(bounds.south, bounds.east, centerLat, centerLng, rotation),
  };
}

export function overlayCenter(bounds) {
  return {
    lat: (bounds.south + bounds.north) / 2,
    lng: (bounds.west + bounds.east) / 2,
  };
}

export function rotatedLatLngs(bounds) {
  const corners = overlayCorners(bounds);
  return [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
}

export function shiftBounds(bounds, dLat, dLng) {
  return {
    ...bounds,
    south: bounds.south + dLat,
    north: bounds.north + dLat,
    west: bounds.west + dLng,
    east: bounds.east + dLng,
  };
}

export function boundsFromRotatedCorners(sw, ne, rotation) {
  const centerLat = (sw.lat + ne.lat) / 2;
  const centerLng = (sw.lng + ne.lng) / 2;
  const unSw = rotatePoint(sw.lat, sw.lng, centerLat, centerLng, -rotation);
  const unNe = rotatePoint(ne.lat, ne.lng, centerLat, centerLng, -rotation);

  return {
    south: Math.min(unSw[0], unNe[0]),
    west: Math.min(unSw[1], unNe[1]),
    north: Math.max(unSw[0], unNe[0]),
    east: Math.max(unSw[1], unNe[1]),
    rotation,
  };
}

export function normalizeStoredBounds(data) {
  if (!data) return null;
  if ([data.south, data.west, data.north, data.east].some((n) => !Number.isFinite(Number(n)))) {
    return null;
  }
  const bounds = {
    south: Number(data.south),
    west: Number(data.west),
    north: Number(data.north),
    east: Number(data.east),
    rotation: normalizeRotation(data.rotation),
  };
  if (bounds.south >= bounds.north || bounds.west >= bounds.east) return null;
  return bounds;
}

/** Format lama (satu bounds) atau baru ({ id: bounds }). */
export function normalizeOverlaysMap(data) {
  if (!data) return {};

  if (Number.isFinite(Number(data.south))) {
    const single = normalizeStoredBounds(data);
    return single ? { [DEFAULT_OVERLAY_ID]: single } : {};
  }

  const raw = data.overlays && typeof data.overlays === 'object' ? data.overlays : data;
  const out = {};
  for (const plan of FLOORPLANS) {
    const bounds = normalizeStoredBounds(raw[plan.id]);
    if (bounds) out[plan.id] = bounds;
  }
  return out;
}

export function loadBoundsMap() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return normalizeOverlaysMap(JSON.parse(raw));
  } catch {
    return {};
  }
}

/** @deprecated pakai loadBoundsMap */
export function loadBounds() {
  const map = loadBoundsMap();
  return map[DEFAULT_OVERLAY_ID] || Object.values(map)[0] || null;
}

export function saveBoundsMap(boundsMap) {
  const normalized = normalizeOverlaysMap(boundsMap);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}

/** @deprecated pakai saveBoundsMap */
export function saveBounds(bounds) {
  const map = loadBoundsMap();
  const next = normalizeStoredBounds(bounds);
  if (next) {
    map[DEFAULT_OVERLAY_ID] = next;
  }
  saveBoundsMap(map);
}

export function clearBoundsMap() {
  localStorage.removeItem(STORAGE_KEY);
}

/** @deprecated pakai clearBoundsMap */
export function clearBounds() {
  clearBoundsMap();
}

export function toLatLngBounds(bounds) {
  return [
    [bounds.south, bounds.west],
    [bounds.north, bounds.east],
  ];
}

export function fromLeafletBounds(leafletBounds) {
  return {
    south: leafletBounds.getSouth(),
    west: leafletBounds.getWest(),
    north: leafletBounds.getNorth(),
    east: leafletBounds.getEast(),
  };
}

export function boundsFromRobotics(lat, lng, overlayId = DEFAULT_OVERLAY_ID) {
  const plan = getFloorplan(overlayId);
  const aspect = plan.imageSize.width / plan.imageSize.height;
  const widthMeters = overlayId === DEFAULT_OVERLAY_ID ? 320 : 160;
  const heightMeters = widthMeters / aspect;
  const latSpan = heightMeters / 111320;
  const lngSpan = widthMeters / (111320 * Math.cos((lat * Math.PI) / 180));

  const west = lng - ROBOTIC_ANCHOR.x * lngSpan;
  const north = lat + ROBOTIC_ANCHOR.y * latSpan;

  return {
    south: north - latSpan,
    west,
    north,
    east: west + lngSpan,
    rotation: 0,
  };
}

/** Bounds awal untuk denah tambahan: di sebelah denah acuan, ukuran lebih kecil. */
export function boundsNearReference(reference, overlayId) {
  const ref = normalizeStoredBounds(reference);
  if (!ref) return null;

  const latMid = (ref.south + ref.north) / 2;
  const latSpan = (ref.north - ref.south) * 0.5;
  const lngSpan = (ref.east - ref.west) * 0.5;
  const gap = (ref.east - ref.west) * 0.08;

  return {
    south: latMid - latSpan / 2,
    north: latMid + latSpan / 2,
    west: ref.east + gap,
    east: ref.east + gap + lngSpan,
    rotation: normalizeRotation(ref.rotation),
  };
}

export function boundsFromMapView(map) {
  const view = map.getBounds();
  const latSpan = view.getNorth() - view.getSouth();
  const lngSpan = view.getEast() - view.getWest();
  const pad = 0.18;

  return {
    south: view.getSouth() + latSpan * pad,
    west: view.getWest() + lngSpan * pad,
    north: view.getNorth() - latSpan * pad,
    east: view.getEast() - lngSpan * pad,
    rotation: 0,
  };
}

export function unionLatLngs(boundsList) {
  const points = [];
  for (const bounds of boundsList) {
    if (!bounds) continue;
    points.push(...rotatedLatLngs(bounds));
  }
  return points;
}

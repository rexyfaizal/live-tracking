export const STORAGE_KEY = 'live_tracking_factory_bounds';
export const FLOORPLAN_URL = '/maps/factoryfloor.png';
export const IMAGE_SIZE = { width: 1024, height: 576 };

/** Posisi ruang Robotic di denah (0-1, dari kiri/atas). */
export const ROBOTIC_ANCHOR = { x: 0.11, y: 0.4 };

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

export function loadBounds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeStoredBounds(JSON.parse(raw));
  } catch {
    return null;
  }
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

export function saveBounds(bounds) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...bounds,
      rotation: normalizeRotation(bounds.rotation),
    }),
  );
}

export function clearBounds() {
  localStorage.removeItem(STORAGE_KEY);
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

export function boundsFromRobotics(lat, lng) {
  const aspect = IMAGE_SIZE.width / IMAGE_SIZE.height;
  const widthMeters = 320;
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

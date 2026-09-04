import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../../data');
const dataFile = path.join(dataDir, 'factory-bounds.json');

/** Harus selaras dengan dashboard FLOORPLANS.id */
const KNOWN_OVERLAY_IDS = ['gedung-utama', 'gm1', 'gm2', 'gm3'];
const DEFAULT_OVERLAY_ID = 'gedung-utama';

function ensureDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function normalizeBounds(data) {
  if (!data) return null;
  const south = Number(data.south);
  const west = Number(data.west);
  const north = Number(data.north);
  const east = Number(data.east);
  let rotation = Number(data.rotation) || 0;

  if (![south, west, north, east].every((n) => Number.isFinite(n))) return null;
  if (south >= north || west >= east) return null;

  rotation = ((rotation + 180) % 360) - 180;
  if (rotation < -180) rotation += 360;

  return {
    south,
    west,
    north,
    east,
    rotation: Number(rotation.toFixed(1)),
  };
}

/** Format lama (satu objek bounds) → map per id denah. */
export function normalizeOverlaysMap(data) {
  if (!data) return {};

  if (Number.isFinite(Number(data.south))) {
    const single = normalizeBounds(data);
    return single ? { [DEFAULT_OVERLAY_ID]: single } : {};
  }

  const raw = data.overlays && typeof data.overlays === 'object' ? data.overlays : data;
  const out = {};
  for (const id of KNOWN_OVERLAY_IDS) {
    const bounds = normalizeBounds(raw[id]);
    if (bounds) out[id] = bounds;
  }
  return out;
}

export function loadFactoryBounds() {
  try {
    if (!fs.existsSync(dataFile)) return {};
    const raw = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    return normalizeOverlaysMap(raw);
  } catch {
    return {};
  }
}

export function saveFactoryBounds(input) {
  const boundsMap = normalizeOverlaysMap(input);
  if (Object.keys(boundsMap).length === 0) {
    throw new Error('Data kalibrasi tidak valid');
  }

  ensureDir();
  fs.writeFileSync(dataFile, JSON.stringify(boundsMap, null, 2));
  return boundsMap;
}

export function clearFactoryBounds() {
  if (fs.existsSync(dataFile)) {
    fs.unlinkSync(dataFile);
  }
  return true;
}

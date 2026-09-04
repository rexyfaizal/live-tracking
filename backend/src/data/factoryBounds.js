import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../../data');
const dataFile = path.join(dataDir, 'factory-bounds.json');

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

export function loadFactoryBounds() {
  try {
    if (!fs.existsSync(dataFile)) return null;
    const raw = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    return normalizeBounds(raw);
  } catch {
    return null;
  }
}

export function saveFactoryBounds(input) {
  const bounds = normalizeBounds(input);
  if (!bounds) {
    throw new Error('Data kalibrasi tidak valid');
  }

  ensureDir();
  fs.writeFileSync(dataFile, JSON.stringify(bounds, null, 2));
  return bounds;
}

export function clearFactoryBounds() {
  if (fs.existsSync(dataFile)) {
    fs.unlinkSync(dataFile);
  }
  return true;
}

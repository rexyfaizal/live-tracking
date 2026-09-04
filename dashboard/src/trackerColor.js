/** Warna tetap per tracker (online). Offline selalu abu. */
export const OFFLINE_COLOR = '#94a3b8';

const PALETTE = [
  '#0576ee', // biru
  '#ea580c', // oranye
  '#7c3aed', // ungu
  '#0891b2', // cyan
  '#db2777', // pink
  '#ca8a04', // kuning gelap
  '#16a34a', // hijau
  '#dc2626', // merah
  '#4f46e5', // indigo
  '#0d9488', // teal
];

function hashId(id) {
  const text = String(id ?? '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** Warna pin/avatar untuk userId (konsisten antar sesi). */
export function colorForTracker(userId) {
  if (userId == null || userId === '') return PALETTE[0];
  return PALETTE[hashId(userId) % PALETTE.length];
}

/** Online → warna unik; offline → abu. */
export function displayColorForTracker(userId, online) {
  return online ? colorForTracker(userId) : OFFLINE_COLOR;
}

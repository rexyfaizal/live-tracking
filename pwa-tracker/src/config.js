import { Capacitor, CapacitorHttp } from '@capacitor/core';

/** Preferensi: lokal pabrik dulu, lalu publik (MikroTik). */
const LOCAL_API_URL = (
  import.meta.env.VITE_API_URL_LOCAL ||
  import.meta.env.VITE_API_URL ||
  'http://10.5.0.107:4001'
).replace(/\/$/, '');

const PUBLIC_API_URL = (
  import.meta.env.VITE_API_URL_PUBLIC ||
  'http://103.24.148.59:4001'
).replace(/\/$/, '');

const HEALTH_TIMEOUT_MS = 2500;
const RESOLVE_CACHE_MS = 20_000;

let activeApiUrl = LOCAL_API_URL;
let lastResolvedAt = 0;
let resolveInFlight = null;

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

export function getApiCandidates() {
  const list = [LOCAL_API_URL, PUBLIC_API_URL].filter(Boolean);
  return [...new Set(list)];
}

/** URL aktif saat ini (sync). */
export function getApiUrl() {
  if (import.meta.env.DEV && !isNativeApp() && !import.meta.env.VITE_API_URL_LOCAL) {
    return window.location.origin;
  }
  return activeApiUrl;
}

export function getActiveNetworkLabel() {
  if (activeApiUrl === LOCAL_API_URL) return 'Lokal pabrik';
  if (activeApiUrl === PUBLIC_API_URL) return 'Publik';
  return activeApiUrl;
}

async function probeHealth(baseUrl) {
  const url = `${baseUrl}/health`;

  try {
    if (isNativeApp()) {
      const response = await CapacitorHttp.request({
        url,
        method: 'GET',
        connectTimeout: HEALTH_TIMEOUT_MS,
        readTimeout: HEALTH_TIMEOUT_MS,
      });
      return response.status >= 200 && response.status < 300;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });
      return response.ok;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

/**
 * Cek lokal dulu → jika gagal pakai publik.
 * Hasil di-cache singkat supaya tidak spam /health.
 */
export async function resolveApiUrl({ force = false } = {}) {
  if (!force && activeApiUrl && Date.now() - lastResolvedAt < RESOLVE_CACHE_MS) {
    return activeApiUrl;
  }

  if (resolveInFlight) {
    return resolveInFlight;
  }

  resolveInFlight = (async () => {
    const candidates = getApiCandidates();

    for (const candidate of candidates) {
      // eslint-disable-next-line no-await-in-loop
      if (await probeHealth(candidate)) {
        activeApiUrl = candidate;
        lastResolvedAt = Date.now();
        return activeApiUrl;
      }
    }

    // Keduanya gagal: tetap pakai publik sebagai default kirim (retry nanti)
    activeApiUrl = candidates[candidates.length - 1] || LOCAL_API_URL;
    lastResolvedAt = Date.now();
    return activeApiUrl;
  })();

  try {
    return await resolveInFlight;
  } finally {
    resolveInFlight = null;
  }
}

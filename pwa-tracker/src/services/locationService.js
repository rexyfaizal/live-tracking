import { CapacitorHttp, registerPlugin } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { AuthExpiredError, isAuthFailure, isTokenExpired } from '../auth.js';
import { getActiveNetworkLabel, getApiUrl, isNativeApp, resolveApiUrl } from '../config.js';

const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');

const MIN_DISTANCE_METERS = 10;
const SEND_INTERVAL_MS = 10000;
const HEARTBEAT_MS = 15000;
const GPS_RETRY_MS = 5000;
const SEND_RETRY_MS = 3000;
/** Semakin kecil = makin halus / lambat mengikuti GPS */
const SMOOTH_ALPHA = 0.28;
const STORAGE_KEY = 'tracker_sharing_enabled';

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function distanceMeters(a, b) {
  const earthRadius = 6371000;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

function normalizePosition(position) {
  // Community BackgroundGeolocation returns flat { latitude, longitude, ... }
  if (position?.coords) {
    return {
      coords: {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      },
      timestamp: position.timestamp ?? Date.now(),
    };
  }

  return {
    coords: {
      latitude: position.latitude,
      longitude: position.longitude,
      accuracy: position.accuracy,
    },
    timestamp: position.time ?? position.timestamp ?? Date.now(),
  };
}

export function isSharingEnabled() {
  return localStorage.getItem(STORAGE_KEY) === '1';
}

export function createLocationService({ token, onUpdate, onStatus, onError }) {
  let webWatchId = null;
  let backgroundWatcherId = null;
  let heartbeatTimer = null;
  let gpsRetryTimer = null;
  let sendRetryTimer = null;
  let wantsSharing = isSharingEnabled();
  let gpsActive = false;
  let lastKnownPosition = null;
  let lastSentPosition = null;
  let lastSentAt = 0;
  let smoothedPosition = null;
  let pendingPosition = null;
  let sending = false;
  let lifecycleBound = false;

  function setStatus(message) {
    onStatus?.(message);
  }

  function smoothGpsFix(raw) {
    if (!smoothedPosition) {
      smoothedPosition = { ...raw };
      return { ...smoothedPosition };
    }

    smoothedPosition = {
      lat: smoothedPosition.lat * (1 - SMOOTH_ALPHA) + raw.lat * SMOOTH_ALPHA,
      lng: smoothedPosition.lng * (1 - SMOOTH_ALPHA) + raw.lng * SMOOTH_ALPHA,
      accuracy: raw.accuracy,
      timestamp: raw.timestamp,
    };
    return { ...smoothedPosition };
  }

  function persistSharing(enabled) {
    wantsSharing = enabled;
    if (enabled) {
      localStorage.setItem(STORAGE_KEY, '1');
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  function clearGpsRetry() {
    if (gpsRetryTimer) {
      clearTimeout(gpsRetryTimer);
      gpsRetryTimer = null;
    }
  }

  function clearSendRetry() {
    if (sendRetryTimer) {
      clearTimeout(sendRetryTimer);
      sendRetryTimer = null;
    }
  }

  function clearHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  async function clearWatch() {
    if (webWatchId != null) {
      navigator.geolocation.clearWatch(webWatchId);
      webWatchId = null;
    }

    if (backgroundWatcherId != null) {
      try {
        await BackgroundGeolocation.removeWatcher({ id: backgroundWatcherId });
      } catch {
        // ignore
      }
      backgroundWatcherId = null;
    }

    gpsActive = false;
  }

  function scheduleSendRetry() {
    if (!wantsSharing || sendRetryTimer || !pendingPosition) return;

    setStatus('Koneksi putus — mengirim ulang otomatis...');
    sendRetryTimer = setTimeout(() => {
      sendRetryTimer = null;
      flushPending().catch(() => {});
    }, SEND_RETRY_MS);
  }

  async function postJson(path, body) {
    await resolveApiUrl();

    async function requestOnce(baseUrl) {
      const url = `${baseUrl}${path}`;

      // Native HTTP tetap jalan saat app di background (fetch WebView sering di-throttle)
      if (isNativeApp()) {
        const response = await CapacitorHttp.request({
          url,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          data: body ?? {},
          connectTimeout: 15000,
          readTimeout: 15000,
        });

        const data =
          typeof response.data === 'string' ? JSON.parse(response.data || '{}') : response.data;
        if (response.status === 401) {
          throw new AuthExpiredError(data?.error || 'Sesi berakhir. Silakan login ulang.');
        }
        if (response.status < 200 || response.status >= 300) {
          throw new Error(data?.error || `HTTP ${response.status}`);
        }
        return data;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body ?? {}),
      });

      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        throw new AuthExpiredError(data.error || 'Sesi berakhir. Silakan login ulang.');
      }
      if (!response.ok) {
        throw new Error(data.error || 'Gagal mengirim lokasi');
      }
      return data;
    }

    try {
      return await requestOnce(getApiUrl());
    } catch (error) {
      if (error instanceof AuthExpiredError || isAuthFailure(error)) {
        throw error;
      }

      // Gagal di jalur aktif → cek ulang lokal/publik lalu coba sekali lagi
      await resolveApiUrl({ force: true });
      setStatus(`Jalur: ${getActiveNetworkLabel()} — mencoba kirim ulang...`);
      return requestOnce(getApiUrl());
    }
  }

  async function sendLocationSafe(current, { force = false, keepalive = false } = {}) {
    const now = Date.now();

    // Keepalive: kirim titik stabil terakhir (jangan ikut noise GPS)
    if (keepalive) {
      if (!lastSentPosition) return true;
      const payload = {
        ...lastSentPosition,
        timestamp: new Date().toISOString(),
      };
      await postJson('/api/location', payload);
      lastSentAt = Date.now();
      onUpdate?.({ ...payload, sent: true, keepalive: true });
      setStatus(`Lokasi terkirim ${new Date().toLocaleTimeString('id-ID')}`);
      return true;
    }

    // Pin di server hanya pindah jika benar-benar jalan ≥ ambang
    if (lastSentPosition) {
      const moved = distanceMeters(lastSentPosition, current);
      if (moved < MIN_DISTANCE_METERS) {
        onUpdate?.({ ...current, skipped: true });
        return true;
      }
    } else if (!force) {
      // titik pertama selalu boleh
    }

    await postJson('/api/location', current);

    lastSentPosition = current;
    lastSentAt = now;
    pendingPosition = null;
    onUpdate?.({ ...current, sent: true });
    setStatus(`Lokasi terkirim ${new Date().toLocaleTimeString('id-ID')}`);
    return true;
  }

  function handleAuthExpired(error) {
    persistSharing(false);
    clearWatch().catch(() => {});
    clearHeartbeat();
    clearGpsRetry();
    clearSendRetry();
    unbindLifecycle();
    setStatus('Sesi berakhir');
    onError?.(
      error instanceof AuthExpiredError
        ? error
        : new AuthExpiredError(error?.message || 'Sesi berakhir. Silakan login ulang.'),
      { expired: true, recoverable: false },
    );
  }

  async function flushPending() {
    if (!wantsSharing || !pendingPosition || sending) return;

    sending = true;
    try {
      await sendLocationSafe(pendingPosition, { force: true });
    } catch (error) {
      if (isAuthFailure(error) || isTokenExpired(token)) {
        handleAuthExpired(error);
      } else {
        scheduleSendRetry();
      }
    } finally {
      sending = false;
    }
  }

  async function pushPosition(position, { force = false, keepalive = false } = {}) {
    if (keepalive) {
      if (isTokenExpired(token)) {
        handleAuthExpired();
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return;
      }
      if (sending) return;
      sending = true;
      try {
        await sendLocationSafe(null, { keepalive: true });
      } catch (error) {
        if (isAuthFailure(error) || isTokenExpired(token)) {
          handleAuthExpired(error);
        } else {
          scheduleSendRetry();
        }
      } finally {
        sending = false;
      }
      return;
    }

    const normalized = normalizePosition(position);
    const raw = {
      lat: normalized.coords.latitude,
      lng: normalized.coords.longitude,
      accuracy: normalized.coords.accuracy,
      timestamp: new Date(normalized.timestamp).toISOString(),
    };

    const current = smoothGpsFix(raw);
    lastKnownPosition = current;
    pendingPosition = current;

    if (isTokenExpired(token)) {
      handleAuthExpired();
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setStatus('Offline — lokasi disimpan, kirim otomatis saat online');
      onUpdate?.({ ...current, queued: true });
      return;
    }

    // Diam / goyang GPS < ambang → jangan kirim (pin di denah tetap)
    if (lastSentPosition && distanceMeters(lastSentPosition, current) < MIN_DISTANCE_METERS) {
      onUpdate?.({ ...current, skipped: true });
      return;
    }

    if (sending) return;

    sending = true;
    try {
      await sendLocationSafe(current, { force });
    } catch (error) {
      if (isAuthFailure(error) || isTokenExpired(token)) {
        handleAuthExpired(error);
      } else {
        setStatus('Gagal kirim — mencoba lagi otomatis...');
        scheduleSendRetry();
      }
    } finally {
      sending = false;
    }
  }

  function handleGpsSuccess(position) {
    clearGpsRetry();
    pushPosition(position).catch(() => scheduleSendRetry());
  }

  function handleGpsError(error) {
    if (!wantsSharing) return;

    setStatus('GPS terputus — menyambung ulang otomatis...');
    clearWatch().catch(() => {});
    clearGpsRetry();

    gpsRetryTimer = setTimeout(() => {
      gpsRetryTimer = null;
      startGpsWatch().catch(() => {});
    }, GPS_RETRY_MS);

    const message = error?.message || 'GPS sementara tidak tersedia';
    onError?.(new Error(message), { recoverable: true });
  }

  async function ensureForegroundLocationPermission() {
    const permission = await Geolocation.checkPermissions();
    if (permission.location === 'granted') return;

    const requested = await Geolocation.requestPermissions();
    if (requested.location !== 'granted' && requested.coarseLocation !== 'granted') {
      throw new Error('Izin lokasi ditolak. Aktifkan di Pengaturan HP.');
    }
  }

  async function startBackgroundGpsWatch() {
    await ensureForegroundLocationPermission();
    await clearWatch();

    backgroundWatcherId = await BackgroundGeolocation.addWatcher(
      {
        backgroundMessage: 'Live Tracker sedang membagikan lokasi Anda.',
        backgroundTitle: 'Live Tracker aktif',
        requestPermissions: true,
        stale: false,
        distanceFilter: MIN_DISTANCE_METERS,
      },
      (location, error) => {
        if (error) {
          if (error.code === 'NOT_AUTHORIZED') {
            setStatus('Izin lokasi diperlukan. Buka pengaturan HP.');
            onError?.(
              new Error('Izinkan lokasi "Sepanjang waktu" di Pengaturan aplikasi.'),
              { recoverable: true },
            );
            BackgroundGeolocation.openSettings?.();
            return;
          }

          handleGpsError(error);
          return;
        }

        if (location) {
          handleGpsSuccess(location);
        }
      },
    );

    gpsActive = true;
    setStatus('Tracking background aktif (tetap jalan saat minimize)');
  }

  function startWebGpsWatch() {
    if (!navigator.geolocation) {
      throw new Error('Perangkat tidak mendukung GPS');
    }

    if (!window.isSecureContext) {
      throw new Error('GPS butuh HTTPS. Buka https://IP-PC:6601 (bukan http)');
    }

    clearWatch();

    navigator.geolocation.getCurrentPosition(handleGpsSuccess, handleGpsError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20000,
    });

    webWatchId = navigator.geolocation.watchPosition(handleGpsSuccess, handleGpsError, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 20000,
    });

    gpsActive = true;
    setStatus('Memantau GPS...');
  }

  async function startGpsWatch() {
    if (!wantsSharing) return;

    if (isNativeApp()) {
      await startBackgroundGpsWatch();
      return;
    }

    startWebGpsWatch();
  }

  function startHeartbeat() {
    clearHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (!wantsSharing) return;

      if (pendingPosition && lastSentPosition) {
        const moved = distanceMeters(lastSentPosition, pendingPosition);
        if (moved >= MIN_DISTANCE_METERS) {
          flushPending().catch(() => {});
          return;
        }
      }

      // Tetap online di dashboard tanpa memindahkan pin
      pushPosition(null, { keepalive: true }).catch(() => scheduleSendRetry());
    }, HEARTBEAT_MS);
  }

  function handleOnline() {
    if (!wantsSharing) return;
    setStatus('Online kembali — melanjutkan kirim lokasi...');
    flushPending().catch(() => scheduleSendRetry());
  }

  function handleVisibility() {
    if (!wantsSharing || document.visibilityState !== 'visible') return;
    // Background watcher tetap jalan; hanya sinkronkan status & flush antrian
    setStatus(gpsActive ? 'Tracking background aktif' : 'Melanjutkan tracking...');
    flushPending().catch(() => scheduleSendRetry());
    if (!gpsActive) {
      startGpsWatch().catch((error) => onError?.(error, { recoverable: true }));
    }
  }

  function handleAppState({ isActive }) {
    if (!wantsSharing || !isActive) return;
    setStatus(gpsActive ? 'Tracking background aktif' : 'Melanjutkan tracking...');
    flushPending().catch(() => scheduleSendRetry());
    if (!gpsActive) {
      startGpsWatch().catch((error) => onError?.(error, { recoverable: true }));
    }
  }

  function bindLifecycle() {
    if (lifecycleBound) return;
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);

    if (isNativeApp()) {
      import('@capacitor/app').then(({ App }) => {
        App.addListener('appStateChange', handleAppState);
      });
    }

    lifecycleBound = true;
  }

  function unbindLifecycle() {
    if (!lifecycleBound) return;
    window.removeEventListener('online', handleOnline);
    document.removeEventListener('visibilitychange', handleVisibility);
    lifecycleBound = false;
  }

  async function start() {
    if (!isNativeApp() && !navigator.geolocation) {
      throw new Error('Perangkat tidak mendukung GPS');
    }

    persistSharing(true);
    bindLifecycle();
    await startGpsWatch();
    startHeartbeat();
  }

  function resume() {
    if (!wantsSharing) return false;
    bindLifecycle();
    startGpsWatch().catch((error) => onError?.(error, { recoverable: true }));
    startHeartbeat();
    flushPending().catch(() => scheduleSendRetry());
    return true;
  }

  async function stop() {
    persistSharing(false);
    await clearWatch();
    clearHeartbeat();
    clearGpsRetry();
    clearSendRetry();
    unbindLifecycle();

    if (!isTokenExpired(token)) {
      try {
        await postJson('/api/location/stop');
      } catch (error) {
        if (!isAuthFailure(error)) {
          onError?.(error, { recoverable: false });
        }
      }
    }

    lastSentPosition = null;
    lastSentAt = 0;
    lastKnownPosition = null;
    smoothedPosition = null;
    pendingPosition = null;
    setStatus('Sharing dihentikan');
  }

  return {
    start,
    stop,
    resume,
    isSharing: () => wantsSharing,
    isGpsActive: () => gpsActive,
  };
}

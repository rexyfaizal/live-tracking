<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { login, getActiveNetworkLabel, resolveApiUrl } from './api.js';
import { isAuthFailure, isTokenExpired } from './auth.js';
import { createLocationService, isSharingEnabled } from './services/locationService.js';

const token = ref(localStorage.getItem('tracker_token') || '');
const user = ref(JSON.parse(localStorage.getItem('tracker_user') || 'null'));
const username = ref('');
const password = ref('');
const error = ref('');
const status = ref('Siap');
const networkLabel = ref('-');
const sharing = ref(isSharingEnabled());
const lastPosition = ref(null);
const loading = ref(false);

let locationService = null;
let sessionTimer = null;

const isLoggedIn = computed(() => Boolean(token.value && user.value));

function saveSession(payload) {
  token.value = payload.token;
  user.value = payload.user;
  localStorage.setItem('tracker_token', payload.token);
  localStorage.setItem('tracker_user', JSON.stringify(payload.user));
}

function initLocationService() {
  locationService = createLocationService({
    token: token.value,
    onUpdate: (position) => {
      lastPosition.value = position;
      if (position.queued) {
        sharing.value = true;
      }
    },
    onStatus: (message) => {
      status.value = message;
      networkLabel.value = getActiveNetworkLabel();
      sharing.value = locationService?.isSharing() ?? false;
    },
    onError: (err, meta = {}) => {
      if (meta.expired || isAuthFailure(err)) {
        expireSession(err.message);
        return;
      }
      if (!meta.recoverable) {
        error.value = err.message;
      } else {
        error.value = '';
      }
      sharing.value = locationService?.isSharing() ?? false;
    },
  });
}

function expireSession(message = 'Sesi berakhir. Silakan login ulang.') {
  if (!token.value) return;
  logout({ silent: true });
  error.value = message;
}

function startSessionWatch() {
  stopSessionWatch();
  sessionTimer = setInterval(() => {
    if (token.value && isTokenExpired(token.value)) {
      expireSession();
    }
  }, 15000);
}

function stopSessionWatch() {
  if (sessionTimer) {
    clearInterval(sessionTimer);
    sessionTimer = null;
  }
}

async function refreshNetwork() {
  await resolveApiUrl({ force: true });
  networkLabel.value = getActiveNetworkLabel();
}

async function handleLogin() {
  loading.value = true;
  error.value = '';

  try {
    await refreshNetwork();
    const payload = await login(username.value, password.value);
    if (payload.user.role !== 'tracker') {
      throw new Error('Akun ini bukan akun tracker');
    }
    saveSession(payload);
    initLocationService();
    startSessionWatch();
    await startSharing();
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function startSharing() {
  error.value = '';
  try {
    status.value = 'Meminta izin GPS & background...';
    await locationService?.start();
    sharing.value = true;
  } catch (err) {
    sharing.value = false;
    error.value = err.message;
  }
}

async function stopSharing() {
  try {
    await locationService?.stop();
    sharing.value = false;
    status.value = 'Sharing dihentikan';
    error.value = '';
  } catch (err) {
    error.value = err.message;
  }
}

async function logout({ silent = false } = {}) {
  stopSessionWatch();

  if (sharing.value) {
    await locationService?.stop().catch(() => {});
  }

  token.value = '';
  user.value = null;
  sharing.value = false;
  locationService = null;
  lastPosition.value = null;
  localStorage.removeItem('tracker_token');
  localStorage.removeItem('tracker_user');
  localStorage.removeItem('tracker_sharing_enabled');
  if (!silent) {
    error.value = '';
  }
}

onMounted(async () => {
  await refreshNetwork();

  if (!isLoggedIn.value) return;

  if (isTokenExpired(token.value)) {
    expireSession();
    return;
  }

  initLocationService();
  startSessionWatch();

  // Setelah login tersimpan: buka app / boot tablet → lanjut tracking otomatis
  // (flag sharing tetap true selama user belum Stop / Keluar)
  if (isSharingEnabled()) {
    sharing.value = true;
    const resumed = locationService.resume();
    if (!resumed) {
      await startSharing();
    } else {
      status.value = 'Melanjutkan tracking otomatis...';
    }
  } else {
    // Sesi masih valid tapi sharing sempat off — tetap auto-start untuk tablet pabrik
    await startSharing();
  }
});

onUnmounted(() => {
  stopSessionWatch();
});
</script>

<template>
  <main class="page">
    <section v-if="!isLoggedIn" class="card">
      <h1>Live Tracker</h1>
      <p>Masuk sekali, lokasi akan terus dikirim otomatis meski koneksi sempat putus.</p>

      <div class="cert-help">
        <strong>HTTPS bergaris merah?</strong>
        <p>Normal untuk development. Tap <strong>Lanjutkan</strong> / <strong>Advanced</strong> → buka situs ini (tidak aman).</p>
        <p>GPS HP hanya jalan lewat <strong>https://</strong>, bukan http.</p>
      </div>

      <form @submit.prevent="handleLogin">
        <label>
          Username
          <input v-model="username" type="text" placeholder="budi" autocomplete="username" />
        </label>

        <label>
          Password
          <input
            v-model="password"
            type="password"
            placeholder="••••••••"
            autocomplete="current-password"
          />
        </label>

        <p v-if="error" class="error">{{ error }}</p>

        <button type="submit" :disabled="loading">
          {{ loading ? 'Memproses...' : 'Masuk & Mulai Tracking' }}
        </button>
      </form>
    </section>

    <section v-else class="card">
      <header>
        <h1>Halo, {{ user.name }}</h1>
        <button type="button" class="ghost" @click="() => logout()">Keluar</button>
      </header>

      <div class="status-box">
        <span class="dot" :class="{ active: sharing }"></span>
        <div>
          <strong>{{ sharing ? 'Tracking aktif (otomatis)' : 'Tracking nonaktif' }}</strong>
          <p>{{ status }}</p>
          <p class="net">Server: {{ networkLabel }}</p>
        </div>
      </div>

      <div v-if="lastPosition" class="coords">
        <p>Lat: {{ lastPosition.lat.toFixed(6) }}</p>
        <p>Lng: {{ lastPosition.lng.toFixed(6) }}</p>
        <p>Akurasi: {{ Math.round(lastPosition.accuracy || 0) }} m</p>
      </div>

      <p v-if="sharing" class="info">
        Tracking background aktif. Bisa <strong>minimize</strong> — lokasi tetap dikirim.
        Pastikan izin lokasi: <strong>Izinkan sepanjang waktu</strong>.
        Sesi login berlaku ~30 hari (tanpa login ulang).
      </p>

      <p v-if="error" class="error">{{ error }}</p>

      <button v-if="!sharing" type="button" class="primary" @click="startSharing">
        Mulai Share Lokasi
      </button>
      <button v-else type="button" class="danger" @click="stopSharing">
        Stop Share Lokasi
      </button>

      <p class="hint">
        Saat tracking aktif, notifikasi "Live Tracker aktif" akan muncul di status bar.
        Setelah tablet dinyalakan, app akan coba terbuka sendiri dan lanjut tracking.
        Di Xiaomi/Oppo/Vivo: aktifkan <strong>Autostart</strong> + baterai tidak dibatasi.
      </p>
    </section>
  </main>
</template>

<style scoped>
.page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 1rem;
}

.card {
  width: min(460px, 100%);
  padding: 1.5rem;
  border-radius: 18px;
  background: #1e293b;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.45);
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

h1 {
  margin: 0 0 0.5rem;
  font-size: 1.6rem;
}

p {
  margin: 0;
  color: #94a3b8;
}

form {
  display: grid;
  gap: 1rem;
  margin-top: 1.25rem;
}

label {
  display: grid;
  gap: 0.5rem;
}

input {
  padding: 0.8rem 0.95rem;
  border: 1px solid #334155;
  border-radius: 12px;
  background: #0f172a;
  color: #e2e8f0;
}

button {
  border: none;
  border-radius: 12px;
  padding: 0.9rem 1rem;
  font-weight: 600;
}

button.primary,
form button {
  background: #2563eb;
  color: white;
}

button.danger {
  background: #dc2626;
  color: white;
  width: 100%;
}

button.ghost {
  background: transparent;
  color: #94a3b8;
  padding: 0.4rem 0.6rem;
}

.status-box {
  display: flex;
  gap: 0.85rem;
  align-items: center;
  margin: 1.25rem 0;
  padding: 1rem;
  border-radius: 14px;
  background: #0f172a;
}

.dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #64748b;
}

.dot.active {
  background: #22c55e;
  box-shadow: 0 0 0 6px rgba(34, 197, 94, 0.15);
}

.net {
  margin-top: 0.25rem !important;
  font-size: 0.8rem;
  color: #7dd3fc !important;
}

.coords {
  margin-bottom: 1rem;
  padding: 0.85rem 1rem;
  border-radius: 12px;
  background: #0f172a;
}

.coords p {
  margin-bottom: 0.25rem;
  color: #cbd5e1;
  font-family: Consolas, monospace;
  font-size: 0.85rem;
}

.error {
  color: #fca5a5;
  margin: 0.75rem 0;
}

.info {
  color: #86efac;
  margin: 0.75rem 0;
  font-size: 0.9rem;
  line-height: 1.5;
}

.cert-help {
  margin: 1rem 0;
  padding: 0.85rem 1rem;
  border-radius: 12px;
  background: rgba(59, 130, 246, 0.12);
  border: 1px solid rgba(96, 165, 250, 0.35);
  font-size: 0.85rem;
  line-height: 1.5;
}

.cert-help strong {
  color: #93c5fd;
}

.cert-help p {
  margin-top: 0.35rem;
  color: #bfdbfe;
}

.hint {
  margin-top: 1rem;
  font-size: 0.85rem;
  line-height: 1.5;
}
</style>

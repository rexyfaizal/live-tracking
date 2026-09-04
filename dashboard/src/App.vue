<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { io } from 'socket.io-client';
import LoginForm from './components/LoginForm.vue';
import UserList from './components/UserList.vue';
import MapView from './components/MapView.vue';
import { createTracker, deleteTracker, fetchLocations, fetchTrackers, getSocketUrl, login } from './api.js';
import { isAuthFailure, isTokenExpired } from './auth.js';

const token = ref(localStorage.getItem('dashboard_token') || '');
const user = ref(JSON.parse(localStorage.getItem('dashboard_user') || 'null'));
const username = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);
const connectionStatus = ref('disconnected');
const trackers = ref([]);
const locations = ref([]);
const selectedUserId = ref(null);
const userListRef = ref(null);
const mapViewRef = ref(null);
const savingTracker = ref(false);
const formError = ref('');
const now = ref(new Date());
const showAdminLogin = ref(false);

let socket = null;
let visibilityHandler = null;
let locationPollTimer = null;
let sessionTimer = null;
let clockTimer = null;

const isAdmin = computed(() => Boolean(token.value && user.value?.role === 'admin'));
const onlineCount = computed(() => trackers.value.filter((item) => item.online).length);
const offlineCount = computed(() => trackers.value.length - onlineCount.value);
const lastUpdateText = computed(() => {
  const times = locations.value
    .map((item) => item.timestamp || item.updatedAt)
    .filter(Boolean)
    .map((value) => new Date(value).getTime());
  if (times.length === 0) return 'Belum ada update';
  const latest = Math.max(...times);
  const seconds = Math.max(0, Math.round((Date.now() - latest) / 1000));
  if (seconds < 5) return 'Update terakhir baru saja';
  return `Update terakhir ${seconds} detik lalu`;
});

const clockTime = computed(() =>
  now.value.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }),
);

const clockDate = computed(() =>
  now.value.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }),
);

function expireSession(message = 'Sesi admin berakhir. Silakan login ulang.') {
  if (!token.value) return;
  clearAdminSession();
  error.value = message;
  showAdminLogin.value = true;
  connectSocket();
}

function clearAdminSession() {
  stopSessionWatch();
  token.value = '';
  user.value = null;
  formError.value = '';
  localStorage.removeItem('dashboard_token');
  localStorage.removeItem('dashboard_user');
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

function startClock() {
  stopClock();
  clockTimer = setInterval(() => {
    now.value = new Date();
  }, 1000);
}

function stopClock() {
  if (clockTimer) {
    clearInterval(clockTimer);
    clockTimer = null;
  }
}

async function refreshLocations() {
  if (token.value && isTokenExpired(token.value)) {
    expireSession();
  }

  try {
    const [trackerList, locationList] = await Promise.all([
      fetchTrackers(token.value || null),
      fetchLocations(token.value || null),
    ]);

    trackers.value = trackerList;
    locations.value = locationList;
  } catch (err) {
    if (isAuthFailure(err)) {
      expireSession(err.message);
    }
  }
}

function startLocationPolling() {
  stopLocationPolling();
  refreshLocations();
  locationPollTimer = setInterval(() => {
    refreshLocations();
  }, 5000);
}

function stopLocationPolling() {
  if (locationPollTimer) {
    clearInterval(locationPollTimer);
    locationPollTimer = null;
  }
}

function saveSession(payload) {
  token.value = payload.token;
  user.value = payload.user;
  localStorage.setItem('dashboard_token', payload.token);
  localStorage.setItem('dashboard_user', JSON.stringify(payload.user));
}

async function handleLogin() {
  loading.value = true;
  error.value = '';

  try {
    const payload = await login(username.value, password.value);
    if (payload.user.role !== 'admin') {
      throw new Error('Hanya akun admin yang bisa login. Viewer tidak perlu login.');
    }
    saveSession(payload);
    error.value = '';
    showAdminLogin.value = false;
    startSessionWatch();
    connectSocket();
    await refreshLocations();
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

function logout() {
  clearAdminSession();
  error.value = '';
  showAdminLogin.value = false;
  connectSocket();
}

function updateTrackerState(location) {
  const index = trackers.value.findIndex((item) => item.id === location.userId);
  if (index === -1) return;

  trackers.value[index] = {
    ...trackers.value[index],
    online: location.online !== false,
    lat: location.lat ?? trackers.value[index].lat,
    lng: location.lng ?? trackers.value[index].lng,
    lastSeen: location.timestamp || location.updatedAt || new Date().toISOString(),
    accuracy:
      location.accuracy !== undefined ? location.accuracy : trackers.value[index].accuracy,
  };
}

function upsertLocation(location) {
  const index = locations.value.findIndex((item) => item.userId === location.userId);
  if (index === -1) {
    locations.value.push(location);
  } else {
    locations.value[index] = { ...locations.value[index], ...location };
  }

  updateTrackerState(location);
}

function connectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }

  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler);
    visibilityHandler = null;
  }

  socket = io(getSocketUrl(), {
    auth: token.value ? { token: token.value } : {},
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
  });

  socket.on('connect', () => {
    connectionStatus.value = 'connected';
  });

  socket.on('disconnect', () => {
    connectionStatus.value = 'disconnected';
  });

  socket.on('connect_error', (err) => {
    connectionStatus.value = 'disconnected';
    if (token.value && (isTokenExpired(token.value) || isAuthFailure(err))) {
      expireSession();
    }
  });

  socket.io.on('reconnect', () => {
    connectionStatus.value = 'connected';
  });

  socket.on('location_update', (payload) => {
    upsertLocation({ ...payload, online: true });
  });

  socket.on('user_offline', (payload) => {
    upsertLocation({ ...payload, online: false });
  });

  socket.on('tracker_created', (tracker) => {
    addTrackerToList(tracker);
  });

  socket.on('tracker_deleted', (payload) => {
    removeTrackerFromList(payload.userId);
  });

  socket.on('factory_bounds_updated', (bounds) => {
    mapViewRef.value?.applyRemoteBounds(bounds);
  });

  visibilityHandler = () => {
    if (document.visibilityState !== 'visible') return;
    if (token.value && isTokenExpired(token.value)) {
      expireSession();
      return;
    }
    if (socket && !socket.connected) {
      socket.connect();
    }
  };
  document.addEventListener('visibilitychange', visibilityHandler);
}

async function bootstrapDashboard() {
  if (token.value && user.value?.role !== 'admin') {
    clearAdminSession();
  }
  if (token.value && isTokenExpired(token.value)) {
    clearAdminSession();
  }

  await refreshLocations();
  connectSocket();
  startLocationPolling();
  startClock();
  if (isAdmin.value) {
    startSessionWatch();
  }
}

function handleSelectTracker(userId) {
  selectedUserId.value = userId;
}

function addTrackerToList(tracker) {
  if (trackers.value.some((item) => item.id === tracker.id)) return;

  trackers.value = [
    ...trackers.value,
    {
      ...tracker,
      online: false,
      lat: null,
      lng: null,
      lastSeen: null,
      accuracy: null,
    },
  ];
}

function removeTrackerFromList(userId) {
  trackers.value = trackers.value.filter((item) => item.id !== userId);
  locations.value = locations.value.filter((item) => item.userId !== userId);
  if (selectedUserId.value === userId) {
    selectedUserId.value = null;
  }
}

async function handleCreateTracker(payload) {
  if (!isAdmin.value) return;
  if (isTokenExpired(token.value)) {
    expireSession();
    return;
  }

  savingTracker.value = true;
  formError.value = '';

  try {
    const tracker = await createTracker(token.value, payload);
    addTrackerToList(tracker);
    userListRef.value?.resetForm();
  } catch (err) {
    if (isAuthFailure(err)) {
      expireSession(err.message);
      return;
    }
    formError.value = err.message;
  } finally {
    savingTracker.value = false;
  }
}

async function handleRemoveTracker(userId) {
  if (!isAdmin.value) return;
  if (isTokenExpired(token.value)) {
    expireSession();
    return;
  }

  formError.value = '';

  try {
    await deleteTracker(token.value, userId);
    removeTrackerFromList(userId);
  } catch (err) {
    if (isAuthFailure(err)) {
      expireSession(err.message);
      return;
    }
    formError.value = err.message;
  }
}

onMounted(async () => {
  try {
    await bootstrapDashboard();
  } catch (err) {
    error.value = err.message;
  }
});

onUnmounted(() => {
  stopSessionWatch();
  stopLocationPolling();
  stopClock();

  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler);
  }

  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }
});
</script>

<template>
  <main class="app">
    <section class="dashboard">
      <header class="topbar">
        <div class="brand">
          <div class="brand-icon" aria-hidden="true">➤</div>
          <div>
            <p class="brand-eyebrow">PT GISTEX GARMEN INDONESIA</p>
            <h1>Live Person Tracking</h1>
            <p class="role-line">
              {{ isAdmin ? `Halo, ${user.name} · Admin` : 'Mode Viewer · tanpa login' }}
            </p>
          </div>
        </div>

        <div class="topbar-actions">
          <div class="clock">
            <strong>{{ clockTime }} WIB</strong>
            <span>{{ clockDate }}</span>
          </div>
          <span class="system" :class="connectionStatus">
            <i></i>
            {{ connectionStatus === 'connected' ? 'SYSTEM ONLINE' : 'SYSTEM OFFLINE' }}
          </span>
          <button v-if="isAdmin" type="button" class="logout" @click="logout">Keluar Admin</button>
          <button v-else type="button" class="login-admin" @click="showAdminLogin = true">
            Masuk Admin
          </button>
        </div>
      </header>

      <div class="page">
        <section class="stats">
          <article class="stat-card">
            <div>
              <p>Total Tracker</p>
              <strong>{{ trackers.length }}</strong>
              <span>HP terdaftar</span>
            </div>
            <div class="stat-icon blue">👤</div>
          </article>
          <article class="stat-card">
            <div>
              <p>Sedang Live</p>
              <strong>{{ onlineCount }}</strong>
              <span>Mengirim posisi</span>
            </div>
            <div class="stat-icon green">📡</div>
          </article>
          <article class="stat-card">
            <div>
              <p>Offline</p>
              <strong>{{ offlineCount }}</strong>
              <span>Tidak terhubung</span>
            </div>
            <div class="stat-icon gray">⭘</div>
          </article>
        </section>

        <section class="workspace">
          <div class="map-panel">
            <div class="map-panel-head">
              <div>
                <h2>Live Map</h2>
                <p>{{ lastUpdateText }}</p>
              </div>
              <span class="live-pill" :class="connectionStatus">
                {{ connectionStatus === 'connected' ? 'Realtime aktif' : 'Realtime terputus' }}
              </span>
            </div>
            <MapView
              ref="mapViewRef"
              :locations="locations"
              :focus-user-id="selectedUserId"
              :is-admin="isAdmin"
              :admin-token="token"
            />
          </div>

          <UserList
            ref="userListRef"
            :trackers="trackers"
            :selected-user-id="selectedUserId"
            :saving="savingTracker"
            :form-error="formError"
            :is-admin="isAdmin"
            @select="handleSelectTracker"
            @create="handleCreateTracker"
            @remove="handleRemoveTracker"
          />
        </section>
      </div>
    </section>

    <div v-if="showAdminLogin" class="login-modal" @click.self="showAdminLogin = false">
      <LoginForm
        v-model:username="username"
        v-model:password="password"
        v-model:loading="loading"
        :error="error"
        @login="handleLogin"
      />
    </div>
  </main>
</template>

<style scoped>
.app {
  min-height: 100vh;
}

.dashboard {
  min-height: 100vh;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 1000;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 0.9rem 1.25rem;
  border-bottom: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(8px);
  box-shadow: 0 2px 12px rgba(15, 23, 42, 0.06);
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.brand-icon {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: var(--blue);
  color: #fff;
  font-size: 1rem;
}

.brand-eyebrow {
  margin: 0;
  color: var(--muted);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.05em;
}

.topbar h1 {
  margin: 0.1rem 0 0;
  font-size: 1.15rem;
  color: var(--text);
}

.role-line {
  margin: 0.15rem 0 0;
  color: var(--muted);
  font-size: 0.78rem;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.clock {
  text-align: right;
}

.clock strong {
  display: block;
  font-size: 1rem;
}

.clock span {
  color: var(--muted);
  font-size: 0.78rem;
  text-transform: capitalize;
}

.system {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.75rem;
  border-radius: 999px;
  background: #fee2e2;
  color: #b91c1c;
  font-size: 0.72rem;
  font-weight: 700;
}

.system i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.system.connected {
  background: #dcfce7;
  color: #15803d;
}

.logout {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0.55rem 0.85rem;
  background: #fff;
  color: var(--text);
}

.login-admin {
  border: none;
  border-radius: 10px;
  padding: 0.55rem 0.85rem;
  background: var(--blue);
  color: #fff;
  font-weight: 600;
}

.login-modal {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(15, 23, 42, 0.45);
}

.page {
  display: grid;
  gap: 1rem;
  padding: 1rem 1.25rem 1.25rem;
}

.stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.85rem;
}

.stat-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.1rem;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--card);
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.04);
}

.stat-card p {
  margin: 0;
  color: var(--muted);
  font-size: 0.82rem;
}

.stat-card strong {
  display: block;
  margin: 0.2rem 0;
  font-size: 1.7rem;
  line-height: 1;
}

.stat-card span {
  color: var(--muted);
  font-size: 0.75rem;
}

.stat-icon {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  font-size: 1rem;
}

.stat-icon.blue {
  background: #dbeafe;
}

.stat-icon.green {
  background: #dcfce7;
}

.stat-icon.gray {
  background: #e2e8f0;
}

.workspace {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 1rem;
  min-height: calc(100vh - 210px);
}

.map-panel {
  display: grid;
  grid-template-rows: auto 1fr;
  min-height: 560px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--card);
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.04);
}

.map-panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid var(--border);
}

.map-panel-head h2 {
  margin: 0;
  font-size: 1rem;
}

.map-panel-head p {
  margin: 0.2rem 0 0;
  color: var(--muted);
  font-size: 0.78rem;
}

.live-pill {
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
  background: #fee2e2;
  color: #b91c1c;
  font-size: 0.75rem;
  font-weight: 700;
}

.live-pill.connected {
  background: #dcfce7;
  color: #15803d;
}

@media (max-width: 980px) {
  .stats {
    grid-template-columns: 1fr;
  }

  .workspace {
    grid-template-columns: 1fr;
    min-height: auto;
  }

  .map-panel {
    min-height: 480px;
  }

  .topbar {
    flex-direction: column;
    align-items: flex-start;
  }

  .topbar-actions {
    width: 100%;
    flex-wrap: wrap;
  }
}
</style>

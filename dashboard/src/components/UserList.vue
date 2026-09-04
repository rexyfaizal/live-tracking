<script setup>
import { computed, ref } from 'vue';
import { displayColorForTracker } from '../trackerColor.js';

const props = defineProps({
  trackers: {
    type: Array,
    default: () => [],
  },
  selectedUserId: {
    type: String,
    default: null,
  },
  saving: {
    type: Boolean,
    default: false,
  },
  formError: {
    type: String,
    default: '',
  },
  isAdmin: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['select', 'create', 'remove']);

const showForm = ref(false);
const name = ref('');
const username = ref('');
const password = ref('');
const search = ref('');
const filter = ref('all');

const onlineCount = computed(() => props.trackers.filter((item) => item.online).length);

const filteredTrackers = computed(() => {
  const q = search.value.trim().toLowerCase();
  return props.trackers.filter((item) => {
    if (filter.value === 'online' && !item.online) return false;
    if (filter.value === 'offline' && item.online) return false;
    if (!q) return true;
    return (
      item.name?.toLowerCase().includes(q) ||
      item.username?.toLowerCase().includes(q)
    );
  });
});

function trackerColor(tracker) {
  return displayColorForTracker(tracker.id, Boolean(tracker.online));
}

function formatRelative(value) {
  if (!value) return 'Belum online';
  const diffMs = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return 'Baru saja';
  const menit = Math.floor(diffMs / 60000);
  if (menit < 1) return 'Baru saja';
  if (menit < 60) return `${menit} menit lalu`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  const hari = Math.floor(jam / 24);
  return `${hari} hari lalu`;
}

function selectTracker(tracker) {
  emit('select', tracker.id);
}

function resetForm() {
  name.value = '';
  username.value = '';
  password.value = '';
  showForm.value = false;
}

function submitCreate() {
  emit('create', {
    name: name.value,
    username: username.value,
    password: password.value,
  });
}

function confirmRemove(tracker) {
  const ok = window.confirm(`Hapus ${tracker.name} (@${tracker.username})?`);
  if (ok) emit('remove', tracker.id);
}

defineExpose({ resetForm });
</script>

<template>
  <aside class="panel">
    <div class="panel-header">
      <div class="title-block">
        <div class="title-row">
          <h2>Daftar Tracker</h2>
          <span class="aktif">{{ onlineCount }} AKTIF</span>
        </div>
        <p class="count-line">{{ filteredTrackers.length }} dari {{ trackers.length }} tracker</p>
      </div>
      <button v-if="isAdmin" type="button" class="add-btn" @click="showForm = !showForm">
        {{ showForm ? 'Batal' : '+ Tambah' }}
      </button>
    </div>

    <div class="filters">
      <input v-model="search" type="search" placeholder="Cari nama / username" />
      <select v-model="filter">
        <option value="all">Semua</option>
        <option value="online">Online</option>
        <option value="offline">Offline</option>
      </select>
    </div>

    <p v-if="isAdmin && formError && !showForm" class="form-error">{{ formError }}</p>

    <form v-if="isAdmin && showForm" class="add-form" @submit.prevent="submitCreate">
      <label>
        Nama
        <input v-model="name" type="text" placeholder="Nama lengkap" required />
      </label>
      <label>
        Username
        <input v-model="username" type="text" placeholder="contoh: rina" required />
      </label>
      <label>
        Password
        <input v-model="password" type="password" placeholder="min. 6 karakter" required />
      </label>
      <p v-if="formError" class="form-error inline">{{ formError }}</p>
      <button type="submit" :disabled="saving">
        {{ saving ? 'Menyimpan...' : 'Simpan orang' }}
      </button>
    </form>

    <ul>
      <li
        v-for="tracker in filteredTrackers"
        :key="tracker.id"
        :class="{
          active: tracker.id === selectedUserId,
          admin: isAdmin,
          offline: !tracker.online,
        }"
        @click="selectTracker(tracker)"
      >
        <div
          class="avatar"
          :style="{ background: trackerColor(tracker) }"
        >
          {{ (tracker.name || '?').charAt(0).toUpperCase() }}
        </div>

        <div class="meta">
          <strong>{{ tracker.name }}</strong>
          <small>@{{ tracker.username }}</small>
        </div>

        <div class="status-col">
          <span
            class="status"
            :style="{ color: trackerColor(tracker) }"
          >
            <i :style="{ background: trackerColor(tracker) }"></i>
            {{ tracker.online ? 'ONLINE' : 'OFFLINE' }}
          </span>
          <small>{{ formatRelative(tracker.lastSeen) }}</small>
        </div>

        <button
          v-if="isAdmin"
          type="button"
          class="remove-btn"
          title="Hapus tracker"
          @click.stop="confirmRemove(tracker)"
        >
          ×
        </button>
      </li>
      <li v-if="filteredTrackers.length === 0" class="empty">Tidak ada tracker</li>
    </ul>
  </aside>
</template>

<style scoped>
.panel {
  width: 340px;
  min-width: 300px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--card);
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.9rem 1rem 0.75rem;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

h2 {
  margin: 0;
  font-size: 1rem;
  color: var(--text);
}

.aktif {
  display: inline-flex;
  align-items: center;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  background: rgba(34, 197, 94, 0.15);
  color: #15803d;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.count-line {
  margin: 0.2rem 0 0;
  color: var(--muted);
  font-size: 0.75rem;
}

.add-btn,
.add-form button {
  border: none;
  border-radius: 8px;
  color: white;
}

.add-btn {
  padding: 0.4rem 0.7rem;
  background: var(--blue);
  font-size: 0.78rem;
  font-weight: 600;
  white-space: nowrap;
}

.filters {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.45rem;
  padding: 0 1rem 0.75rem;
}

.filters input,
.filters select,
.add-form input {
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fff;
  color: var(--text);
  font-size: 0.82rem;
}

.add-form {
  display: grid;
  gap: 0.55rem;
  margin: 0 1rem 0.75rem;
  padding: 0.75rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: #f8fbff;
}

label {
  display: grid;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: var(--muted);
}

.add-form button {
  padding: 0.55rem;
  background: var(--ok);
  font-size: 0.82rem;
}

.add-form button:disabled {
  opacity: 0.6;
}

.form-error {
  margin: 0 1rem 0.65rem;
  color: var(--danger);
  font-size: 0.78rem;
}

.form-error.inline {
  margin: 0;
}

ul {
  list-style: none;
  margin: 0;
  padding: 0.25rem 0.75rem 0.75rem;
  display: grid;
  gap: 0.3rem;
  overflow-y: auto;
  flex: 1;
  align-content: start;
}

li {
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.5rem;
  align-items: center;
  min-height: 0;
  height: auto;
  padding: 0.4rem 0.55rem;
  border: 1px solid transparent;
  border-left: 3px solid transparent;
  border-radius: 8px;
  background: #f8fafc;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

li.admin {
  padding-right: 1.6rem;
}

li:hover {
  background: #f1f5f9;
}

li.active {
  background: #eef5ff;
  border-color: #d6e6ff;
  border-left-color: var(--blue);
}

li.offline {
  background: #f1f5f9;
  opacity: 0.78;
}

li.offline.active {
  background: #e8eef5;
  border-color: #cbd5e1;
  border-left-color: #94a3b8;
  opacity: 1;
}

li.empty {
  display: block;
  text-align: center;
  color: var(--muted);
  cursor: default;
  background: transparent;
  border: none;
  padding: 1rem 0.5rem;
  opacity: 1;
}

.avatar {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: #94a3b8;
  color: #fff;
  font-size: 0.85rem;
  font-weight: 800;
  flex-shrink: 0;
  line-height: 1;
}

.meta {
  min-width: 0;
  line-height: 1.15;
}

.meta strong {
  display: block;
  font-size: 0.9rem;
  line-height: 1.15;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

li.offline .meta strong {
  color: #64748b;
}

.meta small {
  display: block;
  margin-top: 0.1rem;
  color: var(--muted);
  font-size: 0.75rem;
  line-height: 1.15;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-col {
  display: grid;
  justify-items: end;
  gap: 0.05rem;
  text-align: right;
  line-height: 1.15;
}

.status {
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
  color: #94a3b8;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  line-height: 1.15;
}

.status i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #94a3b8;
}

.status-col > small {
  color: var(--muted);
  font-size: 0.7rem;
  line-height: 1.15;
  white-space: nowrap;
}

.remove-btn {
  position: absolute;
  top: 50%;
  right: 0.2rem;
  transform: translateY(-50%);
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--danger);
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  opacity: 0.55;
}

.remove-btn:hover {
  opacity: 1;
  background: rgba(239, 68, 68, 0.1);
}

@media (max-width: 980px) {
  .panel {
    width: 100%;
    min-width: 0;
    max-height: 420px;
  }
}
</style>

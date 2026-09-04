<script setup>
defineProps({
  error: {
    type: String,
    default: '',
  },
});

const emit = defineEmits(['login']);

const username = defineModel('username', { type: String, default: '' });
const password = defineModel('password', { type: String, default: '' });
const loading = defineModel('loading', { type: Boolean, default: false });

function submit() {
  emit('login');
}
</script>

<template>
  <div class="login-card">
    <p class="brand">PT GISTEX GARMEN INDONESIA</p>
    <h1>Login Admin</h1>
    <p class="sub">Masukkan akun admin untuk kalibrasi dan kelola tracker.</p>

    <form @submit.prevent="submit" autocomplete="on">
      <label>
        Username
        <input
          v-model="username"
          name="username"
          type="text"
          placeholder="Username admin"
          autocomplete="username"
        />
      </label>
      <label>
        Password
        <input
          v-model="password"
          name="password"
          type="password"
          placeholder="Password"
          autocomplete="current-password"
        />
      </label>

      <p v-if="error" class="error">{{ error }}</p>

      <button type="submit" :disabled="loading">
        {{ loading ? 'Memproses...' : 'Masuk' }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.login-card {
  width: min(420px, 100%);
  padding: 2rem;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--card);
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18);
}

.brand {
  margin: 0 0 0.35rem;
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
}

h1 {
  margin: 0 0 0.5rem;
  font-size: 1.6rem;
  color: var(--text);
}

.sub {
  margin: 0 0 1.5rem;
  color: var(--muted);
}

form {
  display: grid;
  gap: 1rem;
}

label {
  display: grid;
  gap: 0.45rem;
  font-size: 0.9rem;
  color: var(--muted);
}

input {
  padding: 0.75rem 0.9rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fff;
  color: var(--text);
}

button {
  margin-top: 0.35rem;
  padding: 0.85rem 1rem;
  border: none;
  border-radius: 10px;
  background: var(--blue);
  color: white;
  font-weight: 600;
}

button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.error {
  margin: 0;
  color: var(--danger);
}
</style>

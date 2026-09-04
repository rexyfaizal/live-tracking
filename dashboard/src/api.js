import { AuthExpiredError } from './auth.js';

export function getApiUrl() {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  return `http://${window.location.hostname}:4001`;
}

function throwIfAuthFailed(response, data) {
  if (response.status === 401) {
    throw new AuthExpiredError(data?.error || 'Sesi berakhir. Silakan login ulang.');
  }
}

export async function login(username, password) {
  const response = await fetch(`${getApiUrl()}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Login gagal');
  }

  return data;
}

export async function fetchLocations(token) {
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${getApiUrl()}/api/location`, { headers });
  const data = await response.json();
  throwIfAuthFailed(response, data);
  if (!response.ok) {
    throw new Error(data.error || 'Gagal memuat lokasi');
  }

  return data.locations;
}

export async function fetchTrackers(token) {
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${getApiUrl()}/api/location/trackers`, { headers });
  const data = await response.json();
  throwIfAuthFailed(response, data);
  if (!response.ok) {
    throw new Error(data.error || 'Gagal memuat daftar tracker');
  }

  return data.trackers;
}

export function getSocketUrl() {
  return getApiUrl();
}

export async function createTracker(token, payload) {
  const response = await fetch(`${getApiUrl()}/api/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  throwIfAuthFailed(response, data);
  if (!response.ok) {
    throw new Error(data.error || 'Gagal menambah tracker');
  }

  return data.tracker;
}

export async function deleteTracker(token, userId) {
  const response = await fetch(`${getApiUrl()}/api/users/${userId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json();
  throwIfAuthFailed(response, data);
  if (!response.ok) {
    throw new Error(data.error || 'Gagal menghapus tracker');
  }

  return data.tracker;
}

export async function fetchFactoryBounds() {
  const response = await fetch(`${getApiUrl()}/api/factory-bounds`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Gagal memuat kalibrasi denah');
  }
  return data.bounds ?? null;
}

export async function saveFactoryBounds(token, bounds) {
  const response = await fetch(`${getApiUrl()}/api/factory-bounds`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(bounds),
  });

  const data = await response.json();
  throwIfAuthFailed(response, data);
  if (!response.ok) {
    throw new Error(data.error || 'Gagal menyimpan kalibrasi denah');
  }
  return data.bounds;
}

export async function clearFactoryBoundsRemote(token) {
  const response = await fetch(`${getApiUrl()}/api/factory-bounds`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json();
  throwIfAuthFailed(response, data);
  if (!response.ok) {
    throw new Error(data.error || 'Gagal reset kalibrasi denah');
  }
  return true;
}

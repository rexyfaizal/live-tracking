import { getApiUrl, resolveApiUrl } from './config.js';

export { getApiUrl, resolveApiUrl, getActiveNetworkLabel } from './config.js';

export async function login(username, password) {
  await resolveApiUrl({ force: true });

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

export class AuthExpiredError extends Error {
  constructor(message = 'Sesi berakhir. Silakan login ulang.') {
    super(message);
    this.name = 'AuthExpiredError';
    this.expired = true;
  }
}

export function decodeTokenPayload(token) {
  if (!token) return null;

  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(normalized));
  } catch {
    return null;
  }
}

export function isTokenExpired(token, skewMs = 15_000) {
  const payload = decodeTokenPayload(token);
  if (!payload?.exp) return !token;
  return payload.exp * 1000 <= Date.now() + skewMs;
}

export function isAuthFailure(error) {
  if (!error) return false;
  if (error.expired || error instanceof AuthExpiredError) return true;

  const message = String(error.message || error);
  return /401|kadaluarsa|tidak valid|unauthorized|jwt expired/i.test(message);
}

import { Capacitor } from '@capacitor/core';

const DEFAULT_API_URL = 'http://10.5.0.8:4001';

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

export function getApiUrl() {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/$/, '');
  }

  if (import.meta.env.DEV && !isNativeApp()) {
    return window.location.origin;
  }

  return DEFAULT_API_URL;
}

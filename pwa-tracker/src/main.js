import { createApp } from 'vue';
import { Capacitor } from '@capacitor/core';
import App from './App.vue';
import './style.css';

if (Capacitor.isNativePlatform()) {
  document.body.classList.add('native-app');
}

createApp(App).mount('#app');

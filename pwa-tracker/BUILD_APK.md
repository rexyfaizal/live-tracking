# Build APK Android

## File APK siap install

```
pwa-tracker/release/live-tracker.apk
```

Atau dari build Gradle:

```
pwa-tracker/android/app/build/outputs/apk/debug/app-debug.apk
```

## Background tracking (minimize tetap jalan)

APK memakai **Foreground Service** + notifikasi:

1. Login & mulai tracking (**sekali saja**, sesi ~30 hari)
2. Izinkan lokasi → pilih **Izinkan sepanjang waktu**
3. Izinkan notifikasi (Android 13+)
4. Muncul notifikasi: **"Live Tracker aktif"**
5. Minimize app → lokasi tetap dikirim ke backend
6. Tap **Stop Share Lokasi** untuk menghentikan
7. Tablet dimatikan lalu dinyalakan → app **auto terbuka** + tracking lanjut (jika masih login)

Jika tracking / auto-buka gagal (HP Xiaomi/Oppo/Vivo):
- Pengaturan → Aplikasi → Live Tracker → Baterai → **Tidak dibatasi**
- Aktifkan **Autostart** jika ada
- Izinkan app berjalan di background

## Sesi login
- Akun **tracker**: JWT berlaku **30 hari** (tanpa login ulang tiap sore)
- Tombol **Keluar** menghapus sesi
- Setelah 30 hari, login ulang sekali
## Install di HP

1. Copy `live-tracker.apk` ke HP (USB, WhatsApp, Google Drive, dll.)
2. Buka file APK di HP
3. Izinkan **Install dari sumber tidak dikenal** jika diminta
4. Buka app **Live Tracker**
5. Login: `budi` / `tracker123`
6. Izinkan **Lokasi** → pilih **Izinkan sepanjang waktu** (Allow all the time) agar tracking tetap jalan

## URL backend (penting)

APK dikonfigurasi dual jaringan:

```
Lokal  : http://10.5.0.107:4001   (WiFi pabrik — diprioritaskan)
Publik : http://103.24.148.59:4001 (paket data / luar — cadangan)
```

App cek `/health` lokal dulu; jika gagal otomatis pakai publik.

### Ganti IP backend

Edit `pwa-tracker/.env.production`:

```
VITE_API_URL_LOCAL=http://IP-LOKAL:4001
VITE_API_URL_PUBLIC=http://IP-PUBLIK:4001
```

Lalu build ulang:

```powershell
cd pwa-tracker
npm run android:apk
```

## Build ulang APK

Prasyarat: JDK 21 + Android SDK (sudah terinstall di PC ini).

```powershell
cd d:\REXY\Project\live-tracking\pwa-tracker
npm run android:apk
```

Script ini akan:
1. Build web app (`vite build`)
2. Sync ke project Android (`cap sync`)
3. Compile APK debug (`gradlew assembleDebug`)

## Buka di Android Studio (opsional)

```powershell
cd pwa-tracker
npm run cap:sync
npm run cap:open
```

Di Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**

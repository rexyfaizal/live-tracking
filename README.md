# Live Tracking (OpenStreetMap + PWA)

Sistem live tracking sederhana untuk 10-15 orang:
- **Backend** API + WebSocket
- **Dashboard** admin dengan peta OpenStreetMap
- **PWA** di HP untuk share lokasi live

## Cara Menjalankan

### 1. Install dependency

```bash
cd C:\Users\Intel\live-tracking
npm install
cd backend && npm install
cd ../dashboard && npm install
cd ../pwa-tracker && npm install
```

### 2. Setup environment backend

```bash
cd backend
copy .env.example .env
```

### 3. Jalankan semua service

Di terminal terpisah:

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Dashboard
cd dashboard
npm run dev

# Terminal 3 - PWA Tracker
cd pwa-tracker
npm run dev
```

Atau dari root (setelah `npm install` di root):

```bash
npm run dev
```

## URL

| Service | URL |
|---------|-----|
| Backend | http://localhost:4001 |
| Dashboard Admin | http://10.5.0.8:6600 |
| PWA Tracker (HP) | https://10.5.0.8:6601 |

## Akun Demo

### Admin Dashboard (`:6600`)
- Username: `admin`
- Password: `admin123`
- Akses penuh: kalibrasi, tambah/hapus tracker
- Tombol **Masuk Admin** di pojok kanan atas

### Viewer Dashboard (`:6600`)
- **Tidak perlu login** — buka langsung dashboard
- Hanya lihat peta & daftar (tanpa kalibrasi / tambah / hapus)

### Tracker (HP `:6601` / APK)
- `budi` / `tracker123`
- `ani` / `tracker123`
- `citra` / `tracker123`
- `doni` / `tracker123`
- `eka` / `tracker123`

Admin bisa menambah/menghapus tracker dari dashboard (tombol **+ Tambah**). Akun baru langsung bisa login di PWA/APK.

## Kalibrasi denah (bersama)
- Admin menyimpan kalibrasi di **Kalibrasi → Simpan**
- Data tersimpan di server (`backend/data/factory-bounds.json`)
- Semua komputer yang membuka dashboard memakai kalibrasi yang sama secara otomatis
- Zoom/pan tampilan tetap per-browser (tidak ikut disalin)

## Alur Testing

1. Buka dashboard di browser PC → login sebagai `admin`
2. Buka PWA di HP (atau browser lain) → login sebagai `budi`
3. Tap **Mulai Share Lokasi** → izinkan GPS
4. Marker `Budi` akan muncul di peta dashboard secara real-time
5. Ulangi dengan akun tracker lain untuk simulasi 10-15 orang

## APK Android (alternatif PWA)

### Cara cepat (tanpa WA) — unduh dari browser tablet/HP
1. Pastikan backend jalan
2. Di tablet (WiFi sama), buka:

```
http://10.5.0.8:4001/download
```

3. Tap **Download APK** → install
4. Login tracker **sekali** (contoh `budi` / `tracker123`) — sesi ~30 hari
5. Izinkan lokasi **sepanjang waktu**
6. Tracking auto lanjut setelah tablet dinyalakan ulang (aktifkan Autostart di pengaturan HP jika perlu)

File yang dilayani: `pwa-tracker/release/live-tracker.apk`  
(ganti/rebuild APK → link tetap sama)

### Manual
Copy file APK ke HP:

```
pwa-tracker/release/live-tracker.apk
```

Detail build ulang: lihat `pwa-tracker/BUILD_APK.md`

## Catatan PWA di HP

- Akses `https://<IP-komputer-anda>:6601` dari HP (satu jaringan WiFi)
- Terima peringatan sertifikat self-signed di browser HP
- Di Android Chrome: menu → **Add to Home screen**
- Biarkan tab tetap terbuka saat tracking aktif
- Untuk production, wajib pakai **HTTPS** + domain

## Production Checklist

- [ ] Deploy backend ke VPS (Railway, DigitalOcean, dll)
- [ ] Set `VITE_API_URL` di dashboard & pwa-tracker
- [ ] Ganti `JWT_SECRET` di backend `.env`
- [ ] Tambah user tracker dari dashboard admin (data tersimpan di `backend/data/users.json`)
- [ ] Pasang reverse proxy + SSL (Nginx/Caddy)

# Deploy Docker (Backend + Dashboard)

Target Linux contoh: **`10.5.0.107`**  
Port: **4001** (backend), **6600** (dashboard)

PWA/APK tidak di-Docker. APK cukup di-host lewat `http://10.5.0.107:4001/download`.

## Prasyarat di Linux

```bash
sudo apt update
sudo apt install -y git docker.io docker-compose-v2
sudo usermod -aG docker $USER
# logout/login agar group docker aktif
docker --version
```

## 1. Clone / pull dari GitHub

```bash
sudo mkdir -p /opt
cd /opt
sudo git clone https://github.com/rexyfaizal/live-tracking.git
cd live-tracking
# atau jika sudah ada:
# git pull
```

## 2. Env Docker

```bash
cp .env.docker.example .env.docker
nano .env.docker
```

Isi minimal:

```env
PORT=4001
JWT_SECRET=ganti-secret-yang-aman
CORS_ORIGIN=http://10.5.0.107:6600,http://localhost:6600
```

## 3. Data & APK

Pastikan folder ada:

```bash
mkdir -p backend/data pwa-tracker/release
```

- Copy `users.json` / `factory-bounds.json` dari PC lama ke `backend/data/` (opsional)
- Copy `live-tracker.apk` ke `pwa-tracker/release/live-tracker.apk`
- Denah: `dashboard/public/maps/factory-floor.png` (ikut image build; ganti file lalu rebuild dashboard jika perlu)

## 4. Jalankan

```bash
cd /opt/live-tracking
docker compose up -d --build
docker compose ps
docker compose logs -f --tail=80
```

## 5. Tes

| URL | Fungsi |
|-----|--------|
| http://10.5.0.107:4001/health | Backend OK |
| http://10.5.0.107:6600 | Dashboard |
| http://10.5.0.107:4001/download | Unduh APK |

Dashboard otomatis memanggil API di `hostname:4001` (jadi ikut `10.5.0.107`).

## Update dari GitHub

```bash
cd /opt/live-tracking
git pull
docker compose up -d --build
```

## Perintah berguna

```bash
docker compose restart
docker compose down
docker compose logs -f backend
docker compose logs -f dashboard
```

## APK tablet

Setelah server pindah ke `10.5.0.107`, rebuild APK di Windows dengan:

`pwa-tracker/.env.production`

```env
VITE_API_URL=http://10.5.0.107:4001
```

lalu `npm run android:apk`, copy hasil ke `pwa-tracker/release/` di Linux (volume sudah di-mount, tidak perlu rebuild container untuk ganti APK).

## Firewall

```bash
sudo ufw allow 4001/tcp
sudo ufw allow 6600/tcp
```

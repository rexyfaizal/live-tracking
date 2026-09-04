import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import locationRoutes from './routes/location.js';
import userRoutes from './routes/users.js';
import factoryRoutes from './routes/factory.js';
import { verifySocketToken } from './middleware/auth.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');
const apkPath = path.resolve(__dirname, '../../pwa-tracker/release/live-tracker.apk');

const app = express();
const server = http.createServer(app);

const corsOriginList = process.env.CORS_ORIGIN?.split(',').map((item) => item.trim()).filter(Boolean) ?? [
  'http://localhost:6600',
  'http://localhost:6601',
];

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (corsOriginList.includes(origin)) return true;

  // Capacitor / WebView Android (APK)
  if (
    origin === 'http://localhost' ||
    origin === 'https://localhost' ||
    origin === 'capacitor://localhost' ||
    origin === 'ionic://localhost' ||
    origin.startsWith('http://localhost:') ||
    origin.startsWith('https://localhost:')
  ) {
    return true;
  }

  // Izinkan akses dari jaringan lokal (HP/tablet di WiFi yang sama)
  return /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(
    origin,
  );
}

const corsOptions = {
  origin(origin, callback) {
    callback(null, isAllowedOrigin(origin));
  },
  credentials: true,
};

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      callback(null, isAllowedOrigin(origin));
    },
    credentials: true,
    methods: ['GET', 'POST'],
  },
  pingInterval: 25000,
  pingTimeout: 60000,
});

app.set('io', io);

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static(publicDir));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Halaman unduh APK (model htdocs) — HP/tablet buka di browser
app.get('/download', (_req, res) => {
  res.sendFile(path.join(publicDir, 'download.html'));
});

app.get('/download/live-tracker.apk', (req, res) => {
  if (!fs.existsSync(apkPath)) {
    return res.status(404).type('text').send('APK belum tersedia. Build dulu: pwa-tracker/release/live-tracker.apk');
  }

  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', 'attachment; filename="live-tracker.apk"');
  return res.sendFile(apkPath);
});

app.use('/api/auth', authRoutes);
app.use('/api/location', locationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/factory-bounds', factoryRoutes);

io.on('connection', (socket) => {
  const token = socket.handshake.auth?.token;

  // Viewer publik: boleh pantau tanpa login
  if (!token) {
    socket.join('dashboard');
    socket.emit('connected', { role: 'viewer', name: 'Guest' });
    return;
  }

  try {
    const user = verifySocketToken(token);

    if (user.role === 'admin' || user.role === 'viewer') {
      socket.join('dashboard');
      socket.emit('connected', { role: user.role, name: user.name });
    } else {
      socket.disconnect(true);
    }
  } catch {
    socket.disconnect(true);
  }
});

const PORT = Number(process.env.PORT) || 4001;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend live tracking berjalan di http://0.0.0.0:${PORT}`);
  console.log(`Download APK: http://<IP-PC>:${PORT}/download`);
});

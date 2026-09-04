import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { findUserById, getTrackers } from '../data/users.js';
import {
  getAllLocations,
  getLocation,
  setLocation,
  setOffline,
} from '../store/locations.js';

const router = Router();

function buildLocationPayload(user, body) {
  return {
    userId: user.id,
    name: user.name,
    username: user.username,
    lat: Number(body.lat),
    lng: Number(body.lng),
    accuracy: body.accuracy != null ? Number(body.accuracy) : null,
    online: true,
    timestamp: body.timestamp || new Date().toISOString(),
  };
}

router.post('/', authMiddleware, requireRole('tracker'), (req, res) => {
  const { lat, lng } = req.body;

  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    return res.status(400).json({ error: 'Koordinat lat/lng tidak valid' });
  }

  const payload = buildLocationPayload(req.user, req.body);
  setLocation(req.user.id, payload);

  const io = req.app.get('io');
  io.to('dashboard').emit('location_update', payload);

  return res.json({ success: true });
});

router.post('/stop', authMiddleware, requireRole('tracker'), (req, res) => {
  const offlinePayload = setOffline(req.user.id) ?? {
    userId: req.user.id,
    name: req.user.name,
    username: req.user.username,
    online: false,
    timestamp: new Date().toISOString(),
  };

  const io = req.app.get('io');
  io.to('dashboard').emit('user_offline', offlinePayload);

  // Tetap simpan titik terakhir (online:false) agar muncul di peta sebagai OFFLINE
  return res.json({ success: true });
});

router.get('/', (_req, res) => {
  const locations = getAllLocations().map((item) => {
    const user = findUserById(item.userId);
    return {
      ...item,
      name: user?.name ?? item.name,
      username: user?.username ?? item.username,
    };
  });

  return res.json({ locations });
});

router.get('/trackers', (_req, res) => {
  const trackers = getTrackers().map((tracker) => {
    const live = getLocation(tracker.id);
    return {
      ...tracker,
      online: Boolean(live?.online),
      lat: live?.lat ?? null,
      lng: live?.lng ?? null,
      lastSeen: live?.updatedAt ?? null,
      accuracy: live?.accuracy ?? null,
    };
  });

  return res.json({ trackers });
});

export default router;

import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import {
  clearFactoryBounds,
  loadFactoryBounds,
  saveFactoryBounds,
} from '../data/factoryBounds.js';

const router = Router();

// Publik: semua PC viewer/admin bisa baca kalibrasi bersama
router.get('/', (_req, res) => {
  return res.json({ bounds: loadFactoryBounds() });
});

router.put('/', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    const bounds = saveFactoryBounds(req.body);
    const io = req.app.get('io');
    io.to('dashboard').emit('factory_bounds_updated', bounds);
    return res.json({ bounds });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.delete('/', authMiddleware, requireRole('admin'), (_req, res) => {
  clearFactoryBounds();
  const io = req.app.get('io');
  io.to('dashboard').emit('factory_bounds_updated', {});
  return res.json({ success: true, bounds: {} });
});

export default router;

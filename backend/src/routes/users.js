import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { createTracker, deleteTracker } from '../data/users.js';
import { removeLocation } from '../store/locations.js';

const router = Router();

router.post('/', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    const tracker = createTracker(req.body);
    const io = req.app.get('io');
    io.to('dashboard').emit('tracker_created', tracker);
    return res.status(201).json({ tracker });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    const tracker = deleteTracker(req.params.id);
    removeLocation(tracker.id);

    const io = req.app.get('io');
    io.to('dashboard').emit('tracker_deleted', { userId: tracker.id });
    return res.json({ success: true, tracker });
  } catch (error) {
    const status = error.message === 'User tidak ditemukan' ? 404 : 400;
    return res.status(status).json({ error: error.message });
  }
});

export default router;

import jwt from 'jsonwebtoken';
import { findUserById } from '../data/users.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export function signToken(user) {
  // Tracker tablet: sesi panjang (login sekali ~30 hari)
  // Admin dashboard: tetap 12 jam
  const expiresIn = user.role === 'tracker' ? '30d' : '12h';

  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      name: user.name,
    },
    JWT_SECRET,
    { expiresIn },
  );
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token tidak ditemukan' });
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = findUserById(payload.sub);

    if (!user) {
      return res.status(401).json({ error: 'User tidak valid' });
    }

    req.user = {
      id: user.id,
      role: user.role,
      name: user.name,
      username: user.username,
    };

    next();
  } catch {
    return res.status(401).json({ error: 'Token tidak valid atau kadaluarsa' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Akses ditolak' });
    }

    next();
  };
}

export function verifySocketToken(token) {
  const payload = jwt.verify(token, JWT_SECRET);
  const user = findUserById(payload.sub);

  if (!user) {
    throw new Error('User tidak valid');
  }

  return {
    id: user.id,
    role: user.role,
    name: user.name,
    username: user.username,
  };
}

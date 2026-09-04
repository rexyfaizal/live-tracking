import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../../data');
const dataFile = path.join(dataDir, 'users.json');

const seedUsers = [
  {
    id: 'admin-1',
    username: 'admin',
    passwordHash: bcrypt.hashSync('admin123', 10),
    name: 'Administrator',
    role: 'admin',
  },
  {
    id: 'tracker-1',
    username: 'budi',
    passwordHash: bcrypt.hashSync('tracker123', 10),
    name: 'Budi Santoso',
    role: 'tracker',
  },
  {
    id: 'tracker-2',
    username: 'ani',
    passwordHash: bcrypt.hashSync('tracker123', 10),
    name: 'Ani Wijaya',
    role: 'tracker',
  },
  {
    id: 'tracker-3',
    username: 'citra',
    passwordHash: bcrypt.hashSync('tracker123', 10),
    name: 'Citra Dewi',
    role: 'tracker',
  },
  {
    id: 'tracker-4',
    username: 'doni',
    passwordHash: bcrypt.hashSync('tracker123', 10),
    name: 'Doni Pratama',
    role: 'tracker',
  },
  {
    id: 'tracker-5',
    username: 'eka',
    passwordHash: bcrypt.hashSync('tracker123', 10),
    name: 'Eka Putri',
    role: 'tracker',
  },
  {
    id: 'viewer-1',
    username: 'viewer',
    passwordHash: bcrypt.hashSync('viewer123', 10),
    name: 'Viewer',
    role: 'viewer',
  },
];

function ensureStore() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify(seedUsers, null, 2));
    return;
  }

  const users = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  if (!users.some((user) => user.role === 'viewer')) {
    users.push({
      id: 'viewer-1',
      username: 'viewer',
      passwordHash: bcrypt.hashSync('viewer123', 10),
      name: 'Viewer',
      role: 'viewer',
    });
    fs.writeFileSync(dataFile, JSON.stringify(users, null, 2));
  }
}

function readUsers() {
  ensureStore();
  return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
}

function writeUsers(users) {
  ensureStore();
  fs.writeFileSync(dataFile, JSON.stringify(users, null, 2));
}

export function findUserByUsername(username) {
  return readUsers().find((user) => user.username === username.toLowerCase().trim());
}

export function findUserById(id) {
  return readUsers().find((user) => user.id === id);
}

export function getTrackers() {
  return readUsers()
    .filter((user) => user.role === 'tracker')
    .map(({ id, username, name }) => ({ id, username, name }));
}

export function createTracker({ name, username, password }) {
  const cleanName = String(name || '').trim();
  const cleanUsername = String(username || '').toLowerCase().trim();
  const cleanPassword = String(password || '');

  if (cleanName.length < 2) {
    throw new Error('Nama minimal 2 karakter');
  }

  if (!/^[a-z0-9._-]{3,20}$/.test(cleanUsername)) {
    throw new Error('Username 3-20 karakter (huruf kecil, angka, . _ -)');
  }

  if (cleanPassword.length < 6) {
    throw new Error('Password minimal 6 karakter');
  }

  const users = readUsers();
  if (users.some((user) => user.username === cleanUsername)) {
    throw new Error('Username sudah dipakai');
  }

  const user = {
    id: `tracker-${Date.now()}`,
    username: cleanUsername,
    passwordHash: bcrypt.hashSync(cleanPassword, 10),
    name: cleanName,
    role: 'tracker',
  };

  users.push(user);
  writeUsers(users);

  return { id: user.id, username: user.username, name: user.name };
}

export function deleteTracker(id) {
  const users = readUsers();
  const target = users.find((user) => user.id === id);

  if (!target) {
    throw new Error('User tidak ditemukan');
  }

  if (target.role === 'admin') {
    throw new Error('Akun admin tidak bisa dihapus');
  }

  writeUsers(users.filter((user) => user.id !== id));
  return { id: target.id, username: target.username, name: target.name };
}

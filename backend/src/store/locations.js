const liveLocations = new Map();

export function setLocation(userId, payload) {
  liveLocations.set(userId, {
    ...payload,
    updatedAt: new Date().toISOString(),
  });
}

export function getLocation(userId) {
  return liveLocations.get(userId) ?? null;
}

export function removeLocation(userId) {
  liveLocations.delete(userId);
}

export function getAllLocations() {
  return Array.from(liveLocations.entries()).map(([userId, location]) => ({
    userId,
    ...location,
  }));
}

export function setOffline(userId) {
  const current = liveLocations.get(userId);
  if (!current) return null;

  const next = {
    ...current,
    online: false,
    updatedAt: new Date().toISOString(),
  };

  liveLocations.set(userId, next);
  return next;
}

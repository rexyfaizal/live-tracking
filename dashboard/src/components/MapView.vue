<script setup>
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import L from 'leaflet';
import { imageOverlayRotated } from '../leafletImageOverlayRotated.js';
import {
  boundsFromMapView,
  boundsFromRobotics,
  boundsFromRotatedCorners,
  clearBounds,
  FLOORPLAN_URL,
  loadBounds,
  normalizeRotation,
  normalizeStoredBounds,
  overlayCenter,
  overlayCorners,
  rotatedLatLngs,
  saveBounds,
  shiftBounds,
} from '../factoryMap.js';
import { colorForTracker } from '../trackerColor.js';
import {
  clearFactoryBoundsRemote,
  fetchFactoryBounds,
  saveFactoryBounds as saveFactoryBoundsApi,
} from '../api.js';

const props = defineProps({
  locations: {
    type: Array,
    default: () => [],
  },
  focusUserId: {
    type: String,
    default: null,
  },
  isAdmin: {
    type: Boolean,
    default: false,
  },
  adminToken: {
    type: String,
    default: '',
  },
});

const mapElement = ref(null);
const mapMode = ref(loadSavedMapMode());
const overlayOpacity = ref(0.55);
const rotation = ref(0);
const south = ref('');
const west = ref('');
const north = ref('');
const east = ref('');
const saveNote = ref('');
const showCoords = ref(false);

const defaultCenter = [-6.2, 106.816666];

let map = null;
let osmLayer = null;
let floorOverlay = null;
let swMarker = null;
let neMarker = null;
let moveMarker = null;
let overlayDrag = null;
let moveDragStart = null;
let saveNoteTimer = null;
let hasInitialFit = false;
const markers = new Map();
const markerAnimations = new Map();
const MARKER_ANIM_MS = 900;
const MAP_MODE_KEY = 'live_tracking_map_mode';
const FLOOR_VIEW_KEY = 'live_tracking_floor_view';

let floorViewBound = false;
let saveViewTimer = null;
let mapResizeObserver = null;
/** Kalibrasi bersama dari server (utama). localStorage hanya cache. */
let sharedBounds = null;
let serverSaveTimer = null;
let applyingRemote = false;

function loadSavedMapMode() {
  const saved = localStorage.getItem(MAP_MODE_KEY);
  if (saved === 'osm' || saved === 'floor' || saved === 'calibrate') return saved;
  return 'osm';
}

function loadFloorView() {
  try {
    const raw = localStorage.getItem(FLOOR_VIEW_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (![data.lat, data.lng, data.zoom].every((n) => Number.isFinite(Number(n)))) return null;
    return {
      lat: Number(data.lat),
      lng: Number(data.lng),
      zoom: Number(data.zoom),
    };
  } catch {
    return null;
  }
}

function saveFloorView() {
  if (!map || mapMode.value !== 'floor') return;
  const center = map.getCenter();
  localStorage.setItem(
    FLOOR_VIEW_KEY,
    JSON.stringify({
      lat: center.lat,
      lng: center.lng,
      zoom: map.getZoom(),
    }),
  );
}

function clearFloorView() {
  localStorage.removeItem(FLOOR_VIEW_KEY);
}

function onFloorViewChanged() {
  if (mapMode.value !== 'floor') return;
  if (saveViewTimer) clearTimeout(saveViewTimer);
  saveViewTimer = setTimeout(() => {
    saveFloorView();
  }, 250);
}

function bindFloorViewPersist() {
  if (!map || floorViewBound) return;
  floorViewBound = true;
  map.on('moveend', onFloorViewChanged);
  map.on('zoomend', onFloorViewChanged);
}

function unbindFloorViewPersist() {
  if (saveViewTimer) {
    clearTimeout(saveViewTimer);
    saveViewTimer = null;
  }
  if (!map || !floorViewBound) return;
  map.off('moveend', onFloorViewChanged);
  map.off('zoomend', onFloorViewChanged);
  floorViewBound = false;
}

function applyFloorView(bounds) {
  map.invalidateSize();
  const saved = loadFloorView();
  if (saved) {
    map.setView([saved.lat, saved.lng], saved.zoom, { animate: false });
    return;
  }
  fitToOverlay(bounds, { padding: [28, 28], maxZoom: 22, zoomBoost: 0 });
}

function resetFloorView() {
  clearFloorView();
  if (!map) return;
  applyFloorView(currentOverlayBounds());
}

function validLocations() {
  return props.locations.filter((item) => item.lat != null && item.lng != null);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function createMarkerIcon(location) {
  const online = location.online !== false;
  const name = location.name || location.username || 'User';
  const letter = escapeHtml(name.trim().charAt(0).toUpperCase() || '?');
  const color = online ? colorForTracker(location.userId) : '#9ca3af';
  const statusHtml = online
    ? ''
    : '<span class="tracker-status-offline">OFFLINE</span>';

  return L.divIcon({
    className: 'tracker-marker-icon',
    html: `
      <div class="tracker-marker ${online ? 'is-online' : 'is-offline'}">
        <div class="tracker-label">
          <b>${escapeHtml(name)}</b>
          ${statusHtml}
        </div>
        <div class="tracker-pin" style="background:${color}">
          <span class="tracker-letter">${letter}</span>
        </div>
      </div>
    `,
    iconSize: [36, 46],
    iconAnchor: [18, 44],
    popupAnchor: [0, -40],
  });
}

function cornerIcon(label) {
  return L.divIcon({
    className: '',
    html: `<div class="calib-pin">${label}</div>`,
    iconSize: [40, 28],
    iconAnchor: [20, 14],
  });
}

function currentOverlayBounds() {
  if (sharedBounds) return sharedBounds;

  const saved = loadBounds();
  if (saved) {
    sharedBounds = saved;
    return saved;
  }

  const live = validLocations();
  if (live.length > 0) {
    return boundsFromRobotics(live[0].lat, live[0].lng);
  }

  if (map) {
    return boundsFromMapView(map);
  }

  return boundsFromRobotics(defaultCenter[0], defaultCenter[1]);
}

function applySharedBounds(bounds, { refreshView = true } = {}) {
  const next = normalizeStoredBounds(bounds);
  sharedBounds = next;
  if (next) {
    saveBounds(next);
  } else {
    clearBounds();
  }

  if (!refreshView || !map || mapMode.value === 'osm') return;
  applyMode();
}

function showSaveNote(message) {
  saveNote.value = message;
  if (saveNoteTimer) clearTimeout(saveNoteTimer);
  saveNoteTimer = setTimeout(() => {
    saveNote.value = '';
  }, 2500);
}

async function pushBoundsToServer(bounds, { notify = false } = {}) {
  if (!props.isAdmin || !props.adminToken || applyingRemote) return;
  try {
    const saved = await saveFactoryBoundsApi(props.adminToken, bounds);
    sharedBounds = normalizeStoredBounds(saved) || bounds;
    saveBounds(sharedBounds);
    if (notify) {
      showSaveNote('Kalibrasi tersimpan untuk semua komputer');
    }
  } catch (error) {
    if (notify) {
      showSaveNote(error.message || 'Gagal simpan ke server');
    }
  }
}

async function migrateLocalBoundsIfNeeded() {
  if (!props.isAdmin || !props.adminToken) return;
  try {
    const remote = await fetchFactoryBounds();
    if (remote) {
      applySharedBounds(remote, { refreshView: Boolean(map) });
      return;
    }
    const local = loadBounds();
    if (local) {
      sharedBounds = local;
      await saveFactoryBoundsApi(props.adminToken, local);
    }
  } catch {
    // biarkan cache lokal
  }
}

async function bootstrapSharedBounds() {
  try {
    const remote = await fetchFactoryBounds();
    if (remote) {
      applySharedBounds(remote, { refreshView: false });
      return;
    }

    const local = loadBounds();
    sharedBounds = local;
    if (local && props.isAdmin && props.adminToken) {
      try {
        await saveFactoryBoundsApi(props.adminToken, local);
      } catch {
        // tetap pakai lokal
      }
    }
  } catch {
    sharedBounds = loadBounds();
  }
}

function writeInputs(bounds) {
  south.value = bounds.south.toFixed(6);
  west.value = bounds.west.toFixed(6);
  north.value = bounds.north.toFixed(6);
  east.value = bounds.east.toFixed(6);
  rotation.value = normalizeRotation(bounds.rotation);
}

function readInputs() {
  const next = {
    south: Number(south.value),
    west: Number(west.value),
    north: Number(north.value),
    east: Number(east.value),
    rotation: normalizeRotation(rotation.value),
  };

  if ([next.south, next.west, next.north, next.east].some((n) => !Number.isFinite(n))) {
    return null;
  }
  if (next.south >= next.north || next.west >= next.east) {
    return null;
  }
  return next;
}

function ensureOverlay(bounds) {
  const corners = overlayCorners(bounds);

  if (floorOverlay) {
    floorOverlay.reposition(corners.topLeft, corners.topRight, corners.bottomLeft);
    return;
  }

  floorOverlay = imageOverlayRotated(
    FLOORPLAN_URL,
    corners.topLeft,
    corners.topRight,
    corners.bottomLeft,
    {
      opacity: overlayOpacity.value,
      interactive: false,
      zIndex: 3,
    },
  );
}

function removeOverlay() {
  if (floorOverlay && map) {
    map.removeLayer(floorOverlay);
  }
}

function removeCalibHandles() {
  unbindOverlayDrag();
  if (swMarker && map) map.removeLayer(swMarker);
  if (neMarker && map) map.removeLayer(neMarker);
  if (moveMarker && map) map.removeLayer(moveMarker);
  swMarker = null;
  neMarker = null;
  moveMarker = null;
}

function eventToLatLng(e) {
  const src = e.touches?.[0] || e.changedTouches?.[0] || e;
  return map.mouseEventToLatLng(src);
}

function stopOverlayDrag() {
  overlayDrag = null;
  L.DomEvent.off(document, 'mousemove', onOverlayMouseMove);
  L.DomEvent.off(document, 'mouseup', onOverlayMouseUp);
  L.DomEvent.off(document, 'touchmove', onOverlayMouseMove);
  L.DomEvent.off(document, 'touchend', onOverlayMouseUp);
  if (map) map.dragging.enable();
  if (mapMode.value === 'calibrate') {
    floorOverlay?.setMoveable(true);
  }
}

function onOverlayMouseDown(e) {
  if (e.touches && e.touches.length > 1) return;
  const startBounds = readInputs();
  if (!startBounds) return;

  L.DomEvent.stop(e);
  overlayDrag = {
    startBounds,
    startLatLng: eventToLatLng(e),
  };
  map.dragging.disable();
  const overlayEl = floorOverlay?.getElement();
  if (overlayEl) overlayEl.style.cursor = 'grabbing';

  L.DomEvent.on(document, 'mousemove', onOverlayMouseMove);
  L.DomEvent.on(document, 'mouseup', onOverlayMouseUp);
  L.DomEvent.on(document, 'touchmove', onOverlayMouseMove);
  L.DomEvent.on(document, 'touchend', onOverlayMouseUp);
}

function onOverlayMouseMove(e) {
  if (!overlayDrag) return;
  L.DomEvent.stop(e);
  const now = eventToLatLng(e);
  const next = shiftBounds(
    overlayDrag.startBounds,
    now.lat - overlayDrag.startLatLng.lat,
    now.lng - overlayDrag.startLatLng.lng,
  );
  writeInputs(next);
  ensureOverlay(next);
  syncCalibHandles(next);
}

function onOverlayMouseUp() {
  if (!overlayDrag) return;
  stopOverlayDrag();
  persistCalibration(false);
}

function bindOverlayDrag() {
  unbindOverlayDrag();
  if (!floorOverlay) return;
  floorOverlay.setMoveable(true);
  const el = floorOverlay.getElement();
  if (!el) return;
  L.DomEvent.on(el, 'mousedown', onOverlayMouseDown);
  L.DomEvent.on(el, 'touchstart', onOverlayMouseDown);
}

function unbindOverlayDrag() {
  stopOverlayDrag();
  if (!floorOverlay) return;
  const el = floorOverlay.getElement();
  if (el) {
    L.DomEvent.off(el, 'mousedown', onOverlayMouseDown);
    L.DomEvent.off(el, 'touchstart', onOverlayMouseDown);
  }
  floorOverlay.setMoveable(false);
}

function fitToOverlay(bounds, { padding = [8, 8], maxZoom = 22, zoomBoost = 0 } = {}) {
  map.invalidateSize();
  map.fitBounds(L.latLngBounds(rotatedLatLngs(bounds)), {
    padding,
    maxZoom,
    animate: false,
  });

  if (zoomBoost > 0) {
    const nextZoom = Math.min(map.getZoom() + zoomBoost, maxZoom);
    if (nextZoom > map.getZoom()) {
      map.setZoom(nextZoom, { animate: false });
    }
  }
}

function syncCalibHandles(bounds) {
  const corners = overlayCorners(bounds);
  const center = overlayCenter(bounds);

  if (swMarker) {
    swMarker.setLatLng(corners.bottomLeft);
    neMarker.setLatLng(corners.topRight);
    if (moveMarker && !moveDragStart) {
      moveMarker.setLatLng(center);
    }
    return;
  }

  swMarker = L.marker(corners.bottomLeft, {
    draggable: true,
    zIndexOffset: 800,
    icon: cornerIcon('SW'),
  }).addTo(map);

  neMarker = L.marker(corners.topRight, {
    draggable: true,
    zIndexOffset: 800,
    icon: cornerIcon('NE'),
  }).addTo(map);

  moveMarker = L.marker(center, {
    draggable: true,
    zIndexOffset: 850,
    icon: L.divIcon({
      className: '',
      html: '<div class="calib-pin move">GESER</div>',
      iconSize: [58, 28],
      iconAnchor: [29, 14],
    }),
  }).addTo(map);

  const onCornerDrag = () => {
    const next = boundsFromRotatedCorners(
      swMarker.getLatLng(),
      neMarker.getLatLng(),
      normalizeRotation(rotation.value),
    );
    writeInputs(next);
    ensureOverlay(next);
    moveMarker.setLatLng(overlayCenter(next));
  };

  swMarker.on('drag', onCornerDrag);
  neMarker.on('drag', onCornerDrag);
  swMarker.on('dragend', () => persistCalibration(false));
  neMarker.on('dragend', () => persistCalibration(false));

  moveMarker.on('dragstart', () => {
    moveDragStart = {
      bounds: readInputs(),
      center: moveMarker.getLatLng(),
    };
  });

  moveMarker.on('drag', () => {
    if (!moveDragStart?.bounds) return;
    const now = moveMarker.getLatLng();
    const next = shiftBounds(
      moveDragStart.bounds,
      now.lat - moveDragStart.center.lat,
      now.lng - moveDragStart.center.lng,
    );
    writeInputs(next);
    ensureOverlay(next);
    swMarker.setLatLng(overlayCorners(next).bottomLeft);
    neMarker.setLatLng(overlayCorners(next).topRight);
  });

  moveMarker.on('dragend', () => {
    moveDragStart = null;
    persistCalibration(false);
  });
}

function applyOverlayVisual() {
  if (!floorOverlay) return;

  if (mapMode.value === 'floor') {
    floorOverlay.setOpacity(1);
  } else if (mapMode.value === 'calibrate') {
    floorOverlay.setOpacity(overlayOpacity.value);
  }
}

function applyMode() {
  if (!map) return;

  const bounds = currentOverlayBounds();
  writeInputs(bounds);

  map.getContainer().style.background = mapMode.value === 'floor' ? '#ffffff' : '';
  map.dragging.enable();
  map.scrollWheelZoom.enable();
  map.touchZoom.enable();
  map.doubleClickZoom.enable();

  if (mapMode.value === 'osm') {
    unbindFloorViewPersist();
    osmLayer?.setOpacity(1);
    removeCalibHandles();
    removeOverlay();
    map.setMaxZoom(19);
    return;
  }

  ensureOverlay(bounds);
  if (!map.hasLayer(floorOverlay)) {
    floorOverlay.addTo(map);
  }
  applyOverlayVisual();
  map.setMaxZoom(22);

  if (mapMode.value === 'calibrate') {
    unbindFloorViewPersist();
    osmLayer?.setOpacity(1);
    syncCalibHandles(bounds);
    bindOverlayDrag();
    fitToOverlay(bounds, { padding: [40, 40], maxZoom: 19, zoomBoost: 0 });
    return;
  }

  osmLayer?.setOpacity(0);
  removeCalibHandles();
  floorOverlay?.setMoveable(false);
  applyFloorView(bounds);
  bindFloorViewPersist();
}

function persistCalibration(showNote) {
  const bounds = readInputs();
  if (!bounds) return;

  sharedBounds = bounds;
  saveBounds(bounds);
  ensureOverlay(bounds);
  if (mapMode.value === 'calibrate') {
    syncCalibHandles(bounds);
  }
  applyOverlayVisual();

  if (serverSaveTimer) {
    clearTimeout(serverSaveTimer);
    serverSaveTimer = null;
  }

  if (showNote) {
    pushBoundsToServer(bounds, { notify: true });
    return;
  }

  // Auto-simpan (geser/putar) — debounce agar tidak spam API
  serverSaveTimer = setTimeout(() => {
    serverSaveTimer = null;
    pushBoundsToServer(bounds, { notify: false });
  }, 700);
}

function saveCalibration() {
  persistCalibration(true);
}

async function resetCalibration() {
  if (serverSaveTimer) {
    clearTimeout(serverSaveTimer);
    serverSaveTimer = null;
  }

  sharedBounds = null;
  clearBounds();

  if (props.isAdmin && props.adminToken) {
    try {
      await clearFactoryBoundsRemote(props.adminToken);
      showSaveNote('Kalibrasi direset di semua komputer');
    } catch (error) {
      showSaveNote(error.message || 'Gagal reset di server');
    }
  } else {
    showSaveNote('Kalibrasi direset. Geser denah lalu simpan.');
  }

  applyMode();
}

function onInputBounds() {
  const bounds = readInputs();
  if (!bounds || !floorOverlay) return;
  ensureOverlay(bounds);
  if (mapMode.value === 'calibrate') {
    syncCalibHandles(bounds);
  }
}

function onRotateInput() {
  onInputBounds();
}

function onRotateChange() {
  persistCalibration(false);
}

function nudgeRotation(delta) {
  rotation.value = normalizeRotation(Number(rotation.value) + delta);
  onInputBounds();
  persistCalibration(false);
}

function setMode(mode) {
  if (!props.isAdmin && mode === 'calibrate') return;
  mapMode.value = mode;
  localStorage.setItem(MAP_MODE_KEY, mode);
  applyMode();
  nextTick(() => {
    map?.invalidateSize();
    if (mode === 'floor') {
      applyFloorView(currentOverlayBounds());
      bindFloorViewPersist();
    }
  });
}

function ensureMap() {
  if (map || !mapElement.value) return;

  map = L.map(mapElement.value, {
    zoomControl: false,
  }).setView(defaultCenter, 12);

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);

  if (typeof ResizeObserver !== 'undefined' && mapElement.value) {
    mapResizeObserver = new ResizeObserver(() => {
      map?.invalidateSize({ animate: false });
    });
    mapResizeObserver.observe(mapElement.value);
  }
}

function stopMarkerAnimation(userId) {
  const frame = markerAnimations.get(userId);
  if (frame) {
    cancelAnimationFrame(frame);
    markerAnimations.delete(userId);
  }
}

function animateMarkerTo(marker, userId, toLat, toLng) {
  stopMarkerAnimation(userId);

  const from = marker.getLatLng();
  const start = performance.now();
  const dLat = toLat - from.lat;
  const dLng = toLng - from.lng;

  // Loncatan kecil: langsung set, tanpa animasi berat
  if (Math.abs(dLat) < 1e-7 && Math.abs(dLng) < 1e-7) {
    marker.setLatLng([toLat, toLng]);
    return;
  }

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - (Math.pow(-2 * t + 2, 2) / 2);
  }

  function step(now) {
    const t = Math.min(1, (now - start) / MARKER_ANIM_MS);
    const e = easeInOut(t);
    marker.setLatLng([from.lat + dLat * e, from.lng + dLng * e]);
    if (t < 1) {
      markerAnimations.set(userId, requestAnimationFrame(step));
    } else {
      markerAnimations.delete(userId);
    }
  }

  markerAnimations.set(userId, requestAnimationFrame(step));
}

function upsertMarker(location) {
  if (!map) return;

  const key = location.userId;
  const latLng = [location.lat, location.lng];
  const popupText = `
    <strong>${location.name}</strong><br/>
    @${location.username}<br/>
    Status: ${location.online ? 'Online' : 'Offline'}<br/>
    Akurasi: ${location.accuracy != null ? `${Math.round(location.accuracy)} m` : '-'}<br/>
    Update: ${new Date(location.timestamp || location.updatedAt).toLocaleTimeString('id-ID')}
  `;

  if (markers.has(key)) {
    const marker = markers.get(key);
    animateMarkerTo(marker, key, location.lat, location.lng);
    marker.setIcon(createMarkerIcon(location));
    marker.setPopupContent(popupText);
    return;
  }

  const marker = L.marker(latLng, {
    icon: createMarkerIcon(location),
  })
    .addTo(map)
    .bindPopup(popupText);

  markers.set(key, marker);
}

function maybeInitialFit() {
  if (hasInitialFit || mapMode.value !== 'osm' || !map) return;

  const valid = validLocations();
  if (valid.length === 0) return;

  hasInitialFit = true;
  if (valid.length === 1) {
    map.setView([valid[0].lat, valid[0].lng], 17);
    return;
  }

  map.fitBounds(
    L.latLngBounds(valid.map((item) => [item.lat, item.lng])),
    { padding: [40, 40] },
  );
}

function syncMarkers() {
  if (!map) return;

  const activeIds = new Set();

  validLocations().forEach((location) => {
    activeIds.add(location.userId);
    upsertMarker(location);
  });

  markers.forEach((marker, userId) => {
    if (!activeIds.has(userId)) {
      stopMarkerAnimation(userId);
      map.removeLayer(marker);
      markers.delete(userId);
    }
  });

  maybeInitialFit();
}

watch(
  () => props.locations,
  () => {
    ensureMap();
    syncMarkers();
  },
  { deep: true },
);

watch(
  () => props.focusUserId,
  (userId) => {
    if (!userId || !markers.has(userId) || mapMode.value === 'calibrate') return;
    const marker = markers.get(userId);
    const { lat, lng } = marker.getLatLng();
    map.setView([lat, lng], mapMode.value === 'floor' ? 19 : 16);
    marker.openPopup();
  },
);

watch(overlayOpacity, () => {
  if (mapMode.value === 'calibrate') {
    applyOverlayVisual();
  }
});

watch(
  () => props.isAdmin,
  (admin) => {
    if (!admin && mapMode.value === 'calibrate') {
      setMode('floor');
    }
  },
);

watch(
  () => [props.isAdmin, props.adminToken],
  () => {
    migrateLocalBoundsIfNeeded();
  },
);

onMounted(async () => {
  await bootstrapSharedBounds();
  ensureMap();
  if (!props.isAdmin && mapMode.value === 'calibrate') {
    mapMode.value = 'floor';
    localStorage.setItem(MAP_MODE_KEY, 'floor');
  }
  syncMarkers();
  if (mapMode.value !== 'osm') {
    nextTick(() => applyMode());
  }
});

onUnmounted(() => {
  if (saveNoteTimer) clearTimeout(saveNoteTimer);
  if (serverSaveTimer) clearTimeout(serverSaveTimer);
  if (mapResizeObserver) {
    mapResizeObserver.disconnect();
    mapResizeObserver = null;
  }
  unbindFloorViewPersist();
  unbindOverlayDrag();
  removeCalibHandles();
  if (map) {
    map.remove();
    map = null;
  }
  osmLayer = null;
  floorOverlay = null;
  markerAnimations.forEach((_, userId) => stopMarkerAnimation(userId));
  markers.clear();
});

defineExpose({
  applyRemoteBounds(bounds) {
    applyingRemote = true;
    try {
      applySharedBounds(bounds, { refreshView: true });
    } finally {
      applyingRemote = false;
    }
  },
});
</script>

<template>
  <div class="map-shell">
    <div class="map-toolbar">
      <button type="button" :class="{ active: mapMode === 'osm' }" @click="setMode('osm')">
        Peta
      </button>
      <button type="button" :class="{ active: mapMode === 'floor' }" @click="setMode('floor')">
        Denah pabrik
      </button>
      <button
        v-if="isAdmin"
        type="button"
        :class="{ active: mapMode === 'calibrate' }"
        @click="setMode('calibrate')"
      >
        Kalibrasi
      </button>
    </div>

    <aside v-if="mapMode === 'calibrate'" class="calibrate-panel">
      <p>Tarik denah atau tombol <strong>GESER</strong> untuk pindah posisi. SW/NE untuk ukuran, Putar untuk sudut.</p>

      <label class="opacity-row">
        Transparansi denah
        <input v-model.number="overlayOpacity" type="range" min="0.2" max="1" step="0.05" />
      </label>

      <div class="rotate-block">
        <div class="rotate-head">
          <span>Putar denah</span>
          <strong>{{ Number(rotation).toFixed(1) }}°</strong>
        </div>
        <div class="rotate-row">
          <button type="button" @click="nudgeRotation(-5)">-5°</button>
          <button type="button" @click="nudgeRotation(-1)">-1°</button>
          <input
            v-model.number="rotation"
            type="range"
            min="-180"
            max="180"
            step="0.5"
            @input="onRotateInput"
            @change="onRotateChange"
          />
          <button type="button" @click="nudgeRotation(1)">+1°</button>
          <button type="button" @click="nudgeRotation(5)">+5°</button>
        </div>
      </div>

      <button type="button" class="coords-toggle" @click="showCoords = !showCoords">
        {{ showCoords ? 'Sembunyikan koordinat' : 'Koordinat manual' }}
      </button>

      <div v-if="showCoords" class="coord-grid">
        <label>
          SW lat
          <input v-model="south" type="number" step="0.000001" @change="onInputBounds" />
        </label>
        <label>
          SW lng
          <input v-model="west" type="number" step="0.000001" @change="onInputBounds" />
        </label>
        <label>
          NE lat
          <input v-model="north" type="number" step="0.000001" @change="onInputBounds" />
        </label>
        <label>
          NE lng
          <input v-model="east" type="number" step="0.000001" @change="onInputBounds" />
        </label>
      </div>

      <div class="calib-actions">
        <button type="button" class="save" @click="saveCalibration">Simpan</button>
        <button type="button" class="reset" @click="resetCalibration">Reset</button>
      </div>
      <small v-if="saveNote">{{ saveNote }}</small>
    </aside>

    <div ref="mapElement" class="map"></div>
  </div>
</template>

<style scoped>
.map-shell {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 360px;
}

.map {
  width: 100%;
  height: 100%;
}

.map-toolbar {
  position: absolute;
  top: 12px;
  left: 50%;
  z-index: 500;
  display: flex;
  gap: 0.35rem;
  padding: 0.3rem;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.1);
  transform: translateX(-50%);
}

.map-toolbar button {
  border: none;
  border-radius: 8px;
  padding: 0.45rem 0.75rem;
  background: transparent;
  color: var(--muted);
  font-size: 0.82rem;
}

.map-toolbar button.active {
  background: var(--blue);
  color: #fff;
}

.calibrate-panel {
  position: absolute;
  top: auto;
  right: auto;
  bottom: 12px;
  left: 12px;
  z-index: 500;
  width: min(340px, calc(100% - 72px));
  display: grid;
  gap: 0.55rem;
  padding: 0.85rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.97);
  color: var(--text);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  pointer-events: auto;
}

.calibrate-panel p {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.4;
  color: var(--muted);
}

.opacity-row,
.coord-grid label {
  display: grid;
  gap: 0.3rem;
  font-size: 0.75rem;
  color: var(--muted);
}

.coord-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.rotate-block {
  display: grid;
  gap: 0.4rem;
}

.rotate-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
  color: var(--muted);
}

.rotate-head strong {
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.rotate-row {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.rotate-row input[type='range'] {
  flex: 1;
  min-width: 0;
}

.rotate-row button {
  border: none;
  border-radius: 6px;
  padding: 0.3rem 0.4rem;
  background: var(--blue-soft);
  color: var(--blue-dark);
  font-size: 0.72rem;
  white-space: nowrap;
}

.coord-grid input,
.opacity-row input[type='range'] {
  width: 100%;
}

.coord-grid input {
  padding: 0.4rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
  color: var(--text);
}

.calib-actions {
  display: flex;
  gap: 0.5rem;
}

.calib-actions button {
  border: none;
  border-radius: 8px;
  padding: 0.5rem 0.75rem;
  color: white;
  font-size: 0.8rem;
}

.calib-actions .save {
  background: #16a34a;
}

.calib-actions .reset {
  background: var(--blue);
}

.coords-toggle {
  border: none;
  padding: 0;
  background: transparent;
  color: var(--blue);
  font-size: 0.75rem;
  text-align: left;
  text-decoration: underline;
}

.calibrate-panel small {
  color: var(--ok);
}

:global(.tracker-marker-icon) {
  background: none !important;
  border: none !important;
  overflow: visible !important;
}

:global(.tracker-marker) {
  position: relative;
  width: 36px;
  height: 46px;
}

:global(.tracker-label) {
  position: absolute;
  left: 50%;
  bottom: 50px;
  z-index: 2;
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  padding: 0.28rem 0.5rem;
  border-radius: 6px;
  background: #fff;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.18);
  white-space: nowrap;
  pointer-events: none;
  transform: translateX(-50%);
}

:global(.tracker-label b) {
  color: #111827;
  font-size: 13px;
  font-weight: 700;
}

:global(.tracker-label span) {
  color: #9ca3af;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

:global(.tracker-status-offline) {
  color: #9ca3af !important;
}

:global(.tracker-marker.is-offline) {
  opacity: 0.92;
}

:global(.tracker-pin) {
  position: absolute;
  top: 2px;
  left: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 4px solid #fff;
  border-radius: 50% 50% 50% 0;
  background: #9ca3af;
  box-shadow: 0 3px 8px rgba(15, 23, 42, 0.22);
  transform: rotate(-45deg);
}

:global(.tracker-letter) {
  color: #fff;
  font-size: 14px;
  font-weight: 800;
  line-height: 1;
  transform: rotate(45deg);
}

:global(.calib-pin) {
  min-width: 40px;
  padding: 0.2rem 0.35rem;
  border-radius: 8px;
  background: #f59e0b;
  color: #111827;
  font-size: 0.7rem;
  font-weight: 700;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
}

:global(.calib-pin.move) {
  min-width: 58px;
  background: #2563eb;
  color: white;
}
</style>

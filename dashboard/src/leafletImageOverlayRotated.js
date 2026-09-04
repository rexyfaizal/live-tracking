import L from 'leaflet';

const RotatedImageOverlay = L.ImageOverlay.extend({
  initialize(image, topleft, topright, bottomleft, options) {
    if (typeof image === 'string') {
      this._url = image;
    } else {
      this._rawImage = image;
    }

    this._topLeft = L.latLng(topleft);
    this._topRight = L.latLng(topright);
    this._bottomLeft = L.latLng(bottomleft);
    L.setOptions(this, options);
  },

  onAdd(map) {
    if (!this._image) {
      this._initImage();
      if (this.options.opacity < 1) {
        this._updateOpacity();
      }
    }

    if (this.options.interactive) {
      L.DomUtil.addClass(this._rawImage, 'leaflet-interactive');
      this.addInteractiveTarget(this._rawImage);
    }

    map.on('zoom viewreset', this._reset, this);
    this.getPane().appendChild(this._image);
    this._reset();
  },

  onRemove(map) {
    map.off('zoom viewreset', this._reset, this);
    L.ImageOverlay.prototype.onRemove.call(this, map);
  },

  _initImage() {
    let img = this._rawImage;
    if (this._url) {
      img = L.DomUtil.create('img');
      img.style.display = 'none';
      if (this.options.crossOrigin) {
        img.crossOrigin = '';
      }
      img.src = this._url;
      this._rawImage = img;
    }

    L.DomUtil.addClass(img, 'leaflet-image-layer');

    const div = (this._image = L.DomUtil.create('div', 'leaflet-image-layer'));
    this._updateZIndex();
    div.appendChild(img);

    div.style.pointerEvents = 'none';
    img.style.pointerEvents = 'none';
    img.draggable = false;
    img.onselectstart = L.Util.falseFn;
    img.ondragstart = L.Util.falseFn;
    img.onmousemove = L.Util.falseFn;
    div.onselectstart = L.Util.falseFn;

    img.onload = () => {
      this._reset();
      img.style.display = 'block';
      this.fire('load');
    };

    img.alt = this.options.alt || '';
  },

  _reset() {
    const div = this._image;
    if (!this._map || !div) return;

    const pxTopLeft = this._map.latLngToLayerPoint(this._topLeft);
    const pxTopRight = this._map.latLngToLayerPoint(this._topRight);
    const pxBottomLeft = this._map.latLngToLayerPoint(this._bottomLeft);
    const pxBottomRight = pxTopRight.subtract(pxTopLeft).add(pxBottomLeft);
    const pxBounds = L.bounds([pxTopLeft, pxTopRight, pxBottomLeft, pxBottomRight]);
    const size = pxBounds.getSize();
    const pxTopLeftInDiv = pxTopLeft.subtract(pxBounds.min);

    this._bounds = L.latLngBounds(
      this._map.layerPointToLatLng(pxBounds.min),
      this._map.layerPointToLatLng(pxBounds.max),
    );

    L.DomUtil.setPosition(div, pxBounds.min);
    div.style.width = `${size.x}px`;
    div.style.height = `${size.y}px`;

    const imgW = this._rawImage.width;
    const imgH = this._rawImage.height;
    if (!imgW || !imgH) return;

    const vectorX = pxTopRight.subtract(pxTopLeft);
    const vectorY = pxBottomLeft.subtract(pxTopLeft);

    this._rawImage.style.transformOrigin = '0 0';
    this._rawImage.style.transform = `matrix(${vectorX.x / imgW}, ${vectorX.y / imgW}, ${vectorY.x / imgH}, ${vectorY.y / imgH}, ${pxTopLeftInDiv.x}, ${pxTopLeftInDiv.y})`;
  },

  reposition(topleft, topright, bottomleft) {
    this._topLeft = L.latLng(topleft);
    this._topRight = L.latLng(topright);
    this._bottomLeft = L.latLng(bottomleft);
    this._reset();
  },

  setMoveable(enabled) {
    const pointer = enabled ? 'auto' : 'none';
    const cursor = enabled ? 'grab' : '';
    const toggleClass = enabled ? 'addClass' : 'removeClass';

    if (this._image) {
      this._image.style.pointerEvents = pointer;
      this._image.style.cursor = cursor;
      L.DomUtil[toggleClass](this._image, 'leaflet-interactive');
    }

    if (this._rawImage) {
      this._rawImage.style.pointerEvents = pointer;
      this._rawImage.style.cursor = cursor;
      L.DomUtil[toggleClass](this._rawImage, 'leaflet-interactive');
    }
  },
});

export function imageOverlayRotated(url, topLeft, topRight, bottomLeft, options) {
  return new RotatedImageOverlay(url, topLeft, topRight, bottomLeft, options);
}

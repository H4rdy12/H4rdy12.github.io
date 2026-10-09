// Data coverage maps for project pages.
//
// Draws one small globe per coverage area in data/extents.geojson (matched on "project"),
// e.g. Earthwave gets a Greenland globe and an Antarctica globe, because the two poles
// can never be in view at the same time. The work-location pin from data/projects.geojson
// is added to each globe. Projects with no extents (e.g. global data) get a single globe.
//
// Usage: <div id="coverage-maps" class="coverage-grid" data-project="earthwave"></div>

const STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
const EXTENT = '#2563eb';
const ACCENT = '#0f766e';

const coordsOf = (f) => (f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates);
const lats = (fs) => fs.flatMap((f) => coordsOf(f).map((c) => c[1]));
const lons = (fs) => fs.flatMap((f) => coordsOf(f).map((c) => c[0]));

// An extent that rings a pole (spans ~all longitudes), e.g. Antarctica
const ringsPole = (fs) => Math.max(...lons(fs)) - Math.min(...lons(fs)) >= 300;

(async () => {
  const container = document.getElementById('coverage-maps');
  const id = container.dataset.project;

  const [projects, extents] = await Promise.all([
    fetch('../data/projects.geojson').then((r) => r.json()),
    fetch('../data/extents.geojson').then((r) => r.json())
  ]);
  const project = projects.features.find((f) => f.properties.id === id);
  const pin = project.geometry.coordinates;

  // Group this project's extents by label: one globe per coverage area
  const groups = new Map();
  for (const f of extents.features.filter((e) => e.properties.project === id)) {
    if (!groups.has(f.properties.label)) groups.set(f.properties.label, []);
    groups.get(f.properties.label).push(f);
  }
  if (!groups.size) groups.set(project.properties.coverage, []); // e.g. "Global"

  // Lay out every figure before creating any map, so each map starts at its final size
  const figures = [];
  for (const [label, features] of groups) {
    const figure = document.createElement('figure');
    figure.className = 'coverage-map';
    const mapEl = document.createElement('div');
    mapEl.className = 'mini-map';
    const caption = document.createElement('figcaption');
    caption.textContent = label;
    figure.append(mapEl, caption);
    container.appendChild(figure);
    figures.push([mapEl, features]);
  }
  figures.forEach(([mapEl, features]) => drawGlobe(mapEl, features, pin));

  figures.forEach(([mapEl, features]) => drawGlobe(mapEl, features, pin));

  renderLogos(project.properties);   // NEW
})();


// Logo strip at the bottom of the page: the project's own "logo", then any "partner_logos"
// ({ "src", "alt", "url" }). Paths in projects.geojson are relative to the site root.
function renderLogos(p) {
  const strip = document.getElementById('logo-strip');
  if (!strip) return;
  const logos = [
    ...(p.logo ? [{ src: p.logo, alt: `${p.title} logo` }] : []),
    ...(p.partner_logos || [])
  ];
  if (!logos.length) return;

  for (const { src, alt = '', url } of logos) {
    const img = document.createElement('img');
    img.src = `../${src}`;
    img.alt = alt;
    img.loading = 'lazy';
    if (url) {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.appendChild(img);
      strip.appendChild(a);
    } else {
      strip.appendChild(img);
    }
  }
  strip.hidden = false;
}

function drawGlobe(el, features, pin) {
  const map = new maplibregl.Map({
    container: el,
    style: STYLE,
    center: pin,
    zoom: 0,
    renderWorldCopies: false, // stops fills at the antimeridian being drawn twice
    attributionControl: { compact: true }
  });
  // Globe projection avoids Web Mercator's distortion near the poles
  map.on('style.load', () => map.setProjection({ type: 'globe' }));

  map.on('load', () => {
    // buffer: 0 stops polygons near the poles being drawn twice where globe tiles overlap
    map.addSource('extent', { type: 'geojson', data: { type: 'FeatureCollection', features }, buffer: 0 });
    map.addLayer({
      id: 'extent-fill', type: 'fill', source: 'extent',
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': EXTENT, 'fill-opacity': 0.18, 'fill-antialias': false } // no seams between split polygons
    });
    map.addLayer({
      id: 'extent-line', type: 'line', source: 'extent',
      // Polygons split for rendering set "outline": false; a LineString draws their boundary instead
      filter: ['any', ['==', ['geometry-type'], 'LineString'], ['!=', ['get', 'outline'], false]],
      paint: { 'line-color': EXTENT, 'line-width': 1.5, 'line-dasharray': [3, 2] }
    });
    // Work-location pin (skipped when looking at the opposite pole, where it would sit on the far side)
    const oppositePole = ringsPole(features) && Math.sign(lats(features)[0]) !== Math.sign(pin[1]);
    if (!oppositePole) new maplibregl.Marker({ color: ACCENT, scale: 0.7 }).setLngLat(pin).addTo(map);

    if (!features.length) {
      map.jumpTo({ center: pin, zoom: 0.4 }); // global: whole globe, centred on the work location
    } else if (ringsPole(features)) {
      // Look down on the pole. Globe zoom is scaled by latitude, so keep it low near the poles.
      const south = lats(features)[0] < 0;
      map.jumpTo({ center: [0, south ? -72 : 72], zoom: 0.4 });
    } else {
      const b = new maplibregl.LngLatBounds();
      features.forEach((f) => coordsOf(f).forEach((c) => b.extend(c)));
      // fitBounds can drift off-centre on a globe at high latitudes, so centre on the box ourselves
      const cam = map.cameraForBounds(b, { padding: 30, maxZoom: 6 });
      map.jumpTo({ center: b.getCenter(), zoom: cam ? cam.zoom : 2 });
    }
  });
}

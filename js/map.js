// Geospatial portfolio map
//
// Pins show where the work happened. Projects at the same location share one pin.
// Data coverage is shown on each project page (see js/project-page.js).
//
// data/projects.geojson  one Point per project (work location) + details

const BASEMAP = 'https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json';
const ACCENT = '#0f766e';
const CONFERENCE = '#dc2626'; // red pins for conferences

const map = new maplibregl.Map({
  container: 'map',
  style: BASEMAP,
  center: [-3.5, 54.8],
  zoom: 5,
  attributionControl: { compact: true }
});

map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

let projects = [];
let conferences = [];
let popup = null;

map.on('load', async () => {
  // Basemap colour tweaks
  if (map.getLayer('water')) map.setPaintProperty('water', 'fill-color', '#88a6b1');

  const [data, confData] = await Promise.all([
    fetch('data/projects.geojson').then((r) => r.json()),
    fetch('data/conferences.geojson').then((r) => r.json())
  ]);
  projects = data.features;
  conferences = confData.features;

  // Conferences: red pins, one per location (e.g. all CPOM meetings share Castleton)
  map.addSource('conferences', { type: 'geojson', data: placesFrom(conferences) });
  map.addLayer({
    id: 'conference-points',
    type: 'circle',
    source: 'conferences',
    paint: {
      'circle-color': CONFERENCE,
      'circle-radius': ['+', 3, ['get', 'count']],
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#ffffff'
    }
  });

  map.addSource('places', { type: 'geojson', data: placesFrom(projects) });
  map.addLayer({
    id: 'place-points',
    type: 'circle',
    source: 'places',
    paint: {
      'circle-color': ACCENT,
      'circle-radius': ['+', 6, ['*', 2, ['get', 'count']]],
      'circle-stroke-width': 2.5,
      'circle-stroke-color': '#ffffff'
    }
  });
  map.addLayer({
    id: 'place-labels',
    type: 'symbol',
    source: 'places',
    layout: {
      'text-field': ['get', 'place'],
      'text-font': ['Montserrat Medium', 'Open Sans Bold'],
      'text-size': 12,
      'text-offset': [0, 1.4],
      'text-anchor': 'top'
    },
    paint: { 'text-color': '#1d2327', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 }
  });

  map.on('click', 'place-points', (e) => {
    const place = e.features[0];
    selectProjects(JSON.parse(place.properties.ids), place.geometry.coordinates.slice());
  });
  map.on('mouseenter', 'place-points', () => (map.getCanvas().style.cursor = 'pointer'));
  map.on('mouseleave', 'place-points', () => (map.getCanvas().style.cursor = ''));

  map.on('click', 'conference-points', (e) => {
    const place = e.features[0];
    selectConferences(JSON.parse(place.properties.ids), place.geometry.coordinates.slice());
  });
  map.on('mouseenter', 'conference-points', () => (map.getCanvas().style.cursor = 'pointer'));
  map.on('mouseleave', 'conference-points', () => (map.getCanvas().style.cursor = ''));

  buildToolFilter();
  renderList(projects);
  fitToFeatures([...projects, ...conferences]);
});

// ---------- Helpers ----------

// Group projects that share a location into one pin
function placesFrom(features) {
  const groups = new Map();
  for (const f of features) {
    const key = f.geometry.coordinates.join(',');
    if (!groups.has(key)) groups.set(key, { coords: f.geometry.coordinates, place: f.properties.place, ids: [] });
    groups.get(key).ids.push(f.properties.id);
  }
  return {
    type: 'FeatureCollection',
    features: [...groups.values()].map((g) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: g.coords },
      properties: { place: g.place, ids: JSON.stringify(g.ids), count: g.ids.length }
    }))
  };
}

const byId = (id) => projects.find((f) => f.properties.id === id);

// GeoJSON array properties come back from MapLibre as strings
function parseTools(tools) {
  if (Array.isArray(tools)) return tools;
  try { return JSON.parse(tools); } catch { return []; }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function tagsHtml(tools) {
  return `<div class="tags">${parseTools(tools).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>`;
}

function fitToFeatures(features) {
  if (!features.length) return;
  const b = new maplibregl.LngLatBounds();
  features.forEach((f) => b.extend(f.geometry.coordinates));
  map.fitBounds(b, { padding: 100, maxZoom: 6, duration: 800 });
}

// ---------- Selection ----------

function selectProjects(ids, coords) {
  if (popup) popup.remove();
  const items = ids.map(byId).filter(Boolean);
  popup = new maplibregl.Popup({ offset: 14, maxWidth: '300px' })
    .setLngLat(coords)
    .setHTML(`
      <div class="popup">
        <div class="popup-place">${escapeHtml(items[0]?.properties.place ?? '')}</div>
        ${items.map(({ properties: p }) => `
          <div class="popup-item">
            <h3>${escapeHtml(p.title)}</h3>
            <div class="meta">${escapeHtml(p.role)} · ${escapeHtml(p.dates)}</div>
            <p>${escapeHtml(p.summary)}</p>
            <div class="coverage">Data coverage: ${escapeHtml(p.coverage)}</div>
            <a href="${escapeHtml(p.url)}">View project →</a>
          </div>`).join('')}
      </div>`)
    .addTo(map);

  highlightCards(ids);
  map.flyTo({ center: coords, zoom: Math.max(map.getZoom(), 6), speed: 1.2 });
}

// Popup listing every conference held at one location, newest first, with any materials
function selectConferences(ids, coords) {
  if (popup) popup.remove();
  const items = ids
    .map((id) => conferences.find((f) => f.properties.id === id))
    .filter(Boolean)
    .sort((a, b) => b.properties.sort_year - a.properties.sort_year);

  popup = new maplibregl.Popup({ offset: 12, maxWidth: '300px' })
    .setLngLat(coords)
    .setHTML(`
      <div class="popup">
        <div class="popup-place">${escapeHtml(items[0]?.properties.place ?? '')} · Conference</div>
        ${items.map(({ properties: c }) => `
          <div class="popup-item">
            <h3>${escapeHtml(c.title)}</h3>
            <div class="meta">${escapeHtml(c.contribution)} · ${escapeHtml(c.dates)}</div>
            ${(c.materials || []).length ? `<div class="materials">${c.materials.map((m) =>
              `<a href="${escapeHtml(m.url)}" target="_blank" rel="noopener">${escapeHtml(m.label)} ↗</a>`).join('')}</div>` : ''}
          </div>`).join('')}
      </div>`)
    .addTo(map);
}

// ---------- Sidebar ----------

// ---------- Sidebar ----------

function renderList(features) {
  const list = document.getElementById('project-list');
  list.innerHTML = '';
  const sorted = [...features].sort((a, b) => b.properties.sort_year - a.properties.sort_year);

  for (const f of sorted) {
    const p = f.properties;
    const li = document.createElement('li');
    li.className = 'project-card';
    li.dataset.id = p.id;
    li.tabIndex = 0;
    li.innerHTML = `
    <div class="card-top">
    <h3>${escapeHtml(p.title)}</h3>
    <div class="card-top-right">
      <span class="badge">${escapeHtml(p.category)}</span>
      ${p.logo ? `<img class="card-logo" src="${escapeHtml(p.logo)}" alt="${escapeHtml(p.title)} logo">` : ''}
    </div>
      <div class="meta">${escapeHtml(p.role)} · ${escapeHtml(p.place)} · ${escapeHtml(p.dates)}</div>
      <p>${escapeHtml(p.summary)}</p>
      <div class="coverage">Data coverage: ${escapeHtml(p.coverage)}</div>
      ${tagsHtml(p.tools)}`;

    const select = () => selectProjects([p.id], f.geometry.coordinates.slice());
    li.addEventListener('click', select);
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter') select(); });
    list.appendChild(li);
  }
}

function highlightCards(ids) {
  document.querySelectorAll('.project-card').forEach((el) => {
    el.classList.toggle('active', ids.includes(el.dataset.id));
  });
  const first = document.querySelector('.project-card.active');
  if (first) first.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function buildToolFilter() {
  const tools = new Set(projects.flatMap((f) => parseTools(f.properties.tools)));
  const select = document.getElementById('tool-filter');
  [...tools].sort().forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    select.appendChild(opt);
  });

  select.addEventListener('change', () => {
    const tool = select.value;
    const filtered = tool
      ? projects.filter((f) => parseTools(f.properties.tools).includes(tool))
      : projects;
    map.getSource('places').setData(placesFrom(filtered));
    if (popup) popup.remove();
    renderList(filtered);
    fitToFeatures(filtered);
  });
}

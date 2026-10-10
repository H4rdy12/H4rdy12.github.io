// // Data coverage maps for project pages.
// //
// // Draws one small globe per coverage area in data/extents.geojson (matched on "project"),
// // e.g. Earthwave gets a Greenland globe and an Antarctica globe, because the two poles
// // can never be in view at the same time. The work-location pin from data/projects.geojson
// // is added to each globe. Projects with no extents (e.g. global data) get a single globe.
// //
// // Usage: <div id="coverage-maps" class="coverage-grid" data-project="earthwave"></div>

// const STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
// const EXTENT = '#2563eb';
// const ACCENT = '#0f766e';

// const coordsOf = (f) => (f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates);
// const lats = (fs) => fs.flatMap((f) => coordsOf(f).map((c) => c[1]));
// const lons = (fs) => fs.flatMap((f) => coordsOf(f).map((c) => c[0]));

// // An extent that rings a pole (spans ~all longitudes), e.g. Antarctica
// const ringsPole = (fs) => Math.max(...lons(fs)) - Math.min(...lons(fs)) >= 300;

// (async () => {
//   const container = document.getElementById('coverage-maps');
//   const id = container.dataset.project;

//   const [projects, extents] = await Promise.all([
//     fetch('../data/projects.geojson').then((r) => r.json()),
//     fetch('../data/extents.geojson').then((r) => r.json())
//   ]);
//   const project = projects.features.find((f) => f.properties.id === id);
//   const pin = project.geometry.coordinates;

//   // Group this project's extents by label: one globe per coverage area
//   const groups = new Map();
//   for (const f of extents.features.filter((e) => e.properties.project === id)) {
//     if (!groups.has(f.properties.label)) groups.set(f.properties.label, []);
//     groups.get(f.properties.label).push(f);
//   }
//   if (!groups.size) groups.set(project.properties.coverage, []); // e.g. "Global"

//   // Lay out every figure before creating any map, so each map starts at its final size
//   const figures = [];
//   for (const [label, features] of groups) {
//     const figure = document.createElement('figure');
//     figure.className = 'coverage-map';
//     const mapEl = document.createElement('div');
//     mapEl.className = 'mini-map';
//     const caption = document.createElement('figcaption');
//     caption.textContent = label;
//     figure.append(mapEl, caption);
//     container.appendChild(figure);
//     figures.push([mapEl, features]);
//   }
//   figures.forEach(([mapEl, features]) => drawGlobe(mapEl, features, pin));

//   renderLogos(project.properties);   // NEW
// })();


// // Logo strip at the bottom of the page: the project's own "logo", then any "partner_logos"
// // ({ "src", "alt", "url" }). Paths in projects.geojson are relative to the site root.
// function renderLogos(p) {
//   const strip = document.getElementById('logo-strip');
//   if (!strip) return;
//   const logos = [
//     ...(p.logo ? [{ src: p.logo, alt: `${p.title} logo` }] : []),
//     ...(p.partner_logos || [])
//   ];
//   if (!logos.length) return;

//   for (const { src, alt = '', url } of logos) {
//     const img = document.createElement('img');
//     img.src = `../${src}`;
//     img.alt = alt;
//     img.loading = 'lazy';
//     if (url) {
//       const a = document.createElement('a');
//       a.href = url;
//       a.target = '_blank';
//       a.rel = 'noopener';
//       a.appendChild(img);
//       strip.appendChild(a);
//     } else {
//       strip.appendChild(img);
//     }
//   }
//   strip.hidden = false;
// }

// function drawGlobe(el, features, pin) {
//   const map = new maplibregl.Map({
//     container: el,
//     style: STYLE,
//     center: pin,
//     zoom: 0,
//     renderWorldCopies: false, // stops fills at the antimeridian being drawn twice
//     attributionControl: { compact: true }
//   });
//   // Globe projection avoids Web Mercator's distortion near the poles
//   map.on('style.load', () => map.setProjection({ type: 'globe' }));

//   // map.on('load', () => {
//     map.on('load', () => {
//       // Basemap colour tweaks
//       if (map.getLayer('water')) map.setPaintProperty('water', 'fill-color', '#cfe3ea');
//       if (map.getLayer('background')) map.setPaintProperty('background', 'background-color', '#f0f0f0');
//       if (map.getLayer('landcover')) {
//         map.setPaintProperty('landcover', 'fill-color', '#228B22');
//         map.setPaintProperty('landcover', 'fill-opacity', 0.12);
//       }

//     // buffer: 0 stops polygons near the poles being drawn twice where globe tiles overlap
//     map.addSource('extent', { type: 'geojson', data: { type: 'FeatureCollection', features }, buffer: 0 });
//     map.addLayer({
//       id: 'extent-fill', type: 'fill', source: 'extent',
//       filter: ['==', ['geometry-type'], 'Polygon'],
//       paint: { 'fill-color': EXTENT, 'fill-opacity': 0.18, 'fill-antialias': false } // no seams between split polygons
//     });
//     map.addLayer({
//       id: 'extent-line', type: 'line', source: 'extent',
//       // Polygons split for rendering set "outline": false; a LineString draws their boundary instead
//       filter: ['any', ['==', ['geometry-type'], 'LineString'], ['!=', ['get', 'outline'], false]],
//       paint: { 'line-color': EXTENT, 'line-width': 1.5, 'line-dasharray': [3, 2] }
//     });
//     // Work-location pin (skipped when looking at the opposite pole, where it would sit on the far side)
//     const oppositePole = ringsPole(features) && Math.sign(lats(features)[0]) !== Math.sign(pin[1]);
//     if (!oppositePole) new maplibregl.Marker({ color: ACCENT, scale: 0.7 }).setLngLat(pin).addTo(map);

//     if (!features.length) {
//       map.jumpTo({ center: pin, zoom: 0.4 }); // global: whole globe, centred on the work location
//     } else if (ringsPole(features)) {
//       // Look down on the pole. Globe zoom is scaled by latitude, so keep it low near the poles.
//       const south = lats(features)[0] < 0;
//       map.jumpTo({ center: [0, south ? -72 : 72], zoom: 0.4 });
//     } else {
//       const b = new maplibregl.LngLatBounds();
//       features.forEach((f) => coordsOf(f).forEach((c) => b.extend(c)));
//       // fitBounds can drift off-centre on a globe at high latitudes, so centre on the box ourselves
//       const cam = map.cameraForBounds(b, { padding: 30, maxZoom: 6 });
//       map.jumpTo({ center: b.getCenter(), zoom: cam ? cam.zoom : 2 });
//     }
//   });
// }


// Data coverage map for project pages.
//
// Draws ONE globe per project with every coverage area from data/extents.geojson
// (matched on "project"). Each area (grouped by "label") gets its own colour, and a key
// on the map lists them; clicking a key entry flies the globe to that area.
// Set "color" on an extent feature to choose its colour; otherwise colours come from COLORS.
//
// Usage: <div id="coverage-maps" class="coverage-grid" data-project="earthwave"></div>

const STYLE = 'https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json';
const ACCENT = '#0f766e';
const COLORS = ['#2563eb', '#228B22', '#d97706', '#7c3aed']; // blue, forest green, amber, purple

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

  // Group this project's extents by label, and give each group a colour
  const groups = [];
  for (const f of extents.features.filter((e) => e.properties.project === id)) {
    let g = groups.find((x) => x.label === f.properties.label);
    if (!g) {
      g = { label: f.properties.label, features: [] };
      groups.push(g);
    }
    g.features.push(f);
  }
  groups.forEach((g, i) => {
    g.color = g.features.find((f) => f.properties.color)?.properties.color || COLORS[i % COLORS.length];
  });

  // One map for the whole project
  const figure = document.createElement('figure');
  figure.className = 'coverage-map';
  const mapEl = document.createElement('div');
  mapEl.className = 'mini-map';
  figure.appendChild(mapEl);
  container.appendChild(figure);

  drawGlobe(mapEl, groups, pin, project.properties.coverage);
  renderLogos(project.properties);
})();

function drawGlobe(el, groups, pin, coverageText) {
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
    // Basemap colour tweaks
    if (map.getLayer('water')) map.setPaintProperty('water', 'fill-color', '#cfe3ea');
    if (map.getLayer('background')) map.setPaintProperty('background', 'background-color', '#f0f0f0');
    if (map.getLayer('landcover')) {
      map.setPaintProperty('landcover', 'fill-color', '#228B22');
      map.setPaintProperty('landcover', 'fill-opacity', 0.12);
    }

    // All coverage areas in one source; each feature carries its group's colour
    const features = groups.flatMap((g) =>
      g.features.map((f) => ({ ...f, properties: { ...f.properties, _color: g.color } })));

    // buffer: 0 stops polygons near the poles being drawn twice where globe tiles overlap
    map.addSource('extent', { type: 'geojson', data: { type: 'FeatureCollection', features }, buffer: 0 });
    map.addLayer({
      id: 'extent-fill', type: 'fill', source: 'extent',
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': ['get', '_color'], 'fill-opacity': 0.2, 'fill-antialias': false } // no seams between split polygons
    });
    map.addLayer({
      id: 'extent-line', type: 'line', source: 'extent',
      // Polygons split for rendering set "outline": false; a LineString draws their boundary instead
      filter: ['any', ['==', ['geometry-type'], 'LineString'], ['!=', ['get', 'outline'], false]],
      paint: { 'line-color': ['get', '_color'], 'line-width': 1.5, 'line-dasharray': [3, 2] }
    });

    // Work-location pin
    new maplibregl.Marker({ color: ACCENT, scale: 0.7 }).setLngLat(pin).addTo(map);

    addKey(el, map, groups, pin, coverageText);

    // Start on the first coverage area, or the whole globe for global projects
    if (groups.length) flyToGroup(map, groups[0], false);
    else map.jumpTo({ center: pin, zoom: 0.4 });
  });
}

// Key in the corner of the map. Clicking an entry flies to that area.
function addKey(el, map, groups, pin, coverageText) {
  const key = document.createElement('div');
  key.className = 'coverage-key';

  if (!groups.length) {
    // e.g. TerraTexture: global data, nothing to outline
    key.innerHTML = `<span class="key-item"><i style="background:#9ca3af"></i>Coverage: ${coverageText}</span>`;
  } else {
    for (const g of groups) {
      const btn = document.createElement('button');
      btn.className = 'key-item';
      btn.type = 'button';
      btn.innerHTML = `<i style="background:${g.color}"></i>`;
      btn.append(g.label);
      btn.addEventListener('click', () => {
        key.querySelectorAll('.key-item').forEach((b) => b.classList.toggle('active', b === btn));
        flyToGroup(map, g, true);
      });
      key.appendChild(btn);
    }
    key.firstChild.classList.add('active');
  }

  // Work location entry
  const work = document.createElement('span');
  work.className = 'key-item key-work';
  work.innerHTML = `<i style="background:${ACCENT}"></i>Work location`;
  key.appendChild(work);

  el.appendChild(key);
}

function flyToGroup(map, g, animate) {
  const move = animate ? 'flyTo' : 'jumpTo';
  if (ringsPole(g.features)) {
    // Look down on the pole. Globe zoom is scaled by latitude, so keep it low near the poles.
    const south = lats(g.features)[0] < 0;
    map[move]({ center: [0, south ? -72 : 72], zoom: 0.4 });
  } else {
    const b = new maplibregl.LngLatBounds();
    g.features.forEach((f) => coordsOf(f).forEach((c) => b.extend(c)));
    // fitBounds can drift off-centre on a globe at high latitudes, so centre on the box ourselves
    const cam = map.cameraForBounds(b, { padding: 30, maxZoom: 6 });
    map[move]({ center: b.getCenter(), zoom: cam ? cam.zoom : 2 });
  }
}

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


/* ---- Before/after compare slider (append to js/project-page.js) ----
   Works for any number of <figure class="compare"> elements on a page.
   Mouse, touch, pen (pointer events) and keyboard (arrow keys) supported. */
(function () {
  document.querySelectorAll(".compare").forEach(function (box) {
    var handle = box.querySelector(".compare-handle");
    var active = false;
    var pos = 50;

    function set(pct) {
      pos = Math.max(0, Math.min(100, pct));
      box.style.setProperty("--pos", pos + "%");
      if (handle) handle.setAttribute("aria-valuenow", Math.round(pos));
    }

    function fromEvent(e) {
      var r = box.getBoundingClientRect();
      set(((e.clientX - r.left) / r.width) * 100);
    }

    box.addEventListener("pointerdown", function (e) {
      active = true;
      box.setPointerCapture(e.pointerId);
      fromEvent(e);
    });
    box.addEventListener("pointermove", function (e) {
      if (active) fromEvent(e);
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(function (t) {
      box.addEventListener(t, function () { active = false; });
    });

    if (handle) {
      handle.addEventListener("keydown", function (e) {
        var step = e.shiftKey ? 10 : 2;
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") set(pos - step);
        else if (e.key === "ArrowRight" || e.key === "ArrowUp") set(pos + step);
        else if (e.key === "Home") set(0);
        else if (e.key === "End") set(100);
        else return;
        e.preventDefault();
      });
    }

    set(50);
  });
})();

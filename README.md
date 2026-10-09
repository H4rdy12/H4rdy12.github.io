# Geospatial Portfolio

An interactive web map of my geospatial projects, built with [MapLibre GL JS](https://maplibre.org/) and a [CARTO](https://carto.com/basemaps) Positron basemap, hosted on GitHub Pages.

Each pin is a project; clicking it opens a summary with a link to a full write-up.

## Structure

```
index.html              Map + project list
css/style.css           Styles for the map and project pages
js/map.js               Loads the GeoJSON, clustering, popups, filter
data/projects.geojson   One point feature per project  ← edit this
projects/*.html         One page per project
projects/_template.html Copy this to start a new project page
images/                 Screenshots and figures
```

## Adding a project

1. Add a feature to `data/projects.geojson`. Coordinates are `[longitude, latitude]` (WGS84, EPSG:4326):

   ```json
   {
     "type": "Feature",
     "geometry": { "type": "Point", "coordinates": [-4.08, 52.41] },
     "properties": {
       "id": "my-project",
       "title": "My Project",
       "summary": "One or two sentences.",
       "category": "Analysis",
       "tools": ["QGIS", "Python"],
       "year": 2026,
       "url": "projects/my-project.html"
     }
   }
   ```

2. Copy `projects/_template.html` to `projects/my-project.html`, then update the text and the `lngLat` coordinates in the script at the bottom.
3. Commit and push. The site updates within a minute or two.

Tip: check your GeoJSON is valid at [geojson.io](https://geojson.io).

## Running locally

The map loads the GeoJSON with `fetch`, which browsers block when you open the file directly, so run a small local server:

```bash
python -m http.server 8000
```

Then open http://localhost:8000.

## Credits

Basemap © [CARTO](https://carto.com/attributions), map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.

# EV Charging Price Viewer

Interactieve kaart van **actuele laadprijzen (€/kWh)** en **brandstofprijzen (€/L)** in Nederland.

- **Laadpunten** — alle publiek toegankelijke laadpunten (NDW DOT-NL OCPI), met het actuele
  energietarief (€/kWh) per connector, gekleurd op OCPI-status of op prijs.
- **Brandstof** — Nederlandse tankstations met actuele prijzen (Euro95, E10, Plus98, Super, Diesel,
  LPG, CNG) van Brandstofprijzen.nl, gegeocodeerd via OpenStreetMap/Nominatim.

Plus gemeente- en provinciegrenzen (PDOK/CBS) en een per-gemeente "uitsnede". Op landelijk niveau
laden alle punten zonder details; bij het kiezen van een gemeente worden alle details direct geladen.

## Structuur

```
data-pipeline/   Node/TS generatiestap -> schrijft statische JSON/GeoJSON naar webapp/public/data
webapp/          Next.js 16 + React 19 + deck.gl + MapLibre (statisch te hosten, bv. Coolify)
```

## Databronnen

- NDW OCPI: `https://opendata.ndw.nu/charging_point_locations_ocpi.json.gz` (+ tariffs)
- Brandstofprijzen.nl: `https://www.brandstofprijzen.nl/tanks.php` (crowdsourced €/L)
- PDOK CBS Gebiedsindelingen WFS (gemeente_gegeneraliseerd / provincie_gegeneraliseerd)
- Open Charge Map API (vrije `OCM_API_KEY`), EAFO (optionele statische export), curated hubs

## Data genereren

```bash
cd data-pipeline
npm install
# optioneel: export OCM_API_KEY=...   en  export BOUNDARY_YEAR=2025
npm run generate            # gebruikt cache in .cache/
npm run generate:nocache    # forceert verse downloads (--refresh)
```

Dit schrijft naar `webapp/public/`:

- `data/gemeenten/<slug>.geojson` — per-gemeente uitsnede (punten zonder details + grens)
- `data/gemeenten/<slug>.details.json` — per-gemeente detailbundel (volledige OCPI EVSE/connector/tarief)
- `data/nederland-passenger.geojson` / `data/nederland-freight.geojson` — landelijk, alle punten, geen details
- `data/provinces.geojson` — provinciegrenzen
- `municipalities.json` — gemeentelijst met tellingen

## Webapp draaien

```bash
cd webapp
npm install
npm run dev      # http://localhost:3000
npm run build    # statische productiebuild (roept de pipeline NIET aan)
```

## Deploy (Coolify)

De webapp is een statische Next.js build. De `Dockerfile` bouwt de webapp en serveert via
`next start`. De data-pipeline draait als een aparte stap (lokaal of via CI) en schrijft de
statische data naar `webapp/public/` vóór de build.

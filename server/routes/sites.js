const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const FILE = path.resolve(__dirname, '..', '..', 'content', 'sites.json');
const SCHEMA = path.resolve(__dirname, '..', '..', 'content', 'sites-schema.json');

router.get('/sites', (req, res) => {
  res.json(JSON.parse(fs.readFileSync(FILE, 'utf-8')));
});

router.get('/sites-schema', (req, res) => {
  res.json(JSON.parse(fs.readFileSync(SCHEMA, 'utf-8')));
});

// Server-managed fields the CMS UI does not send back (readonly / enriched).
// Preserved from the previous record so they don't get wiped on save.
const MANAGED_FIELDS = ['url_token', 'developers', 'area_overview', 'wikipedia_url', 'population_50km',
  'nearest_airport', 'nearest_seaport', 'nearest_substation', 'nearest_substation_km',
  'avg_temp_c', 'free_cooling_hours', 'hot_days_per_year', 'cold_days_per_year',
  'temp_chart', 'daylight_hours', 'tz_offset', 'hub_distances_km',
  'grid_co2', 'grid_price', 'grid_mix'];

router.put('/sites', (req, res) => {
  const body = req.body;
  if (!body || !Array.isArray(body.sites)) return res.status(400).json({ error: 'invalid payload' });
  let before = null;
  try { before = JSON.parse(fs.readFileSync(FILE, 'utf-8')); } catch {}
  if (before && Array.isArray(before.sites)) {
    const byId = new Map(before.sites.map(s => [s.id, s]));
    for (const s of body.sites) {
      const prev = byId.get(s.id);
      if (!prev) continue;
      for (const k of MANAGED_FIELDS) {
        if (prev[k] !== undefined && s[k] === undefined) s[k] = prev[k];
      }
    }
  }
  fs.writeFileSync(FILE, JSON.stringify(body, null, 2) + '\n', 'utf-8');
  const audit = require('../audit');
  const entry = audit.record('sites', req.cmsUser, before, body, 'save');
  res.json({ ok: true, audit: entry });
});

module.exports = router;

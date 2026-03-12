const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const { globalLimiter } = require('./middleware/rateLimiter');
const seasonsRouter = require('./routes/seasons');
const missionsRouter = require('./routes/missions');
const submissionsRouter = require('./routes/submissions');
const estimateRouter = require('./routes/estimate');
const adminRouter = require('./routes/admin');

const PORT = process.env.PORT || 3000;

const app = express();

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());
app.use(globalLimiter);

app.use('/v1/seasons', seasonsRouter);
app.use('/v1/missions', missionsRouter);
app.use('/v1/missions', submissionsRouter);
app.use('/v1/estimate', estimateRouter);
app.use('/v1/admin', adminRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const sitePath = path.join(__dirname, '..', 'site');
if (fs.existsSync(sitePath)) {
  app.use(express.static(sitePath));
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(sitePath, 'index.html'));
  });
} else {
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
}

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

function reconcileManualMissions(d, seedMissions) {
  const manualMissions = d.prepare(
    'SELECT id, story_id, "order", manual_id FROM missions WHERE manual_id IS NOT NULL'
  ).all();
  if (!manualMissions.length) return;

  let reconciled = 0;
  for (const manual of manualMissions) {
    const match = seedMissions.find(
      m => m.story_id === manual.story_id && m.order === manual.order
    );
    if (!match) continue;

    const realExists = d.prepare('SELECT 1 FROM missions WHERE id = ?').get(match.id);
    if (!realExists) continue;

    d.prepare('UPDATE submissions SET mission_id = ? WHERE mission_id = ?')
      .run(match.id, manual.id);
    d.prepare('UPDATE missions SET manual_id = ? WHERE id = ?')
      .run(manual.manual_id, match.id);
    d.prepare('DELETE FROM missions WHERE id = ?').run(manual.id);
    reconciled++;
  }

  if (reconciled) {
    console.log(`Reconciled ${reconciled} manual mission(s) with API data`);
  }
}

function importSeedData() {
  const seedPath = path.join(__dirname, '..', 'seed-data.json');
  if (!fs.existsSync(seedPath)) {
    console.log('No seed-data.json found, skipping seed import');
    return [];
  }

  const data = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
  console.log(`Importing seed data: ${data.seasons?.length || 0} seasons, ${data.stories?.length || 0} stories, ${data.missions?.length || 0} missions`);

  const d = db.getDb();
  const importAll = d.transaction(() => {
    for (const s of data.seasons || []) {
      db.upsertSeason(s.id, s.name, s.order);
    }
    for (const st of data.stories || []) {
      db.upsertStory(st.id, st.season_id, st.name, st.group_name, st.order, st.races);
    }
    for (const m of data.missions || []) {
      db.upsertMission(m.id, m.story_id, m.name, m.order, m.seed_full_mins, m.seed_speed_mins, m.description, m.canonical_id);
    }

    reconcileManualMissions(d, data.missions || []);

    // Remove API-sourced missions that are no longer in seed data (e.g. removed placeholders)
    const seedMissionIds = new Set((data.missions || []).map(m => m.id));
    const dbMissions = d.prepare('SELECT id, manual_id FROM missions').all();
    let removed = 0;
    for (const row of dbMissions) {
      if (row.manual_id != null) continue; // keep manually-added missions
      if (seedMissionIds.has(row.id)) continue;
      d.prepare('DELETE FROM submissions WHERE mission_id = ?').run(row.id);
      d.prepare('DELETE FROM missions WHERE id = ?').run(row.id);
      removed++;
    }
    if (removed > 0) console.log(`Removed ${removed} mission(s) no longer in seed data`);
  });

  importAll();
  console.log('Seed data imported successfully');
  return (data.missions || []).map(m => m.id);
}

async function fetchDescriptions(missionIds) {
  if (!missionIds.length) return;

  const needsDescription = missionIds.filter(id => {
    const row = db.getDb().prepare('SELECT description FROM missions WHERE id = ?').get(id);
    return !row || !row.description;
  });

  if (!needsDescription.length) {
    console.log('All missions already have descriptions, skipping GW2 API fetch');
    return;
  }

  console.log(`Fetching descriptions for ${needsDescription.length} missions from GW2 API...`);
  const CHUNK_SIZE = 200;
  let updated = 0;

  for (let i = 0; i < needsDescription.length; i += CHUNK_SIZE) {
    const chunk = needsDescription.slice(i, i + CHUNK_SIZE);
    try {
      const url = `https://api.guildwars2.com/v2/quests?ids=${chunk.join(',')}`;
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`GW2 API returned ${res.status} for chunk ${i / CHUNK_SIZE + 1}, skipping`);
        continue;
      }
      const quests = await res.json();
      for (const q of quests) {
        if (!q.goals || !q.goals.length) continue;
        const desc = q.goals.map(g => g.complete).filter(Boolean).join(' ');
        if (desc) {
          db.getDb().prepare('UPDATE missions SET description = ? WHERE id = ?').run(desc, q.id);
          updated++;
        }
      }
    } catch (err) {
      console.warn(`Failed to fetch descriptions for chunk ${i / CHUNK_SIZE + 1}:`, err.message);
    }
  }

  console.log(`Updated descriptions for ${updated} missions`);
}

const missionIds = importSeedData();
fetchDescriptions(missionIds).catch(err => console.warn('Description fetch failed:', err.message));

app.listen(PORT, () => {
  console.log(`GW2 Story Times API listening on port ${PORT}`);
});

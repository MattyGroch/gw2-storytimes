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

function importSeedData() {
  const seedPath = path.join(__dirname, '..', 'seed-data.json');
  if (!fs.existsSync(seedPath)) {
    console.log('No seed-data.json found, skipping seed import');
    return;
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
      db.upsertMission(m.id, m.story_id, m.name, m.order, m.seed_full_mins, m.seed_speed_mins);
    }
  });

  importAll();
  console.log('Seed data imported successfully');
}

importSeedData();

app.listen(PORT, () => {
  console.log(`GW2 Story Times API listening on port ${PORT}`);
});

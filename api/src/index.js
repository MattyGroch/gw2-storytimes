const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const { globalLimiter } = require('./middleware/rateLimiter');
const { importSeedData } = require('./lib/seed-import');
const seasonsRouter = require('./routes/seasons');
const missionsRouter = require('./routes/missions');
const submissionsRouter = require('./routes/submissions');
const estimateRouter = require('./routes/estimate');
const adminRouter = require('./routes/admin');

const PORT = process.env.PORT || 3000;

const app = express();

app.set('trust proxy', 1);
app.use(cors());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const sitePath = path.join(__dirname, '..', 'site');
if (fs.existsSync(sitePath)) {
  app.use(express.static(sitePath));
}

app.use('/v1', globalLimiter);
app.use(express.json());

app.use('/v1/seasons', seasonsRouter);
app.use('/v1/missions', missionsRouter);
app.use('/v1/missions', submissionsRouter);
app.use('/v1/estimate', estimateRouter);
app.use('/v1/admin', adminRouter);

app.get('/v1/stats', (_req, res) => {
  const speedRatio = db.getGlobalSpeedRatio();
  res.json({
    total_submissions: db.getSubmissionCount(),
    // Speedrun time as a share of full-experience time across every mission
    // that has both, used to project speedrun totals where times are missing.
    speed_ratio: speedRatio == null ? null : Math.round(speedRatio * 1000) / 1000,
  });
});

if (fs.existsSync(sitePath)) {
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

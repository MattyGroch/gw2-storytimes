const { Router } = require('express');
const fs = require('fs');
const db = require('../db');
const { fetchMissionsFromAPI } = require('../lib/gw2-fetch');
const { applySeedData, SEED_PATH } = require('../lib/seed-import');

const router = Router();

function adminAuth(req, res, next) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    return res.status(403).json({ error: 'Admin access is not configured' });
  }

  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ') || auth.slice(7) !== password) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

router.use(adminAuth);

router.get('/submissions', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const filters = {
    page,
    limit,
    mission_id: req.query.mission_id ? parseInt(req.query.mission_id, 10) : undefined,
    category: ['full', 'speed'].includes(req.query.category) ? req.query.category : undefined,
    source: ['manual', 'sentiment', 'api', 'blishhud'].includes(req.query.source) ? req.query.source : undefined,
    ip_hash: req.query.ip_hash && /^[a-f0-9]+$/i.test(req.query.ip_hash) ? req.query.ip_hash : undefined,
  };

  const submissions = db.getSubmissions(filters);
  const total = db.getSubmissionCount(filters);

  res.json({
    submissions,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

router.post('/submissions/bulk-delete', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids must be a non-empty array' });
  }
  if (ids.length > 500) {
    return res.status(400).json({ error: 'Maximum 500 deletions per request' });
  }
  const parsed = ids.map(id => parseInt(id, 10));
  if (parsed.some(isNaN)) {
    return res.status(400).json({ error: 'All ids must be valid integers' });
  }

  const deleted = db.deleteSubmissions(parsed);
  res.json({ deleted });
});

router.delete('/submissions/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid submission ID' });
  }

  const deleted = db.deleteSubmission(id);
  if (!deleted) {
    return res.status(404).json({ error: 'Submission not found' });
  }

  res.json({ message: 'Submission deleted' });
});

router.get('/stories', (_req, res) => {
  const rows = db.getStoriesWithMissionCounts();
  const seasons = [];
  const seasonMap = {};

  for (const row of rows) {
    if (!seasonMap[row.season_id]) {
      seasonMap[row.season_id] = { id: row.season_id, name: row.season_name, order: row.season_order, stories: [] };
      seasons.push(seasonMap[row.season_id]);
    }
    seasonMap[row.season_id].stories.push({
      id: row.story_id,
      name: row.story_name,
      group_name: row.group_name,
      order: row.story_order,
      manual_id: row.story_manual_id || null,
      mission_count: row.mission_count,
    });
  }

  res.json(seasons);
});

router.get('/missions', (req, res) => {
  const storyId = parseInt(req.query.story_id, 10);
  if (isNaN(storyId)) {
    return res.status(400).json({ error: 'story_id is required' });
  }
  const missions = db.getManualMissionsByStoryId(storyId);
  res.json(missions);
});

router.post('/missions', (req, res) => {
  const { story_id, name, order, seed_full_mins, seed_speed_mins, description } = req.body;

  if (!story_id || !name || order == null) {
    return res.status(400).json({ error: 'story_id, name, and order are required' });
  }

  const storyId = parseInt(story_id, 10);
  const orderNum = parseInt(order, 10);
  if (isNaN(storyId) || isNaN(orderNum)) {
    return res.status(400).json({ error: 'story_id and order must be integers' });
  }

  const storyExists = db.getDb().prepare('SELECT 1 FROM stories WHERE id = ?').get(storyId);
  if (!storyExists) {
    return res.status(404).json({ error: 'Story not found' });
  }

  const id = db.createManualMission(
    storyId,
    name.trim(),
    orderNum,
    seed_full_mins ? parseFloat(seed_full_mins) : null,
    seed_speed_mins ? parseFloat(seed_speed_mins) : null,
    description ? description.trim() : null,
  );

  res.status(201).json({ message: 'Mission created', id, manual_id: id });
});

router.patch('/missions/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid mission ID' });
  }

  const fields = {};
  if (req.body.name !== undefined) fields.name = String(req.body.name).trim();
  if (req.body.seed_full_mins !== undefined) fields.seed_full_mins = req.body.seed_full_mins === null ? null : parseFloat(req.body.seed_full_mins);
  if (req.body.seed_speed_mins !== undefined) fields.seed_speed_mins = req.body.seed_speed_mins === null ? null : parseFloat(req.body.seed_speed_mins);

  if (!Object.keys(fields).length) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  const updated = db.updateMission(id, fields);
  if (!updated) {
    return res.status(404).json({ error: 'Mission not found' });
  }

  res.json({ message: 'Mission updated' });
});

router.delete('/missions/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid mission ID' });
  }

  const result = db.deleteManualMission(id);
  if (!result.deleted) {
    if (result.reason === 'not_manual') {
      return res.status(403).json({ error: 'Only manual missions can be deleted' });
    }
    return res.status(404).json({ error: 'Mission not found' });
  }

  res.json({ message: 'Mission deleted' });
});

router.post('/stories', (req, res) => {
  const { season_id, name, group_name, order } = req.body;

  if (!season_id || !name || order == null) {
    return res.status(400).json({ error: 'season_id, name, and order are required' });
  }

  const orderNum = parseInt(order, 10);
  if (isNaN(orderNum)) {
    return res.status(400).json({ error: 'order must be an integer' });
  }

  const seasonExists = db.getDb().prepare('SELECT 1 FROM seasons WHERE id = ?').get(season_id);
  if (!seasonExists) {
    return res.status(404).json({ error: 'Season not found' });
  }

  const id = db.createManualStory(season_id, name.trim(), group_name?.trim() || null, orderNum);
  res.status(201).json({ id, manual_id: id });
});

router.delete('/stories/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid story ID' });
  }

  const result = db.deleteManualStory(id);
  if (!result.deleted) {
    if (result.reason === 'not_manual') {
      return res.status(403).json({ error: 'Only manual stories can be deleted' });
    }
    return res.status(404).json({ error: 'Story not found' });
  }

  res.json({ message: 'Story deleted' });
});

router.post('/sync/preview', async (req, res) => {
  try {
    const existingSeedData = fs.existsSync(SEED_PATH)
      ? JSON.parse(fs.readFileSync(SEED_PATH, 'utf-8'))
      : {};

    const fresh = await fetchMissionsFromAPI(existingSeedData);

    const d = db.getDb();
    const dbMissionIds = new Set(
      d.prepare('SELECT id FROM missions WHERE manual_id IS NULL').all().map(r => r.id)
    );
    const dbStoryIds = new Set(
      d.prepare('SELECT id FROM stories WHERE manual_id IS NULL').all().map(r => r.id)
    );
    const dbSeasonIds = new Set(
      d.prepare('SELECT id FROM seasons').all().map(r => r.id)
    );

    const freshMissionIds = new Set(fresh.missions.map(m => m.id));
    const storyNameById = Object.fromEntries(fresh.stories.map(s => [s.id, s.name]));

    const new_seasons = fresh.seasons.filter(s => !dbSeasonIds.has(s.id));
    const new_stories = fresh.stories.filter(s => !dbStoryIds.has(s.id));
    const new_missions = fresh.missions
      .filter(m => !dbMissionIds.has(m.id))
      .map(m => ({ ...m, story_name: storyNameById[m.story_id] || 'Unknown' }));
    const removed_missions = d.prepare(`
      SELECT m.id, m.name, st.name AS story_name
      FROM missions m
      JOIN stories st ON st.id = m.story_id
      WHERE m.manual_id IS NULL
    `).all().filter(m => !freshMissionIds.has(m.id));

    res.json({
      new_seasons,
      new_stories,
      new_missions,
      removed_missions,
      summary: {
        new_seasons: new_seasons.length,
        new_stories: new_stories.length,
        new_missions: new_missions.length,
        removed_missions: removed_missions.length,
      },
    });
  } catch (err) {
    console.error('Sync preview error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/sync/apply', async (req, res) => {
  try {
    const existingSeedData = fs.existsSync(SEED_PATH)
      ? JSON.parse(fs.readFileSync(SEED_PATH, 'utf-8'))
      : {};

    const fresh = await fetchMissionsFromAPI(existingSeedData);
    fs.writeFileSync(SEED_PATH, JSON.stringify(fresh, null, 2) + '\n');

    const result = applySeedData(fresh);

    res.json({
      reconciled_stories: result.reconciled_stories,
      reconciled_missions: result.reconciled_missions,
      added: result.added,
      removed: result.removed,
    });
  } catch (err) {
    console.error('Sync apply error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

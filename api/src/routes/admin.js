const { Router } = require('express');
const db = require('../db');

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
    source: ['manual', 'sentiment', 'api'].includes(req.query.source) ? req.query.source : undefined,
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

module.exports = router;

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
  };

  const submissions = db.getSubmissions(filters);
  const total = db.getSubmissionCount(filters);

  res.json({
    submissions,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
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

module.exports = router;

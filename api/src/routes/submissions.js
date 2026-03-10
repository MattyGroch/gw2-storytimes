const { Router } = require('express');
const db = require('../db');
const { validateSubmission } = require('../middleware/validation');
const { submitLimiter, perMissionRateLimit } = require('../middleware/rateLimiter');

const router = Router();

router.post(
  '/:id/submit',
  submitLimiter,
  validateSubmission,
  perMissionRateLimit,
  (req, res) => {
    const missionId = parseInt(req.params.id, 10);
    const { category, duration_mins } = req.body;

    if (!db.missionExists(missionId)) {
      return res.status(404).json({ error: 'Mission not found' });
    }

    db.createSubmission(missionId, category, duration_mins, req.ipHash);

    res.status(201).json({ message: 'Submission recorded', mission_id: missionId, category, duration_mins });
  }
);

module.exports = router;

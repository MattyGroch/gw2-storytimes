const { Router } = require('express');
const db = require('../db');
const { validateMissionId } = require('../middleware/validation');

const router = Router();

router.get('/', (_req, res) => {
  const missions = db.getAllMissions();
  res.json(missions);
});

router.get('/:id', validateMissionId, (req, res) => {
  const mission = db.getMissionById(parseInt(req.params.id, 10));
  if (!mission) {
    return res.status(404).json({ error: 'Mission not found' });
  }
  res.json(mission);
});

module.exports = router;

const { Router } = require('express');
const db = require('../db');
const { validateEstimate } = require('../middleware/validation');

const router = Router();

router.get('/', validateEstimate, (req, res) => {
  const ids = req.query.missions
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n));

  if (!ids.length) {
    return res.status(400).json({ error: 'No valid mission IDs provided' });
  }

  const category = req.query.category || 'full';
  const missions = db.getMissionsByIds(ids);

  const timeKey = category === 'speed' ? 'speed' : 'full';
  let totalMins = 0;
  let missionsWithData = 0;
  let missionsWithoutData = 0;

  for (const m of missions) {
    const avg = m.times[timeKey].avg_mins;
    if (avg != null) {
      totalMins += avg;
      missionsWithData++;
    } else {
      missionsWithoutData++;
    }
  }

  res.json({
    category,
    requested: ids.length,
    found: missions.length,
    with_data: missionsWithData,
    without_data: missionsWithoutData,
    total_mins: Math.round(totalMins * 100) / 100,
    total_hours: Math.round((totalMins / 60) * 100) / 100,
    missions: missions.map(m => ({
      id: m.id,
      name: m.name,
      avg_mins: m.times[timeKey].avg_mins,
    })),
  });
});

module.exports = router;

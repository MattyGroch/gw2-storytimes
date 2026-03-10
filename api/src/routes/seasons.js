const { Router } = require('express');
const db = require('../db');
const { validateSeasonId } = require('../middleware/validation');

const router = Router();

router.get('/', (_req, res) => {
  const seasons = db.getAllSeasons();
  res.json(seasons);
});

router.get('/:id', validateSeasonId, (req, res) => {
  const season = db.getSeasonById(req.params.id);
  if (!season) {
    return res.status(404).json({ error: 'Season not found' });
  }
  res.json(season);
});

module.exports = router;

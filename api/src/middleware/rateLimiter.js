const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const db = require('../db');

const IP_HASH_SALT = process.env.IP_HASH_SALT || 'gw2-storytimes-dev-salt';

function hashIp(ip) {
  return crypto.createHash('sha256').update(IP_HASH_SALT + ip).digest('hex');
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip;
}

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

const submitLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions, please slow down' },
});

function perMissionRateLimit(req, res, next) {
  const ip = getClientIp(req);
  const ipHash = hashIp(ip);
  const missionId = parseInt(req.params.id, 10);
  const { category } = req.body;

  req.ipHash = ipHash;

  if (db.hasRecentSubmission(ipHash, missionId, category)) {
    return res.status(429).json({
      error: 'You have already submitted a time for this mission and category in the last 24 hours',
    });
  }

  next();
}

module.exports = {
  globalLimiter,
  submitLimiter,
  perMissionRateLimit,
  hashIp,
  getClientIp,
};

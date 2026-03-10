const { body, param, query, validationResult } = require('express-validator');

function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }
  next();
}

const validateSubmission = [
  param('id').isInt().withMessage('Mission ID must be an integer'),
  body('category')
    .isIn(['full', 'speed'])
    .withMessage('Category must be "full" or "speed"'),
  body('duration_mins')
    .isFloat({ min: 1, max: 480 })
    .withMessage('Duration must be between 1 and 480 minutes'),
  handleValidationErrors,
];

const validateSeasonId = [
  param('id').isString().trim().notEmpty().withMessage('Season ID is required'),
  handleValidationErrors,
];

const validateMissionId = [
  param('id').isInt().withMessage('Mission ID must be an integer'),
  handleValidationErrors,
];

const validateEstimate = [
  query('missions')
    .notEmpty()
    .withMessage('missions query parameter is required'),
  query('category')
    .optional()
    .isIn(['full', 'speed'])
    .withMessage('Category must be "full" or "speed"'),
  handleValidationErrors,
];

module.exports = {
  validateSubmission,
  validateSeasonId,
  validateMissionId,
  validateEstimate,
};

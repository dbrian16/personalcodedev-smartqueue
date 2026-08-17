const express = require('express');
const { requireAuth } = require('../middleware/auth');
const feedbackController = require('../controllers/feedbackController');

const router = express.Router();

router.post('/', requireAuth(['admin', 'staff', 'customer']), feedbackController.submitFeedback);

module.exports = router;

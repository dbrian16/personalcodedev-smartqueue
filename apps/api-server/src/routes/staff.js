const express = require('express');
const { requireAuth } = require('../middleware/auth');
const staffController = require('../controllers/staffController');

const router = express.Router();

router.post('/call-next', requireAuth(['admin', 'staff']), staffController.callNextLead);
router.post('/recall/:id', requireAuth(['admin', 'staff']), staffController.recallLead);
router.post('/no-show/:id', requireAuth(['admin', 'staff']), staffController.markNoShow);

module.exports = router;

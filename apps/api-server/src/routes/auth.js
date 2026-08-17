const express = require('express');
const { authLimiter } = require('../middleware/rateLimiter');
const authController = require('../controllers/authController');

const router = express.Router();

router.post('/login', authLimiter, authController.login);
router.post('/ticket-token', authController.getTicketToken);
router.post('/token', authController.getToken);

module.exports = router;

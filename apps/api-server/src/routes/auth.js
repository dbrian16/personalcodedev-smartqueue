const express = require('express');
const { authLimiter, ticketTokenLimiter } = require('../middleware/rateLimiter');
const authController = require('../controllers/authController');

const router = express.Router();

router.post('/login', authLimiter, authController.login);
router.post('/ticket-token', ticketTokenLimiter, authController.getTicketToken);
router.post('/token', ticketTokenLimiter, authController.getToken);

module.exports = router;

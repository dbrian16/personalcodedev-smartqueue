const express = require('express');
const onlineController = require('../controllers/onlineController');

const router = express.Router();

router.get('/availability', onlineController.listAvailability);
router.post('/book', onlineController.bookTicket);
router.post('/checkin/verify', onlineController.verifyCheckin);
router.post('/checkin', onlineController.performCheckin);

module.exports = router;

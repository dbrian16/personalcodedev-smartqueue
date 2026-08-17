const express = require('express');
const { requireAuth } = require('../middleware/auth');
const leadsController = require('../controllers/leadsController');
const { publicEndpointLimiter, lookupLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.get('/', requireAuth(['admin', 'staff', 'customer']), leadsController.listLeads);
router.get('/track/:ticketNumber', leadsController.trackLead);
// Contact-detail lookup is guessable by nature, so it gets a much tighter limit
// than the rest of the public surface.
router.post('/lookup', lookupLimiter, leadsController.lookupLeads);
router.post('/', publicEndpointLimiter, leadsController.createLead);
router.patch('/:id', requireAuth(['admin', 'staff']), leadsController.updateLead);
router.post('/:id/transfer', requireAuth(['admin', 'staff']), leadsController.transferLead);
router.post('/:id/cancel', requireAuth(['admin', 'staff', 'customer']), leadsController.cancelLead);

module.exports = router;

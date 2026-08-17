const express = require('express');
const { requireAuth } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

const router = express.Router();

router.get('/availability', requireAuth(['admin', 'staff']), adminController.getAvailability);
router.post('/availability', requireAuth(['admin', 'staff']), adminController.updateAvailability);

// Staff management (admin only)
router.get('/staff-accounts', requireAuth(['admin']), adminController.getStaffAccounts);
router.post('/staff-accounts', requireAuth(['admin']), adminController.createStaffAccount);
router.put('/staff-accounts/:username', requireAuth(['admin']), adminController.updateStaffAccount);
router.delete('/staff-accounts/:username', requireAuth(['admin']), adminController.deleteStaffAccount);

// Service catalogue (admin only)
router.get('/services', requireAuth(['admin']), adminController.listServices);
router.post('/services', requireAuth(['admin']), adminController.createService);
router.put('/services/:name', requireAuth(['admin']), adminController.updateService);
router.delete('/services/:name', requireAuth(['admin']), adminController.deleteService);

// Operating settings (admin only)
router.get('/settings', requireAuth(['admin']), adminController.getSettings);
router.put('/settings', requireAuth(['admin']), adminController.updateSettings);

// Wait-time model
router.get('/model', requireAuth(['admin']), adminController.getModelStatus);
router.post('/model/train', requireAuth(['admin']), adminController.trainModel);

module.exports = router;

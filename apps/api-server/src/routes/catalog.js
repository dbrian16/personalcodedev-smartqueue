const express = require('express');
const catalogController = require('../controllers/catalogController');

const router = express.Router();

// Public: every front end reads its service list and opening hours from here.
router.get('/', catalogController.getCatalog);

module.exports = router;

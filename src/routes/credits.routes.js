const express = require('express');
const router = express.Router();
const creditsController = require('../controllers/credits.controller');
const middleware = require('./middleware');
router.post('/new', creditsController.createNewCredit);

module.exports = router;

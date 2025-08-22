const express = require('express');
const router = express.Router();
const commissionsController = require('../controllers/commissions.controller');


router.get('/', commissionsController.getCreditsWeekByZone );

module.exports = router;

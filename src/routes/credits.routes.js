const express = require('express');
const router = express.Router();
const creditsController = require('../controllers/credits.controller');
router.post('/new', creditsController.createNewCredit);
router.post('/renew', creditsController.createRenewCredit);
router.post('/additional', creditsController.createAdditionalCredit);
module.exports = router;

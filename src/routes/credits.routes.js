const express = require('express');
const router = express.Router();
const middleware = require('./middleware');
const creditsController = require('../controllers/credits.controller');
router.post('/buscar-cliente', creditsController.getClient);
router.post('/newCredit', creditsController.createNewCredit);
module.exports = router;

const express = require('express');
const router = express.Router();
const middleware = require('./middleware');
router.post('/new', creditsController.createNewCredit);

module.exports = router;

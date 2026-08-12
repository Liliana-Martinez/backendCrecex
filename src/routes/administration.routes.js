const express = require('express');
const router = express.Router();

const administrationController = require('../controllers/administration.controller');


router.put(
    '/update-credit',
    administrationController.updateCredit
);


router.put(
    '/cancel-credit',
    administrationController.cancelCredit
);


module.exports = router;
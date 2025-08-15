const { Router } = require('express');
const router = Router();

// Importa tu controlador
const commissionsController = require('../controllers/commissions.controller');

// Ejemplo de endpoint
router.get('/', commissionsController.getAllCommissions);

module.exports = router;

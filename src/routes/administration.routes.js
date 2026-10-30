
const express = require('express');
const router = express.Router();

const administrationController = require('../controllers/administration.controller');

// Actualizar crédito
router.put(
    '/update-credit',
    administrationController.updateCredit
);

// Cancelar crédito
router.put(
    '/cancel-credit',
    administrationController.cancelCredit
);

// Procesos administrativos (pruebas de conexión)
router.post(
    '/process/atrasos',
    administrationController.ejecutarAtrasos
);

router.post(
    '/process/adelantos',
    administrationController.ejecutarAdelantos
);

router.post(
    '/process/falla',
    administrationController.ejecutarFalla
);

module.exports = router;

const express = require('express');
const router = express.Router();
const { getClientesPorCodigoZona } = require('../controllers/payments.controller');

// Ruta para obtener clientes por código de zona
router.get('/zona/:codigoZona', getClientesPorCodigoZona);

module.exports = router;

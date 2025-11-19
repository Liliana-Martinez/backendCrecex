const express = require('express');
const router = express.Router();
const commissionsController = require('../controllers/commissions.controller');


router.get('/', async (req, res) => {
    const { idZona } = req.query;
    console.log('idZona en comision.routes: ', idZona);

    try {
        const resultado = await commissionsController.getCommissionesByZone(idZona);
        return res.json({ message: 'Gastos de cobranza: ', resultado});
    } catch(error) {
        console.error('Error con la consulta de gastos de cobranza.', error);
        return res.status(500).json({ error: 'Error al consultar los gastos de cobranza.'});
    }
});

module.exports = router;

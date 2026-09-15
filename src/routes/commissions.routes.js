const express = require('express');
const router = express.Router();
const commissionsController = require('../controllers/commissions.controller');


router.get('/', async (req, res) => {
    const { idZona } = req.query;
    console.log('idZona en comision.routes: ', idZona);

    try {
        const resultado = await commissionsController.getCommissionsByZone(idZona);
        return res.json({ message: 'Gastos de cobranza: ', resultado});
    } catch(error) {
        console.error('Error con la consulta de gastos de cobranza.', error);
        return res.status(500).json({ error: 'Error al consultar los gastos de cobranza.'});
    }
});

// controlador
router.post('/', async (req, res) => {
    const { total, description } = req.body;

    try {
        const resultado = await commissionsController.saveCommission({ total, description});
        return res.status(201).json({ message: 'Extra guardado correctamente', resultado });
    } catch(error) {
        console.error('Error al guardar el extra.', error);
        return res.status(500).json({ error: 'Error al guardar el extra.'});
    }
});



module.exports = router;

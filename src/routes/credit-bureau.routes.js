const express = require('express');
const router = express.Router();

const creditBureauController = require('../controllers/credit-bureau.controller');

//Ruta para agregar a buro de credito
router.post('/add', async (req, res) => {
    try {
        console.log('Datos recibidos del front: ', req.body);
        const creditBureauData = req.body;

        //INsertar en buro de credito
        const result = await creditBureauController.insert(creditBureauData);
        res.status(201).json({ message: 'Se agrego el cliente a buro de credito.', result})
    } catch (error) {
        console.log('Error al agregar a buro de credito', error);
        res.status(500).json({ message: 'Error al guardar el cliente en buro de crédito'})
    }
});

//Ruta para consultar dentro de buro de credito
router.get('/consult', async (req, res) => {

    const { name } = req.query;
    console.log('Nombre llegado al back: ', name);

    try {
        const results = await creditBureauController.searchByName(name);
        res.status(201).json(results);
    } catch (error) {
        console.error('Error al buscar en buro de credito', error);
        res.status(500).json({ message: 'Error al buscar el dato'});
    }
});

module.exports = router;
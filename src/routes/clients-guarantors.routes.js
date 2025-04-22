const express = require('express');
const router = express.Router();

const clientGuarantor = require('../controllers/clients-guarantors.controller');

//Ruta para agregar cliente
router.post('/add', async (req, res) => {
    try {
        console.log(req.body);
        const clientData = req.body;
        console.log('Estructura completa de clientData:', JSON.stringify(clientData, null, 2));

        //console.log('Datos del cliente recibidos: ', clientData);
        const garantias = Object.values(clientData.garantias);
        console.log('Garantias del cliente: ', garantias);

        //Insertar al cliente
        const result = await clientGuarantor.insert(clientData);
        const clientId = result.insertId;

        //Insertar garantias
        if (garantias.length > 0) {
            await clientGuarantor.insertClientGuarantees(clientId, garantias);
        }
        res.status(201).json({ message: 'Cliente y garantias guardados correctamente'});
    } catch (error) {
        console.error('Error al guardar al cliete y sus garantias');
        res.status(500).json({ message: 'Error al guardar el cliente y garantias'});
    }
});

module.exports = router;
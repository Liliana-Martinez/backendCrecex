const express = require('express');
const router = express.Router();

const clientGuarantor = require('../controllers/clients-guarantors.controller');

router.post('/clients-guarantors/add', async (req, res) => {
    try {
        console.log(req.body);
        const { client, garantias } = req.body;

        //Insertar al cliente
        const result = await clientGuarantor.insert(client);
        const clientId = result.insertId;

        if (Array.isArray(garantias) && garantias.length > 0) {
            await clientGuarantor.insertClientGuarantees(clientId, garantias);
        }
        res.status(201).json({ message: 'Cliente y garantias guardados correctamente'});
    } catch (error) {
        console.error('Error al gguardar al cliete y sus garantias');
        res.status(500).json({ message: 'Error al guardar el cliente y garantias'});
    }
});
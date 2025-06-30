const express = require('express');
const router = express.Router();

const clientGuarantor = require('../controllers/clients-guarantors.controller');

//Ruta para agregar cliente
router.post('/add/client', async (req, res) => {
    try {
        console.log(req.body);
        const clientData = req.body;
        //console.log('Estructura completa de clientData:', JSON.stringify(clientData, null, 2));

        //console.log('Datos del cliente recibidos: ', clientData);
        const garantias = Object.values(clientData.garantias);
        console.log('Garantias del cliente: ', garantias);

        //Insertar al cliente 
        const result = await clientGuarantor.insert(clientData);
        const clientId = result.insertId;
        console.log('Valir del ID: ', clientId);

        //Insertar garantias
        if (garantias.length > 0) {
            await clientGuarantor.insertClientGuarantees(clientId, garantias);
            console.log('Garantias del cliente agregadas.');
        }
        res.status(201).json({ 
            message: 'Cliente y garantias guardados correctamente',
            clientId: clientId
        });
    } catch (error) {
        console.log('Error en la BD: ', error);
        res.status(500).json({ message: 'Error al guardar el cliente y garantias'});
    }
});

//Ruta para agregar al aval(es)
router.post('/add/guarantor', async (req, res) => {
    try {
        console.log('Datos del front: ', req.body);
        const guarantorData = req.body;
        const garantias = Object.values(guarantorData.garantias);

        //Insertar el aval
        const result = await clientGuarantor.insertGuarantor(guarantorData);
        avalId = result.insertId;

        //Insertar garantias
        if (garantias.length > 0) {
            await clientGuarantor.insertAvalGarantias(avalId, garantias);
            console.log('Garantias del aval agregadas.')
        }

        res.status(201).json({ message: 'Aval y garantias agregados correctamente'});

    } catch(error) {
        console.error('Error al guardar el aval del cliente.');
        res.status(500).json({ message: 'Error al guardar el aval.'});
    }
});

router.put('/modify/client', async (req, res) => {
    const idCliente = req.body.id;
    const dataToUpdate = req.body;
    delete dataToUpdate.id;

    try {
        const resultado = await clientGuarantor.updateClient(idCliente, dataToUpdate);
        console.log('Resultado de actualizazion: ', resultado);
        return res.json({ message: 'Datos actualizados correctamente', data: resultado})
    } catch(error) {
        console.error('Error al modificar datos del cliente', error);
        return res.status(500).json({ error: 'Error al modificar datos del cliente'})
    }
});

router.put('/modify/guarantor', async (req, res) => {
    const idAval = req.body.id;
    const dataToUpdate = req.body;
    delete dataToUpdate.id;
    
    try {
        const resultado = await clientGuarantor.updateGuarantor(idAval, dataToUpdate);
        console.log('Resultado de la actualizacion: ', resultado);
        return res.json({ message: 'Datos actualizados correctamente', data: resultado});
    } catch(error) {
        console.error('Error al modificar los datos del aval', error);
        return res.status(500).json({ message: 'Error al modificar los datos del aval.'})
    }
})

module.exports = router;
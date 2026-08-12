const express = require('express');
const router = express.Router();

const clientGuarantor = require('../controllers/clients-guarantors.controller');

//Ruta para agregar cliente
router.post('/add/client', async (req, res) => {
    try {
        const { personalData, collateral } = req.body;
        const guarantees = Object.values(collateral);
        console.log('PERSONAL DATA: ', personalData);

        //Validar que haya datos perosonales del cliente
        if (!personalData || typeof personalData !== 'object') {
            return res.status(400).json({
                message: 'Los datos del cliente son obligatorios'
            });
        }

        //Llamar la funcion que valida el personalData
        const validationErrors = clientGuarantor.validatePersonalData(personalData);
        if (Object.keys(validationErrors).length > 0) {
            return res.status(400).json({ 
                message: 'Los datos del cliente no son válidos',
                errors: validationErrors
             });
        }

        //Validar que el idZona sea valido
        const isValidZone = await clientGuarantor.validateZone(personalData.zoneId);
        if (!isValidZone) {
            return res.status(400).json({
                message: 'La zona seleccionada no existe'
            });
        }

        //Insertar al cliente 
        const result = await clientGuarantor.createClient(personalData);
        const clientId = result.insertId;
        console.log('Valir del ID: ', clientId);

        //Insertar garantias
        if (guarantees.length > 0) {
            await clientGuarantor.insertClientGuarantees(clientId, guarantees);
        }
        return res.status(201).json({ 
            message: 'Cliente y garantias guardados correctamente',
            clientId: clientId
        });
    } catch (error) {
        console.log(error);
        if (error.message === 'Ya existe un cliente con ese nombre') {
            res.status(409).json({ message: error.message });
        } else {
            res.status(500).json({ message: 'Error al guardar el cliente'});
            console.log('ERROR: ', error);
        }
    }
});

//Ruta para agregar al aval(es)
router.post('/add/guarantor', async (req, res) => {
    try {
        const { personalData, collateral } = req.body;
        const guarantees = Object.values(collateral);

        //Insertar el aval
        const result = await clientGuarantor.createGuarantor(personalData);
        const guarantorId = result.insertId;
        console.log('Id del aval a agregar sus garantias: ', guarantorId);

        //Insertar garantias
        if (guarantees.length > 0) {
            await clientGuarantor.insertGuarantorGuarantees(guarantorId, guarantees);
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

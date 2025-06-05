const express = require('express');
const router = express.Router();
const paymentsController = require('../controllers/payments.controller');
router.get('/', async(req, res)=>{
    try{
        const idZona =req.query.idZona;
        console.log('idZona recibido en back: ', idZona);
        if(!idZona){
            return res.status(400).json({ message: 'idZona requerido' });
        }
        const zoneClients = await paymentsController.getClientsFromZone(idZona);
        res.status(200).json(zoneClients);
     } catch(error){
        res.status(500).json({ message: 'Clientes de la zona no encontrados'});
    }
});
module.exports = router;

const express = require('express');
const router = express.Router();

const zoneController = require('../controllers/zones.controller');
//Se manada a llamar la lista completa de las zonas
router.get('/getAllZones', async (req, res) => {
    try {
        const zones = await zoneController.getAllZones();
        res.status(200).json(zones);
    } catch(error) {
        console.error('Error al obtener zonas', error);
        res.status(500).json({ message: 'Error al obtener las zonas' });
    }
});
//Se manda el id del front, para obtener todos los clientes de determinada zona
router.get('/getClientsFromZone', async(req, res)=>{
    try{
        const{idZona} =req.query;
        console.log('idZona recibido en back: ', idZona);
        if(!idZona){
            return res.status(400).json({ message: 'idZona requerido' });
        }
        const zoneClients = await zoneController.getClientsFromZone();
        res.status(200).json(zoneClients);
     } catch(error){
        res.status(500).json({ message: 'Clientes de la zona no encontrados'});
    }
});
module.exports = router;

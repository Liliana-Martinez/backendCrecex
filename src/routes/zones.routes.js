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
module.exports = router;

const express = require('express');
const router = express.Router();

const zoneController = require('../controllers/zones.controller');

// Obtener la lista completa de las zonas
router.get('/getAllZones', async (req, res) => {
    try {
        const zones = await zoneController.getAllZones();
        res.status(200).json(zones);
    } catch(error) {
        console.error('Error al obtener zonas', error);
        res.status(500).json({ message: 'Error al obtener las zonas' });
    }
});

//Obtener las zonas disponibles (sin promotor ni supervisor)

router.get('/getAvailableZones', async (req, res) => {
    try {
        const availableZones = await zoneController.getAvailableZones();
        res.status(200).json(availableZones);
    } catch (error) {
        console.error('Error al obtener zonas', error);
        res.status(500).json({ message: 'Error al obtener las zonas' });
    }
});

router.post('/add', async (req, res) => {
  try {

    const zoneData = req.body;

    const result = await zoneController.addZone(zoneData);

    res.status(200).json({
        message: 'Nueva zona de trabajo agregada correctamente.',
        result
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al asignar zona' });
  }
});



module.exports = router;






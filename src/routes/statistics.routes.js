const express = require('express');
const router = express.Router();
const statistics = require('../controllers/statistics.controller')


//Ruta para el apartado de 'caja'
router.get('/cash/form', async (req, res) => { 
    try {
        const result = await statistics.getInitialAmountDaily();
        res.status(200).json(result);
    } catch(error) {
        console.error('Error al obtener el total de caja', error);
        res.status(500).json({ message: 'Error al obtener el total del día '});
    }
});

//Ruta para el reporte diario de ingresos y egresos
router.get('/cash/day', async (req, res) => {
    try {
        const result = await statistics.getDailyReport();
        res.status(200).json(result);
    } catch(error) {
        console.error('Error el reporte diario: ', error);
        res.status(500).json({ message: 'Error al obtener el reporte diario' });
    }
});

//Ruta para el reporte semanal de ingresos y egresos
router.get('/cash/week', async (req, res) => {
    try {
        const result = await statistics.getWeeklyReport();
        res.status(200).json(result);
    } catch(error) {
        console.error('Error el reporte diario: ', error);
        res.status(500).json({ message: 'Error al obtener el reporte diario' });
    }
});

//Ruta para el reporte mensual de ingresos y egresos
router.get('/cash/month', async (req, res) => {
    try {
        const result = await statistics.getWeeklyReport();
        res.status(200).json(result);
    } catch(error) {
        console.error('Error el reporte diario: ', error);
        res.status(500).json({ message: 'Error al obtener el reporte diario' });
    }
});

//Ruta para consultar los creditos totales por día
router.get('/total-credits/day', async (req, res) => {
    try {
        const result = await statistics.getDailyCredits();
        res.status(200).json(result);
    } catch(error) {
        console.error('Error al obtener los creditos del dia: ', error);
        res.status(500).json({ message: 'Error al obtener creditos del dia' });
    }
});


//Ruta para consultar los creditos totales de la semana
router.get('/total-credits/week', async (req, res) => {
    try {
        const result = await statistics.getWeeklyCredits();
        res.status(200).json(result);
    } catch(error) {
        console.error('Error al obtener los creditos de la semana: ', error);
        res.status(500).json({ message: 'Error al obtener creditos de la semana' });
    }
});


//Ruta para consultar los creditos totales del mes
router.get('/total-credits/month', async (req, res) => {
    try {
        const result = await statistics.getMonthlyCredits();
        res.status(200).json(result);
    } catch(error) {
        console.error('Error al obtener los creditos del mes: ', error);
        res.status(500).json({ message: 'Error al obtener creditos del mes' });
    }
});

//Ruta para consultar los pagos totales
router.get('/total-payments', async (req, res) => {
    try {
        const zona = req.query.zona;
        console.log('Zona llegada en la ruta: ', zona);

        if (!zona) {
            return res.status(400).json({ message: 'Debe ingresar una zona '});
        }

        const result = await statistics.getTotalPayments(zona);
        res.status(200).json(result);
        
    } catch(error) {
        console.error('Error al obtener los pagos por zona: ', error);
        res.status(500).json({ message: 'Error al obtener los pagos por zona' });
    }
});

module.exports = router;
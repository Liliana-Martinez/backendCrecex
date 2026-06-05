const express = require('express');
const router = express.Router();
const statistics = require('../controllers/statistics.controller')


//Ruta para guardar ingreso/egreso en caja
router.post('/cash', async (req, res) => { 
    try {
        const transaction = req.body;
        console.log('dataToSend recibido en routes: ', transaction);
        const result = await statistics.saveTransaction(transaction);
        res.status(200).json({message: 'Movimeinto guardado'});
    } catch(error) {
        console.error('Error al guardar movimiento en caja', error);
        res.status(500).json({ message: 'Error al guardar movimiento en caja'});
    }
});

//Ruta para el reporte diario de ingresos y egresos
router.get('/cash', async (req, res) => {
    try {
        const { reportType } = req.query; //Recibir el tipo de report que llega del front
        console.log('Tipo de reporte en el back: ', reportType);

        const reportOptions = ['daily', 'weekly', 'monthly'];

        if (!reportType || !reportOptions.includes(reportType)) {
            return res.status(400).json({ message: 'Opción de reporte no válido.'});
        }
        //Lamar al controller
        const result =  await statistics.getFinancialReportByPeriod(reportType);
        return res.status(200).json(result);
    } catch(error) {
        console.error('Error al obtener el reporte: ', error);
        return res.status(500).json({ message: 'Error al obtener el reporte.'});
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
        const { reportType } = req.query;
        console.log('Tipo de reporte en el back: ', reportType);
        const result = await statistics.getTotalPayments(reportType);
        res.status(200).json(result);
        
    } catch(error) {
        console.error('Error al obtener el reporte: ', error);
        return res.status(500).json({ message: 'Error al obtener el reporte.'});
    }
});

module.exports = router;
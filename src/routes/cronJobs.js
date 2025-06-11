const cron = require('node-cron');
const db = require('../db');
const actualizarAdelantos = require('../controllers/payments.controller'); 


cron.schedule('59 23 * * 5', () => {
  console.log(' Ejecutando tarea automática: actualizar adelantos...');
  actualizarAdelantos();
});

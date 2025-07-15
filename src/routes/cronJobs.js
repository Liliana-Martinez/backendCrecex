const cron = require('node-cron');
const { actualizarEstadosAtrasos } = require('../controllers/payments.controller')
const { actualizarEstadosAdelantos } = require('../controllers/payments.controller')
// Esta función solo maneja los atrasos
cron.schedule('1 17 * * 4', () => { //minutos, horas mijin V: JUEVES A LAS 5:01
  console.log(' Actualizando atrasos');
  actualizarEstadosAtrasos(); 
});
// Esta función solo maneja adelantos
cron.schedule('10 14 * * 2', () => { //VIERNES 1:00PM
  console.log(' Actualizando adelantos');
  actualizarEstadosAdelantos(); 
});

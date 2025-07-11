const cron = require('node-cron');
const { actualizarEstadosAtrasos } = require('../controllers/payments.controller')
const { actualizarEstadosAdelantos } = require('../controllers/payments.controller')
// Esta función solo maneja los atrasos
cron.schedule('1 17 * * 4', () => { //minutos, horas mijin V:
  console.log(' Actualizando atrasos');
  actualizarEstadosAtrasos(); 
});
// Esta función solo maneja adelantos
cron.schedule('1 17 * * 4', () => { 
  console.log(' Actualizando adelantos');
  actualizarEstadosAdelantos(); 
});

const cron = require('node-cron');
const { actualizarEstadosAtrasos } = require('../controllers/payments.controller')
const { actualizarEstadosAdelantos } = require('../controllers/payments.controller')
const { actualizarEstadosFalla } = require('../controllers/payments.controller')
// Esta maneja los atrasos
cron.schedule('1 17 * * 4', () => { //minutos, horas mijin V: JUEVES A LAS 5:00PM
  console.log(' Actualizando atrasos');
  actualizarEstadosAtrasos(); 
});
// maneja adelantos
cron.schedule('52 11 * * 3', () => { //VIERNES 1:00PM
  console.log(' Actualizando adelantos');
  actualizarEstadosAdelantos(); 
});

//maneja estados pendientes a falla lunes a la 1:00PM
cron.schedule('33 12 * * 3', () => {
  console.log('⏰ Ejecutando tarea automática: actualizar estados a "falla"');
  actualizarEstadosFalla();
});

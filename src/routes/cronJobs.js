const cron = require('node-cron');
const { actualizarEstadosAtrasos } = require('../controllers/payments.controller')
const { actualizarEstadosAdelantos } = require('../controllers/payments.controller')
const { actualizarEstadosFalla } = require('../controllers/payments.controller')
const { procesarCreditosVencidos } = require('../controllers/payments.controller')
// Esta maneja los atrasos
cron.schedule('50 23 * * 4', () => { //minutos, horas mijin V: JUEVES TODO EL DIA 
  console.log(' Actualizando atrasos');
  actualizarEstadosAtrasos(); 
});
// maneja los creditos que se vencen
cron.schedule('50 23 * * 4', () => {//Jueves todo el dia 
  console.log(
    'Procesando créditos vencidos'
  );
  procesarCreditosVencidos();
});
// maneja adelantos
cron.schedule('50 23 * * 5', () => { //VIERNES 12:00PM todo el dia 
  console.log(' Actualizando adelantos');
  actualizarEstadosAdelantos(); 
});

//maneja estados pendientes a falla lunes a la 2:00PM
cron.schedule('00 2 * * 1', () => {
  console.log(' Ejecutando tarea automática: actualizar estados a "falla"'
  );
  actualizarEstadosFalla();
});
// maneja los creditos que se vencen
cron.schedule('50 23 * * 4', () => {
  console.log(
    'Procesando créditos vencidos'
  );
  procesarCreditosVencidos();
});

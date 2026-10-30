const cron = require('node-cron');
const { procesarCreditosVencidos } = require('../controllers/payments.controller')
// maneja los creditos que se vencen
cron.schedule('50 23 * * 4', () => {
  console.log(
    'Procesando créditos vencidos'
  );
  procesarCreditosVencidos();
});

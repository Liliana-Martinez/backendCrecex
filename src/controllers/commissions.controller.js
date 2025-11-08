//const { now } = require('moment');
const db = require('../db');

const today = new Date();
const dayOfWeek = today.getDay();
const lastSaturday = new Date(today);
lastSaturday.setDate(today.getDate() - ((dayOfWeek + 1) % 7)); //Calcula el sabado anterior al dia de la consulta
const nextFriday = new Date(lastSaturday);
nextFriday.setDate(lastSaturday.getDate() + 6); //Calcular el proximo viernes
//Formatear las fechas para enviar como parametros solo fecha y no con la hora
const formatDate = date => date.toISOString().split('T')[0];
const startDate = formatDate(lastSaturday);
const endDate = formatDate(nextFriday);

//Helper
function queryAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

const getCommissionesByZone = async (idZona) => {
  const collectionRate = await getCollectionRate(idZona);//Columna porcentaje de cobranza
  const collectionExpenses = await getCollectionExpenses(idZona);//Columna gastos de cobranza
  /*const numberOfCredits = await getNumberOfCredits(idZona); //Numero de creditos
  const extras = await getExtras(idZona); //Extras*/

  return {
    collectionRate,
    collectionExpenses,
    /*numberOfCredits,
    extras*/
  };
}

//Funcion para calcular la cantidad correspondiente al porcentaje de cobranza
async function getCollectionRate(idZona) {
  try {

    let collectionRate = 0; //Variable para guardar el total de "Gastos de cobranza" que gano la promotora

    //Consulta para obtener la sumatoria de la columna "cantidad" de la tabla pagos (que hay en el rango sabado-viernes)
    const sumAmount = `
      SELECT SUM(cantidad) AS totalCantidad 
      FROM pagos p 
      INNER JOIN creditos c ON p.idCredito = c.idCredito
      INNER JOIN clientes cl ON c.idCliente = cl.idCliente
      WHERE 
        c.estado = 'activo' 
        AND cl.idZona = ?
        AND p.fechaEsperada BETWEEN ? AND ?`; 
    const resultSumAmount = await queryAsync(sumAmount, [idZona, startDate, endDate]);
    const total = resultSumAmount[0]?.totalCantidad || 0;

    //Consulta para obtener la sumatoria de "cantidadPagada" que representa lo que al final cobraron en total en la semana las promotoras
    const sumAmountPaid = `
      SELECT 
      SUM(cantidadPagada) AS totalCantidadPagada,
      SUM(extras) AS totalExtras
      FROM pagos p
      INNER JOIN creditos c ON p.idCredito = c.idCredito
      INNER JOIN clientes cl ON c.idCliente = cl.idCliente
      WHERE
        c.estado = 'activo'
        AND cl.idZona = ?
        AND p.fechaPagada BETWEEN ? AND ?
        AND p.estado IN ('pagado', 'incompleto', 'pagadoAtrasado', 'atraso')`;

    const resultSumAmountPaid = await queryAsync(sumAmountPaid, [idZona, startDate, endDate]);
    const amountPaid = resultSumAmountPaid[0]?.totalCantidadPagada || 0;
    const extras = resultSumAmountPaid[0]?.totalExtras || 0;
    const totalPaid = amountPaid + extras;
    //const { totalCantidad, totalCantidadPagada } = rows[0];
    console.log('Consulta para obtener las sumas: ', resultSumAmountPaid);
    console.log('amountPaid: ', amountPaid);
    console.log('extras: ', extras);

    //comparar el resultado de "cantidad" con "cantidadPag
    // ada" para obtener los porcentajes
    if (totalPaid >= total) { //Es decir, 100% o más
      collectionRate = (totalPaid * 8) / 100;
    } else {
      //Conocer primero el porcentaje de lo que se entrego
      const percentage = ((totalPaid * 100) / total).toFixed(2);
      //Una vez conocido el % ver los rangos para obtener el porcentaje de cobranza
      if (percentage >= 90 && percentage <= 99) {
        collectionRate =  (totalPaid * 7) / 100;
      } else if (percentage >= 80 && percentage <= 89) {
        collectionRate = (totalPaid * 6) / 100;
      } else if (percentage >= 70 && percentage <= 79) {
        collectionRate = (totalPaid * 5) / 100;
      } else if (percentage >= 60 && percentage <= 69) {
        collectionRate = (totalPaid * 4) / 100;
      } else if (percentage >= 50 && percentage <= 59) {
        collectionRate = (totalPaid * 3) / 100;
      } else if (percentage >= 40 && percentage <= 49) {
        collectionRate = (totalPaid * 2) / 100;
      } else if (percentage >= 30 && percentage <= 39) {
        collectionRate = (totalPaid * 1) / 100;
      } else {
        collectionRate = 0;
      }
    }

    console.log('Gasto de cobranza: ', collectionRate);
    return collectionRate;
  } catch(error) {
    console.log('Error al obtener los gastos de cobranza.', error);
    throw error
  }
}


//Funcion para calcular los gastos de cobranza por zona, es decir, por promotora
async function getCollectionExpenses(idZona) {
  let collectionExpenses = 0;
  console.log('Id de la zona en la funcion de gastos de cobranza: ', idZona);

  //Consulta para obtener los recargos de la tabla 'creditos'
  const sumCreditSurcharges = `
    SELECT SUM(c.recargos) as totalRecargos
    FROM creditos c
    INNER JOIN clientes cl ON c.idCliente = cl.idCliente
    WHERE 
      c.estado = 'activo' 
      AND cl.idZona = ?
      AND c.fechaEntrega BETWEEN ? AND ?
  `;

  const resultSumCreditSurcharges = await queryAsync(sumCreditSurcharges, [idZona, startDate, endDate]);
  const creditSurcharges = resultSumCreditSurcharges[0]?.totalRecargos || 0;
  console.log('recargos de la tabla creditos: ', creditSurcharges);

  //Consulta para obtener los recargos de la tabla 'pagos'
  const sumPaymentSurcharges = `
    SELECT SUM(p.recargos) as totalRecargos
    FROM pagos p
    INNER JOIN creditos c ON p.idCredito = c.idCredito
    INNER JOIN clientes cl ON c.idCliente = cl.idCliente
    WHERE
      c.estado = 'activo'
      AND cl.idZona = ?
      AND p.fechaPagada BETWEEN ? AND ?`;

  const resultPaymentSurcharges = await queryAsync(sumPaymentSurcharges, [idZona, startDate, endDate]);
  const paymentSurcharges = resultPaymentSurcharges[0]?.totalRecargos || 0;
  console.log('recargos de la tabla creditos: ', paymentSurcharges);

  collectionExpenses = creditSurcharges + paymentSurcharges;

  return collectionExpenses;
}

module.exports = { 
  getCommissionesByZone
  //getCreditsWeekByZone
  //getCollectionExpenses
};


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
  const numberCredits = await getTotalCredits(idZona); //Numero de creditos
  const extras = await getExtras(idZona); //Extras*/

  return {
    collectionRate,
    collectionExpenses,
    numberCredits,
    extras
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

    //comparar el resultado de "cantidad" con "cantidadPagada" para obtener los porcentajes
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

//Funcion para obtener la cantidad de creditos que hubo por semana por zona
async function getTotalCredits(idZona) {
  const numberCredits = `
    SELECT COUNT(*) AS totalCreditos
    FROM creditos c
    INNER JOIN clientes cl ON c.idCliente = cl.idCliente
    WHERE
      c.estado = 'activo'
      AND cl.idZona = ?
      AND c.fechaEntrega BETWEEN ? AND ?`;


  const resultNumberCredits = await queryAsync(numberCredits, [idZona, startDate, endDate]);
  const totalCredits = (resultNumberCredits[0]?.totalCreditos || 0) * 100;
  console.log('totalCredits: ', totalCredits);

  return totalCredits;
}

//Funcion para obtener los extras
async function getExtras(idZona) {

  //Obtener los supervisores (no repetidos y no nulos) para guardarlos en una lista
  const supervisorsListQuery = `
    SELECT DISTINCT supervicion 
    FROM zonas
    WHERE supervicion IS NOT NULL AND supervicion != ''`;
  const supervisorsListResult = await queryAsync(supervisorsListQuery);

  //Crear la lista con los supervisores
  let supervisorsList = supervisorsListResult.map(row => row.supervicion);
  console.log('Lista de supervisores: ', supervisorsList);

  //Consulta para obtener la promotora y la supervicion respecto al idZona 
  const staffQuery = `
    SELECT promotora, supervicion
    FROM zonas
    WHERE 
      idZona = ?`;
  
  const staffQueryResult = await queryAsync(staffQuery, [idZona]);
  console.log(staffQueryResult);
  if (staffQueryResult.length > 0) {
    let promoter = staffQueryResult[0].promotora || null;
    let supervicion = staffQueryResult[0].supervicion || null;
    if (supervisorsList.includes(promoter)) {
      //1. Obtener los IDs de las zonas que le pertenecen al (la) supervisor(a)
      const supervisorZonesQuery = `SELECT idZona FROM zonas WHERE supervicion = ?`;
      const supervisorZonesResult = await queryAsync(supervisorZonesQuery, [promoter]);

      let expectedByZone = 0; 
      let paidByZone = 0;
      let totalGeneral = 0;
      let supervisionCommission = 0;

      //Recorrer cada zona del supervisor(a)
      for (const zone of supervisorZonesResult) {
        const zoneId = zone.idZona;

        console.log('Zona en proceso: ', zoneId);

        //Consulta para obtener el dinero total que se debe de dar en la semana
        const expectedMoneyQuery = `
          SELECT SUM(cantidad) as totalCantidad
          FROM pagos p
          INNER JOIN creditos c ON p.idCredito = c.idCredito
          INNER JOIN clientes cl ON c.idCliente = cl.idCliente
          WHERE
            c.estado = 'activo'
            AND cl.idZona = ?
            AND fechaEsperada BETWEEN ? AND ?`;
        
        const expectedMoneyResult = await queryAsync(expectedMoneyQuery, [zoneId, startDate, endDate]);
        const expectedTotal = expectedMoneyResult[0].totalCantidad || 0;

        expectedByZone += expectedTotal;

        //Consulta para obtener el dinero pagado realmente
        const moneyPaidQuery = `
          SELECT SUM(cantidadPagada) as totalPagado,
          SUM(extras) as totalExtras
          FROM pagos p
          INNER JOIN creditos c ON p.idCredito = c.idCredito
          INNER JOIN clientes cl ON c.idCliente = cl.idCliente
          WHERE
            c.estado = 'activo'
            AND cl.idZona = ?
            AND p.fechaPagada BETWEEN ? AND ?
            AND p.estado IN ('pagado', 'incompleto', 'pagadoAtrasado', 'atraso')`;

        const moneyPaidResult = await queryAsync(moneyPaidQuery, [zoneId, startDate, endDate]);
        const totalPaid = moneyPaidResult[0]?.totalPagado || 0;
        const totalExtras = moneyPaidResult[0]?.totalExtras || 0;
        totalGeneral = totalPaid + totalExtras;
        paidByZone += totalGeneral;

        //Calcular la comision del supervisor(a)
        if (paidByZone >= expectedByZone) { //Es decir 100% o mas
          supervisionCommission = (paidByZone * 6) / 100;
        } else {
          //Saber primero el porcentaje que se entrego
          const supervisionPercentage = ((paidByZone * 100) / expectedByZone).toFixed(2);
          //Una vez conocido el porcentaje asignar la comision correspondiente
          if (supervisionPercentage >= 95 && supervisionPercentage <= 99) {
            supervisionCommission = (paidByZone * 5) / 100;
          }  else if (supervisionPercentage >= 90 && supervisionPercentage <= 94) {
            supervisionCommission = (paidByZone * 4) / 100;
          } else if (supervisionPercentage >= 85 && supervisionPercentage <= 89) {
            supervisionCommission = (paidByZone * 3) / 100;
          } else if (supervisionPercentage >= 80 && supervisionPercentage <= 84) {
            supervisionCommission = (paidByZone * 2) / 100;
          } else if (supervisionPercentage >= 75 && supervisionPercentage <= 79) {
            supervisionCommission = (paidByZone * 1) / 100;
          } else {
            supervisionCommission = 0;
          }
        }

        return supervisionCommission;

      }
    } else {
      console.log('La promotora NO es supervisora.');
    }
  } else {
    console.log('No hay registros para esta zona.')
  }
  

}

module.exports = { 
  getCommissionesByZone
};


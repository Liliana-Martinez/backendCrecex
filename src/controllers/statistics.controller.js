const db = require('../db');
const dayjs = require('dayjs');

const TABLE_CREDITS = 'creditos';
const TABLE_CLIENTES = 'clientes';

//"Helper"
function queryAsync(sql, params = []) {
return new Promise((resolve, reject) => {
        db.query(sql, params, (err, results) => {
            if (err) return reject(err);
            resolve(results);
        });
    });
}

async function getInitialAmountDaily() {
    try {
        const today = new Date();
        const dayOfWeek = today.getDay(); // 1 = lunes
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);

        const formattedDate = yesterday.toISOString().split('T')[0]; // yyyy-mm-dd
        console.log('Fecha consultada:', formattedDate);


        if (dayOfWeek === 1) {
            // Si es lunes, se espera que el valor lo ingrese el usuario, no lo calculamos
            return { monto: null }; 
        }

        const [row] = await queryAsync(`
            SELECT 
                SUM(ingresosPagos) AS totalIngresosPagos, 
                SUM(ingresosExtra) AS totalIngresosExtra 
            FROM caja 
            WHERE fecha = ?
            `, [formattedDate]);

        const ingresosPagos = row.totalIngresosPagos || 0;
        const ingresosExtra = row.totalIngresosExtra || 0;

        const monto = ingresosPagos + ingresosExtra;

        return { monto };

    } catch (error) {
        throw error;
    }
}

async function getDailyReport() {
    try {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() +1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const todayStr = `${yyyy}-${mm}-${dd}`;

        const queryDaily = `SELECT 
            fecha AS date, 
            ingresosPagos AS paymentsIncome, ingresosExtra AS extraIncome, ingresosDescripcion AS descriptionIncome, 
            egresosExtra AS extraExpenses, egresosDescripcion AS descriptionExpenses FROM caja WHERE DATE(fecha) = CURDATE()`;

        const dailyResult = await queryAsync(queryDaily, [todayStr]);
        
        //Consulta en la tabla creditos para obtener los creditos del dia
        const queryCreditSum = `
            SELECT SUM(efectivo) AS expenses
            FROM creditos
            WHERE DATE(fechaEntrega) = CURDATE()
        `;

        const creditResult = await queryAsync(queryCreditSum);

        //Agregar la suma de creditos diarios al objeto de la consulta para el reporte diario
        const dailyReport = dailyResult.map(row => ({
            ...row,
            expenses: creditResult[0]?.expenses || 0
        }));

        return dailyReport;

    } catch(error) {
        throw error;
    }
}

async function getWeeklyReport() {
    try {
        const queryWeekly = `SELECT fecha AS date, ingresosPagos AS paymentsIncome, ingresosExtra AS extraIncome, ingresosDescripcion AS descriptionIncome, egresosExtra AS extraExpenses, egresosDescripcion AS descriptionExpenses FROM caja WHERE YEARWEEK(fecha, 1) = YEARWEEK(CURDATE(), 1)`;

        const weeklyResult = await queryAsync(queryWeekly);
        
        //Consulta en la tabla creditos para obtener los creditos de la semana
        const queryCreditSum = `
        SELECT SUM(monto) AS expenses
        FROM creditos
        WHERE DATE(fechaEntrega) = CURDATE()`;

        const creditResult = await queryAsync(queryCreditSum);

        //Agregar la suma de creditos diarios al objeto de la consulta para el reporte semanal
        const weeklyReport = weeklyResult.map(row => ({
            ...row,
            expenses: creditResult[0]?.expenses || 0
        }));

        return weeklyReport;

    } catch(error) {
        throw error;
    }
}

async function getMonthlyReport() {
    try {
        const queryMonthly = `SELECT fecha AS date, ingresosPagos AS paymentsIncome, ingresosExtra AS extraIncome, ingresosDescripcion AS descriptionIncome, egresosExtra AS extraExpenses, egresosDescripcion AS descriptionExpenses FROM caja WHERE YEARWEEK(fecha, 1) = YEARWEEK(CURDATE(), 1)`;

        const monthlyResult = await queryAsync(queryMonthly);
        
        //Consulta en la tabla creditos para obtener los creditos de la semana
        const queryCreditSum = `
        SELECT SUM(monto) AS expenses
        FROM creditos
        WHERE DATE(fechaEntrega) = CURDATE()`;

        const creditResult = await queryAsync(queryCreditSum);

        //Agregar la suma de creditos diarios al objeto de la consulta para el reporte semanal
        const monthlyReport = monthlyResult.map(row => ({
            ...row,
            expenses: creditResult[0]?.expenses || 0
        }));

        return monthlyReport;

    } catch(error) {
        throw error;
    }
}

async function getDailyCredits() {
    try {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() +1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const todayStr = `${yyyy}-${mm}-${dd}`;

        const queryDaily = `SELECT idCredito, monto AS creditAmount, fechaEntrega AS date FROM ${TABLE_CREDITS} WHERE DATE(fechaEntrega) = CURDATE()`;

        const result = await queryAsync(queryDaily, [todayStr]);
        console.log('Resultado de consulta diaria: ', result);
        return result;

    } catch(error) {
        throw error;
    }
}

async function getWeeklyCredits() {
    try {
        const queryWeekly = `SELECT idCredito, monto AS creditAmount, fechaEntrega AS date FROM ${TABLE_CREDITS} WHERE YEARWEEK(fechaEntrega, 1) = YEARWEEK(CURDATE(), 1)`;

        const weeklyCredits = await queryAsync(queryWeekly);
        return weeklyCredits;

    } catch(error) {
        throw error;
    }
}

async function getMonthlyCredits() {
    try {
        const queryMonthly = `SELECT idCredito, monto AS creditAmount, fechaEntrega AS date FROM ${TABLE_CREDITS} WHERE MONTH(fechaEntrega) = MONTH(CURDATE())
        AND YEAR(fechaEntrega) = YEAR(CURDATE())`;

        const monthlyCredits = await queryAsync(queryMonthly);
        return monthlyCredits;

    } catch(error) {
        throw error;
    }
}

async function getTotalPayments(zona) {
  try {
    const today = dayjs();
    const startOfWeek = today.startOf('week').format('YYYY-MM-DD');
    console.log('Inicio de semama: ', startOfWeek);
    const endOfWeek = today.endOf('week').format('YYYY-MM-DD');
    console.log('Fin de semana: ', endOfWeek);

    //Consulta para obtener los pagos que hay por zona
    const query = `
      SELECT 
        CONCAT(cl.nombre, ' ', cl.apellidoPaterno, ' ', cl.apellidoMaterno) AS clientName,
        cr.monto AS creditAmount,
        p.cantidad AS weeklyAmount,
        p.fechaEsperada AS paymentDate
      FROM pagos p
      JOIN creditos cr ON p.idCredito = cr.idCredito
      JOIN clientes cl ON cr.idCliente = cl.idCliente
      JOIN zonas z ON cl.idZona = z.idZona
      WHERE z.codigoZona = ?
        AND p.fechaEsperada BETWEEN ? AND ?
    `;

    const payments = await queryAsync(query, [zona, startOfWeek, endOfWeek]);

    //Consulta para obtener el total recibido de pagos en efectivo de la misma semana
    const totalIngresosQuery = `
        SELECT SUM(ingresosPagos) AS totalReceived
        FROM caja
        WHERE fecha BETWEEN ? AND ?`
    ;
    
    const [ingresosResult] = await queryAsync(totalIngresosQuery, [startOfWeek, endOfWeek]);
    const totalReceived = ingresosResult?.totalReceived || 0;

    return {
        payments, 
        totalReceived
    };

  } catch (error) {
    throw error;
  }
}


module.exports = {
    getInitialAmountDaily,
    getDailyReport,
    getWeeklyReport,
    getMonthlyReport,
    getDailyCredits,
    getWeeklyCredits,
    getMonthlyCredits,
    getTotalPayments
}
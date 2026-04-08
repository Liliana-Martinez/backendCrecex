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

function formatDate(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() +1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    
    return `${yyyy}-${mm}-${dd}`;
}

//Guardar el ingreso/egreso en caja
async function saveTransaction(transaction) {
    try {
        
    } catch (error) {
        throw error;
    }
}

//Obtener datos para el formulario y reporte segun sea el tipo, diario, semanal o mensual
async function getFinancialReportByPeriod(reportType) {
    try {
        const today = new Date();
        const todayFormatted = formatDate(today);//Fecha para las consultas de los ingresos, egresos y comisiones diarias
        let startDate; //Rango para reporte
        let endDate; //Rango para reporte
        
        //Calcular rango
        if (reportType === 'daily') {
            startDate = formatDate(today);
            endDate = formatDate(today);
        }

        if (reportType === 'weekly') {
            const day = today.getDay(); //número de dia del mes

            const saturday = new Date(today);
            saturday.setDate(today.getDate() - ((day + 1) % 7));

            const friday = new Date(saturday);
            friday.setDate(saturday.getDate() + 6);

            startDate = formatDate(saturday);
            endDate = formatDate(friday);
        }

        if (reportType === 'monthly') {
            const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
            const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

            startDate = formatDate(firstDay);
            endDate = formatDate(lastDay);
        }

        console.log('Rango: ', startDate, endDate);

        //Query para el total de pagos del día (para valor en el formulario)
        const dailyTotalPaymentsQuery = `
        SELECT
            COALESCE(SUM(
                CASE
                    WHEN tipoPago = 'efectivo' THEN (cantidadPagada + COALESCE(extras, 0) + COALESCE(recargos, 0)) - COALESCE(cantidadEfectivo, 0)
                    WHEN tipoPago = 'pagado' THEN (cantidadPagada + COALESCE(extras, 0) + COALESCE(recargos, 0))
                    ELSE 0
                END
            ), 0) AS totalPagos
        FROM pagos
        WHERE fechaPagada BETWEEN ? AND ?
        AND estado IN('pagado', 'incompleto', 'atraso', 'pagoAtrasado')
        `;
        const [dailyResultPayments] = await queryAsync(dailyTotalPaymentsQuery, [todayFormatted, todayFormatted]);
        const dailyTotalPayments = dailyResultPayments.totalPagos;

        //Query para obtener las salidas de egresos de creditos del dia
        const dailyTotalCreditsQuery = `
        SELECT COALESCE(SUM(efectivo), 0) AS totalCredits
        FROM creditos
        WHERE fechaEntrega BETWEEN ? AND ?
        `;
        const [dailyResultCredits] = await queryAsync(dailyTotalCreditsQuery, [todayFormatted, todayFormatted]);
        const dailyTotalCredits = dailyResultCredits.totalCredits;

        //Query para obtener los egresos especificamente de las comisiones del dia
        const dailyTotalCommissionsQuery = `
        SELECT COALESCE(SUM(monto), 0) AS totalCommissions
        FROM caja
        WHERE fecha BETWEEN ? AND ?
        AND tipoMovimiento = 'egreso'
        AND categoria = 'comision'
        `;
        const [dailyResultCommissions] = await queryAsync(dailyTotalCommissionsQuery, [todayFormatted, todayFormatted]);
        const dailyTotalCommissions = dailyResultCommissions.totalCommissions;

        //Consultas para obtener el reporte de ingresos segun el tipo de reporte(weekly o monthly)
        //Consulta para el total de pagos (weekly, monthly)
        const totalPaymentsReportQuery = `
            SELECT COALESCE(SUM(
            CASE
                WHEN tipoPago = 'efectivo' THEN (cantidadPagada + COALESCE(extras, 0) + COALESCE(recargos, 0)) - COALESCE(cantidadEfectivo, 0)
                WHEN tipoPago = 'pagado' THEN (cantidadPagada + COALESCE(extras, 0) + COALESCE(recargos, 0))
            END
            ), 0) AS totalPagos
            FROM pagos
            WHERE fechaPagada BETWEEN ? AND ?
            AND estado IN ('pagado', 'incompleto', 'atraso', 'pagoAtrasado')
        `;
        const [paymentsReportResult] = await queryAsync(totalPaymentsReportQuery, [startDate, endDate]);
        const paymentsReport = paymentsReportResult.totalPagos;

        //Consulta para obtener los ingresos extra y su descripcion segun el tipo de reporte
        const extraIncomeReportQuery = `
            SELECT fecha, descripcion, monto
            FROM caja
            WHERE tipoMovimiento = 'ingreso'
            AND categoria = 'extra'
            AND fecha BETWEEN ? AND ?
            AND monto > 0
            ORDER BY fecha ASC
        `;
        const extraIncomeReport = await queryAsync(extraIncomeReportQuery, [startDate, endDate]);

        //Consultas para obtener lo del reporte de egresos segun el tipo
        //Consulta para los egresos de creditos
        const totalCreditsReportQuery = `
            SELECT COALESCE(SUM(efectivo), 0) AS totalCredits
            FROM creditos
            WHERE fechaEntrega BETWEEN ? AND ?
        `;
        const [creditsReportResult] = await queryAsync(totalCreditsReportQuery, [startDate, endDate]);
        const creditsReport = creditsReportResult.totalCredits;

        //Consulta para obtener los egresos extra
        const extraExpensesReportQuery = `
            SELECT fecha, descripcion, monto
            FROM caja
            WHERE tipoMovimiento = 'egreso'
            AND categoria = 'extra'
            AND fecha BETWEEN ? AND ?
            AND monto > 0
            ORDER BY fecha ASC
        `;
        const extraExpensesReport = await queryAsync(extraExpensesReportQuery, [startDate, endDate]);

        //Consulta para obtener los egresos de comisiones de la semana
        const commissionExpensesReportQuery = `
            SELECT fecha, descripcion, monto
            FROM caja
            WHERE tipoMovimiento = 'egreso'
            AND categoria = 'comision'
            AND fecha BETWEEN ? AND ?
            AND monto > 0
            ORDER BY fecha ASC
        `;
        const commissionExpensesReport =  await queryAsync(commissionExpensesReportQuery, [startDate, endDate]);

        //Obtener totales de ingresos y egresos para sumatoria
        const totalExtraIncomeQuery = `
            SELECT COALESCE(SUM(monto), 0) AS totalExtras
            FROM caja
            WHERE tipoMovimiento = 'ingreso'
            AND categoria = 'extra'
            AND fecha BETWEEN ? AND ?
            AND monto > 0
        `;
        const [totalExtraIncomeResult] = await queryAsync(totalExtraIncomeQuery, [startDate, endDate]);
        const totalExtraIncome = totalExtraIncomeResult.totalExtras;

        //Obtener totales de egresos extra
        const totalExtraExpensesQuery = `
            SELECT COALESCE(SUM(monto), 0) AS totalExtras
            FROM caja
            WHERE tipoMovimiento = 'egreso'
            AND categoria IN('extra', 'comision') 
            AND fecha BETWEEN ? AND ?
            AND monto > 0
        `;
        const [totalExtraExpensesResult] = await queryAsync(totalExtraExpensesQuery, [startDate, endDate]);
        const totalExtraExpenses = totalExtraExpensesResult.totalExtras;
        
        //Resultado de regreso
        return {
            dailyData: {
                income: dailyTotalPayments,
                expenses: dailyTotalCredits,
                commissions: dailyTotalCommissions
            },
            income: { //Para el reporte de ingresos
                payments: paymentsReport,
                transactions: extraIncomeReport,
                total: paymentsReport + totalExtraIncome
            },expenses: { //Para el reporte de egresos
                credits: creditsReport,
                transactions: extraExpensesReport,
                commissions: commissionExpensesReport,
                total: creditsReport + totalExtraExpenses
            }
            
        };

    } catch(error) {
        console.error('Error en getFinancialReportByPeriod:', error);
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

        const queryDaily = `
        SELECT
            c.idCredito,
            c.monto AS creditAmount,
            c.fechaEntrega AS date,
            1c.semanas AS creditWeeks,
            CONCAT(cl.nombre, ' ', cl.apellidoPaterno, ' ', cl.apellidoMaterno) AS client,
            z.promotor AS promoter
        FROM ${TABLE_CREDITS} c
        INNER JOIN clientes cl ON c.idCliente = cl.idCliente
        INNER JOIN zonas z ON cl.idZona= z.idZona
        WHERE DATE(c.fechaEntrega) = CURDATE()
        `;

        const result = await queryAsync(queryDaily, [todayStr]);
        console.log('Resultado de consulta diaria: ', result);
        return result;

    } catch(error) {
        throw error;
    }
}

async function getWeeklyCredits() {
    try {

        const queryWeekly = `
        SELECT
            c.idCredito,
            c.monto AS creditAmount,
            c.fechaEntrega AS date,
            c.semanas AS creditWeeks,
            CONCAT(cl.nombre, ' ', cl.apellidoPaterno, ' ', cl.apellidoMaterno) AS client,
            z.promotor AS promoter
        FROM ${TABLE_CREDITS} c
        INNER JOIN clientes cl ON c.idCliente = cl.idCliente
        INNER JOIN zonas z ON cl.idZona= z.idZona
        WHERE YEARWEEK(fechaEntrega, 1) = YEARWEEK(CURDATE(), 1)`;

        const weeklyCredits = await queryAsync(queryWeekly);
        return weeklyCredits;

    } catch(error) {
        throw error;
    }
}

async function getMonthlyCredits() {
    try {

        const queryMonthly = `
        SELECT
            c.idCredito,
            c.monto AS creditAmount,
            c.fechaEntrega AS date,
            c.semanas AS creditWeeks,
            CONCAT(cl.nombre, ' ', cl.apellidoPaterno, ' ', cl.apellidoMaterno) AS client,
            z.promotor AS promoter
        FROM ${TABLE_CREDITS} c
        INNER JOIN clientes cl ON c.idCliente = cl.idCliente
        INNER JOIN zonas z ON cl.idZona= z.idZona
        WHERE MONTH(fechaEntrega) = MONTH(CURDATE())
        AND YEAR(fechaEntrega) = YEAR(CURDATE())`;
        /*const queryMonthly = `SELECT idCredito, monto AS creditAmount, fechaEntrega AS date FROM ${TABLE_CREDITS} WHERE MONTH(fechaEntrega) = MONTH(CURDATE())
        AND YEAR(fechaEntrega) = YEAR(CURDATE())`;*/

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
    saveTransaction,
    getFinancialReportByPeriod,
    getDailyCredits,
    getWeeklyCredits,
    getMonthlyCredits,
    getTotalPayments
}
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
        console.log('transaction: ', transaction);

        const movements = [];

        // 🟢 INGRESO
        if (
            transaction.income &&
            transaction.income.amount &&
            Number(transaction.income.amount) > 0
        ) {
            movements.push({
                tipoMovimiento: 'ingreso',
                categoria: 'extra',
                monto: transaction.income.amount,
                descripcion: transaction.income.description
            });
        }

        // 🔴 EGRESO
        if (
            transaction.expense &&
            transaction.expense.amount &&
            Number(transaction.expense.amount) > 0
        ) {
            movements.push({
                tipoMovimiento: 'egreso',
                categoria: 'extra',
                monto: transaction.expense.amount,
                descripcion: transaction.expense.description
            });
        }

        console.log('movements:', movements);

        // 🗓️ Fecha actual
        const today = new Date();

        // 🧠 Query
        const insertQuery = `
            INSERT INTO caja (fecha, tipoMovimiento, categoria, descripcion, monto)
            VALUES (?, ?, ?, ?, ?)
        `;

        // 🔁 Insertar cada movimiento
        for (const m of movements) {
            await queryAsync(insertQuery, [
                today,
                m.tipoMovimiento,
                m.categoria,
                m.descripcion,
                m.monto
            ]);
        }

        return { message: 'Movimientos guardados correctamente' };

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

        //Query para el total de pagos del día (para valor en el formulario) ✅
        const dailyTotalPaymentsQuery = `
        SELECT
            COALESCE(SUM(
                CASE
                    WHEN tipoPago = 'efectivo' THEN (cantidadPagada + COALESCE(extras, 0) + COALESCE(recargos, 0)) - COALESCE(adeudo, 0)
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

        //Obtener la sumatoria de ingresos extra ✅
        const totalExtraIncomeQuery = `
            SELECT COALESCE(SUM(monto), 0) AS totalExtras
            FROM caja
            WHERE tipoMovimiento = 'ingreso'
            AND categoria = 'extra'
            AND fecha BETWEEN ? AND ?
            AND monto > 0
        `;
        const [totalExtraIncomeResult] = await queryAsync(totalExtraIncomeQuery, [todayFormatted, todayFormatted]);
        const totalExtraIncome = totalExtraIncomeResult.totalExtras;

        //Query para obtener las salidas de egresos de creditos del dia ✅
        const dailyTotalCreditsQuery = `
        SELECT COALESCE(SUM(efectivo), 0) AS totalCredits
        FROM creditos
        WHERE fechaEntrega BETWEEN ? AND ?
        `;
        const [dailyResultCredits] = await queryAsync(dailyTotalCreditsQuery, [todayFormatted, todayFormatted]);
        const dailyTotalCredits = dailyResultCredits.totalCredits;

        //Obtener la sumatoria de egresos extra✅
        const totalExtraExpensesQuery = `
            SELECT COALESCE(SUM(monto), 0) AS totalExtras
            FROM caja
            WHERE tipoMovimiento = 'egreso'
            AND categoria = 'extra' 
            AND fecha BETWEEN ? AND ?
            AND monto > 0
        `;
        const [totalExtraExpensesResult] = await queryAsync(totalExtraExpensesQuery, [todayFormatted, todayFormatted]);
        const totalExtraExpenses = totalExtraExpensesResult.totalExtras;

        //Query para obtener los egresos especificamente de las comisiones del dia✅
        const dailyTotalCommissionsQuery = `
        SELECT COALESCE(SUM(monto), 0) AS totalCommissions
        FROM caja
        WHERE fecha BETWEEN ? AND ?
        AND tipoMovimiento = 'egreso'
        AND categoria = 'comision'
        `;
        const [dailyResultCommissions] = await queryAsync(dailyTotalCommissionsQuery, [todayFormatted, todayFormatted]);
        const dailyTotalCommissions = dailyResultCommissions.totalCommissions;
        console.log('sumatoria de egresos de comisiones: ', dailyResultCommissions);


        /****************************************************************************************************************************** */
        //Consultas para obtener el reporte de ingresos segun el tipo de reporte(weekly o monthly)
        //Consulta para el total de pagos (weekly, monthly)
        const totalPaymentsReportQuery = `
            SELECT COALESCE(SUM(
            CASE
                WHEN tipoPago = 'efectivo' THEN (cantidadPagada + COALESCE(extras, 0) + COALESCE(recargos, 0)) - COALESCE(adeudo, 0)
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

        //Consulta para obtener la uma de ingresos extra en el rango
        const totalExtraIncomeReportQuery = `
            SELECT COALESCE(SUM(monto), 0) AS totalExtras
            FROM caja
            WHERE tipoMovimiento = 'ingreso'
            AND categoria = 'extra'
            AND fecha BETWEEN ? AND ?
            AND monto > 0
        `;
        const [totalExtraIncomeReportResult] = await queryAsync(totalExtraIncomeReportQuery, [startDate, endDate]);
        const totalExtraIncomeReport = totalExtraIncomeReportResult.totalExtras;

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
        console.log('Comisiones: ', commissionExpensesReport);

         //Consulta para obtener la uma de egresos extra en el rango
        const totalExtraExpensesReportQuery = `
            SELECT COALESCE(SUM(monto), 0) AS totalExtras
            FROM caja
            WHERE tipoMovimiento = 'egreso'
            AND categoria IN('extra', 'comision')
            AND fecha BETWEEN ? AND ?
            AND monto > 0
        `;
        const [totalExtraExpensesReportResult] = await queryAsync(totalExtraExpensesReportQuery, [startDate, endDate]);
        const totalExtraExpensesReport = totalExtraExpensesReportResult.totalExtras;
        
        //Resultado de regreso
        return {
            dailyData: {
                income: dailyTotalPayments,
                expenses: dailyTotalCredits,
                commissions: dailyTotalCommissions,
                totalIncome: dailyTotalPayments + totalExtraIncome,
                totalExpenses: dailyTotalCredits + totalExtraExpenses + dailyTotalCommissions
            },
            income: { //Para el reporte de ingresos
                payments: paymentsReport,
                transactions: extraIncomeReport,
                total: paymentsReport + totalExtraIncomeReport
            },expenses: { //Para el reporte de egresos
                credits: creditsReport,
                transactions: extraExpensesReport,
                commissions: commissionExpensesReport,
                total: creditsReport + totalExtraExpensesReport
            }, cash: {
                totalCash: (paymentsReport + totalExtraIncomeReport) - (creditsReport + totalExtraExpensesReport)
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
            c.semanas AS creditWeeks,
            c.tipoCredito AS typeCredit,
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
            c.tipoCredito AS typeCredit,
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
            c.tipoCredito AS typeCredit,
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
        console.log('Respuesta al front:', monthlyCredits);
        return monthlyCredits;
        
    } catch(error) {
        throw error;
    }
}

async function getTotalPayments(reportType) {
  try {
    const today = new Date();
    const todayFormatted = formatDate(today);
    let startDate;
    let endDate;
    let collectedAmountPercentage = 0;
    let outstandingAmount = 0;
    let outstandingAmountPercentage = 0;

    //Calcular el rango de fechas para las consultas
    if (reportType === 'daily') {
        startDate = formatDate(today);
        endDate = formatDate(today);
    }

    if (reportType === 'weekly') {
        const day = today.getDay();

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

    console.log('primer dia de mes: ', startDate);
    console.log('ultimo dia: ', endDate);

    //Consulta para obtener el total de pagos que debe de haber durante el día
    const dailyTotalPaymentsQuery = `
        SELECT COALESCE(SUM(cantidad), 0) AS dailyTotalPayments
        FROM pagos
        WHERE fechaEsperada BETWEEN ? AND ?
    `;
    const [dailyTotalPaymentsResult] = await queryAsync(dailyTotalPaymentsQuery, [todayFormatted, todayFormatted]);
    const dailyTotalPayments = dailyTotalPaymentsResult.dailyTotalPayments;
    console.log('dailyTotalPayments: ', dailyTotalPayments);

    //Consulta para obtener el dinero cobrado durante el dia
    const dailyTotalCollectedAmountQuery = `
        SELECT COALESCE(SUM(cantidadPagada), 0) AS dailyTotalCollectedAmount
        FROM pagos
        WHERE fechaPagada BETWEEN ? AND ?
        AND tipoPago IN('efectivo', 'transferencia')
        AND estado IN('pagado', 'incompleto')
    `;
    const [dailyTotalCollectedAmountResult] = await queryAsync(dailyTotalCollectedAmountQuery, [todayFormatted, todayFormatted]);
    const dailyTotalCollectedAmount = dailyTotalCollectedAmountResult.dailyTotalCollectedAmount;

    if (dailyTotalPayments > 0) {
        collectedAmountPercentage = Number(((dailyTotalCollectedAmount / dailyTotalPayments) * 100).toFixed(2));
        outstandingAmount = dailyTotalPayments - dailyTotalCollectedAmount;
        outstandingAmountPercentage = Number(((outstandingAmount / dailyTotalPayments) * 100).toFixed(2));
    } 

    //Consultas para obtener los valores cuando el reporte es semanal o mensual
    //Consulta para obtener el total de pagos que debe de haber durante el rango
    const totalPaymentsQuery = `
        SELECT COALESCE(SUM(cantidad), 0) AS totalPayments
        FROM pagos
        WHERE fechaEsperada BETWEEN ? AND ?
        `;
    const [totalPaymentsResult] = await queryAsync(totalPaymentsQuery, [startDate, endDate]);
    const totalPayments = totalPaymentsResult.totalPayments;

    //Consulta para obtener el dinero cobrado en el rango
    const totalCollectedAmountQuery = `
        SELECT COALESCE(SUM(cantidadPagada), 0) AS totalCollectedAmount
        FROM pagos
        WHERE fechaPagada BETWEEN ? AND ?
        AND tipoPago IN('efectivo', 'transferencia')
        AND estado IN('pagado', 'incompleto', 'atraso', 'pagadoAtrasado')`;
    const [totalCollectedAmountResult] = await queryAsync(totalCollectedAmountQuery, [startDate, endDate]);
    const totalCollectedAmount = totalCollectedAmountResult.totalCollectedAmount;

    if (totalPayments > 0) {
        collectedAmountPercentage = Number(((totalCollectedAmount / totalPayments) * 100).toFixed(2));
        outstandingAmount = totalPayments - totalCollectedAmount;
        outstandingAmountPercentage = Number(((outstandingAmount / totalPayments) * 100).toFixed(2));
    }
    

    return {
        summary: {
            collectedAmount: dailyTotalCollectedAmount,
            collectedAmountPercentage: collectedAmountPercentage,
            outstandingAmount: outstandingAmount,
            outstandingAmountPercentage: outstandingAmountPercentage
        }
    }

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
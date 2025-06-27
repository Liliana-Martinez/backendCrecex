const db = require('../db');
const TABLE_CLIENTES = 'clientes';
const TABLE_CREDITOS = 'creditos';
const TABLE_PAGOS = 'pagos';
const TABLE_AVALES = 'avales'
function queryAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, results) => {
        if (err) return reject(err);
            resolve(results);
        });
    });
}  

const SearchCredit = (nombreCompleto) => {
    return new Promise((resolve, reject) => {
    const queryCliente = `
      SELECT idCliente, nombre, apellidoPaterno, apellidoMaterno, telefono, domicilio, clasificacion, tipoCliente
      FROM ${TABLE_CLIENTES}
      WHERE CONCAT_WS(' ', nombre, apellidoPaterno, apellidoMaterno) COLLATE utf8mb4_general_ci LIKE ?`;
    const formattedNombre = `%${nombreCompleto.trim()}%`;
    db.query(queryCliente, [formattedNombre], (err, clienteRows) => {
    if (err) return reject({ code: 500, message: 'Error al buscar cliente' });
        if (clienteRows.length === 0) {
            return reject({ code: 404, message: 'Cliente no encontrado' });
        }
        const cliente = clienteRows[0];
        const idCliente = cliente.idCliente;
        const queryCredito = `
            SELECT idCredito, monto, fechaEntrega, semanas, abonoSemanal
            FROM ${TABLE_CREDITOS}
            WHERE idCliente = ? AND estado = 'activo'
            LIMIT 1`;
        db.query(queryCredito, [idCliente], (err, creditoRows) => {
        if (err) return reject({ code: 500, message: 'Error al buscar crédito' });
        const credito = creditoRows[0] || null;
            if (!credito) {
                return resolve({ cliente, credito: null, pagos: [], totalDescontarSemanas: 0 });
            }
        const idCredito = credito.idCredito;
        const queryUltimaSemana = `
          SELECT numeroSemana, cantidad, cantidadPagada, estado
          FROM ${TABLE_PAGOS}
          WHERE idCredito = ?
            AND (estado = 'pagado' OR estado = 'adelantado')
          ORDER BY numeroSemana DESC
          LIMIT 1`;
        db.query(queryUltimaSemana, [idCredito], (err, pagosRows) => {
            if (err) return reject({ code: 500, message: 'Error al buscar última semana pagada' });
                const ultimaSemanaPago = pagosRows.length > 0 ? pagosRows[0] : null;
                const ultimaSemana = ultimaSemanaPago ? ultimaSemanaPago.numeroSemana : 0;
                const queryPagosSiguientes = `
                    SELECT numeroSemana, cantidad, cantidadPagada, estado
                    FROM ${TABLE_PAGOS}
                    WHERE idCredito = ?
                        AND numeroSemana > ?
                    ORDER BY numeroSemana ASC`;
                db.query(queryPagosSiguientes, [idCredito, ultimaSemana], (err, pagosRestantes) => {
                if (err) return reject({ code: 500, message: 'Error al calcular semanas restantes' });
                    let totalDescontarSemanas = 0;
                    for (let pago of pagosRestantes) {
                        if (pago.estado === 'adelantadoIncompleto') {
                            totalDescontarSemanas += pago.cantidad - pago.cantidadPagada;
                        } else if (pago.estado === 'pendiente') {
                            totalDescontarSemanas += pago.cantidad;
                        }
                    }
                return resolve({
                    cliente,
                    credito,
                    pagos: ultimaSemanaPago ? [ultimaSemanaPago] : [],
                    semanas: ultimaSemana,
                    totalDescontarSemanas
                });
                });
        });
        });
    });
    });
};


const SearchCollectors = (nombreCompleto) => {
    return new Promise((resolve, reject) => {
        const formattedNombre = `%${nombreCompleto.trim()}%`;
        const queryCliente = `
            SELECT c.idCliente, c.nombre, c.apellidoPaterno, c.apellidoMaterno, c.edad, c.domicilio,
                   c.colonia, c.ciudad, c.telefono, c.clasificacion, c.tipoCliente, c.puntos,
                   c.trabajo, c.domicilioTrabajo, c.telefonoTrabajo,
                   c.nombreReferencia, c.domicilioReferencia, c.telefonoReferencia,
                   z.codigoZona, z.promotora
            FROM clientes c
            LEFT JOIN zonas z ON c.idZona = z.idZona
            WHERE CONCAT_WS(' ', c.nombre, c.apellidoPaterno, c.apellidoMaterno) COLLATE utf8mb4_general_ci LIKE ?
            LIMIT 1`;
        db.query(queryCliente, [formattedNombre], (err, clienteRows) => {
            if (err) return reject(`Error al buscar cliente: ${err.message}`);
            if (clienteRows.length === 0) {
                return reject({ code: 404, message: 'Cliente no encontrado' });
            }
            const cliente = clienteRows[0];
            const idCliente = cliente.idCliente;
            const queryAvales = `
                SELECT idAval, idCliente, nombre, apellidoPaterno, apellidoMaterno, edad, domicilio, telefono,
                       trabajo, domicilioTrabajo, telefonoTrabajo
                FROM avales
                WHERE idCliente = ?`;
            db.query(queryAvales, [idCliente], (err, avalesRows) => {
                if (err) return reject('Error al buscar avales');
                const queryGarantiasCliente = `
                    SELECT idGarantia, idCliente, descripcion
                    FROM garantias_cliente
                    WHERE idCliente = ?
                `;
                db.query(queryGarantiasCliente, [idCliente], (err, garantiasClienteRows) => {
                    if (err) return reject('Error al buscar garantías del cliente');
                        const queryCreditoActivo = `
                            SELECT idCredito, monto, abonoSemanal
                            FROM creditos
                            WHERE idCliente = ? AND estado = 'activo'
                            ORDER BY idCredito DESC
                            LIMIT 1`;
                        db.query(queryCreditoActivo, [idCliente], (err, creditosRows) => {
                        if (err) return reject('Error al buscar crédito activo');
                        const credito = creditosRows[0] || null;
                        if (!credito) {
                            finalizar(null, []);
                        } else {
                            const queryPagos = `
                                SELECT fechaEsperada
                                FROM pagos
                                WHERE idCredito = ? `;
                            db.query(queryPagos, [credito.idCredito], (err, pagosRows) => {
                                if (err) return reject('Error al buscar pagos');
                                finalizar(credito, pagosRows);
                            });
                        }
                        function finalizar(creditoData, pagosData) {
                            if (avalesRows.length === 0) {
                                return resolve({
                                    cliente,
                                    avales: [],
                                    garantiasCliente: garantiasClienteRows,
                                    garantiasAval: [],
                                    credito: creditoData,
                                    pagos: pagosData
                                });
                            }
                            const avalIds = avalesRows.map(a => a.idAval);
                            const queryGarantiasAval = `
                                SELECT idGarantia, idAval, descripcion
                                FROM garantias_aval
                                WHERE idAval IN (?)`;
                            db.query(queryGarantiasAval, [avalIds], (err, garantiasAvalRows) => {
                                if (err) return reject('Error al buscar garantías de avales');
                                return resolve({
                                    cliente,
                                    avales: avalesRows,
                                    garantiasCliente: garantiasClienteRows,
                                    garantiasAval: garantiasAvalRows,
                                    credito: creditoData,
                                    pagos: pagosData
                                });
                            });
                        }
                    });
                });
            });
        });
    });
};

async function searchConsult(nombreCompleto) {
    try {

        console.log('Nombre completo dentro de searchConsult: ', nombreCompleto);
        const formattedName = `%${nombreCompleto.trim()}%`;

        //Buscar el cliente por nombre
        const queryToFindClient = `SELECT CONCAT_WS(' ', nombre, apellidoPaterno, apellidoMaterno) AS nombreCompleto, idCliente FROM ${TABLE_CLIENTES} WHERE CONCAT_WS(' ', nombre, apellidoPaterno, apellidoMaterno) COLLATE utf8mb4_general_ci LIKE ? LIMIT 1`;

        const clientResult = await queryAsync(queryToFindClient, [formattedName]);
        
        if (clientResult.length === 0) {
            throw new Error('Cliente no encontrado.');
        }

        const client = clientResult[0];
        const idCliente = client.idCliente;

        //Obtener el total del creditos del cliente
        const queryToGetTotalCredits = `SELECT COUNT(*) AS totalCredits FROM ${TABLE_CREDITOS} WHERE idCliente = ?`;
        const totalCreditsResult = await queryAsync(queryToGetTotalCredits, [idCliente]);
        const totalCredits = totalCreditsResult[0].totalCredits;
        console.log('Total de creditos del cliente: ', totalCredits);
        
        //Obtener la semana actual en pagos del crédito
        const queryToGetCurrentWeek = `SELECT COUNT(*) AS currentWeek FROM ${TABLE_PAGOS} p INNER JOIN ${TABLE_CREDITOS} c ON p.idCredito = c.idCredito WHERE c.idCliente = ? AND c.estado = 'activo' AND p.estado = 'pagado'`;

        const currentWeekResult = await queryAsync(queryToGetCurrentWeek, [idCliente]);
        const currentWeek = currentWeekResult[0].currentWeek;
        console.log('Current week del cliente: ', currentWeek);


        //Consultar el resto de los datos del credito actual
        const currentCreditQuery = `SELECT
                                        c.monto,
                                        c.semanas,
                                        c.fechaEntrega,
                                        c.abonoSemanal,
                                        c.cumplimiento
                                    FROM ${TABLE_CREDITOS} c
                                    WHERE idCliente = ? AND c.estado = 'activo'`;
        const currentCredit = await queryAsync(currentCreditQuery, [idCliente]);
        console.log('Datos del credito actual: ', currentCredit);

        //Obtener historial crediticio del cliente
        const creditHistoryQuery = `SELECT monto, fechaEntrega, semanas, cumplimiento FROM ${TABLE_CREDITOS} WHERE idCliente = ? AND estado != 'activo'`;
        const creditHistory = await queryAsync(creditHistoryQuery, [idCliente]);
        return {
            client,
            totalCredits,
            currentWeek,
            currentCredit,
            creditHistory
        }
        
    } catch(error) {
        console.log('Error al buscar el cliente: ', error);
        throw error;
    }
}

async function searchModifyClient(nombreCompleto) {
    try {
        const formattedName = `%${nombreCompleto.trim()}%`;

        //Buscar datos del cliente por nombre
        const queryForClientData = `SELECT
                                        c.idCliente,
                                        c.nombre,
                                        c.apellidoPaterno,
                                        c.apellidoMaterno,
                                        c.edad,
                                        c.domicilio,
                                        c.colonia,
                                        c.ciudad,
                                        c.telefono,
                                        c.clasificacion,
                                        z.codigoZona,
                                        c.trabajo,
                                        c.domicilioTrabajo,
                                        c.telefonoTrabajo,
                                        c.nombreReferencia,
                                        c.domicilioReferencia,
                                        c.telefonoReferencia,
                                        GROUP_CONCAT(g.descripcion ORDER BY g.idGarantia SEPARATOR '|') AS garantias
                                    FROM ${TABLE_CLIENTES} c 
                                    LEFT JOIN garantias_cliente g ON c.idCliente = g.idCliente
                                    LEFT JOIN zonas z ON c.idZona = z.idZona 
                                    WHERE CONCAT_WS(' ', nombre, apellidoPaterno, apellidoMaterno) COLLATE utf8mb4_general_ci LIKE ? 
                                    GROUP BY c.idCliente
                                    LIMIT 1`;

        const clientDataResult = await queryAsync(queryForClientData, [formattedName]);

        if (clientDataResult.length === 0) {
            throw new Error ('Cliente no encontrado.');
        }

        const clientDataRow = clientDataResult[0];
        const idCliente = clientDataRow.idCliente;

        //Pasar a un array las garantias
        const garantiasArray = clientDataRow.garantias ? clientDataRow.garantias.split('|') : [];
        
        const clientData = {
            name: clientDataRow.nombre,
            paternalLn: clientDataRow.apellidoPaterno,
            maternalLn: clientDataRow.apellidoMaterno,
            age: clientDataRow.edad,
            address: clientDataRow.domicilio,
            colonia: clientDataRow.colonia,
            city: clientDataRow.ciudad,
            phone: clientDataRow.telefono,
            classification: clientDataRow.clasificacion,
            zone: clientDataRow.codigoZona,
            nameJob: clientDataRow.trabajo,
            addressJob: clientDataRow.domicilioTrabajo,
            phoneJob: clientDataRow.telefonoTrabajo,
            nameReference: clientDataRow.nombreReferencia,
            addressReference: clientDataRow.domicilioReferencia,
            phoneReference: clientDataRow.telefonoReferencia,
            garantias: {
                garantiaUno:  garantiasArray[0] || '',
                garantiaDos:  garantiasArray[1] || '',
                garantiaTres: garantiasArray[2] || ''
            }
        };

        console.log('Id del cliente dentro de searchModify: ', idCliente);

        return {
            idCliente,
            clientData
        }
    } catch(error) {
        throw error;
    }
}

async function searchModifyGuarantor(nombreCompleto) {
    try {
        const formattedName = `%${nombreCompleto.trim()}%`;

        //Buscar el id del nombre del cliente que llegó
        const queryIdClient = `
            SELECT idCliente 
            FROM ${TABLE_CLIENTES} 
            WHERE CONCAT_WS(' ', nombre, apellidoPaterno, apellidoMaterno) COLLATE utf8mb4_general_ci LIKE ?
            LIMIT 1`
        ;
        const idClientResult = await queryAsync(queryIdClient, [formattedName]);
        if (idClientResult.length === 0) {
            throw new Error ('Cliente no encontrado.');
        }
        const idClient = idClientResult[0].idCliente;

        //Datos de los avales y sus garantias
        const queryForGuarantorData = `
            SELECT
            a.idAval,
            a.nombre,
            a.apellidoPaterno,
            a.apellidoMaterno,
            a.edad,
            a.domicilio,
            a.colonia,
            a.ciudad,
            a.telefono,
            a.trabajo,
            a.domicilioTrabajo,
            a.telefonoTrabajo,
            GROUP_CONCAT(g.descripcion ORDER BY g.idGarantia SEPARATOR '|') AS garantias
            FROM ${TABLE_AVALES} a LEFT JOIN garantias_aval g ON a.idAval = g.idAval
            WHERE a.idCliente = ?
            GROUP BY a.idAval`;

            const guarantorDataResult = await queryAsync(queryForGuarantorData, [idClient]);
            
            const guarantorData = guarantorDataResult.map((aval) => {
                const garantiasArray = aval.garantias ? aval.garantias.split('|') : [];
                /*return {
                    name: aval.nombre,
                    paternalLn: aval.apellidoPaterno,
                    maternalLn: aval.apellidoMaterno,
                    age: aval.edad,
                    address: aval.domicilio,
                    colonia: aval.colonia,
                    city: aval.ciudad,
                    phone: aval.telefono,
                    nameJob: aval.trabajo,
                    addressJob: aval.domicilioTrabajo,
                    phoneJob: aval.telefonoTrabajo,
                    garantias: {
                        garantiaUno: garantiasArray[0] || '',
                        garantiaDos: garantiasArray[1] || '',
                        garantiaTres: garantiasArray[2] || ''
                    }
                }*/
            });
        
            return {
                guarantorDataResult
            }

    } catch(error) {
        throw error;
    }
}

module.exports = {
    SearchCredit, 
    SearchCollectors,
    searchConsult,
    searchModifyClient,
    searchModifyGuarantor
};

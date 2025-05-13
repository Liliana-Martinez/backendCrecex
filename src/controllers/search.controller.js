const db = require('../db');
const TABLE_CLIENTES = 'clientes';
const TABLE_CREDITOS = 'creditos';
const TABLE_PAGOS = 'pagos';
const SearchCredit= (nombreCompleto) => {
    return new Promise((resolve, reject) => {
        const queryCliente = `
            SELECT idCliente, nombre, apellidoPaterno, apellidoMaterno, telefono, domicilio, clasificacion, tipoCliente
            FROM ${TABLE_CLIENTES}
            WHERE CONCAT_WS(' ', nombre, apellidoPaterno, apellidoMaterno) COLLATE utf8mb4_general_ci LIKE ?
        `;

        const formattedNombre = `%${nombreCompleto.trim()}%`;

        db.query(queryCliente, [formattedNombre], (err, clienteRows) => {
            if (err) return reject('Error al buscar cliente');
            if (clienteRows.length === 0) return resolve(null);

            const cliente = clienteRows[0];
            const idCliente = cliente.idCliente;

            const queryCredito = `
                SELECT idCredito, monto, fechaEntrega
                FROM ${TABLE_CREDITOS}
                WHERE idCliente = ? AND estado = 'activo'
                LIMIT 1
            `;

            db.query(queryCredito, [idCliente], (err, creditoRows) => {
                if (err) return reject('Error al buscar crédito');

                const credito = creditoRows[0] || null;

                if (!credito) {
                    return resolve({ cliente, credito: null, pagos: [] });
                }

                const queryPagos = `
                    SELECT numeroSemana, cantidad, estado
                    FROM ${TABLE_PAGOS}
                    WHERE idCredito = ? AND estado = 'pagado'
                    ORDER BY numeroSemana DESC
                    LIMIT 1
                `;

                db.query(queryPagos, [credito.idCredito], (err, pagosRows) => {
                    if (err) return reject('Error al buscar pagos');

                    const pagos = pagosRows.length > 0 ? pagosRows : [];

                    return resolve({
                        cliente,
                        credito,
                        pagos
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
            LIMIT 1
        `;

        db.query(queryCliente, [formattedNombre], (err, clienteRows) => {
            if (err) return reject(`Error al buscar cliente: ${err.message}`);
            if (clienteRows.length === 0) return resolve(null);

            const cliente = clienteRows[0];
            const idCliente = cliente.idCliente;

            const queryAvales = `
                SELECT idAval, idCliente, nombre, apellidoPaterno, apellidoMaterno, edad, domicilio, telefono,
                       trabajo, domicilioTrabajo, telefonoTrabajo
                FROM avales
                WHERE idCliente = ?
            `;

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
                        LIMIT 1
                    `;

                    db.query(queryCreditoActivo, [idCliente], (err, creditosRows) => {
                        if (err) return reject('Error al buscar crédito activo');

                        const credito = creditosRows[0] || null;

                        if (!credito) {
                            finalizar(null, []);
                        } else {
                            const queryPagos = `
                                SELECT fechaEsperada
                                FROM pagos
                                WHERE idCredito = ?
                            `;

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
                                WHERE idAval IN (?)
                            `;

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




//Busqueda para "consulta" dentro de "Clientes-avales"
const searchConsult = (nombreCompleto) => {
    console.log('nombre completo en searchConsult: ', nombreCompleto);
    return new Promise((resolve, reject) => {
        const formattedNombre = `%${nombreCompleto.trim()}%`;
        //Buscar el cliente por nombre
        const clientQuery = `SELECT
                                CONCAT_WS(' ', nombre, apellidoPaterno, apellidoMaterno) AS nombreCompleto, idCliente
                            FROM ${TABLE_CLIENTES} WHERE CONCAT_WS(' ', nombre, apellidoPaterno, apellidoMaterno) COLLATE utf8mb4_general_ci LIKE ? LIMIT 1`;

        db.query(clientQuery, [formattedNombre], (err, clientResult) => {
            if (err) {
                return reject(err);
            }

            if (clientResult.length === 0) {
                return resolve({ message: 'Cliente no encontrado'});
            }

            const client = clientResult[0];
            const idCliente = client.idCliente;

            //Buscar el credito actual activo
            const currentCreditQuery = `SELECT 
                                            c.monto, 
                                            c.semanas, 
                                            c.fechaEntrega, 
                                            c.abonoSemanal, 
                                            c.cumplimiento,
                                            p.numeroSemana
                                        FROM ${TABLE_CREDITOS} c 
                                        LEFT JOIN ${TABLE_PAGOS} p ON c.idCredito = p.idCredito
                                        WHERE idCliente = ? AND c.estado = 'activo'`;

            db.query(currentCreditQuery, [idCliente], (err, currentCreditResult) => {
                if (err) {
                    return reject(err);
                }

                const currentCredit = currentCreditResult;

                //Buscar el historial crediticio
                const historyCreditQuery = `SELECT monto, fechaEntrega, semanas, cumplimiento FROM ${TABLE_CREDITOS} WHERE idCliente = ? AND estado != 'activo'`;

                db.query(historyCreditQuery, [idCliente], (err, creditHistoryResult) => {
                    if (err) {
                        return reject(err);
                    }
                    resolve({
                        client,
                        currentCredit,
                        creditHistory: creditHistoryResult
                    });
                });
            });
        });
    });
};
module.exports = {
    SearchCredit, 
    SearchCollectors,
    searchConsult
};

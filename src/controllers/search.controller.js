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
module.exports = {
    SearchCredit
};

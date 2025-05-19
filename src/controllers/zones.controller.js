const db = require('../db');

const TABLE_ZONES = 'zonas';
const TABLE_CLIENTES = 'clientes'
const TABLE_CREDITOS = 'creditos';

const getAllZones = () => {
    return new Promise((resolve, reject) => {
        const query = `SELECT idZona AS id, codigoZona FROM ${TABLE_ZONES} ORDER BY idZona`;
        db.query(query, (err, results) => {
            if (err) {
                return reject(err);
            }
            resolve(results);
        });
    });
};

const getClientsFromZone = (idZona) => {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT 
                CONCAT_WS(' ', c.nombre, c.apellidoPaterno, c.apellidoMaterno) AS nombreCompleto,
                c.clasificacion,
                cr.fechaEntrega,
                cr.fechaVencimiento,
                cr.abonoSemanal AS montoSemanal
            FROM ${TABLE_CLIENTES} AS c
            JOIN ${TABLE_CREDITOS} AS cr ON c.idCliente = cr.idCliente
            WHERE c.idZona = ?
        `;

        connection.query(query, [idZona], (error, results) => {
            if (error) {
                return reject(error); // solo errores reales de la base
            }

            // Si no hay clientes, resuelve con una bandera controlada
            if (results.length === 0) {
                return resolve(null);
            }

            resolve(results);
        });
    });
};
module.exports = {
    getAllZones,
    getClientsFromZone
};
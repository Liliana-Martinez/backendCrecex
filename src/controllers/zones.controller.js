const db = require('../db');

const TABLE_ZONES = 'zonas';
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


module.exports = {
    getAllZones
};
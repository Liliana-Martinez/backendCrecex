const db = require('../db');

const TABLE_CREDIT_BUREAU = 'buro_credito';

//Insertar a buro de credito
const insert = (creditBureauData) => {
    return new Promise((resolve, reject) => {
        const query = `INSERT INTO ${TABLE_CREDIT_BUREAU} (nombre, domicilio, telefono) VALUES (?, ?, ?)`;

        const data = [
            creditBureauData.nameBc,
            creditBureauData.addressBc,
            creditBureauData.phoneBc
        ];

        db.query(query, data, (err, result) => {
            if(err) {
                console.log('No se puedo agregar a buro de credito', err);
                reject(err);
            } else {
                console.log('Se agrego a buro de credito correctamente');
                resolve(result);
            }
        });
    });
};

//Buscar por nombre
const searchByName = (name) => {
    return new Promise((resolve, reject) => {
        const query = `SELECT * FROM ${TABLE_CREDIT_BUREAU} WHERE nombre LIKE ?`;
        const searchPattern = `%${name}%`;

        db.query(query, [searchPattern], (err, results) => {
            if (err) {
                reject(err);
            } else {
                resolve(results);
            }
        });
    });
};

module.exports = {
    insert,
    searchByName
}
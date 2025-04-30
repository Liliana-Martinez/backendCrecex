const db = require('../db');

const TABLE_CLIENTS = 'clientes';
const TABLE_GRNT_CNTS = 'garantias_cliente'; //GRNT=GARANTIAS CNTS=CLIENTES
const TABLE_AVALES = 'avales';
const TABLE_GRNT_AVAL = 'garantias_aval';

//insertar los datos personales del cliente
const insert = (clientData) => {
    return new Promise((resolve, reject) => {
        const query = `INSERT INTO ${TABLE_CLIENTS} (idZona, nombre, apellidoPaterno, apellidoMaterno,edad, domicilio, colonia, ciudad, telefono, clasificacion, trabajo, domicilioTrabajo, telefonoTrabajo, nombreReferencia, domicilioReferencia, telefonoReferencia) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const personalData = [
            clientData.zoneId,
            clientData.name,
            clientData.paternalLn,
            clientData.maternalLn,
            clientData.age,
            clientData.address,
            clientData.colonia,
            clientData.city,                
            clientData.phone,
            clientData.classification,
            clientData.nameJob,
            clientData.addressJob,             
            clientData.phoneJob,
            clientData.nameReference,
            clientData.addressReference,
            clientData.phoneReference
        ];
        console.log('Datos personales: ', personalData);
        db.query(query, personalData, (err, result) => {
            if (err) {
                console.log('No se agregaron los datos personales.', err);
                reject(err);
            }
            else {
                console.log('Los datos personales se agregaron');
                resolve(result);
            }
        });
    });
};

const insertClientGuarantees = (clientId, garantias) => {
    return new Promise((resolve, reject) => {
        const query = `INSERT INTO ${TABLE_GRNT_CNTS} (idCliente, descripcion) VALUES ?`;

        const values = garantias.map(desc => [clientId, desc]);// [ [1, 'Gar1'], [1, 'Gar2'], [1, 'Gar3'] ]

        db.query(query, [values], (err, result) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(result);
            }
        });
    });
};

const insertGuarantor = (guarantorData) => {
    return new Promise((resolve, reject) => {
        const query = `INSERT INTO ${TABLE_AVALES} (idCliente, nombre, apellidoPaterno, apellidoMaterno, edad, domicilio, telefono, trabajo, domicilioTrabajo, telefonoTrabajo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        const personalData = [
            guarantorData.clientId,
            guarantorData.name,
            guarantorData.paternalLn,
            guarantorData.maternalLn,
            guarantorData.age,
            guarantorData.address,
            guarantorData.phone,
            guarantorData.nameJob,
            guarantorData.addressJob,
            guarantorData.phoneJob
        ];

        db.query(query, personalData, (err, result) => {
            if (err) {
                console.log('No se agregaron los datos personales', err);
                reject(err);
            }
            else {
                console.log('Se agregaron correctamente los datos personales')
                resolve(result);
            }
        });
    });
};

const insertAvalGarantias = (avalId, garantias) => {
    return new Promise((resolve, reject) => {
        const query = `INSERT INTO ${TABLE_GRNT_AVAL} (idAval, descripcion) VALUES ?`;

        const values = garantias.map(desc => [avalId, desc]);

        db.query(query, [values], (err, result) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(result);
            }
        });
    });
};
module.exports = {
    insert,
    insertClientGuarantees,
    insertGuarantor,
    insertAvalGarantias,
}


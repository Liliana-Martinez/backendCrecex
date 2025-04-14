const db = require('../db');

const TABLE_CLIENTS = 'clientes';
const TABLE_GRNT_CNTS = 'garantias_cliente'; //GRNT=GARANTIAS CNTS=CLIENTES

const insert = ({ client }) => {
    return new Promise((resolve, reject) => {
        const query = `INSERT INTO ${TABLE_CLIENTS} (idZona, nombre, apellidoPaterno, apellidoMaterno,edad, domicilio, colonia, ciudad, telefono, clasificacion, tipoCliente, trabajo, domicilioTrabajo, telefonoTrabajo, nombreReferencia, domicilioReferencia, telefonoReferencia) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const clientData = [
            client.idZona,
            client.nombre,
            client.apellidoPaterno,
            client.apellidoMaterno,
            client.edad,
            client.domicilio,
            client.colonia,
            client.ciudad,                
            client.telefono,
            client.clasificacion,
            client.tipoCliente,
            client.trabajo,
            client.domicilioTrabajo,             
            client.telefonoTrabajo,
            client.nombreReferencia,
            client.domicilioReferencia,
            client.telefonoReferencia
        ];
        console.log(clientData)
        db.query(query, clientData, (err, result) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(result);
            }
        });
    });
};

const insertClientGuarantees = async (req, res) => {
    return new Promise((resolve, reject) => {
        const query = `INSERT INTO ${TABLE_GRNT_CNTS} (idCliente, descripcion) VALUES ?`;

        const values = garantias.map(desc => [clientId, desc]);

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
    insertClientGuarantees
}


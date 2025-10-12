const db = require('../db');

const TABLE_CLIENTS = 'clientes';
const TABLE_GRNT_CNTS = 'garantias_cliente'; //GRNT=GARANTIAS CNTS=CLIENTES
const TABLE_AVALES = 'avales';
const TABLE_GRNT_AVAL = 'garantias_aval';

//"Helper"
function queryAsync(sql, params = []) {
return new Promise((resolve, reject) => {
        db.query(sql, params, (err, results) => {
            if (err) return reject(err);
            resolve(results);
        });
    });
}

//insertar los datos personales del cliente
const insert = (clientData) => {
    return new Promise(async (resolve, reject) => {
        try {
            //Validar si el cliente existe
            const searchClient = `SELECT idCliente FROM ${TABLE_CLIENTS} WHERE nombre = ? AND apellidoPaterno = ? AND apellidoMaterno = ?`;

            const searchClientResult = await queryAsync(searchClient, [
                clientData.name,
                clientData.paternalLn,
                clientData.maternalLn
            ]);

            if (searchClientResult.length > 0) {
                return reject(new Error('El cliente ya existe.'));
            }

            //Insertar los datos del cliente si no existe
            const queryToInsertClient = `INSERT INTO ${TABLE_CLIENTS} (idZona, nombre, apellidoPaterno, apellidoMaterno,edad, domicilio, colonia, ciudad, telefono, clasificacion, trabajo, domicilioTrabajo, telefonoTrabajo, nombreReferencia, domicilioReferencia, telefonoReferencia) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
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

            console.log('Datos personales a guardar: ', personalData);

            const insertClientResult = await queryAsync(queryToInsertClient, personalData);
            resolve(insertClientResult);
        } catch(error) {
            reject(error);
        }
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
        const query = `INSERT INTO ${TABLE_AVALES} (idCliente, nombre, apellidoPaterno, apellidoMaterno, edad, domicilio, colonia, ciudad, telefono, trabajo, domicilioTrabajo, telefonoTrabajo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        const personalData = [
            guarantorData.clientId,
            guarantorData.name,
            guarantorData.paternalLn,
            guarantorData.maternalLn,
            guarantorData.age,
            guarantorData.address,
            guarantorData.colonia,
            guarantorData.city,
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

async function updateClient(idCliente, dataToUpdate) {

    const fieldMap = {
        clientes: {
            'Nombre': 'nombre',
            'Apellido paterno': 'apellidoPaterno',
            'Apellido materno': 'apellidoMaterno',
            'Edad': 'edad',
            'Domicilio': 'domicilio',
            'Colonia': 'colonia',
            'Ciudad': 'ciudad',
            'Teléfono': 'telefono',
            'Clasificación': 'clasificacion',
            'Puntos': 'puntos',
            'Trabajo': 'trabajo',
            'Domicilio del trabajo': 'domicilioTrabajo',
            'Teléfono del trabajo': 'telefonoTrabajo',
            'Nombre de la referencia': 'nombreReferencia',
            'Domicilio de la referencia': 'domicilioReferencia',
            'Teléfono de la referencia': 'telefonoReferencia',
        },
        zonas: {
            'Zona': 'codigoZona',
            'zoneId': 'idZona'
        },
        garantias: {
            'Garantía uno': 'garantiaUno',
            'Garantía dos': 'garantiaDos',
            'Garantía tres': 'garantiaTres'
        }
    };

    //console.log('Id del cliente a modificar: ', idCliente);
    console.log('Datos a modificar: ', dataToUpdate);

    if (!idCliente || Object.keys(dataToUpdate).length === 0) {
        throw new Error('Faltan datos para actualizar.');
    }

    // Separar datos por tabla
    const clienteData = {};
    const zonaData = {};
    let garantias = [];

    for (const key in dataToUpdate) {
        if (fieldMap.clientes[key]) {
            clienteData[fieldMap.clientes[key]] = dataToUpdate[key];
        } else if (fieldMap.zonas[key]) {
            zonaData[fieldMap.zonas[key]] = dataToUpdate[key];
        } else if (key === 'garantias') {
            const garantiasObj = dataToUpdate.garantias || {};

            for( const gkey of Object.keys(garantiasObj)) {
                const descripcion = garantiasObj[gkey];

                if (typeof descripcion === 'string') {
                    const descTrim = descripcion.trim();
                    if (descTrim.length > 0) {
                        garantias.push(descTrim);
                    }
                } else if(descripcion != null) {
                    const descTrim = String(descripcion).trim();
                    if (descTrim.length > 0) garantias.push(descTrim);
                }
            }
            console.log('descripcion dentro del for: ', descripcion);

        }
    }

    //Actualizar tabla clientes
    let resultCliente = null;
    if (Object.keys(clienteData).length > 0) {
        const campos = Object.keys(clienteData);
        const valores = campos.map(c => clienteData[c]);
        const setClause = campos.map(c => `${c} = ?`).join(', ');
        const query = `UPDATE ${TABLE_CLIENTS} SET ${setClause} WHERE idCliente = ?`;
        valores.push(idCliente);
        resultCliente = await queryAsync(query, valores);
    }


    /*Actualizar zona del cliente
    console.log('Id del cliente antes de actualizar zona: ', idCliente);
    console.log('Zonadata: ', zonaData);*/
    let resultZona = null;
    if (Object.keys(zonaData).length > 0) {
        const campos = Object.keys(zonaData).filter(c => c === 'idZona');

        if (campos.length > 0) {
            const valores = campos.map(c => zonaData[c]);
            const setClause = campos.map(c => `${c} = ?`).join(', ');
            const query = `UPDATE ${TABLE_CLIENTS} SET ${setClause} WHERE idCliente = ?`;
            valores.push(idCliente);

            resultZona = await queryAsync(query, valores);
            console.log('Resultado de update zona: ', resultZona);
        }
    }


    // Actualizar garantías
    console.log('Id del cliente antes de actualizar garantias: ', idCliente);
    console.log('Garantias: ', garantias);
    let resultGarantias = null;

    if (garantias && Object.keys(garantias).length > 0) {
        // Borro todas las garantías del cliente
        const deleteResult = await queryAsync('DELETE FROM garantias_cliente WHERE idCliente = ?', [idCliente]);
        console.log('Resultado del delete: ', deleteResult);

        console.log('garantias antes de actualizarse: ', garantias);
        console.log('descripcion: ', descripcion);
        for (const key of Object.keys(garantias)) {
            const insertSQL = `INSERT INTO garantias_cliente (idCliente, descripcion) VALUES (?, ?)`;
            const insertResult = await queryAsync(insertSQL, [idCliente, descripcion]);
            resultGarantias.push(insertResult);
        }
    }


    
    return {
        message: 'Datos actualizados correctamente',
        cliente: resultCliente,
        zona: resultZona,
        garantias: resultGarantias
    };
}

async function updateGuarantor(idAval, dataToUpdate) {

    if (!idAval || Object.keys(dataToUpdate).length === 0) {
        throw new Error('No hay datos para actualizar');
    }

    //Desestructuracion para separar las garantias, es decir, dataToUpdate = {garantias} y {avalFields}
    const { garantias, ...avalFields } = dataToUpdate;
    let resultAval = null;

    const avalFieldsMap = {
        'Nombre': 'nombre',
        'Apellido paterno': 'apellidoPaterno',
        'Apellido materno': 'apellidoMaterno',
        'Edad': 'edad',
        'Domicilio': 'domicilio',
        'Colonia': 'colonia',
        'Ciudad': 'ciudad',
        'Teléfono': 'telefono',
        'Nombre del trabajo' : 'trabajo',
        'Domicilio del trabajo': 'domicilioTrabajo',
        'Teléfono del trabajo': 'telefonoTrabajo'
    };

     if (Object.keys(avalFields).length > 0) {
        const campos = Object.keys(avalFields).map(key => avalFieldsMap[key] || key);
        const valores = Object.keys(avalFields).map(key => avalFields[key]);

        const setClause = campos.map(key => `${key} = ?`).join(', ');
        const queryToUpdate = `UPDATE ${TABLE_AVALES} SET ${setClause} WHERE idAval = ?`;
        
        valores.push(idAval);
        resultAval = await queryAsync(queryToUpdate, valores);
     }

     let resultGarantias = [];

     if (garantias && typeof garantias === 'object') {
        await queryAsync('DELETE FROM garantias_aval WHERE idAval = ?',  [idAval]);

        for (const key in garantias) {
            const descripcion = garantias[key];
            if (descripcion && descripcion.trim() !== ''){
                const insertGarantiaSQL = `INSERT INTO garantias_aval (idAval, descripcion) VALUES (?, ?)`;
                await queryAsync(insertGarantiaSQL, [idAval, descripcion]);
                //const insertResult = await queryAsync(insertGarantiaSQL, [idAval, descripcion]);
            }
        }
     }

     return {
        message: 'Datos actualizados correctamente',
        aval: resultAval,
        garantias: resultGarantias
     };
}

module.exports = {
    insert,
    insertClientGuarantees,
    insertGuarantor,
    insertAvalGarantias,
    updateClient,
    updateGuarantor
}


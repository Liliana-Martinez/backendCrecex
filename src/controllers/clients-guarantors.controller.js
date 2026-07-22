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
async function createClient (personalData) {
        try {
            console.log('datos del cliente dentro del controller: ', personalData);
            //Validar si el cliente existe
            const searchClientQuery = `SELECT idCliente FROM ${TABLE_CLIENTS} WHERE nombre = ? AND apellidoPaterno = ? AND apellidoMaterno = ?`;

            const searchClientResult = await queryAsync(searchClientQuery, [personalData.name, personalData.paternalLn, personalData.maternalLn]);

            if (searchClientResult.length > 0) {
                throw new Error('El cliente ya existe.');
            }

            //Insertar los datos del cliente si no existe
            const insertClientQuery = `INSERT INTO ${TABLE_CLIENTS} (idZona, nombre, apellidoPaterno, apellidoMaterno,edad, domicilio, colonia, ciudad, telefono, clasificacion, trabajo, domicilioTrabajo, telefonoTrabajo, nombreReferencia, domicilioReferencia, telefonoReferencia) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            const data = [
                personalData.zoneId,
                personalData.name,
                personalData.paternalLn,
                personalData.maternalLn,
                personalData.age,
                personalData.address,
                personalData.colonia,
                personalData.city,
                personalData.phone,
                personalData.classification,
                personalData.jobName,
                personalData.workAddress,             
                personalData.workPhone,
                personalData.referenceName,
                personalData.referenceAddress,
                personalData.referencePhone
            ];

            const insertClientResult = await queryAsync(insertClientQuery, data);
            return insertClientResult;
        } catch(error) {
            console.log('Error al crear el cliente', error);
        }
};

async function insertClientGuarantees (clientId, guarantees) {
    try {
        const insertGuaranteesQuery = `INSERT INTO ${TABLE_GRNT_CNTS} (idCliente, descripcion) VALUES ?`;
        const values = guarantees.map(guarantee => [clientId, guarantee]);
        await queryAsync(insertGuaranteesQuery, [values]);
    } catch(error) {
        throw error;
    }
};

async function createGuarantor (personalData) {
    try {
        const insertGuarantorQuery = `INSERT INTO ${TABLE_AVALES} (idCliente, nombre, apellidoPaterno, apellidoMaterno, edad, domicilio, colonia, ciudad, telefono, trabajo, domicilioTrabajo, telefonoTrabajo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const data = [
            personalData.clientId,
            personalData.name,
            personalData.paternalLn,
            personalData.maternalLn,
            personalData.age,
            personalData.address,
            personalData.colonia,
            personalData.city,
            personalData.phone,
            personalData.jobName,
            personalData.workAddress,
            personalData.workPhone
        ];
        const insertGuarantorResult = await queryAsync(insertGuarantorQuery, data);
        return insertGuarantorResult;
    } catch(error) {
        console.log('Error al crear el cliente', error);
    }
};

async function insertGuarantorGuarantees (guarantorId, guarantees)  {
    try {
        const insertGuaranteesQuery = `INSERT INTO ${TABLE_GRNT_AVAL} (idAval, descripcion) VALUES ?`;
        const values = guarantees.map(guarantee => [guarantorId, guarantee]);
        await queryAsync(insertGuaranteesQuery, [values]);
    } catch(error) {
        console.log(error);
    }
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
            console.log('garantiasObj: ', garantiasObj);

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
            console.log('garantias en un array: ', garantias);

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
    let resultGarantias = [];

    if (Array.isArray(garantias) && garantias.length > 0) {
        // Borro todas las garantías del cliente
        const deleteResult = await queryAsync('DELETE FROM garantias_cliente WHERE idCliente = ?', [idCliente]);
        console.log('Resultado del delete: ', deleteResult);

        console.log('garantias antes de actualizarse: ', garantias);
        //Recorrer cada garantia del arreglo
        for (const descripcion of garantias) {
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
    createClient,
    insertClientGuarantees,
    createGuarantor,
    insertGuarantorGuarantees,
    updateClient,
    updateGuarantor
}


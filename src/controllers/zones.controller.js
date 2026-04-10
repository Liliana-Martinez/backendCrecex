const db = require('../db');

//Helper
function queryAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

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

async function getAvailableZones() {
  try {
    console.log('Dentro del zonecontroller');
    const availableZonesQuery = `
      SELECT codigoZona
      FROM zonas
      WHERE (promotor IS NULL OR promotor = '')
        AND (supervisor IS NULL OR supervisor = '');
    `;

    const promoterList = `SELECT DISTINCT promotor FROM zonas WHERE promotor <> ''`;
    const supervisionList = `SELECT DISTINCT supervisor FROM zonas WHERE supervisor <> ''`;

    const resultGetAvailableZones = await queryAsync(availableZonesQuery);
    const resultPromoterList =await queryAsync(promoterList);
    const resultSupList = await queryAsync(supervisionList);

    console.log('zonas disponibles: ', resultGetAvailableZones);
    console.log('promotoras: ', resultPromoterList);
    console.log('supervisores: ', resultSupList);

    return {
        availableZones: resultGetAvailableZones,
        promoters: resultPromoterList,
        supervisors: resultSupList
    }; // ← devolver la lista de zonas
    
  } catch (error) {
    console.error('Error getting available zones:', error);
    throw error; // ← propagar el error al controlador
  }
}

async function getAssignedZones() {
  try {
    const assignedZonesQuery = `
    SELECT codigoZona, promotor, supervisor FROM zonas WHERE promotor IS NOT NULL AND promotor <> '' AND supervisor IS NOT NULL AND supervisor <> ''`;

    const resultAssignedZones = await queryAsync(assignedZonesQuery);

    return {
      assignedZones: resultAssignedZones 
    };
  } catch(error) {

  }
}


async function addZone(zoneData) {
  try {
    const { promoter, supervisor, zoneCode } = zoneData;

    if (!zoneCode || zoneCode.trim() === '') {
      throw new Error('El codigo de la zona es obligatorio.')
    }

    const data = [
      promoter || null,
      supervisor || null,
      zoneCode
    ];

    const checkQuery = `SELECT 1 FROM zonas WHERE codigoZona = ? LIMIT 1`;

    const exists = await queryAsync(checkQuery, [zoneCode]);

    if (exists.length === 0) {
      throw new Error('El codigo de la zona tiene que ser valido.')
    }

    const updateQuery = `UPDATE zonas SET promotor = ?, supervisor = ? WHERE codigoZona = ?`;

    const result = await queryAsync(updateQuery, data);

    return result;

  } catch (error) {
    console.error('Error en addZone:', error);
    throw error;
  }
}

async function updateZone(dataToUpdate) {
  const { codigoZona, promotor, supervisor } = dataToUpdate;

  if (!codigoZona) {
    throw new Error('codigoZona es obligatorio');
  }

  const updateZoneQuery = `
    UPDATE zonas
    SET
      promotor = ?,
      supervisor = ?
    WHERE codigoZona = ?
  `;

  const values = [promotor, supervisor, codigoZona];

  const result = await queryAsync(updateZoneQuery, values);

  return {
    affectedRows: result.affectedRows
  };
}


module.exports = {
    getAllZones,
    getAvailableZones,
    getAssignedZones,
    addZone,
    updateZone
};
const db = require('../db');

const TABLE_ZONES = 'zonas';
const TABLE_CLIENTES = 'clientes'
const TABLE_CREDITOS = 'creditos';

const getClientsFromZone = (idZona) => {
  console.log('ID en el controller:', idZona);

  const getLastSaturday = () => {
    const today = new Date();
    const day = today.getDay(); // 0 = domingo, 6 = sábado
    const diff = day === 6 ? 0 : day + 1;
    const lastSaturday = new Date(today);
    lastSaturday.setDate(today.getDate() - diff);
    return lastSaturday.toISOString().split('T')[0]; // formato YYYY-MM-DD
  };

  const fechaEsperada = getLastSaturday();

  return new Promise((resolve, reject) => {
    const query = `
      SELECT 
        CONCAT_WS(' ', c.nombre, c.apellidoPaterno, c.apellidoMaterno) AS nombreCompleto,
        c.idCliente,
        c.clasificacion,
        cr.fechaEntrega,
        cr.fechaVencimiento,
        cr.abonoSemanal AS montoSemanal,
        cr.cumplimiento,
        (
          SELECT COUNT(*) 
          FROM creditos 
          WHERE creditos.idCliente = c.idCliente
            AND creditos.estado IN ('Activo', 'Pagado', 'Adicional', 'Vencido')
        ) AS numeroCreditos,
        p.numeroSemana
      FROM clientes AS c
      JOIN creditos AS cr ON c.idCliente = cr.idCliente
      LEFT JOIN pagos AS p 
        ON cr.idCredito = p.idCredito
        AND p.fechaEsperada = ?
      WHERE c.idZona = ?
        AND cr.estado = 'Activo'
    `;

    db.query(query, [fechaEsperada, idZona], (error, results) => {
      if (error) {
        return reject(error);
      }

      if (results.length === 0) {
        return resolve(null);
      }

      resolve(results);
    });
  });
};


module.exports = {
  getClientsFromZone
};


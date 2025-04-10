const db = require('../db');
const getClientesPorCodigoZona = async (req, res) => {
  const { codigoZona } = req.params;
  try {
    // Buscar el idZona asociado al código de zona
    const zonaResult = await new Promise((resolve, reject) => {
      db.query(
        'SELECT idZona FROM zonas WHERE codigoZona = ?',
        [codigoZona],
        (err, results) => {
          if (err) reject(err);
          else resolve(results);
        }
      );
    });
    if (zonaResult.length === 0) {
      return res.status(404).json({ message: 'Zona no encontrada.' });
    }
    const idZona = zonaResult[0].idZona;
    console.log('ID de Zona encontrada:', idZona);  // Depuración
    // Obtener los clientes junto con los datos de creditos y pagos
    const clientes = await new Promise((resolve, reject) => {
      db.query(
        `SELECT c.nombre, c.apellidoPaterno, c.apellidoMaterno, c.clasificacion, c.tipoCliente, 
                cr.monto, cr.fechaEntrega, cr.fechaVencimiento, 
                MAX(p.numeroSemana) AS numeroSemana, MAX(p.cantidad) AS cantidad  -- Utilizando MAX para obtener un solo valor
         FROM clientes c
         JOIN creditos cr ON c.idCliente = cr.idCliente
         LEFT JOIN pagos p ON c.idCliente = p.idCliente  -- Relacionamos pagos con clientes
         WHERE c.idZona = ? 
         AND cr.estado IN ('activo', 'vencido', 'Adicional')  -- Agregamos 'Adicional' a los estados válidos
         GROUP BY c.idCliente, c.nombre, c.apellidoPaterno, c.apellidoMaterno, c.clasificacion, c.tipoCliente, cr.monto, cr.fechaEntrega, cr.fechaVencimiento`,
        [idZona],
        (err, results) => {
          if (err) reject(err);
          else resolve(results);
        }
      );
    });
    console.log('Clientes encontrados:', clientes);  // Depuración
    if (clientes.length === 0) {
      return res.status(404).json({ message: 'No hay clientes en esa zona.' });
    }
    res.json(clientes);
  } catch (error) {
    console.error('Error al obtener clientes por código de zona:', error);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
};
module.exports = {
  getClientesPorCodigoZona,
};
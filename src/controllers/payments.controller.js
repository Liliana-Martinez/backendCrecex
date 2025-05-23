const db = require('../db');
const getClientsFromZone = async (req, res) => {
  const { idZona } = req.query;

  try {
    console.log('ID de Zona recibido:', idZona); // Depuración

    const clientes = await new Promise((resolve, reject) => {
      db.query(
        `SELECT 
           c.idCliente,
           c.nombre, 
           c.apellidoPaterno, 
           c.apellidoMaterno, 
           c.clasificacion, 
           c.tipoCliente, 
           cr.monto, 
           cr.fechaEntrega, 
           cr.fechaVencimiento, 
           cr.estado,
           MAX(p.numeroSemana) AS numeroSemana, 
           MAX(p.cantidad) AS cantidad
         FROM clientes c
         JOIN creditos cr ON c.idCliente = cr.idCliente
         LEFT JOIN pagos p ON c.idCliente = p.idCliente
         WHERE c.idZona = ?
           AND cr.estado IN ('activo', 'vencido')
         GROUP BY 
           c.idCliente, c.nombre, c.apellidoPaterno, c.apellidoMaterno, 
           c.clasificacion, c.tipoCliente, cr.monto, cr.fechaEntrega, 
           cr.fechaVencimiento, cr.estado`,
        [idZona],
        (err, results) => {
          if (err) {
            console.error('Error en query SQL:', err); // Mostrar error exacto
            reject(err);
          } else {
            resolve(results);
          }
        }
      );
    });

    if (clientes.length === 0) {
      return res.status(404).json({ message: 'No hay clientes con crédito activo o vencido en esta zona.' });
    }

    res.json(clientes);

  } catch (error) {
    console.error('Error general en getClientesPorZona:', error);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
};



module.exports = {
  getClientsFromZone,
};


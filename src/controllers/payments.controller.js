const db = require('../db');

async function calcularPagos(clientes, fechaEsperada) {
  const results = await Promise.all(clientes.map(cliente => {
    return new Promise((res, rej) => {
      const pagosQuery = `
        SELECT cantidad, cantidadPagada, fechaEsperada AS pagoFechaEsperada, estado
        FROM pagos
        WHERE idCredito = ?
        ORDER BY fechaEsperada
      `;

      db.query(pagosQuery, [cliente.idCredito], (err, pagos) => {
        if (err) return rej(err);

        const montoSemanal = cliente.montoSemanal;
        let atraso = 0;
        let adelanto = 0;
        let falla = 0;

        let esperadoHastaHoy = 0;
        let pagadoTotal = 0;

        pagos.forEach(p => {
          pagadoTotal += p.cantidadPagada ?? 0;
          if (p.pagoFechaEsperada <= fechaEsperada) {
            esperadoHastaHoy += p.cantidad ?? 0;
          }
        });

        if (pagadoTotal < esperadoHastaHoy) {
          atraso = esperadoHastaHoy - pagadoTotal;
        } else if (pagadoTotal > esperadoHastaHoy) {
          adelanto = pagadoTotal - esperadoHastaHoy;
        }

        // Verificar si la semana de fechaEsperada ya fue cubierta
        const semanaEsperada = pagos.find(p =>
          p.pagoFechaEsperada === fechaEsperada &&
          ['pagado', 'adelantado'].includes(p.estado.toLowerCase())
        );

        if (!semanaEsperada) {
          if (adelanto >= montoSemanal) {
            adelanto -= montoSemanal;
          } else {
            falla = montoSemanal;
          }
        }

        res({
          ...cliente,
          atraso,
          adelanto,
          falla
        });
      });
    });
  }));

  return results;
}

const getClientsFromZone = (idZona) => {
  console.log('ID en el controller:', idZona);

  // Calcular el último sábado
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
        cr.idCredito,
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
        AND p.numeroSemana >= 1
    `;

    db.query(query, [fechaEsperada, idZona], async (error, results) => {
      if (error) {
        return reject(error);
      }

      if (!results || results.length === 0) {
        return resolve(null);
      }

      try {
        const resultadosConCalculos = await calcularPagos(results, fechaEsperada);
        resolve(resultadosConCalculos);
      } catch (err) {
        reject(err);
      }
    });
  });
};

module.exports = {
  getClientsFromZone,
  calcularPagos
};

const db = require('../db');
const TABLE_ZONES = 'zonas';
const TABLE_CLIENTES = 'clientes';
const TABLE_CREDITOS = 'creditos';

async function calcularPagos(clientes, fechaEsperada) {
  const results = await Promise.all(clientes.map(cliente => {
    return new Promise((res, rej) => {
      const pagosQuery = `
        SELECT cantidad, cantidadPagada, fechaEsperada, fechaPagada, estado
        FROM pagos
        WHERE idCredito = ?
        ORDER BY fechaEsperada
      `;

      db.query(pagosQuery, [cliente.idCredito], (err, pagos) => {
        if (err) return rej(err);

        const { atraso, adelanto, falla } = calcularEstadoDePagosOrdenado(pagos, fechaEsperada);

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

function calcularEstadoDePagosOrdenado(pagos, fechaReferencia) {
  const ref = new Date(fechaReferencia);
  let adelantoDisponible = 0;
  let atraso = 0;
  let falla = 0;

  pagos.sort((a, b) => new Date(a.fechaEsperada) - new Date(b.fechaEsperada));

  pagos.forEach(pago => {
    const cantidad = Number(pago.cantidad ?? 0);
    const pagado = Number(pago.cantidadPagada ?? 0);
    const estado = (pago.estado ?? '').toLowerCase();
    const fechaEsperada = new Date(pago.fechaEsperada);
    const fechaPagada = pago.fechaPagada && pago.fechaPagada !== '0000-00-00'
      ? new Date(pago.fechaPagada)
      : null;

    const mismaFecha = fechaEsperada.toISOString().slice(0, 10) === ref.toISOString().slice(0, 10);

    if (fechaEsperada < ref) {
      if (estado === 'pendiente' || estado === 'incompleto') {
        let falta = cantidad - pagado;
        if (adelantoDisponible >= falta) {
          adelantoDisponible -= falta;
        } else {
          atraso += falta - adelantoDisponible;
          adelantoDisponible = 0;
        }
      }
    } else if (mismaFecha) {
      if (estado === 'pendiente') {
        if (adelantoDisponible >= cantidad) {
          adelantoDisponible -= cantidad;
        } else {
          falla += cantidad - adelantoDisponible;
          adelantoDisponible = 0;
        }
      } else if (estado === 'incompleto') {
        let falta = cantidad - pagado;
        if (adelantoDisponible >= falta) {
          adelantoDisponible -= falta;
        } else {
          falla += falta - adelantoDisponible;
          adelantoDisponible = 0;
        }
      }
    } else if (fechaEsperada > ref) {
      if (
        estado === 'adelantado' ||
        (estado === 'pagado' && fechaPagada && fechaPagada < fechaEsperada)
      ) {
        adelantoDisponible += pagado;
      }
    }
  });

  return {
    atraso,
    adelanto: adelantoDisponible,
    falla
  };
}





const getClientsFromZone = (idZona) => {
  console.log('ID en el controller:', idZona);

  const getLastSaturday = () => {
    const today = new Date();
    const day = today.getDay();
    const diff = day === 6 ? 0 : day + 1;
    const lastSaturday = new Date(today);
    lastSaturday.setDate(today.getDate() - diff);
    return lastSaturday.toISOString().split('T')[0];
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
  calcularPagos, 
  calcularEstadoDePagosOrdenado
};

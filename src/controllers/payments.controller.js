const db = require('../db');
//Llenado de tabla cuando busca al cliente
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
  const ref = new Date(fechaReferencia); // Sábado de la semana actual
  let adelantoDisponible = 0;
  let atraso = 0;
  let falla = 0;

  pagos.sort((a, b) => new Date(a.fechaEsperada) - new Date(b.fechaEsperada));

  pagos.forEach(pago => {
    const cantidad = Number(pago.cantidad ?? 0);
    const pagado = Number(pago.cantidadPagada ?? 0);
    const estado = (pago.estado ?? '').toLowerCase();
    const fechaEsperada = new Date(pago.fechaEsperada);

    // Atraso: pagos anteriores no cubiertos completamente
    if (estado === 'atraso') {
      atraso += cantidad - pagado;
    }

    // Falla: se suman solo los pagos con estado 'falla'
    if (estado === 'falla'|| estado === 'incompleto') {
      falla += cantidad - pagado;
    }

    // Adelanto: solo pagos futuros con adelanto
    if (fechaEsperada > ref) {
      if (estado === 'adelantado' || estado === 'adelantadoincompleto') {
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

  // Último sábado 
  const getLastSaturday = () => {
    const today = new Date();
    const day = today.getDay();
    const diff = day === 6 ? 0 : day + 1;
    const lastSaturday = new Date(today);
    lastSaturday.setDate(today.getDate() - diff);
    return lastSaturday.toISOString().split('T')[0];
  }; 

  // Próximo sábado
  const getNextSaturday = () => {
    const today = new Date();
    const day = today.getDay();
    const diff = (6 - day + 7) % 7;
    const nextSaturday = new Date(today);
    nextSaturday.setDate(today.getDate() + diff);
    return nextSaturday.toISOString().split('T')[0];
  };

  const fechaEsperada = getLastSaturday();
  const fechaSiguienteSemana = getNextSaturday();

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
        cr.monto,
        cr.cumplimiento,
        z.codigoZona,
        z.promotora,
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
      JOIN zonas AS z ON c.idZona = z.idZona
      WHERE c.idZona = ?
        AND cr.estado = 'Activo'
    `;

    db.query(query, [fechaEsperada, idZona], async (error, results) => {
      if (error) return reject(error);
      if (!results || results.length === 0) return resolve(null);

      // Tomamos datos generales desde el primer resultado
      const { codigoZona, promotora } = results[0];

      try {
        const clientes = await Promise.all(results.map(cliente => {
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

        resolve({
          codigoZona,
          promotora,
          fechaSiguienteSemana,
          clientes
        });
      } catch (err) {
        reject(err);
      }
    });
  });
};

async function registrarPagos(pagos) {
  try {
    for (const pago of pagos) {
      const { idPago, monto, tipoPago, recargo = 0 } = pago;
      const montoTotal = Number(monto);
      const multa = Number(recargo);

      if (!idPago || isNaN(montoTotal) || montoTotal <= 0) continue;

      // Obtenemos los datos actuales del pago
      const [result] = await db.promise().query('SELECT cantidadPagada, cantidadEfectivo FROM pagos WHERE idPago = ?', [idPago]);

      if (result.length === 0) continue;

      const pagoActual = result[0];
      let nuevaCantidadPagada = pagoActual.cantidadPagada + montoTotal;
      let nuevaCantidadEfectivo = pagoActual.cantidadEfectivo;

      if (tipoPago === 'efectivo') {
        nuevaCantidadEfectivo += montoTotal + multa;
        nuevaCantidadPagada += multa;
      }

      await db.promise().query(`
        UPDATE pagos 
        SET cantidadPagada = ?, 
            cantidadEfectivo = ?, 
            tipoPago = ?, 
            recargo = ?,
            fechaPagada = NOW(),
            estado = CASE 
                        WHEN ? >= cantidadEsperada THEN 'Pagado' 
                        WHEN ? > 0 THEN 'Parcial' 
                        ELSE 'Pendiente' 
                     END
        WHERE idPago = ?
      `, [
        nuevaCantidadPagada,
        nuevaCantidadEfectivo,
        tipoPago,
        multa,
        nuevaCantidadPagada,
        nuevaCantidadPagada,
        idPago
      ]);
    }

    return { success: true, message: 'Pagos registrados correctamente.' };
  } catch (error) {
    console.error('Error al registrar pagos:', error);
    return { success: false, message: 'Error al registrar pagos.', error };
  }
}


const actualizarPago = (
  idPago,
  cantidadPagada,
  nuevoEstado,
  recargoExtra = 0,
  tipoPago = 'efectivo',
  pagoOriginal = 0
) => {
  return new Promise((resolve, reject) => {
    db.query('SELECT recargos FROM pagos WHERE idPago = ?', [idPago], (err, rows) => {
      if (err) return reject(err);
      const recargoActual = Number(rows[0]?.recargos || 0);
      const nuevoRecargo = recargoActual + recargoExtra;

      // Calcular cantidadEfectivo según el tipo de pago
      let cantidadEfectivo = 0;
      if (tipoPago === 'efectivo') {
        cantidadEfectivo = Number(pagoOriginal) + nuevoRecargo;
      }

      db.query(
        `UPDATE pagos 
         SET cantidadPagada = ?, 
             cantidadEfectivo = ?, 
             fechaPagada = CURDATE(), 
             estado = ?, 
             recargos = ?, 
             tipoPago = ? 
         WHERE idPago = ?`,
        [cantidadPagada, cantidadEfectivo, nuevoEstado, nuevoRecargo, tipoPago, idPago],
        (err2, result) => {
          if (err2) return reject(err2);
          resolve(result);
        }
      );
    });
  });
};


const actualizarCreditoAPagado = (idCredito) => {
  return new Promise((resolve, reject) => {
    db.query(
      'UPDATE creditos SET estado = ? WHERE idCredito = ?',
      ['Pagado', idCredito],
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );
  });
};

//Funciones las cuales actualizaran los estados :3
async function actualizarEstadosAtrasos() {
  try {
    const hoy = new Date();
    const sabadoAnterior = new Date(hoy);
    const day = hoy.getDay();
    const diffToSaturday = day + 1;
    sabadoAnterior.setDate(hoy.getDate() - diffToSaturday);
    sabadoAnterior.setHours(0, 0, 0, 0);
    const fechaStr = sabadoAnterior.toISOString().split('T')[0];
    await db.query(
      `UPDATE pagos SET estado = 'atraso'
       WHERE fechaEsperada = ? AND estado IN ('falla', 'incompleto')`,
      [fechaStr]
    );
    console.log(`Semana ${fechaStr} actualizada a 'atraso'`);
  } catch (error) {
    console.error(' Error en actualizarEstadosAtrasos:', error);
  }
}

async function actualizarEstadosAdelantos() {
  try {
    const hoy = new Date();
    const sabadoAnterior = new Date(hoy);
    const day = hoy.getDay();
    const diffToSaturday = day + 1;
    sabadoAnterior.setDate(hoy.getDate() - diffToSaturday + 7);
    sabadoAnterior.setHours(0, 0, 0, 0);
    const fechaStr = sabadoAnterior.toISOString().split('T')[0];
    await db.query(
      `UPDATE pagos SET estado = 'pagado', fechaPagada = CURDATE()
       WHERE fechaEsperada = ? AND estado = 'adelantado'`,
      [fechaStr]
    );
    await db.query(
      `UPDATE pagos SET estado = 'incompleto'
       WHERE fechaEsperada = ? AND estado = 'adelantadoIncompleto'`,
      [fechaStr]
    );
    console.log(`Semana ${fechaStr} actualizada desde 'adelantado' y 'adelantadoIncompleto'`);
  } catch (error) {
    console.error('Error en actualizarEstadosAdelantos:', error);
  }
}
async function actualizarEstadosFalla() {
  try {
    const hoy = new Date();
    const sabadoAnterior = new Date(hoy);
    const diaSemana = hoy.getDay(); // 0 = domingo, ..., 6 = sábado
    const diasARestar = (diaSemana + 1) % 7;
    sabadoAnterior.setDate(hoy.getDate() - diasARestar);
    sabadoAnterior.setHours(0, 0, 0, 0);

    const fechaStr = sabadoAnterior.toISOString().split('T')[0];

    const result = await db.query(
      `UPDATE pagos
       SET estado = 'falla'
       WHERE fechaEsperada = ? AND (estado = 'pendiente' OR estado = 'incompleto')`,
      [fechaStr]
    );

    // Verifica si el resultado es un array o no
    const affectedRows = Array.isArray(result)
      ? result[0]?.affectedRows ?? 0
      : result.affectedRows ?? 0;

    console.log(`Pagos actualizados a 'falla': ${affectedRows}`);
    console.log(`Semana ${fechaStr} marcada como 'falla'`);
  } catch (error) {
    console.error('Error general en actualizarEstadosFalla:', error);
  }
}


const actualizarClasificacionCredito = async (idCredito) => {
  try {
    const hoy = new Date();
    const dia = hoy.getDay();
    const diferencia = dia === 6 ? 0 : dia + 1;
    const sabadoActual = new Date(hoy);
    sabadoActual.setDate(hoy.getDate() - diferencia);
    sabadoActual.setHours(0, 0, 0, 0);
    const fechaStr = sabadoActual.toISOString().split('T')[0];

    console.log('Fecha para conteo de fallas:', fechaStr);

    const [result] = await new Promise((resolve, reject) => {
      db.query(
        `SELECT COUNT(*) AS fallas
         FROM pagos
         WHERE idCredito = ?
           AND fechaEsperada <= ?
           AND LOWER(estado) IN ('atraso', 'pagadoatrasado')`,
        [idCredito, fechaStr],
        (err, res) => {
          if (err) return reject(err);
          console.log('Consulta fallas:', res);
          resolve(res);
        }
      );
    });

    const fallas = result?.fallas || 0;

    let cumplimiento = 'Excelente';
    if (fallas >= 1 && fallas <= 2) cumplimiento = 'Bueno';
    else if (fallas >= 3 && fallas <= 4) cumplimiento = 'Regular';
    else if (fallas >= 5) cumplimiento = 'Malo';

    await new Promise((resolve, reject) => {
      db.query(
        `UPDATE creditos SET cumplimiento = ? WHERE idCredito = ?`,
        [cumplimiento, idCredito],
        (err, res) => {
          if (err) return reject(err);
          resolve(res);
        }
      );
    });

    console.log(`Cumplimiento actualizado para crédito ${idCredito}: ${cumplimiento} (${fallas} fallas)`);

  } catch (error) {
    console.error('Error al actualizar cumplimiento del crédito:', error);
  }
};


const asignarPuntosPorCumplimiento = async (idCredito) => {
  try {
    // Obtener cumplimiento, monto y idCliente
    const [result] = await new Promise((resolve, reject) => {
      db.query(
        `SELECT cumplimiento, monto, idCliente
         FROM creditos
         WHERE idCredito = ?`,
        [idCredito],
        (err, res) => {
          if (err) return reject(err);
          resolve(res);
        }
      );
    });

    if (!result) return;

    const { cumplimiento, monto, idCliente } = result;
    if (!['Excelente', 'Bueno'].includes(cumplimiento)) return;
    const porcentaje = cumplimiento === 'Excelente' ? 0.05 : 0.025;
    const puntosGanados = Math.round(monto * porcentaje);

    // Sumar puntos en tabla clientes
    await new Promise((resolve, reject) => {
      db.query(
        `UPDATE clientes
         SET puntos = IFNULL(puntos, 0) + ?
         WHERE idCliente = ?`,
        [puntosGanados, idCliente],
        (err, res) => {
          if (err) return reject(err);
          resolve(res);
        }
      );
    });

    console.log(` Cliente ${idCliente} ganó ${puntosGanados} puntos por cumplimiento ${cumplimiento}`);
  } catch (error) {
    console.error(' Error al asignar puntos al cliente:', error);
  }
};
module.exports = {
  getClientsFromZone,
  calcularPagos, 
  calcularEstadoDePagosOrdenado, 
  registrarPagos, 
  actualizarPago,
  actualizarEstadosAtrasos,
  actualizarEstadosAdelantos,
  actualizarClasificacionCredito,
  asignarPuntosPorCumplimiento,
  actualizarEstadosFalla

};
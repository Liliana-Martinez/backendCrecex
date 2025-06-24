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
    const fechaPagada = pago.fechaPagada && pago.fechaPagada !== '0000-00-00'
      ? new Date(pago.fechaPagada)
      : null;

    const mismaSemana = fechaEsperada.toISOString().slice(0, 10) === ref.toISOString().slice(0, 10);

    // Si tiene el estado atraso, te hace resta de lo que pago y lo que debio haber pagadodo
    if (estado === 'atraso') {
      atraso += cantidad - pagado;
    }

    // Va  atener falla solo si los estados con pendientes o incompleto
    if (mismaSemana) {
      if (estado === 'pendiente' || estado === 'incompleto') {
        falla += cantidad - pagado;
      }
    }

    // Aqui solo se toman las semanas futuras 
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

/*
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
};*/
const getClientsFromZone = (idZona) => {
  console.log('ID en el controller:', idZona);

  // Último sábado (para calcular atrasos, fallas, etc.)
  const getLastSaturday = () => {
    const today = new Date();
    const day = today.getDay();
    const diff = day === 6 ? 0 : day + 1;
    const lastSaturday = new Date(today);
    lastSaturday.setDate(today.getDate() - diff);
    return lastSaturday.toISOString().split('T')[0];
  };

  // Próximo sábado (para PDF)
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

// Registro de pagos
const registrarPagos = async (pagos) => {
  try {
    for (const pago of pagos) {
      const { idCredito, payment } = pago;
      let monto = Number(payment);
      if (!idCredito || isNaN(monto) || monto <= 0) continue;

      const resultado = await new Promise((resolve, reject) => {
        db.query(
          'SELECT * FROM pagos WHERE idCredito = ? ORDER BY numeroSemana ASC',
          [idCredito],
          (err, results) => {
            if (err) return reject(err);
            resolve(results);
          }
        );
      });

      const semanas = resultado;
      if (!Array.isArray(semanas) || semanas.length === 0) continue;

      const hoy = new Date();
      const hoySábado = new Date(hoy);
      const dia = hoySábado.getDay(); // 0=Domingo, ..., 6=Sábado
      const diferencia = dia === 6 ? 0 : dia + 1;
      hoySábado.setDate(hoySábado.getDate() - diferencia);
      hoySábado.setHours(0, 0, 0, 0);

      // Paso 1: semana actual (pendiente o incompleto)
      for (const semana of semanas) {
        if (monto <= 0) break;

        const { idPago, cantidad, cantidadPagada, estado, fechaEsperada } = semana;
        const cantidadEsperada = Number(cantidad);
        const pagado = Number(cantidadPagada) || 0;
        const restante = cantidadEsperada - pagado;
        const fechaSemana = new Date(fechaEsperada);
        fechaSemana.setHours(0, 0, 0, 0);
        const esSemanaActual = fechaSemana.toDateString() === hoySábado.toDateString();

        if (esSemanaActual && (estado === 'pendiente' || estado === 'incompleto')) {
          if (monto >= restante) {
            await actualizarPago(idPago, cantidadEsperada, 'pagado');
            monto -= restante;
          } else {
            await actualizarPago(idPago, pagado + monto, 'incompleto');
            monto = 0;
          }
          break;
        }
      }

      // Paso 2: semanas con atraso (estado 'atraso')
      for (const semana of semanas) {
        if (monto <= 0) break;

        const { idPago, cantidad, cantidadPagada, estado } = semana;
        if (estado !== 'atraso') continue;

        const cantidadEsperada = Number(cantidad);
        const pagado = Number(cantidadPagada) || 0;
        const restante = cantidadEsperada - pagado;

        if (monto >= restante) {
          await actualizarPago(idPago, cantidadEsperada, 'pagadoAtrasado');
          monto -= restante;
        } else {
          await actualizarPago(idPago, pagado + monto, 'atraso');
          monto = 0;
        }
      }

      // Paso 3: semanas futuras como adelanto
      for (const semana of semanas) {
        if (monto <= 0) break;

        const { idPago, cantidad, cantidadPagada, estado, fechaEsperada } = semana;
        const cantidadEsperada = Number(cantidad);
        const pagado = Number(cantidadPagada) || 0;
        const restante = cantidadEsperada - pagado;
        const fechaSemana = new Date(fechaEsperada);
        fechaSemana.setHours(0, 0, 0, 0);
        const esFuturo = fechaSemana > hoySábado;

        if (esFuturo) {
          // Si existe una semana con adelantoIncompleto, primero se debe completar
          if (estado === 'adelantadoIncompleto') {
            const nuevoTotal = pagado + monto;

            if (nuevoTotal >= cantidadEsperada) {
              await actualizarPago(idPago, cantidadEsperada, 'adelantado');
              monto -= (cantidadEsperada - pagado);
            } else {
              await actualizarPago(idPago, nuevoTotal, 'adelantadoIncompleto');
              monto = 0;
              break; 
            } 
          }

          // Semana futura sin pagos aún
          if (estado === 'pendiente') {
            if (monto >= cantidadEsperada) {
              await actualizarPago(idPago, cantidadEsperada, 'adelantado');
              monto -= cantidadEsperada;
            } else {
              await actualizarPago(idPago, pagado + monto, 'adelantadoIncompleto');
              monto = 0;
              break; // detenerse en la primera semana incompleta
            }
          }
        }
      }
    }

    return { success: true, message: 'Pagos registrados correctamente' };
  } catch (error) {
    console.error('Error al registrar pagos:', error);
    return { success: false, message: 'Error al registrar pagos', error };
  }
};

const actualizarPago = (idPago, cantidadPagada, nuevoEstado) => {
  return new Promise((resolve, reject) => {
    db.query(
      'UPDATE pagos SET cantidadPagada = ?, fechaPagada = CURDATE(), estado = ? WHERE idPago = ?',
      [cantidadPagada, nuevoEstado, idPago],
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );
  });
};

const actualizarAdelantos = async () => {
  try {
    const hoy = new Date();
    const hoySábado = new Date(hoy);
    hoySábado.setDate(hoy.getDate() - hoy.getDay() + 6); 
    hoySábado.setHours(0, 0, 0, 0);

    const resultados = await new Promise((resolve, reject) => {
      db.query(
        "SELECT * FROM pagos WHERE estado = 'adelanto' AND fechaEsperada <= ?",
        [hoySábado],
        (err, results) => {
          if (err) return reject(err);
          resolve(results);
        }
      );
    });

    for (const pago of resultados) {
      const { idPago, cantidad, cantidadPagada } = pago;
      const cantidadEsperada = Number(cantidad);
      const pagado = Number(cantidadPagada) || 0;

      const nuevoEstado = pagado >= cantidadEsperada ? 'pagado' : 'incompleto';

      await new Promise((resolve, reject) => {
        db.query(
          'UPDATE pagos SET estado = ?, fechaPagada = CURDATE() WHERE idPago = ?',
          [nuevoEstado, idPago],
          (err, result) => {
            if (err) return reject(err);
            resolve(result);
          }
        );
      });
    }

    console.log('Adelantos actualizados automáticamente');
  } catch (error) {
    console.error('Error al actualizar adelantos:', error);
  }
};


module.exports = {
  getClientsFromZone,
  calcularPagos, 
  calcularEstadoDePagosOrdenado, 
  registrarPagos, 
  actualizarPago, 
  actualizarAdelantos
};

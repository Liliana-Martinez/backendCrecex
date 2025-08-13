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

  const getLastSaturday = () => {
    const today = new Date();
    const day = today.getDay();
    const diff = day === 6 ? 0 : day + 1;
    const lastSaturday = new Date(today);
    lastSaturday.setDate(today.getDate() - diff);
    return lastSaturday.toISOString().split('T')[0];
  };

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
        p.numeroSemana,
        p.cantidadEfectivo,
        p.tipoPago -- ✅ lo necesitamos para condicionar el valor
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

      const { codigoZona, promotora } = results[0];

      try {
        const clientes = await Promise.all(results.map(cliente => {
          return new Promise((res, rej) => {
            const pagosQuery = `
              SELECT cantidad, cantidadPagada, cantidadEfectivo, tipoPago, fechaEsperada, fechaPagada, estado
              FROM pagos
              WHERE idCredito = ?
              ORDER BY fechaEsperada
            `;
            db.query(pagosQuery, [cliente.idCredito], (err, pagos) => {
              if (err) return rej(err);
              const { atraso, adelanto, falla } = calcularEstadoDePagosOrdenado(pagos, fechaEsperada);

              // Aplicamos la condición para cantidadEfectivo
              let cantidadEfectivo = null;
              if (cliente.tipoPago && cliente.tipoPago.toLowerCase() === 'efectivo') {
                cantidadEfectivo = cliente.cantidadEfectivo;
              }

              res({
                ...cliente,
                cantidadEfectivo, // solo si tipoPago === 'efectivo'
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

const registrarPagos = async (pagos) => {
  try {
    for (const pago of pagos) {
      const { idCredito, payment = 0, lateFees = 0, paymentType = 'efectivo' } = pago;
      let monto = Number(payment);
      const recargoExtra = Number(lateFees) || 0;

      if (!idCredito) continue;

      // ✅ Caso especial: solo actualizar tipoPago sin dinero
      if ((isNaN(monto) || monto <= 0) && paymentType) {
        await new Promise((resolve, reject) => {
          db.query(
            `UPDATE pagos 
             SET tipoPago = ?, cantidadEfectivo = 0, fechaPagada = CURDATE()
             WHERE idCredito = ? AND tipoPago = 'efectivo'`,
            [paymentType, idCredito],
            (err, result) => {
              if (err) return reject(err);
              resolve(result);
            }
          );
        });

        await actualizarClasificacionCredito(idCredito);
        continue; // Salta el resto de la lógica
      }

      const totalRecibidoHoy = monto + recargoExtra;
      let cantidadEfectivoRegistrado = false;

      // 📌 Obtener todas las semanas del crédito
      const semanas = await new Promise((resolve, reject) => {
        db.query(
          'SELECT * FROM pagos WHERE idCredito = ? ORDER BY numeroSemana ASC',
          [idCredito],
          (err, results) => {
            if (err) return reject(err);
            resolve(results);
          }
        );
      });

      if (!Array.isArray(semanas) || semanas.length === 0) continue;

      // 📌 Calcular total restante y semanas pendientes
      let totalRestante = 0;
      const semanasPendientes = [];
      for (const semana of semanas) {
        if (!['pagado', 'pagadoAtrasado'].includes(semana.estado)) {
          const restante = Number(semana.cantidad) - Number(semana.cantidadPagada || 0);
          totalRestante += restante;
          semanasPendientes.push(semana);
        }
      }

      // 📌 Si el pago liquida todo el crédito
      if (monto >= totalRestante && totalRestante > 0) {
        for (const semana of semanasPendientes) {
          await actualizarPago(
            semana.idPago,
            semana.cantidad,
            'pagado',
            recargoExtra,
            paymentType,
            paymentType === 'pagado' ? 0 : (cantidadEfectivoRegistrado ? 0 : totalRecibidoHoy),
            !cantidadEfectivoRegistrado
          );
          cantidadEfectivoRegistrado = true;
        }

        await actualizarCreditoAPagado(idCredito);
        await actualizarClasificacionCredito(idCredito);
        await asignarPuntosPorCumplimiento(idCredito);
        continue;
      }

      // 📌 Calcular fecha del sábado de la semana actual
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      const hoySabado = new Date(hoy);
      const dia = hoySabado.getDay();
      const diferencia = dia === 6 ? 0 : dia + 1;
      hoySabado.setDate(hoySabado.getDate() - diferencia);
      hoySabado.setHours(0, 0, 0, 0);

      // 📌 Registrar efectivo en la semana actual
      const semanaActual = semanas.find(s => {
        const fechaSemana = new Date(s.fechaEsperada);
        fechaSemana.setHours(0, 0, 0, 0);
        return fechaSemana.getTime() === hoySabado.getTime();
      });

      if (semanaActual && !cantidadEfectivoRegistrado && paymentType === 'efectivo') {
        await actualizarPago(
          semanaActual.idPago,
          semanaActual.cantidadPagada || 0,
          semanaActual.estado,
          recargoExtra,
          paymentType,
          totalRecibidoHoy,
          true
        );
        cantidadEfectivoRegistrado = true;
      }

      // 📌 Pagar semana actual
      for (const semana of semanas) {
        if (monto <= 0) break;
        const { idPago, cantidad, cantidadPagada, estado, fechaEsperada } = semana;

        const cantidadEsperada = Number(cantidad);
        const pagado = Number(cantidadPagada) || 0;
        const restante = cantidadEsperada - pagado;
        const fechaSemana = new Date(fechaEsperada);
        fechaSemana.setHours(0, 0, 0, 0);
        const esSemanaActual = fechaSemana.getTime() === hoySabado.getTime();

        if (esSemanaActual && ['falla', 'incompleto', 'pendiente'].includes(estado)) {
          if (monto >= restante) {
            await actualizarPago(idPago, cantidadEsperada, 'pagado', recargoExtra, paymentType, paymentType === 'pagado' ? 0 : 0, false);
            monto -= restante;
          } else {
            await actualizarPago(idPago, pagado + monto, 'incompleto', recargoExtra, paymentType, paymentType === 'pagado' ? 0 : 0, false);
            monto = 0;
          }
          break;
        }
      }

      // 📌 Pagar atrasos
      for (const semana of semanas) {
        if (monto <= 0) break;
        if (semana.estado !== 'atraso') continue;

        const restante = Number(semana.cantidad) - Number(semana.cantidadPagada || 0);
        if (monto >= restante) {
          await actualizarPago(semana.idPago, semana.cantidad, 'pagadoAtrasado', recargoExtra, paymentType, paymentType === 'pagado' ? 0 : 0, false);
          monto -= restante;
        } else {
          await actualizarPago(semana.idPago, Number(semana.cantidadPagada) + monto, 'atraso', recargoExtra, paymentType, paymentType === 'pagado' ? 0 : 0, false);
          monto = 0;
        }
      }

      // 📌 Adelantos
      for (const semana of semanas) {
        if (monto <= 0) break;
        const fechaSemana = new Date(semana.fechaEsperada);
        fechaSemana.setHours(0, 0, 0, 0);
        const esFuturo = fechaSemana > hoySabado;

        if (esFuturo) {
          const pagado = Number(semana.cantidadPagada) || 0;
          const cantidadEsperada = Number(semana.cantidad);
          if (semana.estado === 'adelantadoIncompleto') {
            const nuevoTotal = pagado + monto;
            if (nuevoTotal >= cantidadEsperada) {
              await actualizarPago(semana.idPago, cantidadEsperada, 'adelantado', recargoExtra, paymentType, paymentType === 'pagado' ? 0 : 0, false);
              monto -= cantidadEsperada - pagado;
            } else {
              await actualizarPago(semana.idPago, nuevoTotal, 'adelantadoIncompleto', recargoExtra, paymentType, paymentType === 'pagado' ? 0 : 0, false);
              monto = 0;
              break;
            }
          }
          if (semana.estado === 'pendiente') {
            if (monto >= cantidadEsperada) {
              await actualizarPago(semana.idPago, cantidadEsperada, 'adelantado', recargoExtra, paymentType, paymentType === 'pagado' ? 0 : 0, false);
              monto -= cantidadEsperada;
            } else {
              await actualizarPago(semana.idPago, pagado + monto, 'adelantadoIncompleto', recargoExtra, paymentType, paymentType === 'pagado' ? 0 : 0, false);
              monto = 0;
              break;
            }
          }
        }
      }

      // 📌 Verificar si el crédito quedó pagado
      const sinPendientes = await new Promise((resolve, reject) => {
        db.query(
          `SELECT COUNT(*) AS pendientes
           FROM pagos
           WHERE idCredito = ? AND estado NOT IN ('pagado', 'pagadoAtrasado')`,
          [idCredito],
          (err, result) => {
            if (err) return reject(err);
            resolve(result[0].pendientes === 0);
          }
        );
      });

      if (sinPendientes) {
        await actualizarCreditoAPagado(idCredito);
        await asignarPuntosPorCumplimiento(idCredito);
      }

      // 📌 Siempre actualizamos clasificación
      await actualizarClasificacionCredito(idCredito);
    }

    return { success: true, message: 'Pagos registrados correctamente' };
  } catch (error) {
    console.error('❌ Error al registrar pagos:', error);
    return { success: false, message: 'Error al registrar pagos', error };
  }
};


const actualizarPago = (
  idPago,
  cantidadPagada,
  nuevoEstado,
  recargoExtra = 0,
  tipoPago = 'efectivo',
  cantidadEfectivoRecibido = 0,
  esSemanaActual = false
) => {
  return new Promise((resolve, reject) => {
    // 📌 Obtener datos actuales del pago
    db.query(
      'SELECT recargos, cantidadEfectivo, tipoPago FROM pagos WHERE idPago = ?',
      [idPago],
      (err, rows) => {
        if (err) return reject(err);
        if (!rows || rows.length === 0) return reject(new Error('Pago no encontrado'));

        const recargoActual = Number(rows[0]?.recargos || 0);
        const cantidadEfectivoActual = Number(rows[0]?.cantidadEfectivo || 0);

        // 📌 Calcular nuevo recargo
        const nuevoRecargo = recargoActual + recargoExtra;

        // 📌 Determinar nuevo tipo de pago
        const nuevoTipoPago = tipoPago;

        // 📌 Calcular nueva cantidad de efectivo
        let nuevaCantidadEfectivo;
        if (tipoPago === 'pagado') {
          // Siempre reiniciar a 0 si es 'pagado'
          nuevaCantidadEfectivo = 0;
        } else if (tipoPago === 'efectivo' && esSemanaActual) {
          // Acumular efectivo solo si es efectivo y semana actual
          nuevaCantidadEfectivo = cantidadEfectivoActual + Number(cantidadEfectivoRecibido);
        } else {
          // Mantener el valor actual si no se cumple ninguna condición
          nuevaCantidadEfectivo = cantidadEfectivoActual;
        }

        // 📌 Actualizar en la base de datos
        db.query(
          `UPDATE pagos 
           SET cantidadPagada = ?, 
               cantidadEfectivo = ?, 
               fechaPagada = CURDATE(), 
               estado = ?, 
               recargos = ?, 
               tipoPago = ? 
           WHERE idPago = ?`,
          [
            cantidadPagada !== null ? cantidadPagada : rows[0].cantidadPagada,
            nuevaCantidadEfectivo,
            nuevoEstado !== null ? nuevoEstado : rows[0].estado,
            nuevoRecargo,
            nuevoTipoPago,
            idPago
          ],
          (err2, result) => {
            if (err2) return reject(err2);
            resolve(result);
          }
        );
      }
    );
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
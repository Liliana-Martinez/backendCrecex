const db = require('../db');

// Helper universal para queries
function queryAsync(query, params = []) {
  return new Promise((resolve, reject) => {
    db.query(query, params, (err, results) => {
      if (err) {
        return reject(err);
      }
      resolve(results);
    });
  });
}

function normalizarFecha(fecha) {
  const nuevaFecha = new Date(fecha);
  nuevaFecha.setHours(0, 0, 0, 0);
  return nuevaFecha;
}

function obtenerSabadoActual() {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const sabadoActual = new Date(hoy);
  const dia = sabadoActual.getDay();
  const diff = dia === 6 ? 0 : dia + 1;
  sabadoActual.setDate(
    sabadoActual.getDate() - diff
  );
  sabadoActual.setHours(0, 0, 0, 0);
  return sabadoActual;
}

function obtenerSabadoAnterior() {
  const hoy = new Date();
  const sabadoAnterior = new Date(hoy);
  const day = hoy.getDay();
  const diffToSaturday = day + 1;
  sabadoAnterior.setDate(
    hoy.getDate() - diffToSaturday
  );
  sabadoAnterior.setHours(0, 0, 0, 0);
  return sabadoAnterior;
}

function obtenerSiguienteSabado() {
  const hoy = new Date();
  const siguienteSabado = new Date(hoy);
  const day = hoy.getDay();
  const diffToSaturday =
    (6 - day + 7) % 7;
  siguienteSabado.setDate(
    hoy.getDate() + diffToSaturday
  );
  siguienteSabado.setHours(0, 0, 0, 0);
  return siguienteSabado;
}
function obtenerInicioSemana(fecha) {
  const f = new Date(fecha);
  f.setHours(0, 0, 0, 0);
  const dia = f.getDay();
  const diff = dia === 6 ? 0 : dia + 1;
  f.setDate(f.getDate() - diff);
  return f;
}
function esMismaSemana(fecha1, fecha2) {
  if (!fecha1 || !fecha2) {
    return false;
  }
  return (
    obtenerInicioSemana(fecha1).getTime() ===
    obtenerInicioSemana(fecha2).getTime()
  );
}

// Obtener semanas/pagos de un crédito
async function obtenerSemanasCredito(idCredito) {
  const query = `
    SELECT *
    FROM pagos
    WHERE idCredito = ?
    ORDER BY numeroSemana ASC
  `;
  return await queryAsync(query, [idCredito]);
}
// Obtener pagos completos de un crédito
async function obtenerPagosCredito(idCredito) {
  const query = `
    SELECT
      cantidad,
      cantidadPagada,
      adeudo,
      tipoPago,
      fechaEsperada,
      fechaPagada,
      estado
    FROM pagos
    WHERE idCredito = ?
    ORDER BY fechaEsperada
  `;
  return await queryAsync(query, [idCredito]);
}
// Obtener pendientes
async function obtenerPendientesCredito(idCredito) {
  const query = `
    SELECT COUNT(*) AS total
    FROM pagos
    WHERE idCredito = ?
    AND estado NOT IN (
      'pagado',
      'pagadoAtrasado'
    )
  `;
  const rows = await queryAsync(query, [idCredito]);
  return rows[0].total;
}
// Actualizar tipo de pago
async function actualizarTipoPago(
  idPago,
  paymentType
) {
  const query = `
    UPDATE pagos
    SET tipoPago = ?,
        fechaPagada = CURDATE()
    WHERE idCredito = ?
  `;
  return await queryAsync(query, [
    paymentType,
    idCredito
  ]);
}
// Obtener datos actuales de un pago
async function obtenerPagoPorId(idPago) {
  const query = `
    SELECT adeudo, recargos, extras,fechaPagada
    FROM pagos
    WHERE idPago = ?
  `;
  const rows = await queryAsync(query, [idPago]);
  return rows[0];
}
//Obtener los pagos que ha realizado el cliente
async function calcularPagos(
  clientes,
  fechaEsperada
) {
  const results = await Promise.all(
    clientes.map(cliente => {
      return new Promise((resolve, reject) => {
        const pagosQuery = `
          SELECT
            cantidad,
            cantidadPagada,
            fechaEsperada,
            fechaPagada,
            estado
          FROM pagos
          WHERE idCredito = ?
          ORDER BY fechaEsperada
        `;
        db.query(
          pagosQuery,
          [cliente.idCredito],
          (err, pagos) => {
            if (err) {
              return reject(err);
            }
            const {
              atraso,
              adelanto,
              falla
            } = calcularEstadoDePagosOrdenado(
              pagos,
              fechaEsperada
            );
            resolve({
              ...cliente,
              atraso,
              adelanto,
              falla
            });
          }
        );
      });
    })
  );
  return results;
}

function calcularEstadoDePagosOrdenado(
  pagos,
  fechaReferencia
) {
  const ref =
    new Date(fechaReferencia);
  let adelantoDisponible = 0;
  let atraso = 0;
  let falla = 0;
  pagos.sort((a, b) => {
    return (
      new Date(a.fechaEsperada) -
      new Date(b.fechaEsperada)
    );
  });
  pagos.forEach(pago => {
    const cantidad =
      Number(pago.cantidad ?? 0);
    const pagado =
      Number(pago.cantidadPagada ?? 0);
    const estado =
      (pago.estado ?? '').toLowerCase();
    const fechaEsperada =
      new Date(pago.fechaEsperada);
    //Atrazos
    if (estado === 'atraso') {
      atraso +=
        cantidad - pagado;
    }
    //Fallas
    if (
      estado === 'falla' ||
      estado === 'incompleto'
    ) {
      falla +=
        cantidad - pagado;
    }
    //Adelantpos
    if (fechaEsperada > ref) {
      if (
        estado === 'adelantado' ||
        estado === 'adelantadoincompleto'
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
//Trae los datos de los clientes por zona
const getClientsFromZone = (
  idZona
) => {
  console.log(
    'ID en el controller:',
    idZona
  );
  const fechaEsperada =
    obtenerSabadoAnterior()
      .toISOString()
      .split('T')[0];
  const fechaSiguienteSemana =
    obtenerSiguienteSabado()
      .toISOString()
      .split('T')[0];
  return new Promise((resolve, reject) => {
    const query = `
      SELECT
        CONCAT_WS(
          ' ',
          c.nombre,
          c.apellidoPaterno,
          c.apellidoMaterno
        ) AS nombreCompleto,
        c.idCliente,
        c.clasificacion,
        cr.idCredito,
        cr.tipoCredito,
        cr.fechaEntrega,
        cr.fechaVencimiento,
        cr.abonoSemanal AS montoSemanal,
        cr.monto,
        cr.cumplimiento,
        z.codigoZona,
        z.promotor,
        (
          SELECT COUNT(*)
          FROM creditos
          WHERE creditos.idCliente = c.idCliente
          AND LOWER(creditos.tipoCredito) <> 'adicional'
        ) AS numeroCreditos,
        p.numeroSemana,
        p.adeudo,
        p.tipoPago
      FROM clientes AS c
      JOIN creditos AS cr
        ON c.idCliente = cr.idCliente
      LEFT JOIN pagos AS p
        ON cr.idCredito = p.idCredito
        AND p.fechaEsperada = ?
      JOIN zonas AS z
        ON c.idZona = z.idZona
      WHERE c.idZona = ?
      AND cr.estado = 'Activo'
    `;
    db.query(
      query,
      [fechaEsperada, idZona],
      async (error, results) => {
        if (error) {
          return reject(error);
        }
        if (
          !results ||
          results.length === 0
        ) {
          return resolve(null);
        }
        const {
          codigoZona,
          promotor
        } = results[0];
        try {
          const clientes =
            await Promise.all(
              results.map(cliente => {
                return new Promise(
                  (
                    resolveCliente,
                    rejectCliente
                  ) => {
                    const pagosQuery = `
                      SELECT
                        cantidad,
                        cantidadPagada,
                        adeudo,
                        tipoPago,
                        fechaEsperada,
                        fechaPagada,
                        estado
                      FROM pagos
                      WHERE idCredito = ?
                      ORDER BY fechaEsperada
                    `;

                    db.query(
                      pagosQuery,
                      [cliente.idCredito],
                      (
                        err,
                        pagos
                      ) => {
                        if (err) {
                          return rejectCliente(err);
                        }
                        const {
                          atraso,
                          adelanto,
                          falla
                        } =
                          calcularEstadoDePagosOrdenado(
                            pagos,
                            fechaEsperada
                          );
                        let adeudo = null;
                        if (
                          cliente.tipoPago &&
                          cliente.tipoPago.toLowerCase() ===
                            'efectivo'
                        ) {
                          adeudo =
                            cliente.adeudo;
                        }
                        resolveCliente({
                          ...cliente,
                          numeroCreditos:
                            cliente.tipoCredito &&
                            cliente.tipoCredito.toLowerCase() ===
                              'adicional'
                              ? 'AD'
                              : cliente.numeroCreditos,
                          adeudo,
                          atraso,
                          adelanto,
                          falla
                        });
                      }
                    );
                  }
                );
              })
            );
          resolve({
            codigoZona,
            promotor,
            fechaSiguienteSemana,
            clientes
          });
        } catch (err) {
          console.error(
            'Error al obtener los datos:',
            err
          );
          reject(err);
        }
      }
    );
  });
};
//REgistra los pagos primero el de semana, atrasos y por ultimo ad
const registrarPagos = async (pagos) => {
  try {
    for (const pago of pagos) {
      const {
        idCredito,
        payment = 0,
        lateFees = 0,
        paymentType = 'efectivo'
      } = pago;
      let monto =
        Number(payment) || 0;
      const recargoExtra =
        Number(lateFees) || 0;
      if (!idCredito) {
        continue;
      }
      const semanas =
        await obtenerSemanasCredito(idCredito);
      if (!semanas.length) {
        continue;
      }
      const sabadoActual =
        obtenerSabadoActual();
      const semanaActual =
        semanas.find(s => {
          const fecha =
            normalizarFecha(
              s.fechaEsperada
            );
          return (
            fecha.getTime() ===
            sabadoActual.getTime()
          );
        });
      // Solo cambia tipo de pago
      if (monto <= 0 && paymentType) {
        if (semanaActual) {
          await actualizarTipoPago(
            semanaActual.idPago,
            paymentType
          );
        }
        await actualizarClasificacionCredito(
          idCredito
        );
        continue;
      }
      // Registrar recargos
      if (semanaActual) {
        await actualizarPago(
          semanaActual.idPago,
          semanaActual.cantidadPagada,
          semanaActual.estado,
          recargoExtra,
          paymentType,
          monto + recargoExtra,
          true
        );
      }
      for (const semana of semanas) {
        if (monto <= 0) {
          break;
        }
        const fecha =
          normalizarFecha(
            semana.fechaEsperada
          );
        const esActual =
          fecha.getTime() ===
          sabadoActual.getTime();
        if (
          esActual &&
          ['pendiente', 'falla', 'incompleto']
            .includes(semana.estado)
        ) {
          const restante =
            Number(semana.cantidad) -
            Number(
              semana.cantidadPagada || 0
            );
          if (monto >= restante) {
            await actualizarPago(
              semana.idPago,
              semana.cantidad,
              'pagado',
              0,
              paymentType,
              0,
              false
            );
            monto -= restante;
          } else {
            await actualizarPago(
              semana.idPago,
              Number(
                semana.cantidadPagada || 0
              ) + monto,
              'incompleto',
              0,
              paymentType,
              0,
              false
            );
            monto = 0;
          }
          break;
        }
      }
      //Atrasos
      for (const semana of semanas) {
        if (monto <= 0) {
          break;
        }
        if (semana.estado !== 'atraso') {
          continue;
        }
        const restante =
          Number(semana.cantidad) -
          Number(
            semana.cantidadPagada || 0
          );
        if (monto >= restante) {
          const pagoAplicado =
            restante;
          await actualizarPago(
            semana.idPago,
            semana.cantidad,
            'pagadoAtrasado',
            0,
            paymentType,
            0,
            false,
            pagoAplicado
          );
          monto -= restante;

        } else {
          const pagoAplicado =
            monto;
          await actualizarPago(
            semana.idPago,
            Number(
              semana.cantidadPagada || 0
            ) + pagoAplicado,
            'atraso',
            0,
            paymentType,
            0,
            false,
            pagoAplicado
          );
          monto = 0;
        }
      }
      //Adelantos
      for (const semana of semanas) {
        if (monto <= 0) {
          break;
        }
        const fecha =
          normalizarFecha(
            semana.fechaEsperada
          );
        if (fecha <= sabadoActual) {
          continue;
        }
        const pagado =
          Number(
            semana.cantidadPagada || 0
          );
        const esperado =
          Number(
            semana.cantidad
          );
        const restante =
          esperado - pagado;
        if (
          [
            'pendiente',
            'adelantadoIncompleto'
          ].includes(
            semana.estado
          )
        ) {
          if (monto >= restante) {
            await actualizarPago(
              semana.idPago,
              esperado,
              'adelantado',
              0,
              paymentType,
              0,
              false
            );
            monto -= restante;
          } else {
            await actualizarPago(
              semana.idPago,
              pagado + monto,
              'adelantadoIncompleto',
              0,
              paymentType,
              0,
              false
            );
            monto = 0;
          }
        }
      }
      const pendientes =
        await obtenerPendientesCredito(
          idCredito
        );
      if (pendientes === 0) {
        await actualizarCreditoAPagado(
          idCredito
        );
        await asignarPuntosPorCumplimiento(
          idCredito
        );
      }
      await actualizarClasificacionCredito(
        idCredito
      );
    }
    return {
      success: true,
      message:
        'Pagos registrados correctamente'
    };
  } catch (error) {
    console.error(
      'Error registrarPagos:',
      error
    );
    return {
      success: false,
      message:
        'Error al registrar pagos'
    };
  }
};
//Actualizacion de estados de los pagos
const actualizarPago = async (
  idPago,
  cantidadPagada,
  nuevoEstado,
  recargoExtra = 0,
  tipoPago = 'efectivo',
  adeudoRecibido = 0,
  esSemanaActual = false,
  extra = 0
) => {
  try {
    const pagoActual =
      await obtenerPagoPorId(idPago);
    if (!pagoActual) {
      throw new Error('Pago no encontrado');
    }
    const adeudoActual =
      Number(pagoActual.adeudo || 0);
    const recargoActual =
      Number(pagoActual.recargos || 0);
    const extrasActual =
      Number(pagoActual.extras || 0);
    const fechaPagadaActual =
      pagoActual.fechaPagada;
    const nuevoRecargo =
      recargoActual + recargoExtra;
    let nuevoAdeudo =
      adeudoActual;
    let nuevoExtra =
      extrasActual;
    // Si viene valor para extras
    if (extra > 0) {
      const hoy =
        new Date();
      if (
        fechaPagadaActual &&
        esMismaSemana(
          new Date(fechaPagadaActual),
          hoy
        )
      ) {
        // misma semana → suma
        nuevoExtra =
          extrasActual + extra;
      } else {
        // semana diferente → reemplaza
        nuevoExtra =
          extra;
      }
    }
    if (
      tipoPago === 'efectivo' &&
      esSemanaActual
    ) {
      nuevoAdeudo =
        adeudoActual +
        Number(
          adeudoRecibido || 0
        );
    }
    const query = `
      UPDATE pagos
      SET cantidadPagada = ?,
          estado = ?,
          fechaPagada = CURDATE(),
          recargos = ?,
          tipoPago = ?,
          adeudo = ?,
          extras = ?
      WHERE idPago = ?
    `;
    const params = [
      cantidadPagada,
      nuevoEstado,
      nuevoRecargo,
      tipoPago,
      nuevoAdeudo,
      nuevoExtra,
      idPago
    ];
    console.log(
      'ACTUALIZANDO PAGO:',
      params
    );
    return await queryAsync(
      query,
      params
    );
  } catch (error) {
    console.error(
      'Error al actualizar pago:',
      error
    );
    throw error;
  }
};
//Actualizacion de los pagos de una semana a la que sigue 
const actualizarCreditoAPagado = async (
  idCredito
) => {
  try {
    const query = `
      UPDATE creditos
      SET estado = ?
      WHERE idCredito = ?
    `;
    return await queryAsync(query, [
      'Pagado',
      idCredito
    ]);
  } catch (error) {
    console.error(
      'Error al actualizar crédito:',
      error
    );
    throw error;
  }
};

async function actualizarEstadosAtrasos() {
  try {
    const sabadoAnterior =
      obtenerSabadoAnterior();
    const fechaStr =
      sabadoAnterior
        .toISOString()
        .split('T')[0];
    const query = `
      UPDATE pagos
      SET estado = 'atraso'
      WHERE fechaEsperada = ?
      AND estado IN (
        'falla',
        'incompleto'
      )
    `;
    await queryAsync(query, [fechaStr]);
    console.log(
      `Semana ${fechaStr} actualizada a 'atraso'`
    );
  } catch (error) {
    console.error(
      'Error en actualizarEstadosAtrasos:',
      error
    );
  }
}

async function actualizarEstadosAdelantos() {
  try {
    const hoy = new Date();
    const sabadoAnterior =
      new Date(hoy);
    const day = hoy.getDay();
    const diffToSaturday =
      day + 1;
    sabadoAnterior.setDate(
      hoy.getDate() - diffToSaturday + 7
    );
    sabadoAnterior.setHours(
      0,
      0,
      0,
      0
    );
    const fechaStr =
      sabadoAnterior
        .toISOString()
        .split('T')[0];
    //Ad a Pagado, cuando cambia semana
    const queryPagado = `
      UPDATE pagos
      SET estado = 'pagado',
          fechaPagada = CURDATE()
      WHERE fechaEsperada = ?
      AND estado = 'adelantado'
    `;
    await queryAsync(queryPagado, [
      fechaStr
    ]);
    //Incompleto a Atraso cuando cambia semana
    const queryIncompleto = `
      UPDATE pagos
      SET estado = 'incompleto'
      WHERE fechaEsperada = ?
      AND estado = 'adelantadoIncompleto'
    `;
    await queryAsync(queryIncompleto, [
      fechaStr
    ]);
    console.log(
      `Semana ${fechaStr} actualizada desde adelantados`
    );
  } catch (error) {
    console.error(
      'Error en actualizarEstadosAdelantos:',
      error
    );
  }

}

async function actualizarEstadosFalla() {
  try {
    const sabadoAnterior =
      obtenerSabadoAnterior();
    const fechaStr =
      sabadoAnterior
        .toISOString()
        .split('T')[0];
    const query = `
      UPDATE pagos
      SET estado = 'falla'
      WHERE fechaEsperada = ?
      AND (
        estado = 'pendiente'
        OR estado = 'incompleto'
      )
    `;
    const result =
      await queryAsync(query, [fechaStr]);
    const affectedRows =
      result?.affectedRows || 0;
    console.log(
      `Pagos actualizados a falla: ${affectedRows}`
    );
    console.log(
      `Semana ${fechaStr} marcada como falla`
    );
  } catch (error) {
    console.error(
      'Error general en actualizarEstadosFalla:',
      error
    );
  }
}
//Se actualiza la clasificacion de los creditos cada pago que den
const actualizarClasificacionCredito = async (
  idCredito
) => {
  try {
    const sabadoActual =
      obtenerSabadoActual();
    const fechaStr =
      sabadoActual
        .toISOString()
        .split('T')[0];
    console.log(
      'Fecha para conteo de fallas:',
      fechaStr
    );
    //Cuenta cuantas fallas
    const queryFallas = `
      SELECT COUNT(*) AS fallas
      FROM pagos
      WHERE idCredito = ?
      AND fechaEsperada <= ?
      AND LOWER(estado) IN (
        'atraso',
        'pagadoatrasado'
      )
    `;
    const rows = await queryAsync(
      queryFallas,
      [idCredito, fechaStr]
    );
    const fallas =
      rows[0]?.fallas || 0;
    console.log(
      'Consulta fallas:',
      rows
    );
    let cumplimiento =
      'Excelente';
    if (fallas >= 1 && fallas <= 2) {
      cumplimiento = 'Bueno';
    }
    else if (
      fallas >= 3 &&
      fallas <= 4
    ) {
      cumplimiento = 'Regular';
    }
    else if (fallas >= 5) {
      cumplimiento = 'Malo';
    }
    //Actualiza el cumplimiento del credito
    const queryUpdate = `
      UPDATE creditos
      SET cumplimiento = ?
      WHERE idCredito = ?
    `;
    await queryAsync(queryUpdate, [
      cumplimiento,
      idCredito
    ]);
    console.log(
      `Cumplimiento actualizado para crédito ${idCredito}: ${cumplimiento} (${fallas} fallas)`
    );
  } catch (error) {
    console.error(
      'Error al actualizar cumplimiento:',
      error
    );
  }
};
//Se dan puntos segun el cumplimient del cliente
const asignarPuntosPorCumplimiento = async (
  idCredito
) => {
  try {
    const queryCredito = `
      SELECT
        cumplimiento,
        monto,
        idCliente
      FROM creditos
      WHERE idCredito = ?
    `;
    const rows = await queryAsync(
      queryCredito,
      [idCredito]
    );
    const result = rows[0];
    if (!result) {
      return;
    }
    const {
      cumplimiento,
      monto,
      idCliente
    } = result;
    if (
      !['Excelente', 'Bueno']
        .includes(cumplimiento)
    ) {
      return;
    }
    const porcentaje =
      cumplimiento === 'Excelente'
        ? 0.05
        : 0.025;
    const puntosGanados =
      Math.round(monto * porcentaje);
    //Actualiz apuntos
    const queryPuntos = `
      UPDATE clientes
      SET puntos =
        IFNULL(puntos, 0) + ?
      WHERE idCliente = ?
    `;
    await queryAsync(queryPuntos, [
      puntosGanados,
      idCliente
    ]);
    console.log(
      `Cliente ${idCliente} ganó ${puntosGanados} puntos por cumplimiento ${cumplimiento}`
    );
  } catch (error) {
    console.error(
      'Error al asignar puntos:',
      error
    );
  }
};

module.exports = {
   getClientsFromZone,
  calcularPagos,
  calcularEstadoDePagosOrdenado,
  registrarPagos,
  actualizarPago,
  actualizarCreditoAPagado,
  actualizarEstadosAtrasos,
  actualizarEstadosAdelantos,
  actualizarEstadosFalla,
  actualizarClasificacionCredito,
  asignarPuntosPorCumplimiento
};
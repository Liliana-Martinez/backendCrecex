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


//Orquestador de registro de pagos 
const registrarPagos = async (pagos) => {
  try {
    for (const pago of pagos) {
      const datosPago =
        prepararDatosPago(pago);
      const {
        idCredito,
        payment: montoInicial,
        lateFees: recargoExtra,
        paymentType
      } = datosPago;
      let monto =
        montoInicial;
      if (!idCredito) {
        continue;
      }
      const semanas =
        await obtenerSemanasCredito(idCredito);
      if (!semanas.length) {
        continue;
      }
      const {sabadoActual,semanaActual,pagoConAdeudo} = prepararContextoPago(
        semanas
      );
      // Si el registro viene vacío, ignorarlo
      if (esRegistroVacio(monto,recargoExtra,paymentType)) {
        continue;
      }
      // Solo cambia tipo de pago
      if (
        await procesarCambioTipoPago(
          idCredito,
          monto,
          recargoExtra,
          paymentType,
          semanaActual
        )
      ) {
        continue;
      }

      // Pago de adeudo de la semana actual
      if (
        await procesarAdeudo(
          idCredito,
          monto,
          paymentType,
          semanaActual,
          pagoConAdeudo
        )
      ) {
        continue;
      }

      // Registrar recargos
      await registrarRecargo(datosPago,semanaActual,pagoConAdeudo);
      // Semana actual
      monto =
        await procesarSemanaActual(monto,paymentType,semanas,sabadoActual);
      // Atrasos
      monto =
        await procesarAtrasos(monto,paymentType,semanas);
      // Adelantos
      monto =
        await procesarAdelantos(monto,paymentType,montoInicial,semanas,sabadoActual,semanaActual);
      // Verificar si el crédito terminó
      const pendientes =
        await obtenerPendientesCredito(idCredito);
      if (pendientes === 0) {
        await actualizarCreditoAPagado(idCredito);
        await asignarPuntosPorCumplimiento(idCredito);
      }
      await actualizarClasificacionCredito(idCredito);
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
//Funciones de registrar pagos
const prepararDatosPago = (pago) => {
  const {idCredito,payment = 0,lateFees = 0,paymentType = 'efectivo'} = pago;
  return {
    idCredito,
    payment: Number(payment) || 0,
    lateFees: Number(lateFees) || 0,
    paymentType
  };
};
const prepararContextoPago = (semanas) => {
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
  const pagoConAdeudo =
    semanas.find(
      s => Number(s.adeudo || 0) > 0
    );
  return {
    sabadoActual,
    semanaActual,
    pagoConAdeudo
  };
};
const esRegistroVacio = (monto,recargoExtra,paymentType) => {
  return (
    monto <= 0 &&
    recargoExtra <= 0 &&
    (!paymentType ||
      paymentType.trim() === '')
  );
};
const procesarCambioTipoPago = async (idCredito,monto,recargoExtra,paymentType,semanaActual) => {
  // Si hay monto o recargo, debe continuar con el procesamiento normal
  if (monto > 0 ||recargoExtra > 0 ||!paymentType) {
    return false;
  }
  if (semanaActual) {
    await actualizarTipoPago(
      semanaActual.idPago,
      paymentType
    );
  }
  await actualizarClasificacionCredito(idCredito);
  return true;
};
const procesarAdeudo = async (idCredito,monto,paymentType,semanaActual,pagoConAdeudo) => {
  const semanaAdeudo =semanaActual || pagoConAdeudo;
  if (paymentType !== 'pagado' ||!semanaAdeudo ||Number(semanaAdeudo.adeudo || 0) <= 0) {
    return false;
  }
  console.log('ENTRO A PAGAR ADEUDO');
  console.log('Pago con adeudo:',
    {
      idPago: semanaAdeudo.idPago,
      adeudo: semanaAdeudo.adeudo,
      tipoPago: semanaAdeudo.tipoPago
    }
  );
  const adeudoActual =Number(semanaAdeudo.adeudo || 0);
  const nuevoAdeudo =Math.max(0,adeudoActual - monto);
  const tipoPagoFinal =
    nuevoAdeudo === 0
      ? 'pagado'
      : semanaAdeudo.tipoPago;
  console.log({
    adeudoActual,
    montoPagado: monto,
    nuevoAdeudo,
    tipoPagoFinal
  });
  const resultado =
    await queryAsync(
      `
      UPDATE pagos
      SET adeudo = ?,
          tipoPago = ?
      WHERE idPago = ?
      `,
      [
        nuevoAdeudo,
        tipoPagoFinal,
        semanaAdeudo.idPago
      ]
    );
  console.log(
    'Resultado UPDATE:',
    resultado
  );

  await actualizarClasificacionCredito(idCredito);
  return true;
};
const registrarRecargo = async (datosPago,semanaActual,pagoConAdeudo) => {
  const {payment,lateFees,paymentType} = datosPago;
  const semanaRecargo =semanaActual || pagoConAdeudo;
  if (!semanaRecargo) {
    return;
  }
  await actualizarPago(
    semanaRecargo.idPago,
    semanaRecargo.cantidadPagada,
    semanaRecargo.estado,
    lateFees,
    paymentType,
    payment + lateFees,
    true
  );
};
const procesarSemanaActual = async (monto,paymentType,semanas,sabadoActual) => {
  for (const semana of semanas) {
    if (monto <= 0) {
      break;
    }
    const fecha =normalizarFecha(semana.fechaEsperada);
    const esActual = fecha.getTime() ===sabadoActual.getTime();
    if (esActual &&['pendiente','falla','incompleto'].includes( semana.estado)) {
      const restante =
        Number(semana.cantidad) -
        Number(semana.cantidadPagada || 0);
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

  return monto;
};
const procesarAtrasos = async (monto,paymentType,semanas) => {
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
      const pagoAplicado = restante;
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
      const pagoAplicado = monto;
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
  return monto;
};
const procesarAdelantos = async (monto,paymentType,payment,semanas,sabadoActual,semanaActual) => {
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
    const pagado = Number(semana.cantidadPagada || 0);
    const esperado =
      Number(semana.cantidad);
    const restante = esperado - pagado;
    if (['pendiente','adelantadoIncompleto'].includes(
        semana.estado)
    ) {
      if (monto >= restante) {
        await actualizarPago(
          semana.idPago,
          esperado,
          'adelantado',
          0,
          paymentType,
          semanaActual
            ? 0
            : payment,
          !semanaActual
        );
        monto -= restante;
      } else {
        await actualizarPago(
          semana.idPago,
          pagado + monto,
          'adelantadoIncompleto',
          0,
          paymentType,
          semanaActual
            ? 0
            : payment,
          !semanaActual
        );
        monto = 0;
      }
    }
  }
  return monto;
};
//Hasta aqui son sus funciones de registrar pagos 



//Orquestador de getCollectionRaate
const getCollectionRate = async (idZona) => {
  try {
    const {startDate,endDate} = obtenerPeriodoCobranza();
    const sumAmount =
      await obtenerMontoEsperadoCobranza(idZona,startDate,endDate);
    const {amountPaid,extras} = await obtenerMontoCobrado(
      idZona,
      startDate,
      endDate
    );
    const sumAmountPaid =amountPaid + extras;
    console.log('Cobranza:', {
      startDate,
      endDate,
      sumAmount,
      amountPaid,
      extras,
      sumAmountPaid
    });
    return {
      sumAmount,
      sumAmountPaid
    };
  } catch (error) {
    console.log(
      'Error al obtener sumas de cobranza.',
      error
    );
    throw error;
  }
};
//Funciones de getCollectionRate
const obtenerPeriodoCobranza = () => {
  const startDate = obtenerSabadoAnterior()
    .toISOString()
    .split('T')[0];
  const endDate = obtenerSiguienteSabado()
    .toISOString()
    .split('T')[0];
  return {
    startDate,
    endDate
  };
};
const obtenerMontoEsperadoCobranza = async (idZona,startDate,endDate) => {
  const query = `
    SELECT SUM(p.cantidad) AS totalCantidad
    FROM pagos p
    INNER JOIN creditos c ON p.idCredito = c.idCredito
    INNER JOIN clientes cl ON c.idCliente = cl.idCliente
    WHERE 
      c.estado IN ('activo','pagado')
      AND cl.idZona = ?
      AND p.estado NOT IN ('adelantado', 'adelantadoIncompleto')
      AND p.fechaEsperada >= ?
      AND p.fechaEsperada < ?
  `;
  const result = await queryAsync(
    query,
    [idZona,startDate,endDate]
  );
  return Number(
    result?.[0]?.totalCantidad ?? 0
  );
};
const obtenerMontoCobrado = async (idZona,startDate,endDate) => {
  const query = `
    SELECT 
      SUM(
        CASE 
          WHEN p.estado IN (
            'pagado',
            'incompleto',
            'adelantadoIncompleto'
          )
          THEN p.cantidadPagada
          ELSE 0
        END
      ) AS totalPagado,
      SUM(
        CASE 
          WHEN p.estado IN (
            'atraso',
            'pagadoAtrasado'
          )
          THEN p.extras
          ELSE 0
        END
      ) AS totalExtras
    FROM pagos p
    INNER JOIN creditos c
      ON p.idCredito = c.idCredito
    INNER JOIN clientes cl
      ON c.idCliente = cl.idCliente

    WHERE 
      c.estado IN ('activo','pagado')
      AND cl.idZona = ?
      AND ((p.estado IN ('pagado','incompleto','adelantadoIncompleto')
          AND p.fechaEsperada >= ?
          AND p.fechaEsperada < ?
        )
        OR (p.estado IN (atraso','pagadoAtrasado')
          AND p.fechaPagada >= ?
          AND p.fechaPagada < ?
        )
      )
  `;
  const result = await queryAsync(
    query,
    [idZona,startDate,endDate,startDate,endDate]
  );
  return {
    amountPaid: Number(
      result?.[0]?.totalPagado ?? 0
    ),
    extras: Number(
      result?.[0]?.totalExtras ?? 0
    )
  };
};
//Hasta aqui son funcioes de getCollectionRate


// Orquestador getClientsFromZone Trae los datos de los clientes por zona
const getClientsFromZone = async (idZona) => {
  console.log('ID en el controller:', idZona);
  const fechaEsperada = obtenerSabadoAnterior()
    .toISOString()
    .split('T')[0];
  const fechaSiguienteSemana = obtenerSiguienteSabado()
    .toISOString()
    .split('T')[0];
  try {
    const results = await obtenerClientesDeZona(idZona,fechaEsperada);
    if (!results || results.length === 0) {
      return null;
    }
    const {
      codigoZona,
      promotor
    } = results[0];
    const clientes = await calcularPagos(results,fechaEsperada);
    let collectionRate = {
      sumAmount: 0,
      sumAmountPaid: 0
    };
    try {
      const result = await getCollectionRate(
        idZona
      );
      collectionRate = {
        sumAmount:
          result?.sumAmount ?? 0,

        sumAmountPaid:
          result?.sumAmountPaid ?? 0
      };
    } catch (error) {
      console.error(
        'Error al calcular collectionRate:',
        error
      );
    }
    return {
      codigoZona,
      promotor,
      fechaSiguienteSemana,
      clientes,
      collectionRate
    };
  } catch (error) {
    console.error(
      'Error procesando clientes:',
      error
    );
    throw error;
  }
};
//Funciones de getClientesFromZone
const obtenerClientesDeZona = (idZona,fechaEsperada) => {
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
      AND cr.estado IN ('Activo', 'Vencido')
    `;
    db.query(
      query,
      [fechaEsperada, idZona],
      (error, results) => {
        if (error) {
          return reject(error);
        }
        resolve(results);
      }
    );
  });
};
async function calcularPagos(clientes,fechaEsperada) {
  const results = await Promise.all(
    clientes.map(cliente => {
      return new Promise((resolve, reject) => {
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
          (err, pagos) => {
            if (err) {
              return reject(err);
            }
            const {
              atraso,
              adelanto,
              falla
            } = calcularEstadoDePagosOrdenado(pagos,fechaEsperada);
            let adeudo = null;
            const pagoConAdeudo = pagos.find(
              p => Number(p.adeudo || 0) > 0
            );
            if (pagoConAdeudo) {
              adeudo = pagoConAdeudo.adeudo;
            }
            resolve({
              ...cliente,
              numeroCreditos:
                cliente.tipoCredito?.toLowerCase() === 'adicional'
                  ? 'AD'
                  : cliente.numeroCreditos,
              adeudo,
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
//Hasta aqui gunciones de getClientsFromZone

//Funciones generales
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
//Acaban funciones generales

// Obtener semanas/pagos de un crédito
async function obtenerSemanasCredito(idCredito) {
  try {
    const query = `
      SELECT *
      FROM pagos
      WHERE idCredito = ?
      ORDER BY numeroSemana ASC
    `;
    return await queryAsync(query, [idCredito]);
  } catch (error) {
    console.error('Error al obtener semanas del crédito:', error);
    throw error;
  }
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
async function actualizarTipoPago(idPago,paymentType) {
  const query = `
    UPDATE pagos
    SET tipoPago = ?,
        fechaPagada = CURDATE()
    WHERE idPago = ?
  `;
  return await queryAsync(query, [
    paymentType,
    idPago
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
function calcularEstadoDePagosOrdenado(pagos,fechaReferencia) {
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
    if (estado === 'falla' ||estado === 'incompleto') {
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
//Actualizacion de estados de los pagos
const actualizarPago = async (idPago,cantidadPagada,nuevoEstado,recargoExtra = 0,tipoPago = 'efectivo',adeudoRecibido = 0,esSemanaActual = false,extra = 0) => {
  try {
    const pagoActual =
      await obtenerPagoPorId(idPago);
    if (!pagoActual) {
      throw new Error('Pago no encontrado');
    }
    const adeudoActual =Number(pagoActual.adeudo || 0);
    const recargoActual =Number(pagoActual.recargos || 0);
    const extrasActual =Number(pagoActual.extras || 0);
    const fechaPagadaActual =pagoActual.fechaPagada;
    const nuevoRecargo =recargoActual + recargoExtra;
    let nuevoAdeudo =adeudoActual;
    let nuevoExtra =extrasActual;
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

    if (tipoPago === 'efectivo' &&esSemanaActual) {
      nuevoAdeudo =
        adeudoActual +
        Number(adeudoRecibido || 0);
    }
    //  Si llega vacío o null, conserva el tipo de pago actual
    const tipoPagoFinal =
      tipoPago && tipoPago.trim() !== ''
        ? tipoPago
        : pagoActual.tipoPago;
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
    const params = [cantidadPagada,nuevoEstado,nuevoRecargo,tipoPagoFinal,nuevoAdeudo,nuevoExtra,idPago];
    console.log({
      idPago,
      tipoPago: tipoPagoFinal,
      cantidadPagada,
      nuevoEstado,
      nuevoAdeudo
    });
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
const actualizarCreditoAPagado = async (idCredito) => {
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
      AND estado IN ('falla','incompleto')
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
    sabadoAnterior.setHours(0,0,0,0);
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
      AND (estado = 'pendiente'OR estado = 'incompleto')
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
const actualizarClasificacionCredito = async (idCredito) => {
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
    else if (fallas >= 3 && fallas <= 4) {
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
const asignarPuntosPorCumplimiento = async (idCredito) => {
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
    if (!['Excelente', 'Bueno'].includes(cumplimiento)) {
      return;
    }
    const porcentaje =
      cumplimiento === 'Excelente'
        ? 0.03
        : 0.015;
    const puntosGanados = Math.round(monto * porcentaje);
    //Actualiz apuntos
    const queryPuntos = `UPDATE clientes
      SET puntos =IFNULL(puntos, 0) + ?
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
// Maneja los creditos vencidos

const procesarCreditosVencidos = async () => {
  try {
    const hoy = normalizarFecha(new Date());
    console.log('PROCESANDO CRÉDITOS VENCIDOS');
    console.log('Fecha de proceso:',formatearFechaSQL(hoy));
    
    //Activo a vencido
    const creditosParaVencer =
      await queryAsync(
        `
        SELECT
          idCredito,
          fechaVencimiento,
          semanas
        FROM creditos
        WHERE LOWER(estado) = 'activo'
          AND fechaVencimiento < ?
        `,
        [
          formatearFechaSQL(hoy)
        ]
      );
    console.log('Créditos que pueden pasar a vencido:',creditosParaVencer.length);
    for (const credito of creditosParaVencer) {
      await queryAsync(
        `
        UPDATE creditos
        SET estado = 'vencido'
        WHERE idCredito = ?
          AND LOWER(estado) = 'activo'
        `,
        [credito.idCredito]
      );
      console.log(`Crédito ${credito.idCredito} → VENCIDO`);
    }
    //Agregar semana extra una vez que el credito esta vencido
    const creditosVencidos =
      await queryAsync(
        `
        SELECT
          idCredito,
          semanas,
          abonoSemanal,
          fechaVencimiento
        FROM creditos
        WHERE LOWER(estado) = 'vencido'
        `
      );
    console.log('Créditos actualmente vencidos:',creditosVencidos.length);
    for (const credito of creditosVencidos) {
      const semanasActuales =
        Number(credito.semanas);
      console.log('CRÉDITO VENCIDO:',{
          idCredito:
            credito.idCredito,
          semanas:
            semanasActuales,
          fechaVencimiento:
            credito.fechaVencimiento,
          abonoSemanal:
            credito.abonoSemanal
        }
      );
      //Verifica si ya se le habia o no agregado semana extr
      if (semanasActuales !== 12 &&semanasActuales !== 16) {
        console.log(
          `Crédito ${credito.idCredito}: ` +
          `ya tiene ${semanasActuales} semanas, ` +
          `no se agrega otra.`
        );
        continue;
      }
      const fechaVencimiento =normalizarFecha(credito.fechaVencimiento);
      const fechaProcesarSemanaExtra =
        new Date(fechaVencimiento);
      fechaProcesarSemanaExtra.setDate(
        fechaProcesarSemanaExtra.getDate() + 12
      );
      console.log('VALIDANDO SEMANA EXTRA:',{
          idCredito:
            credito.idCredito,
          semanasActuales,
          hoy:
            formatearFechaSQL(hoy),
          fechaVencimiento:
            formatearFechaSQL(
              fechaVencimiento
            ),
          fechaProcesarSemanaExtra:
            formatearFechaSQL(
              fechaProcesarSemanaExtra
            )
        }
      );

      if (hoy <fechaProcesarSemanaExtra) {
        console.log(`Crédito ${credito.idCredito}: ` +`todavía no corresponde agregar semana.`);
        continue;
      }

      const numeroSemanaExtra =
        semanasActuales + 1;
      const pagoExistente =
        await queryAsync(
          `
          SELECT idPago
          FROM pagos
          WHERE idCredito = ?
            AND numeroSemana = ?
          LIMIT 1
          `,
          [
            credito.idCredito,
            numeroSemanaExtra
          ]
        );

      if (pagoExistente &&pagoExistente.length > 0) {
        console.log(`Crédito ${credito.idCredito}: ` +
          `el pago de la semana ${numeroSemanaExtra} ` +
          `ya existe.`
        );
        await queryAsync(
          `
          UPDATE creditos
          SET semanas = ?
          WHERE idCredito = ?
            AND LOWER(estado) = 'vencido'
          `,
          [numeroSemanaExtra,credito.idCredito]
        );
        continue;
      }
      const fechaSemanaExtra =
        new Date(fechaVencimiento);
      fechaSemanaExtra.setDate(fechaSemanaExtra.getDate() + 7);
      console.log('CREANDO SEMANA EXTRA:',
        {
          idCredito:
            credito.idCredito,

          numeroSemana:
            numeroSemanaExtra,

          cantidad:
            credito.abonoSemanal,

          fechaEsperada:
            formatearFechaSQL(
              fechaSemanaExtra
            )
        }
      );
      await crearPagoSemanaExtra(
        credito.idCredito,
        numeroSemanaExtra,
        credito.abonoSemanal,
        fechaSemanaExtra
      );
      await queryAsync(
        `
        UPDATE creditos
        SET semanas = ?
        WHERE idCredito = ?
          AND LOWER(estado) = 'vencido'
        `,
        [numeroSemanaExtra,credito.idCredito]
      );
      console.log(`Crédito ${credito.idCredito}: ` +`${semanasActuales} → ${numeroSemanaExtra}`);
    }


    //Al pasar 4 meses sale de la lista de la promotora y se cambia a estado cobranza
    const creditosParaCobranza =
      await queryAsync(
        `
        SELECT
          idCredito,
          fechaVencimiento
        FROM creditos
        WHERE LOWER(estado) = 'vencido'
        `
      );
    console.log('Créditos a revisar para cobranza:',creditosParaCobranza.length);
    for (const credito of creditosParaCobranza) {
      const fechaVencimiento =normalizarFecha(credito.fechaVencimiento);
      const fechaCobranza =new Date(fechaVencimiento);
      fechaCobranza.setMonth(
        fechaCobranza.getMonth() + 4
      );
      console.log('VALIDANDO COBRANZA:',{
          idCredito:
           credito.idCredito,
          fechaVencimiento:
            formatearFechaSQL(
              fechaVencimiento
            ),
          fechaCobranza:
            formatearFechaSQL(
              fechaCobranza
            ),

          hoy:
            formatearFechaSQL(hoy)
        }
      );
      if (hoy >=fechaCobranza) {
        await queryAsync(
          `
          UPDATE creditos
          SET estado = 'cobranza'
          WHERE idCredito = ?
            AND LOWER(estado) = 'vencido'
          `,
          [credito.idCredito]
        );
        console.log(`Crédito ${credito.idCredito} → COBRANZA`);
      }
    }
    console.log('PROCESAMIENTO DE CRÉDITOS TERMINADO');
    return {
      success: true,
      message:
        'Créditos vencidos procesados correctamente'
    };
  } catch (error) {
    console.error(
      'Error procesando créditos vencidos:',
      error
    );
    return {
      success: false,
      message:
        'Error al procesar créditos vencidos'
    };
  }
};
const crearPagoSemanaExtra = async (idCredito,numeroSemana,cantidad,fechaEsperada) => {
  const query = `
    INSERT INTO pagos
    (
      idCredito,
      numeroSemana,
      cantidad,
      fechaEsperada,
      cantidadPagada,
      estado
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  await queryAsync(
    query,
    [
      idCredito,
      numeroSemana,
      cantidad,
      formatearFechaSQL(
        fechaEsperada
      ),
      0,
      'atraso'
    ]
  );
};
const formatearFechaSQL = (fecha) => {
  const año =fecha.getFullYear();
  const mes =String(fecha.getMonth() + 1).padStart(2, '0');
  const dia =String(fecha.getDate()).padStart(2, '0');
  return `${año}-${mes}-${dia}`;
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
  asignarPuntosPorCumplimiento,
  procesarCreditosVencidos
};
const db = require('../db');

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
const registrarPagos = async (pagos) => {
  try {
    for (const pago of pagos) {
      const { idCredito, payment } = pago;
      let monto = Number(payment);

      if (!idCredito || isNaN(monto) || monto <= 0) continue;

      // Obtener semanas del crédito
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
      hoySábado.setDate(hoy.getDate() - hoy.getDay() + 6); // siguiente sábado

      for (const semana of semanas) {
        if (monto <= 0) break;

        const { idPago, cantidad, cantidadPagada, estado, fechaEsperada } = semana;
        const cantidadEsperada = Number(cantidad);
        const pagado = Number(cantidadPagada) || 0;
        const restante = cantidadEsperada - pagado;

        const fechaSemana = new Date(fechaEsperada);
        const esSemanaActualOPasada = fechaSemana <= hoySábado;

        // 1. Prioridad: Incompleto
        if (estado === 'incompleto' && restante > 0) {
          if (monto >= restante) {
            await actualizarPago(idPago, cantidadEsperada, 'pagadoAtrasado');
            monto -= restante;
          } else {
            await actualizarPago(idPago, pagado + monto, 'incompleto');
            monto = 0;
          }
          continue;
        }

        // 2. Semanas en estado adelanto parcial
        if (estado === 'adelanto' && restante > 0) {
          if (monto >= restante) {
            const nuevoPagado = pagado + restante;
            const nuevoEstado = esSemanaActualOPasada ? 'pagado' : 'adelanto';
            await actualizarPago(idPago, nuevoPagado, nuevoEstado);
            monto -= restante;
          } else {
            await actualizarPago(idPago, pagado + monto, 'adelanto');
            monto = 0;
          }
          continue;
        }

        // 3. Semanas pendientes actuales
        if (estado === 'pendiente') {
          if (monto >= cantidadEsperada) {
            const nuevoEstado = esSemanaActualOPasada ? 'pagado' : 'adelanto';
            await actualizarPago(idPago, cantidadEsperada, nuevoEstado);
            monto -= cantidadEsperada;
          } else {
            const nuevoEstado = esSemanaActualOPasada ? 'incompleto' : 'adelanto';
            await actualizarPago(idPago, monto, nuevoEstado);
            monto = 0;
          }
          continue;
        }

        // 4. Si ya está pagado o pagadoAtrasado, ignoramos
        if (estado === 'pagado' || estado === 'pagadoAtrasado') {
          continue;
        }
      }
    }

    return { success: true, message: 'Pagos registrados correctamente' };
  } catch (error) {
    console.error('Error al registrar pagos:', error);
    return { success: false, message: 'Error al registrar pagos', error };
  }
};

// Función auxiliar
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



module.exports = {
  getClientsFromZone,
  calcularPagos, 
  calcularEstadoDePagosOrdenado, 
  registrarPagos, 
  actualizarPago
};

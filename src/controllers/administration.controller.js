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
//Verifica que no haya pagos en los creditos
const validarCancelacionCredito = async (idCredito) => {
    const pagos = await queryAsync(
        `
        SELECT idPago
        FROM pagos
        WHERE idCredito = ?
        AND cantidadPagada > 0
        LIMIT 1
        `,
        [idCredito]
    );
    if (pagos.length > 0) {
        throw new Error(
            'No es posible cancelar el crédito porque ya tiene pagos registrados.'
        );
    }
};
//Actualiza el estado de los pagos cuadndo se cancela el credito
const cancelarPagos = async (idCredito) => {
    await queryAsync(
        `
        UPDATE pagos
        SET estado = 'Cancelado'
        WHERE idCredito = ?
        `,
        [idCredito]
    );
};
//Actualiza el monto o semanas del credito
const updateCredit = async (req, res) => {
    try {

        const { idCredito, monto, semanas } = req.body;

        console.log('1. Obtener crédito');

        const credito = await obtenerCredito(idCredito);


        console.log('2. Validar modificación');

        await validarModificacionCredito(idCredito);


        console.log('3. Calcular abono');

        const abonoSemanal = calcularAbonoSemanal(
            monto,
            semanas
        );


        console.log('4. Actualizar pagos');

        await actualizarPagos(
            credito,
            monto,
            semanas,
            abonoSemanal
        );


        console.log('5. Obtener fecha vencimiento');

        const fechaVencimiento = await obtenerFechaVencimiento(
            idCredito
        );


        console.log('6. Actualizar crédito');

        await actualizarCredito(
            idCredito,
            monto,
            semanas,
            abonoSemanal,
            fechaVencimiento
        );


        console.log('Crédito actualizado correctamente');


        res.json({
            success: true,
            message: 'Crédito actualizado correctamente'
        });


    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            message: error.message
        });

    }
};
//Trae los datos del credito
const obtenerCredito = async (idCredito) => {
    const query = `
        SELECT
            idCredito,
            monto,
            semanas,
            abonoSemanal,
            fechaEntrega,
            fechaVencimiento
        FROM creditos
        WHERE idCredito = ?
    `;
    const creditos = await queryAsync(query, [idCredito]);
    if (!creditos.length) {
        throw new Error('El crédito no existe.');
    }
    return creditos[0];
};
//Verifica que no haya semana pagada, ya que solo se podra modificar si es nuevo el credito 
const validarModificacionCredito = async (idCredito) => {
    const query = `
        SELECT idPago
        FROM pagos
        WHERE idCredito = ?
        AND cantidadPagada > 0
        LIMIT 1
    `;
    const pagos = await queryAsync(query, [idCredito]);

    if (pagos.length > 0) {
        throw new Error(
            'No es posible modificar el crédito porque ya tiene pagos registrados.'
        );
    }
};
//Calcula el nuevo abono semanal que tendra el credit
const calcularAbonoSemanal = (monto,semanas) => {
    const montoNum = Number(monto);
    const semanasInt = Number(semanas);
    let factor;
    if (semanasInt === 12) {
        factor = 1.5;
    } else if (semanasInt === 16) {
        factor = 1.583;
    } else {
        throw new Error(
            'Solo se permiten créditos de 12 o 16 semanas'
        );
    }
    const totalAPagar = montoNum * factor;
    const abonoSemanal = Math.round(
        totalAPagar / semanasInt
    );
    return abonoSemanal;
};
//Actualiza el credito modificando, monto,semans, abonoSemanal y fecha veniciemt
const actualizarCredito = async (idCredito,monto,semanas,abonoSemanal,fechaVencimiento) => {
    const query = `
        UPDATE creditos
        SET
            monto = ?,
            semanas = ?,
            abonoSemanal = ?,
            fechaVencimiento = ?
        WHERE idCredito = ?
    `;
    await queryAsync(query, [
        monto,
        semanas,
        abonoSemanal,
        fechaVencimiento,
        idCredito
    ]);
};
//Actualiza si se cambia de 12 a 16 o de 16 a 12Semanas
const actualizarPagos = async (creditoAnterior,monto,semanas,abonoSemanal) => {
    const semanasNuevas = Number(semanas);
    const semanasActuales = Number(creditoAnterior.semanas);
    // Solo cambió el monto
    if (semanasActuales === semanasNuevas) {
        await actualizarCantidadPagos(
            creditoAnterior.idCredito,
            abonoSemanal
        );
        return;
    }
    // 12 -> 16 semanas
    if (
        semanasActuales === 12 &&
        semanasNuevas === 16
    ) {
        await actualizarCantidadPagos(
            creditoAnterior.idCredito,
            abonoSemanal
        );
        await agregarSemanas(
            creditoAnterior,
            abonoSemanal
        );
        return;
    }
    // 16 -> 12 semanas
    if (
        semanasActuales === 16 &&
        semanasNuevas === 12
    ) {
        await actualizarCantidadPagos(
            creditoAnterior.idCredito,
            abonoSemanal
        );
        await eliminarSemanasExtra(
            creditoAnterior.idCredito
        );
    }
};
//Calcular la fecha Vencimiento
const obtenerFechaVencimiento = async (idCredito) => {

    const query = `
        SELECT fechaEsperada
        FROM pagos
        WHERE idCredito = ?
        ORDER BY numeroSemana DESC
        LIMIT 1
    `;

    const result = await queryAsync(query, [idCredito]);

    if (!result.length) {
        throw new Error('No se encontró la última fecha de pago.');
    }

    return result[0].fechaEsperada;
};
//Actualiza cantidad pagada de todos los pagos del credito
const actualizarCantidadPagos = async (idCredito,abonoSemanal) => {
    const query = `
        UPDATE pagos
        SET cantidad = ?
        WHERE idCredito = ?
    `;
    await queryAsync(query, [
        abonoSemanal,
        idCredito
    ]);
};
//De las fechas que ya se habian creado las demanas agregan las faltantes ejem: de 12 pasa a 16 semanas
const agregarSemanas = async (credito,abonoSemanal) => {
    const pagosValues = [];
    // La semana 12 ya existe, obtenemos su fechaEsperada
    const [ultimoPago] = await queryAsync(`
        SELECT fechaEsperada
        FROM pagos
        WHERE idCredito = ?
        AND numeroSemana = 12
    `, [credito.idCredito]);

    if (!ultimoPago) {
        throw new Error('No se encontró la semana 12.');
    }
    const fechaBase = new Date(ultimoPago.fechaEsperada);
    for (let i = 13; i <= 16; i++) {

        fechaBase.setDate(fechaBase.getDate() + 7);

        const fechaPago = fechaBase
            .toISOString()
            .split('T')[0];

        pagosValues.push(
            `(${credito.idCredito},
              ${i},
              ${abonoSemanal},
              '${fechaPago}',
              NULL,
              'Pendiente')`
        );
    }
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
        VALUES
        ${pagosValues.join(',')}
    `;

    await queryAsync(query);

};
//Se eliminan semanas si el credito era de 16 y pasa a 12
const eliminarSemanasExtra = async (
    idCredito
) => {

    const query = `
        DELETE FROM pagos
        WHERE idCredito = ?
        AND numeroSemana > 12
    `;

    await queryAsync(query, [idCredito]);

};



//Cuando cancela el credito
const cancelCredit = async (req, res) => {
    try {
        const { idCredito } = req.body;
        if (!idCredito) {
            return res.status(400).json({
                message: 'El id del crédito es obligatorio.'
            });
        }
        // Validar que no tenga pagos realizados
        await validarCancelacionCredito(idCredito);

        // Cancelar crédito
        await queryAsync(
            `
            UPDATE creditos
            SET estado = 'Cancelado'
            WHERE idCredito = ?
            `,
            [idCredito]
        );

        // Cancelar pagos relacionados
        await queryAsync(
        `
            UPDATE pagos
            SET estado = 'Cancelado'
            WHERE idCredito = ?
            `,
            [idCredito]
        );
        res.json({
            message: 'Crédito cancelado correctamente.'
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: error.message
        });
    }
};


module.exports = {
    updateCredit,
    cancelCredit
};
const db = require('../db');
const TABLE_CREDITOS = 'creditos';
const TABLE_PAGOS = 'pagos';
//Valida que tenga los datos necesarios 
const validarDatosCredito = ({idCliente,monto,semanas,horarioEntrega}) => {
    if (!idCliente || !monto || !semanas || !horarioEntrega) {
        throw new Error(
            'Faltan datos obligatorios para registrar el crédito'
        );
    }
};
//Calcula el prmer sabado, calcula fecha de vencimiento
const prepararDatosCredito = ({monto,semanas,recargos = 0,atrasos = 0}) => {
    const hoy = new Date();
    const primerSábadoSiguiente =
        new Date(hoy);
    const diasHastaSábado =
        (6 - hoy.getDay() + 7) % 7;
    primerSábadoSiguiente.setDate(
        hoy.getDate() + diasHastaSábado
    );
    const semanasInt =
        parseInt(semanas, 10);
    const fechaVencimiento =
        new Date(primerSábadoSiguiente);
    fechaVencimiento.setDate(
        primerSábadoSiguiente.getDate() +
        semanasInt * 7
    );
    const fechaVencimientoF =
        fechaVencimiento
            .toISOString()
            .split('T')[0];
    const montoNum =
        Number(monto);
    const recargosNum =
        Number(recargos || 0);
    const atrasosNum =
        Number(atrasos || 0);
    return {
        hoy,
        primerSábadoSiguiente,
        semanasInt,
        fechaVencimientoF,
        montoNum,
        recargosNum,
        atrasosNum
    };
};
//Obtiene la clasificacion
const obtenerClasificacionCliente = (idCliente) => {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT clasificacion
            FROM clientes
            WHERE idCliente = ?
        `;
        db.query(
            query,
            [idCliente],
            (err, result) => {
                if (err) {
                    return reject(err);
                }
                if (result.length === 0) {
                    return resolve(null);
                }
                resolve(
                    result[0].clasificacion.toUpperCase()
                );
            }
        );
    });
};
//Valida los montos correspondan a la clasificacion
const validarCreditoPorClasificacion = (clasificacion,semanasInt,montoNum,totalPropuesto = montoNum) => {
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
    let validacionCorrecta = false;
    switch (clasificacion) {
        case 'D':
            if (semanasInt === 12 &&totalPropuesto <= 2000) {
                validacionCorrecta = true;
            }
            break;
        case 'C':
            if ((semanasInt === 12 && totalPropuesto <= 4000) ||(semanasInt === 16 && totalPropuesto <= 5000)) {
                validacionCorrecta = true;
            }
            break;
        case 'B':
            if ((semanasInt === 12 && totalPropuesto <= 6000) ||(semanasInt === 16 && totalPropuesto <= 7500)) {
                validacionCorrecta = true;
            }
            break;
        case 'A':
            if ((semanasInt === 12 || semanasInt === 16) &&montoNum > 0) {
                validacionCorrecta = true;
            }
            break;
        default:
            throw new Error(
                'Clasificación del cliente no válida'
            );
    }
    if (!validacionCorrecta) {
        throw new Error(
            'El monto no cumple con las condiciones de la clasificación'
        );
    }
    //Monto minimo para creditos
    if (semanasInt === 12 &&montoNum < 2000) {
        throw new Error(
            'El monto mínimo para 12 semanas es de $2000'
        );
    }
    if (semanasInt === 16 &&montoNum < 4000) {
        throw new Error(
            'El monto mínimo para 16 semanas es de $4000'
        );
    }
    return factor;
};
//Inserta los creditos  a la BD
const insertarCredito = ({
    idCliente,
    montoNum,
    semanasInt,
    horarioEntrega,
    fechaVencimientoF,
    recargosNum,
    atrasosNum,
    abonoSemanal,
    efectivo,
    tipoCredito}) => {
    return new Promise((resolve, reject) => {
        const insertQuery = `
            INSERT INTO ${TABLE_CREDITOS}
            (
                idCliente,
                monto,
                semanas,
                horarioEntrega,
                fechaEntrega,
                fechaVencimiento,
                recargos,
                atrasos,
                abonoSemanal,
                estado,
                tipoCredito,
                efectivo
            )
            VALUES (?,?,?,?,NOW(),?,?,?,?,'Activo',?,?)
        `;
        db.query(
            insertQuery,
            [
                idCliente,
                montoNum,
                semanasInt,
                horarioEntrega,
                fechaVencimientoF,
                recargosNum,
                atrasosNum,
                abonoSemanal,
                tipoCredito,
                efectivo
            ],
            (err, result) => {
                if (err) {
                    return reject(err);
                }
                resolve(result.insertId);
            }
        );
    });
};
//gENERA Y GUARDA REFERENCIA
const generarYGuardarReferencia = async (idCliente,idCredito,fecha) => {
    const yyyy =fecha.getFullYear();
    const mm =String(fecha.getMonth() + 1).padStart(2, '0');
    const dd =String(fecha.getDate()).padStart(2, '0');
    const fechaStr =`${yyyy}${mm}${dd}`;
    const referencia =`${fechaStr}${idCliente}${idCredito}`;
    const updateReferenciaQuery = `UPDATE ${TABLE_CREDITOS}SET referencia = ?WHERE idCredito = ?`;
    await new Promise((resolve, reject) => {
        db.query(
            updateReferenciaQuery,
            [
                referencia,
                idCredito
            ],
            (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            }
        );
    });
    return referencia;
};
//Genera los pagos de los creditos creados 
const generarPagosCredito = async (idCredito,semanasInt,abonoSemanal,primerSábadoSiguiente) => {
    const pagosQuery = `
        INSERT INTO ${TABLE_PAGOS}
        (idCredito,numeroSemana,cantidad,fechaEsperada,cantidadPagada,estado)
        VALUES
    `;
    const pagosValues = [];
    for (let i = 0;i < semanasInt;i++) {
        const fechaPago =
            new Date(primerSábadoSiguiente);
        fechaPago.setDate(primerSábadoSiguiente.getDate() +(i + 1) * 7);
        const fechaPagoFormateada =
            fechaPago
                .toISOString()
                .split('T')[0];
        pagosValues.push(
            `(
                ${idCredito},
                ${i + 1},
                ${abonoSemanal},
                '${fechaPagoFormateada}',
                NULL,
                'Pendiente'
            )`
        );
    }
    await new Promise((resolve, reject) => {
        db.query(
            pagosQuery +
            pagosValues.join(', '),
            (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            }
        );
    });
};


const createNewCredit = async (req, res) => {

    const {
        idCliente,
        monto,
        semanas,
        horarioEntrega,
        recargos,
        modulo,
        atrasos
    } = req.body;

    try {
        validarDatosCredito({
            idCliente,
            monto,
            semanas,
            horarioEntrega
        });
        if (modulo !== 'new') {
            return res.status(400).json({
                error: true,
                message: 'El módulo de crédito no es válido'
            });
        }

        const {
            hoy,
            primerSábadoSiguiente,
            semanasInt,
            fechaVencimientoF,
            montoNum,
            recargosNum,
            atrasosNum
        } = prepararDatosCredito({monto,semanas,recargos,atrasos});

        const clasificacion =
            await obtenerClasificacionCliente(idCliente);
        if (!clasificacion) {
            return res.status(404).json({
                error: true,
                message: 'El cliente no existe'
            });
        }
        const verificarCreditoExistenteQuery = `
            SELECT COUNT(*) AS total
            FROM ${TABLE_CREDITOS}
            WHERE idCliente = ?
        `;
        const resultadoCreditoExistente =
            await new Promise((resolve, reject) => {

                db.query(
                    verificarCreditoExistenteQuery,
                    [idCliente],
                    (err, result) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        resolve(result);
                    }
                );
            });
        if (resultadoCreditoExistente[0].total > 0) {
            return res.status(400).json({
                error: true,
                message:
                    'Este cliente ya ha tenido créditos'
            });
        }
        let factor;
        try {
            factor =
                validarCreditoPorClasificacion(clasificacion,semanasInt,montoNum);
        } catch (errorClasificacion) {
            return res.status(400).json({
                error: true,
                message:
                    errorClasificacion.message
            });
        }
        const totalAPagar =
            montoNum * factor;
        const abonoSemanal =
            Math.round(
                totalAPagar /
                semanasInt
            );
        const efectivo =
            montoNum -
            recargosNum -
            atrasosNum;

        const resultInsert =
            await insertarCredito({
                idCliente,
                montoNum,
                semanasInt,
                horarioEntrega,
                fechaVencimientoF,
                recargosNum,
                atrasosNum,
                abonoSemanal,
                efectivo,
                tipoCredito: 'nuevo'
            });

        const idCredito =
            resultInsert.insertId;

        const referencia =
            await generarYGuardarReferencia(
                idCliente,
                idCredito,
                hoy
            );
        const semanasRestantes = 0;
        const descuentoSemanas = 0;
        const abonoAnterior = 0;
        await generarPagosCredito(idCredito,semanasInt,abonoSemanal,primerSábadoSiguiente);

        const respuesta =
            await respuestaImprimir(
                idCredito
            );
        return res.status(201).json({
            abonoSemanal,
            efectivo,
            semanasRestantes,
            abonoAnterior,
            descuentoSemanas,
            referencia,
            imprimir: respuesta
        });
    } catch (error) {
        console.error(
            'Error al crear crédito nuevo:',
            error
        );
        return res.status(400).json({
            error: true,
            message: error.message
        });
    }
};
const createRenewCredit = async (req, res) => {
    const {
        idCliente,
        monto,
        semanas,
        horarioEntrega,
        recargos,
        atrasos
    } = req.body;

    try {

        validarDatosCredito({idCliente,monto,semanas,horarioEntrega});
        const {
            hoy,
            primerSábadoSiguiente,
            semanasInt,
            fechaVencimientoF,
            montoNum,
            recargosNum,
            atrasosNum
        } = prepararDatosCredito({monto,semanas,recargos,atrasos});

        if (![12, 16].includes(semanasInt)) {
            return res.status(400).json({
                error: true,
                message:
                    'Solo se permiten créditos de 12 o 16 semanas'
            });
        }
        const factor =
            semanasInt === 12
                ? 1.5
                : 1.583;
        const abonoSemanal =
            Math.round(
                (montoNum * factor) /
                semanasInt
            );
        const queryUltimoCredito = `
            SELECT
                idCredito,
                semanas AS semanasTotales,
                abonoSemanal,
                estado
            FROM ${TABLE_CREDITOS}
            WHERE idCliente = ?
            AND tipoCredito <> 'adicional'
            ORDER BY fechaEntrega DESC
            LIMIT 1
        `;
        db.query(
            queryUltimoCredito,
            [idCliente],
            (err, result) => {

                if (err ||result.length === 0) {
                    console.error(
                        'Error al obtener último crédito del cliente:',
                        err
                    );
                    return res.status(400).json({
                        error: true,
                        message:
                            'El cliente no tiene historial de créditos para renovar'
                    });
                }
                const creditoActual =
                    result[0];
                console.log(
                    'creditoActual:',
                    creditoActual
                );
                const idCreditoAnterior =
                    creditoActual.idCredito;
                const semanasTotales =
                    creditoActual.semanasTotales;
                const abonoAnterior =
                    creditoActual.abonoSemanal;

                const queryUltimaSemana = `
                    SELECT numeroSemana
                    FROM ${TABLE_PAGOS}
                    WHERE idCredito = ?
                    AND (
                        estado = 'pagado'
                        OR estado = 'adelantado'
                    )
                    ORDER BY numeroSemana DESC
                    LIMIT 1
                `;
                db.query(
                    queryUltimaSemana,
                    [idCreditoAnterior],
                    (err2, ultimaSemanaRows) => {
                        if (err2) {
                            return res.status(500).json({
                                error: true,
                                message:
                                    'Error al obtener última semana pagada'
                            });
                        }
                        const ultimaSemana =
                            ultimaSemanaRows.length > 0
                                ? ultimaSemanaRows[0].numeroSemana
                                : 0;

                        const queryPagosRestantes = `
                            SELECT
                                numeroSemana,
                                cantidad,
                                cantidadPagada,
                                estado
                            FROM ${TABLE_PAGOS}
                            WHERE idCredito = ?
                            AND numeroSemana > ?
                            ORDER BY numeroSemana ASC
                        `;
                        db.query(
                            queryPagosRestantes,
                            [
                                idCreditoAnterior,
                                ultimaSemana
                            ],
                            (err3, pagosRestantes) => {
                                if (err3) {
                                    return res.status(500).json({
                                        error: true,
                                        message:
                                            'Error al calcular semanas restantes'
                                    });
                                }
                                let descuentoSemanas = 0;
                                let semanasRestantes = 0;
                                for (const pago of pagosRestantes) {
                                    if (pago.estado ==='adelantadoIncompleto') {
                                        descuentoSemanas +=pago.cantidad -(pago.cantidadPagada ?? 0);
                                        semanasRestantes++;
                                    } else if (pago.estado ==='pendiente') {
                                        descuentoSemanas +=pago.cantidad;
                                        semanasRestantes++;
                                    }
                                }

                                const querySemanasPagadas = `
                                    SELECT COUNT(*) AS semanasPagadas
                                    FROM ${TABLE_PAGOS}
                                    WHERE idCredito = ?
                                    AND estado IN ('pagado','adelantado','pagadoAtrasado')`;
                                db.query(
                                    querySemanasPagadas,
                                    [idCreditoAnterior],
                                    async (err4, pagadasRows) => {
                                        console.log(
                                            'idCreditoAnterior:',
                                            idCreditoAnterior
                                        );
                                        if (err4) {
                                            return res.status(500).json({
                                                error: true,
                                                message:
                                                    'Error al contar semanas pagadas'
                                            });
                                        }
                                        const semanasPagadas =
                                            pagadasRows[0]
                                                .semanasPagadas;
                                        const semanasMinimas =
                                            semanasInt === 12
                                                ? 10
                                                : 14;
                                        if (semanasPagadas <semanasMinimas) {
                                            return res.status(400).json({
                                                error: true,
                                                message:
                                                    `El cliente debe haber pagado al menos ${semanasMinimas} semanas para renovar un crédito de ${semanasInt} semanas`
                                            });
                                        }

                                        const clasificacion =
                                            await obtenerClasificacionCliente(
                                                idCliente
                                            );
                                        if (!clasificacion) {
                                            return res.status(404).json({
                                                error: true,
                                                message:
                                                    'El cliente no existe'
                                            });
                                        }
                                        try {
                                            validarCreditoPorClasificacion(clasificacion,semanasInt,montoNum);
                                        } catch (
                                            errorClasificacion
                                        ) {
                                            return res.status(400).json({
                                                error: true,
                                                message:
                                                    errorClasificacion.message
                                            });
                                        }

                                        const efectivo =
                                            montoNum -
                                            recargosNum -
                                            atrasosNum -
                                            descuentoSemanas;
                                        let idCredito;
                                        try {
                                            idCredito =
                                                await insertarCredito({
                                                    idCliente,
                                                    montoNum,
                                                    semanasInt,
                                                    horarioEntrega,
                                                    fechaVencimientoF,
                                                    recargosNum,
                                                    atrasosNum,
                                                    abonoSemanal,
                                                    tipoCredito:
                                                        'renovación',
                                                    efectivo
                                                });
                                        } catch (errorInsert) {
                                            console.error(
                                                'Error al registrar nuevo crédito:',
                                                errorInsert
                                            );
                                            return res.status(500).json({
                                                error: true,
                                                message:
                                                    'Error al guardar el crédito de renovación'
                                            });
                                        }
                                        let referencia;
                                        try {
                                            referencia =
                                                await generarYGuardarReferencia(
                                                    idCliente,
                                                    idCredito,
                                                    hoy
                                                );
                                        } catch (errorReferencia) {
                                            console.error(
                                                'Error al guardar referencia:',
                                                errorReferencia
                                            );
                                            return res.status(500).json({
                                                error: true,
                                                message:
                                                    'Error al guardar la referencia del crédito'
                                            });
                                        }
                                        try {
                                            await generarPagosCredito(
                                                idCredito,
                                                semanasInt,
                                                abonoSemanal,
                                                primerSábadoSiguiente
                                            );
                                        } catch (errorPagos) {
                                            console.error(
                                                'Error al registrar pagos:',
                                                errorPagos
                                            );
                                            return res.status(500).json({
                                                error: true,
                                                message:
                                                    'Error al guardar los pagos del nuevo crédito'
                                            });
                                        }

                                        const updatePagosAnteriores = `
                                            UPDATE ${TABLE_PAGOS}
                                            SET
                                                cantidadPagada = ?,
                                                fechaPagada = CURDATE(),
                                                estado = 'pagado'
                                            WHERE idCredito = ?
                                            AND estado = 'pendiente'
                                            ORDER BY numeroSemana
                                            LIMIT ?
                                        `;
                                        const updateAdelantos = `
                                            UPDATE ${TABLE_PAGOS}
                                            SET fechaPagada = CURDATE()
                                            WHERE idCredito = ?
                                            AND estado = 'adelantado'
                                        `;
                                        db.query(
                                            updateAdelantos,
                                            [idCreditoAnterior],
                                            (errAdelanto) => {
                                                if (errAdelanto) {
                                                    console.error(
                                                        'Error al actualizar fecha de adelantos:',
                                                        errAdelanto
                                                    );
                                                    return res.status(500).json({
                                                        error: true,
                                                        message:
                                                            'Error al actualizar los adelantos'
                                                    });
                                                }
                                            }
                                        );

                                        db.query(
                                            updatePagosAnteriores,
                                            [
                                                abonoAnterior,
                                                idCreditoAnterior,
                                                semanasRestantes
                                            ],
                                            (err4) => {
                                                if (err4) {
                                                    console.error(
                                                        'Error al actualizar pagos anteriores:',
                                                        err4
                                                    );
                                                    return res.status(500).json({
                                                        error: true,
                                                        message:
                                                            'Crédito creado, pero no se pudieron marcar como pagadas las semanas anteriores'
                                                    });
                                                }

                                                const updateCreditoAnterior = `
                                                    UPDATE ${TABLE_CREDITOS}
                                                    SET estado = 'Pagado'
                                                    WHERE idCredito = ?
                                                `;
                                                db.query(
                                                    updateCreditoAnterior,
                                                    [idCreditoAnterior],
                                                    (err5) => {
                                                        if (err5) {
                                                            console.error(
                                                                'Error al actualizar el estado del crédito anterior:',
                                                                err5
                                                            );
                                                            return res.status(500).json({
                                                                error: true,
                                                                message:
                                                                    'Crédito creado, pero no se pudo actualizar el estado del crédito anterior'
                                                            });
                                                        }

                                                        respuestaImprimir(
                                                            idCredito
                                                        )
                                                            .then(
                                                                (respuesta) => {
                                                                    return res.status(201).json({
                                                                        abonoSemanal,
                                                                        efectivo,
                                                                        semanasRestantes,
                                                                        abonoAnterior,
                                                                        descuentoSemanas,
                                                                        referencia,
                                                                        imprimir:
                                                                            respuesta
                                                                    });
                                                                }
                                                            )
                                                            .catch(
                                                                (error) => {
                                                                    console.error(
                                                                        'Error al construir respuesta para imprimir:',
                                                                        error
                                                                    );
                                                                    return res.status(500).json({
                                                                        error: true,
                                                                        message:
                                                                            'Error al construir los datos para imprimir'
                                                                    });
                                                                }
                                                            );
                                                    }
                                                );
                                            }
                                        );
                                    }
                                );
                            }
                        );
                    }
                );
            }
        );

    } catch (error) {
        console.error(
            'Error al crear crédito de renovación:',
            error
        );
        return res.status(400).json({
            error: true,
            message: error.message
        });
    }
};
const createAdditionalCredit = async (req, res) => {

    const {
        idCliente,
        monto,
        semanas,
        horarioEntrega,
        recargos,
        modulo,
        atrasos
    } = req.body;

    try {
        validarDatosCredito({idCliente,monto,semanas,horarioEntrega});

        const {
            hoy,
            primerSábadoSiguiente,
            semanasInt,
            fechaVencimientoF,
            montoNum,
            recargosNum,
            atrasosNum
        } = prepararDatosCredito({monto,semanas,recargos,atrasos});
        const clasificacion =
            await obtenerClasificacionCliente(idCliente);
        if (!clasificacion) {
            return res.status(404).json({
                error: true,
                message: 'El cliente no existe'
            });
        }

        const creditosActivosQuery = `
            SELECT monto
            FROM ${TABLE_CREDITOS}
            WHERE idCliente = ?
            AND estado = 'Activo'
        `;
        db.query(
            creditosActivosQuery,
            [idCliente],
            async (errCreditos, resultCreditos) => {
                if (errCreditos) {
                    console.error(
                        'Error al verificar créditos activos:',
                        errCreditos
                    );
                    return res.status(500).json({
                        error: true,
                        message:
                            'Error al verificar créditos activos'
                    });
                }

                if (resultCreditos.length >= 2) {
                    return res.status(400).json({
                        error: true,
                        message:
                            'Solo se permiten hasta 2 créditos activos'
                    });
                }

                const sumaMontos =
                    resultCreditos.reduce(
                        (sum, row) =>
                            sum +
                            parseFloat(row.monto),
                        0
                    );
                const totalPropuesto =
                    sumaMontos +
                    montoNum;
                console.log('Clasificación:',clasificacion);
                console.log('Suma créditos activos:',sumaMontos);
                console.log('Nuevo crédito:',montoNum);
                console.log('Total propuesto:',totalPropuesto);

                let factor;
                try {
                    factor =
                        validarCreditoPorClasificacion(
                            clasificacion,
                            semanasInt,
                            montoNum,
                            totalPropuesto
                        );
                } catch (errorClasificacion) {
                    return res.status(400).json({
                        error: true,
                        message:
                            errorClasificacion.message
                    });
                }

                const totalAPagar =
                    montoNum * factor;
                const abonoSemanal =
                    Math.round(
                        totalAPagar /
                        semanasInt
                    );
                const efectivo =
                    montoNum -
                    recargosNum -
                    atrasosNum;

                let idCredito;
                try {
                    const resultInsert =
                        await insertarCredito({
                            idCliente,
                            montoNum,
                            semanasInt,
                            horarioEntrega,
                            fechaVencimientoF,
                            recargosNum,
                            atrasosNum,
                            abonoSemanal,
                            efectivo,
                            tipoCredito: 'adicional'
                        });

                    idCredito =
                        resultInsert.insertId;
                } catch (errInsert) {
                    console.error(
                        'Error al registrar crédito adicional:',
                        errInsert
                    );
                    return res.status(500).json({
                        error: true,
                        message:
                            'Error al guardar el crédito adicional'
                    });
                }

                let referencia;
                try {
                    referencia =
                        await generarYGuardarReferencia(idCliente,idCredito,hoy);
                } catch (errorReferencia) {
                    console.error(
                        'Error al guardar referencia del crédito adicional:',
                        errorReferencia
                    );
                    return res.status(500).json({
                        error: true,
                        message:
                            'Error al guardar la referencia del crédito'
                    });
                }
                const semanasRestantes = 0;
                const descuentoSemanas = 0;
                const abonoAnterior = 0;
                try {
                    await generarPagosCredito(idCredito,semanasInt,abonoSemanal,primerSábadoSiguiente);
                } catch (errorPagos) {
                    console.error(
                        'Error al registrar pagos del crédito adicional:',
                        errorPagos
                    );
                    return res.status(500).json({
                        error: true,
                        message:
                            'Error al guardar los pagos del crédito adicional'
                    });
                }

                const respuesta =
                    await respuestaImprimir(idCredito);
                return res.status(201).json({
                    abonoSemanal,
                    efectivo,
                    semanasRestantes,
                    abonoAnterior,
                    descuentoSemanas,
                    referencia,
                    imprimir: respuesta
                });
            }
        );

    } catch (error) {
        console.error(
            'Error al crear crédito adicional:',
            error
        );
        return res.status(400).json({
            error: true,
            message: error.message
        });
    }
};
async function respuestaImprimir(idCredito) {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT 
                c.tipoCredito, c.idCredito, c.monto, c.fechaEntrega, c.abonoSemanal, c.semanas AS numeroSemana,
                c.horarioEntrega, c.recargos, c.atrasos, c.efectivo, c.referencia,
                cl.idCliente, cl.nombre, cl.apellidoPaterno, cl.apellidoMaterno,
                z.idZona, z.promotor, z.codigoZona,
                p.fechaEsperada
            FROM creditos c
            JOIN clientes cl ON cl.idCliente = c.idCliente
            JOIN zonas z ON cl.idZona = z.idZona
            LEFT JOIN pagos p ON p.idCredito = c.idCredito
            WHERE c.idCredito = ?
            ORDER BY p.numeroSemana ASC
            LIMIT 1`;
        db.query(query, [idCredito], (err, results) => {
            if (err) return reject(err);
            if (results.length === 0) return resolve(null);
            const r = results[0];
            resolve({
                clientes: {
                    id: r.idCliente,
                    nombre: r.nombre,
                    apellidoPaterno: r.apellidoPaterno,
                    apellidoMaterno: r.apellidoMaterno
                },
                creditos: {
                    id: r.idCredito,
                    tipoCredito: r.tipoCredito,
                    monto: r.monto,
                    fechaEntrega: r.fechaEntrega,
                    abonoSemanal: r.abonoSemanal,
                    semanas: r.numeroSemana,
                    horarioEntrega: r.horarioEntrega,
                    recargos: r.recargos,
                    atrasos: r.atrasos,
                    efectivo: r.efectivo,
                    referencia: r.referencia
                },
                pagos: {
                    fechaEsperada: r.fechaEsperada
                },
                zona: {
                    idZona: r.idZona,
                    promotor: r.promotor,
                    codigoZona: r.codigoZona
                }
            });
        });
    });
}

module.exports = {
    createNewCredit,
    createRenewCredit,
    createAdditionalCredit, 
    respuestaImprimir
};
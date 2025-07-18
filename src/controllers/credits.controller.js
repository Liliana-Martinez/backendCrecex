const db = require('../db');
const TABLE_CREDITOS = 'creditos';
const TABLE_PAGOS = 'pagos';

const createNewCredit = (req, res) => {
    const { idCliente, monto, semanas, horarioEntrega, recargos, modulo, atrasos } = req.body;

    if (!idCliente || !monto || !semanas || !horarioEntrega) {
        return res.status(400).json({ error: 'Faltan datos obligatorios para registrar el crédito' });
    }

    if (modulo === 'new') {
        const hoy = new Date();
        const primerSábadoSiguiente = new Date(hoy);
        const diasHastaSábado = (6 - hoy.getDay() + 7) % 7;
        primerSábadoSiguiente.setDate(hoy.getDate() + diasHastaSábado);

        const semanasInt = parseInt(semanas, 10);
        const fechaVencimiento = new Date(primerSábadoSiguiente);
        fechaVencimiento.setDate(primerSábadoSiguiente.getDate() + semanasInt * 7);
        const fechaVencimientoF = fechaVencimiento.toISOString().split('T')[0];

        const montoNum = parseFloat(monto);
        const recargosNum = parseFloat(recargos ?? 0);
        const atrasosNum = parseFloat(atrasos ?? 0);

        const buscarClienteQuery = `SELECT clasificacion FROM clientes WHERE idCliente = ?`;

        db.query(buscarClienteQuery, [idCliente], (errCliente, resultCliente) => {
            if (errCliente) {
                console.error('Error al buscar cliente:', errCliente);
                return res.status(500).json({ error: 'Error al verificar la clasificación del cliente' });
            }

            if (resultCliente.length === 0) {
                return res.status(404).json({ error: 'El cliente no existe' });
            }
            // MODIFICACIÓN AQUÍ: ahora verifica si el cliente ha tenido *cualquier* crédito
            const verificarCreditoExistenteQuery = `SELECT COUNT(*) AS total FROM ${TABLE_CREDITOS} WHERE idCliente = ?`;

            db.query(verificarCreditoExistenteQuery, [idCliente], (errVerif, resultVerif) => {
                if (errVerif) {
                    console.error('Error al verificar crédito existente:', errVerif);
                    return res.status(500).json({ error: true, message: 'Error al verificar si el cliente ya tiene crédito' });
                }

                if (resultVerif[0].total > 0) {
                    return res.status(400).json({ error: true, message: 'Este cliente ya ha tenido créditos' });
                }

                let factor;
                if (semanasInt === 12) {
                    factor = 1.5;
                } else if (semanasInt === 16) {
                    factor = 1.583;
                } else {
                    return res.status(400).json({ error: true, message: 'Solo se permiten créditos de 12 o 16 semanas' });
                }

                const clasificacion = resultCliente[0].clasificacion.toUpperCase();

                let validacionCorrecta = false;
                switch (clasificacion) {
                    case 'D':
                        if (semanasInt === 12 && montoNum <= 2000) validacionCorrecta = true;
                        break;
                    case 'C':
                        if ((semanasInt === 12 && montoNum <= 4000) || (semanasInt === 16 && montoNum <= 5000)) validacionCorrecta = true;
                        break;
                    case 'B':
                        if ((semanasInt === 12 && montoNum <= 6000) || (semanasInt === 16 && montoNum <= 7500)) validacionCorrecta = true;
                        break;
                    case 'A':
                        if ((semanasInt === 12 || semanasInt === 16) && montoNum > 0) validacionCorrecta = true;
                        break;
                    default:
                        return res.status(400).json({ error: true, message: 'Clasificación del cliente no válida' });
                }

                if (!validacionCorrecta) {
                    return res.status(400).json({ error: true, message: 'El monto no cumple con las condiciones de la clasificación' });
                }
                if (semanasInt === 12 && montoNum < 1000) {
                    return res.status(400).json({ error: true, message: 'El monto mínimo para 12 semanas es de $1000' });
                }
                if (semanasInt === 16 && montoNum < 4000) {
                    return res.status(400).json({ error: true, message: 'El monto mínimo para 16 semanas es de $4000' });
                }

                const totalAPagar = montoNum * factor;
                const abonoSemanal = Math.round(totalAPagar / semanasInt);
                const efectivo = montoNum - recargosNum - atrasosNum;

                const query = `
                    INSERT INTO ${TABLE_CREDITOS} 
                    (idCliente, monto, semanas, horarioEntrega, fechaEntrega, fechaVencimiento, recargos, atrasos, abonoSemanal, estado, tipoCredito, efectivo)
                    VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?, 'Activo', 'nuevo', ?)
                `;

                db.query(
                    query,
                    [idCliente, montoNum, semanasInt, horarioEntrega, fechaVencimientoF, recargosNum, atrasosNum, abonoSemanal, efectivo],
                    (err, result) => {
                        if (err) {
                            console.error('Error al registrar crédito:', err);
                            return res.status(500).json({ error: true, message: 'Error al guardar el crédito' });
                        }

                        const idCredito = result.insertId;
                        const semanasRestantes = 0;
                        const descuentoSemanas = 0;
                        const abonoAnterior = 0;
                        const pagosQuery = `
                            INSERT INTO ${TABLE_PAGOS} (idCredito, numeroSemana, cantidad, fechaEsperada, cantidadPagada, estado)
                            VALUES
                        `;

                        let pagosValues = [];
                        for (let i = 0; i < semanasInt; i++) {
                            const fechaPago = new Date(primerSábadoSiguiente);
                            fechaPago.setDate(primerSábadoSiguiente.getDate() + (i + 1) * 7);
                            const fechaPagoFormateada = fechaPago.toISOString().split('T')[0];
                            pagosValues.push(`(${idCredito}, ${i + 1}, ${abonoSemanal}, '${fechaPagoFormateada}', NULL, 'Pendiente')`);
                        }

                        db.query(pagosQuery + pagosValues.join(', '), (err3) => {
                            if (err3) {
                                console.error('Error al registrar pagos:', err3);
                                return res.status(500).json({ error: 'Error al guardar los pagos' });
                            }

                            respuestaImprimir(idCredito)
                                .then((respuesta) => {
                                    return res.status(201).json({
                                        abonoSemanal,
                                        efectivo,
                                        semanasRestantes,
                                        abonoAnterior,
                                        descuentoSemanas,
                                        imprimir: respuesta
                                    });
                                })
                                .catch((error) => {
                                    console.error('Error al construir respuesta para imprimir:', error);
                                    return res.status(500).json({ error: true, message: 'Error al construir los datos para imprimir' });
                                });
                        });
                    }
                );
            });
        });
    }
};


const createRenewCredit = (req, res) => {
    const { idCliente, monto, semanas, horarioEntrega, recargos, atrasos } = req.body;

    if (!idCliente || !monto || !semanas || !horarioEntrega) {
        return res.status(400).json({ error: 'Faltan datos obligatorios para registrar el crédito' });
    }

    const semanasInt = parseInt(semanas, 10);
    const montoNum = parseFloat(monto);
    const recargosNum = parseFloat(recargos ?? 0);
    const atrasosNum = parseFloat(atrasos ?? 0);

    if (![12, 16].includes(semanasInt)) {
        return res.status(400).json({ error: true, message: 'Solo se permiten créditos de 12 o 16 semanas' });
    }

    const hoy = new Date();
    const primerSábadoSiguiente = new Date(hoy);
    const diasHastaSábado = (6 - hoy.getDay() + 7) % 7;
    primerSábadoSiguiente.setDate(hoy.getDate() + diasHastaSábado);

    const fechaVencimiento = new Date(primerSábadoSiguiente);
    fechaVencimiento.setDate(primerSábadoSiguiente.getDate() + semanasInt * 7);
    const fechaVencimientoF = fechaVencimiento.toISOString().split('T')[0];

    const factor = semanasInt === 12 ? 1.5 : 1.583;
    const abonoSemanal = Math.round((montoNum * factor) / semanasInt);

    const queryUltimoCredito = `
        SELECT idCredito, semanas AS semanasTotales, abonoSemanal, estado
        FROM creditos
        WHERE idCliente = ?
        ORDER BY fechaEntrega DESC
        LIMIT 1;
    `;

    db.query(queryUltimoCredito, [idCliente], (err, result) => {
        if (err || result.length === 0) {
            console.error('Error al obtener último crédito del cliente:', err);
            return res.status(400).json({ error: true, message: 'El cliente no tiene historial de créditos para renovar' });
        }

        const creditoActual = result[0];
        const idCreditoAnterior = creditoActual.idCredito;
        const semanasTotales = creditoActual.semanasTotales;
        const abonoAnterior = creditoActual.abonoSemanal;

        const queryUltimaSemana = `
            SELECT numeroSemana
            FROM pagos
            WHERE idCredito = ? AND (estado = 'pagado' OR estado = 'adelantado')
            ORDER BY numeroSemana DESC
            LIMIT 1
        `;

        db.query(queryUltimaSemana, [idCreditoAnterior], (err2, ultimaSemanaRows) => {
            if (err2) return res.status(500).json({ error: true, message: 'Error al obtener última semana pagada' });

            const ultimaSemana = ultimaSemanaRows.length > 0 ? ultimaSemanaRows[0].numeroSemana : 0;

            const queryPagosRestantes = `
                SELECT numeroSemana, cantidad, cantidadPagada, estado
                FROM pagos
                WHERE idCredito = ? AND numeroSemana > ?
                ORDER BY numeroSemana ASC
            `;

            db.query(queryPagosRestantes, [idCreditoAnterior, ultimaSemana], (err3, pagosRestantes) => {
                if (err3) return res.status(500).json({ error: true, message: 'Error al calcular semanas restantes' });

                let descuentoSemanas = 0;
                let semanasRestantes = 0;

                for (let pago of pagosRestantes) {
                    if (pago.estado === 'adelantadoIncompleto') {
                        descuentoSemanas += pago.cantidad - (pago.cantidadPagada ?? 0);
                        semanasRestantes++;
                    } else if (pago.estado === 'pendiente') {
                        descuentoSemanas += pago.cantidad;
                        semanasRestantes++;
                    }
                }

                const querySemanasPagadas = `
                    SELECT COUNT(*) AS semanasPagadas
                    FROM pagos
                    WHERE idCredito = ? AND estado = 'Pagado'
                `;

                db.query(querySemanasPagadas, [idCreditoAnterior], (err4, pagadasRows) => {
                    if (err4) return res.status(500).json({ error: true, message: 'Error al contar semanas pagadas' });

                    const semanasPagadas = pagadasRows[0].semanasPagadas;
                    const semanasMinimas = semanasInt === 12 ? 10 : 14;

                    if (semanasPagadas < semanasMinimas) {
                        return res.status(400).json({
                            error: true,
                            message: `El cliente debe haber pagado al menos ${semanasMinimas} semanas para renovar un crédito de ${semanasInt} semanas`
                        });
                    }

                    const queryClasificacion = `SELECT clasificacion FROM clientes WHERE idCliente = ?`;
                    db.query(queryClasificacion, [idCliente], (errClas, resultClas) => {
                        if (errClas || resultClas.length === 0) {
                            console.error('Error al obtener clasificación:', errClas);
                            return res.status(500).json({ error: true, message: 'Error al obtener clasificación del cliente' });
                        }

                        const clasificacion = resultClas[0].clasificacion.toUpperCase();

                        if (semanasInt === 12 && montoNum < 1000) {
                            return res.status(400).json({ error: true, message: 'El monto mínimo para 12 semanas es $1000' });
                        }
                        if (semanasInt === 16 && montoNum < 4000) {
                            return res.status(400).json({ error: true, message: 'El monto mínimo para 16 semanas es $4000' });
                        }

                        let valido = false;
                        switch (clasificacion) {
                            case 'D':
                                if (semanasInt === 12 && montoNum <= 2000) valido = true;
                                break;
                            case 'C':
                                if ((semanasInt === 12 && montoNum <= 4000) || (semanasInt === 16 && montoNum <= 5000)) valido = true;
                                break;
                            case 'B':
                                if ((semanasInt === 12 && montoNum <= 6000) || (semanasInt === 16 && montoNum <= 7500)) valido = true;
                                break;
                            case 'A':
                                if (montoNum > 0) valido = true;
                                break;
                            default:
                                return res.status(400).json({ error: true, message: 'Clasificación del cliente no válida' });
                        }

                        if (!valido) {
                            return res.status(400).json({ error: true, message: 'El monto no cumple con la clasificación del cliente' });
                        }

                        const efectivo = montoNum - recargosNum - atrasosNum - descuentoSemanas;

                        const insertCredito = `
                            INSERT INTO creditos
                            (idCliente, monto, semanas, horarioEntrega, fechaEntrega, fechaVencimiento, recargos, atrasos, abonoSemanal, estado, tipoCredito, efectivo)
                            VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?, 'Activo', 'renovación', ?)
                        `;

                        db.query(insertCredito, [idCliente, montoNum, semanasInt, horarioEntrega, fechaVencimientoF, recargosNum, atrasosNum, abonoSemanal, efectivo], (err2, result2) => {
                            if (err2) {
                                console.error('Error al registrar nuevo crédito:', err2);
                                return res.status(500).json({ error: true, message: 'Error al guardar el crédito de renovación' });
                            }

                            const idCredito = result2.insertId;

                            const pagosQuery = `INSERT INTO pagos (idCredito, numeroSemana, cantidad, fechaEsperada, cantidadPagada, estado) VALUES `;
                            let pagosValues = [];

                            for (let i = 0; i < semanasInt; i++) {
                                const fechaPago = new Date(primerSábadoSiguiente);
                                fechaPago.setDate(primerSábadoSiguiente.getDate() + (i + 1) * 7);
                                const fechaFormateada = fechaPago.toISOString().split('T')[0];
                                pagosValues.push(`(${idCredito}, ${i + 1}, ${abonoSemanal}, '${fechaFormateada}', NULL, 'Pendiente')`);
                            }

                            db.query(pagosQuery + pagosValues.join(', '), (err3) => {
                                if (err3) {
                                    console.error('Error al registrar pagos:', err3);
                                    return res.status(500).json({ error: true, message: 'Error al guardar los pagos del nuevo crédito' });
                                }

                                const updatePagosAnteriores = `
                                    UPDATE pagos
                                    SET cantidadPagada = ?, fechaPagada = CURDATE(), estado = 'Pagado'
                                    WHERE idCredito = ? AND estado = 'Pendiente'
                                    ORDER BY numeroSemana
                                    LIMIT ?
                                `;

                                db.query(updatePagosAnteriores, [abonoAnterior, idCreditoAnterior, semanasRestantes], (err4) => {
                                    if (err4) {
                                        console.error('Error al actualizar pagos anteriores:', err4);
                                        return res.status(500).json({ error: true, message: 'Crédito creado, pero no se pudieron marcar como pagadas las semanas anteriores' });
                                    }

                                    const updateCreditoAnterior = `UPDATE creditos SET estado = 'Pagado' WHERE idCredito = ?`;
                                    db.query(updateCreditoAnterior, [idCreditoAnterior], (err5) => {
                                        if (err5) {
                                            console.error('Error al actualizar estado del crédito anterior:', err5);
                                            return res.status(500).json({ error: true, message: 'Crédito creado, pero no se pudo actualizar el estado del crédito anterior' });
                                        }

                                        respuestaImprimir(idCredito)
                                            .then((respuesta) => {
                                                return res.status(201).json({
                                                    abonoSemanal,
                                                    efectivo,
                                                    semanasRestantes,
                                                    abonoAnterior,
                                                    descuentoSemanas,
                                                    imprimir: respuesta
                                                });
                                            })
                                            .catch((error) => {
                                                console.error('Error al construir respuesta para imprimir:', error);
                                                return res.status(500).json({ error: true, message: 'Error al construir los datos para imprimir' });
                                            });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
};

const createAdditionalCredit = (req, res) => {
    const { idCliente, monto, semanas, horarioEntrega, recargos, modulo, atrasos } = req.body;
    if (!idCliente || !monto || !semanas || !horarioEntrega) {
        return res.status(400).json({ error: 'Faltan datos obligatorios para registrar el crédito' });
    }
    const hoy = new Date();
    const primerSábadoSiguiente = new Date(hoy);
    const diasHastaSábado = (6 - hoy.getDay() + 7) % 7;
    primerSábadoSiguiente.setDate(hoy.getDate() + diasHastaSábado);
    const semanasInt = parseInt(semanas, 10);
    const fechaVencimiento = new Date(primerSábadoSiguiente);
    fechaVencimiento.setDate(primerSábadoSiguiente.getDate() + semanasInt * 7);
    const fechaVencimientoF = fechaVencimiento.toISOString().split('T')[0];
    const montoNum = parseFloat(monto);
    const recargosNum = parseFloat(recargos ?? 0);
    const atrasosNum = parseFloat(atrasos ?? 0);
    const buscarClienteQuery = `SELECT clasificacion FROM clientes WHERE idCliente = ?`;
    db.query(buscarClienteQuery, [idCliente], (errCliente, resultCliente) => {
        if (errCliente) {
            console.error('Error al buscar cliente:', errCliente);
            return res.status(500).json({ error: 'Error al verificar la clasificación del cliente' });
        }
        if (resultCliente.length === 0) {
            return res.status(404).json({ error: 'El cliente no existe' });
        }
        const clasificacion = resultCliente[0].clasificacion.toUpperCase();
        const creditosActivosQuery = `SELECT monto FROM creditos WHERE idCliente = ? AND estado = 'Activo'`;
        db.query(creditosActivosQuery, [idCliente], (errCreditos, resultCreditos) => {
            if (errCreditos) {
                console.error('Error al verificar créditos activos:', errCreditos);
                return res.status(500).json({ error: 'Error al verificar créditos activos' });
            }
            if (resultCreditos.length >= 2) {
                return res.status(400).json({ error: true, message: 'Solo se permiten hasta 2 créditos activos' });
            }
            const sumaMontos = resultCreditos.reduce((sum, row) => sum + parseFloat(row.monto), 0);
            const totalPropuesto = sumaMontos + montoNum;
            let topeMaximo = 0;
            switch (clasificacion) {
                case 'D': topeMaximo = 2000; break;
                case 'C': topeMaximo = 4000; break;
                case 'B': topeMaximo = 7500; break;
                case 'A': topeMaximo = Infinity; break;
                default:
                    return res.status(400).json({ error: true, message: 'Clasificación del cliente no válida' });
            }
            if (totalPropuesto > topeMaximo) {
                return res.status(400).json({
                    error: true,
                    message: `Supera el límite permitido para clasificación ${clasificacion}`
                });
            }
            if (semanasInt === 12 && montoNum < 1000) {
                return res.status(400).json({ error: true, message: 'El monto mínimo para 12 semanas es de $1000' });
            }
            if (semanasInt === 16 && montoNum < 4000) {
                return res.status(400).json({ error: true, message: 'El monto mínimo para 16 semanas es de $4000' });
            }
            let factor;
            if (semanasInt === 12) factor = 1.5;
            else if (semanasInt === 16) factor = 1.583;
            else return res.status(400).json({ error: true, message: 'Solo se permiten créditos de 12 o 16 semanas' });
            const totalAPagar = montoNum * factor;
            const abonoSemanal = Math.round(totalAPagar / semanasInt);
            const efectivo = montoNum - recargosNum - atrasosNum;
            const query = `
                INSERT INTO creditos
                (idCliente, monto, semanas, horarioEntrega, fechaEntrega, fechaVencimiento, recargos, atrasos, abonoSemanal, estado, tipoCredito, efectivo)
                VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?, 'Activo', 'adicional', ?)`;
            const valores = [
                idCliente,
                montoNum,
                semanasInt,
                horarioEntrega,
                fechaVencimientoF,
                recargosNum,
                atrasosNum,
                abonoSemanal,
                efectivo
            ];
            db.query(query, valores, (errInsert, resultInsert) => {
                if (errInsert) {
                    console.error('Error al registrar crédito adicional:', errInsert);
                    return res.status(500).json({ error: true, message: 'Error al guardar el crédito adicional' });
                }
                const idCredito = resultInsert.insertId;
                const semanasRestantes =0;
                const descuentoSemanas = 0;
                const abonoAnterior = 0;
                const pagosQuery = `
                    INSERT INTO pagos (idCredito, numeroSemana, cantidad, fechaEsperada, cantidadPagada, estado) VALUES`;

                let pagosValues = [];
                for (let i = 0; i < semanasInt; i++) {
                    const fechaPago = new Date(primerSábadoSiguiente);
                    fechaPago.setDate(primerSábadoSiguiente.getDate() + (i + 1) * 7);
                    const fechaPagoFormateada = fechaPago.toISOString().split('T')[0];
                    pagosValues.push(`(${idCredito}, ${i + 1}, ${abonoSemanal}, '${fechaPagoFormateada}', NULL, 'Pendiente')`);
                }
                db.query(pagosQuery + pagosValues.join(', '), (errPagos) => {
                    if (errPagos) {
                        console.error('Error al registrar pagos del crédito adicional:', errPagos);
                        return res.status(500).json({ error: 'Error al guardar los pagos del crédito adicional' });
                    }
                    respuestaImprimir(idCredito)
                        .then((respuesta) => {
                            return res.status(201).json({
                                abonoSemanal,
                                efectivo,
                                semanasRestantes,
                                abonoAnterior,
                                descuentoSemanas,
                                imprimir: respuesta
                            });
                        })
                        .catch((error) => {
                            console.error('Error al construir respuesta para imprimir:', error);
                            return res.status(500).json({ error: true, message: 'Error al construir los datos para imprimir' });
                        });
                });
            });
        });
    });
};

async function respuestaImprimir(idCredito) {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT 
                c.tipoCredito, c.idCredito, c.monto, c.fechaEntrega, c.abonoSemanal, c.semanas AS numeroSemana,
                c.horarioEntrega, c.recargos, c.atrasos, c.efectivo,
                cl.idCliente, cl.nombre, cl.apellidoPaterno, cl.apellidoMaterno,
                z.idZona, z.promotora, z.codigoZona,
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
                    efectivo: r.efectivo
                },
                pagos: {
                    fechaEsperada: r.fechaEsperada
                },
                zona: {
                    idZona: r.idZona,
                    promotora: r.promotora,
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
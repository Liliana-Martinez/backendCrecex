const db = require('../db');
const TABLE_CLIENTES = 'clientes';
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

        const buscarClienteQuery = `SELECT clasificacion FROM clientes WHERE idCliente = ?`;

        db.query(buscarClienteQuery, [idCliente], (errCliente, resultCliente) => {
            if (errCliente) {
                console.error('Error al buscar cliente:', errCliente);
                return res.status(500).json({ error: 'Error al verificar la clasificación del cliente' });
            }

            if (resultCliente.length === 0) {
                return res.status(404).json({ error: 'El cliente no existe' });
            }

            // Verificar si el cliente ya tiene un crédito activo
            const verificarCreditoExistenteQuery = `SELECT COUNT(*) AS total FROM ${TABLE_CREDITOS} WHERE idCliente = ? AND estado = 'Activo'`;

            db.query(verificarCreditoExistenteQuery, [idCliente], (errVerif, resultVerif) => {
                if (errVerif) {
                    console.error('Error al verificar crédito existente:', errVerif);
                    return res.status(500).json({ error: true, message: 'Error al verificar si el cliente ya tiene crédito' });
                }

                if (resultVerif[0].total > 0) {
                    return res.status(400).json({ error: true, message: 'Este cliente ya ha tenido creditos' });
                }

                // Cálculo del abono
                let factor;
                if (semanasInt === 12) {
                    factor = 1.5;
                } else if (semanasInt === 16) {
                    factor = 1.583;
                } else {
                    return res.status(400).json({ error: true, message: 'Solo se permiten créditos de 12 o 16 semanas' });
                }

                const clasificacion = resultCliente[0].clasificacion.toUpperCase();

                // Validaciones de monto mínimo
                if (semanasInt === 12 && montoNum < 1000) {
                    return res.status(400).json({ error: true, message: 'El monto mínimo para 12 semanas es de $1000' });
                }
                if (semanasInt === 16 && montoNum < 4000) {
                    return res.status(400).json({ error: true, message: 'El monto mínimo para 16 semanas es de $4000' });
                }

                // Validación según clasificación
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
                        if ((semanasInt === 12 || semanasInt === 16) && montoNum <= 7500) validacionCorrecta = true;
                        break;
                    default:
                        return res.status(400).json({ error: true, message: 'Clasificación del cliente no válida' });
                }

                if (!validacionCorrecta) {
                    return res.status(400).json({ error: true, message: 'El monto no cumple con las condiciones de la clasificación' });
                }

                const totalAPagar = montoNum * factor;
                const abonoSemanal = Math.round(totalAPagar / semanasInt);

                const recargosNum = parseFloat(recargos ?? 0);
                const atrasosNum = parseFloat(atrasos ?? 0);
                const efectivo = montoNum - recargosNum - atrasosNum;

                const query = `
                    INSERT INTO ${TABLE_CREDITOS} 
                    (idCliente, monto, semanas, horarioEntrega, fechaEntrega, fechaVencimiento, recargos, abonoSemanal, estado, tipoCredito, efectivo)
                    VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, 'Activo', 'nuevo', ?)
                `;

                db.query(
                    query,
                    [idCliente, montoNum, semanasInt, horarioEntrega, fechaVencimientoF, recargos ?? null, abonoSemanal, efectivo],
                    (err, result) => {
                        if (err) {
                            console.error('Error al registrar crédito:', err);
                            return res.status(500).json({ error: true, message: 'Error al guardar el crédito' });
                        }

                        const idCredito = result.insertId;
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

                            return res.status(201).json({
                                abonoSemanal,
                                efectivo
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

    // Buscar crédito activo con más semanas pagadas
    const queryCreditoYPagos = `
        SELECT 
            c.idCredito, c.semanas AS semanasTotales, p.estado, COUNT(p.idPago) AS semanasPagadas, c.abonoSemanal
        FROM creditos c
        LEFT JOIN pagos p ON c.idCredito = p.idCredito AND p.estado = 'Pagado'
        WHERE c.idCliente = ? AND c.estado = 'Activo'
        GROUP BY c.idCredito
        ORDER BY semanasPagadas DESC
        LIMIT 1
    `;

    db.query(queryCreditoYPagos, [idCliente], (err, result) => {
        if (err || result.length === 0) {
            console.error('Error al obtener crédito activo:', err);
            return res.status(400).json({ error: true, message: 'No se encontró un crédito activo para este cliente' });
        }

        const creditoActual = result[0];
        const semanasPagadas = creditoActual.semanasPagadas;
        const semanasTotales = creditoActual.semanasTotales;
        const abonoAnterior = creditoActual.abonoSemanal;
        const semanasRestantes = semanasTotales - semanasPagadas;

        // Validar si puede renovar según el crédito actual
        const semanasMinimas = semanasInt === 12 ? 10 : 14;
        if (semanasPagadas < semanasMinimas) {
            return res.status(400).json({
                error: true,
                message: `El cliente debe haber pagado al menos ${semanasMinimas} semanas para renovar un crédito de ${semanasInt} semanas`
            });
        }

        // Calcular descuento de semanas restantes si no ha terminado
        const descuentoSemanasRestantes = semanasRestantes > 0 ? semanasRestantes * abonoAnterior : 0;

        // Obtener clasificación del cliente
        const queryClasificacion = `SELECT clasificacion FROM clientes WHERE idCliente = ?`;
        db.query(queryClasificacion, [idCliente], (errClas, resultClas) => {
            if (errClas || resultClas.length === 0) {
                console.error('Error al obtener clasificación:', errClas);
                return res.status(500).json({ error: true, message: 'Error al obtener clasificación del cliente' });
            }

            const clasificacion = resultClas[0].clasificacion.toUpperCase();

            // Validaciones por clasificación
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
                    if (montoNum <= 7500) valido = true;
                    break;
                default:
                    return res.status(400).json({ error: true, message: 'Clasificación del cliente no válida' });
            }

            if (!valido) {
                return res.status(400).json({ error: true, message: 'El monto no cumple con la clasificación del cliente' });
            }

            // Cálculo de efectivo
            const efectivo = montoNum - recargosNum - atrasosNum - descuentoSemanasRestantes;

            // Insertar nuevo crédito
            const insertCredito = `
                INSERT INTO creditos
                (idCliente, monto, semanas, horarioEntrega, fechaEntrega, fechaVencimiento, recargos, abonoSemanal, estado, tipoCredito, efectivo)
                VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, 'Activo', 'renovación', ?)
            `;

            db.query(insertCredito, [idCliente, montoNum, semanasInt, horarioEntrega, fechaVencimientoF, recargosNum, abonoSemanal, efectivo], (err2, result2) => {
                if (err2) {
                    console.error('Error al registrar nuevo crédito:', err2);
                    return res.status(500).json({ error: true, message: 'Error al guardar el crédito de renovación' });
                }

                const idCredito = result2.insertId;

                // Generar pagos esperados del nuevo crédito
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

                    // Marcar semanas faltantes del crédito anterior como pagadas
                    const updatePagosAnteriores = `
                        UPDATE pagos
                        SET cantidadPagada = ?, fechaPagada = CURDATE(), estado = 'Pagado'
                        WHERE idCredito = ? AND estado = 'Pendiente'
                        ORDER BY numeroSemana
                        LIMIT ?
                    `;

                    db.query(updatePagosAnteriores, [abonoAnterior, creditoActual.idCredito, semanasRestantes], (err4) => {
                        if (err4) {
                            console.error('Error al actualizar pagos anteriores:', err4);
                            return res.status(500).json({ error: true, message: 'Crédito creado, pero no se pudieron marcar como pagadas las semanas anteriores' });
                        }

                        // Cambiar estado del crédito anterior a 'Pagado'
                        const updateCreditoAnterior = `UPDATE creditos SET estado = 'Pagado' WHERE idCredito = ?`;
                        db.query(updateCreditoAnterior, [creditoActual.idCredito], (err5) => {
                            if (err5) {
                                console.error('Error al actualizar estado del crédito anterior:', err5);
                                return res.status(500).json({ error: true, message: 'Crédito creado, pero no se pudo actualizar el estado del crédito anterior' });
                            }

                            return res.status(201).json({
                                abonoSemanal,
                                efectivo,
                                mensaje: 'Crédito de renovación registrado. Semanas anteriores pagadas y crédito anterior marcado como Pagado.'
                            });
                        });
                    });
                });
            });
        });
    });
};




const createAdditionalCredit = (req, res) =>{

}


module.exports = {
    createNewCredit,
    createRenewCredit,
    createAdditionalCredit
};
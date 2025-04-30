const db = require('../db');
const TABLE_CLIENTES = 'clientes';
const TABLE_CREDITOS = 'creditos';
const TABLE_PAGOS = 'pagos';
<<<<<<< HEAD

const getClient = (req, res) => {
    const { nombreCompleto, modulo } = req.body;
    console.log("Lo que se recibe del front: ", req.body);

    if (!nombreCompleto) {
        return res.status(400).json({ error: 'El nombre completo es requerido' });
    }

    const queryCliente = `
        SELECT idCliente, nombre, apellidoPaterno, apellidoMaterno, telefono, domicilio, clasificacion, tipoCliente
        FROM ${TABLE_CLIENTES}
        WHERE CONCAT_WS(' ', nombre, apellidoPaterno, apellidoMaterno) COLLATE utf8mb4_general_ci LIKE ?
    `;
    const formattedNombre = `%${nombreCompleto.trim()}%`;

    db.query(queryCliente, [formattedNombre], (err, clienteRows) => {
        if (err) {
            console.error('Error al buscar cliente:', err);
            return res.status(500).json({ error: 'Error del servidor' });
        }

        if (clienteRows.length === 0) {
            return res.status(404).json({ message: 'Cliente no encontrado' });
        }

        const cliente = clienteRows[0];
        const idCliente = cliente.idCliente;

        const modulosSoloCliente = ['modify', 'consult', 'collectors'];
        if (modulosSoloCliente.includes(modulo)) {
            return res.status(200).json({ cliente });
        }

        const queryCredito = `
            SELECT * FROM ${TABLE_CREDITOS}
            WHERE idCliente = ? 
            ORDER BY fechaEntrega DESC
=======
// credits.controller.js
const getClient = (nombreCompleto) => {
    return new Promise((resolve, reject) => {
        const queryCliente = `
            SELECT idCliente, nombre, apellidoPaterno, apellidoMaterno, telefono, domicilio, clasificacion, tipoCliente
            FROM ${TABLE_CLIENTES}
            WHERE CONCAT_WS(' ', nombre, apellidoPaterno, apellidoMaterno) COLLATE utf8mb4_general_ci LIKE ?
>>>>>>> 13233ec5a471bc747dee2dd3a1359ab7dabdaa7b
        `;
        const formattedNombre = `%${nombreCompleto.trim()}%`;

        db.query(queryCliente, [formattedNombre], (err, clienteRows) => {
            if (err) return reject('Error al buscar cliente');

<<<<<<< HEAD

            const creditos = creditoRows;
            console.log("Creditos: ", creditos);
=======
            if (clienteRows.length === 0) return resolve(null);

            const cliente = clienteRows[0];
            const idCliente = cliente.idCliente;
>>>>>>> 13233ec5a471bc747dee2dd3a1359ab7dabdaa7b

            const queryCredito = `
                SELECT idCredito, monto, fechaEntrega
                FROM ${TABLE_CREDITOS}
                WHERE idCliente = ? AND estado = 'activo'
                LIMIT 1
            `;

            db.query(queryCredito, [idCliente], (err, creditoRows) => {
                if (err) return reject('Error al buscar crédito');

                const credito = creditoRows[0] || null;

<<<<<<< HEAD
                return res.status(200).json({
                    cliente,
                    creditos,
                    pagos
=======
                const queryPagos = `
                    SELECT numeroSemana, cantidad, estado
                    FROM ${TABLE_PAGOS}
                    WHERE idCredito = ? AND estado = 'pagado'
                    ORDER BY numeroSemana DESC
                    LIMIT 1
                `;

                db.query(queryPagos, [credito ? credito.idCredito : null], (err, pagosRows) => {
                    if (err) return reject('Error al buscar pagos');

                    const pagos = pagosRows.length > 0 ? pagosRows : [];

                    return resolve({
                        cliente,
                        credito,
                        pagos
                    });
>>>>>>> 13233ec5a471bc747dee2dd3a1359ab7dabdaa7b
                });
            });
        });
    });
};




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

        // Primero buscamos la clasificación del cliente
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

            // Validaciones de monto mínimo general
            if (semanasInt === 12 && montoNum < 1000) {
                return res.status(400).json({ error: 'El monto mínimo para 12 semanas es de $1000' });
            }
            if (semanasInt === 16 && montoNum < 4000) {
                return res.status(400).json({ error: 'El monto mínimo para 16 semanas es de $4000' });
            }

            // Validaciones de monto y semanas según la clasificación
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
                    if ((semanasInt === 12 || semanasInt === 16) && montoNum >= 7500) validacionCorrecta = true;
                    break;
                default:
                    return res.status(400).json({ error: 'Clasificación del cliente no válida' });
            }

            if (!validacionCorrecta) {
                return res.status(400).json({ error: 'El monto no cumple con las condiciones de la clasificación' });
            }

            // Si todo ok, seguimos
            let factor;
            if (semanasInt === 12) {
                factor = 1.5;
            } else if (semanasInt === 16) {
                factor = 1.583;
            } else {
                return res.status(400).json({ error: 'Solo se permiten créditos de 12 o 16 semanas' });
            }

            const totalAPagar = montoNum * factor;
            const abonoSemanal = Math.round(totalAPagar / semanasInt);

            const recargosNum = parseFloat(recargos ?? 0);
            const atrasosNum = parseFloat(atrasos ?? 0);
            const efectivo = montoNum - recargosNum - atrasosNum;

            const query = `
                INSERT INTO ${TABLE_CREDITOS} 
                (idCliente, monto, semanas, horarioEntrega, fechaEntrega, fechaVencimiento, recargos, abonoSemanal, estado, tipoCredito)
                VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, 'Activo', 'nuevo')
            `;
            db.query(
                query,
                [idCliente, montoNum, semanasInt, horarioEntrega, fechaVencimientoF, recargos ?? null, abonoSemanal],
                (err, result) => {
                    if (err) {
                        console.error('Error al registrar crédito:', err);
                        return res.status(500).json({ error: 'Error al guardar el crédito' });
                    }

                    const idCredito = result.insertId;

                    // Ahora registramos los pagos esperados
                    const pagosQuery = `
                        INSERT INTO ${TABLE_PAGOS} (idCredito, numeroSemana, cantidad, fechaEsperada, cantidadPagada, estado)
                        VALUES
                    `;

                    let pagosValues = [];
                    for (let i = 0; i < semanasInt; i++) {
                        const fechaPago = new Date(primerSábadoSiguiente);
                        fechaPago.setDate(primerSábadoSiguiente.getDate() + (i + 1) * 7); // (i+1) semanas después
                        const fechaPagoFormateada = fechaPago.toISOString().split('T')[0];

                        pagosValues.push(`(${idCredito}, ${i + 1}, ${abonoSemanal}, '${fechaPagoFormateada}', NULL, 'Pendiente')`);
                    }

                    db.query(pagosQuery + pagosValues.join(', '), (err3, result2) => {
                        if (err3) {
                            console.error('Error al registrar pagos:', err3);
                            return res.status(500).json({ error: 'Error al guardar los pagos' });
                        }

                        return res.status(201).json({
                            message: 'Crédito registrado correctamente',
                            abonoSemanal: abonoSemanal,
                            efectivo: efectivo
                        });
                    });
                }
            );
        });
    }
};



module.exports = {
    getClient, 
    createNewCredit
};

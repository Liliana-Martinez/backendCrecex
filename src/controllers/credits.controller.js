const db = require('../db');
const TABLE_CLIENTES = 'clientes';
const TABLE_CREDITOS = 'creditos';
const TABLE_PAGOS = 'pagos';
const getClient = (req, res) => {
    const { nombreCompleto, modulo } = req.body;

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

        // Módulos que solo necesitan saber si el cliente existe y obtener datos básicos
        const modulosSoloCliente = ['modify', 'consult', 'collectors'];
        if (modulosSoloCliente.includes(modulo)) {
            return res.status(200).json({ cliente });
        }

        // Módulos que necesitan también información de crédito y pagos
        const queryCredito = `
            SELECT monto, fechaEntrega
            FROM ${TABLE_CREDITOS}
            WHERE idCliente = ?
            LIMIT 1
        `;

        const queryPagos = `
            SELECT numeroSemana, cantidad
            FROM ${TABLE_PAGOS}
            WHERE idCliente = ?
        `;

        db.query(queryCredito, [idCliente], (err, creditoRows) => {
            if (err) {
                console.error('Error al buscar crédito:', err);
                return res.status(500).json({ error: 'Error al buscar crédito' });
            }

            const credito = creditoRows.length > 0 ? creditoRows[0] : {};

            db.query(queryPagos, [idCliente], (err, pagosRows) => {
                if (err) {
                    console.error('Error al buscar pagos:', err);
                    return res.status(500).json({ error: 'Error al buscar pagos' });
                }

                const pagos = pagosRows.length > 0 ? pagosRows : [];

                return res.status(200).json({
                    cliente,
                    credito,
                    pagos
                });
            });
        });
    });
};

const createNewCredit = (req, res) => {
    const { idCliente, monto, semanas, horarioEntrega, recargos, modulo } = req.body;

    if (!idCliente || !monto || !semanas || !horarioEntrega) {
        return res.status(400).json({ error: 'Faltan datos obligatorios para registrar el crédito' });
    }

    // Aquí se puede agregar lógica específica por módulo
    if (modulo === 'new') {
        const hoy = new Date();
    const primerSábadoSiguiente = new Date(hoy);
    const diasHastaSábado = (6 - hoy.getDay() + 7) % 7; // Sábado = 6
    primerSábadoSiguiente.setDate(hoy.getDate() + diasHastaSábado);
    const primerSabadoFormateado = primerSábadoSiguiente.toISOString().split('T')[0];

    // Calcular fecha de vencimiento
    const semanasInt = parseInt(semanas, 10);
    const fechaVencimiento = new Date(primerSábadoSiguiente);
    fechaVencimiento.setDate(primerSábadoSiguiente.getDate() + semanasInt * 7);
    const fechaVencimientoF = fechaVencimiento.toISOString().split('T')[0];

    // Calcular abono semanal automáticamente
    const montoNum = parseFloat(monto);
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

    // Registrar crédito
    const query = `
        INSERT INTO ${TABLE_CREDITOS} 
        (idCliente, monto, semanas, horarioEntrega, fechaEntrega, fechaVencimiento, recargos, abonoSemanal, estado)
        VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, 'Activo')
    `;
    db.query(
        query,
        [idCliente, monto, semanasInt, horarioEntrega, fechaVencimientoF, recargos ?? null, abonoSemanal],
        (err, result) => {
            if (err) {
                console.error('Error al registrar crédito:', err);
                return res.status(500).json({ error: 'Error al guardar el crédito' });
            }
            return res.status(201).json({
                message: 'Crédito registrado correctamente',
                abonoSemanal: abonoSemanal
            });
        }
    );
        // Lógica para crear un nuevo crédito
    } else if (modulo === 'renew') {
        // Lógica para renovar el crédito
    } else if (modulo === 'additional') {
        // Lógica para créditos adicionales
    } else if (modulo === 'collectors') {
        // Lógica para colecciones o pagos pendientes
    }
};

module.exports = {
    getClient, 
    createNewCredit
};


const db = require('../db');
const TABLE_CLIENTES = 'clientes';
const TABLE_CREDITOS = 'creditos';
const TABLE_PAGOS = 'pagos';

const getClient = (req, res) => {
    const { nombreCompleto } = req.body;

    if (!nombreCompleto) {
        return res.status(400).json({ error: 'El nombre completo es requerido' });
    }

    const queryCliente = `
        SELECT idCliente, nombre, telefono, domicilio, clasificacion, tipoCliente
        FROM ${TABLE_CLIENTES}
        WHERE CONCAT(nombre, ' ', apellidoPaterno, ' ', apellidoMaterno) = ?
    `;

    db.query(queryCliente, [nombreCompleto], (err, clienteRows) => {
        if (err) {
            console.error('Error al buscar cliente:', err);
            return res.status(500).json({ error: 'Error del servidor' });
        }

        if (clienteRows.length === 0) {
            return res.status(404).json({ message: 'Cliente no encontrado' });
        }

        const cliente = clienteRows[0];
        const idCliente = cliente.idCliente;

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
//Viene los datos del front para que los agregue a la base de datos
const createNewCredit = (req, res) => {
    const { idCliente, monto, semanas, horarioEntrega, recargos } = req.body;

    if (!idCliente || !monto || !semanas || !horarioEntrega) {
        return res.status(400).json({ error: 'Faltan datos obligatorios para registrar el crédito' });
    }
    // Calcular el primer sábado siguiente
    const hoy = new Date();
    const primerSábadoSiguiente = new Date(hoy);
    const diasHastaSábado = (6 - hoy.getDay() + 7) % 7 ; // Siguiente sábado
    primerSábadoSiguiente.setDate(hoy.getDate() + diasHastaSábado);
    
    const primerSabadoFormateado = primerSábadoSiguiente.toISOString().split('T')[0];

    // Calcular la fecha de vencimiento
    const semanasInt = parseInt(semanas, 10);
    const fechaVencimiento = new Date(primerSábadoSiguiente);
    fechaVencimiento.setDate(primerSábadoSiguiente.getDate() + semanasInt * 7);
    const fechaVencimientoF = fechaVencimiento.toISOString().split('T')[0];

    const query = `
        INSERT INTO ${TABLE_CREDITOS} (idCliente, monto, semanas, horarioEntrega, fechaEntrega, fechaVencimiento, recargos)
        VALUES (?, ?, ?, ?, NOW(),?,?)
    `;

    db.query(
        query,
        [idCliente, monto, semanas, horarioEntrega, fechaVencimientoF, recargos ?? null],
        (err, result) => {
            if (err) {
                console.error('Error al registrar crédito:', err);
                return res.status(500).json({ error: 'Error al guardar el crédito' });
            }

            return res.status(201).json({
                message: 'Crédito registrado correctamente',
            });
        }
    );
};

module.exports = {
    getClient, 
    createNewCredit
};

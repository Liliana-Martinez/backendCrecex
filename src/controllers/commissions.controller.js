const db = require('../db');


const getCreditsWeekByZone = (req, res) => {
  const { idZona } = req.query;
  if (!idZona) return res.status(400).json({ error: 'Se requiere idZona' });

  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Dom, 6=Sáb

  //  SÁBADO inicio de senmna
  const saturday = new Date(today);
  saturday.setDate(today.getDate() - ((dayOfWeek + 1) % 7));
  saturday.setHours(0, 0, 0, 0);

  //  VIERNES cierre semna
  const friday = new Date(saturday);
  friday.setDate(saturday.getDate() + 6);
  friday.setHours(23, 59, 59, 999);

  // Cantidad de creeditos creados en la semana y recargos de créditos
  db.query(
    `SELECT COUNT(*) AS cantidad,
            SUM(c.recargos) AS recargosCreditos
     FROM creditos c
     JOIN clientes cl ON c.idCliente = cl.idCliente
     WHERE cl.idZona = ? AND c.fechaEntrega >= ? AND c.fechaEntrega <= ?`,
    [idZona, saturday, friday],
    (err, creditRows) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error al obtener créditos' });
      }

      const cantidad = creditRows[0]?.cantidad || 0;
      const recargosCreditos = creditRows[0]?.recargosCreditos || 0;
      const total = cantidad * 100;

      // Recargos de pagos pagados en la semana (sábado a viernes)
      db.query(
        `SELECT SUM(p.recargos) AS recargosPagos
         FROM pagos p
         JOIN creditos c ON p.idCredito = c.idCredito
         JOIN clientes cl ON c.idCliente = cl.idCliente
         WHERE cl.idZona = ? AND p.fechaPagada >= ? AND p.fechaPagada <= ?`,
        [idZona, saturday, friday],
        (err2, pagoRows) => {
          if (err2) {
            console.error(err2);
            return res.status(500).json({ error: 'Error al obtener recargos de pagos' });
          }

          const recargosPagos = pagoRows[0]?.recargosPagos || 0;
          const totalRecargos = recargosCreditos + recargosPagos;

          // Abonos esperados SOLO de esta semana (fechaEsperada sábado viernes) y créditos activos
          db.query(
            `SELECT SUM(p.cantidad) AS totalAbonosPosibles
             FROM pagos p
             JOIN creditos c ON p.idCredito = c.idCredito
             JOIN clientes cl ON c.idCliente = cl.idCliente
             WHERE cl.idZona = ? 
               AND c.estado = 'Activo'
               AND p.fechaEsperada >= ?
               AND p.fechaEsperada <= ?`,
            [idZona, saturday, friday],
            (err3, abonoRows) => {
              if (err3) {
                console.error(err3);
                return res.status(500).json({ error: 'Error al obtener abonos' });
              }
              const totalAbonosPosibles = abonoRows[0]?.totalAbonosPosibles || 0;
              // Lo realmente cobrado en la semana (pagado sábado aa viernes)
              db.query(
                `SELECT SUM(p.cantidadPagada) AS totalCobrado
                 FROM pagos p
                 JOIN creditos c ON p.idCredito = c.idCredito
                 JOIN clientes cl ON c.idCliente = cl.idCliente
                 WHERE cl.idZona = ? 
                   AND p.fechaPagada >= ? 
                   AND p.fechaPagada <= ?`,
                [idZona, saturday, friday],
                (err4, cobradoRows) => {
                  if (err4) {
                    console.error(err4);
                    return res.status(500).json({ error: 'Error al obtener cobros' });
                  }

                  const totalCobrado = cobradoRows[0]?.totalCobrado || 0;

                  // Porcentaje realmente cobrado
                  const porcentajeCobrado = totalAbonosPosibles > 0
                    ? (totalCobrado / totalAbonosPosibles) * 100
                    : 0;

                  // Comisión según porcentaje
                  let porcentajeComision = 0;
                  if (porcentajeCobrado >= 100) porcentajeComision = 0.08;
                  else if (porcentajeCobrado >= 90) porcentajeComision = 0.07;
                  else if (porcentajeCobrado >= 80) porcentajeComision = 0.06;
                  else if (porcentajeCobrado >= 70) porcentajeComision = 0.05;
                  else if (porcentajeCobrado >= 60) porcentajeComision = 0.04;
                  else if (porcentajeCobrado >= 50) porcentajeComision = 0.03;
                  else if (porcentajeCobrado >= 40) porcentajeComision = 0.02;
                  else if (porcentajeCobrado >= 30) porcentajeComision = 0.01;
                  else if (porcentajeCobrado > 20) porcentajeComision = 0;

                  const comision = totalAbonosPosibles * porcentajeComision;

                  res.json({
                    cantidad,
                    total,
                    totalRecargos,
                    totalAbonosPosibles,
                    totalCobrado,
                    porcentajeCobrado: porcentajeCobrado.toFixed(2) + '%',
                    porcentajeComision: (porcentajeComision * 100) + '%',
                    comision,
                    rango: {
                      inicio: saturday,
                      fin: friday
                    }
                  });
                }
              );
            }
          );
        }
      );
    }
  );
};



module.exports = { getCreditsWeekByZone };


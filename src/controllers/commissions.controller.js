const db = require('../db');

const getCreditsWeekByZone = (req, res) => {
  const { idZona } = req.query;
  if (!idZona) return res.status(400).json({ error: 'Se requiere idZona' });

  const today = new Date();
  const dayOfWeek = today.getDay();

  // 👉 Lunes de esta semana
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
  monday.setHours(0, 0, 0, 0);

  // 👉 Sábado de esta semana (cierre)
  const saturday = new Date(monday);
  saturday.setDate(monday.getDate() + 5); // lunes + 5 días = sábado
  saturday.setHours(23, 59, 59, 999);

  // Cantidad de créditos y recargos de créditos
  db.query(
    `SELECT COUNT(*) AS cantidad,
            SUM(c.recargos) AS recargosCreditos
     FROM creditos c
     JOIN clientes cl ON c.idCliente = cl.idCliente
     WHERE cl.idZona = ? AND c.fechaEntrega >= ? AND c.fechaEntrega <= ?`,
    [idZona, monday, saturday],
    (err, creditRows) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error al obtener créditos' });
      }

      const cantidad = creditRows[0]?.cantidad || 0;
      const recargosCreditos = creditRows[0]?.recargosCreditos || 0;
      const total = cantidad * 100;

      // 👉 Recargos de pagos en la misma semana (lunes-sábado)
      db.query(
        `SELECT SUM(p.recargos) AS recargosPagos
         FROM pagos p
         JOIN creditos c ON p.idCredito = c.idCredito
         JOIN clientes cl ON c.idCliente = cl.idCliente
         WHERE cl.idZona = ? AND p.fechaPagada >= ? AND p.fechaPagada <= ?`,
        [idZona, monday, saturday],
        (err2, pagoRows) => {
          if (err2) {
            console.error(err2);
            return res.status(500).json({ error: 'Error al obtener recargos de pagos' });
          }

          const recargosPagos = pagoRows[0]?.recargosPagos || 0;
          const totalRecargos = recargosCreditos + recargosPagos;

          // 👉 Abonos esperados SOLO de los pagos de esta semana (lunes-sábado)
          db.query(
            `SELECT SUM(p.cantidad) AS totalAbonosPosibles
             FROM pagos p
             JOIN creditos c ON p.idCredito = c.idCredito
             JOIN clientes cl ON c.idCliente = cl.idCliente
             WHERE cl.idZona = ? 
               AND c.estado = 'Activo'
               AND p.fechaEsperada >= ?
               AND p.fechaEsperada <= ?`,
            [idZona, monday, saturday],
            (err3, abonoRows) => {
              if (err3) {
                console.error(err3);
                return res.status(500).json({ error: 'Error al obtener abonos' });
              }

              const totalAbonosPosibles = abonoRows[0]?.totalAbonosPosibles || 0;

              // 👉 Lo realmente cobrado en pagos de esta semana (lunes-sábado)
              db.query(
                `SELECT SUM(p.cantidadEfectivo) AS totalCobrado
                 FROM pagos p
                 JOIN creditos c ON p.idCredito = c.idCredito
                 JOIN clientes cl ON c.idCliente = cl.idCliente
                 WHERE cl.idZona = ? 
                   AND p.fechaPagada >= ? 
                   AND p.fechaPagada <= ?`,
                [idZona, monday, saturday],
                (err4, cobradoRows) => {
                  if (err4) {
                    console.error(err4);
                    return res.status(500).json({ error: 'Error al obtener cobros' });
                  }

                  const totalCobrado = cobradoRows[0]?.totalCobrado || 0;

                  // 👉 Porcentaje realmente cobrado
                  const porcentajeCobrado = totalAbonosPosibles > 0
                    ? (totalCobrado / totalAbonosPosibles) * 100
                    : 0;

                  // 👉 Comisión según porcentaje
                  let porcentajeComision = 0;
                  if (porcentajeCobrado === 100) porcentajeComision = 0.08;
                  else if (porcentajeCobrado >= 90) porcentajeComision = 0.07;
                  else if (porcentajeCobrado >= 80) porcentajeComision = 0.06;
                  else if (porcentajeCobrado >= 70) porcentajeComision = 0.05;
                  else if (porcentajeCobrado >= 60) porcentajeComision = 0.04;
                  else if (porcentajeCobrado >= 50) porcentajeComision = 0.03;
                  else if (porcentajeCobrado >= 40) porcentajeComision = 0.02;
                  else if (porcentajeCobrado > 0) porcentajeComision = 0.01;

                  const comision = totalAbonosPosibles * porcentajeComision;

                  res.json({
                    cantidad,
                    total,
                    totalRecargos,
                    totalAbonosPosibles,
                    totalCobrado,
                    porcentajeCobrado: porcentajeCobrado.toFixed(2) + '%',
                    porcentajeComision: (porcentajeComision * 100) + '%',
                    comision
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


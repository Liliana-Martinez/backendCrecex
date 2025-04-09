const express = require('express');
const router = express.Router();
const middleware = require('./middleware');
const creditsController = require('../controllers/credits.controller');
router.post('/request', creditsController.getClient);
router.post('/registrar', creditsController.createNewCredit);
const getClient = async (req, res) => {
    try {
        const { nombreCompleto } = req.body; // o req.query, si usas GET
        if (!nombreCompleto) {
            return res.status(400).json({ error: 'El nombre completo es requerido' });
        }
        const query = `
            SELECT * FROM ${TABLE}
            WHERE CONCAT(nombre, ' ', apellido_paterno, ' ', apellido_materno) = ?
        `;
        db.query(query, [nombreCompleto], (err, rows) => {
            if (err) {
                console.error('Error al buscar cliente:', err);
                return res.status(500).json({ error: 'Error del servidor' });
            }
            if (rows.length === 0) {
                return res.status(404).json({ message: 'Cliente no encontrado' });
            }
            return res.status(200).json(rows[0]);
        });
    } catch (error) {
        console.error('Error inesperado:', error);
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
};
module.exports = router;

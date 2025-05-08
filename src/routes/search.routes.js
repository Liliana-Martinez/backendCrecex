const express = require('express');
const router = express.Router();
const searchController = require('../controllers/search.controller');
router.post('/cliente', async (req, res) => {
    try {
        const { nombreCompleto, modulo } = req.body;

        console.log('Nombre recibido:', nombreCompleto);
        console.log('Módulo solicitado:', modulo);

        let result;

        switch (modulo) {
            case 'new':
            case 'renew':
            case 'additional':
                result = await searchController.SearchCredit(nombreCompleto);
                break;
            case 'collectors':
                result = await searchController.SearchCollectors(nombreCompleto);
                break;
            case 'consult':
                result = await searchController.SearchConsult(nombreCompleto);
                break;
            case 'modify':
                result = await searchController.SearchModify(nombreCompleto);
                break;
            default:
                return res.status(400).json({ message: 'Módulo no reconocido' });
        }

        res.status(200).json(result);
    } catch (error) {
        console.error('Error al procesar la solicitud:', error);

        res.status(500).json({ message: 'Error en el servidor' });
    }
});
module.exports = router;

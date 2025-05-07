const express = require('express');
const router = express.Router();
const creditsController = require('../controllers/credits.controller');
const middleware = require('./middleware');
const creditsController = require('../controllers/credits.controller');
router.post('/new', creditsController.createNewCredit);

router.post('/buscar-cliente', async (req, res) => {
    try {
        const { nombreCompleto, modulo } = req.body;

        console.log('Nombre recibido:', nombreCompleto);
        console.log('Módulo solicitado:', modulo);

        let result;

        switch (modulo) {
            case 'new':
            case 'renew':
            case 'additional':
                result = await creditsController.SearchCredit(nombreCompleto);
                break;
            case 'collectors':
                result = await creditsController.SearchCollectors(nombreCompleto);
                break;
            case 'consult':
                result = await creditsController.SearchConsult(nombreCompleto);
                break;
            case 'modify':
                result = await creditsController.SearchModify(nombreCompleto);
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

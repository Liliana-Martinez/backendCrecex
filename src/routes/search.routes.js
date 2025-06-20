const express = require('express');
const router = express.Router();
const searchController = require('../controllers/search.controller');
router.post('/cliente', async (req, res) => {
    try {
        const { nombreCompleto, modulo, selectedOption } = req.body;

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
                try {
                    const resultado = await searchController.searchConsult(nombreCompleto);
                    return res.json(resultado);
                } catch (error) {
                    console.error('Error al consultar el cliente: ', error);
                    res.status(404).json({ error: 'Error en la busqueda del cliente' });

                }
                break;
            case 'modify':
                try {
                    let resultado;
                    if (selectedOption === 'client') {
                        resultado = await searchController.searchModifyClient(nombreCompleto);
                    } else if (selectedOption === 'guarantorp' || selectedOption === 'guarantors') {
                        resultado = await searchController.searchModifyGuarantor(nombreCompleto);
                    } else {
                        return res.status(400).json({ message: 'Opción no reconocida' });
                    }
                    return res.json(resultado);
                    /** */
                } catch (error) {
                    console.error('Error al modificar datos', error);
                    return res.status(500).json({ error: 'Error al modificar datos' });
                }

            default:
                return res.status(400).json({ message: 'Módulo no reconocido' });

        }

        return res.status(200).json(result);

    } catch (error) {
        console.error('Error al procesar la solicitud:', error);
        return res.status(error.code || 500).json({ message: error.message || 'Error en el servidor' });
    }
});

module.exports = router;

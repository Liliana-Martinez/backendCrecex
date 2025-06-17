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
                
            case 'modify':
                try {
                    let resultado;

                    if (selectedOption === 'client') {
                        resultado = await searchController.searchModifyClient(nombreCompleto);
                    } else if (selectedOption === 'guarantorp' || selectedOption === 'guarantors') {
                        resultado = await searchController.searchModifyGuarantor(nombreCompleto);
                        console.log('Datos de los avales del cliente para modificar losavales');
                    } else {
                        return res.status(400).json({ message: 'Opción no reconocida' });
                    }

                    console.log('Resultado: ', resultado);
                    return res.json(resultado);
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

        // Aquí usamos el código personalizado si existe, si no mandamos 500
        return res.status(error.code || 500).json({ message: error.message || 'Error en el servidor' });
    }
});

module.exports = router;

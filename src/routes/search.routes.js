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
            case 'additional':
                result = await searchController.SearchCredit(nombreCompleto);
                break;
            case 'renew':
                result = await searchController.SearchCreditRenew(nombreCompleto);
                break; 
            case 'collectors':
                result = await searchController.SearchCollectors(nombreCompleto);
                break;
            case 'consult':
                result = await searchController.searchConsult(nombreCompleto);  
                break;
            case 'modify':
                if (selectedOption === 'client') {
                    result = await searchController.searchModifyClient(nombreCompleto);
                } else if (selectedOption === 'guarantorp' || selectedOption === 'guarantors') {
                    result = await searchController.searchModifyGuarantor(nombreCompleto);
                } 
        }
        return res.status(200).json(result);
    } catch (error) {
        console.error('Error al procesar la solicitud:', error);
        
        //Manejo personalizado de los errores
        if (error.message === 'Cliente no encontrado') {
            return res.status(404).json({ message: 'Cliente no encontrado'});
        }


        //Otros errores
        return res.status(500).json({ message: error.message || 'Error interno del servidor.'});
    }
});
module.exports = router;
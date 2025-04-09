const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
//const moment = require('moment');
const authController = require('../controllers/auth.controller');
const middleware = require('./middleware');

// Ruta para el registro
router.post('/register', async (req, res) => {
    const { user, password } = req.body;

    try {
        // Verificar si el usuario ya existe
        const existingUser = await authController.getUser(user);
        if (existingUser) {
            return res.status(400).json({ error: 'El usuario ya existe' });
        }

        // Hash de la contraseña
        req.body.password = bcrypt.hashSync(password, 10);

        // Insertar el nuevo usuario
        const result = await authController.insert(req.body);
        res.json(result);
    } catch (error) {
        console.error('Error en el registro', error);
        res.status(500).json({ error: 'Ocurrio un error al registrar el usuario' });
    }
});

// Ruta para el login
router.post('/login', async (req, res) => {
    const user = await authController.getUser(req.body.user);
    
    if (user === undefined) {
        return res.status(401).json({ error: 'Error, usuario o contraseña incorrectos' });
    }

    const equals = bcrypt.compareSync(req.body.password, user.password);
    if (!equals) {
        return res.status(401).json({ error: 'Error, usuario o contraseña incorrectos' });
    }

    res.json({
        succesfull: createToken(user),
        done: 'Inicio de sesión correcto'
    });
});

// Función para crear el token
const createToken = (user) => {
    let payload = {
        userId: user.id,
    };

    return jwt.sign(payload, process.env.TOKEN_KEY, { expiresIn: '1d' }); // Expira en 1 día
};

// Middleware para proteger rutas
router.use(middleware.checkToken);

// Ruta protegida para obtener datos del usuario principal
router.get('/mainUser', (req, res) => {
    authController.getById(req.userId)
        .then(rows => {
            res.json(rows);
        })
        .catch(err => console.log(err));
});

module.exports = router;

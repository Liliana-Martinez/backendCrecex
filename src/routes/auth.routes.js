const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const moment = require('moment');
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

        req.body.password = bcrypt.hashSync(password, 10);
        const result = await authController.insert(req.body);
        res.json(result);
    } catch (error) {
        console.error('Error en el registro', error);
        res.status(500).json({ error: 'Ocurrió un error al registrar el usuario' });
    }
});

// Función para crear el token
const createToken = (user) => {
    let payload = {
        userId: user.id,
    };

    return jwt.sign(payload, process.env.TOKEN_KEY, { expiresIn: '1d' }); // Expira en 1 día
};

// Ruta para el login
router.post('/login', async (req, res) => {
    const user = await authController.getUser(req.body.user);
    if (user === undefined) {
        res.status(401).json({ error: 'Error, usuario o contraseña incorrectos' });
    } else {
        const equals = bcrypt.compareSync(req.body.password, user.password);
        if (!equals) {
            res.status(401).json({ error: 'Error, usuario o contraseña incorrectos' });
        } else {
            res.json({
                succesfull: createToken(user),
                done: 'Inicio de sesión correcto'
            });
        }
    }
});

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

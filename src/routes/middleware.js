const jwt = require('jsonwebtoken');
const moment = require('moment');

const checkToken = (req, res, next) => {
    const token = req.headers['user_token'];

    if (!token) {
        return res.status(403).json({ error: 'Debes incluir el encabezado' });
    }

    let payload = null;
    try {
        // Usar `jwt.verify` para validar la firma y decodificar el token
        payload = jwt.verify(token, process.env.TOKEN_KEY); // Cambié `decode` por `verify`
    } catch (err) {
        return res.status(401).json({ error: 'Token inválido' });
    }

    // Verifica si el token ha expirado
    if (moment().unix() > payload.expiresAt) {
        return res.status(401).json({ error: 'Token expirado' });
    }

    // Si todo es correcto, se pasa el `userId` al request
    req.userId = payload.userId;

    // Llama a `next()` solo si todo es válido
    next();
};

module.exports = {
    checkToken
};

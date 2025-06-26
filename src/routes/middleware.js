const jwt = require('jsonwebtoken');
const moment = require('moment');

const checkToken = (req, res, next) => {
    const token = req.headers['user_token'];

    if (!token) {
        return res.status(403).json({ error: 'Debes incluir el encabezado' });
    }

    let payload = null;
    try {
        payload = jwt.verify(token, process.env.TOKEN_KEY);
    } catch (err) {
        return res.status(401).json({ error: 'Token inválido' });
    }

    if (moment().unix() > payload.expiresAt) {
        return res.status(401).json({ error: 'Token expirado' });
    }
    req.userId = payload.userId;

    next();
};

module.exports = {
    checkToken
};

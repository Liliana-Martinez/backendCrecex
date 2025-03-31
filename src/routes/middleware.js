const jwt = require('jsonwebtoken');
const moment = require('moment');

const checkToken = (req, res, next) => {
    if (!req.headers['user_token']) {
        return res.json({ error: 'Debes incluir el encabezado'});
    }  

    const token = req.headers['user_token'];
    let payload = null;
    try {
        payload = jwt.decode(token, process.env.TOKEN_KEY);
    } catch (err) {
        return res.json({ error: 'Token invalido' });
    }
     if (moment().unix() > payload.expiresAt) {
        return res.json({ error: 'Token expirado' });
     }

     req.userId = payload.userId;

     next();
};

module.exports = {
    checkToken
}
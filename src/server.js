const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
require('./db');

const authRoutes = require('./routes/auth.routes');
const creditsRouter = require('./routes/credits.routes');
const paymentsRouter = require('./routes/payments.routes')
const app = express(); //Crea instancia de express que es la app del servidor


//Middleware
app.use(express.json());
app.use(morgan('dev'));

app.use(cors());
app.use(express.json());

//Definicion de las rutas base de los modulos
app.use('/api/auth', authRoutes);
app.use('/api/credits', creditsRouter);
app.use('/api/payments', paymentsRouter);
module.exports = app;
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
require('./db');
require('../src/routes/cronJobs'); 


const authRoutes = require('./routes/auth.routes');
const clienGrntRoutes = require('./routes/clients-guarantors.routes');
const zoneRoutes = require('./routes/zones.routes');
const paymentsRouter = require('./routes/payments.routes');
const creditsRouter = require('./routes/credits.routes');
const searchRoutes = require('./routes/search.routes');
const creditBureauRouter = require('./routes/credit-bureau.routes');
const statisticsRoutes = require('./routes/statistics.routes')
const app = express(); //Crea instancia de express que es la app del servidor


//Middleware
app.use(express.json());
app.use(morgan('dev'));

app.use(cors());

//Definicion de las rutas base de los modulos
app.use('/api/auth', authRoutes);
app.use('/api/clients-guarantors', clienGrntRoutes);
app.use('/api/credits', creditsRouter);
app.use('/api/zones', zoneRoutes);
app.use('/api/credit-bureau', creditBureauRouter);
app.use('/api/search', searchRoutes);
app.use('/api/payments', paymentsRouter);
app.use('/api/statistics', statisticsRoutes);

module.exports = app

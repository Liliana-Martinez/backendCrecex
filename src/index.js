require('dotenv').config(); //Cargar la configuracion de .env
const app = require('./server'); //Cargar el servidor.js

//Activacion del servidor en el puerto 3000
app.listen(process.env.PORT, () => {
    console.log(`Servidor escuchando en el puerto ${process.env.PORT}`);
});
app.get('/', (req, res) => {
    res.send("Backend funcionando");
});
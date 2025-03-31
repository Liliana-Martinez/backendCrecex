const mysql = require('mysql');
require('dotenv').config(); //Carga las variables de .env

//Crear conexion con mysql
const db = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
};

let connection;

function connectionMysql(){
    connection = mysql.createConnection(db);

    connection.connect((err) => {
        if (err) {
            console.log('[db err', err);
            setTimeout(connectionMysql, 200);
        } else {
            console.log('BD conectada');
        }
    });

    connection.on('error', err => {
        console.log('[db err]', err);
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            connectionMysql();
        } else {
            throw err;
        }
    });
}

connectionMysql();

module.exports = connection;
const db = require('../db'); //Importar la conexion a la base de datos

const TABLE = 'usuarios';

//Funcion que obtiene los usuarios para comprobar la conexión
const getAll = () => {
    return new Promise((resolve, reject) => {
        db.query(`SELECT * FROM ${TABLE}`, (err, rows) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(rows);
        });
    });
};

//Función para el registro de usuario (Inserción)
const insert = ({ user, password }) => {
    return new Promise((resolve, reject) => {
        db.query(`INSERT INTO ${TABLE} (usuario, password) VALUES (?, ?)`, [user, password], (err, result) => {
            if (err) {
                reject(err);
            }
            if (result) {
                resolve(result);
            }
        });
    });
};

//Funcion para obtener el usuario por su usuario xd
const getUser = (user) => {
    return new Promise((resolve, reject) => {
        db.query(`SELECT * FROM ${TABLE} WHERE usuario = ?`, [user], (err, rows) => {
            if (err) {
                reject(err);
            }
            resolve(rows[0]);
        });
    });
};

const getById = (id) => {
    return new Promise((resolve, reject) => {
        db.query(`SELECT * FROM ${TABLE} WHERE id = ?`, [id], (err, rows) => {
            if (err) {
                reject(err)
            }
            resolve(rows[0]);
        })
    });
};

module.exports = {
    getAll,//: gettAll
    insert,
    getUser, 
    getById
}

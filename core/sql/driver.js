const mariadb_client = require('mariadb');
const pool = mariadb_client.createPool({host: '192.168.1.142', user: 'root', password: 'dec2018', connectionLimit: 5, database: 'RILCA'});
module.exports = pool;

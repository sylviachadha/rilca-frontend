const mariadb_client = require('mariadb');
//const pool = mariadb_client.createPool({host: '192.168.1.142', user: 'root', password: 'dec2018', connectionLimit: 5, database: 'RILCA'});
const pool = mariadb_client.createPool({host: '10.22.52.50', user: 'root', password: 'admin', connectionLimit: 5, database: 'rilca'});
module.exports = pool;

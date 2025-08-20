const mysql = require('mysql2/promise');

const isProduction = process.env.NODE_ENV === 'production';

const dbConfig = {
  host: '104.251.209.68',
  port: 35689,
  user: 'admin',
  password: 'Adr1an@',
  database: 'db_SamCast',
  charset: 'utf8mb4',
  timezone: '+00:00',
  ...(isProduction && {
    ssl: false,
    connectTimeout: 60000,
    acquireTimeout: 60000,
    timeout: 60000,
  })
};

// Pool de conexões
const pool = mysql.createPool({
  ...dbConfig,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Função para testar conexão
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Conectado ao MySQL com sucesso!');
    connection.release();
    return true;
  } catch (error) {
    console.error('❌ Erro ao conectar ao MySQL:', error.message);
    return false;
  }
}

module.exports = {
  pool,
  testConnection,
  execute: (query, params) => pool.execute(query, params),
  query: (query, params) => pool.query(query, params)
};
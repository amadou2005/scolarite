const fs = require('node:fs');
const mysql = require('mysql2/promise');
const config = require('./config');

let poolPromise = null;

async function identifiants() {
  if (!config.db.secretId) {
    return { user: config.db.user, password: config.db.password };
  }
  const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
  const client = new SecretsManagerClient({ region: config.aws.region });
  const res = await client.send(new GetSecretValueCommand({ SecretId: config.db.secretId }));
  const secret = JSON.parse(res.SecretString);
  return { user: secret.username, password: secret.password };
}

async function creerPool() {
  const { user, password } = await identifiants();
  return mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    database: config.db.name,
    user,
    password,
    ssl: config.db.sslCa ? { ca: fs.readFileSync(config.db.sslCa) } : undefined,
    waitForConnections: true,
    connectionLimit: 10,
    connectTimeout: 3000,
    charset: 'utf8mb4',
    timezone: 'Z',
  });
}

// Création paresseuse : si la base est injoignable au démarrage, /health répond 503
// au lieu de faire tomber le processus.
function getPool() {
  if (!poolPromise) {
    poolPromise = creerPool().catch((err) => {
      poolPromise = null;
      throw err;
    });
  }
  return poolPromise;
}

async function query(sql, params = []) {
  const pool = await getPool();
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function ping() {
  await query('SELECT 1');
}

async function close() {
  if (poolPromise) {
    const pool = await poolPromise;
    await pool.end();
    poolPromise = null;
  }
}

module.exports = { query, ping, close };
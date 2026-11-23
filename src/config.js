const os = require('node:os');
const path = require('node:path');
const pkg = require('../package.json');

function anneeCourante() {
  const d = new Date();
  const y = d.getFullYear();
  return d.getMonth() >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET manquant (variable d’environnement obligatoire)');
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  version: process.env.APP_VERSION || pkg.version,
  vmName: process.env.VM_NAME || os.hostname(),
  anneeCourante: process.env.ANNEE_COURANTE || anneeCourante(),
  sessionSecret: process.env.SESSION_SECRET,
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  trustProxy: Number(process.env.TRUST_PROXY || 0),
  loginRateMax: Number(process.env.RATE_LIMIT_LOGIN_MAX || 20),
  aws: { region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION },
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    name: process.env.DB_NAME || 'scolarite',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    secretId: process.env.DB_SECRET_ID,
    sslCa: process.env.DB_SSL_CA,
  },
  storage: {
    driver: process.env.STORAGE_DRIVER || 'local',
    uploadDir: path.resolve(process.env.UPLOAD_DIR || 'uploads'),
    bucket: process.env.S3_BUCKET,
  },
};

if (!['local', 's3'].includes(config.storage.driver)) {
  throw new Error('STORAGE_DRIVER doit valoir "local" ou "s3"');
}
if (config.storage.driver === 's3' && !config.storage.bucket) {
  throw new Error('S3_BUCKET manquant avec STORAGE_DRIVER=s3');
}

module.exports = config;
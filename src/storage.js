const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const config = require('./config');

// ---------- Pilote local (phases 0 et 1) ----------
function cheminLocal(key) {
  const complet = path.resolve(config.storage.uploadDir, key);
  if (!complet.startsWith(config.storage.uploadDir + path.sep)) {
    throw new Error('Clé de stockage invalide');
  }
  return complet;
}

const local = {
  async put(key, buffer) {
    const chemin = cheminLocal(key);
    await fsp.mkdir(path.dirname(chemin), { recursive: true });
    await fsp.writeFile(chemin, buffer);
  },
  async get(key) {
    const fh = await fsp.open(cheminLocal(key), 'r');
    return fh.createReadStream();
  },
  async remove(key) {
    await fsp.rm(cheminLocal(key), { force: true });
  },
};

// ---------- Pilote S3 (phases 2 et 3) ----------
// Identifiants : chaîne par défaut du SDK (rôle d'instance, IAM Roles Anywhere...), jamais de clé dans le code.
let s3Client = null;
function s3() {
  if (!s3Client) {
    const { S3Client } = require('@aws-sdk/client-s3');
    s3Client = new S3Client({ region: config.aws.region });
  }
  return s3Client;
}

const s3Driver = {
  async put(key, buffer, contentType) {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    await s3().send(
      new PutObjectCommand({ Bucket: config.storage.bucket, Key: key, Body: buffer, ContentType: contentType })
    );
  },
  async get(key) {
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    const res = await s3().send(new GetObjectCommand({ Bucket: config.storage.bucket, Key: key }));
    return res.Body;
  },
  async remove(key) {
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    await s3().send(new DeleteObjectCommand({ Bucket: config.storage.bucket, Key: key }));
  },
};

module.exports = config.storage.driver === 's3' ? s3Driver : local;
const express = require('express');
const config = require('../config');
const db = require('../db');

const router = express.Router();

router.get('/health', async (req, res) => {
  try {
    await db.ping();
    res.status(200).type('text/plain').send('OK');
  } catch (err) {
    console.error('health : base injoignable —', err.message);
    res.status(503).type('text/plain').send('DB UNREACHABLE');
  }
});

router.get('/version', (req, res) => {
  res.type('text/plain').send(`Scolarité v${config.version} — VM : ${config.vmName}\n`);
});

module.exports = router;
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const config = require('./config');
const constants = require('./constants');
const { locals, sameOrigin } = require('./middleware/common');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.locals.filieres = constants.FILIERES;
app.locals.niveaux = constants.NIVEAUX;
app.locals.etats = constants.ETATS;
app.locals.typesPieces = constants.TYPES_PIECES;
app.locals.version = config.version;
app.locals.vmName = config.vmName;
app.locals.fmtDate = (d) =>
  d ? new Date(d).toLocaleString('fr-FR', { timeZone: 'Africa/Dakar', dateStyle: 'short', timeStyle: 'short' }) : '—';
app.locals.fmtTaille = (o) => (o >= 1048576 ? `${(o / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(o / 1024))} Ko`);

// HTTP simple derrière l'ALB (port 80) : on désactive HSTS et upgrade-insecure-requests.
app.use(
  helmet({
    hsts: false,
    contentSecurityPolicy: { useDefaults: true, directives: { 'upgrade-insecure-requests': null } },
  })
);
app.use(express.static(path.join(__dirname, '..', 'public')));

// Routes de supervision : avant les sessions (pas de session créée par les sondes de l'ALB).
app.use(require('./routes/sante'));

app.use(express.urlencoded({ extended: false, limit: '100kb' }));
// Sessions gardées en mémoire par le serveur : choix volontaire du sujet (le problème apparaîtra en phase 3).
app.use(
  session({
    name: 'scolarite.sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: 8 * 60 * 60 * 1000 },
  })
);
app.use(locals);
app.use(sameOrigin);

app.use(require('./routes/public'));
app.use('/etudiant', require('./routes/etudiant'));
app.use('/agent', require('./routes/agent'));
app.use('/admin', require('./routes/admin'));

app.use((req, res) => res.status(404).render('erreur', { titre: 'Introuvable', message: 'Page introuvable.' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} —`, err);
  if (res.headersSent) return res.destroy();
  res.status(500).render('erreur', { titre: 'Erreur', message: 'Une erreur interne est survenue.' });
});

const server = app.listen(config.port, () => {
  console.log(`Scolarité v${config.version} (${config.vmName}) — port ${config.port} — stockage : ${config.storage.driver}`);
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => server.close(() => require('./db').close().finally(() => process.exit(0))));
}
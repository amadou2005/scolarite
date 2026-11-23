const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const db = require('../db');
const { FILIERES, NIVEAUX } = require('../constants');

const router = express.Router();
const DUMMY_HASH = bcrypt.hashSync('mot-de-passe-factice', 10);
const HOME = { etudiant: '/etudiant', agent: '/agent', admin: '/admin' };

const limiteur = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.loginRateMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).render('erreur', {
      titre: 'Trop de tentatives',
      message: 'Trop de tentatives de connexion. Réessayez dans quelques minutes.',
    }),
});

// Redirection post-login : chemin local uniquement, et dans l'espace du rôle.
function cibleSure(next, role) {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return null;
  const base = HOME[role];
  const ok = next === base || ['/', '?', '#'].some((c) => next.startsWith(base + c));
  return ok ? next : null;
}

function dejaConnecte(req, res, suite) {
  const u = req.session.user;
  return u ? res.redirect(HOME[u.role]) : suite();
}

async function ouvrirSession(req, user) {
  await new Promise((resolve, reject) => req.session.regenerate((e) => (e ? reject(e) : resolve())));
  req.session.user = user;
}

// ---------- Accueil ----------
router.get('/', async (req, res) => {
  const u = req.session.user;
  if (u) return res.redirect(HOME[u.role]);

  let stats = null;
  try {
    const [r] = await db.query(
      `SELECT COUNT(*) AS total, SUM(etat = 'valide') AS valides, SUM(etat = 'en_attente') AS attente
         FROM dossiers WHERE annee = ?`,
      [config.anneeCourante]
    );
    stats = { total: Number(r.total), valides: Number(r.valides || 0), attente: Number(r.attente || 0) };
  } catch {
    // base injoignable : l'accueil s'affiche quand même, sans les compteurs
  }
  res.render('accueil', { titre: '', stats, annee: config.anneeCourante });
});

// ---------- Connexion ----------
router.get('/login', dejaConnecte, (req, res) => {
  const next = typeof req.query.next === 'string' ? req.query.next : '';
  const personnel = req.query.profil === 'personnel' || next.startsWith('/agent') || next.startsWith('/admin');
  res.render('login', { titre: 'Connexion', form: { profil: personnel ? 'personnel' : 'etudiant', next } });
});

router.post('/login', limiteur, async (req, res) => {
  const profil = req.body.profil === 'personnel' ? 'personnel' : 'etudiant';
  const identifiant = String(req.body.identifiant ?? '').trim();
  const password = String(req.body.password ?? '');
  const next = typeof req.body.next === 'string' ? req.body.next : '';

  let compte;
  let role;
  if (profil === 'etudiant') {
    const rows = await db.query(
      'SELECT id, nom, prenom, password_hash FROM etudiants WHERE email = ? OR numero_etudiant = ? LIMIT 1',
      [identifiant.toLowerCase(), identifiant]
    );
    compte = rows[0];
    role = 'etudiant';
  } else {
    const rows = await db.query(
      'SELECT id, nom, prenom, role, password_hash FROM agents WHERE email = ? LIMIT 1',
      [identifiant.toLowerCase()]
    );
    compte = rows[0];
    role = compte?.role;
  }

  const ok = await bcrypt.compare(password, compte?.password_hash ?? DUMMY_HASH);
  if (!compte || !ok) {
    return res.status(401).render('login', {
      titre: 'Connexion',
      form: { profil, identifiant, next },
      erreurs: ['Identifiants incorrects.'],
    });
  }

  await ouvrirSession(req, { id: compte.id, role, nom: compte.nom, prenom: compte.prenom });
  res.redirect(cibleSure(next, role) || HOME[role]);
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ---------- Inscription ----------
router.get('/register', dejaConnecte, (req, res) => res.render('register', { titre: 'Créer un compte' }));

router.post('/register', async (req, res) => {
  const f = {};
  for (const k of ['numero_etudiant', 'nom', 'prenom', 'email', 'filiere', 'niveau']) {
    f[k] = String(req.body[k] ?? '').trim();
  }
  f.email = f.email.toLowerCase();
  const password = String(req.body.password ?? '');
  const password2 = String(req.body.password2 ?? '');

  const erreurs = [];
  if (!/^[A-Za-z0-9-]{4,20}$/.test(f.numero_etudiant)) erreurs.push('Numéro d’étudiant invalide (4 à 20 caractères alphanumériques).');
  if (!f.nom || f.nom.length > 100) erreurs.push('Nom obligatoire (100 caractères max).');
  if (!f.prenom || f.prenom.length > 100) erreurs.push('Prénom obligatoire (100 caractères max).');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email) || f.email.length > 190) erreurs.push('Adresse e-mail invalide.');
  if (!FILIERES.includes(f.filiere)) erreurs.push('Filière invalide.');
  if (!NIVEAUX.includes(f.niveau)) erreurs.push('Niveau invalide.');
  if (password.length < 8 || password.length > 72) erreurs.push('Le mot de passe doit contenir de 8 à 72 caractères.');
  else if (password !== password2) erreurs.push('Les deux mots de passe ne correspondent pas.');
  if (erreurs.length) {
    return res.status(400).render('register', { titre: 'Créer un compte', form: f, erreurs });
  }

  let insertId;
  try {
    const hash = await bcrypt.hash(password, 10);
    const r = await db.query(
      'INSERT INTO etudiants (numero_etudiant, nom, prenom, email, filiere, niveau, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [f.numero_etudiant, f.nom, f.prenom, f.email, f.filiere, f.niveau, hash]
    );
    insertId = r.insertId;
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).render('register', {
        titre: 'Créer un compte',
        form: f,
        erreurs: ['Ce numéro d’étudiant ou cette adresse e-mail est déjà utilisé.'],
      });
    }
    throw err;
  }

  // Connexion automatique, puis direction l'espace étudiant.
  await ouvrirSession(req, { id: insertId, role: 'etudiant', nom: f.nom, prenom: f.prenom });
  req.flash('ok', `Bienvenue ${f.prenom} ! Commencez par déposer votre demande d’inscription.`);
  res.redirect('/etudiant');
});

module.exports = router;
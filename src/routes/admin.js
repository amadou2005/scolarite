const express = require('express');
const bcrypt = require('bcryptjs');
const config = require('../config');
const db = require('../db');
const { requireRole } = require('../middleware/auth');
const { FILIERES } = require('../constants');

const router = express.Router();
router.use(requireRole('admin'));

async function charger() {
  const rows = await db.query(
    'SELECT filiere, etat, COUNT(*) AS n FROM dossiers WHERE annee = ? GROUP BY filiere, etat',
    [config.anneeCourante]
  );
  const vide = () => ({ en_attente: 0, valide: 0, rejete: 0 });
  const stats = Object.fromEntries(FILIERES.map((f) => [f, vide()]));
  const totaux = vide();
  for (const r of rows) {
    stats[r.filiere] ??= vide();
    stats[r.filiere][r.etat] = r.n;
    totaux[r.etat] += r.n;
  }
  const agents = await db.query("SELECT id, nom, prenom, email, created_at FROM agents WHERE role = 'agent' ORDER BY id");
  const [{ nb }] = await db.query('SELECT COUNT(*) AS nb FROM etudiants');
  return { stats, totaux, agents, nbEtudiants: nb };
}

router.get('/', async (req, res) => {
  res.render('admin/index', { titre: 'Administration', annee: config.anneeCourante, ...(await charger()) });
});

router.post('/agents', async (req, res) => {
  const nom = String(req.body.nom ?? '').trim();
  const prenom = String(req.body.prenom ?? '').trim();
  const email = String(req.body.email ?? '').trim().toLowerCase();
  const password = String(req.body.password ?? '');
  const erreurs = [];
  if (!nom || nom.length > 100) erreurs.push('Nom invalide.');
  if (!prenom || prenom.length > 100) erreurs.push('Prénom invalide.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 190) erreurs.push('Adresse e-mail invalide.');
  if (password.length < 8 || password.length > 72) erreurs.push('Mot de passe : 8 à 72 caractères.');
  if (erreurs.length) {
    return res.status(400).render('admin/index', {
      titre: 'Administration',
      annee: config.anneeCourante,
      erreurs,
      form: { nom, prenom, email },
      ...(await charger()),
    });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    await db.query("INSERT INTO agents (nom, prenom, email, role, password_hash) VALUES (?, ?, ?, 'agent', ?)", [nom, prenom, email, hash]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      req.flash('erreur', 'Cette adresse e-mail est déjà utilisée.');
      return res.redirect('/admin');
    }
    throw err;
  }
  req.flash('ok', 'Compte agent créé.');
  res.redirect('/admin');
});

module.exports = router;
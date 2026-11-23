const express = require('express');
const config = require('../config');
const db = require('../db');
const { envoyerPiece } = require('../download');
const { requireRole } = require('../middleware/auth');
const { FILIERES, ETATS, TYPES_PIECES } = require('../constants');

const router = express.Router();
router.use(requireRole('agent'));

const PAR_PAGE = 25;

router.get('/', async (req, res) => {
  const filiere = FILIERES.includes(req.query.filiere) ? req.query.filiere : '';
  const etat = ETATS[req.query.etat] ? req.query.etat : '';
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);

  const conditions = ['d.annee = ?'];
  const params = [config.anneeCourante];
  if (filiere) { conditions.push('d.filiere = ?'); params.push(filiere); }
  if (etat) { conditions.push('d.etat = ?'); params.push(etat); }
  const where = conditions.join(' AND ');

  const [{ total }] = await db.query(`SELECT COUNT(*) AS total FROM dossiers d WHERE ${where}`, params);
  const dossiers = await db.query(
    `SELECT d.id, d.filiere, d.niveau, d.etat, d.updated_at, e.numero_etudiant, e.nom, e.prenom,
            (SELECT COUNT(*) FROM pieces p WHERE p.dossier_id = d.id) AS nb_pieces
       FROM dossiers d JOIN etudiants e ON e.id = d.etudiant_id
      WHERE ${where}
      ORDER BY d.updated_at DESC
      LIMIT ? OFFSET ?`,
    [...params, PAR_PAGE, (page - 1) * PAR_PAGE]
  );
  const pages = Math.max(1, Math.ceil(total / PAR_PAGE));
  const lien = (n) => `/agent?${new URLSearchParams({ filiere, etat, page: String(n) })}`;
  res.render('agent/liste', {
    titre: 'Dossiers',
    dossiers,
    total,
    page,
    pages,
    filtre: { filiere, etat },
    prec: page > 1 ? lien(page - 1) : null,
    suiv: page < pages ? lien(page + 1) : null,
    annee: config.anneeCourante,
  });
});

router.get('/dossiers/:id', async (req, res) => {
  const id = Number(req.params.id);
  const [dossier] = Number.isInteger(id)
    ? await db.query(
        `SELECT d.*, e.numero_etudiant, e.nom, e.prenom, e.email
           FROM dossiers d JOIN etudiants e ON e.id = d.etudiant_id WHERE d.id = ?`,
        [id]
      )
    : [];
  if (!dossier) return res.status(404).render('erreur', { titre: 'Introuvable', message: 'Dossier introuvable.' });
  const pieces = await db.query('SELECT id, type, nom_fichier, taille, created_at FROM pieces WHERE dossier_id = ?', [id]);
  res.render('agent/dossier', { titre: `Dossier ${dossier.numero_etudiant}`, dossier, pieces, typesPieces: TYPES_PIECES });
});

router.get('/pieces/:id', async (req, res) => {
  const id = Number(req.params.id);
  const [piece] = Number.isInteger(id) ? await db.query('SELECT * FROM pieces WHERE id = ?', [id]) : [];
  if (!piece) return res.status(404).render('erreur', { titre: 'Introuvable', message: 'Pièce introuvable.' });
  await envoyerPiece(res, piece);
});

router.post('/dossiers/:id/decision', async (req, res) => {
  const id = Number(req.params.id);
  const decision = String(req.body.decision ?? '');
  const commentaire = String(req.body.commentaire ?? '').trim().slice(0, 2000);
  if (!Number.isInteger(id) || !['valide', 'rejete'].includes(decision)) {
    req.flash('erreur', 'Décision invalide.');
    return res.redirect('/agent');
  }
  if (decision === 'rejete' && !commentaire) {
    req.flash('erreur', 'Un commentaire est obligatoire pour rejeter un dossier.');
    return res.redirect(`/agent/dossiers/${id}`);
  }
  const r = await db.query(
    'UPDATE dossiers SET etat = ?, commentaire = ?, agent_id = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ?',
    [decision, commentaire || null, req.session.user.id, id]
  );
  if (!r.affectedRows) return res.status(404).render('erreur', { titre: 'Introuvable', message: 'Dossier introuvable.' });
  req.flash('ok', decision === 'valide' ? 'Dossier validé.' : 'Dossier rejeté.');
  res.redirect(`/agent/dossiers/${id}`);
});

module.exports = router;
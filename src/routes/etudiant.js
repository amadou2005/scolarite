const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const multer = require('multer');
const PDFDocument = require('pdfkit');
const config = require('../config');
const db = require('../db');
const storage = require('../storage');
const { envoyerPiece } = require('../download');
const { requireRole } = require('../middleware/auth');
const { FILIERES, NIVEAUX, TYPES_PIECES } = require('../constants');

const router = express.Router();
router.use(requireRole('etudiant'));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
}).single('fichier');

function recevoirFichier(req, res, next) {
  upload(req, res, (err) => {
    if (!err) return next();
    req.flash('erreur', err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop volumineux (5 Mo maximum).' : 'Fichier invalide.');
    res.redirect('/etudiant');
  });
}

function detecterType(buf) {
  if (buf.length > 4 && buf.subarray(0, 4).toString('latin1') === '%PDF') return { ext: '.pdf', mime: 'application/pdf' };
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: '.jpg', mime: 'image/jpeg' };
  return null;
}

router.get('/', async (req, res) => {
  const [etudiant] = await db.query(
    'SELECT id, numero_etudiant, nom, prenom, filiere, niveau FROM etudiants WHERE id = ?',
    [req.session.user.id]
  );
  const [dossier] = await db.query('SELECT * FROM dossiers WHERE etudiant_id = ? AND annee = ?', [
    etudiant.id,
    config.anneeCourante,
  ]);
  const pieces = dossier
    ? await db.query('SELECT id, type, nom_fichier, taille, created_at FROM pieces WHERE dossier_id = ?', [dossier.id])
    : [];
  const parType = Object.fromEntries(pieces.map((p) => [p.type, p]));
  res.render('etudiant/dashboard', { titre: 'Mon dossier', etudiant, dossier, parType, annee: config.anneeCourante });
});

router.post('/dossier', async (req, res) => {
  const filiere = String(req.body.filiere ?? '');
  const niveau = String(req.body.niveau ?? '');
  if (!FILIERES.includes(filiere) || !NIVEAUX.includes(niveau)) {
    req.flash('erreur', 'Filière ou niveau invalide.');
    return res.redirect('/etudiant');
  }
  const [d] = await db.query('SELECT id, etat FROM dossiers WHERE etudiant_id = ? AND annee = ?', [
    req.session.user.id,
    config.anneeCourante,
  ]);
  if (!d) {
    await db.query('INSERT INTO dossiers (etudiant_id, annee, filiere, niveau) VALUES (?, ?, ?, ?)', [
      req.session.user.id,
      config.anneeCourante,
      filiere,
      niveau,
    ]);
    req.flash('ok', 'Demande d’inscription enregistrée. Déposez maintenant vos pièces justificatives.');
  } else if (d.etat === 'valide') {
    req.flash('erreur', 'Votre dossier est déjà validé : il ne peut plus être modifié.');
  } else {
    await db.query("UPDATE dossiers SET filiere = ?, niveau = ?, etat = 'en_attente' WHERE id = ?", [filiere, niveau, d.id]);
    req.flash('ok', 'Demande mise à jour.');
  }
  res.redirect('/etudiant');
});

router.post('/pieces', recevoirFichier, async (req, res) => {
  const type = String(req.body.type ?? '');
  if (!TYPES_PIECES[type]) {
    req.flash('erreur', 'Type de pièce invalide.');
    return res.redirect('/etudiant');
  }
  if (!req.file) {
    req.flash('erreur', 'Aucun fichier reçu.');
    return res.redirect('/etudiant');
  }
  const detecte = detecterType(req.file.buffer);
  if (!detecte) {
    req.flash('erreur', 'Format non accepté : PDF ou JPG uniquement.');
    return res.redirect('/etudiant');
  }
  const [dossier] = await db.query('SELECT id, etat FROM dossiers WHERE etudiant_id = ? AND annee = ?', [
    req.session.user.id,
    config.anneeCourante,
  ]);
  if (!dossier) {
    req.flash('erreur', 'Déposez d’abord votre demande d’inscription.');
    return res.redirect('/etudiant');
  }
  if (dossier.etat === 'valide') {
    req.flash('erreur', 'Dossier validé : dépôt impossible.');
    return res.redirect('/etudiant');
  }

  const nom = path.basename(req.file.originalname).replace(/[^\w.\- ]/g, '_').slice(0, 120) || `piece${detecte.ext}`;
  const key = `dossiers/${dossier.id}/${type}-${crypto.randomUUID()}${detecte.ext}`;
  await storage.put(key, req.file.buffer, detecte.mime);

  const [ancienne] = await db.query('SELECT id, emplacement FROM pieces WHERE dossier_id = ? AND type = ?', [dossier.id, type]);
  if (ancienne) {
    await db.query(
      'UPDATE pieces SET nom_fichier = ?, taille = ?, emplacement = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?',
      [nom, req.file.size, key, ancienne.id]
    );
    await storage.remove(ancienne.emplacement).catch((e) => console.error('suppression ancienne pièce :', e.message));
  } else {
    await db.query('INSERT INTO pieces (dossier_id, type, nom_fichier, taille, emplacement) VALUES (?, ?, ?, ?, ?)', [
      dossier.id,
      type,
      nom,
      req.file.size,
      key,
    ]);
  }
  if (dossier.etat === 'rejete') {
    await db.query("UPDATE dossiers SET etat = 'en_attente' WHERE id = ?", [dossier.id]);
  }
  req.flash('ok', `${TYPES_PIECES[type]} déposée.`);
  res.redirect('/etudiant');
});

router.get('/pieces/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).render('erreur', { titre: 'Introuvable', message: 'Pièce introuvable.' });
  const [piece] = await db.query(
    'SELECT p.* FROM pieces p JOIN dossiers d ON d.id = p.dossier_id WHERE p.id = ? AND d.etudiant_id = ?',
    [id, req.session.user.id]
  );
  if (!piece) return res.status(404).render('erreur', { titre: 'Introuvable', message: 'Pièce introuvable.' });
  await envoyerPiece(res, piece);
});

router.get('/attestation', async (req, res) => {
  const [d] = await db.query(
    `SELECT d.id, d.annee, d.filiere, d.niveau, d.decided_at, e.numero_etudiant, e.nom, e.prenom
       FROM dossiers d JOIN etudiants e ON e.id = d.etudiant_id
      WHERE d.etudiant_id = ? AND d.annee = ? AND d.etat = 'valide'`,
    [req.session.user.id, config.anneeCourante]
  );
  if (!d) {
    req.flash('erreur', 'Attestation disponible uniquement une fois le dossier validé.');
    return res.redirect('/etudiant');
  }
  const doc = new PDFDocument({ size: 'A4', margin: 60 });
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="attestation-${d.numero_etudiant}.pdf"`,
    'Cache-Control': 'private, no-store',
  });
  doc.pipe(res);
  doc.fontSize(20).text('UNIVERSITÉ DU SALOUM', { align: 'center' });
  doc.moveDown(0.5).fontSize(12).text('Service de la scolarité', { align: 'center' });
  doc.moveDown(3).fontSize(18).text('ATTESTATION D’INSCRIPTION', { align: 'center', underline: true });
  doc.moveDown(2).fontSize(12).text(
    `Le service de la scolarité atteste que ${d.prenom} ${d.nom.toUpperCase()}, numéro d’étudiant ${d.numero_etudiant}, ` +
      `est régulièrement inscrit(e) en ${d.niveau}, filière ${d.filiere}, pour l’année universitaire ${d.annee}.`,
    { align: 'justify', lineGap: 6 }
  );
  doc.moveDown(3).text(`Délivrée le ${new Date().toLocaleDateString('fr-FR', { timeZone: 'Africa/Dakar' })}.`);
  doc.moveDown(0.5).fontSize(9).fillColor('gray').text('Document généré automatiquement — données fictives (projet pédagogique).');
  doc.end();
});

module.exports = router;
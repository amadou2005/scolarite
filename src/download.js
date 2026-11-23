const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const storage = require('./storage');

async function envoyerPiece(res, piece) {
  let stream;
  try {
    stream = await storage.get(piece.emplacement);
  } catch (err) {
    if (err.code === 'ENOENT' || err.name === 'NoSuchKey') {
      return res.status(404).render('erreur', { titre: 'Introuvable', message: 'Fichier introuvable.' });
    }
    if (err.name === 'InvalidObjectState') {
      return res.status(409).render('erreur', {
        titre: 'Pièce archivée',
        message: 'Cette pièce est archivée (Glacier) : une restauration est nécessaire avant téléchargement.',
      });
    }
    throw err;
  }
  const ext = path.extname(piece.emplacement).toLowerCase();
  res.type(ext === '.pdf' ? 'application/pdf' : 'image/jpeg');
  res.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(piece.nom_fichier)}`);
  res.set('Cache-Control', 'private, no-store');
  try {
    await pipeline(stream, res);
  } catch (err) {
    if (!res.headersSent) throw err;
    res.destroy();
  }
}

module.exports = { envoyerPiece };
const bcrypt = require('bcryptjs');
const PDFDocument = require('pdfkit');
const config = require('../src/config');
const db = require('../src/db');
const storage = require('../src/storage');
const { FILIERES, NIVEAUX } = require('../src/constants');

const PRENOMS = ['Amadou', 'Fatou', 'Moussa', 'Aminata', 'Ibrahima', 'Mariama', 'Cheikh', 'Awa', 'Ousmane', 'Khadija',
  'Mamadou', 'Seynabou', 'Abdoulaye', 'Ndeye', 'Pape', 'Coumba', 'Modou', 'Rokhaya', 'Samba', 'Bineta'];
const NOMS = ['Diop', 'Ndiaye', 'Fall', 'Sow', 'Diallo', 'Ba', 'Sarr', 'Faye', 'Gueye', 'Mbaye',
  'Sy', 'Diouf', 'Cissé', 'Thiam', 'Kane', 'Sène', 'Badji', 'Diatta', 'Ndao', 'Tine'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const ascii = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function pdfExemple(titre) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A5' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.fontSize(16).text(titre);
    doc.moveDown().fontSize(10).text('Document fictif généré pour les tests — Université du Saloum.');
    doc.end();
  });
}

async function main() {
  const reset = process.argv.includes('--reset');
  const [{ n }] = await db.query('SELECT COUNT(*) AS n FROM etudiants');
  if (n > 0 && !reset) {
    console.log('Base déjà peuplée. Relancez avec --reset pour repartir de zéro.');
    return;
  }
  if (reset) {
    for (const t of ['pieces', 'dossiers', 'etudiants', 'agents']) await db.query(`DELETE FROM ${t}`);
    console.log('Tables vidées (les fichiers déjà stockés ne sont pas supprimés).');
  }

  const password = process.env.SEED_PASSWORD || 'Test-2026!';
  const hash = await bcrypt.hash(password, 10);

  const agents = [['Administrateur', 'Scolarité', 'admin@univ-saloum.example', 'admin', hash]];
  for (let i = 1; i <= 3; i++) agents.push([pick(NOMS), pick(PRENOMS), `agent${i}@univ-saloum.example`, 'agent', hash]);
  await db.query('INSERT INTO agents (nom, prenom, email, role, password_hash) VALUES ?', [agents]);
  const agentIds = (await db.query("SELECT id FROM agents WHERE role = 'agent'")).map((a) => a.id);

  const etudiants = [];
  for (let i = 1; i <= 500; i++) {
    const nom = pick(NOMS);
    const prenom = pick(PRENOMS);
    etudiants.push([
      `SAL26${String(i).padStart(5, '0')}`, nom, prenom,
      `${ascii(prenom)}.${ascii(nom)}${i}@etu.univ-saloum.example`,
      pick(FILIERES), pick(NIVEAUX), hash,
    ]);
  }
  await db.query('INSERT INTO etudiants (numero_etudiant, nom, prenom, email, filiere, niveau, password_hash) VALUES ?', [etudiants]);

  const ids = await db.query('SELECT id, filiere, niveau FROM etudiants ORDER BY id');
  const dossiers = [];
  for (const e of ids) {
    if (Math.random() > 0.85) continue; // ~15 % n'ont pas encore déposé de demande
    const r = Math.random();
    const etat = r < 0.5 ? 'en_attente' : r < 0.85 ? 'valide' : 'rejete';
    dossiers.push([
      e.id, config.anneeCourante, e.filiere, e.niveau, etat,
      etat === 'rejete' ? 'Pièce illisible, merci de la déposer à nouveau.' : null,
      etat === 'en_attente' ? null : pick(agentIds),
      etat === 'en_attente' ? null : new Date(),
    ]);
  }
  await db.query(
    'INSERT INTO dossiers (etudiant_id, annee, filiere, niveau, etat, commentaire, agent_id, decided_at) VALUES ?',
    [dossiers]
  );

  const premiers = await db.query('SELECT id FROM dossiers WHERE annee = ? ORDER BY id LIMIT 80', [config.anneeCourante]);
  const pieces = [];
  for (const d of premiers) {
    for (const [type, libelle] of [['carte_identite', 'Carte d’identité'], ['releve_notes', 'Relevé de notes'], ['recu_paiement', 'Reçu de paiement']]) {
      const key = `dossiers/${d.id}/${type}-seed.pdf`;
      const contenu = await pdfExemple(`${libelle} (exemple) — dossier ${d.id}`);
      await storage.put(key, contenu, 'application/pdf');
      pieces.push([d.id, type, `${type}.pdf`, contenu.length, key]);
    }
  }
  await db.query('INSERT INTO pieces (dossier_id, type, nom_fichier, taille, emplacement) VALUES ?', [pieces]);

  console.log(`OK : ${agents.length} comptes personnel, ${etudiants.length} étudiants, ${dossiers.length} dossiers, ${pieces.length} pièces.`);
  console.log(`Mot de passe de tous les comptes de test : ${password}`);
  console.log('Admin : admin@univ-saloum.example · Agents : agent1..3@univ-saloum.example · Étudiants : SAL2600001 …');
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => db.close());
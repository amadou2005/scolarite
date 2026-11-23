CREATE TABLE IF NOT EXISTS etudiants (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  numero_etudiant VARCHAR(20) NOT NULL UNIQUE,
  nom VARCHAR(100) NOT NULL,
  prenom VARCHAR(100) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  filiere VARCHAR(60) NOT NULL,
  niveau ENUM('L1','L2','L3','M1','M2') NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS agents (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nom VARCHAR(100) NOT NULL,
  prenom VARCHAR(100) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  role ENUM('agent','admin') NOT NULL DEFAULT 'agent',
  password_hash VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dossiers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  etudiant_id INT UNSIGNED NOT NULL,
  annee VARCHAR(9) NOT NULL,
  filiere VARCHAR(60) NOT NULL,
  niveau ENUM('L1','L2','L3','M1','M2') NOT NULL,
  etat ENUM('en_attente','valide','rejete') NOT NULL DEFAULT 'en_attente',
  commentaire TEXT NULL,
  agent_id INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  decided_at TIMESTAMP NULL DEFAULT NULL,
  UNIQUE KEY uq_etudiant_annee (etudiant_id, annee),
  KEY idx_annee_filiere_etat (annee, filiere, etat),
  CONSTRAINT fk_dossier_etudiant FOREIGN KEY (etudiant_id) REFERENCES etudiants(id),
  CONSTRAINT fk_dossier_agent FOREIGN KEY (agent_id) REFERENCES agents(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pieces (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  dossier_id INT UNSIGNED NOT NULL,
  type ENUM('carte_identite','releve_notes','photo','recu_paiement') NOT NULL,
  nom_fichier VARCHAR(255) NOT NULL,
  taille INT UNSIGNED NOT NULL,
  emplacement VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_dossier_type (dossier_id, type),
  CONSTRAINT fk_piece_dossier FOREIGN KEY (dossier_id) REFERENCES dossiers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
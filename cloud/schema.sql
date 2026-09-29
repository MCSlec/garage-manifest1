-- ===========================================================================
-- cloud/schema.sql — base D1 des comptes Garage Manifest
-- Application : wrangler d1 execute garage-comptes --remote --file=cloud/schema.sql
-- ===========================================================================
-- Aucun jeton ni code n'est stocké en clair (empreinte SHA-256 / HMAC).
-- Les photos ne sont PAS ici : elles vivent dans R2, sous u/<id>/<sha256>.

CREATE TABLE IF NOT EXISTS utilisateurs (
  id     TEXT PRIMARY KEY,            -- UUID aléatoire, jamais l'e-mail
  email  TEXT NOT NULL UNIQUE,        -- en minuscules
  cree   INTEGER NOT NULL             -- horodatage ms
);

-- Code de connexion à 6 chiffres. UN SEUL actif par adresse (clé primaire) :
-- en demander un nouveau remplace l'ancien et remet les essais à zéro.
CREATE TABLE IF NOT EXISTS codes (
  email    TEXT PRIMARY KEY,          -- en minuscules
  hash     TEXT NOT NULL,             -- HMAC-SHA256(CODE_SECRET, « email:code »), jamais le code
  expire   INTEGER NOT NULL,          -- 10 min après la demande
  essais   INTEGER NOT NULL DEFAULT 0 -- échecs comptés ; au 5e, le code ne vaut plus rien
);
CREATE INDEX IF NOT EXISTS codes_expire ON codes (expire);

-- Ancienne connexion par lien (remplacée par le code le 29/09) : à supprimer
-- sur une base créée avant cette date.
DROP TABLE IF EXISTS jetons_lien;

CREATE TABLE IF NOT EXISTS sessions (
  hash         TEXT PRIMARY KEY,      -- SHA-256 du jeton de session
  utilisateur  TEXT NOT NULL REFERENCES utilisateurs (id),
  expire       INTEGER NOT NULL,      -- 90 jours
  cree         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_utilisateur ON sessions (utilisateur);

CREATE TABLE IF NOT EXISTS garages (
  utilisateur  TEXT PRIMARY KEY REFERENCES utilisateurs (id),
  version      INTEGER NOT NULL,      -- concurrence optimiste (If-Match)
  maj          INTEGER NOT NULL,
  donnees      TEXT NOT NULL          -- collection sans photos (empreintes à la place)
);

CREATE TABLE IF NOT EXISTS limites (
  cle      TEXT PRIMARY KEY,          -- SHA-256 de « code-email:x@y.fr », « code-ip:1.2.3.4 »… (jamais en clair)
  compte   INTEGER NOT NULL,
  fenetre  INTEGER NOT NULL           -- début de la fenêtre (ms)
);

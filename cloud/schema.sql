-- ===========================================================================
-- cloud/schema.sql — base D1 des comptes Garage Manifest
-- Application : wrangler d1 execute garage-comptes --remote --file=cloud/schema.sql
-- ===========================================================================
-- Aucun jeton n'est stocké en clair : seulement leur empreinte SHA-256.
-- Les photos ne sont PAS ici : elles vivent dans R2, sous u/<id>/<sha256>.

CREATE TABLE IF NOT EXISTS utilisateurs (
  id     TEXT PRIMARY KEY,            -- UUID aléatoire, jamais l'e-mail
  email  TEXT NOT NULL UNIQUE,        -- en minuscules
  cree   INTEGER NOT NULL             -- horodatage ms
);

CREATE TABLE IF NOT EXISTS jetons_lien (
  hash     TEXT PRIMARY KEY,          -- SHA-256 du jeton envoyé par e-mail
  email    TEXT NOT NULL,
  expire   INTEGER NOT NULL,          -- 15 min après la demande
  utilise  INTEGER NOT NULL DEFAULT 0 -- usage unique
);
CREATE INDEX IF NOT EXISTS jetons_lien_expire ON jetons_lien (expire);

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
  cle      TEXT PRIMARY KEY,          -- SHA-256 de « lien-email:x@y.fr », « lien-ip:1.2.3.4 »… (jamais en clair)
  compte   INTEGER NOT NULL,
  fenetre  INTEGER NOT NULL           -- début de la fenêtre (ms)
);

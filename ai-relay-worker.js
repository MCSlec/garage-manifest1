// ============================================================================
// ai-relay-worker.js — Relais de reconnaissance auto pour Garage Manifest
// ============================================================================
// Rôle : recevoir une photo, demander à un modèle de vision (Claude) d'identifier
// la marque et le modèle du véhicule, renvoyer des propositions en texte libre.
// Le rapprochement avec le catalogue (742+ voitures, IDs internes) se fait côté
// app, PAS ici — ce relais reste générique et n'a jamais besoin de connaître le
// catalogue. C'est un choix d'architecture délibéré : le catalogue peut grossir
// sans jamais toucher à ce fichier.
//
// Contrat identification (inchangé) :
//   Requête  : POST /  { image: "data:image/jpeg;base64,...." }
//   Réponse  : [{ brand, model, confidence, variant, cues }, ...]  (0 à 3, confidence 0-1)
//
//   CONTRAT À NE PAS CASSER : `model` contient TOUJOURS le nom complet, déclinaison
//   comprise ("Golf GTI", pas "Golf"). C'est ce champ que l'app passe à matchCatalog.
//   `variant` et `cues` sont des ajouts purement informatifs : une version antérieure
//   du prompt les avait rendus exclusifs en sortant la déclinaison de `model`, ce qui
//   a fait chuter le score de rapprochement et cassé la reconnaissance côté app.
//
// PROTECTIONS (29/09, revue de sécurité avant lancement public) :
//   L'adresse du relais est publique (elle est dans l'app) : CORS ne protège
//   de rien face à un script. Chaque identification coûtant de l'argent, le
//   relais plafonne lui-même, dans une base D1 (la même que les comptes) :
//     · par appareil sans compte  (QUOTA_IA_ANONYME, défaut 30 / jour / IP) ;
//     · par compte connecté       (QUOTA_IA_COMPTE,  défaut 200 / jour) ;
//     · pour tout le service      (QUOTA_IA_JOUR,    défaut 3 000 / jour).
//   Aucun compte n'est exigé : la première capture marche toujours.
//   Compteurs pris d'un bloc (upsert + RETURNING) : une rafale ne passe pas.
//   Image : 2 Mo au plus, JPEG / PNG / WebP. Route unique (POST /).
//   Sans base D1, le relais REFUSE de travailler (503) : jamais ouvert.
//   L'ancienne route /notify (signalement par e-mail) est supprimée : plus
//   appelée par l'app, elle était ouverte à tous sans limite.
//
// Déploiement : voir README.md, section « Reconnaissance IA ».
//   Secret : wrangler secret put ANTHROPIC_API_KEY
//   Liaison D1 « DB » : la base des comptes (cloud/schema.sql) ; variable APP_ORIGIN.
// ============================================================================

const MODEL = "claude-haiku-4-5-20251001"; // rapide et économique ; "claude-sonnet-5" pour plus de précision
const ANTHROPIC_VERSION = "2023-06-01";

const PROMPT = `Tu identifies la marque et le modèle du véhicule visible sur cette photo.
Réponds UNIQUEMENT avec un tableau JSON strict, sans texte autour, sans balises markdown.
Format exact :
[{"brand":"Porsche","model":"911 GT3 RS","variant":"GT3 RS","confidence":0.85,"cues":"aileron fixe surélevé, ailes élargies"}]
- Jusqu'à 3 propositions maximum, triées par confiance décroissante (0 à 1).
- "model" = le nom de modèle COMPLET tel qu'il apparaît habituellement, DÉCLINAISON
  INCLUSE (ex: "306", "Golf GTI", "911 GT3 RS", "Cayman S"). C'est ce champ qui sert au
  rapprochement avec le catalogue : il doit toujours être le plus complet possible.
- "variant" = uniquement la déclinaison, répétée seule (ex: "GTI", "GT3 RS"), ou chaîne
  vide "" si aucune déclinaison n'est identifiable avec certitude. Ne devine jamais une
  déclinaison à partir de la seule couleur ou d'un autocollant : uniquement des éléments
  de carrosserie visibles (ailes élargies, becquet, jantes, échappement, badge lisible).
- "cues" = en une phrase courte, les éléments visuels qui justifient la déclinaison.
  Vide si aucune certitude.
- Si aucun véhicule identifiable n'est visible sur la photo, réponds : []
- Ne lis JAMAIS la plaque d'immatriculation et ne l'inclus dans aucun champ.
- N'ajoute aucun commentaire, aucune explication : uniquement le tableau JSON.`;

const MAX_IMAGE_OCTETS = 2 * 1024 * 1024;       // l'app envoie ≈ 0,3 à 1 Mo (JPEG 1 280 px)
const MAX_CORPS = Math.ceil(MAX_IMAGE_OCTETS * 4 / 3) + 4096;   // base64 + enveloppe JSON
const TYPES_IMAGE = ["image/jpeg", "image/png", "image/webp"];
const QUOTAS_IA_DEFAUT = { anonyme: 30, compte: 200, jour: 3000 };
const JOUR_MS = 24 * 3600 * 1000;
const quota = (env, cle, defaut) => { const n = Number(env[cle]); return Number.isFinite(n) && n > 0 ? n : defaut; };

async function sha256hex(texte) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texte));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
/* Compteur du jour, pris et vérifié d'une seule instruction (même mécanique
   que cloud/compte-worker.js) : des appels simultanés ne peuvent pas passer
   ensemble sous le plafond. Clé stockée HACHÉE : ni IP ni identifiant lisibles. */
async function compter(env, cleClaire, max) {
  const jour = Math.floor(Date.now() / JOUR_MS) * JOUR_MS;
  const cle = await sha256hex("limite:" + cleClaire + ":" + jour);
  const l = await env.DB.prepare(
    `INSERT INTO limites (cle, compte, fenetre) VALUES (?1, 1, ?2)
     ON CONFLICT (cle) DO UPDATE SET compte = compte + 1
     RETURNING compte`).bind(cle, jour).first();
  return !!l && l.compte <= max;
}
/* Session d'un compte (facultative) : un jeton valide donne le quota du compte ;
   absent ou invalide, on reste en anonyme — la capture ne doit jamais dépendre
   d'un compte. */
async function utilisateurDeSession(request, env) {
  const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(request.headers.get("Authorization") || "");
  if (!m) return null;
  const s = await env.DB.prepare("SELECT utilisateur, expire FROM sessions WHERE hash = ?").bind(await sha256hex(m[1])).first();
  return s && s.expire > Date.now() ? s.utilisateur : null;
}

/* CORS limité à l'app : ce n'est PAS une protection contre un script (qui
   n'envoie pas d'Origin), seulement contre les autres sites web. La vraie
   protection, ce sont les quotas ci-dessous. */
function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.APP_ORIGIN || "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(obj, status, env) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...corsHeaders(env) },
  });
}

// ============================================================================
// Identification par photo. Le prompt et le contrat de réponse sont INCHANGÉS ;
// seuls les garde-fous d'entrée (taille, format, quotas) et les messages
// d'erreur (plus aucun détail interne) ont été ajoutés le 29/09.
// ============================================================================
async function identifier(request, env) {
  if (!env.ANTHROPIC_API_KEY) {
    console.error("[relais] ANTHROPIC_API_KEY absente (wrangler secret put)");
    return json({ error: "Identification indisponible" }, 500, env);
  }

  // Taille lue AVANT d'analyser le corps : un corps démesuré n'est jamais parsé.
  const texte = await request.text();
  if (texte.length > MAX_CORPS) return json({ error: "Image trop lourde (2 Mo au plus)" }, 413, env);
  let body;
  try {
    body = JSON.parse(texte);
  } catch {
    return json({ error: "Corps de requête JSON invalide" }, 400, env);
  }

  const dataUrl = body?.image;
  const m = typeof dataUrl === "string" && dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!m) {
    return json({ error: "Champ 'image' attendu au format data URL base64 (data:image/...;base64,....)" }, 400, env);
  }
  const [, mediaType, base64Data] = m;
  if (!TYPES_IMAGE.includes(mediaType)) return json({ error: "Format d'image non accepté (JPEG, PNG ou WebP)" }, 415, env);
  if (base64Data.length * 3 / 4 > MAX_IMAGE_OCTETS) return json({ error: "Image trop lourde (2 Mo au plus)" }, 413, env);

  /* Quotas, vérifiés AVANT l'appel payant. D'abord l'appareil ou le compte,
     puis le plafond global du service. */
  const utilisateur = await utilisateurDeSession(request, env);
  const ip = request.headers.get("CF-Connecting-IP") || "inconnue";
  const perso = utilisateur
    ? await compter(env, `ia-compte:${utilisateur}`, quota(env, "QUOTA_IA_COMPTE", QUOTAS_IA_DEFAUT.compte))
    : await compter(env, `ia-ip:${ip}`, quota(env, "QUOTA_IA_ANONYME", QUOTAS_IA_DEFAUT.anonyme));
  if (!perso) {
    return json({ error: "Limite d'identifications du jour atteinte sur cet appareil : choisis la voiture à la main, ou reviens demain" }, 429, env);
  }
  if (!(await compter(env, "ia-global", quota(env, "QUOTA_IA_JOUR", QUOTAS_IA_DEFAUT.jour)))) {
    return json({ error: "Reconnaissance automatique en pause pour aujourd'hui : choisis la voiture à la main" }, 429, env);
  }

  let anthropicRes;
  try {
    anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: base64Data } },
              { type: "text", text: PROMPT },
            ],
          },
        ],
      }),
    });
  } catch (err) {
    console.error("[relais] appel Anthropic impossible", err);
    return json({ error: "Identification indisponible" }, 502, env);
  }

  if (!anthropicRes.ok) {
    // Le détail reste dans le journal Cloudflare, jamais dans la réponse au navigateur.
    console.error("[relais] erreur Anthropic", anthropicRes.status, (await anthropicRes.text().catch(() => "")).slice(0, 500));
    return json({ error: "Identification indisponible" }, 502, env);
  }

  const data = await anthropicRes.json();
  const raw = (data?.content || []).map((b) => b?.text || "").join("").trim();
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "").trim();

  let guesses = [];
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      guesses = parsed
        .filter((g) => g && typeof g === "object" && (g.brand || g.model))
        .slice(0, 3)
        .map((g) => ({
          brand: String(g.brand || "").slice(0, 60),
          model: String(g.model || "").slice(0, 80),
          variant: String(g.variant || "").slice(0, 60),
          cues: String(g.cues || "").slice(0, 200),
          confidence: Math.max(0, Math.min(1, Number(g.confidence) || 0.5)),
        }));
    }
  } catch {
    guesses = []; // réponse non-JSON du modèle → dégradation propre vers la saisie manuelle côté app
  }

  return json(guesses, 200, env);
}

// ============================================================================
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }
    const origine = request.headers.get("Origin");
    if (origine && origine !== env.APP_ORIGIN) return json({ error: "Origine non autorisée" }, 403, env);
    // Route UNIQUE : tout le reste est 404 (avant, n'importe quel chemin
    // déclenchait une identification payante).
    const { pathname } = new URL(request.url);
    if (pathname !== "/") return json({ error: "Route inconnue" }, 404, env);
    if (request.method !== "POST") {
      return json({ error: "Méthode non autorisée — POST uniquement" }, 405, env);
    }
    // Sans base de limites, on refuse : un relais sans plafond est un compte ouvert.
    if (!env.DB) {
      console.error("[relais] liaison D1 « DB » absente : relais fermé (voir README)");
      return json({ error: "Identification indisponible" }, 503, env);
    }
    try {
      return await identifier(request, env);
    } catch (err) {
      console.error("[relais] erreur interne", err);
      return json({ error: "Identification indisponible" }, 500, env);
    }
  },
};

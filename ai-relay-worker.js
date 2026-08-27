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
//   Réponse  : [{ brand, model, confidence }, ...]   (0 à 3 propositions, confidence 0-1)
//
// Contrat signalement (nouveau) :
//   Requête  : POST /notify  { nom, date, photo }
//   Réponse  : { ok: true }
//   Envoie un mail à l'administrateur (NOTIFY_TO) quand une capture reste hors
//   catalogue. Consentement recueilli côté app AVANT l'appel — ce relais ne fait
//   qu'exécuter l'envoi, il ne demande jamais d'autorisation lui-même.
//   Le destinataire est FIXÉ CÔTÉ SERVEUR (variable d'environnement) : jamais
//   fourni par le client. Impossible d'utiliser ce relais comme serveur de mail
//   ouvert vers une adresse arbitraire, quelle que soit la requête envoyée.
//
// Déploiement (gratuit, ~5 minutes) : voir README.md, section "Reconnaissance IA".
// Pour activer /notify : wrangler secret put RESEND_API_KEY
//                         wrangler secret put NOTIFY_TO   (ton adresse Resend)
// ============================================================================

const MODEL = "claude-haiku-4-5-20251001"; // rapide et économique ; "claude-sonnet-5" pour plus de précision
const ANTHROPIC_VERSION = "2023-06-01";

const PROMPT = `Tu identifies la marque et le modèle du véhicule visible sur cette photo.
Réponds UNIQUEMENT avec un tableau JSON strict, sans texte autour, sans balises markdown.
Format exact : [{"brand":"Peugeot","model":"306","confidence":0.85}]
- Jusqu'à 3 propositions maximum, triées par confiance décroissante (0 à 1).
- "model" = le nom de modèle tel qu'il apparaît habituellement (ex: "306", "Golf GTI", "911").
- Si aucun véhicule identifiable n'est visible sur la photo, réponds : []
- N'ajoute aucun commentaire, aucune explication : uniquement le tableau JSON.`;

// Taille maximale acceptée pour une photo de signalement (base64, avant décodage).
// La photo est déjà compressée côté app (~1000 px, JPEG 0.72) avant l'envoi ; cette
// limite est un garde-fou côté serveur, pas le réglage principal de compression.
const NOTIFY_MAX_PHOTO_B64 = 2_000_000; // ~1,5 Mo réels une fois décodée

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

// ============================================================================
// Route existante : identification par photo — AUCUNE ligne modifiée par
// rapport au fichier d'origine, seulement déplacée dans sa propre fonction
// pour pouvoir cohabiter proprement avec la nouvelle route /notify.
// ============================================================================
async function identifier(request, env, origin) {
  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: "ANTHROPIC_API_KEY manquante côté serveur (wrangler secret put)" }, 500, origin);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Corps de requête JSON invalide" }, 400, origin);
  }

  const dataUrl = body?.image;
  const m = typeof dataUrl === "string" && dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!m) {
    return json({ error: "Champ 'image' attendu au format data URL base64 (data:image/...;base64,....)" }, 400, origin);
  }
  const [, mediaType, base64Data] = m;

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
    return json({ error: "Appel à l'API Anthropic impossible", detail: String(err) }, 502, origin);
  }

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text().catch(() => "");
    return json({ error: "Erreur API Anthropic", status: anthropicRes.status, detail: errText.slice(0, 500) }, 502, origin);
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
          confidence: Math.max(0, Math.min(1, Number(g.confidence) || 0.5)),
        }));
    }
  } catch {
    guesses = []; // réponse non-JSON du modèle → dégradation propre vers la saisie manuelle côté app
  }

  return json(guesses, 200, origin);
}

// ============================================================================
// Nouvelle route : signalement d'une voiture non classée, par mail.
// ============================================================================
function echapperHtml(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

async function notifier(request, env, origin) {
  if (!env.RESEND_API_KEY) {
    return json({ error: "RESEND_API_KEY manquante côté serveur (wrangler secret put)" }, 500, origin);
  }
  if (!env.NOTIFY_TO) {
    return json({ error: "NOTIFY_TO manquante côté serveur (wrangler secret put)" }, 500, origin);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Corps de requête JSON invalide" }, 400, origin);
  }

  const nom = String(body?.nom || "").trim().slice(0, 120);
  const date = String(body?.date || "").trim().slice(0, 40);
  const photo = typeof body?.photo === "string" ? body.photo : "";

  if (!nom) {
    return json({ error: "Champ 'nom' requis" }, 400, origin);
  }
  // Aucune autre donnée n'est acceptée : ni position, ni note. Le contrat côté
  // app ne les envoie jamais, et ce relais ne les lirait de toute façon pas —
  // la minimisation est appliquée aux deux bouts, pas seulement côté client.
  if (photo && photo.length > NOTIFY_MAX_PHOTO_B64) {
    return json({ error: "Photo trop volumineuse" }, 413, origin);
  }
  const photoValide = /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(photo);

  const dateAffichee = date ? new Date(date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "date inconnue";

  const html = `
    <div style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto">
      <h2 style="margin:0 0 4px">🚗 Voiture non classée</h2>
      <p style="color:#666;margin:0 0 18px">Repérée le ${echapperHtml(dateAffichee)} — consentement donné par l'utilisateur.</p>
      <p style="font-size:18px;font-weight:600;margin:0 0 14px">${echapperHtml(nom)}</p>
      ${photoValide ? `<img src="${photo}" alt="" style="width:100%;border-radius:10px;display:block" />` : `<p style="color:#999">Aucune photo jointe.</p>`}
      <p style="color:#999;font-size:12px;margin-top:18px">Envoyé automatiquement par Garage Manifest. Aucune position, aucune note personnelle n'est jamais transmise.</p>
    </div>`;

  let resendRes;
  try {
    resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Garage Manifest <onboarding@resend.dev>",
        to: [env.NOTIFY_TO],           // FIXÉ CÔTÉ SERVEUR — jamais fourni par le client
        subject: `Non classé : ${nom}`,
        html,
      }),
    });
  } catch (err) {
    return json({ error: "Appel à l'API Resend impossible", detail: String(err) }, 502, origin);
  }

  if (!resendRes.ok) {
    const errText = await resendRes.text().catch(() => "");
    return json({ error: "Erreur API Resend", status: resendRes.status, detail: errText.slice(0, 500) }, 502, origin);
  }

  return json({ ok: true }, 200, origin);
}

// ============================================================================
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "*";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== "POST") {
      return json({ error: "Méthode non autorisée — POST uniquement" }, 405, origin);
    }

    // Aiguillage par chemin. Toute requête qui n'est pas /notify tombe dans le
    // comportement d'origine, à l'identique — c'est ce qui garantit qu'aucun
    // appel existant de l'app (identification de voiture) n'est affecté par
    // cet ajout.
    const { pathname } = new URL(request.url);
    if (pathname === "/notify") {
      return notifier(request, env, origin);
    }
    return identifier(request, env, origin);
  },
};

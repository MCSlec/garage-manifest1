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
// Contrat :
//   Requête  : POST { image: "data:image/jpeg;base64,...." }
//   Réponse  : [{ brand, model, confidence }, ...]   (0 à 3 propositions, confidence 0-1)
//
// Déploiement (gratuit, ~5 minutes) : voir README.md, section "Reconnaissance IA".
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

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "*";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== "POST") {
      return json({ error: "Méthode non autorisée — POST uniquement" }, 405, origin);
    }
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
  },
};

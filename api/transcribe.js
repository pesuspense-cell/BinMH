const SUPABASE_URL = "https://wmawayreixrijthzsfxq.supabase.co";
const SUPABASE_KEY = "sb_publishable_dH4bJV_YyJNaiGIDZAhZVQ_4HAzu55e";
const MAX_AUDIO_BYTES = 3 * 1024 * 1024;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

async function signedIn(auth) {
  if (!/^Bearer\s+\S+/.test(auth || "")) return false;
  const reply = await fetch(SUPABASE_URL + "/auth/v1/user", { headers: { apikey: SUPABASE_KEY, Authorization: auth } });
  return reply.ok;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "method" });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return send(res, 503, { error: "no-key" });
  try {
    if (!(await signedIn(req.headers.authorization))) return send(res, 401, { error: "auth" });
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const audio = Buffer.from(String(body.audio || ""), "base64");
    if (audio.length < 1000) return send(res, 400, { error: "short" });
    if (audio.length > MAX_AUDIO_BYTES) return send(res, 413, { error: "long" });
    const form = new FormData();
    const mp3 = body.format === "mp3";
    form.append("file", new Blob([audio], { type: mp3 ? "audio/mpeg" : "audio/wav" }), mp3 ? "speech.mp3" : "speech.wav");
    form.append("model", process.env.OPENAI_STT_MODEL || "gpt-4o-transcribe");
    form.append("language", "ko");
    form.append("response_format", "json");
    form.append("prompt", String(body.prompt || "").slice(0, 1500));
    const reply = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: "Bearer " + key },
      body: form
    });
    const data = await reply.json().catch(() => ({}));
    if (!reply.ok) return send(res, 502, { error: "openai", detail: (data.error && data.error.message) || reply.status });
    return send(res, 200, { text: String(data.text || "") });
  } catch (err) {
    return send(res, 500, { error: "server", detail: String((err && err.message) || err) });
  }
};

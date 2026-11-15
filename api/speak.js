const bible = require("../src/revelation.json");

const VOICES = new Set(["cedar", "marin", "onyx", "coral"]);
const INSTRUCTIONS = [
  "한국어 개역한글 성경을 소리 내어 낭독합니다.",
  "기계처럼 또박또박 끊지 말고, 말씀을 마음에 새기며 읽는 사람처럼 차분하고 따뜻하며 경건하게 읽으세요.",
  "뜻이 이어지는 구절은 한 호흡으로 묶고, 쉼표와 '~하고', '~하니', '~하매' 같은 연결 어미 뒤에서 살짝 쉬세요.",
  "옛 표기는 적힌 그대로 자연스럽게 발음하고, 속도는 보통보다 조금 느리게 합니다.",
  "마지막 낱말까지 하나도 빠뜨리지 말고 끝까지 또렷하게 읽은 뒤 마치세요."
].join(" ");

const verses = new Map();
bible.chapters.forEach((ch) => ch.verses.forEach((verse) => verses.set(ch.chapter + ":" + verse.v, verse.t)));

function fail(res, status, error) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify({ error }));
}

module.exports = async (req, res) => {
  if (req.method !== "GET") return fail(res, 405, "method");
  const url = new URL(req.url, "http://local");
  const keys = [...url.searchParams.keys()];
  if (keys.some((key) => !["id", "voice", "v"].includes(key))) return fail(res, 400, "params");
  const text = verses.get(url.searchParams.get("id") || "");
  const voice = url.searchParams.get("voice") || "cedar";
  if (!text) return fail(res, 404, "verse");
  if (!VOICES.has(voice)) return fail(res, 400, "voice");
  const key = process.env.OPENAI_API_KEY;
  if (!key) return fail(res, 503, "no-key");
  try {
    const reply = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
        voice,
        input: /[.!?]$/.test(text) ? text : text + ".",
        instructions: INSTRUCTIONS,
        response_format: "mp3"
      })
    });
    if (!reply.ok) {
      const data = await reply.json().catch(() => ({}));
      return fail(res, 502, (data.error && data.error.message) || "openai " + reply.status);
    }
    const audio = Buffer.from(await reply.arrayBuffer());
    res.statusCode = 200;
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", audio.length);
    res.setHeader("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");
    res.end(audio);
  } catch (err) {
    return fail(res, 500, String((err && err.message) || err));
  }
};

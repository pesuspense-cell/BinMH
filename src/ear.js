import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";

env.allowLocalModels = false;
env.backends.onnx.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/";

const transcribers = {};
let chain = Promise.resolve();

function cleanTranscript(text) {
  const said = String(text || "")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/<\|[^|]*\|>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = said.split(" ").filter(Boolean);
  if (words.length >= 4 && words.every((word) => word === words[0])) return "";
  return said;
}

async function handle(data) {
  const id = data.id;
  const audio = data.audio;
  const model = data.model === "Xenova/whisper-small" ? data.model : "Xenova/whisper-base";
  try {
    Object.keys(transcribers).forEach((name) => { if (name !== model) delete transcribers[name]; });
    if (!transcribers[model]) {
      transcribers[model] = await pipeline("automatic-speech-recognition", model, {
        quantized: true,
        progress_callback: (item) => {
          if (!item) return;
          if (item.status === "progress") self.postMessage({ id, status: "progress", progress: item.progress });
          else self.postMessage({ id, status: "progress" });
        }
      });
    }
    self.postMessage({ id, status: "ready" });
    const result = await transcribers[model](audio, {
      language: "korean",
      task: "transcribe",
      chunk_length_s: 30,
      stride_length_s: 5,
      no_repeat_ngram_size: 3,
      repetition_penalty: 1.15,
      num_beams: 1
    });
    self.postMessage({ id, status: "done", text: cleanTranscript(result && result.text) });
  } catch (err) {
    self.postMessage({ id, status: "error", message: String((err && err.message) || err) });
  }
}

self.onmessage = (event) => {
  const data = event.data;
  chain = chain.then(() => handle(data));
};

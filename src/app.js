(function () {
  if (!window.REVELATION || !window.LampEngine) {
    document.getElementById("app").innerHTML = "<main><p>본문을 불러오지 못했습니다.</p></main>";
    return;
  }

  const E = window.LampEngine;
  const B = window.LampBible;
  const list = E.flatten(window.REVELATION);
  const map = new Map(list.map((verse) => [verse.id, verse]));
  const STORAGE = "seven-lamps-revelation-v1";
  const MOODS = ["평안", "감사", "회개", "소망", "간구", "기쁨"];

  const PHASE_HELP = {
    read: "눈으로만 스치지 않도록, 덩어리를 따라 소리 내어 읽습니다.",
    chunk: "긴 절을 짧은 단위로 나누면 기억이 붙잡습니다. 보이는 조각을 순서대로 놓아 보세요.",
    cloze: "빠진 말을 스스로 채울 때, 읽기만 할 때보다 오래 남습니다.",
    recall: "힌트 없이 적어야 정말 외운 것입니다. 띄어쓰기는 달라도 됩니다.",
    review: "잊기 직전에 다시 꺼냅니다. 간격은 1일, 3일, 7일, 그 뒤로 조금씩 늘어납니다.",
    exam: "방금 외운 절을 다른 문제와 섞어, 힌트 없이 다시 확인합니다.",
    chapter: "한 장 전체를 순서와 본문으로 확인합니다. 첫 시도와 한 번의 재시도만 점수에 들어갑니다.",
    spot: "이미 외운 장에서 흔들리기 쉬운 절을 골라 다시 꺼냅니다."
  };

  let timer = 0;
  let stamp = "";
  let searchTimer = 0;
  const ui = {
    page: "home",
    session: null,
    query: "",
    confirm: null,
    readChapter: 1,
    highlight: "",
    range: 14,
    mood: "감사",
    draft: "",
    draftRef: "",
    skipCapture: false,
    nameError: "",
    journalError: "",
    editing: "",
    editDraft: null,
    editError: "",
    bibleError: false
  };

  let state = load();

  function fresh() {
    return {
      v: 1,
      name: "",
      createdAt: E.todayKey(),
      xp: 0,
      cards: {},
      days: {},
      journal: [],
      chapters: {},
      pick: null,
      voiceURI: "",
      earModel: "base"
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (!raw) return fresh();
      const data = JSON.parse(raw);
      if (!data || data.v !== 1) return fresh();
      return Object.assign(fresh(), data);
    } catch (err) {
      return fresh();
    }
  }

  function loadSession() {
    try {
      const raw = sessionStorage.getItem(STORAGE + ":s");
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (!session || session.phase === "done") return null;
      return session;
    } catch (err) {
      return null;
    }
  }

  function persist() {
    localStorage.setItem(STORAGE, JSON.stringify(state));
    if (ui.session && ui.session.phase !== "done") sessionStorage.setItem(STORAGE + ":s", JSON.stringify(ui.session));
    else sessionStorage.removeItem(STORAGE + ":s");
  }

  function today() { return E.todayKey(); }

  function day() {
    const key = today();
    if (!state.days[key]) {
      state.days[key] = {
        xp: 0, newPassed: [], reviews: 0, reviewHits: 0, points: 0, possible: 0,
        seconds: 0, prayer: { morning: false, noon: false, evening: false },
        prayerXp: {}, bonus: false, failXp: 0
      };
    }
    return state.days[key];
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[ch]));
  }

  function refText(id) {
    const verse = map.get(id);
    return "계시록 " + verse.chapter + ":" + verse.verse;
  }

  function addXp(amount) {
    state.xp += amount;
    day().xp += amount;
  }

  function addEffortXp() {
    const todayLog = day();
    if ((todayLog.failXp || 0) >= 10) return;
    todayLog.failXp += 2;
    addXp(2);
  }

  function knownCount() {
    return list.filter((verse) => (state.cards[verse.id]?.stage || 0) >= 3).length;
  }

  function lampsLit() {
    const known = knownCount();
    if (!known) return 0;
    return Math.min(7, Math.max(1, Math.ceil((known / list.length) * 7)));
  }

  function chapterProgress(chapter) {
    const verses = list.filter((verse) => verse.chapter === chapter);
    const known = verses.filter((verse) => (state.cards[verse.id]?.stage || 0) >= 3).length;
    const due = verses.filter((verse) => {
      const card = state.cards[verse.id];
      return card && card.stage >= 3 && card.due <= today();
    }).length;
    return { total: verses.length, known, due };
  }

  function todayGoal() {
    const passed = day().newPassed.length;
    const still = list.filter((verse) => (state.cards[verse.id]?.stage || 0) < 3).length;
    return Math.min(5, passed + still);
  }

  function dueVerses() {
    const key = today();
    return list.filter((verse) => {
      const card = state.cards[verse.id];
      return card && card.stage >= 3 && card.due <= key;
    }).sort((a, b) => {
      const ca = state.cards[a.id];
      const cb = state.cards[b.id];
      if (ca.due !== cb.due) return ca.due < cb.due ? -1 : 1;
      return ca.ease - cb.ease;
    });
  }

  function nextNew(limit) {
    const stage1 = list.filter((verse) => state.cards[verse.id]?.stage === 1);
    const fresh = list.filter((verse) => !state.cards[verse.id] || state.cards[verse.id].stage === 0);
    return stage1.concat(fresh).slice(0, limit);
  }

  function waitingIds() {
    return list.filter((verse) => state.cards[verse.id]?.stage === 2).map((verse) => verse.id);
  }

  function ensurePick() {
    if (!state.name) return;
    if (state.pick && state.pick.date === today()) return;
    const rec = E.recommend(list, state.cards, today());
    state.pick = { date: today(), id: rec.id, reason: rec.reason };
  }

  function activeStreak() {
    let cursor = today();
    if (!((state.days[cursor]?.xp) > 0)) cursor = E.addDays(cursor, -1);
    let count = 0;
    while ((state.days[cursor]?.xp || 0) > 0) {
      count += 1;
      cursor = E.addDays(cursor, -1);
    }
    return count;
  }

  function longestStreak() {
    const keys = Object.keys(state.days).filter((key) => (state.days[key].xp || 0) > 0).sort();
    let best = 0;
    let run = 0;
    let prev = "";
    keys.forEach((key) => {
      run = prev && key === E.addDays(prev, 1) ? run + 1 : 1;
      prev = key;
      if (run > best) best = run;
    });
    return best;
  }

  function prayerStreak() {
    function full(key) {
      const prayer = state.days[key]?.prayer;
      return !!(prayer && prayer.morning && prayer.noon && prayer.evening);
    }
    let cursor = today();
    if (!full(cursor)) cursor = E.addDays(cursor, -1);
    let count = 0;
    while (full(cursor)) {
      count += 1;
      cursor = E.addDays(cursor, -1);
    }
    return count;
  }

  function rangeKeys(n) {
    const keys = [];
    for (let i = n - 1; i >= 0; i--) keys.push(E.addDays(today(), -i));
    return keys;
  }

  function daysSinceStart() {
    const start = state.createdAt || today();
    const keys = [];
    let cursor = start;
    const end = today();
    let guard = 0;
    while (cursor <= end && guard < 4000) {
      keys.push(cursor);
      cursor = E.addDays(cursor, 1);
      guard += 1;
    }
    return keys;
  }

  function clearTimerFn() { clearTimeout(timer); }

  function schedule(ms, fn) {
    clearTimerFn();
    timer = setTimeout(() => {
      if (!ui.session) return;
      fn();
      render();
    }, ms);
  }

  let voiceList = [];
  let speakTimer = 0;

  function loadVoices() {
    if (!window.speechSynthesis) return voiceList;
    const found = window.speechSynthesis.getVoices() || [];
    if (found.length) voiceList = found;
    return voiceList;
  }

  function isKoreanVoice(voice) {
    return /^ko\b/i.test(voice.lang || "") || /korean|한국/i.test(voice.name || "");
  }

  function voiceRank(voice) {
    const name = voice.name || "";
    let score = 0;
    if (isKoreanVoice(voice)) score += 20;
    if (/natural|neural/i.test(name)) score += 12;
    if (/sunhi|선희/i.test(name)) score += 6;
    if (/injoon|인준|hyunsu|현수/i.test(name)) score += 5;
    if (/google/i.test(name) && isKoreanVoice(voice)) score += 4;
    if (/heami|혜미/i.test(name)) score += 1;
    return score;
  }

  function voiceChoices() {
    const all = loadVoices();
    const korean = all.filter(isKoreanVoice);
    const pool = korean.length ? korean : all;
    return pool.slice().sort((a, b) => voiceRank(b) - voiceRank(a) || a.name.localeCompare(b.name, "ko"));
  }

  function chosenVoice() {
    const all = loadVoices();
    if (state.voiceURI) {
      const saved = all.find((voice) => voice.voiceURI === state.voiceURI);
      if (saved) return saved;
    }
    return voiceChoices()[0] || null;
  }

  function voiceLabel(voice) {
    const raw = voice.name || "목소리";
    if (/sunhi|선희/i.test(raw)) return "선희 · 자연스러운 목소리";
    if (/injoon|인준/i.test(raw)) return "인준 · 자연스러운 목소리";
    if (/hyunsu|현수/i.test(raw)) return "현수 · 자연스러운 목소리";
    if (/heami|혜미/i.test(raw)) return "혜미 · 기본 목소리";
    if (/google/i.test(raw) && isKoreanVoice(voice)) return "구글 한국어";
    const cleaned = raw
      .replace(/^Microsoft\s+/i, "")
      .replace(/\s*-\s*Korean\s*\(Korea\)/i, "")
      .replace(/Online \(Natural\)/i, "자연")
      .trim();
    return isKoreanVoice(voice) ? cleaned : cleaned + " · " + (voice.lang || "");
  }

  function voiceNote() {
    const installed = loadVoices();
    const korean = installed.filter(isKoreanVoice);
    if (!installed.length) return "목소리를 불러오는 중입니다.";
    const natural = korean.filter((voice) => /natural|neural|online/i.test(voice.name || ""));
    if (natural.length) return "자연스러운 목소리 중에서 고릅니다. 이 목소리는 인터넷에 연결된 상태에서 읽습니다.";
    if (!/Edg\//.test(navigator.userAgent)) return "더 자연스러운 목소리는 Microsoft Edge에 있습니다. 같은 주소를 Edge로 열면 선희, 인준, 현수가 목록에 나옵니다.";
    return "Edge의 자연 목소리를 아직 찾지 못했습니다. 인터넷에 연결된 뒤 페이지를 다시 열어 보세요.";
  }

  function voiceOptionsHtml() {
    const items = voiceChoices();
    const current = chosenVoice();
    if (!items.length) return '<option value="">기본 한국어</option>';
    return items.map((voice) => '<option value="' + esc(voice.voiceURI) + '"' + (current && voice.voiceURI === current.voiceURI ? " selected" : "") + ">" + esc(voiceLabel(voice)) + "</option>").join("");
  }

  function paintVoiceSelects() {
    const html = voiceOptionsHtml();
    document.querySelectorAll("select[data-act='voice']").forEach((select) => {
      if (select.dataset.sig === html) return;
      select.innerHTML = html;
      select.dataset.sig = html;
    });
    const note = document.getElementById("voice-note");
    if (note) note.textContent = voiceNote();
  }

  function speak(text) {
    try {
      if (!window.speechSynthesis || !text) return;
      window.speechSynthesis.cancel();
      clearTimeout(speakTimer);
      speakTimer = setTimeout(() => {
        try {
          const utter = new SpeechSynthesisUtterance(text);
          const voice = chosenVoice();
          if (voice) {
            utter.voice = voice;
            utter.lang = voice.lang || "ko-KR";
          } else {
            utter.lang = "ko-KR";
          }
          utter.rate = 0.92;
          window.speechSynthesis.speak(utter);
        } catch (err) { /* 음성 읽기는 선택입니다. */ }
      }, 40);
    } catch (err) { /* 음성 읽기는 선택입니다. */ }
  }

  let hearing = false;
  let transcribing = false;
  let dict = null;
  let hearWorker = null;
  let hearWorkerBroken = false;
  const mainEar = {};
  let earJob = 0;
  const earWaiters = new Map();
  const EAR_LIB = "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";
  const HEAR_LABEL = "다시 눌러 적기";

  function cloudSpeech() {
    if (/Cursor\/|Electron\//.test(navigator.userAgent)) return null;
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }

  function dictateHint() {
    return "말로 입력을 누르고 말한 뒤, 같은 버튼(다시 눌러 적기)을 누르면 개역한글로 들어갑니다.";
  }

  function cleanHeard(text) {
    const said = String(text || "")
      .replace(/\[[^\]]*\]/g, " ")
      .replace(/\([^)]*\)/g, " ")
      .replace(/<\|[^|]*\|>/g, " ")
      .replace(/[^\uac00-\ud7a3\s0-9.,?!]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!/[\uac00-\ud7a3]/.test(said)) return "";
    if (/(?:시청해\s?주셔서|구독과|좋아요|자막|MBC|KBS|SBS)/.test(said) && said.length < 30) return "";
    const list = said.split(" ").filter(Boolean);
    const kept = list.filter((word, i) => !(i >= 2 && word === list[i - 1] && word === list[i - 2]));
    const counts = {};
    kept.forEach((word) => { counts[word] = (counts[word] || 0) + 1; });
    if (kept.length >= 4 && Math.max(...Object.values(counts)) > kept.length * 0.5) return "";
    return kept.join(" ");
  }

  function markHearing(on) {
    document.querySelectorAll("[data-act='dictate']").forEach((btn) => {
      btn.disabled = false;
      btn.classList.toggle("listening", on);
      btn.textContent = on ? HEAR_LABEL : "말로 입력";
    });
  }

  function setHearNote(text) {
    const btn = document.querySelector("[data-act='dictate']");
    if (!btn || !btn.parentElement) return;
    let note = document.getElementById("hear-note");
    if (!note) {
      note = document.createElement("p");
      note.id = "hear-note";
      note.className = "faint";
      btn.parentElement.insertBefore(note, btn);
    }
    note.textContent = text;
  }

  function downsample(input, fromRate, toRate) {
    if (fromRate === toRate) return input;
    const ratio = fromRate / toRate;
    const length = Math.max(1, Math.round(input.length / ratio));
    const out = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      const pos = i * ratio;
      const i0 = Math.floor(pos);
      const i1 = Math.min(i0 + 1, input.length - 1);
      const t = pos - i0;
      out[i] = input[i0] * (1 - t) + input[i1] * t;
    }
    return out;
  }

  function normalize(samples) {
    let peak = 0;
    for (let i = 0; i < samples.length; i++) {
      const value = Math.abs(samples[i]);
      if (value > peak) peak = value;
    }
    if (peak < 0.001 || peak > 0.9) return samples;
    const gain = 0.9 / peak;
    const out = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) out[i] = Math.max(-1, Math.min(1, samples[i] * gain));
    return out;
  }

  function closeDict(current) {
    if (!current) return;
    clearTimeout(current.timer);
    if (current.rec) {
      current.rec.onend = null;
      current.rec.onresult = null;
      current.rec.onerror = null;
      try { current.rec.abort(); } catch (err) { /* 이미 멈춘 인식입니다. */ }
    }
    stopCapture(current.recorder);
    if (current.stream) current.stream.getTracks().forEach((track) => track.stop());
    if (current.ctx) current.ctx.close().catch(() => {});
  }

  function showTranscribing() {
    transcribing = true;
    document.querySelectorAll("[data-act='dictate']").forEach((btn) => {
      btn.disabled = true;
      btn.textContent = "받아 적는 중";
    });
    setHearNote("받아 적는 중…");
  }

  function startCapture(ctx, stream) {
    const source = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(4096, 1, 1);
    const mute = ctx.createGain();
    mute.gain.value = 0;
    const capture = { parts: [], length: 0, rate: ctx.sampleRate, source, node, mute, stopped: false };
    node.onaudioprocess = (event) => {
      if (capture.stopped) return;
      const data = new Float32Array(event.inputBuffer.getChannelData(0));
      capture.parts.push(data);
      capture.length += data.length;
    };
    source.connect(node);
    node.connect(mute);
    mute.connect(ctx.destination);
    return capture;
  }

  function stopCapture(capture) {
    if (!capture || capture.stopped) return null;
    capture.stopped = true;
    capture.node.onaudioprocess = null;
    try { capture.source.disconnect(); capture.node.disconnect(); capture.mute.disconnect(); } catch (err) { /* 이미 끊긴 연결입니다. */ }
    const out = new Float32Array(capture.length);
    let at = 0;
    capture.parts.forEach((part) => { out.set(part, at); at += part.length; });
    capture.parts = [];
    return out;
  }

  function stopHearing() {
    hearing = false;
    const current = dict;
    dict = null;
    closeDict(current);
  }

  function ensureHearWorker() {
    if (hearWorker || hearWorkerBroken) return hearWorker;
    try {
      hearWorker = new Worker("src/ear.js?v=6", { type: "module" });
    } catch (err) {
      hearWorkerBroken = true;
      return null;
    }
    hearWorker.onmessage = (event) => {
      const msg = event.data || {};
      const waiter = earWaiters.get(msg.id);
      if (!waiter) return;
      if (msg.status === "progress") {
        const pct = msg.progress == null ? null : Math.round(msg.progress);
        waiter.onNote(pct == null ? "음성 모델을 준비하는 중…" : "음성 모델을 받는 중… " + pct + "% (처음 한 번만 받습니다)");
      } else if (msg.status === "ready") {
        waiter.onNote("받아 적는 중…");
      } else if (msg.status === "done") {
        earWaiters.delete(msg.id);
        waiter.resolve(cleanHeard(msg.text));
      } else if (msg.status === "error") {
        earWaiters.delete(msg.id);
        waiter.reject(new Error(msg.message || "transcribe"));
      }
    };
    hearWorker.onerror = (event) => {
      if (event && event.preventDefault) event.preventDefault();
      hearWorkerBroken = true;
      hearWorker = null;
      const waiting = [...earWaiters.values()];
      earWaiters.clear();
      waiting.forEach((waiter) => waiter.fallback());
    };
    return hearWorker;
  }

  function earModel() {
    return state.earModel === "small" ? "Xenova/whisper-small" : "Xenova/whisper-base";
  }

  async function transcribeHere(audio, onNote) {
    const model = earModel();
    if (!mainEar[model]) {
      onNote("음성 모델을 준비하는 중…");
      mainEar[model] = import(EAR_LIB).then(({ pipeline, env }) => {
        env.allowLocalModels = false;
        env.backends.onnx.wasm.wasmPaths = EAR_LIB + "/dist/";
        return pipeline("automatic-speech-recognition", model, {
          quantized: true,
          progress_callback: (item) => {
            if (item && item.status === "progress") onNote("음성 모델을 받는 중… " + Math.round(item.progress) + "% (처음 한 번만 받습니다)");
          }
        });
      });
      mainEar[model].catch(() => { mainEar[model] = null; });
    }
    const asr = await mainEar[model];
    onNote("받아 적는 중…");
    const result = await asr(audio, { language: "korean", task: "transcribe", chunk_length_s: 30, stride_length_s: 5, no_repeat_ngram_size: 3, repetition_penalty: 1.15, num_beams: 1 });
    return cleanHeard(result && result.text);
  }

  function transcribeKorean(samples, onNote) {
    const audio = new Float32Array(samples);
    const worker = ensureHearWorker();
    if (!worker) return transcribeHere(audio, onNote);
    const id = ++earJob;
    const copy = new Float32Array(audio);
    return new Promise((resolve, reject) => {
      earWaiters.set(id, { resolve, reject, onNote, fallback: () => transcribeHere(audio, onNote).then(resolve, reject) });
      worker.postMessage({ id, audio: copy, model: earModel() }, [copy.buffer]);
    });
  }

  function hasSpeech(samples) {
    const frame = 320;
    const levels = [];
    for (let i = 0; i + frame <= samples.length; i += frame) {
      let sum = 0;
      for (let j = i; j < i + frame; j++) sum += samples[j] * samples[j];
      levels.push(Math.sqrt(sum / frame));
    }
    if (levels.length < 10) return false;
    levels.sort((a, b) => a - b);
    const floor = Math.max(levels[Math.floor(levels.length * 0.15)], 1e-5);
    const loud = levels[Math.floor(levels.length * 0.9)];
    return loud / floor >= 1.45;
  }

  function prepareSamples(data, rate) {
    if (!data || data.length < rate * 0.4) return null;
    const audio = downsample(data, rate, 16000);
    if (!hasSpeech(audio)) return "silent";
    return normalize(quietGaps(audio));
  }

  function quietGaps(samples) {
    const frame = 320;
    const levels = [];
    for (let i = 0; i < samples.length; i += frame) {
      let sum = 0;
      const end = Math.min(samples.length, i + frame);
      for (let j = i; j < end; j++) sum += samples[j] * samples[j];
      levels.push(Math.sqrt(sum / Math.max(1, end - i)));
    }
    const sorted = levels.slice().sort((a, b) => a - b);
    const floor = sorted[Math.floor(sorted.length * 0.2)] || 0;
    const out = new Float32Array(samples.length);
    let gain = 1;
    for (let f = 0; f < levels.length; f++) {
      const target = levels[f] > floor * 1.8 ? 1 : 0.15;
      for (let j = f * frame; j < Math.min(samples.length, (f + 1) * frame); j++) {
        gain += (target - gain) * (target > gain ? 0.05 : 0.002);
        out[j] = samples[j] * gain;
      }
    }
    return out;
  }

  function heardTarget(form) {
    if (form.dataset.act === "recall" && ui.session && ui.session.step) {
      const verse = map.get(ui.session.step.id);
      return verse ? verse.text : "";
    }
    const question = currentQuestion();
    if (!question) return "";
    const verse = map.get(question.id);
    if (!verse) return "";
    if (question.kind === "full") return verse.text;
    if (question.kind === "opening") return E.words(verse.text).slice(0, 6).join(" ");
    return "";
  }

  function writeHeard(form, said) {
    const live = form && form.isConnected ? form : document.querySelector("form[data-act='answer-full'], form[data-act='recall'], form[data-act='answer-opening'], form[data-act='blanks']");
    if (!said || !live) return false;
    form = live;
    const field = form.elements.text || null;
    if (field) {
      const classic = E.toClassic(said, heardTarget(form)) || said;
      const base = field.value.trim();
      field.value = (base ? base + " " : "") + classic;
      field.dataset.spoken = "1";
      field.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }
    const question = currentQuestion();
    if (!question || question.kind !== "blanks") return false;
    const verseWords = E.words(map.get(question.id).text);
    const parts = said.split(" ").filter(Boolean);
    const whole = parts.length >= Math.max(4, Math.floor(verseWords.length / 2));
    const slots = whole ? E.alignHeard(said, verseWords.join(" ")) : null;
    let placed = false;
    question.blanks.forEach((index, n) => {
      const input = form.elements["b" + index];
      const word = whole ? slots[index] : parts[n] ? E.toClassic(parts[n], verseWords[index]) : "";
      if (input && word) {
        input.value = word;
        input.dataset.spoken = "1";
        placed = true;
      }
    });
    return placed;
  }

  function startCloud(current, Cloud) {
    let rec;
    try { rec = new Cloud(); } catch (err) { return; }
    current.rec = rec;
    current.finals = "";
    current.session = "";
    rec.lang = "ko-KR";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript + " ";
      current.session = text.replace(/\s+/g, " ").trim();
      const live = (current.finals + " " + current.session).trim();
      if (dict === current && live) setHearNote("들은 말: " + live);
    };
    rec.onerror = (event) => {
      if (["network", "not-allowed", "service-not-allowed", "language-not-supported", "audio-capture"].includes(event.error)) current.cloudDead = true;
    };
    rec.onend = () => {
      current.finals = (current.finals + " " + current.session).trim();
      current.session = "";
      if (current.onCloudEnd) current.onCloudEnd();
      if (dict === current && !current.closing && !current.cloudDead) {
        try { rec.start(); } catch (err) { current.cloudDead = true; }
      }
    };
    try { rec.start(); } catch (err) { current.cloudDead = true; }
  }

  function startHearing(form) {
    stopHearing();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.AudioContext) {
      setHearNote("이 화면에서는 마이크를 쓸 수 없습니다. https 주소나 start.bat으로 연 주소(http://127.0.0.1:5173)에서 말해 주세요.");
      return;
    }
    const current = { form, rec: null, recorder: null, stream: null, ctx: null, armed: false, closing: false, timer: null, finals: "", session: "" };
    dict = current;
    hearing = true;
    markHearing(true);
    setHearNote("마이크를 켜는 중…");
    const Cloud = cloudSpeech();
    if (Cloud) startCloud(current, Cloud);
    current.ctx = new AudioContext();
    const ready = current.ctx.resume().catch(() => {});
    navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true, channelCount: 1 }
    }).then(async (stream) => {
      await ready;
      if (dict !== current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      current.stream = stream;
      current.recorder = startCapture(current.ctx, stream);
      current.timer = setTimeout(() => {
        if (dict === current) finishHearing();
      }, 90000);
      if (current.armed) {
        finishHearing();
        return;
      }
      setHearNote("듣는 중입니다. 말을 마치면 이 버튼을 다시 눌러 주세요.");
    }).catch((err) => {
      if (dict !== current) return;
      stopHearing();
      transcribing = false;
      markHearing(false);
      const name = err && err.name;
      if (name === "NotAllowedError") setHearNote("마이크 권한이 막혀 있습니다. 주소창 왼쪽 자물쇠에서 마이크를 허용한 뒤 다시 눌러 주세요.");
      else if (name === "NotFoundError") setHearNote("연결된 마이크를 찾지 못했습니다.");
      else setHearNote("마이크를 켜지 못했습니다. (" + (name || err) + ")");
    });
  }

  async function finishHearing() {
    const current = dict;
    if (!current) return;
    showTranscribing();
    if (!current.recorder) {
      current.armed = true;
      return;
    }
    current.closing = true;
    dict = null;
    hearing = false;
    clearTimeout(current.timer);
    const cloudDone = current.rec && !current.cloudDead
      ? new Promise((resolve) => {
        current.onCloudEnd = resolve;
        setTimeout(resolve, 1500);
        try { current.rec.stop(); } catch (err) { resolve(); }
      })
      : Promise.resolve();
    let said = "";
    let reason = "";
    try {
      const raw = stopCapture(current.recorder);
      current.stream.getTracks().forEach((track) => track.stop());
      await cloudDone;
      said = cleanHeard(current.finals + " " + current.session);
      if (!said) {
        const samples = prepareSamples(raw, current.recorder.rate);
        if (!samples) reason = "녹음된 소리가 너무 짧습니다. 말한 뒤에 버튼을 눌러 주세요.";
        else if (samples === "silent") reason = "말소리가 들리지 않았습니다. 마이크 가까이에서 또렷하게 말한 뒤 다시 눌러 주세요.";
        else said = await transcribeKorean(samples, setHearNote);
      }
    } catch (err) {
      reason = "받아 적지 못했습니다. 인터넷 연결을 확인한 뒤 다시 해 주세요. (" + ((err && err.message) || err) + ")";
    }
    closeDict(current);
    const placed = said ? writeHeard(current.form, said) : false;
    transcribing = false;
    markHearing(false);
    if (placed) setHearNote("개역한글 표기로 넣어 두었습니다. 고칠 곳이 있으면 고친 뒤 확인해 보세요.");
    else if (said) setHearNote("들은 말: " + said + " (넣을 칸을 찾지 못했습니다)");
    else setHearNote(reason || "말소리를 알아듣지 못했습니다. 마이크 가까이에서 또렷하게 다시 말해 주세요.");
  }

  function rememberAnswerDraft() {
    if (!hearing) return;
    const field = document.querySelector("form[data-act='recall'] textarea, form[data-act='answer-full'] textarea, form[data-act='answer-opening'] textarea");
    if (field && field.form && field.form.dataset.act === "recall" && ui.session && ui.session.step) {
      ui.session.step.draft = field.value;
      ui.session.step.draftSpoken = field.dataset.spoken === "1";
    }
    const question = currentQuestion();
    if (field && question && (question.kind === "full" || question.kind === "opening")) {
      question.draft = field.value;
      question.draftSpoken = field.dataset.spoken === "1";
    }
    const blanksForm = document.querySelector("form[data-act='blanks']");
    if (blanksForm && question && question.kind === "blanks") {
      question.draftBlanks = {};
      question.draftSpoken = false;
      question.blanks.forEach((index) => {
        const input = blanksForm.elements["b" + index];
        if (!input) return;
        question.draftBlanks[index] = input.value;
        if (input.dataset.spoken === "1") question.draftSpoken = true;
      });
    }
  }

  function dictateButton() {
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && !window.SpeechRecognition && !window.webkitSpeechRecognition) return "";
    if (transcribing) return '<button class="btn" type="button" data-act="dictate" disabled>받아 적는 중</button> ';
    return '<button class="btn' + (hearing ? " listening" : "") + '" type="button" data-act="dictate">' + (hearing ? HEAR_LABEL : "말로 입력") + "</button> ";
  }

  function wordPool(id) {
    const verse = map.get(id);
    const bag = [];
    list.forEach((item) => {
      if (Math.abs(item.chapter - verse.chapter) > 1 || item.id === id) return;
      E.words(item.text).forEach((word) => bag.push(word));
    });
    return bag;
  }

  function production(id, salt) {
    const verse = map.get(id);
    const seed = E.hash(id + ":" + salt + ":" + today());
    if (E.words(verse.text).length <= 18) return { kind: "full", id, qid: "f" + id + ":" + salt };
    return { kind: "blanks", id, blanks: E.pickBlanks(verse.text, 3, seed), qid: "b" + id + ":" + salt };
  }

  function baseSession(kind) {
    return {
      kind, block: "", queue: [], cursor: 0, results: [], feedback: null,
      waiting: [], didWaiting: false, learnIds: [], learnCursor: 0, ready: [], didReady: false,
      step: null, phase: "exam", xpStart: state.xp, lampsAtStart: lampsLit(),
      missed: [], lastExam: null, summary: null, orderPicked: [], orderFor: "", chapter: 0
    };
  }

  function tailOf(id) {
    const verse = map.get(id);
    const prev = list[verse.index - 1];
    if (!prev || prev.chapter !== verse.chapter) return "";
    return E.words(prev.text).slice(-4).join(" ");
  }

  function go(page) {
    clearTimerFn();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (page !== "session" && ui.session && ui.session.phase === "done") ui.session = null;
    ui.page = page;
    render();
  }

  function startDaily() {
    if (ui.session && ui.session.phase !== "done") {
      ui.page = "session";
      render();
      return;
    }
    const waiting = waitingIds();
    const due = dueVerses();
    const room = Math.max(0, 5 - day().newPassed.length - waiting.length);
    const learnIds = nextNew(room).map((verse) => verse.id);
    if (!waiting.length && !due.length && !learnIds.length) {
      ui.page = "review";
      render();
      return;
    }
    const reviews = due.slice(0, 8).map((verse) => verse.id);
    const session = baseSession("daily");
    session.waiting = waiting;
    session.learnIds = learnIds;
    session.queue = reviews.map((id, index) => production(id, "rev" + index));
    session.block = reviews.length ? "review" : "";
    session.phase = reviews.length ? "exam" : "read";
    ui.session = session;
    ui.page = "session";
    day().seconds += 5;
    if (!reviews.length) nextDaily();
    render();
  }

  function startReview(ids) {
    if (!ids.length) return;
    ui.session = baseSession("review");
    ui.session.queue = ids.map((id, index) => production(id, "rv" + index));
    ui.session.phase = "exam";
    ui.page = "session";
    render();
  }

  function startSpot(chapter) {
    const pool = [];
    list.forEach((verse) => {
      const card = state.cards[verse.id];
      if (!card || card.stage < 3) return;
      if (chapter !== "all" && verse.chapter !== Number(chapter)) return;
      let weight = 1;
      if (card.due <= today()) weight += 5;
      weight += (card.lapses || 0) * 2;
      weight += Math.max(0, 2.8 - (card.ease || 2.5));
      pool.push({ id: verse.id, w: weight });
    });
    if (!pool.length) return;
    ui.session = baseSession("spot");
    ui.session.chapter = chapter;
    ui.session.queue = E.buildSpotQuestions(list, pool, E.hash(String(Date.now())));
    ui.session.phase = "exam";
    ui.page = "session";
    render();
  }

  function startChapter(chapter, kind) {
    const attempts = state.chapters[String(chapter)]?.attempts || 0;
    const seed = E.hash(kind + ":" + chapter + ":" + attempts + ":" + today());
    ui.session = baseSession(kind);
    ui.session.chapter = Number(chapter);
    ui.session.queue = E.buildChapterQuestions(list, Number(chapter), seed, kind === "placement" ? 6 : 4);
    ui.session.phase = "exam";
    ui.page = "session";
    render();
  }

  function nextDaily() {
    const session = ui.session;
    if (session.waiting.length && !session.didWaiting) {
      session.didWaiting = true;
      session.block = "exam";
      session.queue = E.buildDailyQuestions(list, session.waiting, E.hash("w" + today() + session.waiting.join(",")));
      session.cursor = 0;
      session.results = [];
      session.phase = "exam";
      session.feedback = null;
      return;
    }
    if (session.learnCursor < session.learnIds.length) {
      beginLearn();
      return;
    }
    if (session.ready.length && !session.didReady) {
      session.didReady = true;
      session.block = "exam";
      session.queue = E.buildDailyQuestions(list, session.ready, E.hash("r" + today() + session.ready.join(",")));
      session.cursor = 0;
      session.results = [];
      session.phase = "exam";
      session.feedback = null;
      return;
    }
    finishDaily();
  }

  function beginLearn() {
    const session = ui.session;
    if (session.learnCursor >= session.learnIds.length) {
      nextDaily();
      return;
    }
    session.phase = "read";
    session.block = "learn";
    session.feedback = null;
    session.step = { id: session.learnIds[session.learnCursor] };
  }

  function afterRead() {
    const session = ui.session;
    const verse = map.get(session.step.id);
    const chunks = E.chunksOf(verse.text);
    if (chunks.length < 2) {
      beginCloze();
      return;
    }
    session.phase = "chunk";
    session.step = {
      id: verse.id,
      chunks,
      picked: [],
      bank: E.seededShuffle(chunks.map((_, index) => index), E.hash(verse.id + "chunk")),
      errors: 0,
      done: false,
      shake: false,
      hinted: false
    };
  }

  function beginCloze() {
    const session = ui.session;
    const id = session.step.id;
    const verse = map.get(id);
    const blanks = E.pickBlanks(verse.text, 3, E.hash(verse.id + "cloze"));
    session.phase = "cloze";
    session.step = {
      id,
      blanks,
      filled: {},
      bank: E.makeClozeBank(verse.text, blanks, wordPool(id), E.hash(verse.id + "bank")),
      misses: 0,
      done: false,
      shake: false,
      wrong: []
    };
  }

  function beginRecall() {
    const id = ui.session.step.id;
    ui.session.phase = "recall";
    ui.session.feedback = null;
    ui.session.step = { id, attempts: 0, showSkeleton: false };
  }

  function tapChunk(index) {
    const step = ui.session.step;
    if (!step || step.done || step.picked.includes(index)) return;
    if (index === step.picked.length) {
      step.picked.push(index);
      if (step.picked.length === step.chunks.length) {
        step.done = true;
        schedule(420, () => beginCloze());
      }
    } else {
      step.errors += 1;
      step.shake = true;
      if (step.errors >= 4 && step.picked.length === 0) {
        step.picked = [0];
        step.errors = 0;
        step.hinted = true;
      }
    }
    render();
  }

  function fillCloze(uid) {
    const step = ui.session.step;
    if (!step || step.done) return;
    if (Object.values(step.filled).includes(uid)) return;
    const next = step.blanks.find((index) => !step.filled[index]);
    if (next == null) return;
    step.filled[next] = uid;
    step.wrong = [];
    if (step.blanks.every((index) => step.filled[index])) {
      const verseWords = E.words(map.get(step.id).text);
      const wrong = [];
      step.blanks.forEach((index) => {
        const token = step.bank.find((item) => item.uid === step.filled[index]);
        if (!token || E.normalize(token.word) !== E.normalize(verseWords[index])) wrong.push(index);
      });
      if (!wrong.length) {
        step.done = true;
        schedule(420, () => beginRecall());
      } else {
        wrong.forEach((index) => { delete step.filled[index]; });
        step.misses += 1;
        step.wrong = wrong;
        step.shake = true;
      }
    }
    render();
  }

  function submitRecall(text, spoken) {
    const session = ui.session;
    const step = session.step;
    const verse = map.get(step.id);
    const score = spoken ? E.spokenSimilarity(text, verse.text) : E.similarity(text, verse.text);
    const pass = score >= 0.9;
    step.attempts += 1;
    session.feedback = {
      kind: "recall", id: verse.id, score, pass, input: text, answer: verse.text, phaseRecall: true, spoken: !!spoken
    };
    const card = state.cards[verse.id] || E.blankCard(today());
    card.last = today();
    card.introduced = card.introduced || today();
    card.due = today();
    if (pass) {
      card.stage = Math.max(card.stage || 0, 2);
      card.correct = (card.correct || 0) + 1;
      if (!session.ready.includes(verse.id)) session.ready.push(verse.id);
      addXp(12);
    } else {
      card.stage = Math.max(card.stage || 0, 1);
      card.wrong = (card.wrong || 0) + 1;
      step.showSkeleton = true;
      addEffortXp();
    }
    state.cards[verse.id] = card;
    step.draft = "";
    step.draftSpoken = false;
    render();
  }

  function skipVerse() {
    const session = ui.session;
    const id = session.step.id;
    const card = state.cards[id] || E.blankCard(today());
    card.stage = Math.max(card.stage || 0, 1);
    card.lapses = (card.lapses || 0) + 1;
    card.due = today();
    card.last = today();
    state.cards[id] = card;
    session.learnCursor += 1;
    session.feedback = null;
    beginLearn();
    render();
  }

  function currentQuestion() {
    const session = ui.session;
    if (!session || !session.queue) return null;
    return session.queue[session.cursor] || null;
  }

  function acceptAnswer(payload) {
    const session = ui.session;
    if (!session || session.feedback) return;
    const question = currentQuestion();
    if (!question) return;
    const result = E.grade(question, payload, list);
    result.spoken = !!payload.spoken;
    question.draft = "";
    question.draftSpoken = false;
    question.draftBlanks = null;
    result.repair = !!question.repair;
    result.input = payload.text || "";
    result.given = payload.blanks || null;
    session.feedback = result;
    session.results.push(result);
    if (!result.pass && !question.repair && (question.kind === "full" || question.kind === "blanks")) {
      session.queue.push(Object.assign({}, question, { repair: true, qid: question.qid + ":r" }));
    }
    const drilled = session.kind === "review" || session.kind === "spot" || session.kind === "single" || session.block === "review";
    if (drilled && (result.kind === "full" || result.kind === "blanks")) recordReview(result);
    else if (drilled) recordPoints(result);
    render();
  }

  function recordReview(result) {
    const quality = result.pass ? E.qualityFromScore(result.score) : Math.min(E.qualityFromScore(result.score), 2);
    const prev = state.cards[result.id] || E.blankCard(today());
    const card = E.applySrs(prev, quality, today());
    if ((prev.stage || 0) >= 3 || result.pass) card.stage = Math.max(card.stage || 0, 3);
    if (card.stage >= 3 && !card.masteredOn) card.masteredOn = prev.masteredOn || today();
    state.cards[result.id] = card;
    const todayLog = day();
    todayLog.reviews += 1;
    if (result.pass) todayLog.reviewHits += 1;
    todayLog.points += result.score;
    todayLog.possible += 1;
    if (result.pass) addXp(8);
    else addEffortXp();
  }

  function recordPoints(result) {
    day().points += result.score;
    day().possible += 1;
    if (result.pass) addXp(4);
  }

  function lastByVerse(results) {
    const finalMap = {};
    results.forEach((result) => {
      if (result.kind === "full" || result.kind === "blanks") finalMap[result.id] = result;
    });
    return finalMap;
  }

  function markLearned(id, score) {
    const prev = state.cards[id];
    const first = !prev || prev.stage < 3;
    const card = E.applySrs(prev || E.blankCard(today()), E.qualityFromScore(score), today());
    card.stage = 3;
    if (!card.masteredOn) card.masteredOn = today();
    card.introduced = (prev && prev.introduced) || today();
    state.cards[id] = card;
    if (first && !day().newPassed.includes(id)) day().newPassed.push(id);
    addXp(score >= 0.96 ? 14 : 10);
  }

  function keepStage2(id) {
    const card = state.cards[id] || E.blankCard(today());
    card.stage = 2;
    card.due = today();
    card.last = today();
    card.wrong = (card.wrong || 0) + 1;
    state.cards[id] = card;
  }

  function foldDailyExam() {
    const session = ui.session;
    const finalMap = lastByVerse(session.results);
    const scores = session.results.map((result) => result.score);
    session.results.forEach((result) => {
      day().points += result.score;
      day().possible += 1;
    });
    Object.keys(finalMap).forEach((id) => {
      if (finalMap[id].pass) markLearned(id, finalMap[id].score);
      else keepStage2(id);
    });
    session.lastExam = {
      avg: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0,
      passed: Object.values(finalMap).filter((result) => result.pass).length,
      of: Object.keys(finalMap).length
    };
    session.missed = (session.missed || []).concat(Object.keys(finalMap).filter((id) => !finalMap[id].pass));
    session.results = [];
  }

  function finishDaily() {
    const session = ui.session;
    const goal = todayGoal();
    const todayLog = day();
    if (goal > 0 && todayLog.newPassed.length >= goal && !todayLog.bonus) {
      todayLog.bonus = true;
      addXp(40);
      session.summaryBonus = true;
    }
    session.phase = "done";
    session.feedback = null;
    session.summary = {
      kind: "daily",
      goal,
      done: todayLog.newPassed.length,
      bonus: !!session.summaryBonus,
      missed: session.missed || [],
      lamps: lampsLit() > session.lampsAtStart
    };
  }

  function finishDrill() {
    const session = ui.session;
    const finalMap = lastByVerse(session.results);
    const scores = session.results.map((result) => result.score);
    const byChapter = {};
    Object.keys(finalMap).forEach((id) => {
      const chapter = String(map.get(id).chapter);
      if (!byChapter[chapter]) byChapter[chapter] = false;
      if (!finalMap[id].pass) byChapter[chapter] = true;
    });
    Object.keys(byChapter).forEach((chapter) => {
      const rec = state.chapters[chapter] || { best: 0, passed: false, attempts: 0, shaken: false };
      if (byChapter[chapter]) rec.shaken = true;
      else if (rec.passed) rec.shaken = false;
      state.chapters[chapter] = rec;
    });
    session.phase = "done";
    session.feedback = null;
    session.summary = {
      kind: session.kind,
      avg: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0,
      pass: Object.values(finalMap).every((result) => result.pass),
      weak: Object.keys(finalMap).filter((id) => !finalMap[id].pass)
    };
    if (session.kind === "spot" && session.summary.pass) addXp(24);
  }

  function markChapterKnown(chapter) {
    list.filter((verse) => verse.chapter === chapter).forEach((verse) => {
      const prev = state.cards[verse.id];
      if (prev && prev.stage >= 3) return;
      state.cards[verse.id] = {
        ease: 2.6, interval: 7, reps: 3, lapses: 0, due: E.addDays(today(), 3),
        stage: 3, correct: 1, wrong: 0, introduced: today(), last: today(), masteredOn: today()
      };
    });
  }

  function finishChapter() {
    const session = ui.session;
    const scores = session.results.map((result) => result.score);
    const avg = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;
    const hardFail = session.results.some((result) => (result.kind === "full" || result.kind === "blanks") && result.score < 0.6);
    const pass = avg >= 0.85 && !hardFail;
    const key = String(session.chapter);
    const prev = state.chapters[key] || { best: 0, passed: false, attempts: 0, shaken: false };
    prev.attempts += 1;
    prev.best = Math.max(prev.best || 0, avg);
    prev.passed = prev.passed || pass;
    prev.shaken = pass ? false : true;
    prev.at = new Date().toISOString();
    state.chapters[key] = prev;
    if (pass && session.kind === "placement") {
      markChapterKnown(session.chapter);
      addXp(80);
    }
    if (pass && session.kind === "chapter") addXp(120);
    if (!pass) {
      session.results.forEach((result) => {
        if ((result.kind === "full" || result.kind === "blanks") && result.score < 0.6 && state.cards[result.id]) {
          const card = E.applySrs(state.cards[result.id], 1, today());
          card.stage = Math.max(card.stage || 0, 3);
          state.cards[result.id] = card;
        }
      });
    }
    const finalMap = lastByVerse(session.results);
    session.phase = "done";
    session.feedback = null;
    session.summary = {
      kind: session.kind,
      avg,
      pass,
      weak: Object.keys(finalMap).filter((id) => finalMap[id].score < 0.9)
    };
    session.results.forEach((result) => {
      day().points += result.score;
      day().possible += 1;
    });
  }

  function continueFeedback() {
    const session = ui.session;
    if (!session || !session.feedback) return;
    if (session.phase === "recall") {
      const passed = session.feedback.pass;
      session.feedback = null;
      if (passed) {
        session.learnCursor += 1;
        beginLearn();
      }
      render();
      return;
    }
    session.feedback = null;
    session.cursor += 1;
    if (session.cursor >= session.queue.length) onQueueComplete();
    render();
  }

  function onQueueComplete() {
    const session = ui.session;
    if (session.kind === "daily") {
      if (session.block === "exam") foldDailyExam();
      nextDaily();
      return;
    }
    if (session.kind === "chapter" || session.kind === "placement") {
      finishChapter();
      return;
    }
    finishDrill();
  }

  function togglePrayer(slot) {
    const todayLog = day();
    todayLog.prayer[slot] = !todayLog.prayer[slot];
    if (todayLog.prayer[slot] && !todayLog.prayerXp[slot]) {
      todayLog.prayerXp[slot] = true;
      addXp(6);
    }
    render();
  }

  function setName(value) {
    const name = String(value || "").trim().slice(0, 16);
    if (!name) {
      ui.nameError = "이름을 적어 주세요.";
      render();
      return;
    }
    state.name = name;
    if (!state.createdAt) state.createdAt = today();
    ui.nameError = "";
    if (ui.page === "welcome") ui.page = "home";
    render();
  }

  function submitJournal(form) {
    saveJournal({
      editId: form.dataset.id || "",
      text: String(form.elements.text.value || "").trim(),
      refRaw: String(form.elements.ref.value || "").trim(),
      mood: form.dataset.id ? (ui.editDraft && ui.editDraft.mood) || ui.mood : ui.mood
    });
  }

  function journalFail(values, message) {
    if (values.editId) {
      ui.editError = message;
      ui.editDraft = { text: values.text, ref: values.refRaw, mood: values.mood };
    } else {
      ui.journalError = message;
      ui.draft = values.text;
      ui.draftRef = values.refRaw;
    }
    ui.skipCapture = true;
    render();
  }

  function saveJournal(values) {
    if (!values.text) return journalFail(values, "한 줄은 남겨 주세요.");
    let verse = null;
    if (values.refRaw) {
      if (!B.ready()) {
        B.load().then(() => saveJournal(values), () => journalFail(values, "성경 본문을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요."));
        return;
      }
      verse = journalVerse(values.refRaw);
      if (typeof verse === "string") return journalFail(values, verse);
    }
    const fields = {
      text: values.text.slice(0, 1000),
      mood: values.mood,
      ref: verse ? verse.key : "",
      refLabel: verse ? verse.label : "",
      refText: verse ? verse.text : ""
    };
    if (values.editId) {
      const item = state.journal.find((entry) => entry.id === values.editId);
      if (item) Object.assign(item, fields, { editedAt: new Date().toISOString() });
      ui.editing = "";
      ui.editDraft = null;
      ui.editError = "";
    } else {
      state.journal.unshift(Object.assign({
        id: Date.now().toString(36),
        at: new Date().toISOString(),
        day: today(),
        amened: false
      }, fields));
      addXp(8);
      ui.draft = "";
      ui.draftRef = "";
      ui.journalError = "";
    }
    ui.skipCapture = true;
    render();
  }

  function journalVerse(raw) {
    const ref = B.parseRef(raw);
    if (!ref || ref.verse == null) return "구절은 요 3:16, 시 23:1-3처럼 책 이름과 장·절을 적어 주세요. 책 이름이 없으면 계시록으로 봅니다.";
    if (ref.end && ref.end - ref.verse >= 10) return "함께 둘 구절은 열 절까지입니다.";
    return { key: B.refKey(ref), label: B.label(ref), text: B.textOf(ref, 10) };
  }

  function entryVerse(entry) {
    if (!entry.ref) return null;
    if (entry.refText) return { label: entry.refLabel, text: entry.refText };
    const old = map.get(entry.ref);
    return old ? { label: refText(old.id), text: old.text } : null;
  }

  function entryRefInput(entry) {
    if (!entry.ref) return "";
    if (entry.refLabel) return entry.refLabel;
    const ref = B.keyToRef(entry.ref);
    return ref ? B.label(ref) : "";
  }

  function paintRefPreview(input) {
    const preview = input && document.getElementById(input.dataset.preview);
    if (!preview) return;
    const raw = input.value.trim();
    if (!raw) { preview.textContent = ""; return; }
    if (!B.ready()) {
      preview.textContent = "성경 본문을 불러오는 중…";
      B.load().then(() => paintRefPreview(document.getElementById(input.id)), () => { preview.textContent = "성경 본문을 불러오지 못했습니다."; });
      return;
    }
    const verse = journalVerse(raw);
    preview.textContent = typeof verse === "string" ? "" : verse.label + " · " + (verse.text.length > 220 ? verse.text.slice(0, 220) + "…" : verse.text);
  }

  function removeJournal(id) {
    const item = state.journal.find((entry) => entry.id === id);
    if (!item) return;
    state.journal = state.journal.filter((entry) => entry.id !== id);
    if (item.day === today()) {
      state.xp = Math.max(0, state.xp - 8);
      day().xp = Math.max(0, day().xp - 8);
    }
    render();
  }

  function exportState() {
    const blob = new Blob([JSON.stringify({ app: STORAGE, savedAt: new Date().toISOString(), state }, null, 1)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "계시록암송-기록-" + today() + ".json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function importState(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let data = null;
      try {
        const parsed = JSON.parse(String(reader.result || ""));
        data = parsed && parsed.state ? parsed.state : parsed;
      } catch (err) {
        data = null;
      }
      if (!data || data.v !== 1) {
        ui.confirm = { message: "이 앱에서 내보낸 기록 파일이 아닙니다.", act: "noop" };
        render();
        return;
      }
      ui.pendingImport = data;
      ui.confirm = { message: "지금 이 브라우저의 기록을 가져온 파일의 기록으로 바꿉니다.", act: "import-go" };
      render();
    };
    reader.readAsText(file);
  }

  function applyImport() {
    const data = ui.pendingImport;
    ui.pendingImport = null;
    if (!data) return render();
    state = Object.assign(fresh(), data);
    ui.session = null;
    ui.page = "home";
    sessionStorage.removeItem(STORAGE + ":s");
    persist();
    render();
  }

  function resetAll() {
    state = fresh();
    ui.session = null;
    ui.page = "home";
    ui.draft = "";
    localStorage.removeItem(STORAGE);
    sessionStorage.removeItem(STORAGE + ":s");
    render();
  }

  function openVerse(id) {
    const verse = map.get(id);
    if (!verse) return;
    ui.readChapter = verse.chapter;
    ui.highlight = id;
    ui.page = "read";
    render();
  }

  function captureDrafts() {
    const text = document.getElementById("journal-text");
    const ref = document.getElementById("journal-ref");
    if (text) ui.draft = text.value;
    if (ref) ui.draftRef = ref.value;
    const editText = document.getElementById("edit-text");
    const editRef = document.getElementById("edit-ref");
    if (editText && ui.editDraft) {
      ui.editDraft.text = editText.value;
      ui.editDraft.ref = editRef ? editRef.value : ui.editDraft.ref;
    }
  }

  function formatClock(date) {
    const dt = date || new Date();
    const dayText = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" }).format(dt);
    const time = new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(dt);
    return dayText + " · " + time + " 기준";
  }

  function formatWhen(iso) {
    const dt = new Date(iso);
    const dayText = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" }).format(dt);
    const time = new Intl.DateTimeFormat("ko-KR", { hour: "numeric", minute: "2-digit" }).format(dt);
    return dayText + " " + time;
  }

  function prettyDate(key) {
    if (!key) return "";
    const parts = key.split("-");
    return Number(parts[1]) + "월 " + Number(parts[2]) + "일";
  }

  function formatMinutes(seconds) {
    const minutes = Math.floor((seconds || 0) / 60);
    if (minutes < 1) return "1분 미만";
    if (minutes < 60) return minutes + "분";
    return Math.floor(minutes / 60) + "시간 " + (minutes % 60) + "분";
  }

  function greeting() {
    const hour = new Date().getHours();
    const who = state.name + "님";
    if (hour < 5) return "깊은 밤에도 말씀이 등불이 됩니다, " + who;
    if (hour < 11) return "오늘도 말씀을 새겨요, " + who;
    if (hour < 17) return "한낮의 마음에 한 절을 둡니다, " + who;
    if (hour < 21) return "오늘 하루도 수고했어요, " + who;
    return "하루를 닫기 전에 한 절만 남겨요, " + who;
  }

  function prayerNow() {
    const hour = new Date().getHours();
    if (hour < 11) return "morning";
    if (hour < 17) return "noon";
    return "evening";
  }

  function logo() {
    return '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3c2.2 3.2 5.2 5.2 5.2 8.4a5.2 5.2 0 1 1-10.4 0C10.8 8.2 13.8 6.2 16 3z" fill="#f0c14b"/><rect x="14.2" y="17" width="3.6" height="8" rx="1" fill="#171a2b"/><path d="M10 17.2h12l-1.3 2.2H11.3L10 17.2z" fill="#171a2b"/></svg>';
  }

  function diffHtml(input, answer, spoken) {
    if (!String(input || "").trim()) return '<span class="miss">' + esc(answer) + "</span>";
    const equal = spoken ? (x, y) => E.spokenSimilarity(x, y) >= 0.9 : null;
    return E.wordDiff(input, answer, equal).map((part) => {
      const cls = part.type === "ok" ? "" : part.type;
      return '<span class="' + cls + '">' + esc(part.text) + "</span>";
    }).join(" ");
  }

  function navHtml() {
    const pages = [
      ["home", "오늘"],
      ["practice", "암송"],
      ["review", "복습"],
      ["chapters", "장"],
      ["journal", "일기"],
      ["stats", "기록"]
    ];
    const current = ui.page === "read" ? "chapters" : ui.page === "session" ? "practice" : ui.page;
    const info = E.levelInfo(state.xp);
    return '<header class="nav"><button class="brand" type="button" data-act="nav" data-page="home">' + logo() +
      '<span><strong>일곱등잔</strong><small>REVELATION</small></span></button><nav class="links">' +
      pages.map(([page, label]) => '<button type="button" data-act="nav" data-page="' + page + '" class="' + (current === page ? "active" : "") + '">' + label + "</button>").join("") +
      '</nav><div class="nav-right"><span class="streak">연속 ' + activeStreak() + '일</span><span class="level">Lv.' + info.level + " " + esc(info.title) +
      '</span><span class="who">' + esc(state.name) + '</span><button class="btn gold" type="button" data-act="start-daily">' +
      (ui.session && ui.session.phase !== "done" ? "이어하기" : "오늘의 암송") + "</button></div></header>";
  }

  function welcomeHtml() {
    return '<div class="welcome"><form class="card" data-act="welcome"><p class="eyebrow">개역한글 · 요한계시록</p><h1>하루에 다섯 절, 등잔을 켜 갑니다</h1><p class="lede">읽고, 나누고, 빈칸을 메우고, 힌트 없이 적습니다. 잊기 직전에 다시 꺼내고, 한 장을 다 외우면 전체로 확인합니다.</p><label class="stack">뭐라고 부를까요<input class="textin" id="name" name="name" maxlength="16" placeholder="이름" autocomplete="name"></label>' +
      (ui.nameError ? '<p class="error">' + esc(ui.nameError) + "</p>" : "") +
      '<p><button class="btn gold" type="submit">암송을 시작할게요</button></p></form></div>';
  }

  function homeHtml() {
    const goal = todayGoal();
    const passed = day().newPassed.length;
    const due = dueVerses().length;
    const upcoming = nextNew(Math.max(0, 5 - passed));
    const plan = upcoming.length ? "계시록 " + upcoming[0].id + " – " + upcoming[upcoming.length - 1].id : "이제 외운 장을 지키는 자리입니다";
    const heroTitle = goal === 0 ? "새 절은 모두 통과했습니다" : goal + "절 중 " + Math.min(passed, goal) + "절";
    const pick = state.pick ? map.get(state.pick.id) : null;
    const pickCard = pick ? state.cards[pick.id] : null;
    const pickReason = pickCard && pickCard.stage >= 3 && pickCard.masteredOn === today()
      ? "오늘 통과한 절입니다. 한 번 더 꺼내 보면 더 오래 남습니다."
      : (state.pick ? state.pick.reason : "");
    const known = knownCount();
    const info = E.levelInfo(state.xp);
    const letters = known ? list.filter((verse) => (state.cards[verse.id]?.stage || 0) >= 3).reduce((sum, verse) => sum + verse.text.replace(/\s/g, "").length, 0) : 0;
    return '<p class="clock" id="clock"></p><h1>' + esc(greeting()) + "</h1>" +
      '<label class="search"><span aria-hidden="true">⌕</span><input id="q" placeholder="성경 전서에서 찾기: 낱말, 요 3:16, 시 23, 계 21:4" value="' + esc(ui.query) + '" autocomplete="off"></label>' +
      '<div id="search-results">' + searchHtml(ui.query) + "</div>" +
      '<section class="hero"><div><p class="eyebrow">오늘 암송</p><h2>' + esc(heroTitle) + "</h2><p class=\"muted\">" + esc(plan) + (due ? " · 먼저 복습 " + due + "절" : "") + '</p></div><button class="btn gold" type="button" data-act="start-daily">' + (ui.session && ui.session.phase !== "done" ? "이어하기" : goal === 0 ? "복습하러 가기" : "암송 시작") + "</button></section>" +
      '<div class="grid-2"><article class="card"><h3>오늘의 기도</h3><div class="prayer-row">' + prayerButtons() + '</div><p class="muted">세 번을 채운 날 ' + prayerStreak() + '일</p>' + weekDots() + '</article>' +
      '<article class="card pick"><p class="eyebrow">오늘 마음에 둘 구절</p>' + (pick ? '<p class="faint">' + esc(refText(pick.id)) + (E.MARKS[pick.id] ? " · " + esc(E.MARKS[pick.id]) : "") + '</p><blockquote>「' + esc(pick.text) + '」</blockquote><p class="why">' + esc(pickReason) + '</p><button class="btn" type="button" data-act="open-pick">' + ((state.cards[pick.id]?.stage || 0) >= 3 ? "이 절 확인하기" : "오늘의 암송에서 만나기") + "</button>" : "") + "</article></div>" +
      '<article class="card"><h3>켜진 등잔</h3><div class="lamps">' + lampsHtml() + '</div><p>' + known + " / " + list.length + "절 · 새긴 글자 " + letters.toLocaleString("ko-KR") + '</p><div class="meter"><span style="--w:' + (known / list.length * 100) + '%"></span></div><div class="stones">' + stonesHtml() + '</div><div class="xpbar" style="margin-top:14px"><span style="--w:' + (info.into / info.span * 100) + '%"></span></div><p class="faint">Lv.' + info.level + " " + esc(info.title) + " · 오늘 " + day().xp + "점</p></article>" +
      '<article class="card" style="margin-top:16px"><h3>오늘의 발자국</h3>' + footHtml() + "</article>" +
      '<p class="note">본문은 개역한글입니다. 암송 기록, 기도, 일기는 이 브라우저 안에만 쌓입니다.</p>';
  }

  function prayerButtons() {
    const prayer = day().prayer;
    const now = prayerNow();
    const slots = [["morning", "오전", "아침"], ["noon", "정오", "한낮"], ["evening", "저녁", "하루의 끝"]];
    return slots.map(([key, label, sub]) => '<button type="button" class="slot ' + (prayer[key] ? "on" : "") + (now === key ? " now" : "") + '" data-act="pray" data-slot="' + key + '" aria-pressed="' + (prayer[key] ? "true" : "false") + '">' + label + "<small>" + (prayer[key] ? "드림" : sub) + "</small></button>").join("");
  }

  function weekDots() {
    const keys = rangeKeys(7);
    return '<div class="weekdots">' + keys.map((key) => {
      const prayer = state.days[key]?.prayer || {};
      return "<span>" + ["morning", "noon", "evening"].map((slot) => '<i class="' + (prayer[slot] ? "on" : "") + '"></i>').join("") + "<em>" + Number(key.slice(8)) + "</em></span>";
    }).join("") + "</div>";
  }

  function lampsHtml() {
    const lit = lampsLit();
    let html = "";
    for (let i = 0; i < 7; i++) {
      html += '<div class="lamp ' + (i < lit ? "lit" : "") + '"><i class="flame"></i><i class="stem"></i><i class="base"></i></div>';
    }
    return html;
  }

  function stonesHtml() {
    return E.CHAPTER_META.map((meta) => {
      const rec = state.chapters[String(meta.chapter)];
      const prog = chapterProgress(meta.chapter);
      const cls = rec?.passed && rec.shaken ? "dim" : rec?.passed ? "on" : prog.known ? "half" : "";
      return '<i class="' + cls + '" title="' + meta.chapter + '장"></i>';
    }).join("");
  }

  function footHtml() {
    const todayLog = day();
    const goal = todayGoal();
    const prayers = ["morning", "noon", "evening"].filter((key) => todayLog.prayer[key]).length;
    const wrote = state.journal.some((entry) => entry.day === today());
    const items = [
      [goal === 0 || todayLog.newPassed.length >= goal, goal ? "새 절 " + Math.min(todayLog.newPassed.length, goal) + "/" + goal : "새 절은 모두 통과", "start-daily", ""],
      [todayLog.reviews > 0, "복습 " + todayLog.reviews + "절", "nav", "review"],
      [prayers === 3, "기도 " + prayers + "/3", "pray-jump", ""],
      [wrote, wrote ? "신앙일기를 남겼습니다" : "신앙일기 한 줄", "nav", "journal"],
      [todayLog.seconds >= 60, "머문 시간 " + formatMinutes(todayLog.seconds), "nav", "stats"]
    ];
    return '<div class="foot">' + items.map(([ok, label, act, page]) => '<button type="button" data-act="' + act + '"' + (page ? ' data-page="' + page + '"' : "") + '><span><i class="tick ' + (ok ? "on" : "") + '">' + (ok ? "✓" : "") + "</i>" + esc(label) + '</span><em class="tag ' + (ok ? "ok" : "") + '">' + (ok ? "지킴" : "남음") + "</em></button>").join("") + "</div>";
  }

  function searchHtml(query) {
    const q = String(query || "").trim();
    if (!q) return "";
    if (!B.ready()) {
      if (!ui.bibleError) B.load().then(refreshSearch, () => { ui.bibleError = true; refreshSearch(); });
      const local = E.searchVerses(list, q).map((verse) => ({ book: B.REVELATION, chapter: verse.chapter, verse: verse.verse, text: verse.text }));
      const note = ui.bibleError ? "성경 전서를 불러오지 못해 계시록 안에서만 찾았습니다." : "성경 전서를 불러오는 중입니다. 지금은 계시록 결과만 보입니다.";
      return resultsHtml(local, local.length, note);
    }
    const found = B.search(q, 50);
    if (!found.hits.length) return '<div class="results"><p class="results-note">찾은 구절이 없습니다. 낱말을 줄이거나 요 3:16, 시 23처럼 적어 보세요.</p></div>';
    const more = found.total > found.hits.length ? "모두 " + found.total + "절 가운데 앞 " + found.hits.length + "절입니다. 낱말을 더 붙이거나 책 이름을 앞에 적으면 좁혀집니다." : found.total + "절을 찾았습니다.";
    return resultsHtml(found.hits, found.total, more);
  }

  function resultsHtml(hits, total, note) {
    if (!hits.length) return note ? '<div class="results"><p class="results-note">' + esc(note) + "</p></div>" : "";
    return '<div class="results"><p class="results-note">' + esc(note) + " 계시록 구절은 눌러서 읽고, 다른 구절은 눌러서 신앙일기에 둡니다.</p>" + hits.map((hit) => {
      const ref = { book: hit.book, chapter: hit.chapter, verse: hit.verse, end: null };
      const attrs = hit.book === B.REVELATION && map.has(hit.chapter + ":" + hit.verse)
        ? 'data-act="open-verse" data-id="' + hit.chapter + ":" + hit.verse + '"'
        : 'data-act="ref-to-journal" data-ref="' + esc(B.label(ref)) + '"';
      return '<button type="button" ' + attrs + "><b>" + esc(B.label(ref)) + "</b><span>" + esc(hit.text) + "</span></button>";
    }).join("") + "</div>";
  }

  function refreshSearch() {
    const box = document.getElementById("search-results");
    if (box) box.innerHTML = searchHtml(ui.query);
  }

  function practiceHtml() {
    const goal = todayGoal();
    const upcoming = nextNew(Math.max(0, 5 - day().newPassed.length));
    const due = dueVerses().length;
    const methods = [
      ["1", "순서대로 다섯 절", "앞 절 끝에 다음 절이 매달리도록, 책의 흐름을 따라 새깁니다."],
      ["2", "덩어리", "한 호흡에 담을 만큼만 잘라, 긴 문장을 부담 없이 붙잡습니다."],
      ["3", "빈칸", "가려진 말을 스스로 꺼내면 기억이 남습니다."],
      ["4", "백지 인출", "힌트 없이 적는 자리에서만 통과합니다."],
      ["5", "간격", "1일, 3일, 7일 뒤, 잊기 직전에 다시 만납니다."],
      ["6", "섞기", "다른 절과 섞어 물어 순서 단서에만 기대지 않게 합니다."],
      ["7", "장 전체와 지키기", "한 장을 다 외우면 전체 시험이 열리고, 외운 장은 등불이 흔들릴 때 다시 꺼냅니다."]
    ];
    return '<p class="eyebrow">오늘의 길</p><h1>다섯 절을 네 겹으로</h1><p class="lede">' + (due ? "밀린 복습 " + due + "절을 먼저 한 뒤, " : "") + (goal ? "새 절 " + (goal - Math.min(day().newPassed.length, goal)) + "절이 남아 있습니다." : "새 절은 모두 한 번씩 통과했습니다. 복습과 장 지키기로 불을 유지합니다.") + "</p>" +
      '<article class="card"><h3>오늘 만날 절</h3>' + (upcoming.length ? upcoming.map((verse) => '<p class="list-verse"><b>' + esc(refText(verse.id)) + "</b> " + esc(E.words(verse.text).slice(0, 8).join(" ")) + "…</p>").join("") : '<p class="muted">새로 열 절이 없습니다.</p>') +
      '<p><button class="btn gold" type="button" data-act="start-daily">' + (ui.session && ui.session.phase !== "done" ? "이어하기" : "시작") + "</button></p></article>" +
      '<article class="card" style="margin-top:16px"><h3>왜 이 순서인가요</h3><div class="methods">' + methods.map((item) => "<div><b>" + item[0] + "</b><p><strong>" + item[1] + "</strong><br><span class=\"muted\">" + item[2] + "</span></p></div>").join("") + "</div></article>";
  }

  function reviewHtml() {
    const due = dueVerses();
    const keepers = E.CHAPTER_META.filter((meta) => chapterProgress(meta.chapter).known >= 3);
    return '<p class="eyebrow">간격 복습</p><h1>잊기 전에 다시</h1><p class="lede">통과한 절은 1일, 3일, 7일 뒤에 다시 나옵니다. 맞으면 간격이 늘어나고, 흔들리면 오늘 안으로 돌아옵니다.</p>' +
      '<article class="card"><h3>오늘 복습 ' + due.length + '절</h3>' + (due.length ? '<button class="btn gold" type="button" data-act="review-due">복습 시작</button>' : '<p class="muted">오늘 밀린 복습은 없습니다.</p>') +
      due.slice(0, 12).map((verse) => {
        const card = state.cards[verse.id];
        return '<p class="list-verse"><b>' + esc(refText(verse.id)) + "</b> <span class=\"faint\">쉬움 " + card.ease.toFixed(2) + " · " + (card.due < today() ? "밀림" : "오늘") + "</span></p>";
      }).join("") + "</article>" +
      '<article class="card" style="margin-top:16px"><h3>외운 장 지키기</h3><p class="muted">이미 붙은 절만 골라, 약한 것부터 다섯 절을 다시 묻습니다.</p><div class="row"><button class="btn" type="button" data-act="spot" data-ch="all"' + (knownCount() ? "" : " disabled") + ">모든 외운 절 섞기</button>" +
      keepers.map((meta) => '<button class="btn small" type="button" data-act="spot" data-ch="' + meta.chapter + '">' + meta.chapter + "장</button>").join("") +
      "</div></article>";
  }

  function chaptersHtml() {
    let last = "";
    const cards = E.CHAPTER_META.map((meta) => {
      const prog = chapterProgress(meta.chapter);
      const rec = state.chapters[String(meta.chapter)] || {};
      const ready = prog.known === prog.total && prog.total > 0;
      const head = meta.group === last ? "" : '<h2 class="group-title">' + esc(meta.group) + "</h2>";
      last = meta.group;
      const sealText = rec.passed && rec.shaken ? "흔들림" : rec.passed ? "봉인" : prog.known ? "진행" : "장";
      const sealCls = rec.passed && rec.shaken ? "seal dim" : rec.passed ? "seal lit" : prog.known ? "seal half" : "seal";
      return head + '<article class="card ch"><div class="' + sealCls + '">' + sealText + "</div><p class=\"eyebrow\">" + meta.chapter + "장 · " + prog.total + "절</p><h3>" + esc(meta.title) + "</h3><p>" + esc(meta.scene) + '</p><div class="meter"><span style="--w:' + (prog.known / prog.total * 100) + '%"></span></div><p class="faint">' + prog.known + "/" + prog.total + (prog.due ? " · 복습 " + prog.due : "") + "</p><div class=\"row\">" +
        '<button class="btn small" type="button" data-act="read" data-ch="' + meta.chapter + '">읽기</button>' +
        '<button class="btn small" type="button" data-act="chapter-test" data-ch="' + meta.chapter + '"' + (ready ? "" : " disabled") + ' title="' + (ready ? "장 전체를 확인합니다" : "모든 절을 한 번씩 통과하면 열립니다") + '">장 시험</button>' +
        '<button class="btn small" type="button" data-act="spot" data-ch="' + meta.chapter + '"' + (prog.known >= 3 ? "" : " disabled") + ">지키기</button>" +
        '<button class="btn small" type="button" data-act="place" data-ch="' + meta.chapter + '">' + (rec.passed ? "다시 확인" : "이미 외움") + "</button></div></article>";
    }).join("");
    return '<p class="eyebrow">스물두 장</p><h1>봉인할 장</h1><p class="lede">순서대로 새기면 장 시험이 열립니다. 이미 외운 장은 확인을 통과하면 봉인되고, 사흘 뒤에 다시 복습으로 돌아옵니다.</p><div class="chapters">' + cards + "</div>";
  }

  function readHtml() {
    const chapter = ui.readChapter || 1;
    const meta = E.CHAPTER_META[chapter - 1];
    const verses = list.filter((verse) => verse.chapter === chapter);
    const jumps = E.CHAPTER_META.map((item) => '<button type="button" class="' + (item.chapter === chapter ? "on" : "") + '" data-act="read" data-ch="' + item.chapter + '">' + item.chapter + "</button>").join("");
    const body = verses.map((verse) => {
      const status = E.verseStatus(state.cards[verse.id], today());
      const card = state.cards[verse.id];
      return '<div class="verse ' + (verse.id === ui.highlight ? "focus" : "") + " " + (status.key === "firm" || status.key === "review" ? "known" : "") + '" id="v-' + verse.chapter + "-" + verse.verse + '"><sup>' + verse.verse + '</sup><div><p>' + esc(verse.text) + "</p><p class=\"faint\">" + esc(status.label) + (card && card.stage >= 3 ? " · 다음 " + prettyDate(card.due) : "") + (E.MARKS[verse.id] ? " · " + esc(E.MARKS[verse.id]) : "") + "</p></div></div>";
    }).join("");
    return '<p class="eyebrow">개역한글</p><h1>' + chapter + "장 · " + esc(meta.title) + "</h1><p class=\"lede\">" + esc(meta.scene) + '</p><div class="ch-jumps">' + jumps + '</div><article class="card reader">' + body + "</article>";
  }

  function journalHtml() {
    const posts = state.journal.length ? state.journal.map((entry) => {
      if (entry.id === ui.editing && ui.editDraft) return editPostHtml(entry);
      const verse = entryVerse(entry);
      return '<article class="card post" data-mood="' + esc(entry.mood) + '"><header><div class="avatar">' + esc(state.name.slice(0, 1)) + '</div><div><strong>' + esc(state.name) + "</strong><span>" + esc(formatWhen(entry.at)) + (entry.editedAt ? " · 고침" : "") + '</span></div><em>' + esc(entry.mood) + '</em></header><p class="body">' + esc(entry.text) + "</p>" +
        (verse ? '<div class="quote"><b>' + esc(verse.label) + "</b>" + esc(verse.text) + "</div>" : "") +
        '<footer><button class="amen ' + (entry.amened ? "on" : "") + '" type="button" data-act="amen" data-id="' + esc(entry.id) + '">아멘' + (entry.amened ? " · 남김" : "") + '</button><span class="row"><button class="btn ghost small" type="button" data-act="edit-journal" data-id="' + esc(entry.id) + '">고치기</button><button class="btn ghost small" type="button" data-act="delete-journal" data-id="' + esc(entry.id) + '">지우기</button></span></footer></article>';
    }).join("") : '<article class="card"><p class="muted">아직 쌓인 기록이 없습니다. 오늘 마음에 남은 한 줄이면 충분합니다.</p></article>';
    return '<div class="feed"><p class="eyebrow">신앙일기</p><h1>쌓이는 기록</h1><form class="card composer" data-act="journal"><textarea id="journal-text" name="text" maxlength="1000" placeholder="오늘 마음에 남은 것을 적어 보세요">' + esc(ui.draft || "") + '</textarea><input class="textin" id="journal-ref" name="ref" data-preview="ref-preview" placeholder="함께 둔 구절, 예: 요 3:16, 시 23:1-3, 계 21:4" value="' + esc(ui.draftRef || "") + '" autocomplete="off"><p id="ref-preview" class="faint"></p><div class="moods">' +
      MOODS.map((mood) => '<button type="button" data-act="mood" data-mood="' + mood + '" class="' + (ui.mood === mood ? "on" : "") + '">' + mood + "</button>").join("") +
      '</div>' + (ui.journalError ? '<p class="error">' + esc(ui.journalError) + "</p>" : "") + '<button class="btn gold" type="submit">남기기</button></form>' + posts + "</div>";
  }

  function editPostHtml(entry) {
    const draft = ui.editDraft;
    return '<form class="card composer post" data-act="journal" data-id="' + esc(entry.id) + '" data-mood="' + esc(draft.mood) + '"><p class="eyebrow">' + esc(formatWhen(entry.at)) + ' 기록 고치기</p><textarea id="edit-text" name="text" maxlength="1000">' + esc(draft.text) + '</textarea><input class="textin" id="edit-ref" name="ref" data-preview="edit-ref-preview" placeholder="함께 둔 구절, 예: 요 3:16" value="' + esc(draft.ref) + '" autocomplete="off"><p id="edit-ref-preview" class="faint"></p><div class="moods">' +
      MOODS.map((mood) => '<button type="button" data-act="edit-mood" data-mood="' + mood + '" class="' + (draft.mood === mood ? "on" : "") + '">' + mood + "</button>").join("") +
      "</div>" + (ui.editError ? '<p class="error">' + esc(ui.editError) + "</p>" : "") + '<div class="row"><button class="btn gold" type="submit">고친 내용 저장</button><button class="btn ghost" type="button" data-act="edit-cancel">그만두기</button></div></form>';
  }

  function statsHtml() {
    const keys = rangeKeys(ui.range);
    const prayerDays = keys.map((key) => {
      const prayer = state.days[key]?.prayer || {};
      return { key, morning: !!prayer.morning, noon: !!prayer.noon, evening: !!prayer.evening };
    });
    const all = daysSinceStart();
    let got = 0;
    all.forEach((key) => {
      const prayer = state.days[key]?.prayer || {};
      got += (prayer.morning ? 1 : 0) + (prayer.noon ? 1 : 0) + (prayer.evening ? 1 : 0);
    });
    const possible = all.length * 3;
    const mastery = keys.map((key) => ({
      key,
      v: Object.keys(state.cards).filter((id) => {
        const card = state.cards[id];
        return card.masteredOn && card.masteredOn <= key && card.stage >= 3;
      }).length
    }));
    const accuracy = keys.map((key) => {
      const log = state.days[key];
      return { key, v: log && log.possible ? log.points / log.possible : null };
    });
    const usage = keys.map((key) => ({ key, v: ((state.days[key]?.seconds) || 0) / 60, label: key }));
    const info = E.levelInfo(state.xp);
    const totalSeconds = Object.values(state.days).reduce((sum, log) => sum + (log.seconds || 0), 0);
    return '<div class="stats-head"><div><p class="eyebrow">쌓인 만큼</p><h1>기록</h1></div><div class="range"><button type="button" class="btn small ' + (ui.range === 14 ? "on" : "") + '" data-act="range" data-n="14">14일</button><button type="button" class="btn small ' + (ui.range === 30 ? "on" : "") + '" data-act="range" data-n="30">30일</button></div></div>' +
      '<section class="tiles"><article class="card tile"><span>연속</span><strong>' + activeStreak() + '일</strong><em class="faint">가장 길게 ' + longestStreak() + '일</em></article><article class="card tile"><span>외운 절</span><strong>' + knownCount() + '</strong><em class="faint">/ ' + list.length + '</em></article><article class="card tile"><span>전체 기도</span><strong>' + Math.round((possible ? got / possible : 0) * 100) + '%</strong><em class="faint">' + got + "/" + possible + '</em></article><article class="card tile"><span>머문 시간</span><strong>' + formatMinutes(totalSeconds) + '</strong><em class="faint">Lv.' + info.level + " " + esc(info.title) + "</em></article></section>" +
      '<article class="card" style="margin-bottom:16px"><div class="stats-head"><h3>기도</h3>' + donut(possible ? got / possible : 0, "누적") + '</div><p class="muted">오전 · 한낮 · 저녁. 채운 자리는 올라오고, 빈 자리는 낮게 남습니다.</p>' + prayerChart(prayerDays) + '<p class="legend"><span><i style="background:#f0c14b"></i>오전</span><span><i style="background:#ef8b6a"></i>정오</span><span><i style="background:#6d5cff"></i>저녁</span></p><p class="faint">세 번을 채운 연속 ' + prayerStreak() + "일</p></article>" +
      '<article class="card" style="margin-bottom:16px"><h3>외운 절 누적</h3>' + lineChart(mastery) + "</article>" +
      '<article class="card" style="margin-bottom:16px"><h3>맞힌 비율</h3>' + lineChart(accuracy, true) + '<p class="faint">그 날 확인한 문제가 있을 때만 점이 생깁니다.</p></article>' +
      '<article class="card" style="margin-bottom:16px"><h3>머문 시간</h3>' + barChart(usage.map((item) => ({ v: item.v, tick: Number(item.key.slice(8)), label: item.key + " " + Math.round(item.v) + "분" }))) + "</article>" +
      '<article class="card" style="margin-bottom:16px"><h3>사용한 날</h3><div class="heat">' + heatHtml() + '</div><p class="faint">색이 진할수록 그 날의 점수, 곧 암송하고 기도하고 기록한 양이 큽니다.</p></article>' +
      '<article class="card" style="margin-bottom:16px"><h3>읽는 목소리</h3><p class="faint" id="voice-note">' + esc(voiceNote()) + '</p><div class="row"><select class="voice" data-act="voice">' + voiceOptionsHtml() + '</select><button class="btn" type="button" data-act="voice-sample">들어 보기</button></div></article>' +
      '<article class="card" style="margin-bottom:16px"><h3>말로 입력 정확도</h3><p class="faint">Chrome·Edge에서는 브라우저의 음성인식을 먼저 씁니다. 그것을 쓸 수 없을 때 이 기기 안의 음성 모델이 받아 적습니다.</p><div class="row">' +
      [["base", "빠르게 · 기본", "처음 한 번 약 73MB"], ["small", "정확도 우선", "처음 한 번 약 238MB · 받아 적기 2~3배 느림"]].map(([key, name, info]) => '<button class="btn ' + ((state.earModel || "base") === key ? "gold" : "ghost") + '" type="button" data-act="ear-model" data-model="' + key + '" aria-pressed="' + ((state.earModel || "base") === key) + '">' + name + '<br><small class="faint">' + info + "</small></button>").join("") + "</div></article>" +
      '<article class="card" style="margin-bottom:16px"><h3>기록 옮기기</h3><p class="faint">기록은 이 브라우저에만 저장됩니다. 다른 주소나 기기로 옮길 때 파일로 내보낸 뒤 그곳에서 가져오세요.</p><div class="row"><button class="btn" type="button" data-act="export">기록 내보내기</button><label class="btn ghost">기록 가져오기<input type="file" accept="application/json,.json" data-act="import" hidden></label></div></article>' +
      '<article class="card"><h3>이름</h3><form data-act="rename" class="row"><input class="textin" name="name" value="' + esc(state.name) + '" maxlength="16"><button class="btn" type="submit">바꾸기</button></form>' +
      '<form data-act="reset" style="margin-top:18px"><p class="faint">기록을 모두 지우려면 초기화라고 적고 버튼을 누르세요.</p><div class="row"><input class="textin" name="word" placeholder="초기화"><button class="btn" type="submit">기록 지우기</button></div></form></article>';
  }

  function donut(rate) {
    const safe = Math.max(0, Math.min(1, rate || 0));
    return '<div class="donut"><svg viewBox="0 0 120 120"><circle class="ring-bg" cx="60" cy="60" r="46"></circle><circle class="ring" cx="60" cy="60" r="46" style="--p:' + safe + '"></circle></svg><strong>' + Math.round(safe * 100) + '%</strong></div>';
  }

  function prayerChart(days) {
    return '<div class="bars">' + days.map((item, index) => {
      const cells = ["morning", "noon", "evening"].map((slot) => '<i class="' + (item[slot] ? "on" : "") + '" style="--h:' + (item[slot] ? "100%" : "8%") + ';--i:' + index + '"></i>').join("");
      const tick = index % 2 === 0 ? String(Number(item.key.slice(8))) : "";
      return '<div class="bar" title="' + item.key + '"><span class="cluster">' + cells + "</span><em>" + tick + "</em></div>";
    }).join("") + "</div>";
  }

  function barChart(rows) {
    const max = Math.max(1, ...rows.map((row) => row.v || 0));
    return '<div class="bars">' + rows.map((row, index) => {
      const height = Math.max(2, Math.round(((row.v || 0) / max) * 100));
      return '<div class="bar" title="' + esc(row.label || "") + '"><span class="grow" style="--h:' + height + '%;--i:' + index + ';background:#6d5cff"></span><em>' + esc(row.tick || "") + "</em></div>";
    }).join("") + "</div>";
  }

  function lineChart(points) {
    const values = points.map((point) => point.v).filter((value) => value != null);
    if (!values.length) return '<p class="empty muted">기록이 쌓이면 선이 이어집니다.</p>';
    const max = Math.max(1, ...values);
    const w = 640;
    const h = 200;
    const step = points.length > 1 ? (w - 24) / (points.length - 1) : 0;
    const coords = [];
    points.forEach((point, index) => {
      if (point.v == null) return;
      coords.push([12 + index * step, h - 24 - (point.v / max) * (h - 48)]);
    });
    if (coords.length === 1) {
      return '<svg viewBox="0 0 ' + w + " " + h + '" class="chart"><circle cx="' + coords[0][0] + '" cy="' + coords[0][1] + '" r="5" fill="#6d5cff"></circle></svg>';
    }
    let d = "";
    coords.forEach((coord, index) => { d += (index ? "L" : "M") + coord[0].toFixed(1) + " " + coord[1].toFixed(1) + " "; });
    let len = 0;
    for (let i = 1; i < coords.length; i++) len += Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1]);
    const area = d + "L" + coords[coords.length - 1][0].toFixed(1) + " " + (h - 24) + " L" + coords[0][0].toFixed(1) + " " + (h - 24) + " Z";
    return '<svg viewBox="0 0 ' + w + " " + h + '" class="chart" role="img"><path class="chart-area" d="' + area + '"></path><path class="chart-line" d="' + d + '" style="--len:' + Math.max(1, len).toFixed(1) + '"></path></svg>';
  }

  function heatHtml() {
    const total = 16 * 7;
    const start = E.addDays(today(), -(total - 1));
    let html = "";
    for (let i = 0; i < total; i++) {
      const key = E.addDays(start, i);
      const xp = state.days[key]?.xp || 0;
      const level = xp === 0 ? 0 : xp < 15 ? 1 : xp < 40 ? 2 : xp < 80 ? 3 : 4;
      html += '<i class="lv' + level + '" title="' + key + " · " + xp + '점"></i>';
    }
    return html;
  }

  function sessionHtml() {
    const session = ui.session;
    if (!session) return homeHtml();
    if (session.phase === "done") return doneHtml();
    if (session.feedback && (session.phase === "exam" || session.phase === "recall")) return shell(session, feedbackBlock(session.feedback));
    if (session.phase === "read") return shell(session, readStep());
    if (session.phase === "chunk") return shell(session, chunkStep());
    if (session.phase === "cloze") return shell(session, clozeStep());
    if (session.phase === "recall") return shell(session, recallStep());
    if (session.phase === "exam") return shell(session, examStep());
    return shell(session, "<p>이어갈 단계가 없습니다.</p>");
  }

  function sessionMeta() {
    const session = ui.session;
    if (session.phase === "read" || session.phase === "chunk" || session.phase === "cloze" || session.phase === "recall") {
      const frac = { read: 0.2, chunk: 0.45, cloze: 0.7, recall: 0.9 }[session.phase] || 0;
      const base = session.learnIds.length ? (session.learnCursor + frac) / session.learnIds.length : 0;
      return { label: "새 절 " + (session.learnCursor + 1) + " / " + session.learnIds.length, pct: 20 + base * 60, help: PHASE_HELP[session.phase] };
    }
    if (session.kind === "chapter" || session.kind === "placement") {
      const pct = session.queue.length ? (session.cursor / session.queue.length) * 100 : 0;
      return { label: session.chapter + "장 " + (session.kind === "placement" ? "이미 외운 확인" : "전체 시험") + " " + Math.min(session.cursor + 1, session.queue.length) + "/" + session.queue.length, pct, help: PHASE_HELP.chapter };
    }
    if (session.kind === "spot" || session.kind === "review" || session.block === "review") {
      const pct = session.queue.length ? (session.cursor / session.queue.length) * 100 : 0;
      const help = session.kind === "spot" ? PHASE_HELP.spot : PHASE_HELP.review;
      const label = (session.kind === "spot" ? "지키기 " : "복습 ") + Math.min(session.cursor + 1, session.queue.length) + "/" + session.queue.length;
      return { label, pct, help };
    }
    const pct = session.queue.length ? 80 + (session.cursor / session.queue.length) * 20 : 80;
    return { label: "확인 " + Math.min(session.cursor + 1, Math.max(session.queue.length, 1)) + "/" + Math.max(session.queue.length, 1), pct, help: PHASE_HELP.exam };
  }

  function shell(session, body) {
    const meta = sessionMeta();
    return '<div class="panel"><div class="progress-label"><span>' + esc(meta.label) + '</span><span id="study-time">' + formatMinutes(day().seconds) + '</span></div><div class="meter"><span style="--w:' + meta.pct + '%"></span></div><article class="card">' + body + '<p class="help">' + esc(meta.help) + "</p></article></div>";
  }

  function readStep() {
    const verse = map.get(ui.session.step.id);
    const chunks = E.chunksOf(verse.text);
    const meta = E.CHAPTER_META[verse.chapter - 1];
    const tail = tailOf(verse.id);
    const nextLabel = chunks.length < 2 ? "빈칸 메우기" : "덩어리로 나누기";
    return '<p class="eyebrow">' + esc(meta.title) + (E.MARKS[verse.id] ? " · " + esc(E.MARKS[verse.id]) : "") + "</p><h2>" + esc(refText(verse.id)) + '</h2><div class="paper"><p class="scripture">' +
      chunks.map((chunk, index) => '<span class="chunk" style="--i:' + index + '">' + esc(chunk) + "</span>").join(" ") +
      "</p></div>" + (tail ? '<p class="faint">앞 절의 끝 · ' + esc(tail) + "</p>" : "") +
      '<div class="row"><select class="voice" data-act="voice" aria-label="읽는 목소리">' + voiceOptionsHtml() + '</select><button class="btn" type="button" data-act="speak">들어 보기</button><button class="btn gold" type="button" data-act="after-read">' + nextLabel + '</button><button class="btn ghost" type="button" data-act="skip">이 절은 나중에</button></div>';
  }

  function chunkStep() {
    const step = ui.session.step;
    const picked = step.picked.map((index, pos) => '<button type="button" class="pill" data-act="unchunk" data-pos="' + pos + '">' + esc(step.chunks[index]) + "</button>").join("");
    const bank = step.bank.map((index) => step.picked.includes(index) ? "" : '<button type="button" class="pill" data-act="chunk" data-i="' + index + '">' + esc(step.chunks[index]) + "</button>").join("");
    return "<h2>" + esc(refText(step.id)) + '</h2><p class="help">아래 조각을 위쪽 줄에 본문 순서대로 놓아 보세요. 놓은 조각을 누르면 빠집니다.</p><div class="answer-row">' +
      (picked || '<span class="faint">여기로 옮깁니다</span>') + '</div><div class="bank ' + (step.shake ? "shake" : "") + '">' + bank + "</div>" +
      (step.hinted ? '<p class="help">첫 덩어리를 깔아 두었습니다.</p>' : "") +
      (step.done ? '<p class="help">순서가 맞습니다.</p>' : "") +
      '<button class="btn ghost" type="button" data-act="skip">이 절은 나중에</button>';
  }

  function clozeStep() {
    const step = ui.session.step;
    const verseWords = E.words(map.get(step.id).text);
    const used = new Set(Object.values(step.filled));
    const line = verseWords.map((word, index) => {
      if (!step.blanks.includes(index)) return "<span>" + esc(word) + "</span>";
      const token = step.filled[index] ? step.bank.find((item) => item.uid === step.filled[index]) : null;
      const bad = step.wrong && step.wrong.includes(index);
      return '<button type="button" class="blank ' + (bad ? "bad" : "") + '" data-act="unfill" data-i="' + index + '">' + (token ? esc(token.word) : "　　") + "</button>";
    }).join(" ");
    const bank = step.bank.filter((token) => !used.has(token.uid)).map((token) => '<button type="button" class="pill" data-act="fill" data-uid="' + esc(token.uid) + '">' + esc(token.word) + "</button>").join("");
    return "<h2>" + esc(refText(step.id)) + '</h2><div class="paper"><p class="scripture">' + line + '</p></div><div class="bank ' + (step.shake ? "shake" : "") + '">' + bank + "</div>" +
      (step.misses ? '<p class="help">다른 말이 들어간 칸은 비워 두었습니다.</p>' : "") +
      '<button class="btn ghost" type="button" data-act="skip">이 절은 나중에</button>';
  }

  function recallStep() {
    const step = ui.session.step;
    const verse = map.get(step.id);
    const tail = tailOf(step.id);
    return "<h2>" + esc(refText(step.id)) + "</h2>" + (tail ? '<p class="faint">앞 절의 끝 · ' + esc(tail) + "</p>" : "") +
      (step.showSkeleton ? '<p class="skel">' + esc(E.skeleton(verse.text)) + "</p>" : "") +
      '<form data-act="recall"><textarea name="text" rows="5" autocomplete="off" spellcheck="false" placeholder="힌트 없이, 개역한글 그대로 적어 보세요"' + (step.draftSpoken ? ' data-spoken="1"' : "") + ">" + esc(step.draft || "") + '</textarea><p class="faint">' + esc(dictateHint()) + '</p><p>' + dictateButton() + '<button class="btn gold" type="submit">확인해 보기</button> <button class="btn ghost" type="button" data-act="skip">이 절은 나중에</button></p></form>';
  }

  function examStep() {
    const question = currentQuestion();
    if (!question) return '<p>문제가 없습니다.</p><button class="btn" type="button" data-act="nav" data-page="home">돌아가기</button>';
    ensureOrder();
    if (question.kind === "full") {
      return "<h2>" + esc(refText(question.id)) + '</h2><p class="help">개역한글 표기 그대로 적어 보세요. 말로 넣은 표기는 이 절에 맞게 고칩니다. ' + esc(dictateHint()) + '</p><form data-act="answer-full"><textarea name="text" rows="5" autocomplete="off" spellcheck="false" placeholder="본문을 적어 보세요"' + (question.draftSpoken ? ' data-spoken="1"' : "") + ">" + esc(question.draft || "") + '</textarea><p>' + dictateButton() + '<button class="btn gold" type="submit">확인해 보기</button></p></form>';
    }
    if (question.kind === "opening") {
      const prev = map.get(question.from);
      return '<p class="help">앞 절입니다. 다음 절의 처음 여섯 단어를 적어 보세요.</p><div class="paper"><p>' + esc(prev.text) + '</p></div><form data-act="answer-opening"><textarea name="text" rows="3" autocomplete="off" spellcheck="false" placeholder="다음 절의 시작"' + (question.draftSpoken ? ' data-spoken="1"' : "") + ">" + esc(question.draft || "") + '</textarea><p>' + dictateButton() + '<button class="btn gold" type="submit">확인해 보기</button></p></form>';
    }
    if (question.kind === "blanks") {
      const verseWords = E.words(map.get(question.id).text);
      const line = verseWords.map((word, index) => question.blanks.includes(index)
        ? '<input class="blank-input" name="b' + index + '" autocomplete="off" spellcheck="false" aria-label="빈칸" value="' + esc((question.draftBlanks && question.draftBlanks[index]) || "") + '"' + (question.draftSpoken ? ' data-spoken="1"' : "") + ">"
        : "<span>" + esc(word) + "</span>").join(" ");
      return "<h2>" + esc(refText(question.id)) + '</h2><form data-act="blanks"><div class="paper"><p class="scripture">' + line + '</p></div><p>' + dictateButton() + '<button class="btn gold" type="submit">확인해 보기</button></p></form>';
    }
    if (question.kind === "locate") {
      const verse = map.get(question.id);
      return '<p class="help">이 본문의 위치는 어디인가요?</p><div class="paper"><p class="scripture">' + esc(verse.text) + '</p></div><div class="choices">' +
        question.choices.map((id) => '<button type="button" data-act="locate" data-choice="' + id + '">' + esc(refText(id)) + "</button>").join("") + "</div>";
    }
    const picked = ui.session.orderPicked;
    const remain = question.items.filter((item) => !picked.includes(item.id));
    const answer = picked.map((id, pos) => {
      const item = question.items.find((entry) => entry.id === id);
      return '<button type="button" class="pill" data-act="unorder" data-pos="' + pos + '">' + esc(item.phrase) + "</button>";
    }).join("");
    const bank = remain.map((item) => '<button type="button" class="pill" data-act="take-order" data-id="' + item.id + '">' + esc(item.phrase) + "</button>").join("");
    return '<h2>순서</h2><p class="help">처음 몇 단어를 보고, 장에 나오는 순서대로 놓아 보세요.</p><form data-act="order"><div class="answer-row">' + (answer || '<span class="faint">여기로 옮깁니다</span>') + '</div><div class="bank">' + bank + '</div><button class="btn gold" type="submit"' + (picked.length === question.items.length ? "" : " disabled") + ">이 순서로 확인</button></form>";
  }

  function ensureOrder() {
    const question = currentQuestion();
    const session = ui.session;
    if (!question || question.kind !== "order") return;
    if (session.orderFor !== question.qid) {
      session.orderFor = question.qid;
      session.orderPicked = [];
    }
  }

  function feedbackBlock(fb) {
    let detail = "";
    if (fb.kind === "recall" || fb.kind === "full" || fb.kind === "opening") {
      const answer = fb.kind === "opening" ? (fb.target || E.words(map.get(fb.id).text).slice(0, fb.n).join(" ")) : map.get(fb.id).text;
      detail = '<p class="diff">' + diffHtml(fb.input, answer, fb.spoken) + '</p><p class="faint">본문</p><p>' + esc(map.get(fb.id).text) + "</p>";
    } else if (fb.kind === "blanks") {
      const verseWords = E.words(map.get(fb.id).text);
      detail = "<p>" + fb.blanks.map((index) => {
        const mine = fb.given ? fb.given[index] : "";
        const ok = fb.spoken ? E.spokenSimilarity(mine, verseWords[index]) >= 0.9 : E.normalize(mine) === E.normalize(verseWords[index]);
        return '<span class="' + (ok ? "" : "miss") + '">' + esc(verseWords[index]) + "</span>";
      }).join(" · ") + "</p><p>" + esc(map.get(fb.id).text) + "</p>";
    } else if (fb.kind === "locate") {
      detail = "<p>위치는 " + esc(refText(fb.id)) + "입니다.</p><p>" + esc(map.get(fb.id).text) + "</p>";
    } else if (fb.kind === "order") {
      detail = "<ol>" + fb.items.map((item) => "<li>" + esc(item.phrase) + "</li>").join("") + "</ol>";
    }
    const label = fb.phaseRecall && !fb.pass ? "다시 적기" : "다음";
    return '<section class="feedback ' + (fb.pass ? "good" : "bad") + '"><h3>' + (fb.pass ? "맞았습니다" : "아직 본문과 다릅니다") + " · " + Math.round(fb.score * 100) + "%</h3>" + detail +
      '<p><button class="btn gold" type="button" data-act="next-feedback">' + label + "</button></p></section>";
  }

  function doneHtml() {
    const session = ui.session;
    const summary = session.summary || {};
    const gained = state.xp - session.xpStart;
    if (summary.kind === "daily") {
      const met = summary.goal > 0 && summary.done >= summary.goal;
      const learned = day().newPassed.map((id) => "<p class=\"list-verse\">" + esc(refText(id)) + "</p>").join("");
      const missed = (summary.missed || []).map((id) => "<p class=\"list-verse\">" + esc(refText(id)) + " · 다시 확인</p>").join("");
      return '<div class="panel"><article class="card"><div class="stamp ' + (met ? "in" : "off") + '">' + (met ? "오늘" : "기록") + "</div><h1>" + (met ? "오늘 몫을 채웠습니다" : "오늘 자리를 마쳤습니다") + "</h1><p class=\"lede\">이번 자리에 " + gained + "점이 쌓였습니다." + (summary.bonus ? " 하루 목표를 채워 40점을 더했습니다." : "") + (summary.lamps ? " 등잔이 하나 더 켜졌습니다." : "") + "</p>" +
        (session.lastExam ? "<p>확인 시험 " + session.lastExam.passed + "/" + session.lastExam.of + "절 · " + Math.round(session.lastExam.avg * 100) + "%</p>" : "") +
        learned + missed + '<div class="row"><button class="btn gold" type="button" data-act="nav" data-page="home">오늘 화면</button><button class="btn" type="button" data-act="nav" data-page="journal">한 줄 남기기</button></div></article></div>';
    }
    const pass = !!summary.pass;
    const title = session.kind === "chapter" || session.kind === "placement"
      ? (pass ? session.chapter + "장을 봉인했습니다" : session.chapter + "장은 아직 흔들립니다")
      : (pass ? "지켰습니다" : "다시 붙잡을 절이 있습니다");
    const weak = (summary.weak || []).map((id) => "<p class=\"list-verse\">" + esc(refText(id)) + "</p>").join("");
    return '<div class="panel"><article class="card"><div class="stamp ' + (pass ? "in" : "off") + '">' + (pass ? "봉인" : "다시") + "</div><h1>" + esc(title) + "</h1><p class=\"lede\">점수 " + Math.round((summary.avg || 0) * 100) + "% · 이번 자리 " + gained + "점</p>" + weak +
      '<div class="row"><button class="btn gold" type="button" data-act="nav" data-page="chapters">장으로</button><button class="btn" type="button" data-act="nav" data-page="home">오늘 화면</button></div></article></div>';
  }

  function modalHtml() {
    if (!ui.confirm) return "";
    return '<div class="modal-back"><div class="modal"><p>' + esc(ui.confirm.message) + '</p><div class="row"><button class="btn gold" type="button" data-act="confirm-yes">계속</button><button class="btn" type="button" data-act="confirm-no">돌아가기</button></div></div></div>';
  }

  function render() {
    rememberAnswerDraft();
    stopHearing();
    if (!ui.skipCapture) captureDrafts();
    ui.skipCapture = false;
    if (state.name) ensurePick();
    const root = document.getElementById("app");
    let body;
    if (!state.name) body = welcomeHtml();
    else if (ui.page === "session") body = sessionHtml();
    else if (ui.page === "practice") body = practiceHtml();
    else if (ui.page === "review") body = reviewHtml();
    else if (ui.page === "chapters") body = chaptersHtml();
    else if (ui.page === "read") body = readHtml();
    else if (ui.page === "journal") body = journalHtml();
    else if (ui.page === "stats") body = statsHtml();
    else body = homeHtml();
    root.innerHTML = (state.name ? navHtml() : "") + "<main>" + body + "</main>" + modalHtml();
    document.title = "일곱등잔 · 계시록 암송";
    persist();
    const clock = document.getElementById("clock");
    if (clock) clock.textContent = formatClock();
    if (ui.page === "read" && ui.highlight) {
      const el = document.getElementById("v-" + ui.highlight.replace(":", "-"));
      if (el) el.scrollIntoView({ block: "center" });
    }
    paintRefPreview(document.getElementById("journal-ref"));
    paintRefPreview(document.getElementById("edit-ref"));
    if (ui.session && ui.session.step) ui.session.step.shake = false;
  }

  function onClick(event) {
    const el = event.target.closest("[data-act]");
    if (!el) return;
    if (el.closest("form") && el.type === "submit") return;
    const act = el.dataset.act;
    if (act === "nav") return go(el.dataset.page);
    if (act === "start-daily") return startDaily();
    if (act === "pray") return togglePrayer(el.dataset.slot);
    if (act === "pray-jump") {
      ui.page = "home";
      render();
      return;
    }
    if (act === "open-pick") {
      const id = state.pick && state.pick.id;
      const card = id ? state.cards[id] : null;
      if (card && card.stage >= 3) return startReview([id]);
      return startDaily();
    }
    if (act === "open-verse") return openVerse(el.dataset.id);
    if (act === "read") {
      ui.readChapter = Number(el.dataset.ch);
      ui.highlight = "";
      ui.page = "read";
      render();
      return;
    }
    if (act === "review-due") return startReview(dueVerses().map((verse) => verse.id));
    if (act === "spot") return startSpot(el.dataset.ch);
    if (act === "chapter-test") return startChapter(el.dataset.ch, "chapter");
    if (act === "place") return startChapter(el.dataset.ch, "placement");
    if (act === "dictate") {
      const form = el.closest("form");
      if (!form) return;
      if (transcribing) return;
      if (dict) return finishHearing();
      return startHearing(form);
    }
    if (act === "speak") return speak(map.get(ui.session.step.id).text);
    if (act === "export") return exportState();
    if (act === "ear-model") {
      state.earModel = el.dataset.model === "small" ? "small" : "base";
      render();
      return;
    }
    if (act === "voice-sample") return speak("주 하나님이 가라사대 나는 알파와 오메가라");
    if (act === "after-read") { afterRead(); render(); return; }
    if (act === "chunk") return tapChunk(Number(el.dataset.i));
    if (act === "unchunk") {
      ui.session.step.picked = ui.session.step.picked.slice(0, Number(el.dataset.pos));
      ui.session.step.done = false;
      clearTimerFn();
      render();
      return;
    }
    if (act === "fill") return fillCloze(el.dataset.uid);
    if (act === "unfill") {
      delete ui.session.step.filled[el.dataset.i];
      render();
      return;
    }
    if (act === "skip") return skipVerse();
    if (act === "locate") return acceptAnswer({ choice: el.dataset.choice });
    if (act === "take-order") {
      ensureOrder();
      if (!ui.session.orderPicked.includes(el.dataset.id)) ui.session.orderPicked.push(el.dataset.id);
      render();
      return;
    }
    if (act === "unorder") {
      ui.session.orderPicked.splice(Number(el.dataset.pos), 1);
      render();
      return;
    }
    if (act === "next-feedback") return continueFeedback();
    if (act === "mood") { ui.mood = el.dataset.mood; render(); return; }
    if (act === "amen") {
      const item = state.journal.find((entry) => entry.id === el.dataset.id);
      if (!item) return;
      item.amened = !item.amened;
      render();
      return;
    }
    if (act === "edit-journal") {
      const item = state.journal.find((entry) => entry.id === el.dataset.id);
      if (!item) return;
      ui.editing = item.id;
      ui.editDraft = { text: item.text, ref: entryRefInput(item), mood: item.mood };
      ui.editError = "";
      render();
      const field = document.getElementById("edit-text");
      if (field) field.focus();
      return;
    }
    if (act === "edit-mood") {
      if (ui.editDraft) ui.editDraft.mood = el.dataset.mood;
      render();
      return;
    }
    if (act === "edit-cancel") {
      ui.editing = "";
      ui.editDraft = null;
      ui.editError = "";
      render();
      return;
    }
    if (act === "ref-to-journal") {
      ui.draftRef = el.dataset.ref;
      ui.journalError = "";
      ui.page = "journal";
      render();
      window.scrollTo(0, 0);
      const field = document.getElementById("journal-text");
      if (field) field.focus();
      return;
    }
    if (act === "delete-journal") {
      ui.confirm = { message: "이 기록을 지울까요?", act: "delete-journal", arg: el.dataset.id };
      render();
      return;
    }
    if (act === "range") { ui.range = Number(el.dataset.n); render(); return; }
    if (act === "confirm-no") { ui.confirm = null; render(); return; }
    if (act === "confirm-yes") {
      const confirm = ui.confirm;
      ui.confirm = null;
      if (confirm && confirm.act === "delete-journal") removeJournal(confirm.arg);
      else if (confirm && confirm.act === "reset-go") resetAll();
      else if (confirm && confirm.act === "import-go") applyImport();
      else render();
    }
  }

  function onSubmit(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.dataset.act) return;
    event.preventDefault();
    stopHearing();
    const act = form.dataset.act;
    if (act === "welcome" || act === "rename") return setName(form.elements.name.value);
    if (act === "recall") return submitRecall(form.elements.text.value, form.elements.text.dataset.spoken === "1");
    if (act === "answer-full" || act === "answer-opening") return acceptAnswer({ text: form.elements.text.value, spoken: form.elements.text.dataset.spoken === "1" });
    if (act === "blanks") {
      const blanks = {};
      let spoken = false;
      currentQuestion().blanks.forEach((index) => {
        const input = form.elements["b" + index];
        blanks[index] = input.value;
        if (input.dataset.spoken === "1") spoken = true;
      });
      return acceptAnswer({ blanks, spoken });
    }
    if (act === "order") return acceptAnswer({ order: ui.session.orderPicked.slice() });
    if (act === "journal") return submitJournal(form);
    if (act === "reset") {
      if (String(form.elements.word.value || "").trim() !== "초기화") {
        ui.confirm = { message: "기록을 지우려면 입력칸에 초기화라고 정확히 적어 주세요.", act: "noop" };
        render();
        return;
      }
      ui.confirm = { message: "암송 기록, 기도, 일기가 이 브라우저에서 지워집니다.", act: "reset-go" };
      render();
    }
  }

  function onInput(event) {
    if (event.target.id === "q") {
      ui.query = event.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(refreshSearch, 120);
    }
    if (event.target.id === "journal-ref") ui.draftRef = event.target.value;
    if (event.target.id === "journal-ref" || event.target.id === "edit-ref") paintRefPreview(event.target);
    if (event.target.id === "journal-text") ui.draft = event.target.value;
    if (ui.editDraft && event.target.id === "edit-text") ui.editDraft.text = event.target.value;
    if (ui.editDraft && event.target.id === "edit-ref") ui.editDraft.ref = event.target.value;
  }

  function onVoiceChange(event) {
    const el = event.target;
    if (el instanceof HTMLInputElement && el.dataset.act === "import") {
      if (el.files && el.files[0]) importState(el.files[0]);
      el.value = "";
      return;
    }
    if (!(el instanceof HTMLSelectElement) || el.dataset.act !== "voice") return;
    state.voiceURI = el.value;
    el.dataset.sig = el.innerHTML;
    persist();
    const reading = ui.session && ui.session.phase === "read" && ui.session.step;
    speak(reading ? map.get(ui.session.step.id).text : "주 하나님이 가라사대 나는 알파와 오메가라");
  }

  document.addEventListener("click", onClick);
  document.addEventListener("submit", onSubmit);
  document.addEventListener("input", onInput);
  document.addEventListener("change", onVoiceChange);
  if (window.speechSynthesis) {
    window.speechSynthesis.addEventListener("voiceschanged", () => {
      loadVoices();
      paintVoiceSelects();
    });
    loadVoices();
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && window.speechSynthesis) window.speechSynthesis.cancel();
  });

  ui.session = loadSession();
  if (ui.session && ui.session.phase === "chunk" && ui.session.step && ui.session.step.done) beginCloze();
  if (ui.session && ui.session.phase === "cloze" && ui.session.step && ui.session.step.done) beginRecall();
  if (ui.session) ui.page = "session";
  stamp = today();
  render();

  setInterval(() => {
    const clock = document.getElementById("clock");
    if (clock) clock.textContent = formatClock();
    if (today() !== stamp) {
      stamp = today();
      render();
    }
  }, 30000);

  setInterval(() => {
    if (!ui.session || ui.session.phase === "done") return;
    if (document.visibilityState === "hidden") return;
    day().seconds += 10;
    persist();
    const el = document.getElementById("study-time");
    if (el) el.textContent = formatMinutes(day().seconds);
  }, 10000);
})();

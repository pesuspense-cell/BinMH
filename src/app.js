(function () {
  if (!window.REVELATION || !window.LampEngine || !window.LampAdventure || !window.LampGames) {
    document.getElementById("app").innerHTML = "<main><p>본문을 불러오지 못했습니다.</p></main>";
    return;
  }

  const E = window.LampEngine;
  const A = window.LampAdventure;
  const G = window.LampGames;
  const B = window.LampBible;
  const S = window.LampSync;
  const list = E.flatten(window.REVELATION);
  const map = new Map(list.map((verse) => [verse.id, verse]));
  const STORAGE = "seven-lamps-revelation-v1";
  const MOODS = ["평안", "감사", "회개", "소망", "간구", "기쁨"];

  const PHASE_HELP = {
    read: "귀 아이콘으로 듣고, 소리 내어 읽은 뒤 다음으로 넘어갑니다.",
    cloze: "핵심어만 비우고 조사와 어미는 단서로 남겼습니다. 스스로 떠올린 말이 읽기만 한 말보다 오래 남습니다.",
    recall: "힌트 없이 적어야 정말 외운 것입니다. 띄어쓰기는 달라도 됩니다.",
    review: "잊기 직전에 다시 꺼냅니다. 간격은 1일, 3일, 7일, 그 뒤로 조금씩 늘어납니다.",
    exam: "방금 외운 절을 다른 문제와 섞어, 힌트 없이 다시 확인합니다.",
    chapter: "한 장 전체를 순서와 본문으로 확인합니다. 첫 시도와 한 번의 재시도만 점수에 들어갑니다.",
    spot: "이미 외운 장에서 흔들리기 쉬운 절을 골라 다시 꺼냅니다."
  };

  const THEME_COLORS = { morning: "#7ebdd8", day: "#2f9eb0", evening: "#0b1c45" };

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
    bibleError: false,
    syncError: "",
    syncBusy: false,
    syncEmail: "",
    syncNote: "",
    syncKey: "",
    adventureWalk: null,
    game: null
  };

  let bibleGameList = null;
  let bibleGameLoading = null;

  function ensureBibleGames() {
    if (bibleGameList) return Promise.resolve(bibleGameList);
    if (!B || !B.load) return Promise.resolve(null);
    if (!bibleGameLoading) {
      bibleGameLoading = B.load().then(() => {
        bibleGameList = B.sampleVerses(160, 17);
        return bibleGameList;
      }).catch(() => {
        bibleGameLoading = null;
        return null;
      });
    }
    return bibleGameLoading;
  }

  function gameProgress() {
    if (!state.gameProgress || typeof state.gameProgress !== "object") {
      state.gameProgress = { spireFloor: 1, cardsIndex: 0, spireWins: 0, cardsWins: 0 };
    }
    const g = state.gameProgress;
    ["spireFloor"].forEach((key) => {
      if (typeof g[key] !== "number" || g[key] < 1) g[key] = 1;
    });
    ["cardsIndex", "spireWins", "cardsWins"].forEach((key) => {
      if (typeof g[key] !== "number" || g[key] < 0) g[key] = 0;
    });
    return g;
  }

  function gameCtx() {
    return {
      E,
      list,
      bibleList: bibleGameList || [],
      cards: state.cards,
      progress: gameProgress(),
      setProgress: (next) => {
        state.gameProgress = Object.assign(gameProgress(), next || {});
        persist();
      },
      addXp: (n) => { addXp(n); }
    };
  }

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
      earModel: "base",
      dailyMode: "flex",
      adventureDay: 0,
      adventureAdvancedOn: "",
      gameProgress: { spireFloor: 1, cardsIndex: 0, spireWins: 0, cardsWins: 0 }
    };
  }

  function dailyMode() {
    return state.dailyMode === "fixed5" ? "fixed5" : "flex";
  }

  function dailyPacks() {
    return A.buildPacks(list, dailyMode());
  }

  function adventurePath() {
    return A.buildPath(dailyPacks().length);
  }

  function currentPack() {
    const packs = dailyPacks();
    for (let i = 0; i < packs.length; i++) {
      if (packs[i].ids.some((id) => (state.cards[id]?.stage || 0) < 3)) {
        return Object.assign({ index: i }, packs[i]);
      }
    }
    return null;
  }

  function todayPackIds() {
    const pack = currentPack();
    return pack ? pack.ids.slice() : [];
  }

  function ensureAdventure() {
    if (typeof state.adventureDay !== "number" || state.adventureDay < 0) state.adventureDay = 0;
    const max = Math.max(0, dailyPacks().length - 1);
    if (state.adventureDay > max) state.adventureDay = max;
    if (!state.adventureAdvancedOn) state.adventureAdvancedOn = "";
  }

  function advanceAdventure() {
    ensureAdventure();
    if (state.adventureAdvancedOn === today()) return false;
    const max = Math.max(0, dailyPacks().length - 1);
    if (state.adventureDay >= max) {
      state.adventureAdvancedOn = today();
      return false;
    }
    const from = state.adventureDay;
    state.adventureDay = Math.min(max, state.adventureDay + 1);
    state.adventureAdvancedOn = today();
    ui.adventureWalk = { from, to: state.adventureDay, started: Date.now() };
    return true;
  }

  function adventureMapHtml(opts) {
    ensureAdventure();
    const path = adventurePath();
    const walk = ui.adventureWalk;
    const walking = !!(walk && opts && opts.animate);
    const walkT = walking ? Math.min(1, (Date.now() - walk.started) / 1200) : 0;
    return A.mapHtml({
      path,
      day: walking ? walk.from : state.adventureDay,
      walking,
      walkT
    });
  }

  function tickAdventureWalk() {
    if (!ui.adventureWalk) return;
    const elapsed = Date.now() - ui.adventureWalk.started;
    if (elapsed >= 1200) {
      ui.adventureWalk = null;
      render();
      return;
    }
    const slot = document.querySelector("[data-adv-slot]");
    if (slot) slot.innerHTML = adventureMapHtml({ animate: true });
    requestAnimationFrame(tickAdventureWalk);
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
      const stale = (item) => item && (item.blanks || item.kind === "blanks" && !item.units);
      if (stale(session.step) || (session.queue || []).some(stale)) return null;
      return session;
    } catch (err) {
      return null;
    }
  }

  function persist() {
    if (gated()) return;
    localStorage.setItem(STORAGE, JSON.stringify(state));
    if (S) S.touched();
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
    const pack = currentPack();
    if (!pack) return 0;
    const passedInPack = day().newPassed.filter((id) => pack.ids.includes(id)).length;
    const still = pack.ids.filter((id) => (state.cards[id]?.stage || 0) < 3).length;
    return Math.min(pack.ids.length, passedInPack + still);
  }

  function todayRoom() {
    const goal = todayGoal();
    if (!goal) return 0;
    const packIds = new Set(todayPackIds());
    const waiting = waitingIds().filter((id) => packIds.has(id));
    return Math.max(0, goal - day().newPassed.filter((id) => packIds.has(id)).length - waiting.length);
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

  const AI_VOICES = [
    ["cedar", "AI 남성 · 깊고 차분한"],
    ["marin", "AI 여성 · 맑고 따뜻한"],
    ["onyx", "AI 남성 · 낮고 묵직한"],
    ["coral", "AI 여성 · 부드러운"]
  ];
  const SPEAK_VERSION = 3;
  let player = null;

  function aiVoice() {
    if (!state.voiceURI) return AI_VOICES[0][0];
    const m = /^ai:(\w+)$/.exec(state.voiceURI);
    return m && AI_VOICES.some(([key]) => key === m[1]) ? m[1] : "";
  }

  function voiceNote() {
    if (aiVoice()) return "AI 목소리는 인터넷에 연결된 상태에서 읽습니다. 처음 듣는 절은 몇 초 걸리고, 한 번 들은 절은 바로 나옵니다.";
    const installed = loadVoices();
    const korean = installed.filter(isKoreanVoice);
    if (!installed.length) return "목소리를 불러오는 중입니다.";
    const natural = korean.filter((voice) => /natural|neural|online/i.test(voice.name || ""));
    if (natural.length) return "자연스러운 목소리 중에서 고릅니다. 이 목소리는 인터넷에 연결된 상태에서 읽습니다.";
    if (!/Edg\//.test(navigator.userAgent)) return "더 자연스러운 목소리는 Microsoft Edge에 있습니다. 같은 주소를 Edge로 열면 선희, 인준, 현수가 목록에 나옵니다.";
    return "Edge의 자연 목소리를 아직 찾지 못했습니다. 인터넷에 연결된 뒤 페이지를 다시 열어 보세요.";
  }

  function voiceOptionsHtml() {
    const ai = aiVoice();
    const aiHtml = AI_VOICES.map(([key, label]) => '<option value="ai:' + key + '"' + (ai === key ? " selected" : "") + ">" + esc(label) + "</option>").join("");
    const items = voiceChoices();
    const current = ai ? null : chosenVoice();
    const deviceHtml = items.map((voice) => '<option value="' + esc(voice.voiceURI) + '"' + (current && voice.voiceURI === current.voiceURI ? " selected" : "") + ">" + esc(voiceLabel(voice)) + "</option>").join("");
    return '<optgroup label="AI 목소리">' + aiHtml + "</optgroup>" + (deviceHtml ? '<optgroup label="이 기기 목소리">' + deviceHtml + "</optgroup>" : "");
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

  function stopSpeaking() {
    clearTimeout(speakTimer);
    if (player) {
      player.onerror = null;
      player.pause();
      player = null;
    }
    speakLoading(false);
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  function speakLoading(on) {
    document.querySelectorAll("[data-act='speak'], [data-act='voice-sample']").forEach((btn) => {
      if (btn.classList.contains("ear-btn")) {
        btn.classList.toggle("loading", on);
        btn.setAttribute("aria-busy", on ? "true" : "false");
        return;
      }
      btn.textContent = on ? "불러오는 중…" : "들어 보기";
    });
  }

  function earButton(id) {
    return '<button class="ear-btn" type="button" data-act="speak" data-id="' + esc(id) + '" aria-label="들어 보기" title="들어 보기">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M6 12c0-4 2.4-7.2 6-8.2"/><path d="M12 3.8v14.4a2.8 2.8 0 0 0 4.7 2L20 17"/><path d="M15.2 8.2c1.1.7 1.8 1.9 1.8 3.3s-.7 2.6-1.8 3.3"/><path d="M18.2 5.8c1.8 1.2 3 3.2 3 5.7s-1.2 4.5-3 5.7"/>' +
      "</svg></button>";
  }

  function speakVerse(id) {
    const verse = map.get(id);
    if (!verse) return;
    stopSpeaking();
    const voice = aiVoice();
    if (!voice) return speakDevice(verse.text);
    const audio = new Audio("/api/speak?id=" + encodeURIComponent(id) + "&voice=" + voice + "&v=" + SPEAK_VERSION);
    player = audio;
    let fell = false;
    const fallback = () => {
      if (fell || player !== audio) return;
      fell = true;
      player = null;
      speakLoading(false);
      speakDevice(verse.text);
    };
    speakLoading(true);
    audio.onplaying = () => speakLoading(false);
    audio.onended = () => { if (player === audio) player = null; };
    audio.onerror = fallback;
    audio.play().catch(fallback);
  }

  function speakDevice(text) {
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
  const HEAR_LABEL = "입력 완료";
  const DICTATE_LABEL = "음성입력";

  function cloudSpeech() {
    if (/Cursor\/|Electron\//.test(navigator.userAgent)) return null;
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }

  function dictateHint() {
    return "음성입력을 누르고 말한 뒤, 입력 완료를 누르면 개역한글로 들어갑니다.";
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
      btn.textContent = on ? HEAR_LABEL : DICTATE_LABEL;
    });
  }

  function setHearNote(text) {
    const btn = document.querySelector("[data-act='dictate']");
    const row = btn && (btn.closest(".actions") || btn);
    if (!row || !row.parentElement) return;
    let note = document.getElementById("hear-note");
    if (!note) {
      note = document.createElement("p");
      note.id = "hear-note";
      note.className = "faint";
      row.parentElement.insertBefore(note, row);
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
      btn.textContent = "적는 중…";
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

  let serverEarOff = false;
  const SERVER_EAR_SECONDS = 90;

  function wavBase64(samples) {
    const bytes = new Uint8Array(44 + samples.length * 2);
    const view = new DataView(bytes.buffer);
    const text = (at, s) => { for (let i = 0; i < s.length; i++) bytes[at + i] = s.charCodeAt(i); };
    text(0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    text(8, "WAVEfmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 16000, true);
    view.setUint32(28, 32000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    text(36, "data");
    view.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) {
      const v = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    }
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }

  function earPrompt(form) {
    const target = heardTarget(form);
    const verse = target ? list.find((item) => item.text === target || item.text.startsWith(target)) : null;
    const vocab = [];
    if (verse) {
      const near = [verse].concat(list.filter((item) => item.chapter === verse.chapter && item.id !== verse.id));
      near.forEach((item) => {
        if (!unitCache.has(item.id)) unitCache.set(item.id, E.clozeUnits(item.text).filter((unit) => unit.score >= 3));
        unitCache.get(item.id).forEach((unit) => { if (!vocab.includes(unit.answer)) vocab.push(unit.answer); });
      });
    }
    return "개역한글 요한계시록을 외워 낭독합니다. 들은 그대로 옛 성경 표기로 적습니다(예: 볼찌어다, 가라사대, 하시니라, 있을찌어다)." +
      (vocab.length ? " 나올 수 있는 낱말: " + vocab.slice(0, 80).join(", ") + "." : "");
  }

  async function transcribeServer(samples, form) {
    if (serverEarOff || !S || !S.token || !S.status().signedIn) return "";
    const token = await S.token();
    if (!token) return "";
    const clip = samples.length > 16000 * SERVER_EAR_SECONDS ? samples.subarray(0, 16000 * SERVER_EAR_SECONDS) : samples;
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), 30000);
    try {
      const reply = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ audio: wavBase64(clip), prompt: earPrompt(form) }),
        signal: stop.signal
      });
      if ([404, 405, 501, 503].includes(reply.status)) {
        serverEarOff = true;
        return "";
      }
      if (!reply.ok) return "";
      const data = await reply.json();
      return cleanHeard(data.text);
    } catch (err) {
      return "";
    } finally {
      clearTimeout(timer);
    }
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
    if (question.kind === "full" || question.kind === "blanks") return verse.text;
    if (question.kind === "opening") return E.words(verse.text).slice(0, 6).join(" ");
    return "";
  }

  function pickHeard(current) {
    const segs = (current.segs || []).concat(current.live || []);
    if (!segs.length) return current.finals + " " + current.session;
    const target = heardTarget(current.form);
    return segs.map((alts) => {
      if (!target || alts.length < 2) return alts[0];
      let best = alts[0];
      let top = -1;
      alts.forEach((alt, rank) => {
        const fit = E.heardFit(alt, target) - rank * 0.02;
        if (fit > top) {
          top = fit;
          best = alt;
        }
      });
      return best;
    }).join(" ");
  }

  function writeHeard(form, said) {
    const live = form && form.isConnected ? form : document.querySelector("form[data-act='answer-full'], form[data-act='recall'], form[data-act='answer-opening'], form[data-act='blanks']");
    if (!said || !live) return false;
    form = live;
    const field = form.elements.text || null;
    if (field) {
      field.value = E.toClassic(said, heardTarget(form)) || said;
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
    question.units.forEach((_, n) => {
      const input = form.elements["u" + n];
      if (!input) return;
      input.value = "";
      delete input.dataset.spoken;
    });
    question.units.forEach((unit, n) => {
      const input = form.elements["u" + n];
      let word = "";
      if (whole) {
        const span = slots.slice(unit.i, unit.j);
        const same = E.normalize(span.join("")) === E.normalize(verseWords.slice(unit.i, unit.j).join(""));
        if (span.every(Boolean)) word = same ? unit.answer : span.join(" ");
      } else if (parts[n]) {
        word = E.toClassic(parts[n], unit.answer + E.normalize(unit.after));
      }
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
    current.segs = [];
    current.live = [];
    rec.lang = "ko-KR";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 5;
    rec.onresult = (event) => {
      const heard = [];
      for (let i = 0; i < event.results.length; i++) {
        const alts = [];
        for (let k = 0; k < event.results[i].length; k++) {
          const said = String(event.results[i][k].transcript || "").trim();
          if (said) alts.push(said);
        }
        if (alts.length) heard.push(alts);
      }
      current.live = heard;
      current.session = heard.map((alts) => alts[0]).join(" ").replace(/\s+/g, " ").trim();
      const live = (current.finals + " " + current.session).trim();
      if (dict === current && live) setHearNote("들은 말: " + live);
    };
    rec.onerror = (event) => {
      if (["network", "not-allowed", "service-not-allowed", "language-not-supported", "audio-capture"].includes(event.error)) current.cloudDead = true;
    };
    rec.onend = () => {
      current.finals = (current.finals + " " + current.session).trim();
      current.session = "";
      current.segs = current.segs.concat(current.live);
      current.live = [];
      if (current.onCloudEnd) current.onCloudEnd();
      if (dict === current && !current.closing && !current.cloudDead) {
        try { rec.start(); } catch (err) { current.cloudDead = true; }
      }
    };
    try { rec.start(); } catch (err) { current.cloudDead = true; }
  }

  function startHearing(form) {
    stopHearing();
    stopSpeaking();
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
      const samples = prepareSamples(raw, current.recorder.rate);
      if (samples && samples !== "silent") said = await transcribeServer(samples, current.form);
      if (!said) said = cleanHeard(pickHeard(current));
      if (!said) {
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
      const read = readBlanks(blanksForm, question);
      question.draftBlanks = read.blanks;
      question.draftSpoken = read.spoken;
    }
  }

  function readBlanks(form, question) {
    const blanks = {};
    let spoken = false;
    (question.units || []).forEach((_, n) => {
      const input = form.elements["u" + n];
      if (!input) return;
      blanks[n] = input.value;
      if (input.dataset.spoken === "1") spoken = true;
    });
    return { blanks, spoken };
  }

  function dictateButton() {
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && !window.SpeechRecognition && !window.webkitSpeechRecognition) return "";
    if (transcribing) return '<button class="btn" type="button" data-act="dictate" disabled>적는 중…</button>';
    return '<button class="btn' + (hearing ? " listening" : "") + '" type="button" data-act="dictate">' + (hearing ? HEAR_LABEL : DICTATE_LABEL) + "</button>";
  }

  function actions(hint) {
    return '<div class="actions">' + dictateButton() + '<button class="btn gold" type="submit">확인</button>' + (hint || "") + "</div>";
  }

  function laterButton() {
    return '<button class="btn ghost" type="button" data-act="skip">나중에</button>';
  }

  const unitCache = new Map();

  function clozePool(id) {
    const verse = map.get(id);
    const bag = [];
    list.forEach((item) => {
      if (Math.abs(item.chapter - verse.chapter) > 1 || item.id === id) return;
      if (!unitCache.has(item.id)) unitCache.set(item.id, E.clozeUnits(item.text).filter((unit) => unit.score >= 3));
      unitCache.get(item.id).forEach((unit) => bag.push(unit));
    });
    return bag;
  }

  function production(id, salt) {
    const verse = map.get(id);
    const seed = E.hash(id + ":" + salt + ":" + today());
    const stage = (state.cards[id] && state.cards[id].stage) || 0;
    const units = E.words(verse.text).length <= 18 ? [] : E.pickCloze(verse.text, stage >= 3 ? 2 : 1, seed);
    if (!units.length) return { kind: "full", id, qid: "f" + id + ":" + salt };
    return { kind: "blanks", id, units, qid: "b" + id + ":" + salt };
  }

  function clozeLine(text, units, blank) {
    const verseWords = E.words(text);
    const out = [];
    let n = 0;
    for (let i = 0; i < verseWords.length; i++) {
      const unit = units[n];
      if (unit && unit.i === i) {
        out.push('<span class="cz">' + esc(unit.before) + blank(unit, n) + esc(unit.after) + "</span>");
        i = unit.j - 1;
        n += 1;
      } else out.push("<span>" + esc(verseWords[i]) + "</span>");
    }
    return out.join(" ");
  }

  function syllableMask(answer) {
    return answer.replace(/[^\s]/g, "○");
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
    stopSpeaking();
    if (page !== "session" && ui.session && ui.session.phase === "done") ui.session = null;
    if (page !== "games") ui.game = null;
    ui.page = page;
    if (page === "games") {
      ensureBibleGames().then((ready) => {
        if (ui.page === "games" && ready) render();
      });
    }
    render();
  }

  function startDaily() {
    if (ui.session && ui.session.phase !== "done") {
      ui.page = "session";
      render();
      return;
    }
    const packIds = todayPackIds();
    const packSet = new Set(packIds);
    const waiting = waitingIds().filter((id) => !packIds.length || packSet.has(id));
    const due = dueVerses();
    const room = todayRoom();
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
    session.packIds = packIds;
    session.dailyGoal = todayGoal();
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
    beginCloze();
  }

  function beginCloze() {
    const session = ui.session;
    const id = session.step.id;
    const verse = map.get(id);
    const seed = E.hash(id + ":cloze:" + Date.now());
    const units = E.pickCloze(verse.text, 0, seed);
    if (!units.length) {
      beginRecall();
      return;
    }
    session.phase = "cloze";
    session.step = {
      id,
      units,
      filled: {},
      bank: E.makeClozeBank(units, clozePool(id), seed + 7),
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

  function fillCloze(uid) {
    const step = ui.session.step;
    if (!step || step.done) return;
    if (Object.values(step.filled).includes(uid)) return;
    const next = step.units.findIndex((_, n) => !step.filled[n]);
    if (next < 0) return;
    step.filled[next] = uid;
    step.wrong = [];
    if (step.units.every((_, n) => step.filled[n])) {
      const wrong = [];
      step.units.forEach((unit, n) => {
        const token = step.bank.find((item) => item.uid === step.filled[n]);
        if (!token || E.normalize(token.word) !== E.normalize(unit.answer)) wrong.push(n);
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
      session.queue.push(Object.assign({}, question, { repair: true, hinted: false, qid: question.qid + ":r" }));
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
    const packIds = session.packIds || todayPackIds();
    const packSet = new Set(packIds);
    const goal = session.dailyGoal != null ? session.dailyGoal : (packIds.length || todayGoal());
    const todayLog = day();
    const doneInPack = todayLog.newPassed.filter((id) => !packSet.size || packSet.has(id)).length;
    const packCleared = packIds.length
      ? packIds.every((id) => (state.cards[id]?.stage || 0) >= 3)
      : goal > 0 && doneInPack >= goal;
    const met = goal > 0 && (packCleared || doneInPack >= goal);
    if (met && !todayLog.bonus) {
      todayLog.bonus = true;
      addXp(40);
      session.summaryBonus = true;
    }
    let advanced = false;
    if (met) advanced = advanceAdventure();
    ensureAdventure();
    session.phase = "done";
    session.feedback = null;
    session.summary = {
      kind: "daily",
      goal,
      done: doneInPack,
      bonus: !!session.summaryBonus,
      missed: session.missed || [],
      lamps: lampsLit() > session.lampsAtStart,
      advanced,
      finale: state.adventureDay >= Math.max(0, adventurePath().length - 1)
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
      ui.confirm = { message: syncOn() ? "지금 계정의 기록을 가져온 파일의 기록으로 바꿉니다. 다른 기기에도 이 기록이 적용됩니다." : "지금 이 브라우저의 기록을 가져온 파일의 기록으로 바꿉니다.", act: "import-go" };
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

  function syncOn() {
    return !!(S && S.status().configured);
  }

  function syncLine(info) {
    if (info.phase === "saving") return "저장하는 중…";
    if (info.phase === "saved") return "서버에 저장됨 · " + info.at;
    if (info.phase === "offline") return "오프라인입니다. 연결되면 바로 올립니다.";
    if (info.phase === "error") return "동기화 문제: " + info.error;
    if (info.phase === "conflict") return "어느 기록을 쓸지 골라 주세요.";
    if (info.phase === "signed-out") return "로그인하지 않았습니다.";
    return "서버 기록을 확인하는 중…";
  }

  function syncMessages() {
    return (ui.syncError ? '<p class="error">' + esc(ui.syncError) + "</p>" : "") +
      (ui.syncNote ? '<p class="muted">' + esc(ui.syncNote) + "</p>" : "");
  }

  function syncFormHtml() {
    const busy = ui.syncBusy ? " disabled" : "";
    return '<form data-act="sync-login" class="sync-form">' +
      '<input class="textin" id="sync-email" name="email" type="email" autocomplete="username" placeholder="이메일 주소" value="' + esc(ui.syncEmail) + '">' +
      '<input class="textin" id="sync-password" name="password" type="password" autocomplete="current-password" placeholder="비밀번호 (6자 이상)">' +
      '<div class="row"><button class="btn gold" type="submit" name="mode" value="in"' + busy + '>로그인</button><button class="btn" type="submit" name="mode" value="up"' + busy + '>처음이에요, 가입하기</button><button class="btn ghost" type="button" data-act="sync-forgot"' + busy + ">비밀번호를 잊었어요</button></div></form>" + syncMessages();
  }

  function recoveryHtml() {
    return '<p class="muted">새 비밀번호를 정해 주세요.</p><form data-act="sync-newpass" class="row"><input class="textin" id="sync-newpass" name="password" type="password" autocomplete="new-password" placeholder="새 비밀번호 (6자 이상)"><button class="btn gold" type="submit"' + (ui.syncBusy ? " disabled" : "") + ">비밀번호 바꾸기</button></form>" + syncMessages();
  }

  function gated() {
    return syncOn() && !S.status().signedIn;
  }

  function gateHtml() {
    if (!syncOn()) return "";
    const info = S.status();
    const head = '<div class="gate-mascot">' + logo() + '</div><p class="eyebrow">개역한글 · 요한계시록</p><h1>Walking Bible</h1>';
    if (info.recovery) return '<div class="welcome"><article class="card">' + head + "<h3>비밀번호 바꾸기</h3>" + recoveryHtml() + "</article></div>";
    if (info.signedIn && info.phase !== "loading") return "";
    if (info.phase === "loading" || info.phase === "off") {
      return '<div class="welcome"><article class="card">' + head + '<p class="muted">' + (info.signedIn ? "기록을 불러오는 중…" : "준비하는 중…") + "</p></article></div>";
    }
    return '<div class="welcome"><article class="card">' + head +
      '<p class="lede">기록은 계정에 저장됩니다. 휴대폰과 PC 어디서든 같은 이메일과 비밀번호로 로그인하면 이어서 암송합니다.</p>' +
      (info.phase === "error" && info.error ? '<p class="error">' + esc(info.error) + "</p>" : "") + syncFormHtml() +
      '<p class="faint">처음이라면 쓸 이메일과 비밀번호(6자 이상)를 정해 가입하기를 누르세요.</p></article></div>';
  }

  function syncCardHtml() {
    if (!syncOn()) return "";
    const info = S.status();
    return '<article class="card" style="margin-bottom:16px"><h3>계정</h3><p class="muted">' + esc(info.email) + ' 계정에 기록을 보관합니다. 휴대폰과 PC에서 같은 계정으로 로그인하면 같은 기록을 이어 씁니다.</p>' +
      '<p class="sync-line ' + esc(info.phase) + '" id="sync-status">' + esc(syncLine(info)) + "</p>" +
      '<div class="row"><button class="btn" type="button" data-act="sync-now">지금 맞추기</button><button class="btn ghost" type="button" data-act="sync-out">로그아웃</button></div></article>';
  }

  function welcomeSyncHtml() {
    if (!syncOn()) return "";
    const info = S.status();
    return '<article class="card welcome-sync"><p class="muted">' + esc(info.email) + ' 로 로그인했습니다. 예전 주소에서 내보낸 기록 파일이 있다면 이름 대신 파일을 가져와도 됩니다.</p><div class="row"><label class="btn small">기록 파일 가져오기<input type="file" accept="application/json,.json" data-act="import" hidden></label><button class="btn ghost small" type="button" data-act="sync-out">다른 계정으로 로그인</button></div></article>';
  }

  function clearLocal() {
    state = fresh();
    ui.session = null;
    ui.page = "home";
    ui.draft = "";
    ui.draftRef = "";
    ui.editing = "";
    ui.editDraft = null;
    ui.confirm = null;
    localStorage.removeItem(STORAGE);
    localStorage.removeItem(STORAGE + ":backup");
    sessionStorage.removeItem(STORAGE + ":s");
  }

  function logout(force) {
    S.signOut(force).then(() => {
      clearLocal();
      ui.syncError = "";
      ui.syncNote = "";
      render();
    }, (err) => {
      if (err && err.unsaved) {
        ui.confirm = { message: "아직 서버에 올리지 못한 기록이 있습니다. 지금 로그아웃하면 이 기기에 남은 그 기록은 사라집니다. 인터넷 연결을 확인한 뒤 다시 시도하는 편이 안전합니다.", act: "logout-go" };
      } else {
        ui.confirm = { message: "로그아웃하지 못했습니다. 잠시 뒤 다시 시도해 주세요.", act: "noop" };
      }
      render();
    });
  }

  function recordSummary(data) {
    const cards = data.cards || {};
    const known = Object.keys(cards).filter((id) => (cards[id].stage || 0) >= 3).length;
    const days = Object.keys(data.days || {}).sort();
    const last = days.length ? days[days.length - 1] : "";
    return (data.name ? esc(data.name) + " · " : "") + "외운 절 " + known + " · 일기 " + (data.journal || []).length + " · " + (data.xp || 0) + " XP" + (last ? " · 마지막 " + last : "");
  }

  function conflictHtml() {
    const info = syncOn() ? S.status() : null;
    if (!info || !info.conflict) return "";
    return '<div class="modal-back"><div class="modal"><p>이 기기의 기록과 서버의 기록이 서로 다릅니다. 어느 쪽을 쓸까요?</p><div class="stack">' +
      '<button class="btn gold choice" type="button" data-act="sync-pick" data-side="remote">서버 기록 쓰기<br><small>' + recordSummary(info.conflict.remote.state || {}) + "</small></button>" +
      '<button class="btn choice" type="button" data-act="sync-pick" data-side="local">이 기기 기록 쓰기<br><small>' + recordSummary(info.conflict.local) + "</small></button>" +
      '</div><p class="faint">고르지 않은 쪽은 이 기기에 백업으로 한 번 남겨 둡니다.</p></div></div>';
  }

  function syncKey(info) {
    return [info.signedIn, info.phase === "loading", info.phase === "signed-out", !!info.conflict, info.recovery].join("|");
  }

  function onSyncStatus() {
    const info = S.status();
    const key = syncKey(info);
    if (key !== ui.syncKey) {
      ui.syncKey = key;
      const typing = document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName) && !/^sync-/.test(document.activeElement.id);
      if (!typing || info.conflict) { render(); return; }
    }
    const line = document.getElementById("sync-status");
    if (line && info.signedIn) {
      line.textContent = syncLine(info);
      line.className = (ui.page === "stats" ? "sync-line " : "faint ") + info.phase;
    }
  }

  function startSync() {
    if (!S) return;
    S.init({
      key: STORAGE,
      read: () => state,
      meaningful: (data) => !!(data && ((data.xp || 0) > 0 || (data.journal || []).length || Object.keys(data.cards || {}).length)),
      apply: (data) => {
        state = Object.assign(fresh(), data);
        if (state.name && ui.page === "welcome") ui.page = "home";
        render();
      },
      status: onSyncStatus
    });
    if (syncOn()) ui.syncKey = syncKey(S.status());
  }

  function syncSay(error, note, keep) {
    ui.syncError = error || "";
    ui.syncNote = note || "";
    render();
    if (keep) {
      const field = document.getElementById(keep.id);
      if (field) field.value = keep.value;
    }
  }

  function syncRun(form, task, done, keepId) {
    const keep = keepId && form.elements.password ? { id: keepId, value: form.elements.password.value } : null;
    ui.syncBusy = true;
    form.querySelectorAll("button").forEach((button) => { button.disabled = true; });
    task().then((result) => {
      ui.syncBusy = false;
      done(result);
    }, (err) => {
      ui.syncBusy = false;
      syncSay(err.message, "", keep);
    });
  }

  function syncLogin(form, mode) {
    const email = String(form.elements.email.value || "").trim();
    const password = String(form.elements.password.value || "");
    ui.syncEmail = email;
    const keep = { id: "sync-password", value: password };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return syncSay("이메일 주소를 확인해 주세요.", "", keep);
    if (password.length < 6) return syncSay("비밀번호를 6자 이상 적어 주세요.", "", keep);
    if (mode === "up") {
      return syncRun(form, () => S.signUp(email, password), (waiting) => {
        syncSay("", waiting ? email + " 으로 가입 확인 메일을 보냈습니다. 메일의 링크를 이 브라우저에서 연 뒤 로그인해 주세요." : "");
      }, "sync-password");
    }
    syncRun(form, () => S.signIn(email, password), () => syncSay("", ""), "sync-password");
  }

  function syncForgot(form) {
    const email = String(form.elements.email.value || "").trim();
    ui.syncEmail = email;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return syncSay("비밀번호를 바꿀 이메일 주소를 먼저 적어 주세요.");
    syncRun(form, () => S.forgot(email), () => syncSay("", email + " 으로 비밀번호 재설정 메일을 보냈습니다. 메일의 링크를 이 브라우저에서 열어 주세요."));
  }

  function syncNewPassword(form) {
    const password = String(form.elements.password.value || "");
    if (password.length < 6) return syncSay("비밀번호를 6자 이상 적어 주세요.");
    syncRun(form, () => S.newPassword(password), () => syncSay("", "비밀번호를 바꿨습니다."), "sync-newpass");
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

  function themePeriod() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 11) return "morning";
    if (hour >= 11 && hour < 17) return "day";
    return "evening";
  }

  function applyTheme() {
    const period = themePeriod();
    const root = document.documentElement;
    if (root.dataset.theme !== period) root.dataset.theme = period;
    const color = THEME_COLORS[period] || THEME_COLORS.evening;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && meta.getAttribute("content") !== color) meta.setAttribute("content", color);
  }

  function logo() {
    return '<svg class="walker" viewBox="0 0 64 64" aria-hidden="true">' +
      '<g class="wb-limb"><path d="M27 47l-5 9h-4"/><path d="M37 47l5 8h5"/><path d="M19 27c-5 3-7 7-7 12"/><path d="M45 25c5 1 8-1 10-6"/></g>' +
      '<rect class="wb-page" x="21" y="9" width="27" height="38" rx="3"/>' +
      '<rect class="wb-cover" x="17" y="7" width="27" height="40" rx="3.5"/>' +
      '<rect class="wb-spine" x="17" y="7" width="5" height="40" rx="2"/>' +
      '<path class="wb-cross" d="M33 11.5v8M29.5 14.5h7"/>' +
      '<circle class="wb-eye" cx="28.5" cy="27" r="2.6"/><circle class="wb-eye" cx="37" cy="27" r="2.6"/>' +
      '<circle class="wb-pupil" cx="29.2" cy="27.4" r="1.2"/><circle class="wb-pupil" cx="37.7" cy="27.4" r="1.2"/>' +
      '<path class="wb-smile" d="M29 33.5c2.3 2.2 5.4 2.2 7.6 0"/>' +
      "</svg>";
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
      ["home", "오늘", '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'],
      ["practice", "암송", '<path d="M3 5.5C5.5 4 8.5 4 12 6c3.5-2 6.5-2 9-.5V19c-2.5-1.5-5.5-1.5-9 .5-3.5-2-6.5-2-9-.5z"/><path d="M12 6v13.5"/>'],
      ["games", "놀이", '<path d="M6 9h12v6H6z"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><path d="M4 12h2M18 12h2M12 7v2M12 15v2"/>'],
      ["review", "복습", '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 21v-5h-5"/>'],
      ["chapters", "장", '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>'],
      ["journal", "일기", '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'],
      ["stats", "기록", '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>']
    ];
    const current = ui.page === "read" ? "chapters" : ui.page === "session" ? "practice" : ui.page;
    const info = E.levelInfo(state.xp);
    return '<header class="nav"><button class="brand" type="button" data-act="nav" data-page="home">' + logo() +
      '<span><strong>Walking Bible</strong><small>REVELATION</small></span></button><nav class="links" aria-label="메뉴">' +
      pages.map(([page, label, icon]) => '<button type="button" data-act="nav" data-page="' + page + '" class="' + (current === page ? "active" : "") + '"' + (current === page ? ' aria-current="page"' : "") + '><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icon + "</svg><span>" + label + "</span></button>").join("") +
      '</nav><div class="nav-right"><span class="streak">연속 ' + activeStreak() + '일</span><span class="level">Lv.' + info.level + " " + esc(info.title) +
      '</span><span class="who">' + esc(state.name) + '</span><button class="btn gold" type="button" data-act="start-daily">' +
      (ui.session && ui.session.phase !== "done" ? "이어하기" : "오늘의 암송") + "</button></div></header>";
  }

  function welcomeHtml() {
    return '<div class="welcome"><form class="card" data-act="welcome"><p class="eyebrow">개역한글 · 요한계시록</p><h1>하루 한 묶음, 천국의 길을 갑니다</h1><p class="lede">길이 맞는 만큼 읽고, 빈칸을 메우고, 힌트 없이 적습니다. 오늘 몫을 채우면 순례자가 한 걸음 나아갑니다.</p><label class="stack">뭐라고 부를까요<input class="textin" id="name" name="name" maxlength="16" placeholder="이름" autocomplete="name"></label>' +
      (ui.nameError ? '<p class="error">' + esc(ui.nameError) + "</p>" : "") +
      '<p><button class="btn gold" type="submit">암송을 시작할게요</button></p></form>' + welcomeSyncHtml() + "</div>";
  }

  function homeHtml() {
    ensureAdventure();
    const goal = todayGoal();
    const pack = currentPack();
    const packSet = new Set(pack ? pack.ids : []);
    const passed = day().newPassed.filter((id) => !packSet.size || packSet.has(id)).length;
    const due = dueVerses().length;
    const upcoming = nextNew(todayRoom() || (pack ? pack.ids.length : 0));
    const plan = upcoming.length ? "계시록 " + upcoming[0].id + " – " + upcoming[upcoming.length - 1].id : "이제 외운 장을 지키는 자리입니다";
    const modeNote = dailyMode() === "fixed5" ? "고정 5절" : "길이 맞춤";
    const chars = pack ? pack.chars : 0;
    const heroTitle = goal === 0 ? "새 절은 모두 통과했습니다" : goal + "절 중 " + Math.min(passed, goal) + "절";
    const pick = state.pick ? map.get(state.pick.id) : null;
    const pickCard = pick ? state.cards[pick.id] : null;
    const pickReason = pickCard && pickCard.stage >= 3 && pickCard.masteredOn === today()
      ? "오늘 통과한 절입니다. 한 번 더 꺼내 보면 더 오래 남습니다."
      : (state.pick ? state.pick.reason : "");
    const known = knownCount();
    const info = E.levelInfo(state.xp);
    const letters = known ? list.filter((verse) => (state.cards[verse.id]?.stage || 0) >= 3).reduce((sum, verse) => sum + verse.text.replace(/\s/g, "").length, 0) : 0;
    const hello = greeting();
    const cut = hello.lastIndexOf(", ");
    const path = adventurePath();
    const atEnd = state.adventureDay >= path.length - 1 && knownCount() >= list.length;
    return '<p class="clock" id="clock"></p><h1>' + esc(hello.slice(0, cut + 1)) + "<br>" + esc(hello.slice(cut + 2)) + "</h1>" +
      '<label class="search"><span aria-hidden="true">⌕</span><input id="q" placeholder="성경 전서에서 찾기: 낱말, 요 3:16, 시 23, 계 21:4" value="' + esc(ui.query) + '" autocomplete="off"></label>' +
      '<div id="search-results">' + searchHtml(ui.query) + "</div>" +
      '<section class="hero"><div><p class="eyebrow">오늘 암송 · ' + modeNote + (chars ? " · 한글 " + chars + "자" : "") + '</p><h2>' + esc(heroTitle) + "</h2><p class=\"muted\">" + esc(plan) + (due ? " · 먼저 복습 " + due + "절" : "") + '</p></div><button class="btn gold" type="button" data-act="start-daily">' + (ui.session && ui.session.phase !== "done" ? "이어하기" : goal === 0 ? "복습하러 가기" : "암송 시작") + "</button></section>" +
      '<article class="card adventure-card" style="margin-bottom:16px"><div class="stats-head"><div><p class="eyebrow">천국의 길</p><h3>' + (atEnd ? "보좌 앞에 섰습니다" : "순례 지도") + "</h3></div><p class=\"faint\">Day " + (state.adventureDay + 1) + " / " + path.length + "</p></div>" +
      '<div data-adv-slot>' + adventureMapHtml({ animate: !!ui.adventureWalk }) + "</div>" +
      (atEnd ? '<p class="lede" style="margin-top:12px">어린양이 보좌에 계시니, 계시록의 길을 다 걸었습니다.</p>' : '<p class="muted" style="margin-top:10px">오늘 암송 몫을 채우면 한 칸 앞으로 갑니다.</p>') +
      "</article>" +
      '<article class="card" style="margin-bottom:16px"><div class="stats-head"><div><p class="eyebrow">암송 놀이</p><h3>계시록 슬레이 · 성경전서 카드</h3></div><button class="btn" type="button" data-act="nav" data-page="games">놀이 열기</button></div><p class="muted">계시록 슬레이와 성경전서 카드 로그. 이기면 Floor·구절이 앞으로 갑니다.</p></article>' +
      '<div class="grid-2"><article class="card"><h3>오늘의 기도</h3><div class="prayer-row">' + prayerButtons() + '</div><p class="muted">세 번을 채운 날 ' + prayerStreak() + '일</p>' + weekDots() + '</article>' +
      '<article class="card pick"><p class="eyebrow">오늘 마음에 둘 구절</p>' + (pick ? '<p class="faint">' + esc(refText(pick.id)) + (E.MARKS[pick.id] ? " · " + esc(E.MARKS[pick.id]) : "") + '</p><blockquote>「' + esc(pick.text) + '」</blockquote><p class="why">' + esc(pickReason) + '</p><button class="btn" type="button" data-act="open-pick">' + ((state.cards[pick.id]?.stage || 0) >= 3 ? "이 절 확인하기" : "오늘의 암송에서 만나기") + "</button>" : "") + "</article></div>" +
      '<article class="card"><h3>켜진 등잔</h3><div class="lamps">' + lampsHtml() + '</div><p>' + known + " / " + list.length + "절 · 새긴 글자 " + letters.toLocaleString("ko-KR") + '</p><div class="meter"><span style="--w:' + (known / list.length * 100) + '%"></span></div><div class="stones">' + stonesHtml() + '</div><div class="xpbar" style="margin-top:14px"><span style="--w:' + (info.into / info.span * 100) + '%"></span></div><p class="faint">Lv.' + info.level + " " + esc(info.title) + " · 오늘 " + day().xp + "점</p></article>" +
      '<article class="card" style="margin-top:16px"><h3>오늘의 발자국</h3>' + footHtml() + "</article>" +
      '<p class="note">본문은 개역한글입니다. ' + (syncOn() ? "암송 기록, 기도, 일기는 계정에 저장되어 어느 기기에서든 이어집니다." : "암송 기록, 기도, 일기는 이 브라우저 안에만 쌓입니다.") + "</p>";
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
    const pack = currentPack();
    const packSet = new Set(pack ? pack.ids : []);
    const passed = todayLog.newPassed.filter((id) => !packSet.size || packSet.has(id)).length;
    const prayers = ["morning", "noon", "evening"].filter((key) => todayLog.prayer[key]).length;
    const wrote = state.journal.some((entry) => entry.day === today());
    const items = [
      [goal === 0 || passed >= goal, goal ? "새 절 " + Math.min(passed, goal) + "/" + goal : "새 절은 모두 통과", "start-daily", ""],
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
    ensureAdventure();
    const goal = todayGoal();
    const pack = currentPack();
    const packSet = new Set(pack ? pack.ids : []);
    const passed = day().newPassed.filter((id) => !packSet.size || packSet.has(id)).length;
    const upcoming = nextNew(todayRoom() || (pack ? pack.ids.length : 0));
    const due = dueVerses().length;
    const modeLabel = dailyMode() === "fixed5" ? "고정 5절" : "길이 맞춤 · 약 80일";
    const methods = [
      ["1", "길이 맞는 묶음", "한글 길이에 맞춰 하루 몫을 잡고, 책의 흐름을 따라 새깁니다. 기록에서 고정 5절도 고를 수 있습니다."],
      ["2", "읽기", "귀 아이콘으로 듣고, 소리 내어 읽은 뒤 다음으로 넘어갑니다."],
      ["3", "빈칸", "가려진 말을 스스로 꺼내면 기억이 남습니다."],
      ["4", "백지 인출", "힌트 없이 적는 자리에서만 통과합니다."],
      ["5", "간격", "1일, 3일, 7일 뒤, 잊기 직전에 다시 만납니다."],
      ["6", "섞기", "다른 절과 섞어 물어 순서 단서에만 기대지 않게 합니다."],
      ["7", "장 전체와 지키기", "한 장을 다 외우면 전체 시험이 열리고, 외운 장은 등불이 흔들릴 때 다시 꺼냅니다."]
    ];
    return '<p class="eyebrow">오늘의 길 · ' + modeLabel + '</p><h1>천국의 길을 새기는 날</h1><p class="lede">' + (due ? "밀린 복습 " + due + "절을 먼저 한 뒤, " : "") + (goal ? "새 절 " + (goal - Math.min(passed, goal)) + "절이 남아 있습니다." : "새 절은 모두 한 번씩 통과했습니다. 복습과 장 지키기로 불을 유지합니다.") + "</p>" +
      '<article class="card adventure-card" style="margin-bottom:16px"><p class="eyebrow">천국의 길</p><div data-adv-slot>' + adventureMapHtml({}) + "</div></article>" +
      '<article class="card"><h3>오늘 만날 절</h3>' + (upcoming.length ? upcoming.map((verse) => '<p class="list-verse"><b>' + esc(refText(verse.id)) + "</b> " + esc(E.words(verse.text).slice(0, 8).join(" ")) + "…</p>").join("") : '<p class="muted">새로 열 절이 없습니다.</p>') +
      '<p><button class="btn gold" type="button" data-act="start-daily">' + (ui.session && ui.session.phase !== "done" ? "이어하기" : "시작") + "</button></p></article>" +
      '<article class="card" style="margin-top:16px"><h3>암송 놀이</h3><p class="muted">계시록 슬레이와 성경전서 카드 로그. 진행도가 저장됩니다.</p><p><button class="btn" type="button" data-act="nav" data-page="games">미니게임 열기</button></p></article>' +
      '<article class="card" style="margin-top:16px"><h3>왜 이 순서인가요</h3><div class="methods">' + methods.map((item) => "<div><b>" + item[0] + "</b><p><strong>" + item[1] + "</strong><br><span class=\"muted\">" + item[2] + "</span></p></div>").join("") + "</div></article>";
  }

  function gamesHtml() {
    return G.html(ui.game, gameCtx());
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
      return '<div class="verse ' + (verse.id === ui.highlight ? "focus" : "") + " " + (status.key === "firm" || status.key === "review" ? "known" : "") + '" id="v-' + verse.chapter + "-" + verse.verse + '"><sup>' + verse.verse + '</sup><div class="verse-body"><div class="verse-line"><p>' + esc(verse.text) + "</p>" + earButton(verse.id) + '</div><p class="faint">' + esc(status.label) + (card && card.stage >= 3 ? " · 다음 " + prettyDate(card.due) : "") + (E.MARKS[verse.id] ? " · " + esc(E.MARKS[verse.id]) : "") + "</p></div></div>";
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
      '<article class="card" style="margin-bottom:16px"><div class="stats-head"><h3>기도</h3>' + donut(possible ? got / possible : 0, "누적") + '</div><p class="muted">오전 · 한낮 · 저녁. 채운 자리는 올라오고, 빈 자리는 낮게 남습니다.</p>' + prayerChart(prayerDays) + '<p class="legend"><span><i class="morning"></i>오전</span><span><i class="noon"></i>정오</span><span><i class="evening"></i>저녁</span></p><p class="faint">세 번을 채운 연속 ' + prayerStreak() + "일</p></article>" +
      '<article class="card" style="margin-bottom:16px"><h3>외운 절 누적</h3>' + lineChart(mastery) + "</article>" +
      '<article class="card" style="margin-bottom:16px"><h3>맞힌 비율</h3>' + lineChart(accuracy, true) + '<p class="faint">그 날 확인한 문제가 있을 때만 점이 생깁니다.</p></article>' +
      '<article class="card" style="margin-bottom:16px"><h3>머문 시간</h3>' + barChart(usage.map((item) => ({ v: item.v, tick: Number(item.key.slice(8)), label: item.key + " " + Math.round(item.v) + "분" }))) + "</article>" +
      '<article class="card" style="margin-bottom:16px"><h3>사용한 날</h3><div class="heat">' + heatHtml() + '</div><p class="faint">색이 진할수록 그 날의 점수, 곧 암송하고 기도하고 기록한 양이 큽니다.</p></article>' +
      installCardHtml() +
      '<article class="card" style="margin-bottom:16px"><h3>하루 암송 분량</h3><p class="faint">기본은 한글 길이에 맞춘 하루 묶음으로, 계시록이 약 80일에 가깝게 끝나도록 잡습니다. 고정 5절을 고르면 예전처럼 하루 다섯 절입니다. 천국의 길 칸 수는 선택한 방식의 묶음 수에 맞춰집니다.</p><div class="row">' +
      [["flex", "길이 맞춤", "약 80일 · 한글 묶음"], ["fixed5", "고정 5절", "하루 다섯 절"]].map(([key, name, info]) => '<button class="btn ' + (dailyMode() === key ? "gold" : "ghost") + '" type="button" data-act="daily-mode" data-mode="' + key + '" aria-pressed="' + (dailyMode() === key) + '">' + name + '<br><small class="faint">' + info + "</small></button>").join("") +
      '</div><p class="faint" style="margin-top:10px">지금 길이는 약 ' + dailyPacks().length + "일 여정입니다.</p></article>" +
      '<article class="card" style="margin-bottom:16px"><h3>읽는 목소리</h3><p class="faint" id="voice-note">' + esc(voiceNote()) + '</p><div class="row"><select class="voice" data-act="voice">' + voiceOptionsHtml() + '</select><button class="btn" type="button" data-act="voice-sample">들어 보기</button></div></article>' +
      '<article class="card" style="margin-bottom:16px"><h3>음성입력 정확도</h3><p class="faint">Chrome·Edge에서는 브라우저의 음성인식을 먼저 씁니다. 그것을 쓸 수 없을 때 이 기기 안의 음성 모델이 받아 적습니다.</p><div class="row">' +
      [["base", "빠르게 · 기본", "처음 한 번 약 73MB"], ["small", "정확도 우선", "처음 한 번 약 238MB · 받아 적기 2~3배 느림"]].map(([key, name, info]) => '<button class="btn ' + ((state.earModel || "base") === key ? "gold" : "ghost") + '" type="button" data-act="ear-model" data-model="' + key + '" aria-pressed="' + ((state.earModel || "base") === key) + '">' + name + '<br><small class="faint">' + info + "</small></button>").join("") + "</div></article>" +
      syncCardHtml() +
      '<article class="card" style="margin-bottom:16px"><h3>기록 파일</h3><p class="faint">' + "계정과 별도로 지금 기록을 파일로 보관할 수 있습니다. 예전 주소에서 내보낸 파일을 가져오면 계정의 기록이 그 파일로 바뀝니다." + '</p><div class="row"><button class="btn" type="button" data-act="export">기록 내보내기</button><label class="btn ghost">기록 가져오기<input type="file" accept="application/json,.json" data-act="import" hidden></label></div></article>' +
      '<article class="card"><h3>이름</h3><form data-act="rename" class="row"><input class="textin" name="name" value="' + esc(state.name) + '" maxlength="16"><button class="btn" type="submit">바꾸기</button></form>' +
      '<form data-act="reset" style="margin-top:18px"><p class="faint">기록을 모두 지우려면 초기화라고 적고 버튼을 누르세요.</p><div class="row"><input class="textin" name="word" placeholder="초기화"><button class="btn" type="submit">기록 지우기</button></div></form></article>';
  }

  let installPrompt = null;

  function standalone() {
    return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  }

  function installCardHtml() {
    let body;
    if (standalone()) {
      body = '<p class="faint">지금 앱으로 열려 있습니다. 홈 화면의 Walking Bible 아이콘으로 바로 들어오세요.</p>';
    } else if (installPrompt) {
      body = '<p class="faint">홈 화면에 아이콘을 두고 주소창 없이 앱처럼 엽니다. 한 번 연 화면과 계시록 본문은 인터넷이 끊겨도 열립니다.</p><div class="row"><button class="btn gold" type="button" data-act="install">앱으로 설치</button></div>';
    } else if (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) {
      body = '<p class="faint">Safari 아래쪽의 공유 버튼을 누르고 <b>홈 화면에 추가</b>를 고르면 앱처럼 쓸 수 있습니다.</p>';
    } else {
      body = '<p class="faint">Chrome이나 Edge 주소창 오른쪽의 설치 아이콘, 또는 메뉴의 <b>앱 설치</b>·<b>홈 화면에 추가</b>를 누르면 앱처럼 쓸 수 있습니다.</p>';
    }
    return '<article class="card" style="margin-bottom:16px"><h3>앱으로 쓰기</h3>' + body + "</article>";
  }

  async function installApp() {
    if (!installPrompt) return;
    const prompt = installPrompt;
    installPrompt = null;
    prompt.prompt();
    await prompt.userChoice.catch(() => null);
    if (ui.page === "stats") render();
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    if (ui.page === "stats") render();
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    if (ui.page === "stats") render();
  });

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
      return '<div class="bar" title="' + esc(row.label || "") + '"><span class="grow" style="--h:' + height + '%;--i:' + index + '"></span><em>' + esc(row.tick || "") + "</em></div>";
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
      return '<svg viewBox="0 0 ' + w + " " + h + '" class="chart"><circle cx="' + coords[0][0] + '" cy="' + coords[0][1] + '" r="5" class="chart-dot"></circle></svg>';
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
    if (session.phase === "cloze") return shell(session, clozeStep());
    if (session.phase === "recall") return shell(session, recallStep());
    if (session.phase === "exam") return shell(session, examStep());
    return shell(session, "<p>이어갈 단계가 없습니다.</p>");
  }

  function sessionMeta() {
    const session = ui.session;
    if (session.phase === "read" || session.phase === "cloze" || session.phase === "recall") {
      const frac = { read: 0.25, cloze: 0.6, recall: 0.9 }[session.phase] || 0;
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
    const meta = E.CHAPTER_META[verse.chapter - 1];
    const tail = tailOf(verse.id);
    return '<p class="eyebrow">' + esc(meta.title) + (E.MARKS[verse.id] ? " · " + esc(E.MARKS[verse.id]) : "") + '</p><div class="verse-head"><h2>' + esc(refText(verse.id)) + "</h2>" + earButton(verse.id) + '</div><div class="paper"><p class="scripture">' +
      esc(verse.text) +
      "</p></div>" + (tail ? '<p class="faint">앞 절의 끝 · ' + esc(tail) + "</p>" : "") +
      '<div class="row study-actions"><button class="btn gold" type="button" data-act="after-read">다음</button>' + laterButton() + "</div>";
  }

  function clozeStep() {
    const step = ui.session.step;
    const used = new Set(Object.values(step.filled));
    const line = clozeLine(map.get(step.id).text, step.units, (unit, n) => {
      const token = step.filled[n] ? step.bank.find((item) => item.uid === step.filled[n]) : null;
      const bad = step.wrong && step.wrong.includes(n);
      return '<button type="button" class="blank ' + (bad ? "bad" : "") + '" data-act="unfill" data-i="' + n + '">' + (token ? esc(token.word) : esc(syllableMask(unit.answer))) + "</button>";
    });
    const bank = step.bank.filter((token) => !used.has(token.uid)).map((token) => '<button type="button" class="pill" data-act="fill" data-uid="' + esc(token.uid) + '">' + esc(token.word) + "</button>").join("");
    return '<div class="verse-head"><h2>' + esc(refText(step.id)) + "</h2>" + earButton(step.id) + '</div><div class="paper"><p class="scripture">' + line + '</p></div><div class="bank ' + (step.shake ? "shake" : "") + '">' + bank + "</div>" +
      (step.misses ? '<p class="help">다른 말이 들어간 칸은 비워 두었습니다.</p>' : "") + '<div class="row study-actions">' + laterButton() + "</div>";
  }

  function recallStep() {
    const step = ui.session.step;
    const verse = map.get(step.id);
    const tail = tailOf(step.id);
    return '<div class="verse-head"><h2>' + esc(refText(step.id)) + "</h2>" + earButton(step.id) + "</div>" + (tail ? '<p class="faint">앞 절의 끝 · ' + esc(tail) + "</p>" : "") +
      (step.showSkeleton ? '<p class="skel">' + esc(E.skeleton(verse.text)) + "</p>" : "") +
      '<form data-act="recall"><textarea name="text" rows="5" autocomplete="off" spellcheck="false" placeholder="힌트 없이, 개역한글 그대로 적어 보세요"' + (step.draftSpoken ? ' data-spoken="1"' : "") + ">" + esc(step.draft || "") + '</textarea><p class="faint">' + esc(dictateHint()) + "</p>" +
      actions('<button class="btn ghost" type="button" data-act="recall-hint"' + (step.showSkeleton ? " disabled" : "") + ">힌트</button>") + '</form><div class="row study-actions">' + laterButton() + "</div>";
  }

  function examStep() {
    const question = currentQuestion();
    if (!question) return '<p>문제가 없습니다.</p><button class="btn" type="button" data-act="nav" data-page="home">돌아가기</button>';
    ensureOrder();
    if (question.kind === "full") {
      return "<h2>" + esc(refText(question.id)) + '</h2><p class="help">개역한글 표기 그대로 적어 보세요. 말로 넣은 표기는 이 절에 맞게 고칩니다. ' + esc(dictateHint()) + '</p><form data-act="answer-full"><textarea name="text" rows="5" autocomplete="off" spellcheck="false" placeholder="본문을 적어 보세요"' + (question.draftSpoken ? ' data-spoken="1"' : "") + ">" + esc(question.draft || "") + "</textarea>" + actions() + "</form>";
    }
    if (question.kind === "opening") {
      const prev = map.get(question.from);
      return '<p class="help">앞 절입니다. 다음 절의 처음 여섯 단어를 적어 보세요.</p><div class="paper"><p>' + esc(prev.text) + '</p></div><form data-act="answer-opening"><textarea name="text" rows="3" autocomplete="off" spellcheck="false" placeholder="다음 절의 시작"' + (question.draftSpoken ? ' data-spoken="1"' : "") + ">" + esc(question.draft || "") + "</textarea>" + actions() + "</form>";
    }
    if (question.kind === "blanks") {
      const line = clozeLine(map.get(question.id).text, question.units, (unit, n) => {
        const cue = question.hinted ? E.chosung(unit.answer) : syllableMask(unit.answer);
        const value = (question.draftBlanks && question.draftBlanks[n]) || "";
        return '<input class="blank-input" name="u' + n + '" autocomplete="off" spellcheck="false" aria-label="빈칸 ' + (n + 1) + '" placeholder="' + esc(cue) + '" style="--len:' + Math.max(2, unit.answer.length) + '" value="' + esc(value) + '"' + (question.draftSpoken ? ' data-spoken="1"' : "") + ">";
      });
      const hint = '<button class="btn ghost" type="button" data-act="cloze-hint"' + (question.hinted ? " disabled" : "") + ">힌트</button>";
      return "<h2>" + esc(refText(question.id)) + '</h2><p class="help">조사와 어미는 남겨 두었습니다. ○ 하나가 한 글자이고, 힌트를 누르면 첫 소리가 보입니다.</p><form data-act="blanks"><div class="paper"><p class="scripture">' + line + "</p></div>" + actions(hint) + "</form>";
    }
    if (question.kind === "locate") {
      const verse = map.get(question.id);
      return '<p class="help">이 본문의 위치는 어디인가요?</p><div class="paper"><p class="scripture">' + esc(verse.text) + '</p></div><div class="choices">' +
        question.choices.map((id) => '<button type="button" data-act="locate" data-choice="' + id + '">' + esc(refText(id)) + "</button>").join("") + "</div>";
    }
    const picked = ui.session.orderPicked;
    const remain = question.bank.filter((id) => !picked.includes(id)).map((id) => question.items.find((item) => item.id === id));
    const answer = picked.map((id, pos) => {
      const item = question.items.find((entry) => entry.id === id);
      return '<button type="button" class="pill" data-act="unorder" data-pos="' + pos + '">' + esc(item.phrase) + "</button>";
    }).join("");
    const bank = remain.map((item) => '<button type="button" class="pill" data-act="take-order" data-id="' + item.id + '">' + esc(item.phrase) + "</button>").join("");
    return '<h2>순서</h2><p class="help">처음 몇 단어를 보고, 장에 나오는 순서대로 놓아 보세요.</p><form data-act="order"><div class="answer-row">' + (answer || '<span class="faint">여기로 옮깁니다</span>') + '</div><div class="bank">' + bank + '</div><div class="actions"><button class="btn gold" type="submit"' + (picked.length === question.items.length ? "" : " disabled") + ">확인</button></div></form>";
  }

  function ensureOrder() {
    const question = currentQuestion();
    const session = ui.session;
    if (!question || question.kind !== "order") return;
    if (!question.bank) question.bank = E.scramble(question.items.map((item) => item.id), E.hash(question.qid + ":" + Date.now()));
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
      const wrong = new Set(fb.wrong || []);
      detail = '<p class="scripture">' + clozeLine(map.get(fb.id).text, fb.units || [], (unit, n) =>
        '<b class="' + (wrong.has(n) ? "miss" : "hit") + '">' + esc(unit.answer) + "</b>") + "</p>" +
        (wrong.size ? '<p class="faint">붉은 말이 놓친 곳입니다. 앞뒤 말과 함께 한 번 소리 내어 읽어 보세요.</p>' : "");
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
      const pathNote = summary.finale
        ? "보좌 앞에 섰습니다. 천국의 길을 다 걸었습니다."
        : summary.advanced
          ? "순례자가 한 칸 앞으로 나아갔습니다."
          : met
            ? "오늘 몫을 이미 반영했습니다."
            : "";
      return '<div class="panel"><article class="card"><div class="stamp ' + (met ? "in" : "off") + '">' + (met ? "오늘" : "기록") + "</div><h1>" + (summary.finale ? "보좌에 이르렀습니다" : met ? "오늘 몫을 채웠습니다" : "오늘 자리를 마쳤습니다") + "</h1><p class=\"lede\">이번 자리에 " + gained + "점이 쌓였습니다." + (summary.bonus ? " 하루 목표를 채워 40점을 더했습니다." : "") + (summary.lamps ? " 등잔이 하나 더 켜졌습니다." : "") + (pathNote ? " " + pathNote : "") + "</p>" +
        '<div data-adv-slot class="adventure-done">' + adventureMapHtml({ animate: !!summary.advanced && !!ui.adventureWalk }) + "</div>" +
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
    applyTheme();
    const root = document.getElementById("app");
    document.title = "Walking Bible · 계시록 암송";
    const gate = gateHtml();
    if (gate) {
      root.innerHTML = "<main>" + gate + "</main>";
      return;
    }
    let body;
    if (!state.name) body = welcomeHtml();
    else if (ui.page === "session") body = sessionHtml();
    else if (ui.page === "practice") body = practiceHtml();
    else if (ui.page === "games") body = gamesHtml();
    else if (ui.page === "review") body = reviewHtml();
    else if (ui.page === "chapters") body = chaptersHtml();
    else if (ui.page === "read") body = readHtml();
    else if (ui.page === "journal") body = journalHtml();
    else if (ui.page === "stats") body = statsHtml();
    else body = homeHtml();
    root.innerHTML = (state.name ? navHtml() : "") + "<main>" + body + "</main>" + (conflictHtml() || modalHtml());
    document.title = "Walking Bible · 계시록 암송";
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
    if (ui.adventureWalk) requestAnimationFrame(tickAdventureWalk);
  }

  function onClick(event) {
    const el = event.target.closest("[data-act]");
    if (!el) return;
    if (el.closest("form") && el.type === "submit") return;
    const act = el.dataset.act;
    if (act === "nav") return go(el.dataset.page);
    if (act === "game-start") {
      const kind = el.dataset.game;
      const boot = () => {
        ui.game = G.start(kind, gameCtx());
        ui.page = "games";
        render();
      };
      if (kind === "cards" && !bibleGameList) {
        ensureBibleGames().then((ready) => {
          if (!ready) {
            ui.page = "games";
            render();
            return;
          }
          boot();
        });
        return;
      }
      boot();
      return;
    }
    if (act === "game-back") {
      ui.game = null;
      ui.page = "games";
      render();
      return;
    }
    if (act === "game-retry" && ui.game) {
      ui.game = G.start(ui.game.kind, gameCtx());
      render();
      return;
    }
    if (act === "spire-enter" || act === "spire-answer" ||
        act === "cards-play" || act === "cards-continue") {
      if (!ui.game) return;
      ui.game = G.act(ui.game, act, {
        choice: el.dataset.choice,
        id: el.dataset.id,
        index: el.dataset.index,
        word: el.dataset.word
      }, gameCtx());
      render();
      return;
    }
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
    if (act === "speak") {
      const id = el.dataset.id || (ui.session && ui.session.step && ui.session.step.id);
      if (id) speakVerse(id);
      return;
    }
    if (act === "export") return exportState();
    if (act === "install") return installApp();
    if (act === "sync-pick") { S.resolve(el.dataset.side === "local" ? "local" : "remote"); render(); return; }
    if (act === "sync-now") { S.pull(); return; }
    if (act === "sync-forgot") { const form = el.closest("form"); if (form) syncForgot(form); return; }
    if (act === "sync-out") return logout(false);
    if (act === "ear-model") {
      state.earModel = el.dataset.model === "small" ? "small" : "base";
      render();
      return;
    }
    if (act === "daily-mode") {
      const next = el.dataset.mode === "fixed5" ? "fixed5" : "flex";
      if (dailyMode() !== next) {
        state.dailyMode = next;
        ensureAdventure();
      }
      render();
      return;
    }
    if (act === "voice-sample") return speakVerse("1:8");
    if (act === "after-read") { afterRead(); render(); return; }
    if (act === "fill") return fillCloze(el.dataset.uid);
    if (act === "unfill") {
      delete ui.session.step.filled[el.dataset.i];
      render();
      return;
    }
    if (act === "recall-hint") {
      const step = ui.session && ui.session.step;
      const field = document.querySelector("form[data-act='recall'] textarea");
      if (!step) return;
      if (field) {
        step.draft = field.value;
        step.draftSpoken = field.dataset.spoken === "1";
      }
      step.showSkeleton = true;
      render();
      return;
    }
    if (act === "cloze-hint") {
      const question = currentQuestion();
      const form = el.closest("form");
      if (!question || question.kind !== "blanks" || !form) return;
      const read = readBlanks(form, question);
      question.draftBlanks = read.blanks;
      question.draftSpoken = read.spoken;
      question.hinted = true;
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
      else if (confirm && confirm.act === "logout-go") logout(true);
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
      const question = currentQuestion();
      return acceptAnswer(Object.assign(readBlanks(form, question), { hinted: !!question.hinted }));
    }
    if (act === "order") return acceptAnswer({ order: ui.session.orderPicked.slice() });
    if (act === "journal") return submitJournal(form);
    if (act === "sync-login") return syncLogin(form, event.submitter && event.submitter.value === "up" ? "up" : "in");
    if (act === "sync-newpass") return syncNewPassword(form);
    if (act === "reset") {
      if (String(form.elements.word.value || "").trim() !== "초기화") {
        ui.confirm = { message: "기록을 지우려면 입력칸에 초기화라고 정확히 적어 주세요.", act: "noop" };
        render();
        return;
      }
      ui.confirm = { message: syncOn() ? "암송 기록, 기도, 일기가 계정에서 모두 지워집니다. 다른 기기에서도 사라집니다." : "암송 기록, 기도, 일기가 이 브라우저에서 지워집니다.", act: "reset-go" };
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
    const note = document.getElementById("voice-note");
    if (note) note.textContent = voiceNote();
    speakVerse("1:8");
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
    if (document.visibilityState === "hidden") stopSpeaking();
  });

  ui.session = loadSession();
  if (ui.session && ui.session.phase === "chunk") beginCloze();
  if (ui.session && ui.session.phase === "cloze" && ui.session.step && ui.session.step.done) beginRecall();
  if (ui.session) ui.page = "session";
  stamp = today();
  startSync();
  applyTheme();
  render();

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
  }

  setInterval(() => {
    const clock = document.getElementById("clock");
    if (clock) clock.textContent = formatClock();
    const period = themePeriod();
    if (document.documentElement.dataset.theme !== period) applyTheme();
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

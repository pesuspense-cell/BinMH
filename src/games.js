(function (root) {
  const REV_KEYWORDS = [
    { name: "어린양", atk: 6, keys: ["어린양", "어린 양"] },
    { name: "일곱별", atk: 3, keys: ["일곱 별", "일곱별"] },
    { name: "생명책", atk: 4, keys: ["생명책", "생명 책"] },
    { name: "나팔", atk: 2, keys: ["나팔"] },
    { name: "보좌", atk: 5, keys: ["보좌"] },
    { name: "인", atk: 3, keys: ["인"] },
    { name: "대접", atk: 3, keys: ["대접"] },
    { name: "알파", atk: 5, keys: ["알파"] },
    { name: "오메가", atk: 5, keys: ["오메가"] },
    { name: "새예루살렘", atk: 7, keys: ["새 예루살렘", "예루살렘"] },
    { name: "두증인", atk: 4, keys: ["두 증인", "증인"] },
    { name: "흰옷", atk: 3, keys: ["흰 옷", "흰옷"] }
  ];

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[ch]));
  }

  function shuffle(arr, seed) {
    const E = root.LampEngine;
    if (E && E.seededShuffle) return E.seededShuffle(arr.slice(), seed);
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
  }

  function progressOf(ctx, kind) {
    const base = { spireFloor: 1, cardsIndex: 0, spireWins: 0, cardsWins: 0 };
    const raw = (ctx && ctx.progress) || {};
    return Object.assign({}, base, raw, (raw[kind] && typeof raw[kind] === "object") ? {} : {});
  }

  function saveProgress(ctx, patch) {
    if (!ctx || !ctx.setProgress) return;
    const next = Object.assign({}, progressOf(ctx), patch);
    ctx.setProgress(next);
  }

  function particleTrail(after) {
    const text = String(after || "");
    const m = text.match(/^([^“"'.,!?…·:;)\]\[]*)/);
    return m ? m[1] : "";
  }

  function exactFill(unit) {
    return String(unit.answer || "") + particleTrail(unit.after);
  }

  function verseLabel(verse) {
    if (!verse) return "";
    if (verse.bookName && verse.chapter != null && verse.verse != null) {
      return verse.bookName + " " + verse.chapter + "장 " + verse.verse + "절";
    }
    if (verse.ref) {
      const m = String(verse.ref).match(/^(.+?)\s+(\d+):(\d+)/);
      if (m) return m[1] + " " + m[2] + "장 " + m[3] + "절";
      return verse.ref;
    }
    if (verse.bookName) return verse.bookName + " " + verse.chapter + "장 " + verse.verse + "절";
    return "계시록 " + String(verse.id || "").replace(":", "장 ") + (String(verse.id || "").includes(":") ? "절" : "");
  }

  function verseKey(verse) {
    if (!verse) return "";
    return String(verse.id || verse.ref || verseLabel(verse));
  }

  // 성경전서 카드 로그 구절 풀: bible.json 전서(구약+신약)
  const CARDS_CORRECT = 5;
  const CARDS_DECOYS = 4;
  const CARDS_WRONG_HP = 5;
  const CARDS_MAX_HP = 30;

  function verseAllowedForCards(verse) {
    if (!verse) return false;
    if (verse.book && verse.chapter) return true;
    return !!verseKey(verse);
  }

  function filterCardPool(list) {
    return (list || []).filter(verseAllowedForCards);
  }

  function poolFor(kind, ctx) {
    if (kind === "spire") return (ctx.list || []).slice();
    const bible = ctx.bibleList;
    const raw = (bible && bible.length) ? bible : (ctx.list || []);
    return filterCardPool(raw);
  }

  function pickVerses(list, n, preferKnown, cards, seed) {
    let pool = list.slice();
    if (preferKnown && cards) {
      const known = pool.filter((a) => (cards[a.id]?.stage || 0) >= 3);
      if (known.length) pool = known;
    }
    const salt = seed == null ? (Date.now() % 9973) : seed;
    // Full-pool shuffle so 전서 랜덤 does not collapse to Genesis-only windows.
    return shuffle(pool, salt).slice(0, n);
  }

  function pickUnusedVerse(list, seen, preferKnown, cards, seed) {
    const seenSet = new Set(seen || []);
    let unused = list.filter((v) => !seenSet.has(verseKey(v)));
    if (!unused.length) {
      if (seen && seen.length) seen.length = 0;
      unused = list.slice();
    }
    return pickVerses(unused, 1, preferKnown, cards, seed)[0] || unused[0] || list[0] || null;
  }

  function cardsHint(verse, E) {
    const cue = verseLabel(verse);
    const words = E.words(verse.text || "").map((raw) =>
      String(raw).replace(/^[“"'(\[]+|[”"'.,!?…·:;)\]]+$/g, "") || raw
    ).filter(Boolean);
    if (!words.length) return "힌트 · " + cue;
    if (words.length === 1) return "힌트 · " + cue + " · 「" + words[0] + "」";
    const first = words[0];
    const last = words[words.length - 1];
    return "힌트 · " + cue + " · 시작 「" + first + "」 · 끝 「" + last + "」";
  }

  function distractorFills(verse, E, answer, seed, count) {
    const words = E.words(verse.text);
    const taken = new Set([E.normalize(answer)]);
    const fills = [];
    words.forEach((raw) => {
      const part = String(raw || "").replace(/^[“"'(\[]+|[”"'.,!?…·:;)\]]+$/g, "");
      if (part.length < 2) return;
      const key = E.normalize(part);
      if (taken.has(key)) return;
      taken.add(key);
      fills.push(part);
    });
    const units = E.clozeUnits(verse.text).filter((u) => u.score >= 2);
    units.forEach((u) => {
      const fill = exactFill(u);
      const key = E.normalize(fill);
      if (!fill || taken.has(key)) return;
      taken.add(key);
      fills.push(fill);
    });
    const picked = shuffle(fills, seed).slice(0, count);
    const fallback = ["아멘", "시작", "증거", "평강", "생명"];
    while (picked.length < count) {
      const word = fallback[picked.length % fallback.length];
      if (!taken.has(E.normalize(word))) {
        taken.add(E.normalize(word));
        picked.push(word);
      } else picked.push(word + "이");
    }
    return picked;
  }

  function buildBlankQueue(verse, E, seed, max) {
    const units = E.pickCloze(verse.text, 1, seed);
    const seen = new Set();
    const queue = [];
    units.forEach((unit) => {
      const fill = exactFill(unit);
      const key = E.normalize(fill);
      if (!fill || seen.has(key)) return;
      seen.add(key);
      queue.push({ unit, fill });
    });
    if (!queue.length) {
      const w = E.words(verse.text);
      const idx = Math.min(2, Math.max(0, w.length - 1));
      const raw = w[idx] || "아멘";
      const fill = String(raw).replace(/^[“"'(\[]+|[”"'.,!?…·:;)\]]+$/g, "") || raw;
      queue.push({
        unit: { i: idx, j: idx + 1, answer: fill, before: "", after: "" },
        fill
      });
    }
    return queue.slice(0, max || 4);
  }

  function renderPrompt(verse, blanks) {
    const E = root.LampEngine;
    const words = E.words(verse.text);
    const marks = new Array(words.length).fill(null);
    blanks.forEach((item, n) => {
      for (let i = item.unit.i; i < item.unit.j && i < words.length; i++) {
        marks[i] = n;
      }
    });
    const out = [];
    let prev = null;
    for (let i = 0; i < words.length; i++) {
      if (marks[i] == null) {
        out.push(words[i]);
        prev = null;
        continue;
      }
      if (prev === marks[i]) continue;
      prev = marks[i];
      out.push(blanks.length > 1 ? ("【" + (marks[i] + 1) + "】") : "____");
    }
    return out.join(" ");
  }

  function clozeRound(verse, E, seed, used) {
    const usedSet = new Set((used || []).map((x) => E.normalize(x)));
    const queue = buildBlankQueue(verse, E, seed, 5).filter((item) => !usedSet.has(E.normalize(item.fill)));
    const take = queue.length >= 2 ? queue.slice(0, Math.min(3, queue.length)) : queue.slice(0, 1);
    if (!take.length) {
      const fallback = buildBlankQueue(verse, E, seed + 11, 1)[0];
      take.push(fallback);
    }
    const multi = take.length > 1;
    if (multi) {
      const answers = take.map((t) => t.fill);
      const choicePool = [];
      const seen = new Set();
      answers.forEach((ans, i) => {
        seen.add(E.normalize(ans));
        choicePool.push(ans);
        distractorFills(verse, E, ans, seed + 17 + i * 13, 1).forEach((d) => {
          const key = E.normalize(d);
          if (seen.has(key)) return;
          seen.add(key);
          choicePool.push(d);
        });
      });
      while (choicePool.length < answers.length + 2) {
        const pad = distractorFills(verse, E, answers[0], seed + choicePool.length, 1)[0];
        if (!seen.has(E.normalize(pad))) {
          seen.add(E.normalize(pad));
          choicePool.push(pad);
        } else break;
      }
      return {
        id: verse.id,
        ref: verseLabel(verse),
        verse,
        mode: "multi",
        blanks: take,
        answers,
        pending: answers.slice(),
        filled: [],
        prompt: renderPrompt(verse, take),
        choices: shuffle(choicePool, seed + 3)
      };
    }
    const item = take[0];
    const wrong = distractorFills(verse, E, item.fill, seed + 5, 2);
    return {
      id: verse.id,
      ref: verseLabel(verse),
      verse,
      mode: "single",
      blanks: [item],
      answer: item.fill,
      prompt: renderPrompt(verse, [item]),
      choices: shuffle([item.fill].concat(wrong), seed + 7)
    };
  }

  function cleanCardWord(raw) {
    return String(raw || "").replace(/^[“"'(\[]+|[”"'.,!?…·:;)\]]+$/g, "") || String(raw || "");
  }

  function fiveCorrectChunks(verse, E) {
    const w = E.words(verse.text || "").map(cleanCardWord).filter(Boolean);
    if (w.length < CARDS_CORRECT) return null;
    return w.slice(0, CARDS_CORRECT);
  }

  function decoyChunks(pool, verse, correct, E, seed, count) {
    const taken = new Set((correct || []).map((c) => E.normalize(c)));
    const fills = [];
    const others = shuffle((pool || []).filter((v) => verseKey(v) !== verseKey(verse)), seed);
    for (let i = 0; i < others.length && fills.length < count * 4; i++) {
      const words = E.words(others[i].text || "").map(cleanCardWord).filter(Boolean);
      for (let j = 0; j < words.length; j++) {
        const part = words[j];
        if (part.length < 2) continue;
        const key = E.normalize(part);
        if (taken.has(key)) continue;
        taken.add(key);
        fills.push(part);
        if (fills.length >= count * 4) break;
      }
    }
    const picked = shuffle(fills, seed + 3).slice(0, count);
    const fallback = ["아멘", "시작", "증거", "평강", "생명", "말씀", "은혜", "영광"];
    let n = 0;
    while (picked.length < count) {
      const word = fallback[n % fallback.length] + (n >= fallback.length ? String(n) : "");
      n += 1;
      if (taken.has(E.normalize(word))) continue;
      taken.add(E.normalize(word));
      picked.push(word);
    }
    return picked;
  }

  function fragmentHand(verse, E, seed, pool) {
    const correct = fiveCorrectChunks(verse, E);
    if (!correct) return null;
    const decoys = decoyChunks(pool || [], verse, correct, E, seed + 11, CARDS_DECOYS);
    const hand = shuffle(correct.concat(decoys), seed);
    return {
      id: verse.id,
      ref: verseLabel(verse),
      text: verse.text || "",
      verse,
      correct,
      decoys,
      hand,
      hint: cardsHint(verse, E)
    };
  }

  function rememberVerse(game, verse) {
    const key = verseKey(verse);
    if (!key) return;
    game.seenVerseIds = game.seenVerseIds || [];
    if (game.seenVerseIds.indexOf(key) < 0) game.seenVerseIds.push(key);
    game.stageSeenVerseIds = game.stageSeenVerseIds || [];
    if (game.stageSeenVerseIds.indexOf(key) < 0) game.stageSeenVerseIds.push(key);
  }

  function hpBar(current, max, label) {
    const pct = Math.max(0, Math.min(100, Math.round((current / Math.max(1, max)) * 100)));
    return '<div class="hp-wrap" role="img" aria-label="' + esc(label || "HP") + " " + current + "/" + max + '">' +
      '<div class="hp-meta"><span>' + esc(label || "HP") + '</span><strong>' + current + " / " + max + "</strong></div>" +
      '<div class="hp-bar"><span style="--w:' + pct + '%"></span></div></div>';
  }

  function lobbyHtml(ctx) {
    const p = progressOf(ctx);
    const bibleReady = !!(ctx && ctx.bibleList && ctx.bibleList.length);
    return '<p class="eyebrow">암송 놀이</p><h1>미니게임 두 가지</h1>' +
      '<p class="lede">연습은 제한 없이 이어집니다. 이기면 Floor·구절 진행이 앞으로 가고, 지면 같은 지점에서 다시 도전합니다.</p>' +
      '<p class="muted">진행 · 계시록 슬레이 Floor ' + p.spireFloor +
      " · 성경전서 카드 #" + (p.cardsIndex + 1) + (bibleReady ? "" : " · 성경전서 불러오는 중…") + "</p>" +
      '<div class="game-lobby">' +
      '<article class="card game-pick"><p class="eyebrow">계시록 전용</p><h3>계시록 슬레이</h3><p class="muted">계시록 전 장에서 뽑은 구절로 맵·장 보스를 돌파합니다. 빈칸은 조사까지 정확히 고릅니다.</p>' +
      '<p class="faint">현재 Floor ' + p.spireFloor + " · 클리어 " + p.spireWins + "회</p>" +
      '<button class="btn gold" type="button" data-act="game-start" data-game="spire">입장</button></article>' +
      '<article class="card game-pick"><p class="eyebrow">성경전서</p><h3>성경전서 카드 로그</h3><p class="muted">성경 전서에서 랜덤으로 뽑은 구절의 조각 5장을 미끼 카드와 섞어 순서대로 냅니다. HP·콤보는 구절을 이어도 유지되고, HP가 0이 되면 콤보가 끊깁니다.</p>' +
      '<p class="faint">현재 구절 #' + (p.cardsIndex + 1) + " · 승리 " + p.cardsWins + "회</p>" +
      '<button class="btn gold" type="button" data-act="game-start" data-game="cards"' + (bibleReady ? "" : " disabled") + ">입장</button></article>" +
      "</div>";
  }

  function chapterForFloor(floor) {
    return Math.min(22, Math.max(1, floor | 0));
  }

  function problemBudget(node) {
    if (!node) return 3;
    if (node.type === "boss") return 5;
    if (node.type === "elite") return 4;
    return 3;
  }

  function pickCardsVerse(list, seen, preferKnown, cards, seed) {
    const eligible = (list || []).filter((v) => {
      const E = root.LampEngine;
      return E && fiveCorrectChunks(v, E);
    });
    const pool = eligible.length ? eligible : (list || []);
    return pickUnusedVerse(pool, seen, preferKnown, cards, seed) || pool[0] || null;
  }

  function dealCardsRound(game, verse, E, seedTag, pool) {
    const pack = fragmentHand(verse, E, E.hash((verse.id || verse.ref) + ":" + seedTag), pool || []);
    if (!pack) return null;
    rememberVerse(game, verse);
    game.verseId = pack.id;
    game.ref = pack.ref;
    game.verseText = pack.text;
    game.hint = pack.hint;
    game.correct = pack.correct;
    game.decoys = pack.decoys;
    game.hand = pack.hand;
    game.played = [];
    game.phase = "play";
    game.revealPending = null;
    game.over = false;
    game.won = false;
    return pack;
  }

  function reclaimCardsHand(game, message) {
    const E = root.LampEngine;
    const seed = E && E.hash
      ? E.hash("reclaim:" + (game.verseId || "") + ":" + (game.hp | 0) + ":" + (game.played || []).length)
      : ((Date.now() + (game.hp | 0)) % 9973);
    const deck = (game.correct || []).concat(game.decoys || []);
    game.hand = shuffle(deck.slice(), seed);
    game.played = [];
    // Combo persists across reclaim; only HP 0 clears it.
    game.phase = "play";
    game.revealPending = null;
    game.log = message || "손패를 다시 받았습니다. 올바른 순서로 내세요.";
    return game;
  }

  function start(kind, ctx) {
    const E = ctx.E;
    const cards = ctx.cards || {};
    const prog = progressOf(ctx);
    if (kind === "spire") {
      const floor = Math.max(1, prog.spireFloor | 0);
      const chapter = chapterForFloor(floor);
      const nodes = [
        { id: "start", label: "시작", type: "start", done: true },
        { id: "fight1", label: "암송 전투", type: "fight", done: false },
        { id: "fight2", label: "연속 전투", type: "fight", done: false },
        { id: "elite", label: "복습 엘리트", type: "elite", done: false },
        { id: "boss", label: chapter + "장 보스", type: "boss", done: false }
      ];
      return {
        kind: "spire",
        scope: "revelation",
        floor,
        chapter,
        hp: 48,
        maxHp: 48,
        power: 12 + Math.min(10, floor - 1),
        nodes,
        cursor: 1,
        phase: "map",
        battle: null,
        usedFills: [],
        seenVerseIds: [],
        stageSeenVerseIds: [],
        log: "Floor " + floor + " · " + chapter + "장 길입니다. 이기면 다음 Floor로 진행합니다.",
        over: false,
        won: false
      };
    }
    const list = poolFor("cards", ctx);
    const seen = [];
    const verse = pickCardsVerse(list, seen, true, cards, E.hash("cards:boot:" + (prog.cardsWins | 0) + ":" + Date.now() % 9973))
      || list[0] || (ctx.list || [])[0];
    const game = {
      kind: "cards",
      scope: "bible",
      cardsIndex: Math.max(0, prog.cardsIndex | 0),
      cardsWins: Math.max(0, prog.cardsWins | 0),
      hp: CARDS_MAX_HP,
      maxHp: CARDS_MAX_HP,
      seenVerseIds: seen,
      verseId: "",
      ref: "",
      verseText: "",
      hint: "",
      correct: [],
      decoys: [],
      hand: [],
      played: [],
      combo: 0,
      phase: "play",
      revealPending: null,
      log: "",
      over: false,
      won: false
    };
    const pack = dealCardsRound(game, verse, E, "hand:" + game.cardsIndex, list);
    if (!pack) {
      game.log = "카드 구절을 준비하지 못했습니다.";
      return game;
    }
    game.log = "성경전서 카드 · " + pack.ref + ". 힌트를 보고 진짜 조각 " + CARDS_CORRECT +
      "장을 순서대로 내세요. 틀린 제출마다 HP -" + CARDS_WRONG_HP + ".";
    return game;
  }

  function nextCardsVerse(game, ctx) {
    const E = ctx.E;
    const list = poolFor("cards", ctx);
    const seen = game.seenVerseIds || [];
    const verse = pickCardsVerse(
      list,
      seen,
      true,
      ctx.cards,
      E.hash("cards:next:" + (game.cardsIndex | 0) + ":" + (game.combo | 0) + ":" + (game.hp | 0))
    ) || list[0];
    if (!verse) return game;
    const pack = dealCardsRound(game, verse, E, "hand:" + game.cardsIndex + ":" + (game.combo | 0), list);
    if (!pack) return game;
    game.log = "다음 구절 · " + pack.ref + ". HP " + game.hp + "/" + game.maxHp + " · 콤보 ×" + game.combo +
      " · 승리 " + (game.cardsWins | 0) + "회";
    return game;
  }

  function nextBattleRound(game, ctx, keepEnemyHp) {
    const E = ctx.E;
    // Full Revelation pool (all chapters), not a single-chapter subset.
    const pool = poolFor("spire", ctx);
    const seed = E.hash("spire:" + game.floor + ":" + game.cursor + ":" + (game.usedFills || []).length + ":" +
      (game.seenVerseIds || []).length + ":" + (game.stageSeenVerseIds || []).length);
    // Merge climb-wide + stage-level uniqueness (stage list never clears mid-node).
    const block = [];
    (game.seenVerseIds || []).forEach((id) => { if (block.indexOf(id) < 0) block.push(id); });
    (game.stageSeenVerseIds || []).forEach((id) => { if (block.indexOf(id) < 0) block.push(id); });
    let verse = pickUnusedVerse(pool, block, true, ctx.cards, seed);
    if (!verse) verse = pool[0];
    // Sync climb list when pickUnusedVerse had to reshuffle an empty pool.
    game.seenVerseIds = block;
    rememberVerse(game, verse);
    let round = clozeRound(verse, E, seed, game.usedFills);
    if (!round.blanks.length || (game.usedFills || []).includes(round.mode === "multi" ? round.answers.join("|") : round.answer)) {
      const altBlock = (game.seenVerseIds || []).slice();
      const altPool = pool.filter((v) => verseKey(v) !== verseKey(verse));
      verse = pickUnusedVerse(altPool.length ? altPool : pool, altBlock, false, ctx.cards, seed + 9) || verse;
      game.seenVerseIds = altBlock;
      rememberVerse(game, verse);
      round = clozeRound(verse, E, seed + 21, []);
    }
    const node = game.nodes[game.cursor];
    const budget = problemBudget(node);
    const maxHp = keepEnemyHp != null && game.battle && game.battle.maxEnemyHp
      ? game.battle.maxEnemyHp
      : budget;
    game.battle = Object.assign(round, {
      kind: node.type,
      enemyHp: keepEnemyHp != null ? keepEnemyHp : budget,
      maxEnemyHp: maxHp
    });
    if (keepEnemyHp == null) game.battle.maxEnemyHp = budget;
    game.log = (node.type === "boss" ? "장 보스 · " : node.type === "elite" ? "엘리트 · " : "전투 · ") +
      round.ref + " · 적 HP " + game.battle.enemyHp + "/" + game.battle.maxEnemyHp + " (문제당 1)";
    return game;
  }

  function openSpireNode(game, ctx) {
    const node = game.nodes[game.cursor];
    if (!node || game.over) return game;
    game.phase = "battle";
    game.usedFills = [];
    game.stageSeenVerseIds = [];
    return nextBattleRound(game, ctx, null);
  }

  function markUsed(game, battle) {
    game.usedFills = (game.usedFills || []).slice();
    if (battle.mode === "multi") game.usedFills.push.apply(game.usedFills, battle.answers);
    else game.usedFills.push(battle.answer);
  }

  function dealBlankDamage(game, battle, label) {
    battle.enemyHp = Math.max(0, battle.enemyHp - 1);
    game.log = (label || "맞춤") + " · 적 HP -1 → " + battle.enemyHp + "/" + (battle.maxEnemyHp || battle.enemyHp);
  }

  function answerSpire(game, choice, ctx) {
    if (!game.battle || game.over) return game;
    const E = root.LampEngine;
    const battle = game.battle;
    if (battle.mode === "multi") {
      const hit = battle.pending.findIndex((ans) => E.normalize(ans) === E.normalize(choice));
      if (hit < 0) {
        const dmg = 8;
        game.hp = Math.max(0, game.hp - dmg);
        game.log = "틀렸습니다. 적 반격 -" + dmg;
        if (game.hp <= 0) {
          game.over = true;
          game.won = false;
          game.phase = "map";
          game.battle = null;
          game.log = "HP가 바닥났습니다. 같은 Floor에서 다시 도전하세요.";
        }
        return game;
      }
      const [got] = battle.pending.splice(hit, 1);
      battle.filled.push(got);
      battle.choices = battle.choices.filter((c) => E.normalize(c) !== E.normalize(got));
      dealBlankDamage(game, battle, "【" + battle.filled.length + "】 " + got);
      if (battle.pending.length) return game;
      markUsed(game, battle);
      if (battle.enemyHp <= 0) return clearSpireNode(game, ctx);
      // Next problem: new unused verse (never reuse within stage/climb).
      return nextBattleRound(game, ctx, battle.enemyHp);
    }

    const ok = E.normalize(choice) === E.normalize(battle.answer);
    if (ok) {
      dealBlankDamage(game, battle, "맞았습니다! 「" + battle.answer + "」");
      markUsed(game, battle);
      if (battle.enemyHp <= 0) return clearSpireNode(game, ctx);
      return nextBattleRound(game, ctx, battle.enemyHp);
    }
    const hit = 8;
    game.hp = Math.max(0, game.hp - hit);
    game.log = "틀렸습니다. 적 반격 -" + hit + " (정답: " + battle.answer + ")";
    if (game.hp <= 0) {
      game.over = true;
      game.won = false;
      game.phase = "map";
      game.battle = null;
      game.log = "HP가 바닥났습니다. 같은 Floor에서 다시 도전하세요.";
    }
    return game;
  }

  function clearSpireNode(game, ctx) {
    const node = game.nodes[game.cursor];
    node.done = true;
    game.battle = null;
    game.stageSeenVerseIds = [];
    if (node.type === "boss") {
      game.over = true;
      game.won = true;
      game.phase = "map";
      const nextFloor = game.floor + 1;
      saveProgress(ctx, {
        spireFloor: nextFloor,
        spireWins: progressOf(ctx).spireWins + 1
      });
      game.log = game.chapter + "장 보스 클리어! Floor " + nextFloor + "로 진행합니다.";
      if (ctx.addXp) ctx.addXp(25);
      return game;
    }
    game.cursor += 1;
    game.phase = "map";
    game.log = node.label + " 클리어. 다음 노드로 가세요.";
    return game;
  }

  function beginCardsReveal(game, outcome, message) {
    game.phase = "reveal";
    game.revealPending = outcome;
    game.log = message;
    return game;
  }

  function advanceCardsAfterReveal(game, ctx) {
    const pending = game.revealPending;
    game.revealPending = null;
    if (pending === "win") {
      // HP·combo persist; only the verse advances.
      return nextCardsVerse(game, ctx);
    }
    if (pending === "lose") {
      game.phase = "play";
      return game;
    }
    if (pending === "next") {
      return reclaimCardsHand(game, "같은 구절로 다시 손패를 받았습니다. 올바른 순서로 내세요.");
    }
    game.phase = "play";
    return game;
  }

  function playCard(game, word, ctx) {
    if (game.over || game.phase === "reveal") return game;
    const handIdx = game.hand.indexOf(word);
    if (handIdx < 0) return game;
    const idx = game.played.length;
    game.hand = game.hand.slice(0, handIdx).concat(game.hand.slice(handIdx + 1));
    game.played = game.played.concat([word]);
    if (game.correct[idx] !== word) {
      // Wrong full attempt: HP cost, reclaim, retry same verse. Combo only dies at HP 0.
      game.hp = Math.max(0, game.hp - CARDS_WRONG_HP);
      game.log = "틀린 조각·순서입니다. HP -" + CARDS_WRONG_HP;
      if (game.hp <= 0) {
        game.combo = 0;
        game.over = true;
        game.won = false;
        return beginCardsReveal(game, "lose", "HP 소진 · 콤보 초기화. 구절 본문을 확인한 뒤 다시 도전하세요.");
      }
      return reclaimCardsHand(game, "틀린 제출 · HP " + game.hp + "/" + game.maxHp +
        ". 손패를 다시 섞었습니다. 콤보 ×" + game.combo + " 유지.");
    }
    game.combo += 1;
    game.log = "맞춤 · 콤보 ×" + game.combo;
    // Verse clears only when all five true chunks are in order (decoys may remain in hand).
    if (game.played.length >= game.correct.length) {
      const nextIndex = game.cardsIndex + 1;
      const nextWins = progressOf(ctx).cardsWins + 1;
      saveProgress(ctx, {
        cardsIndex: nextIndex,
        cardsWins: nextWins
      });
      game.cardsIndex = nextIndex;
      game.cardsWins = nextWins;
      game.won = true;
      if (ctx.addXp) ctx.addXp(18);
      return beginCardsReveal(game, "win", game.ref + " 클리어! 승리 " + nextWins +
        "회 · 콤보 ×" + game.combo + " · HP " + game.hp + " 유지. 본문을 확인하세요.");
    }
    return game;
  }

  function act(game, action, payload, ctx) {
    if (!game) return null;
    if (action === "game-back") return null;
    if (action === "game-retry") return start(game.kind, ctx);
    if (game.kind === "spire") {
      if (action === "spire-enter") return openSpireNode(game, ctx);
      if (action === "spire-answer") return answerSpire(game, payload.choice, ctx);
      return game;
    }
    if (game.kind === "cards") {
      if (action === "cards-play") return playCard(game, payload.word, ctx);
      if (action === "cards-continue") return advanceCardsAfterReveal(game, ctx);
      return game;
    }
    return game;
  }

  function spireHtml(game) {
    const nodes = game.nodes.map((n, i) => {
      const next = !n.done && i === game.cursor;
      return '<div class="spire-node ' + (n.done ? "ok" : "") + (next ? " next" : "") + '">' +
        '<i></i><span>' + esc(n.label) + "</span>" +
        (next ? '<em class="pill">다음</em>' : "") + "</div>";
    }).join("");
    let body = "";
    if (game.phase === "battle" && game.battle) {
      const b = game.battle;
      body = '<article class="card"><h3>전투 · ' + esc(b.ref) +
        "</h3>" + hpBar(b.enemyHp, b.maxEnemyHp || b.enemyHp, "적 HP") +
        '<p class="muted">' + (b.mode === "multi"
          ? "서로 다른 빈칸 " + b.answers.length + "개를 조사까지 정확히 고르세요. 칸마다 적 HP 1. 남은 " + b.pending.length + "칸."
          : "빈칸을 개역한글 그대로(조사 포함) 고르면 적 HP 1. 틀리면 반격.") +
        '</p><p class="scripture game-prompt">' + esc(b.prompt) + '</p><div class="row wrap">' +
        b.choices.map((c) => '<button class="btn" type="button" data-act="spire-answer" data-choice="' + esc(c) + '">' + esc(c) + "</button>").join("") +
        "</div></article>";
    } else {
      body = '<article class="card spire-map">' + nodes +
        (game.over
          ? '<p><button class="btn gold" type="button" data-act="game-retry">' + (game.won ? "다음 Floor" : "다시 도전") + '</button> <button class="btn" type="button" data-act="game-back">로비</button></p>'
          : '<p><button class="btn gold" type="button" data-act="spire-enter">' + (game.nodes[game.cursor] ? game.nodes[game.cursor].label + " 들어가기" : "계속") + "</button></p>") +
        "</article>";
    }
    return '<div class="game-shell"><div class="game-top"><div><p class="eyebrow">계시록 슬레이 · Floor ' + game.floor + " · " + game.chapter + "장</p>" +
      hpBar(game.hp, game.maxHp, "내 HP") + "</div>" +
      '<div class="game-stats"><span><b>' + game.power + "</b><small>암기력</small></span><span><b>" +
      (game.seenVerseIds ? game.seenVerseIds.length : 0) + "</b><small>구절</small></span></div></div>" +
      '<p class="game-log">' + esc(game.log) + "</p>" + body +
      '<p class="row"><button class="btn ghost" type="button" data-act="game-back">로비로</button></p></div>';
  }

  function cardsHtml(game) {
    const wins = game.cardsWins | 0;
    const stats = '<div class="game-stats"><span><b>×' + game.combo +
      '</b><small>콤보</small></span><span><b>' + wins + "</b><small>승리</small></span></div>";
    if (game.phase === "reveal") {
      const pending = game.revealPending;
      const contLabel = pending === "win" ? "다음 구절" : pending === "lose" ? "다시 도전" : "계속";
      const contAct = pending === "win" || pending === "next" ? "cards-continue" : "game-retry";
      return '<div class="game-shell"><div class="game-top"><div><p class="eyebrow">성경전서 카드 로그 · ' + esc(game.ref || game.verseId) +
        "</p>" + hpBar(game.hp, game.maxHp || CARDS_MAX_HP, "내 HP") + "</div>" + stats + "</div>" +
        '<p class="game-log">' + esc(game.log) + "</p>" +
        '<article class="card"><p class="eyebrow">개역한글 본문</p><h3>' + esc(game.ref || "") + "</h3>" +
        '<p class="scripture">' + esc(game.verseText || "") + "</p>" +
        '<p><button class="btn gold" type="button" data-act="' + contAct + '">' + contLabel +
        '</button> <button class="btn" type="button" data-act="game-back">로비</button></p></article>' +
        '<p class="row"><button class="btn ghost" type="button" data-act="game-back">로비로</button></p></div>';
    }
    return '<div class="game-shell"><div class="game-top"><div><p class="eyebrow">성경전서 카드 로그 · ' + esc(game.ref || game.verseId) +
      "</p>" + hpBar(game.hp, game.maxHp || CARDS_MAX_HP, "내 HP") + "</div>" + stats + "</div>" +
      '<p class="game-log">' + esc(game.log) + "</p>" +
      '<p class="faint">' + esc(game.hint || "") + "</p>" +
      '<div class="card-field"><p class="muted">필드 (진짜 조각 ' + (game.correct || []).length + "장 · 순서대로)</p><div class=\"row wrap\">" +
      (game.played.length ? game.played.map((c) => '<span class="pill">' + esc(c) + "</span>").join("") : '<span class="faint">카드를 내세요</span>') +
      "</div></div>" +
      '<p class="muted">손패 · 진짜 ' + (game.correct || []).length + " + 미끼 " + (game.decoys || []).length + "</p><div class=\"row wrap\">" +
      game.hand.map((c) => '<button class="btn" type="button" data-act="cards-play" data-word="' + esc(c) + '"' + (game.over ? " disabled" : "") + ">" + esc(c) + "</button>").join("") +
      "</div>" +
      '<article class="card" style="margin-top:16px"><p class="muted">힌트의 책·장·절과 시작·끝 조각을 보고 진짜 5장을 고르세요. 틀린 제출마다 HP -' +
      CARDS_WRONG_HP + ". 구절을 이어도 HP·콤보는 유지되고, HP 0일 때만 콤보가 끊기며 본문이 공개됩니다.</p>" +
      "</article>" +
      '<p class="row"><button class="btn ghost" type="button" data-act="game-back">로비로</button></p></div>';
  }

  function html(game, ctx) {
    if (!game) return lobbyHtml(ctx);
    if (game.kind === "spire") return spireHtml(game);
    if (game.kind === "cards") return cardsHtml(game);
    return lobbyHtml(ctx);
  }

  root.LampGames = {
    lobbyHtml,
    start,
    act,
    html,
    KEYWORDS: REV_KEYWORDS,
    exactFill,
    clozeRound,
    pickUnusedVerse,
    cardsHint,
    verseKey,
    problemBudget,
    reclaimCardsHand,
    verseAllowedForCards,
    filterCardPool,
    CARDS_CORRECT,
    CARDS_DECOYS,
    CARDS_WRONG_HP
  };
})(typeof window !== "undefined" ? window : globalThis);

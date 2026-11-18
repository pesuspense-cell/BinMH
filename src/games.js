(function (root) {
  const RELICS = [
    { id: "scroll", name: "두루마리", desc: "암기력 +4", apply: (g) => { g.power += 4; } },
    { id: "lamp", name: "작은 등잔", desc: "전투 피해 +3", apply: (g) => { g.bonusDmg += 3; } },
    { id: "seal", name: "일곱째 인", desc: "최대 HP +12", apply: (g) => { g.maxHp += 12; g.hp = Math.min(g.maxHp, g.hp + 12); } },
    { id: "crown", name: "흰 면류관", desc: "오답 피해 -3", apply: (g) => { g.mitigate += 3; } },
    { id: "trumpet", name: "금 나팔", desc: "보스 피해 +5", apply: (g) => { g.bossBonus += 5; } }
  ];

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

  const BIBLE_KEYWORDS = [
    { name: "여호와", atk: 6, keys: ["여호와"] },
    { name: "하나님", atk: 5, keys: ["하나님"] },
    { name: "예수", atk: 6, keys: ["예수"] },
    { name: "그리스도", atk: 5, keys: ["그리스도"] },
    { name: "성령", atk: 5, keys: ["성령"] },
    { name: "믿음", atk: 4, keys: ["믿음"] },
    { name: "사랑", atk: 4, keys: ["사랑"] },
    { name: "말씀", atk: 4, keys: ["말씀"] },
    { name: "복음", atk: 4, keys: ["복음"] },
    { name: "기도", atk: 3, keys: ["기도"] },
    { name: "평강", atk: 3, keys: ["평강"] },
    { name: "의", atk: 3, keys: ["의"] },
    { name: "생명", atk: 4, keys: ["생명"] },
    { name: "빛", atk: 3, keys: ["빛"] },
    { name: "십자가", atk: 5, keys: ["십자가"] },
    { name: "부활", atk: 5, keys: ["부활"] },
    { name: "은혜", atk: 4, keys: ["은혜"] },
    { name: "천국", atk: 5, keys: ["천국"] },
    { name: "아브라함", atk: 4, keys: ["아브라함"] },
    { name: "다윗", atk: 4, keys: ["다윗"] },
    { name: "모세", atk: 4, keys: ["모세"] },
    { name: "시온", atk: 3, keys: ["시온"] }
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
    const base = { spireFloor: 1, chessWave: 1, cardsIndex: 0, spireWins: 0, chessWins: 0, cardsWins: 0 };
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

  function knownBonus(cards, list) {
    if (!cards || !list || !list.length) return 0;
    const known = list.filter((v) => (cards[v.id]?.stage || 0) >= 3).length;
    return Math.min(0.35, known / Math.max(1, list.length));
  }

  function verseLabel(verse) {
    if (!verse) return "";
    if (verse.ref) return verse.ref;
    if (verse.bookName) return verse.bookName + " " + verse.chapter + ":" + verse.verse;
    return "계시록 " + verse.id;
  }

  function poolFor(kind, ctx) {
    if (kind === "spire") return (ctx.list || []).slice();
    const bible = ctx.bibleList;
    if (bible && bible.length) return bible.slice();
    return (ctx.list || []).slice();
  }

  function pickVerses(list, n, preferKnown, cards, seed) {
    const pool = list.slice();
    if (preferKnown && cards) {
      pool.sort((a, b) => {
        const ka = (cards[a.id]?.stage || 0) >= 3 ? 1 : 0;
        const kb = (cards[b.id]?.stage || 0) >= 3 ? 1 : 0;
        return kb - ka;
      });
    }
    const salt = seed == null ? (Date.now() % 9973) : seed;
    return shuffle(pool.slice(0, Math.max(n * 4, n)), salt).slice(0, n);
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

  function fragmentHand(verse, E, seed) {
    const w = E.words(verse.text).map((raw) => String(raw).replace(/^[“"'(\[]+|[”"'.,!?…·:;)\]]+$/g, "") || raw);
    const take = Math.min(5, Math.max(3, w.length));
    const correct = w.slice(0, take);
    return { id: verse.id, ref: verseLabel(verse), correct, hand: shuffle(correct, seed) };
  }

  function unitsFromMemory(list, cards, keywords) {
    const found = [];
    const textBlob = list.map((v) => v.text).join(" ");
    keywords.forEach((kw) => {
      const hit = kw.keys.some((k) => textBlob.indexOf(k) >= 0);
      if (!hit) return;
      const mastered = list.some((v) => (cards[v.id]?.stage || 0) >= 3 && kw.keys.some((k) => v.text.indexOf(k) >= 0));
      found.push({
        name: kw.name,
        atk: kw.atk + (mastered ? 2 : 0),
        mastered: !!mastered,
        id: kw.name
      });
    });
    if (found.length < 4) {
      ["증인", "등잔", "별", "문", "평강", "은혜"].forEach((name, i) => {
        if (found.length >= 6) return;
        if (!found.some((u) => u.name === name)) found.push({ name, atk: 2 + i, mastered: false, id: name });
      });
    }
    return found.slice(0, 8);
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
    return '<p class="eyebrow">암송 놀이</p><h1>미니게임 세 가지</h1>' +
      '<p class="lede">연습은 제한 없이 이어집니다. 이기면 층·파장·구절 인덱스가 앞으로 가고, 지면 같은 지점에서 다시 도전합니다.</p>' +
      '<p class="muted">진행 · 계시록 슬레이 Floor ' + p.spireFloor + " · 성경전서 오토체스 Wave " + p.chessWave +
      " · 성경전서 카드 #" + (p.cardsIndex + 1) + (bibleReady ? "" : " · 성경전서 불러오는 중…") + "</p>" +
      '<div class="game-lobby">' +
      '<article class="card game-pick"><p class="eyebrow">계시록 전용</p><h3>계시록 슬레이</h3><p class="muted">계시록만으로 맵·유물·장 보스를 돌파합니다. 빈칸은 조사까지 정확히 고릅니다.</p>' +
      '<p class="faint">현재 Floor ' + p.spireFloor + " · 클리어 " + p.spireWins + "회</p>" +
      '<button class="btn gold" type="button" data-act="game-start" data-game="spire">입장</button></article>' +
      '<article class="card game-pick"><p class="eyebrow">성경전서</p><h3>성경전서 오토체스</h3><p class="muted">성경 전서 핵심어 유닛을 배치해 자동 전투합니다. 파장이 오를수록 적이 강해집니다.</p>' +
      '<p class="faint">현재 Wave ' + p.chessWave + " · 승리 " + p.chessWins + "회</p>" +
      '<button class="btn gold" type="button" data-act="game-start" data-game="chess"' + (bibleReady ? "" : " disabled") + ">입장</button></article>" +
      '<article class="card game-pick"><p class="eyebrow">성경전서</p><h3>성경전서 카드 로그</h3><p class="muted">전서 구절 조각 카드를 순서대로 내어 콤보를 만듭니다. 맞히면 다음 구절로 진행합니다.</p>' +
      '<p class="faint">현재 구절 #' + (p.cardsIndex + 1) + " · 승리 " + p.cardsWins + "회</p>" +
      '<button class="btn gold" type="button" data-act="game-start" data-game="cards"' + (bibleReady ? "" : " disabled") + ">입장</button></article>" +
      "</div>";
  }

  function chapterForFloor(floor) {
    return Math.min(22, Math.max(1, floor | 0));
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
        { id: "relic", label: "유물", type: "relic", done: false },
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
        bonusDmg: 0,
        mitigate: 0,
        bossBonus: 0,
        relics: [],
        nodes,
        cursor: 1,
        phase: "map",
        battle: null,
        relicChoices: null,
        usedFills: [],
        log: "Floor " + floor + " · " + chapter + "장 길입니다. 이기면 다음 Floor로 진행합니다.",
        over: false,
        won: false
      };
    }
    if (kind === "chess") {
      const wave = Math.max(1, prog.chessWave | 0);
      const list = poolFor("chess", ctx);
      const bench = unitsFromMemory(list.slice(0, 400), cards, BIBLE_KEYWORDS);
      return {
        kind: "chess",
        scope: "bible",
        wave,
        phase: "place",
        bench,
        board: [],
        enemyPower: 12 + wave * 3 + Math.floor(knownBonus(cards, ctx.list || []) * 8),
        bonus: knownBonus(cards, ctx.list || []),
        log: "성경전서 Wave " + wave + " · 벤치 유닛을 배치한 뒤 전투하세요.",
        result: null,
        over: false
      };
    }
    const list = poolFor("cards", ctx);
    const idx = Math.max(0, prog.cardsIndex | 0) % Math.max(1, list.length);
    const verse = list[idx] || list[0] || (ctx.list || [])[0];
    const pack = fragmentHand(verse, E, E.hash((verse.id || verse.ref) + ":hand:" + idx));
    return {
      kind: "cards",
      scope: "bible",
      cardsIndex: idx,
      hp: 30,
      maxHp: 30,
      enemy: 18 + Math.min(24, Math.floor(idx / 8)),
      maxEnemy: 18 + Math.min(24, Math.floor(idx / 8)),
      verseId: pack.id,
      ref: pack.ref,
      correct: pack.correct,
      hand: pack.hand,
      played: [],
      combo: 0,
      log: "성경전서 카드 · " + pack.ref + ". 손패를 올바른 순서로 내세요.",
      over: false,
      won: false
    };
  }

  function nextBattleRound(game, ctx, keepEnemyHp) {
    const E = ctx.E;
    const list = poolFor("spire", ctx);
    const chapterPool = list.filter((v) => v.chapter === game.chapter);
    const pool = chapterPool.length ? chapterPool : list;
    const seed = E.hash("spire:" + game.floor + ":" + game.cursor + ":" + (game.usedFills || []).length + ":" + (game.battle && game.battle.id || ""));
    let verse = game.battle && game.battle.verse
      ? game.battle.verse
      : pickVerses(pool, 1, true, ctx.cards, seed)[0] || pool[0];
    let round = clozeRound(verse, E, seed, game.usedFills);
    if (!round.blanks.length || (game.usedFills || []).includes(round.mode === "multi" ? round.answers.join("|") : round.answer)) {
      verse = pickVerses(pool.filter((v) => v.id !== verse.id), 1, false, ctx.cards, seed + 9)[0] || pickVerses(pool, 1, false, ctx.cards, seed + 11)[0] || verse;
      round = clozeRound(verse, E, seed + 21, []);
    }
    const node = game.nodes[game.cursor];
    game.battle = Object.assign(round, {
      kind: node.type,
      enemyHp: keepEnemyHp != null ? keepEnemyHp : (node.type === "boss" ? 28 + game.floor * 2 : node.type === "elite" ? 18 + game.floor : 12 + game.floor),
      maxEnemyHp: keepEnemyHp != null && game.battle ? game.battle.maxEnemyHp : (node.type === "boss" ? 28 + game.floor * 2 : node.type === "elite" ? 18 + game.floor : 12 + game.floor)
    });
    if (keepEnemyHp == null) game.battle.maxEnemyHp = game.battle.enemyHp;
    game.log = (node.type === "boss" ? "장 보스 · " : node.type === "elite" ? "엘리트 · " : "전투 · ") + round.ref;
    return game;
  }

  function openSpireNode(game, ctx) {
    const node = game.nodes[game.cursor];
    if (!node || game.over) return game;
    if (node.type === "relic") {
      game.phase = "relic";
      game.relicChoices = shuffle(RELICS, Date.now() % 5000).slice(0, 3);
      game.log = "유물 하나를 고르세요.";
      return game;
    }
    game.phase = "battle";
    game.usedFills = [];
    return nextBattleRound(game, ctx, null);
  }

  function markUsed(game, battle) {
    game.usedFills = (game.usedFills || []).slice();
    if (battle.mode === "multi") game.usedFills.push.apply(game.usedFills, battle.answers);
    else game.usedFills.push(battle.answer);
  }

  function answerSpire(game, choice, ctx) {
    if (!game.battle || game.over) return game;
    const E = root.LampEngine;
    const battle = game.battle;
    if (battle.mode === "multi") {
      const hit = battle.pending.findIndex((ans) => E.normalize(ans) === E.normalize(choice));
      if (hit < 0) {
        const dmg = Math.max(4, 8 - game.mitigate);
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
      const base = game.power + game.bonusDmg + (battle.kind === "boss" ? game.bossBonus : 0);
      const dealt = Math.max(3, Math.round(base * 0.35));
      battle.enemyHp = Math.max(0, battle.enemyHp - dealt);
      game.log = "【" + battle.filled.length + "】 " + got + " 맞춤 · 피해 " + dealt;
      if (battle.pending.length) return game;
      markUsed(game, battle);
      if (battle.enemyHp <= 0) return clearSpireNode(game, ctx);
      return nextBattleRound(game, ctx, battle.enemyHp);
    }

    const ok = E.normalize(choice) === E.normalize(battle.answer);
    const base = game.power + game.bonusDmg + (battle.kind === "boss" ? game.bossBonus : 0);
    if (ok) {
      const dealt = Math.max(4, Math.round(base * 0.7));
      battle.enemyHp = Math.max(0, battle.enemyHp - dealt);
      game.log = "맞았습니다! 「" + battle.answer + "」 · 피해 " + dealt;
      markUsed(game, battle);
      if (battle.enemyHp <= 0) return clearSpireNode(game, ctx);
      return nextBattleRound(game, ctx, battle.enemyHp);
    }
    const hit = Math.max(4, 8 - game.mitigate);
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

  function pickRelic(game, relicId) {
    const relic = (game.relicChoices || []).find((r) => r.id === relicId) || RELICS.find((r) => r.id === relicId);
    if (!relic || game.phase !== "relic") return game;
    relic.apply(game);
    game.relics.push(relic.name);
    game.nodes[game.cursor].done = true;
    game.cursor += 1;
    game.phase = "map";
    game.relicChoices = null;
    game.log = relic.name + "을(를) 얻었습니다. " + relic.desc;
    return game;
  }

  function placeChess(game, unitId) {
    if (game.phase !== "place" || game.board.length >= 8) return game;
    const idx = game.bench.findIndex((u) => u.id === unitId);
    if (idx < 0) return game;
    const unit = game.bench[idx];
    game.bench = game.bench.slice(0, idx).concat(game.bench.slice(idx + 1));
    game.board = game.board.concat([unit]);
    game.log = unit.name + " 배치 (" + game.board.length + "/8)";
    return game;
  }

  function unplaceChess(game, index) {
    if (game.phase !== "place") return game;
    const i = Number(index);
    if (!(i >= 0 && i < game.board.length)) return game;
    const unit = game.board[i];
    game.board = game.board.slice(0, i).concat(game.board.slice(i + 1));
    game.bench = game.bench.concat([unit]);
    return game;
  }

  function fightChess(game, ctx) {
    if (game.phase !== "place" || !game.board.length) {
      game.log = "유닛을 하나 이상 배치하세요.";
      return game;
    }
    game.phase = "fight";
    const raw = game.board.reduce((s, u) => s + u.atk, 0);
    const powered = Math.round(raw * (1 + game.bonus));
    const enemy = game.enemyPower;
    const won = powered >= enemy;
    game.result = { raw, powered, enemy, won };
    game.over = true;
    game.phase = "result";
    if (won) {
      saveProgress(ctx, {
        chessWave: game.wave + 1,
        chessWins: progressOf(ctx).chessWins + 1
      });
      game.log = "승리! Wave " + game.wave + " 클리어 → Wave " + (game.wave + 1) +
        " (아군 " + powered + " vs 적 " + enemy + ")";
      if (ctx.addXp) ctx.addXp(15);
    } else {
      game.log = "패배… Wave " + game.wave + "에서 재도전하세요. 아군 " + powered + " vs 적 " + enemy;
    }
    return game;
  }

  function playCard(game, word, ctx) {
    if (game.over) return game;
    if (!game.hand.includes(word) || game.played.includes(word)) return game;
    const idx = game.played.length;
    game.hand = game.hand.filter((w) => w !== word);
    game.played = game.played.concat([word]);
    if (game.correct[idx] !== word) {
      game.hp = Math.max(0, game.hp - 5);
      game.combo = 0;
      game.log = "순서가 틀렸습니다. 자해 -5";
      if (game.hp <= 0) {
        game.over = true;
        game.won = false;
        game.log = "HP 소진. 같은 구절에서 다시 도전하세요.";
      }
      return game;
    }
    game.combo += 1;
    const dmg = 4 + game.combo * 2;
    game.enemy = Math.max(0, game.enemy - dmg);
    game.log = "콤보 ×" + game.combo + "! 피해 " + dmg;
    if (game.enemy <= 0) {
      game.over = true;
      game.won = true;
      const nextIndex = game.cardsIndex + 1;
      saveProgress(ctx, {
        cardsIndex: nextIndex,
        cardsWins: progressOf(ctx).cardsWins + 1
      });
      game.log = "적 HP 0. " + game.ref + " 클리어 → 다음 구절 #" + (nextIndex + 1);
      if (ctx.addXp) ctx.addXp(18);
      return game;
    }
    if (game.played.length >= game.correct.length) {
      const list = poolFor("cards", ctx);
      const nextVerse = list[(game.cardsIndex + 1) % Math.max(1, list.length)] || pickVerses(list, 1, true, ctx.cards, game.cardsIndex)[0];
      const pack = fragmentHand(nextVerse, ctx.E, ctx.E.hash((nextVerse.id || nextVerse.ref) + ":next:" + game.cardsIndex));
      game.verseId = pack.id;
      game.ref = pack.ref;
      game.correct = pack.correct;
      game.hand = pack.hand;
      game.played = [];
      game.combo = Math.max(0, game.combo - 1);
      game.log += " · 이어서 " + pack.ref;
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
      if (action === "spire-relic") return pickRelic(game, payload.id);
      return game;
    }
    if (game.kind === "chess") {
      if (action === "chess-place") return placeChess(game, payload.id);
      if (action === "chess-unplace") return unplaceChess(game, payload.index);
      if (action === "chess-fight") return fightChess(game, ctx);
      return game;
    }
    if (game.kind === "cards") {
      if (action === "cards-play") return playCard(game, payload.word, ctx);
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
          ? "서로 다른 빈칸 " + b.answers.length + "개를 조사까지 정확히 고르세요. 남은 " + b.pending.length + "칸."
          : "빈칸을 개역한글 그대로(조사 포함) 고르면 피해. 틀리면 반격.") +
        '</p><p class="scripture game-prompt">' + esc(b.prompt) + '</p><div class="row wrap">' +
        b.choices.map((c) => '<button class="btn" type="button" data-act="spire-answer" data-choice="' + esc(c) + '">' + esc(c) + "</button>").join("") +
        "</div></article>";
    } else if (game.phase === "relic" && game.relicChoices) {
      body = '<article class="card"><h3>유물 선택</h3><div class="game-lobby">' +
        game.relicChoices.map((r) => '<button class="card game-pick" type="button" data-act="spire-relic" data-id="' + esc(r.id) + '"><strong>' + esc(r.name) + "</strong><p class=\"muted\">" + esc(r.desc) + "</p></button>").join("") +
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
      '<div class="game-stats"><span><b>' + game.power + "</b><small>암기력</small></span><span><b>" + game.relics.length + "</b><small>유물</small></span></div></div>" +
      '<p class="game-log">' + esc(game.log) + "</p>" + body +
      '<p class="row"><button class="btn ghost" type="button" data-act="game-back">로비로</button></p></div>';
  }

  function chessHtml(game) {
    const cells = [];
    for (let i = 0; i < 8; i++) {
      const u = game.board[i];
      cells.push(u
        ? '<button type="button" class="chess-cell filled" data-act="chess-unplace" data-index="' + i + '"><strong>' + esc(u.name) + "</strong><small>ATK " + u.atk + (u.mastered ? " · 암기" : "") + "</small></button>"
        : '<div class="chess-cell">+</div>');
    }
    return '<div class="game-shell"><div class="game-top"><p class="eyebrow">성경전서 오토체스 · Wave ' + game.wave + "</p>" +
      '<span class="pill ok">암기 보너스 +' + Math.round(game.bonus * 100) + "%</span></div>" +
      '<p class="muted">적 전투력 ' + game.enemyPower + " · 이기면 Wave " + (game.wave + 1) + "로 진행</p>" +
      '<p class="game-log">' + esc(game.log) + "</p>" +
      '<div class="chess-board">' + cells.join("") + "</div>" +
      (game.phase === "place"
        ? '<p class="muted">벤치 · 성경전서 핵심어 유닛</p><div class="row wrap">' +
          game.bench.map((u) => '<button class="btn" type="button" data-act="chess-place" data-id="' + esc(u.id) + '">' + esc(u.name) + " · " + u.atk + "</button>").join("") +
          '</div><p style="margin-top:14px"><button class="btn gold" type="button" data-act="chess-fight">전투 시작 (자동)</button></p>'
        : '<article class="card"><h3>' + (game.result && game.result.won ? "승리 · 다음 Wave" : "패배 · 같은 Wave") + "</h3><p>아군 전투력 " +
          (game.result ? game.result.powered : 0) + " / 적 " + (game.result ? game.result.enemy : 0) +
          '</p><p><button class="btn gold" type="button" data-act="game-retry">다시</button> <button class="btn" type="button" data-act="game-back">로비</button></p></article>') +
      '<p class="row"><button class="btn ghost" type="button" data-act="game-back">로비로</button></p></div>';
  }

  function cardsHtml(game) {
    return '<div class="game-shell"><div class="game-top"><div><p class="eyebrow">성경전서 카드 로그 · ' + esc(game.ref || game.verseId) +
      "</p>" + hpBar(game.hp, game.maxHp || 30, "내 HP") + "</div>" +
      '<div class="game-stats"><span><b>×' + game.combo + "</b><small>콤보</small></span></div></div>" +
      hpBar(game.enemy, game.maxEnemy || game.enemy, "적 HP") +
      '<p class="game-log">' + esc(game.log) + "</p>" +
      '<div class="card-field"><p class="muted">필드 (순서대로 제출)</p><div class="row wrap">' +
      (game.played.length ? game.played.map((c) => '<span class="pill">' + esc(c) + "</span>").join("") : '<span class="faint">카드를 내세요</span>') +
      "</div></div>" +
      '<p class="muted">손패 · 구절 조각 카드</p><div class="row wrap">' +
      game.hand.map((c) => '<button class="btn" type="button" data-act="cards-play" data-word="' + esc(c) + '"' + (game.over ? " disabled" : "") + ">" + esc(c) + "</button>").join("") +
      "</div>" +
      '<article class="card" style="margin-top:16px"><p class="muted">올바른 구절 순서면 콤보 피해. 틀리면 자해. 이기면 다음 구절로 진행합니다.</p>' +
      (game.over ? '<p><button class="btn gold" type="button" data-act="game-retry">' + (game.won ? "다음 구절" : "다시 도전") + '</button> <button class="btn" type="button" data-act="game-back">로비</button></p>' : "") +
      "</article>" +
      '<p class="row"><button class="btn ghost" type="button" data-act="game-back">로비로</button></p></div>';
  }

  function html(game, ctx) {
    if (!game) return lobbyHtml(ctx);
    if (game.kind === "spire") return spireHtml(game);
    if (game.kind === "chess") return chessHtml(game);
    if (game.kind === "cards") return cardsHtml(game);
    return lobbyHtml(ctx);
  }

  root.LampGames = {
    lobbyHtml,
    start,
    act,
    html,
    KEYWORDS: REV_KEYWORDS,
    BIBLE_KEYWORDS,
    RELICS,
    exactFill,
    clozeRound
  };
})(typeof window !== "undefined" ? window : globalThis);

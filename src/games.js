(function (root) {
  const RELICS = [
    { id: "scroll", name: "두루마리", desc: "암기력 +4", apply: (g) => { g.power += 4; } },
    { id: "lamp", name: "작은 등잔", desc: "전투 피해 +3", apply: (g) => { g.bonusDmg += 3; } },
    { id: "seal", name: "일곱째 인", desc: "최대 HP +12", apply: (g) => { g.maxHp += 12; g.hp = Math.min(g.maxHp, g.hp + 12); } },
    { id: "crown", name: "흰 면류관", desc: "오답 피해 -3", apply: (g) => { g.mitigate += 3; } },
    { id: "trumpet", name: "금 나팔", desc: "보스 피해 +5", apply: (g) => { g.bossBonus += 5; } }
  ];

  const KEYWORDS = [
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

  function knownBonus(cards, list) {
    if (!cards) return 0;
    const known = list.filter((v) => (cards[v.id]?.stage || 0) >= 3).length;
    return Math.min(0.35, known / Math.max(1, list.length));
  }

  function pickVerses(list, n, preferKnown, cards) {
    const pool = list.slice();
    if (preferKnown && cards) {
      pool.sort((a, b) => {
        const ka = (cards[a.id]?.stage || 0) >= 3 ? 1 : 0;
        const kb = (cards[b.id]?.stage || 0) >= 3 ? 1 : 0;
        return kb - ka;
      });
    }
    return shuffle(pool.slice(0, Math.max(n * 3, n)), Date.now() % 9973).slice(0, n);
  }

  function clozeBattle(verse, E) {
    const units = E.pickCloze(verse.text, 1, E.hash(verse.id + ":game:" + Date.now()));
    const unit = units[0] || null;
    if (!unit) {
      const w = E.words(verse.text);
      const idx = Math.min(2, w.length - 1);
      const answer = w[idx];
      const distractors = shuffle(w.filter((x, i) => i !== idx && x.length > 1), E.hash(verse.id)).slice(0, 2);
      while (distractors.length < 2) distractors.push(["아멘", "시작", "증거"][distractors.length]);
      return {
        id: verse.id,
        prompt: w.map((t, i) => (i === idx ? "____" : t)).join(" "),
        answer,
        choices: shuffle([answer].concat(distractors), E.hash(answer + verse.id))
      };
    }
    const words = E.words(verse.text);
    const prompt = words.map((w, i) => (i >= unit.i && i < unit.j ? (i === unit.i ? "____" : "") : w)).filter(Boolean).join(" ");
    const wrong = shuffle(
      words.filter((w) => E.normalize(w) !== E.normalize(unit.answer) && w.length > 1),
      E.hash(verse.id + "bank")
    ).slice(0, 2);
    while (wrong.length < 2) wrong.push(["아멘", "시작", "증거"][wrong.length]);
    return {
      id: verse.id,
      prompt,
      answer: unit.answer,
      choices: shuffle([unit.answer].concat(wrong), E.hash(unit.answer + verse.id))
    };
  }

  function fragmentHand(verse, E) {
    const w = E.words(verse.text);
    const take = Math.min(5, Math.max(3, w.length));
    const correct = w.slice(0, take);
    return { id: verse.id, correct, hand: shuffle(correct, E.hash(verse.id + ":hand:" + Date.now())) };
  }

  function unitsFromMemory(list, cards) {
    const found = [];
    const textBlob = list.map((v) => v.text).join(" ");
    KEYWORDS.forEach((kw) => {
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
      ["증인", "등잔", "별", "문"].forEach((name, i) => {
        if (found.length >= 6) return;
        if (!found.some((u) => u.name === name)) found.push({ name, atk: 2 + i, mastered: false, id: name });
      });
    }
    return found.slice(0, 8);
  }

  function lobbyHtml() {
    return '<p class="eyebrow">암송 놀이</p><h1>미니게임 세 가지</h1><p class="lede">외운 구절로 싸우고, 핵심어를 배치하고, 조각 카드로 콤보를 만듭니다. 첫 플레이 가능 버전입니다.</p>' +
      '<div class="game-lobby">' +
      '<article class="card game-pick"><p class="eyebrow">노드 로그라이크</p><h3>계시록 슬레이</h3><p class="muted">맵을 따라가며 암송 전투·유물·장 보스를 만납니다. 빈칸을 맞히면 피해, 틀리면 반격.</p><button class="btn gold" type="button" data-act="game-start" data-game="spire">입장</button></article>' +
      '<article class="card game-pick"><p class="eyebrow">오토배틀러</p><h3>성구 오토체스</h3><p class="muted">외운 핵심어가 유닛이 됩니다. 보드에 놓고 전투를 시작하면 자동으로 싸웁니다.</p><button class="btn gold" type="button" data-act="game-start" data-game="chess">입장</button></article>' +
      '<article class="card game-pick"><p class="eyebrow">카드 로그</p><h3>묵시록 카드 로그</h3><p class="muted">구절 조각 카드를 올바른 순서로 내어 콤보 피해를 줍니다. 틀리면 자해합니다.</p><button class="btn gold" type="button" data-act="game-start" data-game="cards">입장</button></article>' +
      "</div>";
  }

  function start(kind, ctx) {
    const E = ctx.E;
    const list = ctx.list;
    const cards = ctx.cards || {};
    if (kind === "spire") {
      const nodes = [
        { id: "start", label: "시작", type: "start", done: true },
        { id: "fight1", label: "암송 전투", type: "fight", done: false },
        { id: "relic", label: "유물", type: "relic", done: false },
        { id: "elite", label: "복습 엘리트", type: "elite", done: false },
        { id: "boss", label: "1장 보스", type: "boss", done: false }
      ];
      return {
        kind: "spire",
        floor: 1,
        hp: 48,
        maxHp: 48,
        power: 12,
        bonusDmg: 0,
        mitigate: 0,
        bossBonus: 0,
        relics: [],
        nodes,
        cursor: 1,
        phase: "map",
        battle: null,
        relicChoices: null,
        log: "길을 고르세요. 다음 노드는 암송 전투입니다.",
        over: false,
        won: false
      };
    }
    if (kind === "chess") {
      const bench = unitsFromMemory(list, cards);
      return {
        kind: "chess",
        phase: "place",
        bench,
        board: [],
        enemyPower: 14 + Math.floor(knownBonus(cards, list) * 10),
        bonus: knownBonus(cards, list),
        log: "벤치 유닛을 보드에 배치한 뒤 전투를 시작하세요.",
        result: null,
        over: false
      };
    }
    const verse = pickVerses(list.filter((v) => v.chapter === 1), 1, true, cards)[0] || list[0];
    const pack = fragmentHand(verse, E);
    return {
      kind: "cards",
      hp: 30,
      enemy: 22,
      verseId: pack.id,
      correct: pack.correct,
      hand: pack.hand,
      played: [],
      combo: 0,
      log: "손패를 올바른 구절 순서로 내세요. 맞으면 콤보 피해.",
      over: false,
      won: false
    };
  }

  function openSpireNode(game, ctx) {
    const node = game.nodes[game.cursor];
    if (!node || game.over) return game;
    const E = ctx.E;
    const list = ctx.list;
    const cards = ctx.cards || {};
    if (node.type === "relic") {
      game.phase = "relic";
      game.relicChoices = shuffle(RELICS, Date.now() % 5000).slice(0, 3);
      game.log = "유물 하나를 고르세요.";
      return game;
    }
    const chapterPool = node.type === "boss"
      ? list.filter((v) => v.chapter === 1)
      : list.slice(0, 40);
    const verse = pickVerses(chapterPool, 1, true, cards)[0] || list[0];
    game.phase = "battle";
    game.battle = Object.assign(clozeBattle(verse, E), {
      kind: node.type,
      enemyHp: node.type === "boss" ? 28 : node.type === "elite" ? 18 : 12
    });
    game.log = (node.type === "boss" ? "장 보스 · " : node.type === "elite" ? "엘리트 · " : "전투 · ") +
      "계시록 " + verse.id;
    return game;
  }

  function answerSpire(game, choice, ctx) {
    if (!game.battle || game.over) return game;
    const battle = game.battle;
    const ok = root.LampEngine.normalize(choice) === root.LampEngine.normalize(battle.answer);
    const base = game.power + game.bonusDmg + (battle.kind === "boss" ? game.bossBonus : 0);
    if (ok) {
      battle.enemyHp = Math.max(0, battle.enemyHp - Math.max(4, Math.round(base * 0.7)));
      game.log = "맞았습니다! 피해 " + Math.max(4, Math.round(base * 0.7));
      if (battle.enemyHp <= 0) {
        const node = game.nodes[game.cursor];
        node.done = true;
        game.battle = null;
        if (node.type === "boss") {
          game.over = true;
          game.won = true;
          game.phase = "map";
          game.log = "1장 보스를 쓰러뜨렸습니다. Floor 클리어!";
          if (ctx.addXp) ctx.addXp(25);
          return game;
        }
        game.cursor += 1;
        game.phase = "map";
        game.log = node.label + " 클리어. 다음 노드로 가세요.";
        return game;
      }
      // next blank from same or new verse
      const list = ctx.list;
      const verse = list.find((v) => v.id === battle.id) || pickVerses(list, 1, true, ctx.cards)[0];
      const next = clozeBattle(verse, ctx.E);
      game.battle = Object.assign(next, { kind: battle.kind, enemyHp: battle.enemyHp });
      return game;
    }
    const hit = Math.max(4, 8 - game.mitigate);
    game.hp = Math.max(0, game.hp - hit);
    game.log = "틀렸습니다. 적 반격 -" + hit + " (정답: " + battle.answer + ")";
    if (game.hp <= 0) {
      game.over = true;
      game.won = false;
      game.phase = "map";
      game.battle = null;
      game.log = "HP가 바닥났습니다. 다시 도전해 보세요.";
    }
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
    game.log = won
      ? "승리! 아군 " + powered + " vs 적 " + enemy + " (암기 보너스 +" + Math.round(game.bonus * 100) + "%)"
      : "패배… 아군 " + powered + " vs 적 " + enemy + ". 더 많은 절을 외우면 유닛이 강해집니다.";
    if (won && ctx.addXp) ctx.addXp(15);
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
        game.log = "HP 소진. 다시 도전해 보세요.";
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
      game.log = "적 HP 0. 구절 콤보로 이겼습니다!";
      if (ctx.addXp) ctx.addXp(18);
      return game;
    }
    if (game.played.length >= game.correct.length) {
      // deal leftover and refresh hand from next verse
      const nextVerse = pickVerses(ctx.list, 1, true, ctx.cards)[0];
      const pack = fragmentHand(nextVerse, ctx.E);
      game.verseId = pack.id;
      game.correct = pack.correct;
      game.hand = pack.hand;
      game.played = [];
      game.combo = Math.max(0, game.combo - 1);
      game.log += " · 다음 구절 계시록 " + pack.id;
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
      body = '<article class="card"><h3>전투 · 계시록 ' + esc(game.battle.id) +
        '</h3><p class="muted">빈칸을 채우면 피해. 틀리면 적 반격. 적 HP ' + game.battle.enemyHp +
        '</p><p class="scripture game-prompt">' + esc(game.battle.prompt) + '</p><div class="row wrap">' +
        game.battle.choices.map((c) => '<button class="btn" type="button" data-act="spire-answer" data-choice="' + esc(c) + '">' + esc(c) + "</button>").join("") +
        "</div></article>";
    } else if (game.phase === "relic" && game.relicChoices) {
      body = '<article class="card"><h3>유물 선택</h3><div class="game-lobby">' +
        game.relicChoices.map((r) => '<button class="card game-pick" type="button" data-act="spire-relic" data-id="' + esc(r.id) + '"><strong>' + esc(r.name) + "</strong><p class=\"muted\">" + esc(r.desc) + "</p></button>").join("") +
        "</div></article>";
    } else {
      body = '<article class="card spire-map">' + nodes +
        (game.over
          ? '<p><button class="btn gold" type="button" data-act="game-retry">다시 도전</button> <button class="btn" type="button" data-act="game-back">로비</button></p>'
          : '<p><button class="btn gold" type="button" data-act="spire-enter">' + (game.nodes[game.cursor] ? game.nodes[game.cursor].label + " 들어가기" : "계속") + "</button></p>") +
        "</article>";
    }
    return '<div class="game-shell"><div class="game-top"><p class="eyebrow">계시록 슬레이 · Floor ' + game.floor +
      '</p><div class="game-stats"><span><b>' + game.hp + "</b><small>HP</small></span><span><b>" + game.power +
      "</b><small>암기력</small></span><span><b>" + game.relics.length + "</b><small>유물</small></span></div></div>" +
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
    return '<div class="game-shell"><div class="game-top"><p class="eyebrow">성구 오토체스</p>' +
      '<span class="pill ok">암기 보너스 +' + Math.round(game.bonus * 100) + "%</span></div>" +
      '<p class="game-log">' + esc(game.log) + "</p>" +
      '<div class="chess-board">' + cells.join("") + "</div>" +
      (game.phase === "place"
        ? '<p class="muted">벤치 · 외운 핵심어 유닛</p><div class="row wrap">' +
          game.bench.map((u) => '<button class="btn" type="button" data-act="chess-place" data-id="' + esc(u.id) + '">' + esc(u.name) + " · " + u.atk + "</button>").join("") +
          '</div><p style="margin-top:14px"><button class="btn gold" type="button" data-act="chess-fight">전투 시작 (자동)</button></p>'
        : '<article class="card"><h3>' + (game.result && game.result.won ? "승리" : "패배") + "</h3><p>아군 전투력 " +
          (game.result ? game.result.powered : 0) + " / 적 " + (game.result ? game.result.enemy : 0) +
          '</p><p><button class="btn gold" type="button" data-act="game-retry">다시</button> <button class="btn" type="button" data-act="game-back">로비</button></p></article>') +
      '<p class="row"><button class="btn ghost" type="button" data-act="game-back">로비로</button></p></div>';
  }

  function cardsHtml(game) {
    return '<div class="game-shell"><div class="game-top"><p class="eyebrow">묵시록 카드 로그 · 계시록 ' + esc(game.verseId) +
      '</p><div class="game-stats"><span><b>' + game.hp + "</b><small>내 HP</small></span><span><b>" + game.enemy +
      "</b><small>적 HP</small></span><span><b>×" + game.combo + "</b><small>콤보</small></span></div></div>" +
      '<p class="game-log">' + esc(game.log) + "</p>" +
      '<div class="card-field"><p class="muted">필드 (순서대로 제출)</p><div class="row wrap">' +
      (game.played.length ? game.played.map((c) => '<span class="pill">' + esc(c) + "</span>").join("") : '<span class="faint">카드를 내세요</span>') +
      "</div></div>" +
      '<p class="muted">손패 · 구절 조각 카드</p><div class="row wrap">' +
      game.hand.map((c) => '<button class="btn" type="button" data-act="cards-play" data-word="' + esc(c) + '"' + (game.over ? " disabled" : "") + ">" + esc(c) + "</button>").join("") +
      "</div>" +
      '<article class="card" style="margin-top:16px"><p class="muted">올바른 구절 순서면 콤보 피해. 틀린 카드는 자해합니다.</p>' +
      (game.over ? '<p><button class="btn gold" type="button" data-act="game-retry">다시 도전</button> <button class="btn" type="button" data-act="game-back">로비</button></p>' : "") +
      "</article>" +
      '<p class="row"><button class="btn ghost" type="button" data-act="game-back">로비로</button></p></div>';
  }

  function html(game) {
    if (!game) return lobbyHtml();
    if (game.kind === "spire") return spireHtml(game);
    if (game.kind === "chess") return chessHtml(game);
    if (game.kind === "cards") return cardsHtml(game);
    return lobbyHtml();
  }

  root.LampGames = { lobbyHtml, start, act, html, KEYWORDS, RELICS };
})(typeof window !== "undefined" ? window : globalThis);

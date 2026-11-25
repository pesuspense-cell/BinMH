const fs = require("fs");
const vm = require("vm");
const bible = require("./src/revelation.json");
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync("./src/engine.js", "utf8"), sandbox);
const E = sandbox.LampEngine;
const list = E.flatten(bible);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(list.length === 404, "verse count " + list.length);
assert(list[0].text.startsWith("예수 그리스도의 계시라"), "1:1");
assert(list.find((v) => v.id === "22:21").text.includes("있을찌어다"), "22:21 spelling");
assert(E.similarity("볼찌어다 내가 문밖에", "볼찌어다 내가 문밖에") === 1, "same");
assert(E.similarity("볼 찌 어 다", "볼찌어다") === 1, "spaces");
assert(E.similarity("다른 문장입니다", list[0].text) < 0.5, "different");
assert(E.similarity("볼지어다", "볼찌어다") < 1, "typed spelling stays strict");
assert(E.spokenSimilarity("볼지어다", "볼찌어다") === 1, "spoken 찌");
assert(E.spokenSimilarity("그를 지른", "그를 찌른") < 1, "찌르다 stays");
assert(E.spokenSimilarity("하나님을 위해", "하나님을 위하여") === 1, "spoken 하여");
assert(E.spokenSimilarity("증거했느니라", "증거하였느니라") === 1, "spoken 하였");
const verse17 = list.find((v) => v.id === "1:7").text;
assert(E.spokenSimilarity(verse17.replace("볼찌어다", "볼지어다").replace("인하여", "인해"), verse17) === 1, "spoken verse");
assert(E.toClassic("볼지어다", "볼찌어다") === "볼찌어다", "classic 찌");
assert(E.toClassic("하나님을 위해", "하나님을 위하여") === "하나님을 위하여", "classic 하여");
assert(E.toClassic("주 하나님이 가라사대 나는 알파와 오메가다", "주 하나님이 가라사대 나는 알파와 오메가라") === "주 하나님이 가라사대 나는 알파와 오메가라", "classic near miss");
assert(E.toClassic("주 사람이 가라사대", "주 하나님이 가라사대") === "주 사람이 가라사대", "classic keeps a different word");
const verse12Text = list.find((v) => v.id === "1:2").text;
assert(E.toClassic("요하는 하나님의 말씀을 과 예수 그리스도의 증거고 자기의 본 것을 다 증거하였느니라", verse12Text) === verse12Text, "classic merges heard words " + E.toClassic("요하는 하나님의 말씀을 과 예수 그리스도의 증거고 자기의 본 것을 다 증거하였느니라", verse12Text));
const slots = E.alignHeard("요한은 하나님의 말씀과 예수 그리스도의 증거 곧", verse12Text);
assert(slots[2] === "말씀과" && slots[0] === "요한은" && slots[11] === "", "align slots " + slots.join("|"));

const card = E.applySrs(E.blankCard("2026-11-04"), 5, "2026-11-04");
assert(card.interval === 1 && card.due === "2026-11-05" && card.reps === 1, "srs first " + JSON.stringify(card));
const second = E.applySrs(card, 4, "2026-11-05");
assert(second.interval === 3 && second.due === "2026-11-08", "srs second " + JSON.stringify(second));
const failed = E.applySrs(second, 1, "2026-11-08");
assert(failed.reps === 0 && failed.due === "2026-11-08" && failed.lapses === 1, "srs fail");

const chunks = E.chunksOf(list[0].text);
assert(chunks[0] === "예수 그리스도의 계시라", "1:1 first chunk " + chunks[0]);
assert(chunks.includes("반드시 속히 될 일을") && chunks.includes("그 종들에게 보이시려고"), "1:1 keeps 될 일을 " + chunks.join(" / "));
assert(chunks.join(" ") === list[0].text, "chunks join");
const verse12 = list.find((v) => v.id === "1:2").text;
assert(E.chunksOf(verse12).join(" / ") === "요한은 하나님의 말씀과 / 예수 그리스도의 증거 / 곧 자기의 본 것을 / 다 증거하였느니라", "1:2 phrases " + E.chunksOf(verse12).join(" / "));
const verse1212 = list.find((v) => v.id === "1:12").text;
assert(E.chunksOf(verse1212).some((part) => part.includes("알아 보려고")), "1:12 keeps 알아 보려고");
[
  ["1:9", "나 요한은 너희 형제요"],
  ["2:8", "죽었다가 살아나신 이가 가라사대"],
  ["3:5", "이와 같이 흰 옷을 입을 것이요"],
  ["9:11", "헬라 음으로 이름은 아볼루온이더라"],
  ["13:4", "가로되 누가 이 짐승과 같으뇨"],
  ["22:17", "성령과 신부가 말씀하시기를 오라 하시는도다"]
].forEach(([id, part]) => {
  const parts = E.chunksOf(list.find((v) => v.id === id).text);
  assert(parts.includes(part), id + " chunk " + parts.join(" / "));
});
list.forEach((verse) => {
  const parts = E.chunksOf(verse.text);
  assert(parts.join(" ") === E.words(verse.text).join(" "), "join " + verse.id);
  parts.forEach((part) => {
    const size = part.split(" ").length;
    assert(size <= 9, "chunk too long " + verse.id + " " + part);
    assert(!/(?:의|그|각|모든|큰)$/.test(part), "dangling modifier " + verse.id + " " + part);
  });
});
const light = /^(?:은|는|이|가|을|를|의|또|그|곧|것이라|하시더라|하더라|아멘|자요|자라|가로되|가라사대)$/;
list.forEach((verse) => {
  const w = E.words(verse.text);
  [0, 1, 2].forEach((level) => {
    [3, 9, 27].forEach((seed) => {
      const units = E.pickCloze(verse.text, level, seed);
      const answers = units.map((u) => E.normalize(u.answer));
      assert(new Set(answers).size === answers.length, "dup blank " + verse.id);
      units.forEach((u, k) => {
        assert(u.j > u.i && (k === 0 || units[k - 1].j <= u.i), "overlap " + verse.id);
        const joined = u.before + u.answer + u.after;
        assert(E.normalize(joined) === E.normalize(w.slice(u.i, u.j).join("")), "unit text " + verse.id + " " + joined);
        if (w.length >= 6) assert(!light.test(u.answer), "light blank " + verse.id + " " + u.answer);
      });
    });
  });
});
const units11 = E.clozeUnits(list[0].text);
assert(units11.some((u) => u.answer === "예수 그리스도" && u.after === "의"), "1:1 keeps 의 " + JSON.stringify(units11));
assert(units11.some((u) => u.answer === "계시" && u.after === "라"), "1:1 계시 " + JSON.stringify(units11));
const cloze11 = E.pickCloze(list[0].text, 0, 5);
assert(cloze11.length >= 4, "1:1 blanks " + cloze11.length);
const picked11 = new Set();
for (let seed = 1; seed <= 20; seed++) E.pickCloze(list[0].text, 0, seed).forEach((u) => picked11.add(u.answer));
assert(picked11.has("예수 그리스도") && picked11.has("하나님"), "1:1 key words get picked");
assert(E.pickCloze(list[0].text, 2, 5).length >= cloze11.length, "deeper level blanks more");
const unit1220 = E.clozeUnits(list.find((v) => v.id === "1:12").text);
assert(unit1220.some((u) => u.answer === "일곱 금 촛대" && u.after === "를"), "1:12 phrase unit");
assert(!E.clozeUnits(list.find((v) => v.id === "1:1").text).some((u) => u.kind === "number"), "천사 is not a number");
assert(E.chosung("예수 그리스도") === "ㅇㅅ ㄱㄹㅅㄷ", "chosung");
assert(E.skeleton(list[0].text).startsWith("예· 그·"), "skeleton first letters");
const locChoices = E.distractorChoices(list, "1:7", 4, 11);
assert(locChoices.length === 4 && locChoices.includes("1:7"), "locate choices include target");
assert(new Set(locChoices).size === 4, "locate choices unique");

for (let seed = 1; seed <= 200; seed++) {
  const ids = [0, 1, 2, 3, 4];
  const mixed = E.scramble(ids, seed);
  assert(mixed.slice().sort().join() === ids.join(), "scramble keeps items");
  assert(mixed.every((v, k) => v !== k), "scramble fixed point " + mixed.join());
}
const firsts = new Set();
for (let seed = 1; seed <= 60; seed++) firsts.add(E.scramble([0, 1, 2, 3, 4, 5], seed)[0]);
assert(firsts.size >= 4, "scramble varies first item");

for (let chapter = 1; chapter <= 22; chapter++) {
  const qs = E.buildChapterQuestions(list, chapter, 3, 4);
  assert(qs.length >= 2, "chapter " + chapter + " questions");
  qs.filter((q) => q.kind === "order").forEach((q) => {
    const phrases = q.items.map((item) => item.phrase);
    assert(new Set(phrases).size === phrases.length, "dup phrase ch " + chapter);
    assert(q.items.length >= 2, "order size");
    assert(q.bank.length === q.items.length && q.bank.slice().sort().join() === q.items.map((item) => item.id).sort().join(), "order bank " + chapter);
    assert(q.bank.join() !== q.items.map((item) => item.id).join(), "order bank shuffled " + chapter);
  });
}

const daily = E.buildDailyQuestions(list, ["1:1", "1:2", "1:3", "1:4", "1:5"], 9);
assert(daily.some((q) => q.kind === "full" || q.kind === "blanks"), "daily production");
assert(daily.some((q) => q.kind === "order"), "daily order");
const fullQ = daily.find((q) => q.kind === "full");
const fullVerse = list.find((v) => v.id === fullQ.id);
assert(E.grade(fullQ, { text: fullVerse.text }, list).pass, "full grade");
const blankQ = daily.find((q) => q.kind === "blanks");
const blankVerse = list.find((v) => v.id === blankQ.id);
const given = {};
const withParticle = {};
blankQ.units.forEach((unit, n) => {
  given[n] = unit.answer;
  withParticle[n] = unit.answer + unit.after;
});
assert(blankVerse && E.grade(blankQ, { blanks: given }, list).pass, "blank grade");
assert(E.grade(blankQ, { blanks: withParticle }, list).pass, "blank grade with particle");
const hinted = E.grade(blankQ, { blanks: given, hinted: true }, list);
assert(hinted.pass && hinted.score < 1, "hint lowers score");
assert(!E.grade(blankQ, { blanks: {} }, list).pass, "empty blanks fail");
assert(E.heardFit("예수 그리스도의 계시라", list[0].text) > E.heardFit("예수 그리스도의 게시판", list[0].text), "heard fit");

const rec = E.recommend(list, {}, "2026-11-04");
assert(rec.id === "1:1", "recommend first " + rec.id);
const diff = E.wordDiff("예수 그리스도의 계시", list[0].text);
assert(diff.some((part) => part.type === "miss"), "diff miss");
assert(diff.some((part) => part.type === "ok"), "diff ok");

const whole = JSON.parse(fs.readFileSync("./src/bible.json", "utf8"));
const bibleBox = { fetch: async () => ({ ok: true, json: async () => whole }) };
bibleBox.window = bibleBox;
vm.createContext(bibleBox);
vm.runInContext(fs.readFileSync("./src/bible.js", "utf8"), bibleBox);
const BB = bibleBox.LampBible;
assert(whole.length === 66 && whole.flat(2).length === 31103, "bible size");
list.forEach((verse) => assert(whole[65][verse.chapter - 1][verse.verse - 1] === verse.text, "revelation matches bible " + verse.id));

BB.load().then(() => {
  const label = (raw) => { const ref = BB.parseRef(raw); return ref ? BB.label(ref) : null; };
  assert(label("요 3:16") === "요한복음 3:16", "john ref");
  assert(label("요한복음 3장 16절") === "요한복음 3:16", "john words ref");
  assert(label("요한1서 4:8") === "요한일서 4:8", "1john ref");
  assert(label("고전 13:4~7") === "고린도전서 13:4-7", "range ref");
  assert(label("시 23") === "시편 23장", "chapter ref");
  assert(label("21:4") === "요한계시록 21:4", "bare ref is revelation");
  assert(label("요 30:1") === null && label("사랑") === null, "bad refs");
  assert(BB.label(BB.keyToRef("21:4")) === "요한계시록 21:4", "old journal key");
  assert(BB.search("독생자").total === 5, "search 독생자");
  assert(BB.search("여호와는 나의 목자").hits[0].book === 19, "search phrase");
  assert(BB.search("요한복음 사랑").hits.every((hit) => hit.book === 43), "search within book");

  const gameBox = {};
  vm.createContext(gameBox);
  gameBox.LampEngine = E;
  vm.runInContext(fs.readFileSync("./src/games.js", "utf8"), gameBox);
  const G = gameBox.LampGames;
  const bibleList = BB.flatList();
  const cardPool = G.filterCardPool(bibleList);
  assert(cardPool.length === bibleList.length, "card pool is entire bible " + cardPool.length);
  assert(cardPool.length > 30000, "card whole-bible pool size " + cardPool.length);
  assert(cardPool.every((v) => G.verseAllowedForCards(v)), "card pool all allowed");
  assert(bibleList.filter((v) => v.book === 1 && v.chapter === 4).every((v) => G.verseAllowedForCards(v)), "gen 4 included");
  assert(bibleList.filter((v) => v.bookName === "레위기" && v.chapter === 1).every((v) => G.verseAllowedForCards(v)), "leviticus included");
  assert(bibleList.filter((v) => v.bookName === "잠언" && v.chapter === 1).every((v) => G.verseAllowedForCards(v)), "proverbs allowed");
  assert(bibleList.filter((v) => v.bookName === "마태복음" && v.chapter === 5).every((v) => G.verseAllowedForCards(v)), "matthew allowed");

  const progress = { spireFloor: 1, cardsIndex: 0, spireWins: 0, cardsWins: 0 };
  const ctx = {
    E,
    list,
    bibleList,
    cards: {},
    progress,
    setProgress: (next) => Object.assign(progress, next || {}),
    addXp: () => {}
  };
  const lobby = G.lobbyHtml(ctx);
  assert(lobby.includes("미니게임 두 가지"), "lobby two games");
  assert(lobby.includes("계시록 슬레이") && lobby.includes("성경전서 카드 로그"), "lobby titles");
  assert(lobby.includes("성경 전서에서 랜덤"), "lobby whole-bible copy");
  assert(!lobby.includes("오토체스") && !lobby.includes('data-game="chess"'), "chess removed");
  assert(!lobby.includes("유물"), "lobby no relics");

  const cards = G.start("cards", ctx);
  assert(cards.kind === "cards" && cards.hint && /힌트/.test(cards.hint), "cards hint");
  assert(/장\s+\d+절/.test(cards.hint) || /장\s+\d+절/.test(cards.ref || ""), "cards hint/ref shows chapter+verse");
  assert(cards.ref && /장/.test(cards.ref) && /절/.test(cards.ref), "cards ref is 책 N장 M절");
  assert(cards.verseText && cards.seenVerseIds.length === 1, "cards tracks seen");
  assert(G.verseAllowedForCards(bibleList.find((v) => v.id === cards.verseId) || { book: Number(String(cards.verseId).split(".")[0]), chapter: Number(String(cards.verseId).split(/[.:]/)[1]) }), "cards verse in whole bible");
  assert(cards.correct.length === G.CARDS_CORRECT, "cards five correct");
  assert(cards.decoys.length === G.CARDS_DECOYS && cards.hand.length === G.CARDS_CORRECT + G.CARDS_DECOYS, "cards decoy hand");
  assert(!("enemy" in cards) && !("maxEnemy" in cards), "cards no enemy HP");
  assert(!G.html(cards, ctx).includes("적 HP"), "cards UI no enemy HP");
  const firstCardId = cards.verseId;
  const hpBeforeWrong = cards.hp;
  const comboBeforeWrong = cards.combo;
  const wrongWord = cards.decoys[0] || cards.correct.slice().reverse()[0];
  G.act(cards, "cards-play", { word: wrongWord }, ctx);
  assert(!cards.over, "cards not soft-locked after wrong play");
  assert(cards.phase === "play" && cards.played.length === 0 && cards.hand.length === cards.correct.length + cards.decoys.length, "cards reclaim after wrong");
  assert(cards.verseId === firstCardId, "cards same verse after reclaim");
  assert(cards.hp === hpBeforeWrong - G.CARDS_WRONG_HP, "cards wrong attempt costs HP");
  assert(cards.combo === comboBeforeWrong, "cards combo persists after wrong while HP > 0");

  const cardsWin = G.start("cards", ctx);
  const hpStart = cardsWin.hp;
  cardsWin.correct.forEach((word) => { G.act(cardsWin, "cards-play", { word }, ctx); });
  assert(cardsWin.won && cardsWin.phase === "reveal" && cardsWin.verseText, "cards reveal on win");
  assert(cardsWin.hp === hpStart, "cards HP persists through verse clear");
  assert(progress.cardsWins === 1, "cards wins independent of combo");
  const comboAfterWin = cardsWin.combo;
  G.act(cardsWin, "cards-continue", {}, ctx);
  assert(cardsWin.phase === "play" && cardsWin.verseId !== firstCardId, "cards advances after win");
  assert(cardsWin.hp === hpStart && cardsWin.combo === comboAfterWin, "cards HP+combo persist to next verse");

  const cardsLose = G.start("cards", ctx);
  cardsLose.hp = G.CARDS_WRONG_HP;
  cardsLose.combo = 7;
  G.act(cardsLose, "cards-play", { word: cardsLose.decoys[0] }, ctx);
  assert(cardsLose.hp === 0 && cardsLose.combo === 0 && cardsLose.phase === "reveal" && !cardsLose.won, "cards HP0 resets combo");

  // Variety across whole bible: successive picks should span multiple books.
  const booksSeen = new Set();
  const varietyCtx = Object.assign({}, ctx, {
    progress: { spireFloor: 1, cardsIndex: 0, spireWins: 0, cardsWins: 0 },
    setProgress: () => {}
  });
  const varietyCards = G.start("cards", varietyCtx);
  for (let i = 0; i < 12; i++) {
    const hit = bibleList.find((v) => v.id === varietyCards.verseId);
    if (hit) booksSeen.add(hit.book);
    varietyCards.correct.forEach((word) => { G.act(varietyCards, "cards-play", { word }, varietyCtx); });
    if (varietyCards.phase === "reveal") G.act(varietyCards, "cards-continue", {}, varietyCtx);
  }
  assert(booksSeen.size >= 2, "cards draws from multiple books in whole-bible pool");

  const spire = G.start("spire", ctx);
  assert(spire.nodes.every((n) => n.type !== "relic") && !("relics" in spire), "spire no relic nodes");
  G.act(spire, "spire-enter", {}, ctx);
  assert(spire.phase === "battle" && spire.battle && spire.seenVerseIds.length >= 1, "spire battle seen");
  const budget = G.problemBudget(spire.nodes[spire.cursor]);
  assert(spire.battle.enemyHp === budget && spire.battle.maxEnemyHp === budget, "spire HP matches problem budget");
  const v1 = G.verseKey(spire.battle.verse);
  const chapters = new Set([spire.battle.verse.chapter]);
  // Answer one blank: HP drops by 1 and next problem uses a different verse.
  const ans = spire.battle.mode === "multi" ? spire.battle.pending[0] : spire.battle.answer;
  const hpBefore = spire.battle.enemyHp;
  G.act(spire, "spire-answer", { choice: ans }, ctx);
  if (spire.phase === "battle" && spire.battle) {
    if (spire.battle.mode === "multi" && spire.battle.pending && spire.battle.pending.length) {
      assert(spire.battle.enemyHp === hpBefore - 1, "spire multi blank deals 1 HP");
      assert(G.verseKey(spire.battle.verse) === v1, "spire same verse until multi blanks done");
    } else {
      assert(spire.battle.enemyHp === hpBefore - 1 || spire.battle.enemyHp === budget - 1, "spire single deals 1 HP");
      assert(G.verseKey(spire.battle.verse) !== v1, "spire next problem different verse within stage");
      chapters.add(spire.battle.verse.chapter);
    }
  }
  if (spire.phase === "map" && !spire.over) {
    G.act(spire, "spire-enter", {}, ctx);
    if (spire.battle) {
      assert(G.verseKey(spire.battle.verse) !== v1, "spire new node different verse");
      chapters.add(spire.battle.verse.chapter);
    }
  }
  // Variety: successive picks across a climb should reach more than one chapter when pool is full Revelation.
  const variety = G.start("spire", ctx);
  const seenCh = new Set();
  for (let i = 0; i < 6; i++) {
    variety.cursor = 1;
    variety.stageSeenVerseIds = [];
    variety.usedFills = [];
    G.act(variety, "spire-enter", {}, ctx);
    if (variety.battle && variety.battle.verse) seenCh.add(variety.battle.verse.chapter);
    variety.nodes[1].done = false;
  }
  assert(seenCh.size >= 2, "spire draws from multiple Revelation chapters");

  console.log("selfcheck ok", list.length, "daily", daily.map((q) => q.kind).join(","), "bible", whole.flat(2).length);
}).catch((err) => { console.error(err); process.exit(1); });

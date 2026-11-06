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
  [3, 9, 27].forEach((seed) => {
    const w = E.words(verse.text);
    const picks = E.pickBlanks(verse.text, 3, seed);
    assert(new Set(picks).size === picks.length, "dup blank " + verse.id);
    picks.forEach((i) => {
      const word = w[i].replace(/[.,]/g, "");
      if (w.length >= 6) assert(!light.test(word), "light blank " + verse.id + " " + word);
    });
  });
});

for (let chapter = 1; chapter <= 22; chapter++) {
  const qs = E.buildChapterQuestions(list, chapter, 3, 4);
  assert(qs.length >= 2, "chapter " + chapter + " questions");
  qs.filter((q) => q.kind === "order").forEach((q) => {
    const phrases = q.items.map((item) => item.phrase);
    assert(new Set(phrases).size === phrases.length, "dup phrase ch " + chapter);
    assert(q.items.length >= 2, "order size");
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
const blankWords = E.words(blankVerse.text);
blankQ.blanks.forEach((index) => { given[index] = blankWords[index]; });
assert(E.grade(blankQ, { blanks: given }, list).pass, "blank grade");

const rec = E.recommend(list, {}, "2026-11-04");
assert(rec.id === "1:1", "recommend first " + rec.id);
const diff = E.wordDiff("예수 그리스도의 계시", list[0].text);
assert(diff.some((part) => part.type === "miss"), "diff miss");
assert(diff.some((part) => part.type === "ok"), "diff ok");

console.log("selfcheck ok", list.length, "daily", daily.map((q) => q.kind).join(","));

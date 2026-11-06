(function (root) {
  const PARTICLES = new Set([
    "은", "는", "이", "가", "을", "를", "에", "의", "와", "과", "도", "로", "으로",
    "께서", "에게", "께", "부터", "까지", "에서", "이나", "나", "또", "및", "곧",
    "그", "저", "내", "너", "제", "한", "수", "것", "등", "곧", "즉", "또", "나"
  ]);

  const CHAPTER_META = [
    { chapter: 1, title: "촛대 사이의 인자", scene: "일곱 금 촛대와 영광스러운 인자. 이 책의 문입니다.", group: "머리" },
    { chapter: 2, title: "에베소에서 두아디라까지", scene: "처음 네 교회에 보내는 편지. 칭찬과 책망, 그리고 이기는 자에게 주시는 약속.", group: "일곱 교회" },
    { chapter: 3, title: "사데에서 라오디게아까지", scene: "남은 세 교회. 문을 두드리시는 음성이 이 장에 있습니다.", group: "일곱 교회" },
    { chapter: 4, title: "하늘의 보좌", scene: "열린 문 너머, 보좌와 이십사 장로와 네 생물.", group: "보좌와 어린 양" },
    { chapter: 5, title: "책을 받으신 어린 양", scene: "봉한 책을 받으실 이는 어린 양뿐입니다.", group: "보좌와 어린 양" },
    { chapter: 6, title: "여섯 인", scene: "말이 나오고 순교자들이 부르짖습니다. 여섯째 인에서 땅이 흔들립니다.", group: "일곱 인" },
    { chapter: 7, title: "인침과 흰 옷 입은 무리", scene: "십사만 사천의 인, 그리고 셀 수 없는 큰 무리.", group: "일곱 인" },
    { chapter: 8, title: "일곱째 인과 네 나팔", scene: "반 시간쯤 고요한 뒤에 나팔이 시작됩니다.", group: "일곱 나팔" },
    { chapter: 9, title: "다섯째와 여섯째 나팔", scene: "무저갱과 유브라데. 그래도 회개하지 않는 사람들.", group: "일곱 나팔" },
    { chapter: 10, title: "작은 책", scene: "힘센 천사와, 먹고 다시 예언하라는 작은 책.", group: "일곱 나팔" },
    { chapter: 11, title: "두 증인과 일곱째 나팔", scene: "두 증인 뒤에, 세상 나라가 우리 주와 그리스도의 나라가 됩니다.", group: "일곱 나팔" },
    { chapter: 12, title: "여자와 용", scene: "해를 입은 여자, 붉은 용, 그리고 광야로 피하는 자리.", group: "표적" },
    { chapter: 13, title: "두 짐승", scene: "바다에서 나온 짐승과 땅에서 나온 짐승, 그 표.", group: "표적" },
    { chapter: 14, title: "시온 산과 추수", scene: "새 노래와 바벨론의 무너짐, 그리고 땅의 추수.", group: "표적" },
    { chapter: 15, title: "유리 바다와 일곱 대접", scene: "모세와 어린 양의 노래, 마지막 재앙을 든 일곱 천사.", group: "일곱 대접" },
    { chapter: 16, title: "일곱 대접", scene: "진노의 대접이 땅과 바다와 공기 가운데 쏟아집니다.", group: "일곱 대접" },
    { chapter: 17, title: "큰 음녀와 짐승", scene: "많은 물 위에 앉은 여자와, 그를 향하게 될 열 뿔.", group: "바벨론" },
    { chapter: 18, title: "바벨론이 무너지다", scene: "한 시간에 황폐해진 성. 그 가운데서 나오라는 부름.", group: "바벨론" },
    { chapter: 19, title: "할렐루야와 흰 말", scene: "혼인 잔치와, 백마를 타신 이의 전쟁.", group: "재림" },
    { chapter: 20, title: "천 년과 백보좌", scene: "용이 결박되고, 생명책이 펴입니다.", group: "재림" },
    { chapter: 21, title: "새 하늘과 새 땅", scene: "눈물을 씻기시고, 새 예루살렘이 하늘에서 내려옵니다.", group: "새 예루살렘" },
    { chapter: 22, title: "주 예수여 오시옵소서", scene: "생명수 강과 마지막 초대. 아멘으로 책을 닫습니다.", group: "새 예루살렘" }
  ];

  const MARKS = {
    "2:1": "에베소",
    "2:8": "서머나",
    "2:12": "버가모",
    "2:18": "두아디라",
    "3:1": "사데",
    "3:7": "빌라델비아",
    "3:14": "라오디게아",
    "6:1": "첫째 인",
    "6:3": "둘째 인",
    "6:5": "셋째 인",
    "6:7": "넷째 인",
    "6:9": "다섯째 인",
    "6:12": "여섯째 인",
    "8:1": "일곱째 인",
    "8:7": "첫째 나팔",
    "8:8": "둘째 나팔",
    "8:10": "셋째 나팔",
    "8:12": "넷째 나팔",
    "9:1": "다섯째 나팔",
    "9:13": "여섯째 나팔",
    "11:15": "일곱째 나팔",
    "16:2": "첫째 대접",
    "16:3": "둘째 대접",
    "16:4": "셋째 대접",
    "16:8": "넷째 대접",
    "16:10": "다섯째 대접",
    "16:12": "여섯째 대접",
    "16:17": "일곱째 대접"
  };

  const LEVELS = [
    "듣는 귀",
    "작은 등잔",
    "증인",
    "열린 문",
    "일곱 별",
    "떼어진 인",
    "나팔",
    "두 증인",
    "어린 양",
    "유리 바다",
    "흰 옷",
    "생명수",
    "새 예루살렘"
  ];

  function todayKey(d) {
    const dt = d || new Date();
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const day = String(dt.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function addDays(key, n) {
    const parts = key.split("-").map(Number);
    const dt = new Date(parts[0], parts[1] - 1, parts[2] + n);
    return todayKey(dt);
  }

  function words(text) {
    return String(text || "").trim().split(/\s+/).filter(Boolean);
  }

  function normalize(text) {
    return String(text || "")
      .replace(/[“”„"']/g, "")
      .replace(/[.,!?…·:;—\-~]/g, "")
      .replace(/\s+/g, "")
      .trim();
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = new Array(b.length + 1);
    let curr = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
      curr[0] = i;
      const ca = a.charCodeAt(i - 1);
      for (let j = 1; j <= b.length; j++) {
        const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
        curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      }
      const swap = prev;
      prev = curr;
      curr = swap;
    }
    return prev[b.length];
  }

  function similarity(a, b) {
    const s = normalize(a);
    const t = normalize(b);
    if (!s && !t) return 1;
    if (!s || !t) return 0;
    const d = levenshtein(s, t);
    return 1 - d / Math.max(s.length, t.length);
  }

  function batchim(ch) {
    const code = ch.charCodeAt(0);
    if (code < 0xac00 || code > 0xd7a3) return -1;
    return (code - 0xac00) % 28;
  }

  function modernSpell(text) {
    return String(text || "").split(/(\s+)/).map((part) => {
      if (!part || /^\s+$/.test(part)) return part;
      let out = "";
      for (let i = 0; i < part.length; i++) {
        const next = part[i + 1] || "";
        if (part[i] === "찌" && i > 0 && batchim(part[i - 1]) === 8 && next !== "르") out += "지";
        else out += part[i];
      }
      out = out.replace(/세째/g, "셋째").replace(/네째/g, "넷째");
      if (!out.includes("비취옥")) out = out.replace(/비취/g, "비추");
      return out;
    }).join("");
  }

  function contractSpeech(text) {
    return modernSpell(text)
      .replace(/하였/g, "했")
      .replace(/되었/g, "됐")
      .replace(/되어/g, "돼")
      .replace(/하여(?!금)/g, "해");
  }

  function spokenSimilarity(said, target) {
    const heard = modernSpell(said);
    const canon = modernSpell(target);
    const loose = contractSpeech(target);
    return Math.max(similarity(heard, canon), similarity(heard, loose), similarity(contractSpeech(said), loose));
  }

  const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
  const JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
  const JONG = " ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ";

  function jamo(text) {
    let out = "";
    for (const ch of normalize(text)) {
      const code = ch.charCodeAt(0) - 0xac00;
      if (code < 0 || code > 11171) {
        out += ch;
        continue;
      }
      out += CHO[Math.floor(code / 588)] + JUNG[Math.floor((code % 588) / 28)] + (code % 28 ? JONG[code % 28] : "");
    }
    return out;
  }

  function soundSimilarity(said, target) {
    const a = jamo(modernSpell(said));
    const b = jamo(modernSpell(target));
    const loose = jamo(contractSpeech(target));
    if (!a && !b) return 1;
    if (!a || !b) return 0;
    const one = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
    const two = 1 - levenshtein(a, loose) / Math.max(a.length, loose.length);
    return Math.max(one, two, spokenSimilarity(said, target));
  }

  function alignSpeech(said, target) {
    const heard = words(said);
    const canon = words(target);
    const n = heard.length;
    const m = canon.length;
    const score = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    const step = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(null));
    for (let i = 1; i <= n; i++) step[i][0] = [1, 0, 0];
    for (let j = 1; j <= m; j++) step[0][j] = [0, 1, 0];
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        let best = score[i - 1][j];
        let how = [1, 0, 0];
        if (score[i][j - 1] > best) {
          best = score[i][j - 1];
          how = [0, 1, 0];
        }
        [[1, 1], [2, 1], [1, 2]].forEach(([di, dj]) => {
          if (i < di || j < dj) return;
          const a = heard.slice(i - di, i).join("");
          const b = canon.slice(j - dj, j).join(" ");
          const sim = soundSimilarity(a, b);
          if (sim < 0.7) return;
          const gain = score[i - di][j - dj] + sim * Math.max(di, dj);
          if (gain > best) {
            best = gain;
            how = [di, dj, sim];
          }
        });
        score[i][j] = best;
        step[i][j] = how;
      }
    }
    const pairs = [];
    let i = n;
    let j = m;
    while (i > 0 || j > 0) {
      const [di, dj, sim] = step[i][j];
      if (di && dj) pairs.unshift({ heard: [i - di, i], canon: [j - dj, j], sim });
      else if (di) pairs.unshift({ heard: [i - 1, i], canon: null });
      i -= di;
      j -= dj;
    }
    return { heard, canon, pairs };
  }

  function alignHeard(said, target) {
    const { canon, pairs } = alignSpeech(said, target);
    const slots = new Array(canon.length).fill("");
    pairs.forEach((pair) => {
      if (!pair.canon) return;
      for (let k = pair.canon[0]; k < pair.canon[1]; k++) slots[k] = canon[k];
    });
    return slots;
  }

  function toClassic(said, target) {
    const { heard, canon, pairs } = alignSpeech(said, target);
    if (!heard.length || !canon.length) return heard.join(" ");
    return pairs.map((pair) => pair.canon
      ? canon.slice(pair.canon[0], pair.canon[1]).join(" ")
      : heard.slice(pair.heard[0], pair.heard[1]).join(" ")).filter(Boolean).join(" ");
  }

  function hash(str) {
    let h = 2166136261;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function seededShuffle(arr, seed) {
    const a = arr.slice();
    let s = seed >>> 0;
    for (let i = a.length - 1; i > 0; i--) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      const j = s % (i + 1);
      const tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function unique(arr) {
    const seen = new Set();
    const out = [];
    arr.forEach((item) => {
      if (seen.has(item)) return;
      seen.add(item);
      out.push(item);
    });
    return out;
  }

  function flatten(bible) {
    const list = [];
    bible.chapters.forEach((ch) => {
      ch.verses.forEach((verse) => {
        list.push({
          id: ch.chapter + ":" + verse.v,
          chapter: ch.chapter,
          verse: verse.v,
          text: verse.t,
          index: list.length
        });
      });
    });
    return list;
  }

  const PHRASE_LINK = new Set(["인하여", "위하여", "향하여", "대하여", "말미암아", "더불어", "심지어"]);
  const NAME_HOLD = new Set([
    "에베소", "서머나", "버가모", "두아디라", "사데", "빌라델비아", "라오디게아",
    "밧모", "유브라데", "시온", "예루살렘", "바벨론", "아마겟돈", "할렐루야", "아멘", "상아", "헬라", "히브리"
  ]);
  const FUNCTION_WORDS = new Set([
    "또", "곧", "및", "즉", "혹은", "또는", "이는", "있는", "없는", "아닌", "아니", "아니요",
    "모든", "여러", "각", "온", "다", "그", "이", "저", "내", "나", "너", "우리", "너희", "저희",
    "자기", "저의", "그의", "나의", "너의", "아무", "무엇", "것", "자", "바", "때", "중", "등", "수",
    "같은", "같이", "함께", "다시", "이미", "아직", "오직", "과연", "만일", "반드시", "아주"
  ]);

  function bareWord(word) {
    return String(word || "").replace(/[“”„"'.,!?…·:;—\-~]/g, "");
  }

  function syllableCount(word) {
    return [...bareWord(word)].filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 0xac00 && code <= 0xd7a3;
    }).length;
  }

  function isName(bare) {
    return [...NAME_HOLD].some((name) => bare === name || bare.startsWith(name) && syllableCount(bare) - syllableCount(name) <= 2);
  }

  function verbalRank(word, next) {
    const bare = bareWord(word);
    if (!bare || PHRASE_LINK.has(bare) || isName(bare) || syllableCount(bare) < 2) return 0;
    const ahead = bareWord(next || "");
    if (ahead && /(?:아|어|여)$/.test(bare) && syllableCount(bare) <= 3 && /^(?:보|주|버리|두|놓|있|계|쫓|가|오)/.test(ahead) && verbalRank(next) >= 2) return 0;
    if (ahead && /(?:려고|고자)$/.test(bare) && /^하/.test(ahead)) return 0;
    if (ahead && /(?:라|요|다|뇨|냐)$/.test(bare) && /^(?:하시|하더|하였|하니|하고|하는|하며|하매|할|한다)/.test(ahead)) return 0;
    if (ahead && /다가$/.test(bare) && /(?:신|난|는|한)$/.test(ahead)) return 0;
    if (/(?:찌어다|지어다)$/.test(bare)) return 3;
    if (/(?:느니라|으니라|리니라|리로다|으리라|옵소서|시옵소서|노라)$/.test(bare)) return 3;
    if (/(?:니라|리라|더라|도다|로다|소서|리니|나니|려고|사대|뇨|냐)$/.test(bare)) return 3;
    if (/(?:되|라)$/.test(bare)) return 3;
    if (/(?:하사|주사|오사|가사|리사|나사|시사|드사|아서|어서|여서|해서|써서|나서|가서|와서)$/.test(bare)) return 2;
    if (/(?:는데|은데|한데|으나|었으나|였으나|다가|니와)$/.test(bare)) return 2;
    if (/(?:니|매|면)$/.test(bare) && bare !== "아니") return 2;
    if (/(?:고|며|요|여|어|아)$/.test(bare)) return 2;
    if (/(?:에게|께|께서)$/.test(bare) && nextLooksLikeNewClause(next)) return 2;
    return 0;
  }

  function nextLooksLikeNewClause(next) {
    if (!next) return false;
    const bare = bareWord(next);
    if (!bare || verbalRank(next) >= 2) return false;
    if (/(?:하는|시는|있는|없는|되는|오는|가는|보는|하신|되신)$/.test(bare)) return false;
    return /(?:과|와|이|가|은|는)$/.test(bare);
  }

  function rankOf(word, next) {
    const bare = bareWord(word);
    let rank = verbalRank(word, next);
    if (new Set(["인하여", "위하여", "향하여", "대하여", "말미암아"]).has(bare)) rank = next && verbalRank(next) >= 2 ? 0 : 2;
    if (rank === 2 && next && /(?:고|며|요)$/.test(bare)) {
      const nextRank = verbalRank(next);
      const nextBare = bareWord(next);
      const nextModifies = /(?:한|신|된|진|친|운|른)$/.test(nextBare) && nextRank < 3;
      if (nextRank >= 2 || nextModifies) rank = 0;
    }
    return rank;
  }

  function clauseRanges(text) {
    const w = words(text);
    if (!w.length) return [];
    if (w.length <= 4) return [{ start: 0, end: w.length }];
    const ranges = [];
    let start = 0;
    for (let i = 0; i < w.length; i++) {
      const len = i - start + 1;
      const rank = rankOf(w[i], w[i + 1]);
      const last = i === w.length - 1;
      let split = false;
      if (last) split = true;
      else if (rank >= 3 && len >= 2) split = true;
      else if (rank >= 2 && len >= 2) split = true;
      if (!split) continue;
      ranges.push({ start, end: i + 1 });
      start = i + 1;
    }
    const merged = [];
    ranges.forEach((range) => {
      const len = range.end - range.start;
      if (!merged.length) {
        merged.push(range);
        return;
      }
      const prevLen = merged[merged.length - 1].end - merged[merged.length - 1].start;
      if (len === 1 || prevLen === 1) merged[merged.length - 1].end = range.end;
      else merged.push(range);
    });
    return merged;
  }

  const FORWARD_WORDS = new Set([
    "그", "이", "저", "모든", "각", "온", "큰", "새", "첫", "두", "세", "네", "한", "여러", "곧", "또", "및",
    "다", "반드시", "속히", "다시", "장차", "이미", "아직", "오직", "결코", "심히", "크게", "함께", "더", "또한", "같이"
  ]);
  const LINK_AHEAD = new Set(["곧", "또", "및", "또는", "혹은", "그리고", "그러나", "이에", "그런즉"]);

  function boundNounAhead(next) {
    const bare = bareWord(next);
    if (!bare) return false;
    if (/^(?:것|자들|자|바|때|줄|곳|데|동안|가운데)/.test(bare) && syllableCount(bare) <= 3) return true;
    return /^이(?:와|가|를|의|요|라|니|시|여)?$/.test(bare);
  }

  function adnominalAhead(next) {
    const bare = bareWord(next);
    if (!bare || syllableCount(bare) > 4 || PARTICLES.has(bare)) return false;
    if (/(?:을|를|은|는|이|가|에|의|와|과|도|로)$/.test(bare) && !/(?:하는|시는|있는|없는|되는|오는|가는|보는|받은|죽은|앉은|같은)$/.test(bare)) return false;
    const last = bare.charAt(bare.length - 1);
    return (batchim(last) === 4 || batchim(last) === 8) && verbalRank(next) < 2;
  }

  function phraseBoundary(word, next, after) {
    const raw = String(word || "");
    const bare = bareWord(word);
    if (!bare || !next) return -1;
    const nextBare = bareWord(next);
    if (/[,;:]$/.test(raw)) return 3;
    if (PHRASE_LINK.has(nextBare) || /^(?:함께|같이|같은|동안|중에|가운데)/.test(nextBare)) return -1;
    if (PHRASE_LINK.has(bare)) return 3;
    if (LINK_AHEAD.has(nextBare)) {
      if (FORWARD_WORDS.has(bare)) return -1;
      return /(?:을|를|이|가|은|는|와|과|에|에게|요|라|니|고|며)$/.test(bare) || syllableCount(bare) >= 2 && verbalRank(word) >= 2 ? 3 : 1.5;
    }
    if (FORWARD_WORDS.has(bare)) return -1;
    if (/^(?:많은|작은|높은|붉은|깊은|좋은|맑은|밝은|넓은|늙은|젊은|검은|흰|낮은|굳은|죽은|산)$/.test(bare)) return -1;
    if (/에서$/.test(bare) && nextBare === "나는") return -1;
    if (/^(?:수|줄|듯|뿐|번)$/.test(bare)) return -1;
    if (/의$/.test(bare)) return -1;
    if (isNumberWord(word) && !/(?:을|를|이|가|은|는|에|와|과|으로|로)$/.test(bare)) return -1;
    if (boundNounAhead(next) && !(after && /^같/.test(bareWord(after)))) return -1;
    const weak = adnominalAhead(next) || after && syllableCount(next) <= 2 && /[을를]$/.test(nextBare) && /^것/.test(bareWord(after)) ? 2 : 0;
    if (/(?:을|를)$/.test(bare) && syllableCount(bare) >= 2) return 3 - weak;
    if (/(?:에게|께서|께|에서|으로|로부터|부터|까지|에게서)$/.test(bare)) return 3 - weak;
    if (/(?:은|는|이|가)$/.test(bare) && syllableCount(bare) >= 2 && !/(?:있는|없는|하는|되는|아닌|시는|오는|가는|보는)$/.test(bare)) return 2.5 - weak;
    if (/(?:와|과)$/.test(bare) && syllableCount(bare) >= 2) return 2 - weak;
    if (/(?:에|도|로)$/.test(bare) && syllableCount(bare) >= 2) return Math.max(0, 1.5 - weak);
    if (verbalRank(word, next) >= 2) return 2;
    const last = bare.charAt(bare.length - 1);
    if (batchim(last) === 8 || batchim(last) === 4) return -1;
    return 0;
  }

  function pieceCost(len) {
    return [99, 99, 1, 0.3, 0, 0.3, 1, 2.5, 5, 8][len] ?? 99;
  }

  function splitClause(w, start, end) {
    const len = end - start;
    if (len < 7) return [{ start, end }];
    const best = new Array(len + 1).fill(-Infinity);
    const from = new Array(len + 1).fill(-1);
    best[0] = 0;
    for (let j = 2; j <= len; j++) {
      for (let k = Math.max(0, j - 9); k <= j - 2; k++) {
        if (best[k] === -Infinity) continue;
        let gain = best[k] - pieceCost(j - k);
        if (j < len) {
          const edge = phraseBoundary(w[start + j - 1], w[start + j], w[start + j + 1]);
          gain += edge < 0 ? -8 : edge - 1.5;
        }
        if (gain > best[j]) {
          best[j] = gain;
          from[j] = k;
        }
      }
    }
    if (best[len] === -Infinity) return [{ start, end }];
    const cuts = [];
    for (let j = len; j > 0; j = from[j]) cuts.unshift({ start: start + from[j], end: start + j });
    return cuts;
  }

  function chunkRanges(text) {
    const w = words(text);
    const out = [];
    clauseRanges(text).forEach((range) => {
      splitClause(w, range.start, range.end).forEach((piece) => out.push(piece));
    });
    return out;
  }

  function chunksOf(text) {
    const w = words(text);
    return chunkRanges(text).map((range) => w.slice(range.start, range.end).join(" "));
  }

  function isNumberWord(word) {
    const bare = bareWord(word);
    if (!bare) return false;
    if (/^(?:하나|둘|셋|넷|다섯|여섯|일곱|여덟|아홉|열|스물|서른|마흔|일|이천|삼|사십|백|천|만|첫|반)/.test(bare)) return true;
    return /(?:째|천|백|십|만)$/.test(bare) && syllableCount(bare) <= 5 && verbalRank(word) < 2;
  }

  const LIGHT_WORDS = /^(?:자요|자라|자니|자로다|자니라|이니라|것이라|것이요|것이니|것이니라|것이로다|것을|것이|것은|하시더라|하더라|하니|하고|하며|하여|하니라|하리라|하시니|하시고|하시며|하시되|하되|하기를|하시기로|이라|이요|이니|있고|있더라|있으니|있어|있는데|있으며|되니|되고|되어|가로되|가라사대|이르되|이르시되|말하되|말하기를|아멘|그러하리라|그러하니|그러므로|이러므로|이같이|그같이)$/;
  const KEY_SHORT = new Set(["인", "양", "용", "해", "달", "별", "땅", "피", "불", "책", "말", "뿔", "왕", "물", "성", "문", "관", "옷", "칼", "금", "잔", "길", "섬", "눈", "손", "발"]);
  const PLAIN_STEMS = new Set([
    "자", "자들", "것", "것들", "이", "이들", "바", "때", "가운데", "앞", "뒤", "위", "아래", "사이", "안", "밖", "곁",
    "동안", "이제", "전", "이전", "시방", "장차", "지금", "그", "그들", "저", "저희", "너", "너희", "나", "우리", "내", "제", "자기", "누구"
  ]);

  function stemOf(bare) {
    let stem = bare;
    for (let n = 0; n < 2; n++) {
      const next = stem.replace(/(?:에게서|에게|께서|께|에서|으로|부터|까지|라고도|이라고도|을|를|이|가|은|는|와|과|에|도|로|의|요)$/, "");
      if (next === stem || !next) break;
      stem = next;
    }
    return stem.replace(/들$/, (m) => (syllableCount(stem) > 2 ? "" : m));
  }

  function contentScore(word) {
    const bare = bareWord(word);
    if (!bare || PARTICLES.has(bare) || FUNCTION_WORDS.has(bare) || PHRASE_LINK.has(bare) || FORWARD_WORDS.has(bare)) return 0;
    if (LIGHT_WORDS.test(bare)) return 1;
    if (NAME_HOLD.has(bare.replace(/(?:와|과|에|에서|으로|로|이|가|은|는|을|를|의|아)$/, ""))) return 5.5;
    if (isNumberWord(word)) return 6;
    const stem = stemOf(bare);
    const cased = stem !== bare;
    if (PLAIN_STEMS.has(stem)) return 1;
    if (cased && /의$/.test(bare)) return syllableCount(stem) >= 2 ? 4 : 2;
    if (cased && (syllableCount(stem) >= 2 || KEY_SHORT.has(stem))) return 5;
    const rank = verbalRank(word);
    if (rank >= 3) return syllableCount(bare) >= 3 ? 4.5 : 3;
    if (rank === 2) return syllableCount(bare) >= 3 ? 4 : 2.5;
    if (/(?:히|게)$/.test(bare)) return 2;
    if (/(?:신|한|된|진|은|던|실|할|될|올)$/.test(bare) && syllableCount(bare) >= 2) return 3;
    if (syllableCount(bare) >= 2) return 4.5;
    if (KEY_SHORT.has(bare)) return 4;
    return 0;
  }

  function eligibleIndexes(text) {
    return words(text)
      .map((word, i) => ({ word, i }))
      .filter((x) => x.word.length >= 2 && !PARTICLES.has(x.word))
      .map((x) => x.i);
  }

  function pickBlanks(text, n, seed) {
    const w = words(text);
    const primary = [];
    const rest = [];
    chunkRanges(text).forEach((range) => {
      const ranked = [];
      for (let i = range.start; i < range.end; i++) {
        const score = contentScore(w[i]);
        if (score >= 3) ranked.push({ i, score });
      }
      if (!ranked.length) return;
      ranked.sort((a, b) => b.score - a.score || b.i - a.i);
      primary.push(ranked[0]);
      ranked.slice(1).forEach((item) => rest.push(item));
    });
    const chosen = [];
    const used = new Set();
    function take(item) {
      if (!item || used.has(item.i) || chosen.length >= n) return;
      if ([...used].some((index) => Math.abs(index - item.i) === 1 || normalize(w[index]) === normalize(w[item.i]))) return;
      used.add(item.i);
      chosen.push(item.i);
    }
    const ordered = primary.slice().sort((a, b) => a.i - b.i);
    if (ordered.length <= n) ordered.forEach(take);
    else {
      const stride = ordered.length / n;
      const shift = ((seed >>> 0) % 997) / 997 * stride;
      for (let k = 0; k < n; k++) take(ordered[Math.min(ordered.length - 1, Math.floor(k * stride + shift))]);
      ordered.slice().sort((a, b) => b.score - a.score).forEach(take);
    }
    rest.sort((a, b) => b.score - a.score).forEach(take);
    if (chosen.length < n) seededShuffle(eligibleIndexes(text), seed + 2).forEach((i) => take({ i }));
    return chosen.sort((a, b) => a - b).slice(0, n);
  }

  function skeleton(text) {
    return words(text).map((word) => word.charAt(0) + "·").join(" ");
  }

  function wordDiff(input, answer, equal) {
    const same = equal || ((x, y) => x === y);
    const a = words(input);
    const b = words(answer);
    const n = a.length;
    const m = b.length;
    const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        dp[i][j] = same(a[i - 1], b[j - 1]) ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
    const out = [];
    let i = n;
    let j = m;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && same(a[i - 1], b[j - 1])) {
        out.push({ type: "ok", text: b[j - 1] });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        out.push({ type: "miss", text: b[j - 1] });
        j--;
      } else {
        out.push({ type: "extra", text: a[i - 1] });
        i--;
      }
    }
    return out.reverse();
  }

  function qualityFromScore(score) {
    if (score >= 0.96) return 5;
    if (score >= 0.9) return 4;
    if (score >= 0.8) return 3;
    if (score >= 0.55) return 2;
    if (score > 0) return 1;
    return 0;
  }

  function blankCard(today) {
    return {
      ease: 2.5,
      interval: 0,
      reps: 0,
      lapses: 0,
      due: today,
      stage: 0,
      correct: 0,
      wrong: 0,
      introduced: today,
      last: today
    };
  }

  function applySrs(card, quality, today) {
    const base = card || blankCard(today);
    let ease = (base.ease || 2.5) + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (ease < 1.3) ease = 1.3;
    if (quality < 3) {
      return {
        ...base,
        ease: Math.max(1.3, (base.ease || 2.5) - 0.2),
        reps: 0,
        interval: 0,
        lapses: (base.lapses || 0) + 1,
        due: today,
        last: today,
        stage: base.stage || 0,
        wrong: (base.wrong || 0) + 1
      };
    }
    let reps = base.reps || 0;
    let interval;
    if (reps === 0) interval = 1;
    else if (reps === 1) interval = 3;
    else if (reps === 2) interval = 7;
    else interval = Math.max(1, Math.round((base.interval || 7) * ease));
    reps += 1;
    return {
      ...base,
      ease,
      reps,
      interval,
      due: addDays(today, interval),
      last: today,
      correct: (base.correct || 0) + 1
    };
  }

  function verseStatus(card, today) {
    if (!card || !card.stage) return { key: "new", label: "새 절" };
    if (card.stage < 3) return { key: "learning", label: card.stage === 2 ? "확인 전" : "배우는 중" };
    if (card.due <= today) return { key: "due", label: "복습 때" };
    if ((card.interval || 0) >= 21) return { key: "firm", label: "굳음" };
    return { key: "review", label: "새김" };
  }

  function levelInfo(xp) {
    const span = 180;
    const safe = Math.max(0, xp || 0);
    const level = Math.floor(safe / span) + 1;
    const title = LEVELS[Math.min(LEVELS.length - 1, level - 1)];
    return { level, title, into: safe % span, span, xp: safe };
  }

  function recommend(list, cards, today) {
    const due = list.filter((v) => {
      const c = cards[v.id];
      return c && c.stage >= 3 && c.due <= today;
    }).sort((a, b) => {
      const ca = cards[a.id];
      const cb = cards[b.id];
      const lapse = (cb.lapses || 0) - (ca.lapses || 0);
      if (lapse) return lapse;
      if (ca.ease !== cb.ease) return ca.ease - cb.ease;
      return ca.due < cb.due ? -1 : ca.due > cb.due ? 1 : 0;
    });
    if (due[0]) {
      const c = cards[due[0].id];
      return {
        id: due[0].id,
        reason: (c.lapses || 0) > 0
          ? "한 번 흔들렸던 절입니다. 잊기 전에 다시 꺼내면 오래 남습니다."
          : "복습 시점이 된 절입니다. 오늘 한 번 더 꺼내는 자리가 기억을 굳힙니다."
      };
    }
    const learning = list.find((v) => cards[v.id] && cards[v.id].stage > 0 && cards[v.id].stage < 3);
    if (learning) {
      return { id: learning.id, reason: "아직 힌트 없이 통과하지 못한 절입니다. 오늘 이 절을 먼저 붙여 보세요." };
    }
    const next = list.find((v) => !cards[v.id] || (cards[v.id].stage || 0) < 2);
    if (next) return { id: next.id, reason: "다음으로 새길 순서입니다. 앞 절 끝에 이어서 붙여 보세요." };
    const oldest = list.slice().sort((a, b) => {
      const la = cards[a.id]?.last || "";
      const lb = cards[b.id]?.last || "";
      return la < lb ? -1 : la > lb ? 1 : 0;
    })[0];
    return { id: oldest.id, reason: "이미 외운 말씀 가운데 가장 오래 묵혀 둔 절입니다." };
  }

  function opener(text, n, used) {
    const w = words(text);
    let k = Math.min(n, w.length);
    let phrase = w.slice(0, k).join(" ");
    while (used.has(phrase) && k < w.length) {
      k += 1;
      phrase = w.slice(0, k).join(" ");
    }
    used.add(phrase);
    return phrase;
  }

  function productionQuestion(verse, seed) {
    const w = words(verse.text);
    if (w.length <= 18) return { kind: "full", id: verse.id, qid: "f" + verse.id };
    return {
      kind: "blanks",
      id: verse.id,
      blanks: pickBlanks(verse.text, 3, seed),
      qid: "b" + verse.id + ":" + seed
    };
  }

  function distractorChoices(list, id, k, seed) {
    const verse = list.find((v) => v.id === id);
    const same = list.filter((v) => v.chapter === verse.chapter && v.id !== id);
    const far = list.filter((v) => v.chapter !== verse.chapter);
    const pool = seededShuffle(same, seed).concat(seededShuffle(far, seed + 9));
    const ids = [id];
    pool.forEach((item) => {
      if (ids.length < k && !ids.includes(item.id)) ids.push(item.id);
    });
    return seededShuffle(ids, seed + 3);
  }

  function orderQuestion(verses, qid) {
    const used = new Set();
    return {
      kind: "order",
      qid,
      items: verses.map((v) => ({ id: v.id, phrase: opener(v.text, 5, used) }))
    };
  }

  function buildDailyQuestions(list, ids, seed) {
    const map = new Map(list.map((v) => [v.id, v]));
    const qs = [];
    ids.forEach((id, n) => {
      qs.push(productionQuestion(map.get(id), seed + n * 17));
    });
    if (ids.length >= 3) {
      qs.push(orderQuestion(ids.slice(0, Math.min(4, ids.length)).map((id) => map.get(id)), "ord-" + ids[0]));
    }
    if (ids.length) {
      const target = ids[ids.length - 1];
      qs.push({
        kind: "locate",
        id: target,
        choices: distractorChoices(list, target, 4, seed + 5),
        qid: "loc-" + target
      });
    }
    let openings = 0;
    for (let i = 0; i < ids.length - 1 && openings < 2; i++) {
      const a = map.get(ids[i]);
      const b = map.get(ids[i + 1]);
      if (a && b && a.chapter === b.chapter && b.verse === a.verse + 1) {
        qs.push({ kind: "opening", id: b.id, from: a.id, n: 6, qid: "op-" + b.id });
        openings += 1;
      }
    }
    return qs;
  }

  function buildChapterQuestions(list, chapter, seed, depth) {
    const verses = list.filter((v) => v.chapter === chapter);
    const qs = [];
    const size = verses.length > 18 ? 8 : verses.length > 10 ? 6 : Math.max(2, verses.length);
    for (let i = 0; i < verses.length; i += size) {
      const band = verses.slice(i, i + size);
      if (band.length >= 2) qs.push(orderQuestion(band, "ord-" + chapter + "-" + i));
    }
    const recalls = Math.min(depth || 4, verses.length);
    const shift = Math.abs(seed) % verses.length;
    const rotated = verses.slice(shift).concat(verses.slice(0, shift));
    const picked = [];
    const seen = new Set();
    [rotated[0], rotated[rotated.length - 1]].forEach((v) => {
      if (v && !seen.has(v.id)) {
        seen.add(v.id);
        picked.push(v);
      }
    });
    const step = Math.max(1, Math.floor(rotated.length / recalls));
    for (let i = 0; picked.length < recalls; i++) {
      const v = rotated[(i * step) % rotated.length];
      if (!seen.has(v.id)) {
        seen.add(v.id);
        picked.push(v);
      }
      if (i > verses.length + 2) break;
    }
    picked.slice(0, recalls).forEach((v, n) => {
      qs.push(productionQuestion(v, seed + 30 + n * 13));
    });
    let openings = 0;
    for (let i = 1; i < verses.length && openings < 2; i += Math.max(1, Math.floor(verses.length / 3))) {
      qs.push({ kind: "opening", id: verses[i].id, from: verses[i - 1].id, n: 6, qid: "chop-" + verses[i].id });
      openings += 1;
    }
    return qs;
  }

  function buildSpotQuestions(list, weighted, seed) {
    const pool = weighted.slice();
    const chosen = [];
    let s = seed >>> 0;
    while (pool.length && chosen.length < 5) {
      const sum = pool.reduce((acc, item) => acc + item.w, 0);
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      let r = (s / 4294967296) * sum;
      let index = 0;
      for (; index < pool.length; index++) {
        r -= pool[index].w;
        if (r <= 0) break;
      }
      if (index >= pool.length) index = pool.length - 1;
      chosen.push(pool[index].id);
      pool.splice(index, 1);
    }
    const map = new Map(list.map((v) => [v.id, v]));
    return chosen.map((id, n) => productionQuestion(map.get(id), seed + n * 19));
  }

  function grade(question, payload, list) {
    const map = new Map(list.map((v) => [v.id, v]));
    const compare = payload.spoken ? spokenSimilarity : similarity;
    if (question.kind === "full") {
      const score = compare(payload.text || "", map.get(question.id).text);
      return { ...question, score, pass: score >= 0.9 };
    }
    if (question.kind === "opening") {
      const verse = map.get(question.id);
      const target = words(verse.text).slice(0, question.n).join(" ");
      const got = words(payload.text || "").slice(0, question.n).join(" ");
      const score = compare(got, target);
      return { ...question, score, pass: score >= 0.9, target };
    }
    if (question.kind === "blanks") {
      const verseWords = words(map.get(question.id).text);
      let hit = 0;
      const wrong = [];
      question.blanks.forEach((index) => {
        const given = payload.blanks ? payload.blanks[index] : "";
        const match = payload.spoken ? spokenSimilarity(given, verseWords[index]) >= 0.9 : normalize(given) === normalize(verseWords[index]);
        if (match) hit += 1;
        else wrong.push(index);
      });
      const score = hit / question.blanks.length;
      return { ...question, score, pass: score === 1, wrong };
    }
    if (question.kind === "locate") {
      const pass = payload.choice === question.id;
      return { ...question, score: pass ? 1 : 0, pass };
    }
    if (question.kind === "order") {
      const ids = question.items.map((item) => item.id);
      const chosen = payload.order || [];
      let hit = 0;
      ids.forEach((id, i) => {
        if (chosen[i] === id) hit += 1;
      });
      const score = ids.length ? hit / ids.length : 0;
      return { ...question, score, pass: score === 1 };
    }
    return { ...question, score: 0, pass: false };
  }

  function searchVerses(list, query) {
    const q = String(query || "").trim();
    if (!q) return [];
    const ref = q.match(/(\d+)\s*[:장]\s*(\d+)?/);
    if (ref) {
      const chapter = Number(ref[1]);
      const verse = ref[2] ? Number(ref[2]) : null;
      return list.filter((v) => v.chapter === chapter && (verse == null || v.verse === verse)).slice(0, 40);
    }
    return list.filter((v) => v.text.includes(q) || v.id === q).slice(0, 40);
  }

  function makeClozeBank(text, blanks, pool, seed) {
    const verseWords = words(text);
    const tokens = blanks.map((index, n) => ({ uid: "c" + n, word: verseWords[index] }));
    const ban = new Set(tokens.map((token) => token.word));
    const extras = seededShuffle(unique(pool.filter((word) => {
      if (ban.has(word) || word.length < 2 || PARTICLES.has(word)) return false;
      return ![...ban].some((answer) => normalize(answer) === normalize(word));
    })), seed).slice(0, tokens.length + 2).map((word, n) => ({ uid: "d" + n, word }));
    return seededShuffle(tokens.concat(extras), seed + 1);
  }

  root.LampEngine = {
    CHAPTER_META,
    MARKS,
    LEVELS,
    todayKey,
    addDays,
    words,
    normalize,
    similarity,
    spokenSimilarity,
    toClassic,
    alignHeard,
    hash,
    seededShuffle,
    flatten,
    chunksOf,
    pickBlanks,
    skeleton,
    wordDiff,
    qualityFromScore,
    blankCard,
    applySrs,
    verseStatus,
    levelInfo,
    recommend,
    buildDailyQuestions,
    buildChapterQuestions,
    buildSpotQuestions,
    grade,
    searchVerses,
    makeClozeBank
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

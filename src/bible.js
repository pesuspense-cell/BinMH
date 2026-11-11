(function (root) {
  "use strict";

  const BOOKS = [
    ["창세기", "창"], ["출애굽기", "출"], ["레위기", "레"], ["민수기", "민"], ["신명기", "신"],
    ["여호수아", "수"], ["사사기", "삿"], ["룻기", "룻"], ["사무엘상", "삼상"], ["사무엘하", "삼하"],
    ["열왕기상", "왕상"], ["열왕기하", "왕하"], ["역대상", "대상"], ["역대하", "대하"], ["에스라", "스"],
    ["느헤미야", "느"], ["에스더", "에"], ["욥기", "욥"], ["시편", "시"], ["잠언", "잠"],
    ["전도서", "전"], ["아가", "아"], ["이사야", "사"], ["예레미야", "렘"], ["예레미야애가", "애"],
    ["에스겔", "겔"], ["다니엘", "단"], ["호세아", "호"], ["요엘", "욜"], ["아모스", "암"],
    ["오바댜", "옵"], ["요나", "욘"], ["미가", "미"], ["나훔", "나"], ["하박국", "합"],
    ["스바냐", "습"], ["학개", "학"], ["스가랴", "슥"], ["말라기", "말"],
    ["마태복음", "마"], ["마가복음", "막"], ["누가복음", "눅"], ["요한복음", "요"], ["사도행전", "행"],
    ["로마서", "롬"], ["고린도전서", "고전"], ["고린도후서", "고후"], ["갈라디아서", "갈"], ["에베소서", "엡"],
    ["빌립보서", "빌"], ["골로새서", "골"], ["데살로니가전서", "살전"], ["데살로니가후서", "살후"], ["디모데전서", "딤전"],
    ["디모데후서", "딤후"], ["디도서", "딛"], ["빌레몬서", "몬"], ["히브리서", "히"], ["야고보서", "약"],
    ["베드로전서", "벧전"], ["베드로후서", "벧후"], ["요한일서", "요일"], ["요한이서", "요이"], ["요한삼서", "요삼"],
    ["유다서", "유"], ["요한계시록", "계"]
  ];
  const EXTRA = {
    "계시록": 66, "요한1서": 62, "요한2서": 63, "요한3서": 64, "요1": 62, "요2": 63, "요3": 64,
    "애가": 25, "예레미야애가": 25, "시편": 19, "시": 19, "아가서": 22, "룻": 8, "욥": 18,
    "마태": 40, "마가": 41, "누가": 42, "요한": 43, "행전": 44, "로마": 45, "히브리": 58, "야고보": 59, "유다": 65
  };
  const REVELATION = 66;

  const ALIASES = (() => {
    const pairs = [];
    BOOKS.forEach(([name, abbr], index) => {
      pairs.push([name, index + 1]);
      pairs.push([abbr, index + 1]);
      if (/(?:서|기)$/.test(name) && name.length > 2) pairs.push([name.slice(0, -1), index + 1]);
    });
    Object.entries(EXTRA).forEach(([alias, book]) => pairs.push([alias, book]));
    return pairs.sort((a, b) => b[0].length - a[0].length);
  })();

  let data = null;
  let loading = null;
  let flat = null;

  function load() {
    if (data) return Promise.resolve(data);
    if (!loading) {
      loading = fetch("src/bible.json?v=1").then((res) => {
        if (!res.ok) throw new Error("bible " + res.status);
        return res.json();
      }).then((books) => {
        data = books;
        return data;
      });
      loading.catch(() => { loading = null; });
    }
    return loading;
  }

  function ready() { return !!data; }

  function bookName(book) { return BOOKS[book - 1][0]; }

  function chapterCount(book) { return data ? data[book - 1].length : 0; }

  function verseCount(book, chapter) {
    const ch = data && data[book - 1] && data[book - 1][chapter - 1];
    return ch ? ch.length : 0;
  }

  function splitBook(raw) {
    const text = String(raw || "").trim();
    const squeezed = text.replace(/\s+/g, "");
    for (const [alias, book] of ALIASES) {
      if (!squeezed.startsWith(alias)) continue;
      const rest = squeezed.slice(alias.length);
      if (rest === "" || /^\d/.test(rest)) return { book, rest, exact: rest === "" };
    }
    return null;
  }

  function parseNumbers(rest) {
    const m = String(rest || "").replace(/\s+/g, "").match(/^(\d+)(?:장)?(?:[:.]?(\d+))?(?:절)?(?:[-~–](\d+)(?:절)?)?$/);
    if (!m) return null;
    const chapter = Number(m[1]);
    const verse = m[2] ? Number(m[2]) : null;
    const end = m[3] ? Number(m[3]) : null;
    return { chapter, verse, end };
  }

  function parseRef(raw, fallbackBook) {
    const text = String(raw || "").trim();
    if (!text) return null;
    let book = null;
    let rest = text;
    const head = splitBook(text);
    if (head) {
      book = head.book;
      rest = head.rest;
      if (head.exact) return null;
    } else if (/^\d/.test(text)) {
      book = fallbackBook || REVELATION;
    } else {
      return null;
    }
    const nums = parseNumbers(rest);
    if (!nums || nums.chapter < 1) return null;
    if (data) {
      const total = verseCount(book, nums.chapter);
      if (!total) return null;
      if (nums.verse != null && (nums.verse < 1 || nums.verse > total)) return null;
      if (nums.end != null) nums.end = Math.min(nums.end, total);
    }
    if (nums.end != null && (nums.verse == null || nums.end <= nums.verse)) nums.end = null;
    return { book, chapter: nums.chapter, verse: nums.verse, end: nums.end };
  }

  function refKey(ref) {
    return ref.book + "." + ref.chapter + "." + ref.verse + (ref.end ? "-" + ref.end : "");
  }

  function keyToRef(key) {
    const text = String(key || "");
    let m = text.match(/^(\d+)\.(\d+)\.(\d+)(?:-(\d+))?$/);
    if (m) return { book: Number(m[1]), chapter: Number(m[2]), verse: Number(m[3]), end: m[4] ? Number(m[4]) : null };
    m = text.match(/^(\d+):(\d+)$/);
    if (m) return { book: REVELATION, chapter: Number(m[1]), verse: Number(m[2]), end: null };
    return null;
  }

  function label(ref) {
    if (!ref) return "";
    const base = bookName(ref.book) + " " + ref.chapter;
    if (ref.verse == null) return base + "장";
    return base + ":" + ref.verse + (ref.end ? "-" + ref.end : "");
  }

  function versesOf(ref, max) {
    if (!data || !ref) return [];
    const chapter = data[ref.book - 1] && data[ref.book - 1][ref.chapter - 1];
    if (!chapter) return [];
    const from = ref.verse == null ? 1 : ref.verse;
    const to = ref.verse == null ? chapter.length : ref.end || ref.verse;
    const out = [];
    for (let v = from; v <= Math.min(to, chapter.length) && out.length < (max || 200); v++) {
      out.push({ book: ref.book, chapter: ref.chapter, verse: v, text: chapter[v - 1] });
    }
    return out;
  }

  function textOf(ref, max) {
    return versesOf(ref, max).map((item) => item.text).join(" ");
  }

  function buildFlat() {
    if (flat || !data) return flat;
    flat = [];
    data.forEach((chapters, b) => chapters.forEach((verses, c) => verses.forEach((text, v) => {
      flat.push({ book: b + 1, chapter: c + 1, verse: v + 1, text, tight: text.replace(/\s+/g, "") });
    })));
    return flat;
  }

  function search(query, limit) {
    const q = String(query || "").trim();
    const max = limit || 50;
    if (!q) return { hits: [], total: 0, ref: null };
    const ref = parseRef(q);
    if (ref) {
      const hits = versesOf(ref, max);
      return { hits, total: hits.length, ref };
    }
    if (!data) return { hits: [], total: 0, ref: null };
    const whole = scan(q, null, max);
    if (whole.total) return whole;
    const head = q.match(/^(\S{2,})\s+(.+)$/);
    const found = head && splitBook(head[1]);
    return found && found.exact ? scan(head[2], found.book, max) : whole;
  }

  function scan(words, book, max) {
    const tight = words.replace(/\s+/g, "");
    const hits = [];
    let total = 0;
    if (!tight) return { hits, total, ref: null, book };
    for (const item of buildFlat()) {
      if (book && item.book !== book) continue;
      if (item.text.includes(words) || item.tight.includes(tight)) {
        total++;
        if (hits.length < max) hits.push(item);
      }
    }
    return { hits, total, ref: null, book };
  }

  root.LampBible = { BOOKS, REVELATION, load, ready, parseRef, refKey, keyToRef, label, versesOf, textOf, search, bookName, chapterCount, verseCount };
})(typeof window !== "undefined" ? window : globalThis);

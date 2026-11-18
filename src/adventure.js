(function (root) {
  const LANDMARKS = [
    { at: 0, label: "출발" },
    { at: 3, label: "일곱 교회" },
    { at: 8, label: "보좌·인" },
    { at: 18, label: "나팔" },
    { at: 32, label: "두 증인" },
    { at: 40, label: "용·짐승" },
    { at: 52, label: "대접" },
    { at: 62, label: "바벨론" },
    { at: 70, label: "재림" },
    { at: 76, label: "새 하늘" },
    { at: 79, label: "보좌" }
  ];

  function hangulLen(text) {
    return (String(text || "").match(/[\uAC00-\uD7A3]/g) || []).length;
  }

  function packsFixed(list, size) {
    const packs = [];
    for (let i = 0; i < list.length; i += size) {
      const slice = list.slice(i, i + size);
      packs.push({
        ids: slice.map((verse) => verse.id),
        chars: slice.reduce((sum, verse) => sum + hangulLen(verse.text), 0)
      });
    }
    return packs;
  }

  function packsFlex(list, minChars, maxChars, targetDays) {
    const lens = list.map((verse) => hangulLen(verse.text));
    const packs = [];
    let i = 0;
    const aim = Math.max(2, targetDays | 0);
    while (i < list.length) {
      const leftVerses = list.length - i;
      const leftPacks = Math.max(1, aim - packs.length);
      const leftChars = lens.slice(i).reduce((sum, n) => sum + n, 0);
      // Prefer 120–180, but stretch toward ~80 days when the book would otherwise run long.
      const fair = Math.round(leftChars / leftPacks);
      const softMin = Math.min(minChars, Math.max(90, fair - 40));
      const softMax = Math.max(maxChars, Math.min(260, fair + 30));
      let chars = 0;
      const ids = [];
      while (i < list.length) {
        const next = lens[i];
        if (ids.length && chars >= softMin && chars + next > softMax) break;
        if (ids.length && packs.length >= aim - 1) {
          ids.push(list[i].id);
          chars += next;
          i += 1;
          continue;
        }
        ids.push(list[i].id);
        chars += next;
        i += 1;
        if (chars >= softMin) {
          if (i >= list.length) break;
          const peek = lens[i];
          if (chars + peek > softMax) break;
          if (chars >= Math.min(softMax - 10, Math.max(softMin + 20, fair)) && leftVerses - ids.length >= leftPacks - 1) break;
        }
      }
      packs.push({ ids, chars });
      if (packs.length >= aim && i < list.length) {
        // Spill any leftover into trailing packs still near maxChars.
        while (i < list.length) {
          let spillChars = 0;
          const spillIds = [];
          while (i < list.length) {
            const next = lens[i];
            if (spillIds.length && spillChars >= minChars && spillChars + next > maxChars + 40) break;
            spillIds.push(list[i].id);
            spillChars += next;
            i += 1;
            if (spillChars >= minChars && i < list.length && spillChars + lens[i] > maxChars + 40) break;
          }
          packs.push({ ids: spillIds, chars: spillChars });
        }
      }
    }
    return packs;
  }

  function buildPacks(list, mode) {
    if (mode === "fixed5") return packsFixed(list, 5);
    return packsFlex(list, 120, 180, 80);
  }

  function scaleLandmarks(nodeCount) {
    if (nodeCount <= 1) return [{ at: 0, label: "출발" }, { at: 0, label: "보좌" }];
    return LANDMARKS.map((item) => ({
      at: Math.min(nodeCount - 1, Math.round((item.at / 79) * (nodeCount - 1))),
      label: item.label
    })).filter((item, index, arr) => index === 0 || item.at !== arr[index - 1].at || item.label !== arr[index - 1].label);
  }

  function buildPath(nodeCount) {
    const n = Math.max(2, nodeCount | 0);
    const marks = {};
    scaleLandmarks(n).forEach((item) => { marks[item.at] = item.label; });
    const nodes = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const x = 36 + t * 700;
      // Keep the road in the middle band so the camera always frames pilgrim + trail.
      const y = 118 - Math.sin(t * Math.PI * 2.15) * 36 - Math.cos(t * Math.PI * 1.1) * 10;
      nodes.push({ i, x, y, landmark: marks[i] || "" });
    }
    return nodes;
  }

  function chibiSvg(x, y, phase) {
    const legL = 5 + Math.sin(phase) * 2.5;
    const legR = 5 + Math.cos(phase) * 2.5;
    const bob = Math.abs(Math.sin(phase)) * 1.2;
    return '<g class="adv-chibi" transform="translate(' + x.toFixed(1) + " " + (y - bob).toFixed(1) + ')">' +
      '<ellipse cx="0" cy="14" rx="10" ry="3" fill="#1a2033" opacity="0.15"/>' +
      '<rect x="-5" y="6" width="4" height="' + legL.toFixed(1) + '" rx="2" fill="#3d4a6b" stroke="#1a2033" stroke-width="1"/>' +
      '<rect x="1" y="6" width="4" height="' + legR.toFixed(1) + '" rx="2" fill="#3d4a6b" stroke="#1a2033" stroke-width="1"/>' +
      '<path d="M-8 6 Q0 -2 8 6 L6 11 Q0 14 -6 11 Z" fill="#5b7cfa" stroke="#1a2033" stroke-width="1.4"/>' +
      '<rect x="-6" y="8" width="12" height="2.5" rx="1" fill="#f0c14a" stroke="#1a2033" stroke-width="0.8"/>' +
      '<circle cx="0" cy="-7" r="9" fill="#f3d6b8" stroke="#1a2033" stroke-width="1.5"/>' +
      '<path d="M-8 -8 Q0 -18 8 -8 Q3 -11 -3 -10 Z" fill="#2c2416" stroke="#1a2033" stroke-width="1"/>' +
      '<circle cx="-3" cy="-7" r="1.3" fill="#1a2033"/><circle cx="3" cy="-7" r="1.3" fill="#1a2033"/>' +
      '<path d="M-2 -3.5 Q0 -1.5 2 -3.5" fill="none" stroke="#1a2033" stroke-width="1" stroke-linecap="round"/>' +
      "</g>";
  }

  function mapHtml(opts) {
    const path = opts.path || [];
    const day = Math.max(0, Math.min(opts.day || 0, path.length - 1));
    const walking = !!opts.walking;
    const walkT = Math.max(0, Math.min(1, opts.walkT || 0));
    if (!path.length) return "";
    const from = path[Math.min(day, path.length - 2)];
    const to = path[Math.min(day + (walking ? 1 : 0), path.length - 1)];
    const me = walking
      ? { x: from.x + (to.x - from.x) * walkT, y: from.y + (to.y - from.y) * walkT }
      : path[day];
    const pathD = path.map((node, index) => (index ? "L" : "M") + node.x.toFixed(1) + " " + node.y.toFixed(1)).join(" ");
    const camX = Math.max(0, Math.min(me.x - 170, 780 - 360));
    let tiles = "";
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 30; col++) {
        tiles += '<rect x="' + (col * 28 - 20) + '" y="' + (168 + row * 14) + '" width="28" height="14" fill="' +
          ((row + col) % 2 ? "#f0d09a" : "#e8b86d") + '" opacity="0.55"/>';
      }
    }
    const nodes = path.map((node) => {
      const done = node.i <= day;
      const here = node.i === day;
      const r = node.landmark ? 6.5 : here ? 3.4 : 2.6;
      const fill = done ? "#f0c14a" : node.landmark ? "#fff8e8" : "#ffffff";
      return '<g><circle cx="' + node.x.toFixed(1) + '" cy="' + node.y.toFixed(1) + '" r="' + r + '" fill="' + fill +
        '" stroke="#1a2033" stroke-width="' + (node.landmark || here ? 1.6 : 1) + '"/>' +
        (node.landmark
          ? '<text x="' + node.x.toFixed(1) + '" y="' + (node.y - 12).toFixed(1) +
            '" text-anchor="middle" font-size="8" font-weight="700" fill="#1a2033">' + node.landmark + "</text>"
          : "") +
        "</g>";
    }).join("");
    const label = path[day].landmark || ("일상 구간 " + (day + 1));
    return '<div class="adv-map" data-adv-map="1">' +
      '<svg width="100%" height="280" viewBox="' + camX.toFixed(1) + ' 0 360 230" aria-label="천국의 길 미니맵">' +
      '<defs><linearGradient id="adv-sky" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#8ec8e4"/><stop offset="55%" stop-color="#d7eef5"/><stop offset="100%" stop-color="#f3e2b8"/>' +
      "</linearGradient></defs>" +
      '<rect x="' + (camX - 40).toFixed(1) + '" y="0" width="440" height="230" fill="url(#adv-sky)"/>' +
      tiles +
      '<path d="' + pathD + '" fill="none" stroke="#5b3a2a" stroke-width="8" stroke-linecap="round" opacity="0.28"/>' +
      '<path d="' + pathD + '" fill="none" stroke="#f0c14a" stroke-width="3.2" stroke-dasharray="6 4" stroke-linecap="round"/>' +
      nodes + chibiSvg(me.x, me.y - 2, walking ? walkT * Math.PI * 8 : 0) +
      "</svg>" +
      '<div class="adv-badge"><strong>미니맵 · Day ' + (day + 1) + "/" + path.length + "</strong>" +
      "<span>" + label + (walking ? " · 이동" : "") + (day >= path.length - 1 && label !== "보좌" ? " · 보좌" : "") +
      "</span></div></div>";
  }

  root.LampAdventure = {
    hangulLen,
    buildPacks,
    buildPath,
    mapHtml,
    LANDMARKS
  };
})(typeof window !== "undefined" ? window : globalThis);

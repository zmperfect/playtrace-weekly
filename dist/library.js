"use strict";

const libraryGenres = ["动作", "射击", "平台跳跃", "解谜", "策略", "角色扮演", "卡牌", "Roguelike", "模拟经营", "生存建造", "叙事冒险", "节奏", "竞速", "体育", "休闲", "社交协作", "其他"];
const releasePeriods = ["2007-2016", "2017-2026"];
const referenceFiles = [
  ...releasePeriods.map(period => ({ name: "reference-" + period, label: period.replace("-", "–") + " 年参考库" })),
  { name: "award-selections", label: "奖项选游" }
].map(file => ({ ...file, state: "idle", games: [] }));
const awardStatuses = { winner: "获奖", nominee: "提名" };
const awardEvents = new Map([
  ["IGF", "独立游戏节（IGF）"],
  ["BAFTA Games Awards", "英国电影和电视艺术学院游戏奖（BAFTA）"],
  ["GDCA", "游戏开发者选择奖（GDCA）"],
  ["The Game Awards", "The Game Awards（TGA）"]
]);
const awardCategories = new Map([
  ["Seumas McNally Grand Prize", "年度大奖"], ["Grand Prize", "年度大奖"],
  ["Game of the Year", "年度游戏"], ["Best Game", "最佳游戏"],
  ["Best Design", "最佳游戏设计"], ["Game Design", "最佳游戏设计"], ["Best Game Design", "最佳游戏设计"],
  ["Innovation Award", "创新奖"], ["Nuovo Award", "Nuovo 创新奖"],
  ["Debut Game", "首作奖"], ["Best Debut", "最佳首作"], ["Best Debut Independent Game", "最佳独立首作"],
  ["Best Independent Game", "最佳独立游戏"], ["Best Student Game", "最佳学生游戏"], ["Best Visual Art", "最佳视觉艺术"],
  ["Excellence in Design", "卓越设计"], ["Excellence in Visual Art", "卓越视觉艺术"],
  ["Excellence in Audio", "卓越音效"], ["Excellence in Narrative", "卓越叙事"],
  ["Best Audio Design", "最佳音效设计"], ["Games for Impact", "最具影响力游戏"],
  ["Game Beyond Entertainment", "超越娱乐游戏奖"], ["Social Impact Award", "社会影响力奖"],
  ["New Intellectual Property", "最佳原创 IP"], ["Narrative", "叙事奖"],
  ["Audience Award", "观众奖"], ["Best Narrative", "最佳叙事"]
]);
let libraryRows = [];
let libraryById = new Map();

function inLibrary() {
  return location.hash === "#library" || location.hash.startsWith("#library?");
}

function releaseYear(game) {
  const value = Number(game.year);
  return Number.isInteger(value) && value >= 1900 && value <= 2200 ? value : null;
}

function genresOf(game) {
  const genres = Array.isArray(game.genres) && game.genres.length ? game.genres : tagsOf(game);
  const recognized = libraryGenres.filter(genre => genres.includes(genre));
  return recognized.length ? recognized : ["其他"];
}

function mergeAwards(...lists) {
  const records = new Map();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const award of list) {
      if (!award || typeof award.event !== "string" || !award.event.trim() || typeof award.category !== "string" || !award.category.trim()) continue;
      const url = safeUrl(award.url);
      if (!Number.isInteger(award.year) || !Object.hasOwn(awardStatuses, award.status) || !url) continue;
      const event = award.event.trim(), category = award.category.trim();
      const key = JSON.stringify([event, award.year, category, award.status]);
      if (!records.has(key)) records.set(key, { event, category, year: award.year, status: award.status, url });
    }
  }
  return Array.from(records.values()).sort((a, b) => b.year - a.year || a.event.localeCompare(b.event) ||
    (a.status === b.status ? a.category.localeCompare(b.category) : a.status === "winner" ? -1 : 1));
}

function identityKeys(game) {
  const normalize = name => name.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const keys = [game.title, game.titleEn].filter(value => typeof value === "string" && value.trim()).map(normalize);
  const steam = safeUrl(game.url).match(/^https?:\/\/store\.steampowered\.com\/app\/(\d+)(?:\/|$)/i);
  if (steam) keys.unshift("steam:" + steam[1]);
  return keys.filter(Boolean);
}

function sameGame(left, right) {
  if (left.id === right.id) return true;
  const keys = identityKeys(left);
  const shared = identityKeys(right).filter(key => keys.includes(key));
  if (shared.some(key => key.startsWith("steam:"))) return true;
  return shared.length > 0 && (!releaseYear(left) || !releaseYear(right) || releaseYear(left) === releaseYear(right));
}

function entryKey(game, stored = entries) {
  if (stored.has(game.id)) return game.id;
  for (const entry of stored.values()) {
    if (libraryById.get(entry.id)?.id === game.id || sameGame(entry.game, game)) return entry.id;
  }
  return game.id;
}

function rebuildLibrary() {
  const rows = [];
  const byId = new Map();
  const byNameOrStore = new Map();
  const weekly = [];
  const seen = new Set();
  for (const issue of issues) {
    for (const game of issue.games) {
      if (seen.has(game.id)) continue;
      seen.add(game.id);
      weekly.push({ ...gamesById.get(game.id), issueId: issue.id });
    }
  }
  function add(game, source) {
    const keys = identityKeys(game);
    let row = byId.get(game.id);
    if (!row) {
      for (const key of keys) {
        const matches = byNameOrStore.get(key);
        row = matches?.find(item => key.startsWith("steam:") || !releaseYear(item) || !releaseYear(game) || releaseYear(item) === releaseYear(game));
        if (row) break;
      }
    }
    if (!row) {
      row = { ...game, genres: genresOf(game), awards: mergeAwards(game.awards) };
      rows.push(row);
    } else {
      row.awards = mergeAwards(row.awards, game.awards);
      row.genres = libraryGenres.filter(genre => row.genres.includes(genre) || genresOf(game).includes(genre));
      if (row.genres.length > 1) row.genres = row.genres.filter(genre => genre !== "其他");
      if (!row.titleEn && game.titleEn) row.titleEn = game.titleEn;
      if (!releaseYear(row) && releaseYear(game)) {
        row.year = game.year;
        row.yearNote = game.yearNote;
      }
      if (releaseYear(row) === releaseYear(game) && !row.yearSourceUrl) row.yearSourceUrl = game.yearSourceUrl;
      if (!row.video && game.video) row.video = game.video;
      if (!row.criticNote && game.criticNote) row.criticNote = game.criticNote;
      if (!row.prototypeIdeas?.length && game.prototypeIdeas?.length) row.prototypeIdeas = game.prototypeIdeas;
    }
    if (source && !row.reference) {
      row.reference = game;
      row.referenceLabel = source.name === "award-selections" ? "奖项选游" : "历年参考";
    }
    byId.set(game.id, row);
    for (const key of keys) {
      if (!byNameOrStore.has(key)) byNameOrStore.set(key, []);
      const matches = byNameOrStore.get(key);
      if (!matches.includes(row)) matches.push(row);
    }
  }
  weekly.forEach(game => add(game, false));
  referenceFiles.forEach(file => file.games.forEach(game => add(game, file)));
  libraryById = byId;
  libraryRows = rows.sort((a, b) => (releaseYear(b) || 0) - (releaseYear(a) || 0) || a.title.localeCompare(b.title, "zh-CN"));
}

function loadReferences(retry = false) {
  const pending = referenceFiles.filter(file => file.state === "idle" || (retry && file.state === "failed"));
  if (!pending.length) return;
  for (const file of pending) file.state = "loading";
  Promise.all(pending.map(async file => {
    try {
      const response = await fetch(`./data/${file.name}.json`, { cache: "no-cache" });
      if (!response.ok) throw new Error("Archive unavailable");
      const data = await response.json();
      const games = Array.isArray(data) ? data : data.games;
      if (!Array.isArray(games) || !games.length || !games.every(game => typeof game?.id === "string" && typeof game.title === "string")) throw new Error("Invalid archive");
      file.games = games;
      file.state = "ready";
    } catch {
      file.state = "failed";
    }
  })).then(() => {
    rebuildLibrary();
    for (const slot of document.querySelectorAll(".award-records[data-game]")) {
      const game = libraryById.get(slot.dataset.game);
      if (game) fillAwardRecords(slot, game.awards);
    }
    if (inLibrary() && !detail.open) refreshLibraryResults();
    else if (inNotebook() && !detail.open) render();
    else {
      const weekly = document.getElementById("weekly-genres");
      if (weekly) showGenreOptions(weekly, {}, libraryRows);
    }
  });
}

function libraryFilters() {
  const params = new URLSearchParams(inLibrary() ? location.hash.split("?")[1] : "");
  const status = params.get("awardStatus");
  return {
    genre: params.get("genre") || "",
    year: params.get("year") || "",
    period: params.get("period") || "",
    q: params.get("q") || "",
    award: params.get("award") || (Object.hasOwn(awardStatuses, status) ? "all" : ""),
    awardStatus: Object.hasOwn(awardStatuses, status) ? status : ""
  };
}

function libraryUrl(filters = {}) {
  const params = new URLSearchParams();
  for (const key of ["genre", "year", "period", "q", "award", "awardStatus"]) if (filters[key]) params.set(key, filters[key]);
  const query = params.toString();
  return query ? "#library?" + query : "#library";
}

function genreNavigation(weekly) {
  const section = element("section", "genre-browser");
  section.id = weekly ? "weekly-genres" : "library-genres";
  const head = element("div", "genre-browser-head");
  const heading = element("h2", "", weekly ? "按分类找游戏" : "游戏分类");
  heading.id = section.id + "-title";
  const status = element("p", "genre-browser-status");
  status.setAttribute("role", "status");
  head.append(heading);
  if (weekly) {
    const awards = element("a", "award-entry", "奖项选游");
    awards.href = libraryUrl({ award: "all" });
    awards.append(icon("arrow"));
    head.append(awards);
  }
  head.append(status);
  const links = element("nav", "genre-options");
  links.setAttribute("aria-labelledby", heading.id);
  section.append(head, links);
  return section;
}

function showGenreOptions(section, filters, games) {
  const weekly = section.id === "weekly-genres";
  const status = section.querySelector(".genre-browser-status");
  const links = section.querySelector(".genre-options");
  const focusedGenre = links.contains(document.activeElement) ? document.activeElement.dataset.genre : undefined;
  const loading = referenceFiles.some(file => file.state === "loading") || (!issues.length && !issueLoadFailed);
  const failed = referenceFiles.some(file => file.state === "failed");
  const counts = new Map();
  for (const game of games) {
    for (const genre of genresOf(game)) counts.set(genre, (counts.get(genre) || 0) + 1);
  }
  status.replaceChildren();
  if (loading) status.textContent = "正在补齐分类，数量按已载入的游戏统计";
  else if (failed || issueLoadFailed) {
    status.textContent = "仅统计已载入的游戏";
    if (weekly && failed) status.append(button("genre-retry", "重新加载", () => {
      loadReferences(true);
      showGenreOptions(section, filters, libraryRows);
    }));
  } else if (weekly) status.textContent = `游戏库共 ${games.length} 款`;
  status.hidden = !status.childNodes.length;

  function chip(genre, count) {
    const label = genre || "全部分类";
    const link = element("a", "genre-option", label);
    link.href = libraryUrl({ ...filters, genre });
    link.dataset.genre = genre;
    link.append(element("span", "genre-option-count", String(count)));
    link.setAttribute("aria-label", `${label}，${count} 款游戏`);
    if (!weekly && genre === (filters.genre || "")) link.setAttribute("aria-current", "page");
    return link;
  }
  const items = weekly ? [] : [chip("", games.length)];
  const available = libraryGenres.filter(genre => counts.has(genre) || genre === filters.genre);
  if (filters.genre && !available.includes(filters.genre)) available.push(filters.genre);
  for (const genre of available) items.push(chip(genre, counts.get(genre) || 0));
  links.replaceChildren(...items);
  if (focusedGenre !== undefined) items.find(link => link.dataset.genre === focusedGenre)?.focus({ preventScroll: true });
}

function genreLinks(game) {
  const box = element("span", "genre-links");
  for (const genre of genresOf(game)) {
    const link = element("a", "genre-link", genre);
    link.href = libraryUrl({ ...(inLibrary() ? libraryFilters() : {}), genre });
    link.setAttribute("aria-label", `在游戏库查看${genre}游戏`);
    link.addEventListener("click", () => { if (detail.open) detail.close(); });
    box.append(link);
  }
  return box;
}

function yearText(game) {
  const year = releaseYear(game);
  return year ? `${year} 年发行` : "发行年份未知";
}

function yearEvidence(game) {
  const note = element("p", "library-year-note");
  if (game.yearNote) note.append(document.createTextNode(game.yearNote));
  const url = safeUrl(game.yearSourceUrl);
  const references = [game.sourceUrl || game.signalUrl, game.reference?.sourceUrl].map(value => safeUrl(value));
  if (url && !references.includes(url)) {
    note.append(watchLink(url, "发行依据", `查看《${game.title}》的发行年份依据`));
  }
  return note.childNodes.length ? note : null;
}

function awardEvidence(game) {
  const box = element("section", "award-records");
  box.dataset.game = game.id;
  box.setAttribute("aria-label", `《${game.title}》的获奖与提名记录`);
  fillAwardRecords(box, libraryById.get(game.id)?.awards || mergeAwards(game.awards));
  return box;
}

function fillAwardRecords(box, awards) {
  box.replaceChildren();
  box.hidden = !awards.length;
  const groups = new Map();
  for (const record of awards) {
    const key = JSON.stringify([record.event, record.year, record.url]);
    if (!groups.has(key)) {
      const group = element("div", "award-group");
      const head = element("div", "award-head");
      head.append(element("strong", "", awardEvents.get(record.event) || record.event), element("span", "", `${record.year} 年颁奖`),
        watchLink(record.url, "奖方记录", `查看 ${record.year} 年 ${record.event} 的官方记录`));
      const list = element("ul", "award-list");
      group.append(head, list);
      box.append(group);
      groups.set(key, list);
    }
    const item = element("li");
    const name = element("span");
    const translated = awardCategories.get(record.category);
    if (translated) name.append(document.createTextNode(translated + " "), element("span", "award-original", record.category));
    else name.textContent = record.category;
    item.append(element("span", "award-result " + record.status, awardStatuses[record.status]), name);
    groups.get(key).append(item);
  }
}

function referenceDigest(game) {
  const reference = game.reference || (game.id.startsWith("ref-") ? game : null);
  if (!reference) return null;
  const box = element("section", "reference-digest");
  box.setAttribute("aria-label", `${game.title}的设计参考`);
  for (const [label, value] of [["玩法核心", reference.core], ["设计借鉴", reference.lesson]]) {
    if (!value) continue;
    const p = element("p", "review-line");
    p.append(element("strong", "review-label", label), document.createTextNode(value));
    box.append(p);
  }
  const url = safeUrl(reference.sourceUrl);
  if (url) {
    const label = reference.sourceLabel || "查看出处";
    const source = element("div", "reference-source");
    source.append(element("span", "", "参考来源"), watchLink(url, label, `阅读《${game.title}》的参考来源 · ${label}`));
    box.append(source);
  }
  const critic = reference.criticNote || game.criticNote;
  const criticUrl = safeUrl(critic?.url);
  if (criticUrl && typeof critic.text === "string" && critic.text.trim() && typeof critic.label === "string" && critic.label.trim()) {
    const line = element("p", "review-line critic-note");
    line.append(element("strong", "review-label", "测评观察"), document.createTextNode(critic.text),
      watchLink(criticUrl, critic.label, `阅读《${game.title}》的测评原文 · ${critic.label}`));
    box.append(line);
  }
  return box;
}

function libraryCard(game, inNotes = false) {
  const article = element("article", "library-card");
  const head = element("div", "library-card-head");
  const names = element("div");
  const meta = element("p", "library-card-meta", yearText(game));
  meta.append(element("span", "", game.issueId ? "周刊选游" : game.referenceLabel || "历年参考"));
  const heading = element("h3");
  heading.append(openButton(game, "", game.title));
  names.append(meta, heading);
  if (game.titleEn && game.titleEn !== game.title) names.append(element("p", "library-en", game.titleEn));
  const imageUrl = safeUrl(game.image, true);
  if (imageUrl) {
    const image = element("img", "library-thumb");
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    image.addEventListener("error", () => image.remove(), { once: true });
    image.src = imageUrl;
    head.append(image);
  }
  head.append(names, bookmark(game));
  article.append(head, genreLinks(game));
  const evidence = yearEvidence(game);
  if (evidence) article.append(evidence);
  article.append(awardEvidence(game));
  const mechanisms = game.reference?.mechanics || game.mechanics || tagsOf(game);
  if (Array.isArray(mechanisms) && mechanisms.length) article.append(element("p", "library-mechanics", mechanisms.join(" / ")));
  const digest = referenceDigest(game) || reviewDigest(game);
  if (digest) article.append(digest);
  else if (game.mechanic) article.append(element("p", "library-mechanics", game.mechanic));
  const media = element("div", "library-media");
  const watch = videoSection(game, article, media);
  article.append(media, watch, prototypeIdeas(game, "h4"));
  const note = entries.get(entryKey(game))?.note;
  if (inNotes && note) article.append(element("p", "note-snippet", note));
  const foot = element("div", "card-foot");
  const read = openButton(game, "", inNotes && note ? "编辑笔记" : "玩法与笔记", inNotes && note ? "note" : "");
  read.append(icon(inNotes && note ? "pencil" : "arrow"));
  foot.append(read, gameLink(game, ""));
  article.append(foot);
  return article;
}

function filteredLibrary(filters) {
  const terms = filters.q.normalize("NFKC").toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return libraryRows.filter(game => {
    const year = releaseYear(game);
    const genres = genresOf(game);
    if (filters.genre && !genres.includes(filters.genre)) return false;
    if (filters.award && !game.awards.some(record =>
      (filters.award === "all" || record.event === filters.award) &&
      (!filters.awardStatus || record.status === filters.awardStatus))) return false;
    if (filters.year && (filters.year === "unknown" ? year !== null : year !== Number(filters.year))) return false;
    if (filters.period) {
      const [start, end] = filters.period.split("-").map(Number);
      if (!year || !Number.isInteger(start) || !Number.isInteger(end) || year < start || year > end) return false;
    }
    const reference = game.reference || {};
    const text = [game.title, game.titleEn, game.mechanic, game.review?.core, game.review?.appeal, reference.title, reference.titleEn,
      reference.core, reference.lesson, ...(reference.mechanics || []), ...genres, ...tagsOf(game),
      ...game.awards.flatMap(record => [record.event, awardEvents.get(record.event), record.category, awardCategories.get(record.category)])].filter(Boolean).join(" ").normalize("NFKC").toLocaleLowerCase();
    return terms.every(term => text.includes(term));
  });
}

function libraryYearOptions(select, filters) {
  const selected = filters.year ? "year:" + filters.year : filters.period ? "period:" + filters.period : "";
  select.replaceChildren(new Option("全部发行时间", ""));
  const periods = element("optgroup");
  periods.label = "发行时期";
  for (const period of releasePeriods) periods.append(new Option(period.replace("-", "–") + " 年", "period:" + period));
  select.append(periods);
  const group = element("optgroup");
  group.label = "具体发行年份";
  const years = new Set(libraryRows.map(releaseYear).filter(Boolean));
  if (/^\d{4}$/.test(filters.year)) years.add(Number(filters.year));
  for (const year of [...years].sort((a, b) => b - a)) group.append(new Option(year + " 年", "year:" + year));
  group.append(new Option("发行年份未知", "year:unknown"));
  select.append(group);
  select.value = selected;
}

function refreshLibraryResults() {
  const results = document.getElementById("library-results");
  if (!results) return;
  stopVideo();
  const filters = libraryFilters();
  const genreTitle = filters.genre ? filters.genre + "游戏" : "";
  const heading = filters.award ? [genreTitle, "奖项选游"].filter(Boolean).join(" · ") : genreTitle || "游戏库";
  document.getElementById("library-heading").textContent = heading;
  document.title = heading + " · 游感周刊";
  const matches = filteredLibrary({ ...filters, genre: "" });
  showGenreOptions(document.getElementById("library-genres"), filters, matches);
  libraryYearOptions(document.getElementById("library-year"), filters);
  const award = document.getElementById("library-award");
  award.replaceChildren(new Option("不限奖项", ""), new Option("全部奖项选游", "all"));
  const events = new Set(libraryRows.flatMap(game => game.awards.map(record => record.event)));
  if (filters.award && filters.award !== "all") events.add(filters.award);
  for (const event of Array.from(events).sort()) award.append(new Option(awardEvents.get(event) || event, event));
  award.value = filters.award;
  document.getElementById("library-award-status").value = filters.awardStatus;
  const games = filters.genre ? matches.filter(game => genresOf(game).includes(filters.genre)) : matches;
  document.getElementById("library-count").textContent = `${games.length} 款游戏`;
  document.getElementById("library-clear").hidden = !Object.values(filters).some(Boolean);
  const notice = document.getElementById("library-status");
  notice.replaceChildren();
  const failed = referenceFiles.filter(file => file.state === "failed");
  if (failed.length) {
    notice.append(document.createTextNode(`${failed.map(file => file.label).join("、")}暂时无法载入。 `),
      button("outline-btn", "重新加载参考库", () => { loadReferences(true); refreshLibraryResults(); }));
  } else if (referenceFiles.some(file => file.state === "loading")) {
    notice.textContent = "正在载入游戏资料…";
  }
  if (issueLoadFailed) {
    notice.append(document.createTextNode(" 周刊选游暂时无法载入。 "), button("outline-btn", "重新加载周刊", load));
  }
  notice.hidden = !notice.childNodes.length;
  if (games.length) {
    results.replaceChildren(...games.map(game => libraryCard(game)));
  } else if (referenceFiles.some(file => file.state === "loading") && !failed.length) {
    results.replaceChildren();
  } else {
    const empty = element("div", "empty");
    empty.append(element("h2", "", "没有符合条件的游戏"), element("p", "", "可以换个玩法关键词，或清除筛选查看全部游戏。"));
    const reset = element("a", "", "查看全部游戏");
    reset.href = "#library";
    empty.append(reset);
    results.replaceChildren(empty);
  }
}

function libraryView() {
  const filters = libraryFilters();
  const head = element("div", "library-head");
  const heading = element("h1", "", "游戏库");
  heading.id = "library-heading";
  head.append(heading, element("p", "", "从周刊选游和历年作品中，找一个值得借鉴的玩法。"));
  const categories = genreNavigation(false);
  categories.addEventListener("click", event => {
    const link = event.target.closest("a.genre-option");
    if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (location.hash === link.hash) return;
    history.pushState(null, "", link.hash);
    refreshLibraryResults();
  });
  const form = element("form", "library-filters");
  form.setAttribute("role", "search");
  form.setAttribute("aria-label", "筛选游戏库");
  const search = element("input");
  search.id = "library-search";
  search.type = "search";
  search.placeholder = "搜中英文游戏名或玩法关键词";
  search.value = filters.q;
  const year = element("select");
  year.id = "library-year";
  libraryYearOptions(year, filters);
  const award = element("select");
  award.id = "library-award";
  const status = element("select");
  status.id = "library-award-status";
  status.append(new Option("不限结果", ""));
  for (const [value, label] of Object.entries(awardStatuses)) status.append(new Option(label, value));
  for (const [label, control] of [["搜索游戏", search], ["发行时间", year], ["游戏奖项", award], ["奖项结果", status]]) {
    const field = element("label");
    const caption = element("span", "", label);
    caption.id = control.id + "-label";
    control.setAttribute("aria-labelledby", caption.id);
    field.append(caption, control);
    form.append(field);
  }
  function apply(push = false) {
    const [kind, value] = year.value.split(":");
    const hash = libraryUrl({ q: search.value.trim(), genre: libraryFilters().genre, [kind]: value, award: award.value, awardStatus: status.value });
    if (location.hash !== hash) history[push ? "pushState" : "replaceState"](null, "", hash);
    refreshLibraryResults();
  }
  search.addEventListener("input", event => { if (!event.isComposing) apply(); });
  search.addEventListener("compositionend", () => apply());
  year.addEventListener("change", () => apply(true));
  award.addEventListener("change", () => {
    if (!award.value) status.value = "";
    apply(true);
  });
  status.addEventListener("change", () => {
    if (status.value && !award.value) award.value = "all";
    apply(true);
  });
  form.addEventListener("submit", event => { event.preventDefault(); apply(); });
  const bar = element("div", "library-result-head");
  const count = element("p", "library-count");
  count.id = "library-count";
  count.setAttribute("role", "status");
  const clear = element("a", "library-clear", "清除筛选");
  clear.href = "#library";
  clear.id = "library-clear";
  const actions = element("div", "library-filter-actions");
  const copy = button("library-clear", "复制筛选链接", async () => {
    actions.querySelector("input")?.remove();
    try {
      await navigator.clipboard.writeText(location.href);
      announce("筛选链接已复制。");
      copy.textContent = "已复制";
      setTimeout(() => { copy.textContent = "复制筛选链接"; }, 1600);
    } catch {
      const field = element("input", "library-share-url");
      field.value = location.href;
      field.readOnly = true;
      field.setAttribute("aria-label", "复制此筛选链接");
      actions.append(field);
      field.focus();
      field.select();
    }
  });
  actions.append(copy, clear);
  bar.append(count, actions);
  const notice = element("div", "library-status");
  notice.id = "library-status";
  notice.setAttribute("role", "status");
  const results = element("div", "library-results");
  results.id = "library-results";
  return [head, categories, form, bar, notice, results];
}

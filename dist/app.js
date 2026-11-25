"use strict";

const main = document.getElementById("main");
const detail = document.getElementById("detail");
const detailBody = document.getElementById("detail-body");
const notebookKey = "playtrace.notebook.v1";
const svgNamespace = "http://www.w3.org/2000/svg";
let issues = [];
let entries = readEntries();
let activeIssue = null;
let filter = "all";
let dialogOpener = null;
let storageError = false;
let activeVideo = null;
let gamesById = new Map();

function readEntries() {
  try {
    const saved = JSON.parse(localStorage.getItem(notebookKey) || "[]");
    if (!Array.isArray(saved)) return new Map();
    return new Map(saved.filter(item =>
      item && typeof item.id === "string" && item.game && (item.saved || item.note)
    ).map(item => [item.id, item]));
  } catch {
    return new Map();
  }
}

function remember(game, change) {
  const latest = storageError ? entries : readEntries();
  const entry = { id: game.id, saved: false, note: "", ...latest.get(game.id), ...change, game };
  if (entry.saved || entry.note.trim()) latest.set(game.id, entry);
  else latest.delete(game.id);
  entries = latest;
  try {
    localStorage.setItem(notebookKey, JSON.stringify(Array.from(entries.values())));
    storageError = false;
  } catch {
    storageError = true;
  }
  updateNavigation();
  return entry;
}

function element(tag, className, text) {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}

function icon(id) {
  const svg = document.createElementNS(svgNamespace, "svg");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(svgNamespace, "use");
  use.setAttribute("href", "#" + id);
  svg.append(use);
  return svg;
}

function button(className, text, onClick) {
  const result = element("button", className, text);
  result.type = "button";
  result.addEventListener("click", onClick);
  return result;
}

function safeUrl(value, relative = false) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const result = relative ? new URL(value, document.baseURI) : new URL(value);
    return ["http:", "https:"].includes(result.protocol) ? result.href : "";
  } catch {
    return "";
  }
}

function gameLink(game, className) {
  const url = safeUrl(game.url);
  if (!url) return document.createDocumentFragment();
  const link = element("a", className, game.action || "查看游戏");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.append(icon("external"));
  return link;
}

function playableSource(video) {
  if (!video) return null;
  const start = Number.isSafeInteger(video.start) && video.start > 0 ? video.start : 0;
  if (video.provider === "youtube" && /^[A-Za-z0-9_-]{11}$/.test(video.id)) {
    const url = new URL("https://www.youtube.com/embed/" + video.id);
    url.searchParams.set("autoplay", "1");
    url.searchParams.set("playsinline", "1");
    if (start) url.searchParams.set("start", start);
    return { url, label: "YouTube", embed: true };
  }
  if (video.provider === "bilibili" && /^BV[A-Za-z0-9]{10}$/.test(video.id)) {
    const url = new URL("https://player.bilibili.com/player.html");
    url.search = new URLSearchParams({ bvid: video.id, isOutside: "true", autoplay: "1", danmaku: "0" });
    if (start) url.searchParams.set("t", start);
    return { url, label: "哔哩哔哩", embed: true };
  }
  if (!["local", "steam"].includes(video.provider)) return null;
  const src = safeUrl(video.src, video.provider === "local");
  if (!src) return null;
  const url = new URL(src);
  if (video.provider === "local" && url.origin !== location.origin) return null;
  if (!/\.(mp4|webm|m3u8)$/i.test(url.pathname)) return null;
  if (start) url.hash = "t=" + start;
  return { url, label: video.provider === "steam" ? "Steam" : "站内视频", embed: false };
}

function stopVideo() {
  if (!activeVideo) return;
  const { stage, toggle, article, mediaBox } = activeVideo;
  activeVideo = null;
  const video = stage.querySelector("video");
  if (video) {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
  stage.replaceChildren();
  stage.hidden = true;
  toggle.setAttribute("aria-expanded", "false");
  toggle.querySelector(".watch-verb").textContent = "播放实机";
  toggle.querySelector("use").setAttribute("href", "#play");
  article.classList.remove("video-open");
  mediaBox.classList.remove("media-playing");
}

function playablePreview(video) {
  const preview = video?.preview;
  if (!preview || !["steam", "local"].includes(preview.provider)) return null;
  const source = playableSource(preview);
  if (!source) return null;
  const extension = source.url.pathname.split(".").pop().toLowerCase();
  const mime = { mp4: "video/mp4", webm: "video/webm", m3u8: "application/vnd.apple.mpegurl" }[extension];
  return document.createElement("video").canPlayType(mime) ? source : null;
}

function watchLink(url, text, accessibleName) {
  const link = element("a", "watch-original", text);
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.setAttribute("aria-label", accessibleName);
  link.append(icon("external"));
  return link;
}

function videoSection(game, article, mediaBox) {
  const video = game.video;
  const original = playableSource(video);
  const preview = playablePreview(video);
  if (!original && !preview) return document.createDocumentFragment();

  let source = preview || original;
  let clip = preview ? video.preview : video;
  const stage = element("div", "player-stage");
  stage.id = "player-" + game.id;
  stage.hidden = true;
  mediaBox.append(stage);
  const section = element("section", "watch");
  section.setAttribute("aria-label", `《${game.title}》实机视频`);
  const bar = element("div", "watch-bar");
  const title = element("p", "watch-title");
  const credit = element("p", "watch-credit");
  const originalUrl = safeUrl(video.url, video.provider === "local") || (original && !original.embed ? original.url.href : safeUrl(game.url));
  const fullLabel = preview ? `${original?.label || "平台"} 完整实况 · ${video.creator || "未署名"}` : "原片";
  const fullLink = () => watchLink(originalUrl, fullLabel, `在新窗口打开《${game.title}》${fullLabel}`);

  function showCaption() {
    title.textContent = clip.title || `${game.title} 实机片段`;
    const previewUrl = source === preview && safeUrl(clip.url, clip.provider === "local");
    const platform = previewUrl ? watchLink(previewUrl, source.label, `查看《${game.title}》预览片来源`) : document.createTextNode(source.label);
    const sound = clip.silent === true ? " · 无声" : clip.silent === false ? " · 有声" : "";
    credit.replaceChildren(platform, document.createTextNode(` · ${clip.creator || "未署名"}${sound}`));
  }

  function play() {
    stage.replaceChildren();
    const playerTitle = `${game.title} · ${clip.title || "实机视频"}`;
    if (source.embed) {
      const frame = element("iframe");
      frame.title = playerTitle;
      frame.allow = "autoplay; fullscreen; encrypted-media; picture-in-picture";
      frame.allowFullscreen = true;
      frame.referrerPolicy = "strict-origin-when-cross-origin";
      frame.src = source.url.href;
      stage.append(frame);
      return;
    }
    const player = element("video");
    player.controls = true;
    player.playsInline = true;
    player.setAttribute("aria-label", playerTitle);
    player.addEventListener("error", () => {
      if (!stage.contains(player)) return;
      if (source === preview && original) {
        source = original;
        clip = video;
        showCaption();
        announce("预览片暂时无法播放，已切换到完整实况。");
        play();
        return;
      }
      const message = element("p", "player-error", "这段视频暂时无法播放。");
      if (originalUrl) message.append(document.createTextNode(" "), fullLink());
      stage.replaceChildren(message);
    }, { once: true });
    player.src = source.url.href;
    stage.append(player);
    player.play().catch(() => { /* Native controls remain available if autoplay is restricted. */ });
  }

  const toggle = button("watch-toggle", undefined, () => {
    const alreadyOpen = !stage.hidden;
    stopVideo();
    if (alreadyOpen) return;
    activeVideo = { stage, toggle, article, mediaBox };
    article.classList.add("video-open");
    mediaBox.classList.add("media-playing");
    toggle.setAttribute("aria-expanded", "true");
    toggle.querySelector(".watch-verb").textContent = "收起实机";
    toggle.querySelector("use").setAttribute("href", "#close");
    stage.hidden = false;
    play();
    if (stage.getBoundingClientRect().top < 0 || stage.getBoundingClientRect().bottom > window.innerHeight) {
      stage.scrollIntoView({ block: "nearest" });
    }
  });
  toggle.setAttribute("aria-controls", stage.id);
  toggle.setAttribute("aria-expanded", "false");
  toggle.append(icon("play"), element("span", "watch-verb", "播放实机"), element("span", "sr-only", `《${game.title}》`));
  bar.append(toggle);
  if (originalUrl && !preview) bar.append(fullLink());
  section.append(bar, title, credit);
  if (originalUrl && preview) {
    const full = element("div", "watch-full");
    full.append(fullLink());
    section.append(full);
  }
  showCaption();
  return section;
}

function art(game, index, featured) {
  const frame = element("span", `art style-${index % 5} ${featured ? "feature-art" : "card-art"}`);
  frame.setAttribute("aria-hidden", "true");
  const letters = element("span", "art-letter", Array.from(game.title).slice(0, 2).join("").toUpperCase());
  frame.append(letters);
  const url = safeUrl((featured && game.heroImage) || game.image, true);
  if (url) {
    const img = element("img");
    img.alt = "";
    img.decoding = "async";
    img.loading = featured || index < 5 ? "eager" : "lazy";
    if (featured) img.fetchPriority = "high";
    img.addEventListener("error", () => img.remove(), { once: true });
    img.src = url;
    frame.append(img);
  }
  return frame;
}

function announce(message) {
  document.getElementById("status").textContent = message;
}

function bookmark(game, withText = false) {
  const result = button(withText ? "outline-btn" : "save", undefined, () => {
    const next = remember(game, { saved: !Boolean(entries.get(game.id)?.saved) });
    update();
    announce(storageError ? "当前浏览器无法保存，收藏仅在本次打开时有效。" : next.saved ? "已加入灵感本。" : "已取消收藏。");
    if (inNotebook() && !detail.open) render();
  });
  function update() {
    const saved = Boolean(entries.get(game.id)?.saved);
    result.setAttribute("aria-pressed", String(saved));
    result.setAttribute("aria-label", `${saved ? "取消收藏" : "收藏"}《${game.title}》`);
    result.title = saved ? "取消收藏" : "收藏到灵感本";
    result.replaceChildren(icon("bookmark"));
    if (withText) result.append(document.createTextNode(saved ? "已收藏" : "收藏"));
  }
  update();
  return result;
}

function tagsOf(game) {
  return Array.isArray(game.tags) ? game.tags.filter(tag => typeof tag === "string" && tag.trim()) : [];
}

function openButton(game, className, text, target = "") {
  const result = button(className, text, () => openDetail(game, result, target));
  result.dataset.game = game.id;
  result.dataset.target = target;
  return result;
}

function coverFor(game, index, featured) {
  const image = art(game, index, featured);
  if (playableSource(game.video) || playablePreview(game.video)) {
    const cover = button("cover-button video-cover", undefined, () => {
      const control = cover.closest("article").querySelector(".watch-toggle");
      control.focus({ preventScroll: true });
      control.click();
    });
    cover.setAttribute("aria-label", `播放《${game.title}》实机视频`);
    const play = element("span", "cover-play");
    play.append(icon("play"));
    cover.append(image, play);
    return cover;
  }
  if (featured) return image;
  const cover = openButton(game, "cover-button", undefined);
  cover.setAttribute("aria-label", `查看《${game.title}》玩法`);
  cover.append(image);
  return cover;
}

function feature(game) {
  const article = element("article", "feature");
  const media = element("div", "feature-media");
  media.append(coverFor(game, 0, true));
  const contents = element("div", "feature-content");
  const top = element("div", "feature-top");
  const label = element("span", "feature-label");
  label.append(icon("focus"), document.createTextNode("本期焦点"));
  top.append(label, bookmark(game));
  const tags = element("div", "feature-tags");
  for (const item of [game.source, ...tagsOf(game).slice(0, 3)].filter(Boolean)) tags.append(element("span", "", item));
  const read = openButton(game, "primary", "查看玩法");
  read.append(icon("arrow"));
  const actions = element("div", "feature-actions");
  actions.append(read, gameLink(game, "external"));
  contents.append(top, element("h2", "", game.title), tags, element("p", "feature-signal", game.signal || game.mechanic), actions);
  contents.append(videoSection(game, article, media));
  article.append(media, contents);
  return article;
}

function card(game, index, inNotes = false) {
  const article = element("article", "card");
  const artWrap = element("div", "card-art-wrap");
  artWrap.append(coverFor(game, index, false), bookmark(game));
  const body = element("div", "card-body");
  const info = element("div", "card-info");
  info.append(element("span", "source", game.source || "游戏"));
  const tag = tagsOf(game)[0];
  if (tag) info.append(element("span", "", "·"), element("span", "", tag));
  const title = element("h3");
  title.append(openButton(game, "", game.title));
  body.append(info, title, element("p", "card-blurb", game.mechanic || game.signal));
  const entry = entries.get(game.id);
  if (inNotes && entry?.note) body.append(element("p", "note-snippet", entry.note));
  const foot = element("div", "card-foot");
  const read = openButton(game, "", inNotes && entry?.note ? "编辑笔记" : "查看玩法", inNotes && entry?.note ? "note" : "");
  read.append(icon(inNotes && entry?.note ? "pencil" : "arrow"));
  foot.append(read, gameLink(game, ""));
  body.append(foot);
  body.append(videoSection(game, article, artWrap));
  article.append(artWrap, body);
  return article;
}

function openDetail(game, opener, target = "") {
  stopVideo();
  dialogOpener = opener;
  const wrap = element("div", "dialog-main");
  const top = element("div", "dialog-top");
  const kicker = element("span", "dialog-kicker");
  kicker.append(icon("focus"), document.createTextNode("玩法观察"));
  const close = button("close", undefined, () => detail.close());
  close.setAttribute("aria-label", "关闭玩法观察");
  close.append(icon("close"));
  top.append(kicker, close);
  const title = element("h2", "", game.title);
  title.id = "detail-title";
  const source = [game.titleEn && game.titleEn !== game.title ? game.titleEn : "", game.source, ...tagsOf(game)].filter(Boolean).join("  /  ");
  wrap.append(top, title, element("p", "detail-source", source));
  const actions = element("div", "dialog-actions");
  actions.append(gameLink(game, "primary"), bookmark(game, true));
  wrap.append(actions);
  for (const [heading, text] of [["为什么入选", game.signal], ["玩家在做什么选择", game.mechanic]]) {
    if (!text) continue;
    const observation = element("section", "observation");
    observation.append(element("h3", "", heading), element("p", "", text));
    const evidenceUrl = safeUrl(game.sourceUrl || game.signalUrl);
    if (heading === "为什么入选" && evidenceUrl) {
      const evidence = element("a", "evidence", "查看来源");
      evidence.href = evidenceUrl;
      evidence.target = "_blank";
      evidence.rel = "noopener noreferrer";
      evidence.append(icon("external"));
      observation.append(evidence);
    }
    wrap.append(observation);
  }
  const notes = element("div", "note-form");
  const head = element("div", "note-header");
  const label = element("label");
  label.htmlFor = "game-note";
  label.append(icon("pencil"), document.createTextNode("我的改法"));
  const noteStatus = element("span", "note-status", "保存在此浏览器");
  noteStatus.id = "note-status";
  const prompt = element("p", "", game.prompt || "如果只改一条规则，你会怎么改？");
  prompt.id = "note-prompt";
  const input = element("textarea");
  input.id = "game-note";
  input.setAttribute("aria-describedby", "note-prompt note-status");
  input.placeholder = "写下一条你想试试的规则…";
  input.value = entries.get(game.id)?.note || "";
  input.addEventListener("input", () => {
    remember(game, { note: input.value });
    noteStatus.textContent = storageError ? "仅本次打开有效" : input.value.trim() ? "已保存到此浏览器" : "保存在此浏览器";
  });
  head.append(label, noteStatus);
  notes.append(head, prompt, input);
  wrap.append(notes);
  if (typeof game.artCredit === "string" && game.artCredit) {
    const credit = element("p", "art-credit", "封面图　" + game.artCredit);
    const creditUrl = safeUrl(game.artSource);
    if (creditUrl) {
      const link = element("a", "evidence", "图片出处");
      link.href = creditUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.append(icon("external"));
      credit.append(document.createTextNode("　"), link);
    }
    wrap.append(credit);
  }
  detailBody.replaceChildren(wrap);
  detail.showModal();
  if (target === "note") input.focus();
  else close.focus();
}

function weekLabel(issue) {
  const match = /^(\d{4})-W(\d{2})$/.exec(issue.id);
  return match ? `WEEK ${match[2]}` : issue.id;
}

function weekly() {
  const issue = activeIssue;
  const mast = element("div", "mast");
  const heading = element("div");
  const meta = element("div", "issue-meta");
  const date = element("time", "", issue.date.replaceAll("-", "."));
  date.dateTime = issue.date;
  meta.append(element("span", "signal-light"), element("span", "", weekLabel(issue)), element("span", "meta-line"), date);
  heading.append(meta, element("h1", "", issue === issues[0] ? "本周游戏观察" : "往期游戏观察"));
  const picker = element("label", "issue-picker");
  const select = element("select");
  select.setAttribute("aria-label", "选择周刊期次");
  for (const entry of issues) {
    const option = element("option", "", `${entry.date} · ${weekLabel(entry)} · ${entry.games.length} 款`);
    option.value = entry.id;
    select.append(option);
  }
  select.value = issue.id;
  select.addEventListener("change", () => { location.hash = "issue/" + encodeURIComponent(select.value); });
  picker.append(icon("layers"), element("span", "", "期刊档案"), icon("down"), select);
  mast.append(heading, picker);
  const nodes = [mast, feature(issue.games[0])];
  const rest = issue.games.slice(1);
  if (rest.length) {
    const section = element("section");
    const bar = element("div", "section-head");
    const label = element("div", "section-title");
    label.append(element("h2", "", "本期入选"));
    bar.append(label, element("span", "count", `另 ${rest.length} 款游戏`));
    const cards = element("div", "cards");
    rest.forEach((game, index) => cards.append(card(game, index + 1)));
    section.append(bar, cards);
    nodes.push(section);
  }
  return nodes;
}

function notebook() {
  const heading = element("div", "notebook-head");
  const meta = element("div", "issue-meta");
  meta.append(element("span", "signal-light"), element("span", "", "FIELD NOTES"));
  heading.append(meta, element("h1", "", "我的灵感本"), element("p", "", "收藏的游戏和写过的改法都保存在这个浏览器里。"));
  const filters = element("div", "filter-row");
  filters.setAttribute("aria-label", "筛选灵感");
  filters.setAttribute("role", "group");
  for (const [id, label] of [["all", "全部"], ["saved", "已收藏"], ["notes", "有笔记"]]) {
    const item = button("filter", label, () => {
      filter = id;
      render();
      main.querySelector(".filter[aria-pressed=true]")?.focus();
    });
    item.setAttribute("aria-pressed", String(filter === id));
    filters.append(item);
  }
  const visible = Array.from(entries.values()).filter(entry =>
    filter === "all" || (filter === "saved" ? entry.saved : entry.note?.trim())
  ).reverse();
  if (!visible.length) {
    const empty = element("section", "empty");
    const back = element("a", "", "去看本期周刊");
    back.href = "#weekly";
    empty.append(icon("book"), element("h2", "", filter === "notes" ? "还没有玩法笔记" : filter === "saved" ? "还没有收藏的游戏" : "灵感本还是空的"), element("p", "", "读到有意思的玩法时，点收藏，或在「我的改法」留下一句话。"), back);
    return [heading, filters, empty];
  }
  const cards = element("div", "cards");
  visible.forEach((entry, index) => {
    const game = { ...entry.game, ...gamesById.get(entry.id) };
    cards.append(card(game, index, true));
  });
  return [heading, filters, cards];
}

function inNotebook() {
  return location.hash === "#notebook";
}

function updateNavigation() {
  const notes = inNotebook();
  const weekLink = document.getElementById("weekly-nav");
  const noteLink = document.getElementById("notes-nav");
  (notes ? noteLink : weekLink).setAttribute("aria-current", "page");
  (notes ? weekLink : noteLink).removeAttribute("aria-current");
  const count = document.getElementById("notes-count");
  count.textContent = String(entries.size);
  count.hidden = entries.size === 0;
}

function render() {
  if (!issues.length) return;
  stopVideo();
  if (location.hash.startsWith("#issue/")) {
    let issueId;
    try { issueId = decodeURIComponent(location.hash.slice(7)); } catch { issueId = ""; }
    activeIssue = issues.find(issue => issue.id === issueId) || issues[0];
  } else if (location.hash === "#weekly" || !activeIssue) {
    activeIssue = issues[0];
  }
  updateNavigation();
  main.replaceChildren(...(inNotebook() ? notebook() : weekly()));
  document.title = `${inNotebook() ? "我的灵感本" : "游戏观察"} · 游感周刊`;
}

detail.addEventListener("click", event => {
  if (event.target !== detail) return;
  const box = detail.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) detail.close();
});
detail.addEventListener("close", () => {
  const oldId = dialogOpener?.dataset.game;
  const oldTarget = dialogOpener?.dataset.target;
  const oldClass = dialogOpener?.className;
  render();
  const opener = Array.from(main.querySelectorAll("button[data-game]")).find(el =>
    el.dataset.game === oldId && el.dataset.target === oldTarget && el.className === oldClass
  );
  (opener || main).focus({ preventScroll: true });
  dialogOpener = null;
});
window.addEventListener("hashchange", () => {
  if (detail.open) detail.close();
  if (location.hash === "#main") return;
  render();
  window.scrollTo(0, 0);
});
document.addEventListener("keydown", event => {
  if (event.key !== "Escape" || !activeVideo || document.fullscreenElement) return;
  const { toggle } = activeVideo;
  stopVideo();
  toggle.focus({ preventScroll: true });
});
window.addEventListener("pagehide", stopVideo);
document.querySelector(".skip").addEventListener("click", event => {
  event.preventDefault();
  main.focus();
  main.scrollIntoView();
});
window.addEventListener("storage", event => {
  if (event.key !== notebookKey && event.key !== null) return;
  entries = readEntries();
  updateNavigation();
  if (!detail.open) render();
});

async function load() {
  try {
    const response = await fetch("./data/issues.json", { cache: "no-cache" });
    if (!response.ok) throw new Error("Cannot load editions");
    const data = await response.json();
    issues = data.issues.filter(issue => typeof issue?.id === "string" && typeof issue.date === "string" && Array.isArray(issue.games) && issue.games.length);
    if (!issues.length) throw new Error("No editions");
    gamesById = new Map();
    for (const issue of [...issues].reverse()) {
      for (const game of issue.games) gamesById.set(game.id, { ...gamesById.get(game.id), ...game });
    }
    activeIssue = issues[0];
    render();
  } catch {
    const state = element("div", "empty");
    state.append(element("h2", "", "暂时无法打开周刊"), element("p", "", "请检查网络后重新加载。"), button("outline-btn", "重新加载", load));
    main.replaceChildren(state);
  }
}
load();

"""Collect one complete issue from the Steam charts and itch.io's web Game Jam feed."""

import argparse
import html
import itertools
import json
import os
import re
import sys
import tempfile
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

if __package__:
    from .prototypes import add_prototype_ideas, valid_ideas
    from .reviews import itch_review, steam_review, summarize
    from .videos import itch_recording, steam_preview, steam_recording, youtube_segment
else:
    from prototypes import add_prototype_ideas, valid_ideas
    from reviews import itch_review, steam_review, summarize
    from videos import itch_recording, steam_preview, steam_recording, youtube_segment

ARCHIVE = Path(__file__).resolve().parents[1] / "dist/data/issues.json"
STEAM_CHART = "https://api.steampowered.com/ISteamChartsService/GetMostPlayedGames/v1/"
ITCH_LIST = "https://itch.io/games/platform-web/tag-game-jam"
GENRES = {
    "Action": "动作", "Adventure": "冒险", "Card Game": "卡牌",
    "Interactive Fiction": "互动小说", "Platformer": "平台跳跃", "Puzzle": "解谜",
    "Racing": "竞速", "Role Playing": "角色扮演", "Rhythm": "节奏",
    "Shooter": "射击", "Simulation": "模拟", "Sports": "体育",
    "Strategy": "策略", "Survival": "生存", "Visual Novel": "视觉小说",
}
PROMPTS = {
    "解谜": "如果删掉一条线索，玩家还能凭什么推理出答案？",
    "平台跳跃": "只保留一种移动动作，你会怎样设计三个不同的障碍？",
    "竞速": "如果赛道只有一个弯，怎样让刹车时机成为有趣的选择？",
    "模拟": "先只给玩家一种资源，哪两个用途最值得让人犹豫？",
    "策略": "如果每回合只能做一件事，哪两种选择会形成取舍？",
    "动作": "把操作压缩成一个按键，哪些时机判断还能保留下来？",
    "互动小说": "如果只能让玩家做一次选择，在哪个瞬间开口最合适？",
    "冒险": "把探索范围缩到一个房间，怎样让玩家愿意再搜一次？",
}

# Match store labels to the reader's categories. Keep decorative tags such as
# pixel art in the original tags array, where they remain searchable.
LIBRARY_GENRES = {
    "动作": ("动作", "动作冒险", "格斗", "清版动作", "砍杀", "动作类 Rogue", "类魂系列", "动作角色扮演"),
    "射击": ("射击", "第一人称射击", "第三人称射击", "英雄射击", "双摇杆射击", "俯视射击", "战术射击", "弹幕射击"),
    "平台跳跃": ("平台跳跃", "平台游戏", "平台解谜", "2D 平台", "3D 平台", "精确平台", "类银河战士恶魔城"),
    "解谜": ("解谜", "益智", "平台解谜", "逻辑", "推理", "隐藏物体", "密室逃脱"),
    "策略": ("策略", "即时战略", "大战略", "回合战略", "回合制战术", "自走棋", "塔防", "4X"),
    "角色扮演": ("角色扮演", "日系角色扮演", "动作角色扮演", "团队角色扮演", "CRPG", "JRPG"),
    "卡牌": ("卡牌", "卡牌游戏", "卡牌战斗", "牌组构建", "卡组构筑", "牌组构建式类 Rogue"),
    "Roguelike": ("Roguelike", "Roguelite", "类 Rogue", "轻度 Rogue", "动作类 Rogue", "传统类 Rogue", "牌组构建式类 Rogue"),
    "模拟经营": ("模拟经营", "农场模拟", "生活模拟", "管理", "城市营造", "殖民模拟", "经济", "资源管理"),
    "生存建造": ("生存", "建造", "开放世界生存制作", "基地建设", "制作"),
    "叙事冒险": ("叙事", "冒险", "文字游戏", "互动小说", "视觉小说", "选择取向", "剧情丰富", "指向点击"),
    "节奏": ("节奏", "音乐节奏"), "竞速": ("竞速", "赛车", "汽车模拟"),
    "体育": ("体育", "足球", "橄榄球", "篮球", "滑板", "网球"),
    "社交协作": ("社交", "合作", "在线合作", "本地合作", "不对称 VR", "团队导向", "多人派对"),
    "休闲": ("休闲", "放置", "点击游戏", "舒适惬意"),
}


def library_genres(tags, description=""):
    result = []
    if re.search(r"\bsocial (?:VR|world|platform)\b|社交(?:平台|游戏|空间|世界)", description, re.I):
        result.append("社交协作")
    for tag in tags:
        for genre, labels in LIBRARY_GENRES.items():
            if tag in labels and genre not in result:
                result.append(genre)
    return result[:3] or ["其他"]


def release_fields(item, url, reference=None):
    release = item.get("release") or {}
    for field, label in (("original_release_date", "Steam 标注的原版发行年份"),
                         ("steam_release_date", "Steam 平台发行年份")):
        timestamp = release.get(field)
        if isinstance(timestamp, int) and 0 < timestamp <= time.time():
            year = datetime.fromtimestamp(timestamp, timezone.utc).year
            # Some editions inherit their predecessor's store listing and release date.
            if reference and reference.get("legacyStoreYear") == year:
                return {key: reference[key] for key in ("year", "yearNote", "yearSourceUrl")}
            if release.get("is_early_access") and field == "steam_release_date":
                label = "Steam 抢先体验年份"
            return {"year": year, "yearNote": label, "yearSourceUrl": url}
    return {}


def fetch(url):
    request = Request(url, headers={"User-Agent": "PlaytraceWeekly/1.0 (weekly game discovery)"})
    for attempt in range(2):
        try:
            with urlopen(request, timeout=10) as response:
                return response.read(4_000_000)
        except HTTPError as exc:
            if exc.code < 500 or attempt:
                raise
            time.sleep(1)
        except (TimeoutError, URLError):
            if attempt:
                raise
            time.sleep(1)


def clean(text):
    return " ".join(html.unescape(re.sub(r"<[^>]*>", " ", text or "")).split())


def excerpt(text, limit=170):
    return text if len(text) <= limit else text[:limit].rstrip() + "…"


def gameplay_excerpt(item):
    # A rising game can have a biography or sale pitch as its short description.
    # Select a developer-written sentence describing an action, or skip the title.
    action_words = re.compile(
        r"驾驶|操控|指挥|控制|躲避|跳跃|解锁|收集|建造|升级|瞄准|射击|"
        r"布置|部署|放置|拆除|组合|搭配|掌握|交换|合成|改装|解谜|烹饪|"
        r"解开|投掷|装备|攀爬|投篮|种植|交易|连接|分配|闯关|招募|对局|出牌|"
        r"\b(?:build|craft|race|explore|dodge|combine|solve|collect|manage)\b", re.I)
    paragraphs = re.split(r"<br\s*/?>|</(?:p|li|div|h[1-6])>", item.get("about_the_game") or "", flags=re.I)
    copy = "\n".join(clean(value) for value in [item.get("short_description"), *paragraphs])
    candidates = re.split(r"\n|(?<=[。！？])\s*|(?<=[.!?])\s+", copy)
    choices = [sentence.strip(" 。") for sentence in candidates if 10 <= len(sentence) <= 160
               and not re.search(r"折扣|购买|通行证|立即预购|声优|装扮|wishlist|pre-order", sentence, re.I)
               and action_words.search(sentence)]
    if not choices:
        return ""
    return max(choices, key=lambda sentence: len(set(action_words.findall(sentence))))


def prompt_for(tags):
    for tag in ("解谜", "竞速", "平台跳跃", "模拟", "策略", "互动小说", "动作", "冒险"):
        if tag in tags:
            return PROMPTS[tag]
    return "试玩时记下你最想再做一次的动作。如果只能做一关，你会怎样重现它？"


def trusted_url(value, domain):
    if not isinstance(value, str):
        return None
    url = urlsplit(value)
    host = url.hostname or ""
    if url.scheme == "https" and (host == domain or host.endswith("." + domain)):
        return value
    return None


def game_key(url):
    steam = re.match(r"https://store\.steampowered\.com/app/(\d+)", url)
    return "steam-" + steam[1] if steam else url.split("?")[0].split("#")[0].rstrip("/")


def store_items(rows):
    # One batched request avoids per-game store lookups when checking the chart.
    query = {
        "ids": [{"appid": row["appid"]} for row in rows],
        "context": {"language": "schinese", "country_code": "CN"},
        "data_request": {"include_basic_info": True, "include_assets": True, "include_screenshots": True,
                         "include_release": True, "include_tag_count": 16, "include_full_description": True,
                         "include_trailers": True},
    }
    params = urlencode({"input_json": json.dumps(query, separators=(",", ":"))})
    data = json.loads(fetch("https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?" + params))
    return {item["appid"]: item for item in data["response"]["store_items"] if item.get("appid")}


def add_chapter(video):
    try:
        segment = youtube_segment(video, fetch)
    except (OSError, ValueError, KeyError):
        return
    if segment:
        video["segment"] = segment


def steam_references():
    references = {}
    for path in sorted(ARCHIVE.parent.glob("*.json")):
        if not (path.stem.startswith("reference-") or path.stem in ("award-selections", "fps-studies")):
            continue
        try:
            games = json.loads(path.read_text(encoding="utf-8-sig"))
        except (OSError, ValueError) as exc:
            print(f"Could not read reference videos in {path.name}: {exc}", file=sys.stderr)
            continue
        if not isinstance(games, list):
            continue
        for game in games:
            video = game.get("video") or {}
            if not editorial_segment(video):
                continue
            # A store link identifies the exact game even when another edition shares its name.
            for url in (game.get("url"), game.get("yearSourceUrl"), (video.get("preview") or {}).get("url")):
                key = game_key(url or "")
                if key.startswith("steam-"):
                    references.setdefault(key, game)
                    break
    return references


def steam_games(seen):
    data = json.loads(fetch(STEAM_CHART))["response"]
    ranks = data["ranks"]

    def change(row):
        return row["last_week_rank"] - row["rank"] if row.get("last_week_rank") else 0

    # Lead with upward movement. Stable placements break ties in rank order.
    ranked = sorted(ranks, key=lambda row: (-change(row), row["rank"]))
    ranked = [row for row in ranked if f"steam-{row['appid']}" not in seen][:64]
    if not ranked:
        return
    items = {}
    for start in range(0, len(ranked), 32):
        items.update(store_items(ranked[start:start + 32]))
    curated = steam_references()
    def has_gameplay_clip(row):
        if f"steam-{row['appid']}" in curated:
            return True
        trailers = items.get(row["appid"], {}).get("trailers", {})
        return any(clip.get("trailer_category") == 1 and clip.get("microtrailer")
                   for group in ("highlights", "other_trailers") for clip in trailers.get(group, []))
    ranked.sort(key=has_gameplay_clip, reverse=True)
    tag_data = json.loads(fetch("https://api.steampowered.com/IStoreService/GetTagList/v1/?language=schinese"))
    tag_names = {tag["tagid"]: tag["name"] for tag in tag_data["response"]["tags"]}
    recordings_limited = False
    for row in ranked:
        app_id = int(row["appid"])
        url = f"https://store.steampowered.com/app/{app_id}/"
        item = items.get(app_id, {})
        if item.get("type") != 0 or item.get("success") != 1 or not item.get("name"):
            continue
        bbcode = item.get("full_description_bbcode", "")
        bbcode = re.sub(r"\[img[^\]]*\].*?\[/img\]", "", bbcode, flags=re.S | re.I)
        paragraphs = re.sub(r"\[/(?:p|h[1-6]|list)\]|\[\*\]", "</p>", bbcode, flags=re.I)
        description = gameplay_excerpt({
            "short_description": item.get("basic_info", {}).get("short_description"),
            "about_the_game": re.sub(r"\[/?[a-z][^\]]*\]", "", paragraphs, flags=re.I),
        })
        if not description:
            continue
        reference = curated.get(game_key(url))
        video = reference["video"] if reference else None
        preview = (video or {}).get("preview") or steam_preview(item)
        if video is None:
            try:
                video = None if recordings_limited else steam_recording(app_id, item["name"], fetch)
            except HTTPError as exc:
                recordings_limited = exc.code == 429
                print(f"Steam community videos for {app_id}: {exc}", file=sys.stderr)
                video = None
            except (OSError, ValueError) as exc:
                print(f"Steam community videos for {app_id}: {exc}", file=sys.stderr)
                video = None
            if video:
                add_chapter(video)
        if video and preview:
            video = {**video, "preview": preview}
        elif not video:
            video = preview
        if not video:
            continue
        all_tags = [tag_names[tag] for tag in item.get("tagids", []) if tag in tag_names]
        tags = all_tags[:3]
        rank = row["rank"]
        signal = f"Steam 热玩榜第 {rank} 名"
        if change(row) > 0:
            signal += f"，较上周上升 {change(row)} 位"
        shots = item.get("screenshots", {}).get("all_ages_screenshots", [])
        assets = item.get("assets", {})
        path = shots[0]["filename"] if shots else assets.get("asset_url_format", "").replace(
            "${FILENAME}", assets.get("header", ""))
        artwork = "https://shared.fastly.steamstatic.com/store_item_assets/" + path if path else None
        yield {
            "id": game_key(url), "title": item["name"], "source": "Steam",
            "signal": signal + "。", "signalUrl": STEAM_CHART,
            "mechanic": "「" + description + "」（摘自商店介绍）",
            "prompt": prompt_for(tags), "url": url,
            "image": trusted_url(artwork, "steamstatic.com"),
            "action": "查看 Steam 商店", "tags": tags, "genres": library_genres(all_tags, description), "video": video,
            **release_fields(item, url, reference),
        }


def itch_games(seen):
    feed = ET.fromstring(fetch(ITCH_LIST + ".xml"))
    checked = 0
    blocks = 0
    for rank, entry in enumerate(feed.findall("./channel/item"), 1):
        url = trusted_url(entry.findtext("link"), "itch.io")
        if not url or game_key(url) in seen or entry.findtext("platforms/html") != "yes":
            continue
        name = clean(entry.findtext("plainTitle"))
        description = clean(entry.findtext("description"))
        if not name or len(description) < 36:
            continue
        checked += 1
        if checked > 12:
            break
        try:
            page = fetch(url).decode("utf-8")
            video = itch_recording(page, name, fetch)
        except HTTPError as exc:
            if exc.code == 429:
                raise
            blocks = blocks + 1 if exc.code == 403 else 0
            print(f"itch.io videos for {name}: {exc}", file=sys.stderr)
            if blocks >= 3:
                break
            continue
        except (OSError, ValueError) as exc:
            print(f"itch.io videos for {name}: {exc}", file=sys.stderr)
            continue
        blocks = 0
        if not video:
            continue
        add_chapter(video)
        labels = re.findall(r"\[([^\]]+)\]", entry.findtext("title", ""))
        tags = [GENRES[label] for label in labels if label in GENRES] + ["Game Jam"]
        parsed = urlsplit(game_key(url))
        game_id = parsed.hostname.removesuffix(".itch.io") + parsed.path.replace("/", "-")
        yield {
            "id": "itch-" + game_id, "title": name, "source": "itch.io",
            "signal": f"入选 itch.io 网页 Game Jam 热门榜，本次采集排在第 {rank} 位。",
            "signalUrl": ITCH_LIST, "mechanic": "「" + excerpt(description) + "」（作者原文）",
            "prompt": prompt_for(tags), "url": url,
            "image": trusted_url(entry.findtext("imageurl"), "itch.zone"),
            "action": "浏览器试玩", "tags": tags, "genres": library_genres(tags, description), "video": video,
            "review": itch_review(page, url),
        }


def available(source, seen):
    try:
        for game in source(seen):
            key = game_key(game["url"])
            if key not in seen:
                seen.add(key)
                yield game
    except (OSError, ValueError, KeyError, TypeError, ET.ParseError) as exc:
        print(f"{source.__name__}: {exc}", file=sys.stderr)


def editorial_segment(media):
    segment = media.get("segment") or {}
    start, end = segment.get("start"), segment.get("end")
    if (segment.get("method") != "editor" or not isinstance(start, (int, float))
            or not isinstance(end, (int, float)) or not 0 <= start < end <= start + 30):
        return False
    if media.get("provider") == "local":
        root = ARCHIVE.parents[1].resolve()
        source = (root / media.get("src", "")).resolve()
        return source.is_relative_to(root) and source.is_file()
    return bool(media.get("id") or media.get("src"))


def reuse_editorial(game, previous_game):
    if not previous_game or game_key(previous_game["url"]) != game_key(game["url"]):
        return
    old = previous_game.get("video") or {}
    old_preview = old.get("preview") or {}
    current = game["video"]
    if not editorial_segment(current) and editorial_segment(old):
        # Carry the original player and its interval together: an editor's time
        # on one recording is never applied to the newly discovered recording.
        game["video"] = {key: value for key, value in old.items() if key != "preview"}
        fallback = current.get("preview") or (current if current["provider"] == "steam" else None)
        if fallback:
            game["video"]["preview"] = fallback
    if not editorial_segment(current) and editorial_segment(old_preview):
        game["video"]["preview"] = old_preview
    review = previous_game.get("review") or {}
    if review.get("core") and review.get("appeal") and review.get("sources") and review.get("mode") != "excerpts":
        game["review"] = review
    prior_ideas = valid_ideas(previous_game.get("prototypeIdeas"))
    if prior_ideas and not valid_ideas(game.get("prototypeIdeas")):
        game["prototypeIdeas"] = prior_ideas


def build_issue(today, issue_id, previous):
    seen = {game_key(game["url"]) for issue in previous[:4] for game in issue["games"]}
    older = {game_key(game["url"]): game for issue in reversed(previous[4:]) for game in issue["games"]}
    steam = available(steam_games, seen)
    itch = available(itch_games, seen)
    games = []
    complete_videos = []

    def collect_segments(stream, target_count):
        for game in stream:
            reuse_editorial(game, older.get(game_key(game["url"])))
            video = game["video"]
            if video.get("segment") or (video.get("preview") or {}).get("segment"):
                games.append(game)
                if len(games) >= target_count:
                    break
            else:
                complete_videos.append(game)

    collect_segments(steam, 3)
    collect_segments(itch, min(5, len(games) + 2))
    if len(games) < 5:
        collect_segments(itertools.chain(steam, itch), 5)
        games.extend(complete_videos[:5 - len(games)])
    if len(games) != 5:
        raise RuntimeError(f"Only {len(games)} eligible games. No archive changes were made.")
    review_limit = False
    reviewed = 0
    errors = 0
    for game in games:
        if "review" in game:
            reviewed += 1
            continue
        game["review"] = summarize([])
        if review_limit:
            continue
        try:
            game["review"] = steam_review(int(game["id"].removeprefix("steam-")), fetch)
            reviewed += 1
        except HTTPError as exc:
            review_limit = exc.code == 429
            errors += 1
            print(f"Steam reviews for {game['id']}: {exc}", file=sys.stderr)
        except (OSError, ValueError) as exc:
            errors += 1
            print(f"Steam reviews for {game['id']}: {exc}", file=sys.stderr)
    if errors and not reviewed:
        raise RuntimeError("The review source was unavailable. No archive changes were made.")
    add_prototype_ideas(games, previous)
    return {"id": issue_id, "date": today.isoformat(), "games": games}


def write_archive(archive, data):
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", newline="\n",
                                     dir=archive.parent, delete=False) as out:
        temporary = out.name
        try:
            json.dump(data, out, ensure_ascii=False, indent=2)
            out.write("\n")
        except BaseException:
            out.close()
            os.unlink(temporary)
            raise
    try:
        os.replace(temporary, archive)
    finally:
        Path(temporary).unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preview", action="store_true",
                        help="fetch five real candidates and print JSON without changing the archive")
    parser.add_argument("--archive", type=Path, default=ARCHIVE,
                        help="path to an existing archive (default: dist/data/issues.json)")
    args = parser.parse_args()
    today = datetime.now(timezone(timedelta(hours=8))).date()
    year, week, _ = today.isocalendar()
    issue_id = f"{year}-W{week:02}"
    # Reading an existing valid file is intentional. Never replace a damaged archive.
    data = json.loads(args.archive.read_text(encoding="utf-8-sig"))
    issues = data["issues"]
    if not isinstance(issues, list):
        raise ValueError("Invalid issues archive")
    if any(issue["id"] == issue_id for issue in issues) and not args.preview:
        print(f"{issue_id} already exists. Keeping the published edition.")
        return
    new_issue = build_issue(today, issue_id, [issue for issue in issues if issue["id"] != issue_id])
    if args.preview:
        print(json.dumps(new_issue, ensure_ascii=False, indent=2))
        return
    issues.append(new_issue)
    issues.sort(key=lambda issue: issue["date"], reverse=True)
    write_archive(args.archive, data)
    print(f"Added {issue_id} with {len(new_issue['games'])} games.")


if __name__ == "__main__":
    main()

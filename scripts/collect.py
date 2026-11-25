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
from urllib.error import URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

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


def fetch(url):
    request = Request(url, headers={"User-Agent": "PlaytraceWeekly/1.0 (weekly game discovery)"})
    for attempt in range(2):
        try:
            with urlopen(request, timeout=10) as response:
                return response.read(4_000_000)
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


def steam_games(seen):
    data = json.loads(fetch(STEAM_CHART))["response"]
    ranks = data["ranks"]

    def change(row):
        return row["last_week_rank"] - row["rank"] if row.get("last_week_rank") else 0

    # Lead with upward movement. Stable placements break ties in rank order.
    ranked = sorted(ranks, key=lambda row: (-change(row), row["rank"]))
    checked = 0
    for row in ranked:
        app_id = int(row["appid"])
        url = f"https://store.steampowered.com/app/{app_id}/"
        if game_key(url) in seen:
            continue
        checked += 1
        if checked > 15:
            break
        try:
            item = json.loads(fetch(
                f"https://store.steampowered.com/api/appdetails?appids={app_id}&cc=cn&l=schinese"
            )).get(str(app_id), {}).get("data") or {}
        except (OSError, ValueError) as exc:
            print(f"Steam app {app_id}: {exc}", file=sys.stderr)
            continue

        description = gameplay_excerpt(item)
        if item.get("type") != "game" or not description or not item.get("name"):
            continue
        tags = [clean(genre["description"]) for genre in item.get("genres", [])][:3]
        rank = row["rank"]
        signal = f"Steam 热玩榜第 {rank} 名"
        if change(row) > 0:
            signal += f"，较上周上升 {change(row)} 位"
        shots = item.get("screenshots") or []
        artwork = shots[0].get("path_full") if shots else item.get("header_image")
        yield {
            "id": game_key(url), "title": item["name"], "source": "Steam",
            "signal": signal + "。", "signalUrl": STEAM_CHART,
            "mechanic": "「" + description + "」（摘自商店介绍）",
            "prompt": prompt_for(tags), "url": url,
            "image": trusted_url(artwork, "steamstatic.com"),
            "action": "查看 Steam 商店", "tags": tags,
        }


def itch_games(seen):
    feed = ET.fromstring(fetch(ITCH_LIST + ".xml"))
    for rank, entry in enumerate(feed.findall("./channel/item"), 1):
        url = trusted_url(entry.findtext("link"), "itch.io")
        if not url or game_key(url) in seen or entry.findtext("platforms/html") != "yes":
            continue
        name = clean(entry.findtext("plainTitle"))
        description = clean(entry.findtext("description"))
        if not name or len(description) < 36:
            continue
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
            "action": "浏览器试玩", "tags": tags,
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


def build_issue(today, issue_id, previous):
    seen = {game_key(game["url"]) for issue in previous[:4] for game in issue["games"]}
    steam = available(steam_games, seen)
    itch = available(itch_games, seen)
    games = list(itertools.islice(steam, 3)) + list(itertools.islice(itch, 2))
    if len(games) < 5:
        games += list(itertools.islice(itertools.chain(steam, itch), 5 - len(games)))
    if len(games) != 5:
        raise RuntimeError(f"Only {len(games)} eligible games. No archive changes were made.")
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

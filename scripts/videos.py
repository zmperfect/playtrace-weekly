"""Select publicly embeddable player recordings linked from the game's own page."""

import html
import json
import re
import unicodedata
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


PLAY = re.compile(
    r"\b(game\s?play|walkthrough|playthrough|speedrun|let.s play|no commentary|"
    r"boss fight|opening race)\b|实[况录]|實[況錄]|实机|實機|通关|通關|"
    r"游戏画面|试玩|試玩|実況|プレイ動画|прохождение", re.I)
EPISODE = re.compile(r"\b(?:part|episode|ep)\.?\s*#?\d+\b", re.I)
OTHER = re.compile(
    r"\b(trailer|teaser|review|reaction|cutscenes?|animation|soundtrack|ost|"
    r"unboxing|benchmark|retrospective|compilation of games)\b|"
    r"\b\d+\s+(?:scary\s+|indie\s+|horror\s+)?games\b|预告|預告|混剪|评测|評測|影评|影評", re.I)
YT_LINK = re.compile(
    r'(?:https?:)?//(?:www\.)?(?:youtu\.be/|youtube(?:-nocookie)?\.com/'
    r'(?:watch\?(?:[^\s"<>]*?&)?v=|embed/|shorts/))([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])')


def normalize(text):
    return " ".join(re.findall(r"[^\W_]+", unicodedata.normalize("NFKC", text).casefold()))


def game_names(names):
    aliases = set()
    for name in names:
        # Store names may include both a localized and an original title.
        for alias in re.split(r"[()（）]", name or ""):
            name_part = re.sub(r":?\s+(?:the )?(?:complete|definitive|standard) edition$", "", alias, flags=re.I)
            normalized = normalize(name_part)
            if len(normalized) >= 2:
                aliases.add(normalized)
    return aliases


def evidence(title, aliases):
    if OTHER.search(title):
        return 0
    normalized = normalize(title)
    # Bound Latin words and digits, including sequel numbers. CJK game names
    # can be immediately followed by other text without a separator.
    if not any(re.search(r"(?<![a-z0-9])" + re.escape(name) + r"(?![a-z0-9])", normalized)
               for name in aliases):
        return 0
    return 2 if PLAY.search(title) else int(bool(EPISODE.search(title)))


def embeddable(video_id, aliases, fetch):
    url = "https://www.youtube.com/watch?v=" + video_id
    query = urlencode({"url": url, "format": "json"})
    data = json.loads(fetch("https://www.youtube.com/oembed?" + query))
    title = html.unescape(data.get("title") or "").strip()
    creator = (data.get("author_name") or "").strip()
    if (data.get("type") == "video" and data.get("provider_name") == "YouTube"
            and f"www.youtube.com/embed/{video_id}" in data.get("html", "")
            and creator and evidence(title, aliases)):
        return {"provider": "youtube", "id": video_id, "title": title, "creator": creator, "url": url}
    return None


def find_recording(candidates, aliases, fetch):
    for video_id in dict.fromkeys(candidates):
        try:
            video = embeddable(video_id, aliases, fetch)
        except HTTPError as exc:
            if exc.code == 429:
                raise
            continue
        except (OSError, ValueError):
            continue
        if video:
            return video
    return None


CHAPTER_ACTION = re.compile(
    r"战斗|解谜|攀爬|合作|逃脱|追逐|竞速|对局|收集|建造|卡组|攻略|"
    r"\b(?:combat|boss|battle|fight|puzzle|climb|race|chase|crafting|building|"
    r"duel|draft|dungeon|exploration|stealth|heist|fishing|gameplay)\b", re.I)


def chapter_segment(description, duration=None):
    marks = []
    for line in description.splitlines():
        entry = re.fullmatch(r"\s*[-•]?\s*\[?(?:(\d{1,2}):)?(\d{1,3}):([0-5]\d)\]?\s*[-–—|:]?\s+(.{2,100})", line)
        if entry:
            hrs, mins, secs, label = entry.groups()
            start = int(hrs or 0) * 3600 + int(mins) * 60 + int(secs)
            if (hrs and int(mins) >= 60) or (marks and start <= marks[-1][0]):
                return None
            marks.append((start, label.strip()))
    if len(marks) < 3 or marks[0][0] != 0:
        return None
    for i, (start, label) in enumerate(marks):
        if not CHAPTER_ACTION.search(label) or OTHER.search(label) or re.search(
                r"intro|outro|opening cinematic|cutscene|tutorial menu|片头|过场|开场动画", label, re.I):
            continue
        boundary = marks[i + 1][0] if i + 1 < len(marks) else duration
        if boundary is None:
            continue
        end = min(start + 30, boundary, duration if duration is not None else boundary)
        if end > start:
            return {"start": start, "end": end, "cue": f"作者章节「{label}」", "method": "chapter"}
    return None


def youtube_segment(video, fetch):
    # Read the public description displayed on the watch page. Do not access
    # playback streams or use private player endpoints when sign-in is required.
    page = fetch(video["url"]).decode("utf-8")
    marker = re.search(r"\bytInitialData\s*=\s*", page)
    if not marker:
        return None
    doc = json.JSONDecoder().raw_decode(page[marker.end():])[0]
    if doc.get("currentVideoEndpoint", {}).get("watchEndpoint", {}).get("videoId") != video["id"]:
        return None
    duration = None
    marker = re.search(r"\bytInitialPlayerResponse\s*=\s*", page)
    if marker:
        details = json.JSONDecoder().raw_decode(page[marker.end():])[0].get("videoDetails", {})
        if details.get("videoId") == video["id"] and str(details.get("lengthSeconds", "")).isdigit():
            duration = int(details["lengthSeconds"])
    watch = doc.get("contents", {}).get("twoColumnWatchNextResults", {})
    for row in watch.get("results", {}).get("results", {}).get("contents", []):
        info = row.get("videoSecondaryInfoRenderer", {})
        copy = info.get("attributedDescription", {}).get("content")
        if copy:
            return chapter_segment(copy, duration)
    return None


def steam_recording(app_id, name, fetch):
    page = fetch(f"https://steamcommunity.com/app/{app_id}/videos/?l=english&searchText=gameplay").decode("utf-8")
    heading = re.search(r"<title>Steam Community :: ([^<]+)</title>", page)
    aliases = game_names([name, html.unescape(heading[1]) if heading else ""])
    candidates = []
    # Splitting at each card's app attribute keeps thumbnails paired with the
    # submitting user's title on the same card, even when a card has no video.
    for card in re.split(r'(?=\bdata-appid=")', page):
        if not card.startswith(f'data-appid="{app_id}"'):
            continue
        thumb = re.search(r'https://img\.youtube\.com/vi/([A-Za-z0-9_-]{11})/', card)
        title = re.search(r'class="apphub_CardContentTitle ellipsis">([^<]*)</div>', card)
        if thumb and title:
            score = evidence(html.unescape(title[1]), aliases)
            if score:
                candidates.append((score, thumb[1]))
    candidates.sort(key=lambda item: -item[0])
    return find_recording([video for _, video in candidates[:4]], aliases, fetch)


def itch_recording(page, name, fetch):
    page = html.unescape(page)
    return find_recording(list(dict.fromkeys(YT_LINK.findall(page)))[:4], game_names([name]), fetch)


def steam_preview(item):
    """Return the store's short MP4 only when its parent is tagged Gameplay."""
    trailers = item.get("trailers", {})
    app_id = item["appid"]
    for trailer in trailers.get("highlights", []) + trailers.get("other_trailers", []):
        if trailer.get("trailer_category") != 1:
            continue
        for clip in trailer.get("microtrailer", []):
            path = clip.get("filename", "")
            if (clip.get("type") != "video/mp4"
                    or not re.fullmatch(rf"{app_id}/\d+/[0-9a-f]+/\d+/microtrailer\.mp4", path)):
                continue
            src = "https://video.fastly.steamstatic.com/store_trailers/" + path
            try:
                request = Request(src, headers={"Range": "bytes=0-32767", "Origin": "https://zmperfect.github.io"})
                with urlopen(request, timeout=8) as response:
                    if (response.headers.get_content_type() != "video/mp4"
                            or response.headers.get("Access-Control-Allow-Origin") != "*"):
                        continue
                    header = response.read(32768)
            except HTTPError as exc:
                if exc.code == 429:
                    return None
                continue
            except OSError:
                continue
            # Check the entire MP4 movie metadata before describing its tracks.
            # A bare DASH video segment would lack this standalone movie header.
            start = header.find(b"moov") - 4
            if start < 0 or header[4:8] != b"ftyp":
                continue
            end = start + int.from_bytes(header[start:start + 4], "big")
            tracks = header[start:end]
            if end > len(header) or b"vide" not in tracks or b"avc1" not in tracks:
                continue
            movie = tracks.find(b"mvhd")
            if movie < 0 or movie + 40 > len(tracks) or tracks[movie + 4] not in (0, 1):
                continue
            v1 = tracks[movie + 4] == 1
            scale_at = movie + (24 if v1 else 16)
            scale = int.from_bytes(tracks[scale_at:scale_at + 4], "big")
            ticks = int.from_bytes(tracks[scale_at + 4:scale_at + (12 if v1 else 8)], "big")
            if not scale or not 1 <= ticks / scale <= 30:
                continue
            segment = {"start": 0, "end": ticks // scale,
                       "cue": f"Steam 实机短片「{trailer.get('trailer_name') or item['name']}」",
                       "method": "official"}
            return {"provider": "steam", "src": src, "title": "官方实机短片",
                    "silent": b"soun" not in tracks, "creator": "Steam 商店", "segment": segment,
                    "url": f"https://store.steampowered.com/app/{app_id}/"}
    return None

"""Extract attributable, short player observations. Store descriptions are never inputs."""

import html
import json
import re
from urllib.parse import urlencode, urlsplit


MECHANIC = re.compile(
    r"配合|合作|协作|分工|搭配|组合|卡组|套牌|抽牌|出牌|回合|叠加|攀爬|攀登|体力|耐力|"
    r"解谜|机关|跳跃|闪避|格挡|反击|连招|瞄准|换弹|翻滚|收集|合成|建造|采集|"
    r"交易|换挡|刹车|漂移|走线|战术|资源管理|装备|升级|潜行|近战|射击|刷怪|探索|"
    r"聊天|社交|扮演|继承|联姻|结盟|外交|分封|准星|对枪|压枪|练枪|跟枪|甩枪|点击|敲键盘|"
    r"\b(?:co-?op|puzzles?|combos?|deck|cards?|turns?|builds?|climb\w*|stamina|"
    r"dodg\w*|parr(?:y|ying)|craft\w*|drift\w*|brak(?:e|ing)|loot|explor\w*|shoot\w*|"
    r"click\w*|aim|aiming|aim train\w*|train aim|track(?:ing)?|socializ\w*|roleplay\w*)\b", re.I)
FEELING = re.compile(
    r"成就感|满足感|代入感|临场感|沉浸|紧张感|惊喜|爽快|上头|耐玩|百玩不厌|"
    r"有趣|欢乐|有意思|乐趣|很喜欢|最喜欢|特别喜欢|治愈|吸引|精妙|出色|巧妙|流畅|更准|有助于|进步|"
    r"\b(?:satisfying|rewarding|tense|immersive|clever|addictive|fun|favorite|love|"
    r"enjoy\w*|improves?|helpful|nice)\b", re.I)
DETAIL = re.compile(r"剧情|故事|画面|音乐|音效|美术|节奏|关卡|地图|战斗|操作|手感|反馈|氛围|角色|"
                    r"\b(?:music|story|level|map|boss|combat|controls|sound|art style|atmosphere)\b", re.I)
NOISE = re.compile(r"https?://|www\.|退款|白嫖|促销|打折|给个赞|求赞|前女友|前男友|政治正确|"
                   r"辱华|傻[逼比]|他妈|你妈|恶心|死宅|基佬|阳痿|后悔|小时候最喜欢|"
                   r"\b(?:wishlist|giveaway|refund|review bomb)\b|[░▒▓█]", re.I)
NEGATIVE = re.compile(r"一点也不|一点都不|毫无|缺乏|糟糕|无聊|失望|\b(?:not|isn.t|aren.t|wasn.t)\s+(?:very\s+)?fun\b", re.I)


def summarize(rows):
    """Keep full sentences/clauses only; never stitch two reviewers' words together."""
    candidates = []
    for row in rows:
        text = html.unescape(re.sub(r"\[/?[a-z][^\]]*\]|<[^>]+>", "", row["text"], flags=re.I))
        for unit in re.split(r"[\r\n]+|(?<=[。！？!?；;])\s*|(?<=\.)\s+", text):
            unit = " ".join(unit.split()).strip(" •-*")
            if len(unit) > 84 and re.search(r"[\u4e00-\u9fff]", unit):
                parts = re.split(r"[，；]", unit)
            else:
                parts = [unit]
            for part in parts:
                quote = part.strip()
                if not 13 <= len(quote) <= 150 or NOISE.search(quote):
                    continue
                if len(re.findall(r"[\u4e00-\u9fff]", quote)) > 76 or len(quote.split()) > 23:
                    continue
                moves = len(set(MECHANIC.findall(quote)))
                details = len(set(DETAIL.findall(quote)))
                feelings = len(set(FEELING.findall(quote)))
                # Avoid one-word endorsements. A specific action or aspect of the game
                # must occur in the same passage as the player's experience.
                core = 3 * min(3, moves) + int(details > 0) if moves else 0
                liked = feelings and (moves or details) and row.get("positive", True) and not NEGATIVE.search(quote)
                appeal = 2 * min(2, feelings) + min(3, moves + details) if liked else 0
                if core or appeal:
                    candidates.append((quote, row["url"], core, appeal))
    review = {"core": "", "appeal": "", "sources": [], "mode": "excerpts"}
    if not candidates:
        return review
    first = max(candidates, key=lambda row: row[2])
    used = ""
    if first[2]:
        review.update(core=first[0], coreSourceUrl=first[1])
        used = first[0]
    second = max((x for x in candidates if x[0] != used), default=None,
                 key=lambda row: (row[3], row[1] != first[1]))
    if second and second[3]:
        review.update(appeal=second[0], appealSourceUrl=second[1])
    for field, label in (("core", "玩法原评"), ("appeal", "体验原评")):
        url = review.get(field + "SourceUrl")
        if url and not any(source["url"] == url for source in review["sources"]):
            review["sources"].append({"label": label, "url": url})
    return review


def steam_review(app_id, fetch):
    result = summarize([])
    for language in ("schinese", "english"):
        # Include free-to-play users, whose reviews the default purchase filter omits.
        options = {"appid": app_id, "languages": [language], "num_per_page": 60,
                   "purchase_type": 1, "day_range": 365, "playtime_min_hours": 1}
        query = urlencode({"input_json": json.dumps(options, separators=(",", ":"))})
        data = json.loads(fetch("https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/?" + query))
        rows = []
        for item in data.get("response", {}).get("reviews", []):
            author = item.get("author", {}).get("steamid", "")
            if item.get("language") != language or not re.fullmatch(r"\d{17}", str(author)):
                continue
            rows.append({"text": item.get("review", ""), "positive": item.get("voted_up", False),
                         "url": f"https://steamcommunity.com/profiles/{author}/recommended/{app_id}/"})
        available = summarize(rows)
        for field, label in (("core", "玩法原评"), ("appeal", "体验原评")):
            if result[field] or not available[field]:
                continue
            url = available[field + "SourceUrl"]
            result[field], result[field + "SourceUrl"] = available[field], url
            if not any(source["url"] == url for source in result["sources"]):
                result["sources"].append({"label": label, "url": url})
        if result["core"] and result["appeal"]:
            break
    return result


def itch_review(page, game_url):
    # Use only comment bodies belonging to a named community post, excluding the
    # project author's replies and surrounding game-page copy.
    rows = []
    owner = re.escape(urlsplit(game_url).hostname or "")
    posts = re.split(r'(?=<div\b[^>]*\bid=["\']post[-_]\d+["\'])', page, flags=re.I)
    for post in posts[1:]:
        head, _, body = post.partition("post_body")
        post_id = re.search(r'\bid=["\']post[-_](\d+)["\']', head)
        badges = re.sub(r"<[^>]+>", " ", head)
        if (not post_id or not body or re.search(r'author_flag|is_game_author', head, re.I)
                or re.search(r"\b(?:creator|developer)\b|游戏作者", badges, re.I)
                or re.search(rf'href=["\']https?://{owner}/?["\']', head, re.I)):
            continue
        content = re.match(r'[^>]*>(.+?)</div>', body, re.S)
        if content:
            text = re.sub(r'</p>|<br\s*/?>', '\n', content[1], flags=re.I)
            rows.append({"text": text, "url": "https://itch.io/post/" + post_id[1]})
    return summarize(rows)

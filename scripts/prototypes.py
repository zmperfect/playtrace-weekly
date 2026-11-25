"""Turn actions observed in the issue into scoped, single-developer experiments."""

from collections import Counter
from dataclasses import dataclass
import re


@dataclass(frozen=True)
class Experiment:
    action: str
    context: str
    title: str
    keep: str
    change: str
    build: str
    playtest: str
    days: int

    def idea(self):
        return {key: getattr(self, key) for key in ("title", "keep", "change", "build", "playtest", "days")}


# Action must come from a gameplay description, review or observed segment. Context
# can also come from the game's tags. A genre label alone never selects an idea.
EXPERIMENTS = (
    Experiment(
        r"聊天|交谈|找同好|找人聊|socializ\w*|hang out|talk with",
        r"social VR|社交(?:型|游戏|空间)|虚拟现实|虚拟世界|聊天室|virtual world",
        "末班茶车", "留下走进一个房间、靠话题找到同伴的过程。",
        "把社交房间缩成三节茶车厢。每位乘客只透露一个兴趣，带着上一位提过的话题换车厢才能引出新对话。",
        "画三节车厢、四张乘客卡和六张话题卡。点击乘客后选一张话题卡，用预写对话反馈，车到终点结算认识了几个人。",
        "让试玩者重新坐一次车，观察他会不会特地回去找先前搭不上话的乘客。", 1),
    Experiment(
        r"联姻|继承|密谋|结盟|分封|dynast\w*|marriage alliance|succession",
        r"家族|宫廷|王朝|外交|领地|中世纪|dynast\w*|medieval|kingdom",
        "两代人的印章", "留下用当代的一次结盟，改变下一代选择的联动。",
        "三家共管一座渡口。你可以用婚约换来今天的修桥票，但对方的继承人明天也会分走你的一票。",
        "做三张家族卡、两件议案和一次换代。用按钮提亲或拒绝，用票数判定结果，结尾展示每一票从哪段关系而来。",
        "看试玩者输掉第二次表决后，能否指出第一代做的哪桩婚约改变了局面，并愿意重试。", 2),
    Experiment(
        r"瞄准|练枪|网格射击|准星|\baim(?:ing)?\b|\bshooting (?:targets|[^.!?]*dots)\b",
        r"训练|练习|分数|得分|进步|薄弱项|分析|train\w*|accuracy|aimlab|score",
        "萤火取景框", "留下快速移向目标、校准落点并立即看到成绩的练习。",
        "把靶心换成萤火虫。抢先按快门能拍到更多只，等它飞到取景框正中才能拍到清晰照片。",
        "一个画布、一条移动轨迹和一个快门。每轮出现八只虫，结束后把落点叠在照片上，比较速度和清晰度。",
        "让同一个人连续拍两轮，看第二轮的落点有没有更集中，以及他会主动等哪一只。", 1),
    Experiment(
        r"瞄准|练枪|网格射击|准星|\baim(?:ing)?\b|\bshooting (?:targets|[^.!?]*dots)\b",
        r"训练|练习|分数|得分|进步|薄弱项|分析|train\w*|accuracy|aimlab|score",
        "校准员的最后一格", "留下重复对准目标、从上一轮的误差学习的反馈。",
        "每次点击都留下一枚误差印记。下一轮，最常偏离的那个角会多出两个目标，让玩家选择冲速度还是修正习惯。",
        "用九宫格、十二个依次亮起的光点和一张误差图完成两轮。点击计时，按偏移方向调整第二轮目标位置。",
        "隐藏总分只给误差图，观察试玩者能否自行说出下一轮打算修正的方向。", 1),
    Experiment(
        r"打字|敲键盘|按键|点击鼠标|点击数|键鼠输入|keypress|keyboard|typing",
        r"桌面伴[侣伙]|桌面|拍桌|猫爪|收集帽子|desktop companion|bongo cat",
        "雨窗邮票", "留下正常打字时，小伙伴顺着输入做出可见回应的乐趣。",
        "每次在便笺里打字，小鸟就给窗沿盖一个爪印。停笔两秒，它会把这一串爪印压成邮票；长短不同会留下不同图案。",
        "只做一个本地输入框、一只两帧小鸟和三种邮票。仅监听当前便笺的按键，停顿时显示邮票并开始下一串。",
        "请人写两句话，看他先注意到爪印还是邮票，以及会不会为了换图案提前停笔。", 1),
    Experiment(
        r"团队射击|英雄射击|hero shooter|team[- ]based shooter",
        r"英雄|队伍|组队|团队|hero|squad|team",
        "换班灯塔", "取团队射击里瞄准同一目标、衔接不同角色动作的思路。",
        "改成一个人轮流值两班。守灯员照亮海面一处暗礁，接班的引航员只在亮光消失前看得清船要转向哪边。",
        "做俯视单屏、三处礁石和一艘自动前进的船。用鼠标打灯、左右键转舵，每次交接给灯光固定寿命。",
        "让试玩者跑同一路线两遍，记录第二遍是否提前照到下一处危险，以及为什么提前。", 2),
    Experiment(
        r"团队射击|英雄射击|hero shooter|team[- ]based shooter",
        r"英雄|队伍|组队|团队|hero|squad|team",
        "给昨天的队友传球", "留下队伍盯着同一个目标、等伙伴进入位置再行动的配合。",
        "第一遍只控制接应员走位，系统记下这十秒的路线。第二遍控制传球员，对着上一遍的自己把球送进窗口。",
        "一块平面场地、一扇窗口、一只球。保存十秒位置序列并重放，用鼠标定传球方向，撞到接应员时判接住。",
        "传球没接住后，看玩家会改走位录像、调整出球方向，还是只改变出球时刻。", 2),
    Experiment(
        r"攀爬|攀登|爬到|岩沿|伸手拉|climb\w*|ledge",
        r"体力|绳索|队友|悬崖|峭壁|背包重量|stamina|rope|cliff",
        "悬崖上的午餐篮", "留下盯着下一个落脚点、估算还能爬多远的判断。",
        "一个人爬，篮子吊在身后。把篮子先挂在岩钉上能腾出力气往上爬，但不回头接它就送不到山顶。",
        "做一面六格岩壁、两枚岩钉和一条体力条。只实现爬一格、挂篮、提篮、歇脚四个动作，到顶时检查午餐篮。",
        "让人重爬一次，看他有没有主动换一个挂篮点，并能预测自己会在哪格耗尽体力。", 2),
    Experiment(
        r"抽牌|出牌|手里的牌|卡组|这副牌|套牌|draw cards|play cards|deckbuild\w*",
        r"回合|手牌|卡组构筑|遗物|牌组|turn[- ]based|deck|hand of cards",
        "三张牌开早点铺", "留下用现在这手牌解决眼前问题，同时改变下一手牌的取舍。",
        "把战斗换成早餐订单。火候、面团、装盘各占一张牌，多烤一份能赚小费，却会把一张焦锅塞回牌堆。",
        "做六张牌、三张订单和一个三格手牌区。每单发牌、选牌、弃牌再补牌，第三单结束显示小费与焦锅。",
        "给试玩者同一副牌试两次，看他第二次是否主动放弃小费，给下一单留一手。", 1),
    Experiment(
        r"抽牌|出牌|手里的牌|卡组|这副牌|套牌|draw cards|play cards|deckbuild\w*",
        r"回合|手牌|卡组构筑|遗物|牌组|turn[- ]based|deck|hand of cards",
        "退潮前的牌垛", "留下手里可用的牌很少、出哪张会改变后续局面的判断。",
        "潮水每回合淹一格，玩家用木桥牌接路、绳牌捞回用过的桥、灯牌提前看下一格。用掉灯牌能少猜一步，但这回合就不能造桥。",
        "做一排六格、六张固定手牌和一个潮位计。每回合点一张牌，显示它改变了哪一格，六轮内连通两岸。",
        "把同一个关卡给人打两次，看第二轮他在哪个时刻愿意停工换取情报。", 1),
    Experiment(
        r"密码|便笺|猜答案|线索|guess the password|unlock.*computer",
        r"电脑|办公室|工位|门锁|密码|password|office|computer",
        "失物柜的四位数", "留下把环境里的两条小线索拼成一个可验证答案的过程。",
        "密码藏在失主的生活习惯里。输错后，管理员指出从左往右第一处错位，并告诉你该位猜高了还是猜低了。玩家决定继续猜还是回头翻票据。",
        "一张失物台、三份票据、一个四位锁和两组固定谜底。实现查看票据、输入密码、比较首个错位数字并提示高低。",
        "观察试玩者第一次输错后翻哪一张票据，能不能解释那条提示排除了什么。", 1),
    Experiment(
        r"抛竿|收线|鱼钩|钓鱼|fishing|reel in|cast a line",
        r"等候|等待|浮标|遗骨|回忆|河|水面|鱼|fishing|bobber|river",
        "渡口的回信", "留下抛下线、等待动静，然后决定何时收线的节奏。",
        "水下是三封被冲散的信。轻拉能看见一个词，继续等有机会读到整句，也可能让水流把信带走。",
        "用一个浮标、一个按键和三封预写短信用固定时间表安排动静。钓回的词贴到岸边，再按自己的理解排顺序。",
        "看试玩者第二封是否改变收线时机，并能说明是哪个词让他愿意多等一次。", 1),
    Experiment(
        r"刹车|漂移|换挡|过弯|驾驶.*赛车|racing line|braking|drift\w*|driving.*car",
        r"竞速|赛道|转弯|弯道|赛车|race|track|circuit",
        "冰块快递", "留下在弯道前选速度、进弯后看路线是否偏离的反馈。",
        "终点要的是完整冰块。提前减速较稳，却会花更多时间让冰融化。每个弯都在交付重量和撞碎风险之间取舍。",
        "做俯视单条赛道、三个弯和一辆自动前进的车。只给加速、刹车两个键，三次过弯后称重结算。",
        "第二趟只显示送达重量，看玩家会改动哪个刹车点，能否解释那个弯为何值得减速。", 2),
    Experiment(
        r"刹车|漂移|换挡|过弯|驾驶.*赛车|racing line|braking|drift\w*|driving.*car",
        r"竞速|赛道|转弯|弯道|赛车|race|track|circuit",
        "先画一圈再发车", "留下在同一个弯反复改线、比较过弯效果的过程。",
        "车手只有发车前能做决定。把三枚刹车标贴到赛道上，发车后看车走完，再移动一枚标贴重试。",
        "用贝塞尔曲线或折线画一条环道。按标贴位置改变速度，过快就冲出路线损失时间，终点显示上一圈的影子。",
        "精简到一个急弯，让玩家只挪一枚标贴就再跑，观察他能否预判哪一圈更快。", 2),
    Experiment(
        r"闪避|翻滚|格挡|招架|parry|parrying|dodge|dodging",
        r"攻击|反击|战斗|敌人|节奏|boss|combat|counterattack",
        "瓷器传送带", "留下读懂前摇、在正确瞬间出手的判断。",
        "把敌人的起手换成传送带抖动。按早了会让盘子撞到挡板，按晚了会漏接；连续看准才会出现不同节奏的下一批。",
        "画一条带子、一个盘子和一块挡板。实现三种预警动画、一键接盘、成功和碎裂反馈，十个盘子结算。",
        "试一次正常预警、一次遮住预警；看接盘率和试玩者说出的视觉线索是否对应。", 1),
    Experiment(
        r"潜行|引开|视野盲区|sneak\w*|distract.*guard|line of sight",
        r"巡逻|警卫|潜入|守卫|视野|stealth|patrol|guard",
        "闭馆后的钟表匠", "留下观察巡逻空隙、决定现在动手还是等一轮的选择。",
        "展柜只能在钟响时上发条。叫响远处的钟能让巡馆人转头，但也用掉你本轮的上发条机会。",
        "一个走廊、两只钟、两座展柜。守卫按固定三步走，用点击敲钟或上发条；两座展柜都启动就结束。",
        "记录试玩者是否愿意空过一轮换巡逻位置，以及下次是否用同样的钟。", 2),
    Experiment(
        r"合成|采集|建造|砍树|挖矿|craft\w*|gather resources|mine ore",
        r"材料|庇护所|资源|生存|工作台|survival|shelter|materials|workbench",
        "最后三块木板", "留下把有限材料用在眼前需求或长期工具上的取舍。",
        "洪水三轮后到。木板既能堵漏也能垫高工具台，垫高后下一轮可以一次修两处，但这一轮会漏水。",
        "做一间仓库、三张漏点卡和三块可拖动的木板。只实现堵漏、垫高、涨水三个步骤，第三轮检查库存。",
        "给两个人同样的第一轮，观察他们是否选择不同用途，并能说出愿意承担哪项损失。", 1),
)


def valid_ideas(value):
    if not isinstance(value, list):
        return []
    fields = ("title", "keep", "change", "build", "playtest")
    return [idea for idea in value if isinstance(idea, dict) and type(idea.get("days")) is int
            and idea["days"] in (1, 2) and all(isinstance(idea.get(k), str) and idea[k].strip()
                                              for k in fields)][:2]


def observed_experiment(game, used):
    review = game.get("review") or {}
    video = game.get("video") or {}
    cue = " ".join((media.get("segment") or {}).get("cue", "") for media in (video, video.get("preview") or {}))
    evidence = [game.get("mechanic", ""), review.get("core", ""), cue]
    context = " ".join([*evidence, review.get("appeal", ""), game["title"], *(game.get("tags") or [])])
    matches = []
    for experiment in EXPERIMENTS:
        if not re.search(experiment.context, context, re.I):
            continue
        score = sum(weight for text, weight in zip(evidence, (3, 4, 3)) if re.search(experiment.action, text, re.I))
        if score:
            matches.append((score, experiment))
    if matches:
        strength = max(score for score, _ in matches)
        options = [experiment for score, experiment in matches if score == strength]
        return min(options, key=lambda experiment: used[experiment.title]).idea()
    title = game["title"]
    return {
        "title": f"猜《{title}》的下一步",
        "keep": f"先做观察练习。从《{title}》的实机里挑一次操作，仅记录输入前的局面和输入后看得见的变化。",
        "change": "改成预测谜题。玩家先选哪一处会发生变化，再对照你观察到的结果；猜错可以回到前一幕找漏掉的提示。",
        "build": "用自己的草图画两张状态图，把第一张设成两个可点区域。实现一次选择、原结果揭晓和重试。",
        "playtest": "给没看过原片的人试玩，观察第二次是否能指出导致结果变化的那条线索。", "days": 1,
    }


def add_prototype_ideas(games, previous):
    used = Counter(idea["title"] for issue in previous[:4] for game in issue["games"]
                   for idea in valid_ideas(game.get("prototypeIdeas")))
    for game in games:
        ideas = valid_ideas(game.get("prototypeIdeas")) or [observed_experiment(game, used)]
        game["prototypeIdeas"] = ideas
        used.update(idea["title"] for idea in ideas)

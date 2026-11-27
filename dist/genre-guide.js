"use strict";

// Each name is a library filter. The examples come from games filed under that filter.
const genreGuideGroups = [
  {
    title: "操作与时机",
    entries: [
      ["动作", "看动作，抓时机", "《只狼》里，对手的刀落下来，你要在那一刻决定招架还是闪开。"],
      ["射击", "瞄准、开火、确认命中", "《无畏契约》里，准星移到目标上，点下去，还要从画面判断这一下有没有打中。"],
      ["平台跳跃", "判断距离，找到落脚点", "《蔚蓝》里，同一个缺口，从哪里起跳、在哪一刻冲刺，决定能不能够到对岸。"],
      ["节奏", "听节拍，决定何时输入", "《节奏地牢》里，往哪一格走由你选，什么时候迈步由音乐给拍子。"]
    ]
  },
  {
    title: "推理与规划",
    entries: [
      ["解谜", "弄懂规则，找出解法", "《传送门》里，先想清楚从一扇门进去会从哪里出来，再决定把两扇门开在哪儿。"],
      ["策略", "预判局势，安排先后", "《植物大战僵尸》里，同一份阳光，种向日葵能让以后更宽裕，补防守能先撑过眼前这一波。"],
      ["卡牌", "在手牌和牌组里做取舍", "《小丑牌》里，每次出牌前都要决定保留哪几张、换掉哪几张，才有机会凑出想要的牌型。"]
    ]
  },
  {
    title: "角色与故事",
    entries: [
      ["角色扮演", "用角色的身份和能力做选择", "在角色扮演游戏（RPG）《博德之门 3》里，同一场交涉，角色擅长什么会影响你能怎么开口。"],
      ["叙事冒险", "追踪线索，发现接下来会发生什么", "《星际拓荒》里，一段留言会让你改变下一站。不同星球上的发现，逐渐拼出同一个故事。"]
    ]
  },
  {
    title: "资源与建设",
    entries: [
      ["模拟经营", "分配有限资源，让系统运转", "《星露谷物语》里，今天花时间浇水，还是用积蓄添一套洒水器？这个决定会改变明天的安排。"],
      ["生存建造", "搜集材料，先解决眼前的需要", "《我的世界》的生存模式里，天快黑了，手头的材料可以先做工具，也可以先搭个过夜的地方。"]
    ]
  },
  {
    title: "运动与比赛",
    entries: [
      ["竞速", "用路线和过弯争取更短用时", "《极限竞速：地平线 6》里，入弯前松一点油门，有机会更早出弯加速。"],
      ["体育", "在运动规则里争取比分或成绩", "《火箭联盟》里，开的也是车。这次你要读的是球的落点，决定自己抢球还是回防。"]
    ]
  },
  {
    title: "每局结构与游玩方式",
    entries: [
      ["Roguelike", "开新局，用这次拿到的东西想办法", "《哈迪斯》里，这一趟遇到的祝福会改变接下来的打法。周刊也把保留部分跨局成长的 Roguelite 收在这里。"],
      ["社交协作", "和同伴配合，一起完成目标", "《双人成行》里，一人把钉子钉进墙里，另一人用锤子钩住钉子荡过去。"],
      ["休闲", "按自己的步调玩一会儿", "《拆箱搬新家》里，可以花好几分钟给一件物品找位置，放下再回来也容易接着玩。"]
    ]
  }
];

function genreGuide() {
  const guide = element("div", "genre-guide");
  const head = element("header", "library-head");
  const back = element("a", "guide-back", "回到游戏库");
  back.href = libraryUrl();
  head.append(back, element("h1", "", "游戏分类速查"),
    element("p", "", "想不起类型名时，先问自己「我在游戏里反复做什么决定？」点一个分类，就能看库里的同类游戏。"));

  function row([name, cue, example]) {
    const item = element("li");
    const link = element("a", "guide-row");
    link.href = libraryUrl({ genre: name });
    const note = element("span", "guide-example", example);
    note.id = "guide-note-" + name.replaceAll(" ", "-");
    link.setAttribute("aria-label", name + "，" + cue + "。查看同类游戏");
    link.setAttribute("aria-describedby", note.id);
    const label = element("span", "guide-label");
    label.append(element("strong", "", name), element("span", "guide-cue", cue), icon("arrow"));
    link.append(label, note);
    item.append(link);
    return item;
  }

  const groups = element("div", "guide-groups");
  for (const { title, entries } of genreGuideGroups) {
    const section = element("section", "guide-group");
    const list = element("ul", "guide-entries");
    list.append(...entries.map(row));
    section.append(element("h2", "", title), list);
    groups.append(section);
  }

  const overlap = element("section", "guide-overlap");
  overlap.append(element("h2", "", "容易混的几组"));
  for (const [pair, explanation] of [
    ["解谜和策略", "《传送门》问的是「怎样才能到出口？」。《植物大战僵尸》里好几种安排都能挡住这一波，你要权衡哪种更利于下一波。"],
    ["动作和角色扮演", "《黑暗之魂 III》两者都有。眼前这一刀何时翻滚，是动作。打完这场准备升级哪项能力，是角色成长。"],
    ["卡牌和 Roguelike", "《小丑牌》里，留下哪张、换掉哪张，是卡牌。开新局后，围绕这次遇到的小丑牌重新搭配，是这款游戏的局内变化。"]
  ]) {
    const item = element("p");
    item.append(element("strong", "", pair), document.createTextNode(explanation));
    overlap.append(item);
  }

  const terms = element("details", "guide-terms");
  terms.append(element("summary", "", "常见缩写怎么记？ FPS、RPG、RTS、MOBA…"));
  const glossary = element("dl");
  for (const [term, meaning] of [
    ["FPS / TPS", "第一人称射击从角色眼睛的位置看出去。第三人称射击把镜头放在角色身外，通常能看见自己操纵的角色。"],
    ["RPG / ARPG", "RPG 是角色扮演。ARPG 是动作角色扮演，《黑暗之魂》既让你培养角色，也考验每次动作的时机。"],
    ["RTS / TBS", "都是策略游戏。RTS 是即时策略，对手会在你下令时继续行动。TBS 是回合制策略，按回合规划和结算行动。"],
    ["MOBA", "多人在线战术竞技。常见玩法是两队各控英雄，在一张地图上争夺目标、推进到对方基地。"],
    ["MMO / MMORPG", "MMO 表示大型多人在线。再加上 RPG，就表示许多玩家在共享世界中扮演和培养自己的角色。"]
  ]) glossary.append(element("dt", "", term), element("dd", "", meaning));
  terms.append(glossary);

  const studies = element("section", "guide-studies");
  const studyLinks = element("ul", "guide-entries");
  studyLinks.append(
    row([feelTag, "看一个动作如何回应按键", "从《只狼》的招架或《黑暗之魂 III》的快慢刀开始。看过实机，再亲手比较两个版本。"]),
    row([fpsTag, "听开火的声音，看回弹与命中反馈", "在《无畏契约》的小原型里，先听点空和命中的声音，再换一版感受命中时镜头跟着停一下的区别。"])
  );
  studies.append(element("h2", "", "想研究手感时"), studyLinks);
  guide.append(head, terms, groups, overlap, studies);
  return guide;
}

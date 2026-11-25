# 游感周刊 · Playtrace

[打开游感周刊](https://zmperfect.github.io/playtrace-weekly/) · 每周选五款游戏。先看玩家会反复做什么选择，再记下自己想改的一条规则。点进 Steam 可看实机或访问商店，标为浏览器试玩的作品可直接在 itch.io 体验。

## 周刊目录

<!-- weekly-index:start -->

- [阅读本期 · 2026-W48](https://zmperfect.github.io/playtrace-weekly/#issue/2026-W48)　PEAK、杀戮尖塔 2、Admin、Bongo Cat、Riba

<!-- weekly-index:end -->

网站由 GitHub Pages 托管，首页默认展示最新一期，右上角的期刊档案可切换往期。收藏与玩法笔记只保存在当前浏览器。

## 更新方式

首期经过人工选编。之后 GitHub Actions 计划在每周一北京时间 09:07 采集。Steam 按官方热玩榜周排名变化选择，并读取商店简介；itch.io 选择热门网页 Game Jam 作品，保留作者原文。之后的期数附带按游戏类型生成的原型问题。每期优先收录三款 Steam 游戏和两款 itch.io 作品，避开最近四期的重复游戏。单一来源不足时用另一来源补足，凑不齐五款会保留已有期刊并报告失败。

每次采集成功后，GitHub Actions 会把更新后的网页发布到同一个 GitHub Pages 地址。可以在 [GitHub Actions](https://github.com/zmperfect/playtrace-weekly/actions/workflows/collect.yml) 手动运行。勾选 `preview` 只查看候选作品。同一周再次正常运行会保留已经发布的选编。

## 本地运行

在仓库根目录执行以下命令，然后打开 <http://localhost:4183>。

```shell
python -m http.server 4183 --bind 127.0.0.1 --directory dist
```

采集和目录生成使用 Python 3.11 或更高版本的标准库。

```shell
python scripts/collect.py --preview
python scripts/collect.py
python tools/update_reader.py
```

期刊档案保存在 [dist/data/issues.json](dist/data/issues.json)。前端是静态 HTML、CSS 和 JavaScript。作品配图及名称归各自权利人所有，选编卡提供作品和选录来源链接。

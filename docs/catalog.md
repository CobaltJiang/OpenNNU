# 目录与资料字段

## 课程目录

`catalog/current-semester.csv` 是原始快照。运行 `npm run import:courses` 生成 `data/courses.json` 和 `data/catalog.json`；导入外部文件可运行 `npm run import:courses -- "清单.csv"`。

课程以课程号为键，同名不同号不合并。每门课程保留开课单位、学分、学时、课程类型、课程性质、校区、教师及完整教学班记录。空白字段保持空白；班次、课程号、教学班 ID 都作为字符串保留。

课程 ID 默认使用 `nnu-课程号`。原有力学与高数课程分别保留 `mechanics` 和 `advanced-mathematics-1`，兼容已有链接与收藏。

`data/catalog.json` 记录原始 CSV 的 SHA-256、教学班数、课程数及开课单位数。开课数据不计作试卷或笔记收录量。

教学班数据保存在 `sections` 数组中。课程层面的 `departments`、`credits`、`hours`、`types`、`natures`、`generalCategories`、`modules`、`campuses`、`teachers` 是各班实际值的去重集合。

没有资料的课程不必建立空目录。添加首份文件时创建 `courses/<course-id>/README.md`，并为课程设置 `directory: "courses/<course-id>"`。重新导入会保留已有资料目录和检索别名。

## 资料索引

`data/resources.json` 只收录经过审核、可以公开分享的资料。每份资料须填写：

| 字段 | 要求 |
| --- | --- |
| `id` | 唯一，全小写，连字符分词 |
| `courseId` | 引用课程 ID，不使用课程名匹配 |
| `title` | 资料标题 |
| `type` | 历年试卷 / 课程笔记 / 复习提纲 / 习题解析 / 其他资料 |
| `year` | 资料年份或学期；未知写“年份待核” |
| `origin` | 原卷 / 回忆版 / 学生原创 / 教师授权 / 其他 |
| `answerStatus` | 无答案 / 答案未核对 / 答案已校对 / 不适用 |
| `source` | 作者与原始出处 |
| `sourceUrl` | 可选的 HTTPS 来源地址 |
| `license` | 本资料实际适用的分享与使用条件 |
| `permission` | `confirmed` |
| `url` | 对应课程目录下的真实文件，或 HTTPS 公开地址 |
| `added` | 实际收录日期，`YYYY-MM-DD` |

本地地址填写原始文件名，前端统一编码中文与空格。构建只会复制索引中列明的资料文件。来源尚未确认的文件不要提交到公开仓库。

运行 `npm run check`、`npm test`、`npm run build` 检查。脚本校验字段、记录数量与文件存在性，内容真实性、分享许可与答案正确性仍需人工核对。

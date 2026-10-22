# 本学期开课清单

`current-semester.csv` 是用户提供的 `全校课程_5065.csv` 的原始快照。教学班 ID、班次与课程号均作为字符串保留，不推断其编码含义。

按课程号合并教学班。同名但课程号不同的课程分别保留；教师、校区、课程类型等差异保存在各教学班记录中。

运行 `npm run import:courses` 可重新生成 `data/courses.json` 和 `data/catalog.json`。也可用 `npm run import:courses -- "新的清单.csv"` 导入新快照。来源摘要记录文件 SHA-256，便于核对。

开课目录不表示已经收录试卷或笔记。资料数量独立来自 `data/resources.json`。

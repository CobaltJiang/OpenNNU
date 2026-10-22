# 目录与资料字段

`data/courses.json` 保存课程，`data/resources.json` 保存审核后可以公开的资料。界面统计与检索全部从这两个文件生成。

## 新增课程

为课程选择固定、全小写的英文 `id`，用连字符分词。`code` 是本项目的导航编号，不是学校教务课程号。具体教师、教材和适用专业没有核实前不要填写为确定事实。

```json
{
  "id": "example-course",
  "name": "课程名称",
  "englishName": "Course Name",
  "code": "SUBJECT / 01",
  "area": "学科分类",
  "audience": "适用对象待补充",
  "semester": "学期待补充",
  "description": "简短的课程介绍。",
  "aliases": ["课程简称"],
  "topics": ["主题示例"],
  "note": "信息来源、适用范围与待补充事项。",
  "directory": "courses/example-course"
}
```

同时创建 `courses/example-course/README.md`，说明当前收录状态。只有导航、没有文件的课程仍可显示，但资料数为 0。

## 新增资料

下面只是字段示例，**不是已经收录的资料，不要原样复制进正式索引**。

```json
{
  "id": "example-original-note",
  "courseId": "example-course",
  "title": "资料标题",
  "type": "课程笔记",
  "year": "年份待核",
  "origin": "学生原创",
  "answerStatus": "不适用",
  "source": "作者署名与出处说明",
  "sourceUrl": "https://example.com/original-source",
  "license": "作者确认的分享许可，例如 CC BY 4.0",
  "permission": "confirmed",
  "url": "courses/example-course/文件名.pdf",
  "added": "2026-10-22"
}
```

| 字段 | 要求 |
| --- | --- |
| `id` | 全局唯一、全小写，用连字符分词 |
| `courseId` | 必须引用已有课程 |
| `title` | 面向读者的真实标题 |
| `type` | 历年试卷 / 课程笔记 / 复习提纲 / 习题解析 / 其他资料 |
| `year` | 原始资料的年份或学期；未知写“年份待核” |
| `origin` | 原卷 / 回忆版 / 学生原创 / 教师授权 / 其他 |
| `answerStatus` | 无答案 / 答案未核对 / 答案已校对 / 不适用 |
| `source` | 作者、原始出处、提供者或来源说明；不填写私人联系方式 |
| `sourceUrl` | 可选的 HTTPS 原始来源地址 |
| `license` | 这份资料实际适用的分享与使用条件 |
| `permission` | 仅允许 `confirmed`，表示维护者已确认可以公开分享 |
| `url` | 本课程目录下真实存在的文件，或 HTTPS 公开链接 |
| `added` | 真实收录日期，格式 `YYYY-MM-DD` |

本地文件地址使用原始文件名，不手动做 URL 编码；前端会统一编码中文和空格。文件须在 `courses/<courseId>/` 下面。构建只会复制正式索引列明的本地文件，避免把目录中的其他内容无意部署。

不要把密钥、带私密访问凭据的地址或尚未确认分享许可的文件放入公开仓库。校验通过仅表示字段和路径符合规则，不代表内容或权利已由程序核实。

# OpenNNU

**南师大开放课程资料共享计划 · 让后来的人，不必再从零开始。**

[浏览 Web 资料库](https://cobaltjiang.github.io/OpenNNU/) · [贡献资料](CONTRIBUTING.md) · [反馈与纠错](https://github.com/CobaltJiang/OpenNNU/issues/new?template=correction.yml)

OpenNNU 由学生发起，收集、整理可以公开分享的课程资料，让零散的学习积累能够被找到、被理解、被接着完善。项目非学校官方网站。

## 当前进度

目前为初建版本：已建立 **力学、高等数学 I（上）两个筹建课程目录**，**正式收录资料为 0 份**。目录与 Web 界面已准备好，欢迎留下第一份资料。筹建课程不意味着已有试卷；网站中的统计直接读取实际目录数据。

Web 资料库支持课程搜索、学科筛选、课程详情、资料类型与年份筛选、浏览器收藏，以及生成 GitHub 投稿草稿。投稿不会直接公开到网站，维护者审核合并后才会收录。

## 开始贡献

无需会写代码：在 [Web 投稿页](https://cobaltjiang.github.io/OpenNNU/#/contribute) 填写信息，生成 GitHub Issue 草稿，检查后提交；也可以直接使用仓库的 [资料投稿模板](https://github.com/CobaltJiang/OpenNNU/issues/new?template=resource.yml)。

熟悉 Git 的同学可阅读 [贡献指南](CONTRIBUTING.md) 后提交 Pull Request。欢迎原创笔记、复习提纲、习题解析和取得分享许可的往年试卷。

## 本地运行

需要 Node.js 22 或更高版本，**无需安装第三方依赖**。

```sh
npm run dev
# 打开 http://127.0.0.1:4173

npm run check  # 校验课程、来源字段和本地文件
npm test       # 检验检索与投稿逻辑、目录规则
npm run build # 生成 dist/，仅发布索引中列明的资料文件
npm run preview
```

不应直接双击 `index.html`；浏览器对本地文件的数据读取存在限制。使用上述本地服务器即可。

## 目录

```text
assets/                  Web 界面、样式与检索逻辑
data/
  site.json              项目信息
  courses.json           课程目录
  resources.json         经审核的公开资料索引
courses/
  mechanics/             力学：课程说明和已审核文件
  advanced-mathematics-1/ 高数：课程说明和已审核文件
docs/catalog.md          元数据规范与添加示例
scripts/                 目录校验、构建与本地预览
tests/                   检索、安全地址、数据规则测试
.github/                 投稿模板与自动检查、部署流程
```

## 网站更新

`main` 分支的提交通过 GitHub Actions 校验、测试、构建后，部署到 GitHub Pages。Pull Request 只进行检查，不部署。数据保存在可审查的 JSON 与文件目录中，前端无账号系统，也不需要私密密钥。

首次部署需在仓库 `Settings → Pages → Build and deployment → Source` 选择 `GitHub Actions`。完整流程见 [.github/workflows/pages.yml](.github/workflows/pages.yml)。

## 来源与许可

代码使用 [MIT 许可证](LICENSE)。**该许可证不覆盖课程资料**：每份资料单独记录作者、来源与分享许可，原卷、回忆版、自编题及答案校对情况应如实标注。没有确认分享许可的资料不放入公开仓库，也不写入公开索引。

发现资料错误或需要更正、撤下，请通过 [反馈模板](https://github.com/CobaltJiang/OpenNNU/issues/new?template=correction.yml) 联系维护者。

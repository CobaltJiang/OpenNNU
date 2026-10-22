# 免登录上传

访客通过 GitHub Pages 上的文件表单，将资料传入本服务的私有 R2。D1 保存投稿信息及回执；未审核的文件不能公开读取。此服务不持有 GitHub 令牌，也不允许任意仓库写入。

限制：每次 1–5 个文件、单文件 50 MB、合计 100 MB；每天每 IP 最多申请 10 次上传，全站最多 100 次。一次性上传会话有效期 30 分钟。新版客户端逐文件流式上传，不在 Worker 内存中拼装大表单；未完成的会话不会进入待审列表。扩展名检查不是恶意文件扫描，维护者应在隔离环境预览，勿执行文件或 Office 宏。

## 本机审核（PowerShell 7）

上传管理密钥只保存在 Sites 服务端及本机 `.local/upload-admin.xml`（Windows DPAPI 加密，限当前 Windows 用户解密）。不要提交或分享该文件。换电脑须安全配置新管理密钥，并同步更新 Sites 的 `UPLOAD_ADMIN_KEY`，重新部署后生效。

在仓库根目录运行：

```powershell
pwsh -File scripts/upload-admin.ps1 -Mode List
pwsh -File scripts/upload-admin.ps1 -Mode Download -Id <投稿编号>
# 先核对下载文件、分享许可、课程及是否含个人信息；下列操作会公开文件。
pwsh -File scripts/upload-admin.ps1 -Mode Publish -Id <投稿编号> -CourseId mechanics -License 'CC BY 4.0' -Origin 学生原创 -AnswerStatus 不适用
pwsh -File scripts/upload-admin.ps1 -Mode Reject -Id <投稿编号>
```

Publish 从本机 Git Credential Manager 获取账号，确认 `CobaltJiang` 身份，以该账号调用 GitHub Git Data API，一次提交文件和资料索引，非强制更新 `main`。并发提交时拒绝覆盖，重试即可；投稿编号防止重复收录。GitHub 写入成功后才清除 R2 暂存文件。Reject 会删除所选投稿的暂存文件。待审列表需维护者主动查看，不是自动公开或自动审核。

## 服务开发

保留 `.openai/hosting.json` 中的 Site ID。Sites 部署本目录，GitHub Pages 只发布前端。`DB` 和 `BUCKET` 由 Sites 绑定；运行时 `UPLOAD_ADMIN_KEY` 必须为机密环境变量，不得写入源码或浏览器。Schema 变更使用 Drizzle 追加迁移。

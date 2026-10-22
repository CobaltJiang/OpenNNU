# 云端审核与下载来源

目标地址：`https://review.cybercobalt.xyz/review`。DNS 和证书验证完成前，使用上传服务原域名的 `/review` 路径。

## 权限边界

访客上传仍然免登录。审核者通过 Sites 的 ChatGPT 登录进入审核页；登录本身不赋予维护权限。服务端按该 Site 内稳定的身份编号查询角色，首位所有者仅能由服务端配置的已验证邮箱引导。浏览器不持有上传管理密钥或 GitHub 凭据。

| 角色 | 查看和核实许可 | 公开发布 / 拒绝 | 管理维护者 |
| --- | --- | --- | --- |
| 所有者 owner | 是 | 是 | 是 |
| 审核者 reviewer | 是 | 否 | 否 |
| 发布者 publisher | 是 | 是 | 否 |

多人维护接口为 `/api/review/members`（GET / POST）；只有所有者可授权或撤销。新成员先登录并提供自己的身份编号，所有者填写准确编号后授权，不能根据相同邮箱或显示名猜测身份。所有状态变更校验同源请求和服务端角色，并记录操作日志。预留的身份适配边界在 `review-auth.mjs`，以后可增加其他经过签名验证的身份提供方，不能直接信任浏览器自报身份。

资料审核需填写公开来源、实际许可、私有授权依据，并明确确认。保存审核结论和公开发布是分开的步骤；版本号防止覆盖他人的审核修改。不接受“未获授权”等占位许可。历史已公开资料不由此次功能自动改写或删除。

审核课程索引随服务部署，不在每次打开页面时依赖 GitHub 网络。更新 `data/courses.json` 后运行 `node scripts/sync-review-courses.mjs` 并一同提交课程快照；测试会检查二者一致。

## GitHub 发布授权

云端不使用本机 Git Credential Manager。需要创建并仅安装到 `CobaltJiang/OpenNNU` 的 GitHub App：

- Repository permissions：Contents **Read-only**、Actions **Read and write**、Metadata **Read-only**。
- 不开通其他仓库或组织权限。安装时选择 **Only select repositories → OpenNNU**。
- 在 Sites 的运行时机密环境变量中配置 `REVIEW_GITHUB_APP_ID`、`REVIEW_GITHUB_INSTALLATION_ID`、`REVIEW_GITHUB_PRIVATE_KEY`，然后重新部署。不要在聊天、仓库、前端代码或镜像中填写私钥。
- `REVIEW_OWNER_EMAIL` 是首位所有者的登录邮箱，只在服务端配置。`UPLOAD_ADMIN_KEY` 保持服务端机密，仅兼容旧的本机管理工具。

发布按钮在 App 未配置时禁用，不会假装成功。App 只负责派发固定仓库的 `publish-resource.yml` 并核实回执；真正下载和提交文件的是 GitHub Actions 的仓库限定 `GITHUB_TOKEN`。这样无需把 90 MB 文件转成 Base64 塞进 Worker 内存。

任务一小时后过期。工作流通过 GitHub 签发的短期 OIDC 身份访问文件：服务端校验签名、仓库、主分支、固定工作流、事件类型和每个任务独立的 audience，首次访问后绑定运行编号与重试次数。工作流输入只有任务编号和服务地址，不含密钥；其他工作流或 fork 的身份不能读取投稿。工作流禁用任意目标地址、跨域重定向和任意仓库，只从明确允许的 OpenNNU 服务下载。确认 GitHub 中的实际提交与已审核元数据一致后，才清理 R2 暂存。网络异常导致派发状态不明时保持锁定，维护者先核对 GitHub Actions，避免重复公开。

`GITHUB_TOKEN` 推送不自动触发 Pages，因此发布器会显式触发 `pages.yml`。提交作者标为 CobaltJiang，提交者为 OpenNNU Publisher；实际审批者保留在私有审核日志，不公开其邮箱。

## 域名与 DNS

Sites 绑定 `review.cybercobalt.xyz` 后，会返回一条 CNAME 和两条所有权验证 TXT 记录。按工具返回的精确值添加，不要覆盖其他服务已有记录；等 Sites 显示域名和 SSL 均有效后，再把正式入口切到该域名。单纯修改域名不能保证所有地区的直连网络可达。

## 镜像与下载

上传接口不可达（`Failed to fetch`）与 GitHub 文件下载慢是不同链路，下载镜像不会修复前者。先稳定上传服务的域名和网络路径；保留超时、短暂重试、失败阶段提示和原表单。

公开文件已有“本站文件”和“GitHub 原始文件”备用下载。`data/site.json` 预留：

```json
"downloads": {
  "preferred": "origin",
  "mirrors": []
}
```

以后自有 CDN 完成同步和完整性核对后，可添加 `{ "id": "own-cdn", "label": "自有 CDN", "baseURL": "https://你的CDN/OpenNNU/", "enabled": true }` 并修改 preferred。CDN 静态目录必须与仓库 `courses/...` 路径一致；只提供已审核的公开文件。默认不接第三方公共代理，不把管理 API、令牌、未审核文件或授权依据交给镜像。

不对未验证来源自动做浏览器 fetch 探测或失败自动跳转；保留人工切换来源，避免 CORS 误判、隐式第三方访问及镜像内容替换。后续可以在受控 CDN 中加入校验和、版本固定、缓存和下载统计。

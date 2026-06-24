# iCloud-Manager

iCloud Hide My Email 管理面板。它可以批量导入 iCloud 子邮箱、按主邮箱分组管理、搜索筛选、批量删除、批量导出查看链接，并直接通过主邮箱 IMAP 收取发给子邮箱的邮件。

现在只需要部署 iCloud-Manager 本体，不再依赖外部 mail-viewer 服务。

## 功能

- 保留原来的 `邮箱----链接` 导入格式，同时支持只有邮箱的导入格式，例如 `alias@icloud.com`。
- 在页面中配置主邮箱 IMAP 收信源，子邮箱会按选择的主邮箱关联并从该主邮箱里搜索邮件。
- 列表支持主邮箱筛选、名称/邮箱模糊查询、分页展示、自由多选、全选当前页、全选筛选结果。
- 支持批量删除选中邮箱，也支持按主邮箱删除全部关联子邮箱。
- 支持批量导出选中邮箱，格式为 `alias@icloud.com----http://your-host:17607/show/alias%40icloud.com`。
- `/show/{alias}` 是 iCloud-Manager 内置邮件查看页，会直接用配置好的 IMAP 收信源拉取邮件。
- 支持 Docker 部署，数据保存在 `data/` 或 Docker volume 中。

## 快速开始

```bash
npm install
npm run build
python start_panel.py
```

默认访问地址：

```text
http://127.0.0.1:17607/
```

默认面板密码是 `changeme`，部署前请通过 `.env` 或环境变量修改 `ICLOUD_PANEL_PASSWORD`。

## 环境变量

复制 `.env.example` 为 `.env` 后修改：

```bash
ICLOUD_PANEL_PASSWORD=your-panel-password
ICLOUD_PUBLIC_BASE_URL=http://your-host:17607
# ICLOUD_VIEWER_TOKEN=optional-token
```

- `ICLOUD_PUBLIC_BASE_URL` 用于批量导出 `/show/...` 链接。不填时默认导出 `http://127.0.0.1:17607`。
- `ICLOUD_VIEWER_TOKEN` 可选。设置后导出的 `/show/...` 链接会自动带 `?key=...`，访问查看页也会校验这个 key。

## 主邮箱收信源

在页面左侧「批量导入」里的「主邮箱收信源」配置：

- 名称：用于分组和导入时选择，例如 `main@icloud.com`
- 主邮箱：真实收信的主邮箱地址
- IMAP 服务器：iCloud 通常为 `imap.mail.me.com`
- 端口：SSL 通常为 `993`
- 用户名：通常为主邮箱地址
- 密码 / 授权码：建议使用 Apple 应用专用密码
- 邮箱目录：通常为 `INBOX`

导入子邮箱时选择对应主邮箱，之后刷新、扫描、`/show/...` 都会从这个主邮箱里搜索发给子邮箱的邮件。

## 导入格式

```text
alias-a@icloud.com
alias-b@icloud.com----http://legacy.example/show/alias-b%40icloud.com
```

旧链接格式会被兼容保存，但实际收信以页面配置的主邮箱 IMAP 收信源为准。

## 批量导出

在邮箱列表勾选需要导出的子邮箱，点击「批量导出选中」。导出的 TXT 每行类似：

```text
alias@icloud.com----http://your-host:17607/show/alias%40icloud.com
```

部署时配置 `ICLOUD_PUBLIC_BASE_URL` 后，导出链接会使用该公开地址。

## Docker

```bash
cp .env.example .env
docker compose up -d --build
```

访问：

```text
http://YOUR_SERVER_IP:17607/
```

数据保存在 Docker volume `icloud-manager-data`。

## 数据文件

```text
data/accounts.json       子邮箱账号数据
data/mail_sources.json   主邮箱 IMAP 收信源
data/mail_cache/*.json   邮件缓存
```

这些文件包含你的真实邮箱数据和 IMAP 授权信息，请不要提交到 Git。

## 安全说明

- 面板使用 `ICLOUD_PANEL_PASSWORD` 登录。
- IMAP 密码或授权码只保存在本项目的数据目录中。
- `/show/...` 可通过 `ICLOUD_VIEWER_TOKEN` 加访问 key。
- 建议生产环境只通过 HTTPS 暴露服务。

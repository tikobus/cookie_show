# Cookie Viewer & Exporter（Firefox 扩展）

查看当前页面的全部 Cookie，并一键导出为多种常用格式。

## 功能

- **查看**：列出当前页面实际会携带的所有 Cookie（含父域），显示名称、值、域、路径、过期时间，以及 `HttpOnly` / `Secure` / `SameSite` / `hostOnly` / 会话 标志
- **搜索**：按名称 / 值 / 域实时过滤
- **导出**：
  | 格式 | 说明 |
  | --- | --- |
  | JSON 文件 / 复制 JSON | 保留 Cookie 的全部属性，便于程序处理 |
  | cookies.txt（Netscape 格式） | 兼容 `curl -b`、`wget --load-cookies`、`yt-dlp --cookies` 等工具 |
  | Cookie Header 串 | `k1=v1; k2=v2` 形式，可直接用于请求头 / 抓包工具 |
  | cURL 命令 | 带完整 Cookie 头的 `curl` 请求，可直接在终端执行 |
- **单条复制**：悬停 Cookie 卡片可快速复制 `name=value`
- 超长值点击展开，亮 / 暗色主题自适应

## 安装与使用

### 临时加载（开发调试）

1. 打开 Firefox，访问 `about:debugging#/runtime/this-firefox`
2. 点击「临时载入附加组件…」，选择本目录下的 `manifest.json`
3. 工具栏出现 Cookie 图标，在任何网页点击即可查看

### 正式安装（打包 xpi）

```bash
# 打包为 zip 并改名为 .xpi
cd cookie_show
zip -r ../cookie_viewer.xpi manifest.json icons popup
mv ../cookie_viewer.xpi .   # 可选
```

然后在 `about:addons` → 齿轮菜单 →「Install Add-on From File…」选择 `.xpi` 文件，
或发布到 [addons.mozilla.org](https://addons.mozilla.org/)。

使用 [web-ext](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/) 开发更方便：

```bash
npx web-ext run          # 自动启动 Firefox 并加载扩展
npx web-ext lint         # 校验清单与代码
npx web-ext build        # 打包
```

## 权限说明

| 权限 | 用途 |
| --- | --- |
| `cookies` | 读取当前页面的 Cookie |
| `activeTab` | 获取当前标签页地址 / 图标，点击图标时临时获得该站访问权 |
| `downloads` | 导出 JSON / cookies.txt 文件 |
| `clipboardWrite` | 复制 Header / JSON / cURL 到剪贴板 |
| `host_permissions: <all_urls>` | Firefox MV3 中主机权限默认不自动授予；首次使用时扩展会弹窗请求，仅用于读取所访问站点的 Cookie |

## 目录结构

```
cookie_show/
├── manifest.json        # MV3 清单（Firefox）
├── icons/icon.svg       # 工具栏图标
└── popup/
    ├── popup.html       # 弹窗结构
    ├── popup.css        # 样式（含暗色模式）
    └── popup.js         # 读取 / 渲染 / 过滤 / 多格式导出
```

## 安全提示

Cookie 中常包含登录凭据（如 `session`、`token`）。导出的文件与剪贴板内容等同于账号凭证，
请勿分享给不可信的第三方或提交到代码仓库。

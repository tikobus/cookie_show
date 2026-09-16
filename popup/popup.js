/* Cookie Viewer & Exporter — popup 逻辑 */

const PERMS = { origins: ["<all_urls>"] };

const state = {
  url: null,
  host: "",
  cookies: [],
  filter: "",
};

const $ = (id) => document.getElementById(id);
const listEl = $("list");

/* ---------- 初始化 ---------- */

async function init() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) {
    showEmpty("无法获取当前标签页");
    return;
  }

  state.url = new URL(tab.url);

  // 顶部站点信息
  state.host = state.url.host || state.url.href;
  const hostEl = $("host");
  hostEl.textContent = state.host;
  hostEl.title = tab.url;

  if (tab.favIconUrl && /^https?:|^data:/.test(tab.favIconUrl)) {
    const fav = $("favicon");
    fav.src = tab.favIconUrl;
    fav.hidden = false;
    fav.onerror = () => {
      fav.hidden = true;
    };
  }

  // 导出菜单
  $("exportBtn").addEventListener("click", toggleMenu);
  $("exportMenu").addEventListener("click", onMenuAction);
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".export-wrap")) closeMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });

  // 工具栏
  $("refresh").addEventListener("click", () => loadCookies());
  $("copyHeader").addEventListener("click", () => {
    copyText(toHeaderString(state.cookies), "Cookie Header 已复制");
  });
  $("search").addEventListener("input", (e) => {
    state.filter = e.target.value.trim().toLowerCase();
    renderList();
    updateCount();
  });

  if (!/^https?:$/.test(state.url.protocol)) {
    showEmpty(`此页面（${state.url.protocol}//）不支持 Cookie`);
    $("count").textContent = "—";
    return;
  }

  await loadCookies();
}

/* ---------- 加载 ---------- */

async function loadCookies() {
  clearBanner();
  $("count").textContent = "正在加载…";
  let cookies;
  try {
    // 优先尝试直接读取：activeTab 或已授权的 host 权限可能已经足够
    cookies = await browser.cookies.getAll({ url: state.url.href });
  } catch {
    // 缺少主机权限，引导用户授予
    $("count").textContent = "权限不足";
    showBanner({
      text: "需要「访问站点数据」权限才能读取当前页面的 Cookie。授权后即可查看与导出。",
      actionText: "授予权限",
      onAction: async () => {
        try {
          const granted = await browser.permissions.request(PERMS);
          if (granted) await loadCookies();
        } catch (e) {
          showError(e);
        }
      },
    });
    return;
  }

  state.cookies = cookies.sort((a, b) => a.name.localeCompare(b.name));
  renderList();
  updateCount();
}

/* ---------- 渲染 ---------- */

function filterCookies() {
  if (!state.filter) return state.cookies;
  const f = state.filter;
  return state.cookies.filter(
    (c) =>
      c.name.toLowerCase().includes(f) ||
      c.value.toLowerCase().includes(f) ||
      (c.domain || "").toLowerCase().includes(f)
  );
}

function renderList() {
  listEl.textContent = "";
  const shown = filterCookies();
  const hasAny = state.cookies.length > 0;

  for (const c of shown) {
    listEl.appendChild(cookieCard(c));
  }

  if (shown.length === 0) {
    $("empty").hidden = false;
    $("emptyText").textContent = hasAny
      ? "没有匹配搜索条件的 Cookie"
      : "此页面未设置任何 Cookie";
  } else {
    $("empty").hidden = true;
  }

  const emptyList = !hasAny;
  $("copyHeader").disabled = emptyList;
  $("exportBtn").disabled = emptyList;
}

function updateCount() {
  const total = state.cookies.length;
  const shown = filterCookies().length;
  $("count").textContent =
    state.filter && shown !== total
      ? `${shown} / ${total} 个 Cookie`
      : `${total} 个 Cookie`;
}

function cookieCard(c) {
  const card = el("div", "cookie");

  // 名称行 + 单条复制按钮
  const head = el("div", "cookie-head");
  head.appendChild(el("span", "cookie-name", c.name));
  const copyBtn = el("button", "cookie-copy", "复制");
  copyBtn.title = "复制 name=value";
  copyBtn.addEventListener("click", () => {
    copyText(`${c.name}=${c.value}`, `已复制 ${c.name}`);
  });
  head.appendChild(copyBtn);
  card.appendChild(head);

  // 属性徽章
  const flags = el("div", "cookie-flags");
  if (c.hostOnly) flags.appendChild(badge("仅此主机", true));
  if (c.httpOnly) flags.appendChild(badge("HttpOnly", true));
  if (c.secure) flags.appendChild(badge("Secure", true));
  const sameSiteMap = {
    no_restriction: "SameSite=None",
    lax: "SameSite=Lax",
    strict: "SameSite=Strict",
    unspecified: "SameSite=未指定",
  };
  flags.appendChild(badge(sameSiteMap[c.sameSite] || "SameSite=未指定", false));
  if (c.session) flags.appendChild(badge("会话", false));
  card.appendChild(flags);

  // 值（点击展开 / 收起超长内容）
  const value = el("div", "cookie-value", c.value);
  value.title = "点击展开 / 收起";
  value.addEventListener("click", () => value.classList.toggle("clamped"));
  card.appendChild(value);

  // 元信息
  const meta = el("div", "cookie-meta");
  meta.appendChild(metaItem("域", c.domain || state.host));
  meta.appendChild(metaItem("路径", c.path || "/"));
  meta.appendChild(metaItem("过期", expiryText(c)));
  card.appendChild(meta);

  return card;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function badge(text, on) {
  const b = el("span", "badge" + (on ? " on" : ""), text);
  return b;
}

function metaItem(label, value) {
  const span = el("span");
  const labelEl = el("span", null, `${label} `);
  const code = el("code", null, value);
  span.appendChild(labelEl);
  span.appendChild(code);
  return span;
}

function expiryText(c) {
  if (c.session || !c.expirationDate) return "会话结束";
  const date = new Date(c.expirationDate * 1000);
  const expired = date.getTime() < Date.now();
  const abs = date.toLocaleString();
  return expired ? `${abs}（已过期）` : abs;
}

function showEmpty(text) {
  $("empty").hidden = false;
  $("emptyText").textContent = text;
  $("copyHeader").disabled = true;
  $("exportBtn").disabled = true;
}

function showBanner({ text, actionText, onAction, danger }) {
  const banner = $("banner");
  banner.textContent = "";
  banner.classList.toggle("danger", Boolean(danger));
  banner.appendChild(el("span", null, text));
  if (actionText) {
    const btn = el("button", "btn", actionText);
    btn.addEventListener("click", onAction);
    banner.appendChild(btn);
  }
  banner.hidden = false;
}

function clearBanner() {
  $("banner").hidden = true;
}

function showError(e) {
  showBanner({
    text: `出错了：${e && e.message ? e.message : e}`,
    danger: true,
  });
}

/* ---------- 导出格式 ---------- */

function toHeaderString(cookies) {
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

function toJson(cookies) {
  return JSON.stringify(cookies, null, 2);
}

function toNetscape(cookies) {
  // 格式规范：https://curl.se/docs/http-cookies.html
  const lines = [
    "# Netscape HTTP Cookie File",
    "# https://curl.se/docs/http-cookies.html",
    "#",
    `# Generated by Cookie Viewer & Exporter at ${new Date().toLocaleString()}`,
    `# Target: ${state.url.href} (${cookies.length} cookies)`,
    "#",
  ];
  for (const c of cookies) {
    const domain = c.domain || state.host;
    const includeSub = domain.startsWith(".") ? "TRUE" : "FALSE";
    const secure = c.secure ? "TRUE" : "FALSE";
    const expiry = c.session || !c.expirationDate ? 0 : Math.round(c.expirationDate);
    // HttpOnly cookie 依惯例加 #HttpOnly_ 前缀，curl / yt-dlp 均支持
    const prefix = c.httpOnly ? "#HttpOnly_" : "";
    lines.push(
      [prefix + domain, includeSub, c.path || "/", secure, expiry, c.name, c.value].join("\t")
    );
  }
  return lines.join("\n") + "\n";
}

function toCurl(cookies) {
  const q = (s) => `'${s.replace(/'/g, "'\\''")}'`;
  return `curl ${q(state.url.href)} \\\n  -H ${q(`Cookie: ${toHeaderString(cookies)}`)}`;
}

/* ---------- 导出动作 ---------- */

function onMenuAction(e) {
  const btn = e.target.closest(".menu-item");
  if (!btn) return;
  closeMenu();
  const action = btn.dataset.action;
  const cookies = state.cookies;

  if (action === "json-file") {
    download("json", toJson(cookies));
  } else if (action === "netscape-file") {
    download("txt", toNetscape(cookies));
  } else if (action === "json-copy") {
    copyText(toJson(cookies), "JSON 已复制");
  } else if (action === "curl-copy") {
    copyText(toCurl(cookies), "cURL 命令已复制");
  }
}

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function download(ext, content) {
  const mime = ext === "json" ? "application/json" : "text/plain";
  const safeHost = (state.host || "site").replace(/[^a-z0-9.-]+/gi, "-");
  const filename =
    ext === "json"
      ? `cookies_${safeHost}_${timestamp()}.json`
      : `cookies_${safeHost}_${timestamp()}.txt`;
  // data: URL 不受 popup 生命周期影响，比 blob: 更稳
  const url = `data:${mime};charset=utf-8,${encodeURIComponent(content)}`;
  browser.downloads
    .download({ url, filename, saveAs: true })
    .then(() => toast(`已开始下载 ${filename}`))
    .catch(showError);
}

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    toast(message);
  } catch (e) {
    showError(e);
  }
}

/* ---------- 菜单 / Toast ---------- */

function toggleMenu() {
  const menu = $("exportMenu");
  menu.hidden = !menu.hidden;
  $("exportBtn").setAttribute("aria-expanded", String(!menu.hidden));
}

function closeMenu() {
  $("exportMenu").hidden = true;
  $("exportBtn").setAttribute("aria-expanded", "false");
}

let toastTimer = null;
function toast(message) {
  const t = $("toast");
  t.textContent = message;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.hidden = true;
  }, 1600);
}

/* ---------- 启动 ---------- */

init().catch((e) => {
  $("count").textContent = "初始化失败";
  showError(e);
});

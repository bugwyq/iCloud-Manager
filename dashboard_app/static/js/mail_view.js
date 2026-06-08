import { $, escapeHtml, formatTime } from "./dom.js";

export function updateMailboxHeader(account, cache, busy = false) {
  $("fetch-btn").disabled = !account || !account.has_source || busy;
  $("clear-cache-btn").disabled = !account || !account.cached || busy;
  $("delete-btn").disabled = !account || busy;
  if (!account) {
    $("mail-title").textContent = "请选择邮箱";
    $("mail-sub").textContent = "选择左侧邮箱后查看历史邮件";
    return;
  }
  $("mail-title").textContent = account.email;
  const count = cache?.message_count ?? account.last_message_count ?? 0;
  const fetched = cache?.fetched_at || account.last_fetch_at;
  const noHistory = Boolean(cache?.no_history || account.no_history);
  const status = account.last_error ? ` · ${account.last_error}` : noHistory ? " · 无历史邮件" : "";
  $("mail-sub").textContent = `${count} 封邮件 · ${formatTime(fetched)}${status}`;
}

export function renderMailList(state, onSelectMessage) {
  const box = $("mail-list");
  if (!state.messages.length) {
    const emptyText = state.noHistory ? "无历史邮件" : "暂无缓存邮件";
    box.innerHTML = `<div class="empty">${emptyText}</div>`;
    renderMailDetail(null, 0, emptyText);
    return;
  }
  box.innerHTML = "";
  state.messages.forEach((message, index) => {
    const displayMessage = normalizeMessage(message);
    const item = document.createElement("button");
    item.type = "button";
    item.className = `mail-item ${message.id === state.selectedMessageId ? "active" : ""}`;
    const subject = displayMessage.subject || `第 ${index + 1} 封历史邮件`;
    const sender = displayMessage.from || displayMessage.to || "未知发件人";
    item.innerHTML = `
      <div class="mail-subject">${escapeHtml(subject)}</div>
      <div class="mail-meta">${escapeHtml(sender)}</div>
      <div class="mail-meta">${escapeHtml(displayMessage.date || "")}</div>
    `;
    item.addEventListener("click", () => onSelectMessage(message.id));
    box.appendChild(item);
  });
}

export function renderMailDetail(message, totalMessages = 0, emptyText = "邮件内容会显示在这里") {
  const box = $("mail-detail");
  message = normalizeMessage(message);
  const hasOriginalHtml = Boolean(message?.html);
  const code = String(message?.verification_code || "").trim();
  const shouldUseFullWidth = hasOriginalHtml && totalMessages <= 1;
  box.classList.toggle("raw-mail-detail", hasOriginalHtml);
  box.classList.toggle("has-code", Boolean(code));
  box.closest(".messages")?.classList.toggle("raw-mail-open", shouldUseFullWidth);
  if (!message) {
    box.innerHTML = `<div class="empty">${escapeHtml(emptyText)}</div>`;
    return;
  }
  if (message.html) {
    const frame = document.createElement("iframe");
    frame.className = "mail-frame";
    frame.title = message.subject || "原始邮件";
    frame.setAttribute("sandbox", "allow-popups allow-popups-to-escape-sandbox");
    frame.setAttribute("referrerpolicy", "no-referrer-when-downgrade");
    frame.srcdoc = withBaseHref(message.html, message.base_url || "");
    if (code) {
      const shell = document.createElement("div");
      shell.className = "mail-html-shell";
      shell.appendChild(codeCard(code));
      shell.appendChild(frame);
      box.replaceChildren(shell);
    } else {
      box.replaceChildren(frame);
    }
    return;
  }
  box.innerHTML = `
    ${code ? codeCardHtml(code) : ""}
    <div class="detail-subject">${escapeHtml(message.subject || "无主题")}</div>
    <div class="detail-meta">
      <div>发件人：${escapeHtml(message.from || "未知")}</div>
      <div>收件人：${escapeHtml(message.to || "未知")}</div>
      <div>时间：${escapeHtml(message.date || "未知")}</div>
    </div>
    <pre class="detail-body raw-text-body">${escapeHtml(message.body || "")}</pre>
  `;
  bindCodeCopy(box);
}

function withBaseHref(html, baseUrl) {
  const source = String(html || "");
  const base = String(baseUrl || "").trim();
  if (!source || !base || /<base\b/i.test(source)) return source;
  const tag = `<base href="${escapeHtml(base)}">`;
  if (/<head[^>]*>/i.test(source)) {
    return source.replace(/<head([^>]*)>/i, `<head$1>${tag}`);
  }
  return `${tag}${source}`;
}

function codeCard(code) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = codeCardHtml(code);
  bindCodeCopy(wrapper);
  return wrapper.firstElementChild;
}

function codeCardHtml(code) {
  return `
    <div class="code-card">
      <div>
        <div class="code-label">验证码</div>
        <div class="code-value">${escapeHtml(code)}</div>
      </div>
      <button class="secondary copy-code-btn" type="button" data-code="${escapeHtml(code)}">复制</button>
    </div>
  `;
}

function bindCodeCopy(root) {
  root.querySelectorAll(".copy-code-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const code = button.dataset.code || "";
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code);
        button.textContent = "已复制";
        setTimeout(() => {
          button.textContent = "复制";
        }, 1200);
      } catch {
        button.textContent = "复制失败";
        setTimeout(() => {
          button.textContent = "复制";
        }, 1200);
      }
    });
  });
}

function normalizeMessage(message) {
  if (!message || typeof message !== "object") return message;
  const body = String(message.body || "").trim();
  if (!body.startsWith("{")) return message;
  try {
    const payload = parseLegacyPayload(body);
    if (!payload) return message;
    const raw = String(payload.msg || payload.message || payload.body || "");
    if (!raw.trim()) return message;
    const html = looksLikeHtml(raw) ? raw : "";
    const text = html ? htmlToText(raw) : normalizeNewlines(raw);
    const code = message.verification_code || extractCode(`${message.subject || ""}\n${text}`);
    return {
      ...message,
      subject: code && (!message.subject || message.subject === "无主题") ? `验证码 ${code}` : message.subject,
      date: message.date || payload.time || payload.date || "",
      body: text,
      html: html || message.html,
      verification_code: code || message.verification_code || ""
    };
  } catch {
    return message;
  }
}

function parseLegacyPayload(body) {
  try {
    return JSON.parse(body);
  } catch {
    const match = String(body || "").match(/\{\s*"status"\s*:\s*true\s*,\s*"msg"\s*:\s*"([\s\S]*?)"\s*,\s*"time"\s*:\s*"([^"]*)"/i);
    if (!match) return null;
    return {
      msg: unescapeLegacyJsonText(match[1]),
      time: unescapeLegacyJsonText(match[2])
    };
  }
}

function unescapeLegacyJsonText(value) {
  return String(value || "")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, "\"")
    .replace(/\\\\/g, "\\");
}

function normalizeNewlines(value) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function looksLikeHtml(value) {
  return /<\/?[a-z][\s\S]*>/i.test(String(value || ""));
}

function htmlToText(value) {
  const doc = new DOMParser().parseFromString(String(value || ""), "text/html");
  return normalizeNewlines(doc.body?.textContent || "");
}

function extractCode(value) {
  const text = String(value || "");
  const contextual = text.match(/(?:验证码|登录代码|动态码|校验码|验证代码|verification code|login code|one[-\s]?time code|security code|code)[^\d]{0,100}(\d(?:[\s-]?\d){3,7})/i);
  if (contextual) return contextual[1].replace(/\D/g, "");
  const normalized = text.replace(/\s+/g, " ");
  if (normalized.length > 260) return "";
  const standalone = text.match(/(?<!\d)(\d{4,8})(?!\d)/);
  return standalone ? standalone[1] : "";
}

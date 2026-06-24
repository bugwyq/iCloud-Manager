import { $ } from "./dom.js";

export function setupTheme() {
  const savedTheme = localStorage.getItem("icloud-panel-theme") || "";
  localStorage.removeItem("icloud-panel-visual");
  if (savedTheme) document.documentElement.setAttribute("data-theme", savedTheme);
  document.documentElement.setAttribute("data-visual", "moyu");
  syncButtons();

  $("themeToggle").addEventListener("click", () => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    if (isDark) {
      document.documentElement.removeAttribute("data-theme");
      localStorage.removeItem("icloud-panel-theme");
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("icloud-panel-theme", "dark");
    }
    syncButtons();
  });

  $("copy-name-btn")?.addEventListener("click", async () => {
    const button = $("copy-name-btn");
    const value = button?.dataset.emailName || "";
    if (!value) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const input = document.createElement("textarea");
        input.value = value;
        input.style.position = "fixed";
        input.style.left = "-9999px";
        document.body.append(input);
        input.select();
        document.execCommand("copy");
        input.remove();
      }
      button.textContent = "已复制";
    } catch {
      button.textContent = "复制失败";
    }
    window.setTimeout(() => {
      button.textContent = "复制邮箱名";
    }, 1200);
  });
}

function syncButtons() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  $("themeToggle").textContent = isDark ? "浅色" : "深色";
}



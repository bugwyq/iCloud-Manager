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

}

function syncButtons() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  $("themeToggle").textContent = isDark ? "浅色" : "深色";
}



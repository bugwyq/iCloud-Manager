"use client"

import { useEffect, useState } from "react"

export function ThemeControls() {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    setIsDark(document.documentElement.getAttribute("data-theme") === "dark")
  }, [])

  const toggleTheme = () => {
    const root = document.documentElement
    const dark = root.getAttribute("data-theme") === "dark"
    if (dark) {
      root.removeAttribute("data-theme")
      localStorage.removeItem("icloud-panel-theme")
    } else {
      root.setAttribute("data-theme", "dark")
      localStorage.setItem("icloud-panel-theme", "dark")
    }
    setIsDark(!dark)
  }

  return (
    <button className="secondary" type="button" onClick={toggleTheme}>
      {isDark ? "浅色" : "深色"}
    </button>
  )
}

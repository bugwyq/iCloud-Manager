"use client"

import { useEffect, useMemo, useState } from "react"

export function ThemeControls({ email = "" }: { email?: string }) {
  const [isDark, setIsDark] = useState(false)
  const [copyLabel, setCopyLabel] = useState("复制邮箱名")
  const emailName = useMemo(() => String(email || "").split("@")[0] || "", [email])

  useEffect(() => {
    const root = document.documentElement
    setIsDark(root.getAttribute("data-theme") === "dark")
  }, [])

  useEffect(() => {
    setCopyLabel("复制邮箱名")
  }, [emailName])

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

  const copyEmailName = async () => {
    if (!emailName) return
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(emailName)
      } else {
        const input = document.createElement("textarea")
        input.value = emailName
        input.style.position = "fixed"
        input.style.left = "-9999px"
        document.body.append(input)
        input.select()
        document.execCommand("copy")
        input.remove()
      }
      setCopyLabel("已复制")
    } catch {
      setCopyLabel("复制失败")
    }
    window.setTimeout(() => setCopyLabel("复制邮箱名"), 1200)
  }

  return (
    <>
      <button className="secondary" type="button" onClick={toggleTheme}>
        {isDark ? "浅色" : "深色"}
      </button>
      <button
        className="secondary"
        type="button"
        disabled={!emailName}
        onClick={copyEmailName}
        title={emailName ? `复制 ${emailName}` : "请选择邮箱"}
      >
        {copyLabel}
      </button>
    </>
  )
}

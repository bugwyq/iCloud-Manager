import type { Metadata, Viewport } from "next"
import type { ReactNode } from "react"
import "./globals.css"

export const metadata: Metadata = {
  title: "iCloud邮箱管理面板",
  description: "iCloud Hide My Email 管理、检索与导出",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#eef8ff",
}

const themeInit = `(function(){try{
  var t=localStorage.getItem("icloud-panel-theme")||"";
  if(t)document.documentElement.setAttribute("data-theme",t);
  localStorage.removeItem("icloud-panel-visual");
  document.documentElement.setAttribute("data-visual","moyu");
}catch(e){document.documentElement.setAttribute("data-visual","moyu");}})();`

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" data-visual="moyu" className="bg-background" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>{children}</body>
    </html>
  )
}

"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { MailSource, MainMailboxOption } from "@/lib/types"

const EMPTY_SOURCE: Partial<MailSource> = {
  name: "",
  email: "",
  imap_host: "imap.mail.me.com",
  imap_port: 993,
  username: "",
  password: "",
  use_ssl: true,
  folder: "INBOX",
  enabled: true,
  max_results: 1000,
}

export function ImportPanel({
  importing,
  mailSources,
  mainMailboxes,
  defaultMainMailbox,
  onImport,
  onSaveMailSource,
  onTestMailSource,
  onDeleteMailSource,
  onLog,
  onToast,
}: {
  importing: boolean
  mailSources: MailSource[]
  mainMailboxes: MainMailboxOption[]
  defaultMainMailbox: string
  onImport: (text: string, mainMailbox?: string) => Promise<boolean | undefined>
  onSaveMailSource: (source: Partial<MailSource>) => Promise<MailSource | undefined>
  onTestMailSource: (source: Partial<MailSource>) => Promise<MailSource | undefined>
  onDeleteMailSource: (id: string) => Promise<boolean | undefined>
  onLog: (message: string) => void
  onToast: (message: string, type?: "ok" | "error" | "warn" | "success") => void
}) {
  const [text, setText] = useState("")
  const [mainMailbox, setMainMailbox] = useState(defaultMainMailbox)
  const [fileName, setFileName] = useState("未选择文件")
  const [configOpen, setConfigOpen] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)
  const [testingConfig, setTestingConfig] = useState(false)
  const [draft, setDraft] = useState<Partial<MailSource>>(EMPTY_SOURCE)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setMainMailbox(defaultMainMailbox)
  }, [defaultMainMailbox])

  const enabledCount = useMemo(
    () => mailSources.filter((source) => source.enabled !== false).length,
    [mailSources],
  )

  const sourceLabel =
    enabledCount > 0
      ? `${enabledCount} 个主邮箱收信源`
      : "未配置主邮箱收信源"

  const editSource = (source: MailSource) => {
    setDraft({
      ...source,
      password: "",
    })
  }

  const newSource = () => {
    setDraft(EMPTY_SOURCE)
  }

  const updateDraft = (patch: Partial<MailSource>) => {
    setDraft((prev) => ({ ...prev, ...patch }))
  }

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    try {
      const content = await file.text()
      setText(content)
      onLog(`已载入文件：${file.name}`)
    } catch (err) {
      onLog(`读取文件失败：${(err as Error).message}`)
      onToast("读取文件失败", "error")
    }
  }

  const submit = async () => {
    const ok = await onImport(text, mainMailbox.trim())
    if (ok) setText("")
  }

  const submitConfig = async (event: React.FormEvent) => {
    event.preventDefault()
    setSavingConfig(true)
    try {
      const saved = await onSaveMailSource(normalizedDraft(draft))
      if (saved) editSource(saved)
    } catch (err) {
      onToast((err as Error).message, "error")
    } finally {
      setSavingConfig(false)
    }
  }

  const testConfig = async () => {
    setTestingConfig(true)
    try {
      const saved = await onTestMailSource(normalizedDraft(draft))
      if (saved) editSource(saved)
    } catch (err) {
      onToast((err as Error).message, "error")
    } finally {
      setTestingConfig(false)
    }
  }

  const deleteSource = async (source: MailSource) => {
    if (!source.id) return
    if (!window.confirm(`确认删除收信源「${source.name || source.email}」？`)) return
    await onDeleteMailSource(source.id)
    if (draft.id === source.id) newSource()
  }

  return (
    <>
      <details className="box fold">
        <summary>批量导入</summary>
        <div className="foldBody">
          <div className={`configStrip ${enabledCount ? "" : "needsConfig"}`}>
            <div>
              <b>主邮箱收信源</b>
              <span>{sourceLabel}</span>
            </div>
            <button className="secondary" type="button" onClick={() => setConfigOpen(true)}>
              配置
            </button>
          </div>

          <div className="uploadBox">
            <input
              ref={fileRef}
              className="srFile"
              id="file-input"
              type="file"
              accept=".txt,text/plain"
              onChange={onFile}
            />
            <label className="filePick" htmlFor="file-input">
              <span className="fileCode">TXT</span>
              <span>选择文件</span>
            </label>
            <span className="fileName">{fileName}</span>
          </div>

          <div className="row">
            <input
              list="main-mailbox-options"
              placeholder="关联主邮箱，例如 main@icloud.com"
              value={mainMailbox}
              onChange={(event) => setMainMailbox(event.target.value)}
            />
            <datalist id="main-mailbox-options">
              {mainMailboxes.map((item) => (
                <option key={item.name} value={item.name} />
              ))}
            </datalist>
          </div>

          <textarea
            spellCheck={false}
            placeholder={"支持两种格式：\nname@icloud.com----http://example.com/show/name%40icloud.com\nname@icloud.com"}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />

          <div className="toolbar">
            <button
              type="button"
              onClick={submit}
              disabled={importing}
              className={importing ? "isBusy" : ""}
            >
              {importing ? "导入中" : "导入邮箱"}
            </button>
          </div>
        </div>
      </details>

      {configOpen ? (
        <div className="settingsBackdrop" role="presentation">
          <form className="modalCard settingsCard" onSubmit={submitConfig}>
            <div className="modalTitle">主邮箱收信源</div>
            <div className="sourceList">
              {mailSources.length ? (
                mailSources.map((source) => (
                  <div className="sourceItem" key={source.id || source.name}>
                    <button className="secondary" type="button" onClick={() => editSource(source)}>
                      {source.name || source.email}
                    </button>
                    <span className={`pill ${source.last_error ? "fail" : source.enabled === false ? "dim" : "ok"}`}>
                      {source.last_error ? "异常" : source.enabled === false ? "停用" : "启用"}
                    </span>
                    <button className="softDanger" type="button" onClick={() => deleteSource(source)}>
                      删除
                    </button>
                  </div>
                ))
              ) : (
                <div className="empty">暂无收信源</div>
              )}
            </div>

            <div className="settingsGrid sourceForm">
              <label>
                名称
                <input
                  placeholder="main@icloud.com"
                  value={draft.name || ""}
                  onChange={(event) => updateDraft({ name: event.target.value })}
                />
              </label>
              <label>
                主邮箱
                <input
                  placeholder="main@icloud.com"
                  value={draft.email || ""}
                  onChange={(event) => updateDraft({ email: event.target.value })}
                />
              </label>
              <label>
                IMAP 服务器
                <input
                  placeholder="imap.mail.me.com"
                  value={draft.imap_host || ""}
                  onChange={(event) => updateDraft({ imap_host: event.target.value })}
                />
              </label>
              <label>
                端口
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={draft.imap_port ?? 993}
                  onChange={(event) => updateDraft({ imap_port: Number(event.target.value) || 993 })}
                />
              </label>
              <label>
                用户名
                <input
                  placeholder="main@icloud.com"
                  value={draft.username || ""}
                  onChange={(event) => updateDraft({ username: event.target.value })}
                />
              </label>
              <label>
                密码 / 授权码
                <input
                  type="password"
                  placeholder={draft.has_password ? "留空则保留原密码" : "应用专用密码"}
                  value={draft.password || ""}
                  onChange={(event) => updateDraft({ password: event.target.value })}
                />
              </label>
              <label>
                邮箱目录
                <input
                  placeholder="INBOX"
                  value={draft.folder || "INBOX"}
                  onChange={(event) => updateDraft({ folder: event.target.value })}
                />
              </label>
              <label>
                最大邮件数
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={draft.max_results ?? 1000}
                  onChange={(event) => updateDraft({ max_results: Number(event.target.value) || 1000 })}
                />
              </label>
              <label className="checkLabel">
                <input
                  type="checkbox"
                  checked={draft.use_ssl !== false}
                  onChange={(event) => updateDraft({ use_ssl: event.target.checked })}
                />
                SSL
              </label>
              <label className="checkLabel">
                <input
                  type="checkbox"
                  checked={draft.enabled !== false}
                  onChange={(event) => updateDraft({ enabled: event.target.checked })}
                />
                启用
              </label>
            </div>

            <div className="toolbar loginActions">
              <button className="secondary" type="button" onClick={newSource}>
                新建
              </button>
              <button className="secondary" type="button" onClick={() => setConfigOpen(false)}>
                关闭
              </button>
              <button
                className={testingConfig ? "isBusy" : "secondary"}
                type="button"
                disabled={testingConfig || savingConfig}
                onClick={testConfig}
              >
                {testingConfig ? "测试中" : "测试"}
              </button>
              <button type="submit" disabled={savingConfig} className={savingConfig ? "isBusy" : ""}>
                {savingConfig ? "保存中" : "保存"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  )
}

function normalizedDraft(source: Partial<MailSource>): Partial<MailSource> {
  const email = String(source.email || source.name || source.username || "").trim()
  return {
    ...source,
    name: String(source.name || email).trim(),
    email,
    imap_host: String(source.imap_host || "imap.mail.me.com").trim(),
    imap_port: Number(source.imap_port || 993),
    username: String(source.username || email).trim(),
    password: String(source.password || ""),
    folder: String(source.folder || "INBOX").trim() || "INBOX",
    use_ssl: source.use_ssl !== false,
    enabled: source.enabled !== false,
    max_results: Number(source.max_results || 1000),
  }
}

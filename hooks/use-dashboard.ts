"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { api, ApiError, sessionStatus } from "@/lib/api"
import { messagesFromCache, normalizeDateOnly, normalizeMessage } from "@/lib/mail"
import type {
  Account,
  AccountFilter,
  MailCache,
  MailMessage,
  MailSource,
  MainMailboxOption,
  Scan,
  Stats,
  StateResponse,
} from "@/lib/types"

export interface ToastItem {
  id: number
  message: string
  type: "ok" | "error" | "warn" | "success"
}

export interface LogItem {
  id: number
  time: string
  message: string
}

export interface MailFilters {
  keyword: string
  code: string
  from: string
  to: string
}

interface ListPayload {
  accounts?: Account[]
  main_mailboxes?: MainMailboxOption[]
  stats?: Stats
  mail_sources?: MailSource[]
}

let toastSeq = 0
let logSeq = 0

export function useDashboard() {
  const [authenticated, setAuthenticated] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [connOk, setConnOk] = useState(true)

  const [accounts, setAccounts] = useState<Account[]>([])
  const [mainMailboxes, setMainMailboxes] = useState<MainMailboxOption[]>([])
  const [mailSources, setMailSources] = useState<MailSource[]>([])
  const [stats, setStats] = useState<Stats>({})
  const [scan, setScan] = useState<Scan>({ status: "idle" })

  const [selectedId, setSelectedId] = useState("")
  const [messages, setMessages] = useState<MailMessage[]>([])
  const [noHistory, setNoHistory] = useState(false)
  const [selectedMessageId, setSelectedMessageId] = useState("")
  const [accountError, setAccountError] = useState("")

  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)

  const [accountSearch, setAccountSearch] = useState("")
  const [accountFilter, setAccountFilter] = useState<AccountFilter>("all")
  const [mainMailboxFilter, setMainMailboxFilter] = useState("")
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([])
  const [mailFilters, setMailFilters] = useState<MailFilters>({
    keyword: "",
    code: "",
    from: "",
    to: "",
  })

  const [logs, setLogs] = useState<LogItem[]>([])
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const selectedIdRef = useRef(selectedId)
  const scanRef = useRef(scan)
  const authRef = useRef(authenticated)
  const accountLoadSeq = useRef(0)
  selectedIdRef.current = selectedId
  scanRef.current = scan
  authRef.current = authenticated

  const toast = useCallback((message: string, type: ToastItem["type"] = "ok") => {
    const id = ++toastSeq
    setToasts((prev) => [...prev, { id, message, type }].slice(-5))
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id))
    }, 3600)
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const addLog = useCallback((message: string) => {
    const id = ++logSeq
    setLogs((prev) => [
      { id, time: new Date().toLocaleTimeString(), message },
      ...prev,
    ].slice(0, 80))
  }, [])

  const clearLog = useCallback(() => setLogs([]), [])

  const currentAccount = useMemo(
    () => accounts.find((account) => account.id === selectedId) || null,
    [accounts, selectedId],
  )

  useEffect(() => {
    const liveIds = new Set(accounts.map((account) => account.id))
    setSelectedAccountIds((prev) => prev.filter((id) => liveIds.has(id)))
  }, [accounts])

  const filteredMessages = useMemo(() => {
    return messages.filter((message) => {
      const dm = normalizeMessage(message) || message
      const keyword = mailFilters.keyword.trim().toLowerCase()
      const code = mailFilters.code.trim()
      const from = mailFilters.from
      const to = mailFilters.to
      const haystack = [dm.subject, dm.from, dm.to, dm.body, dm.date]
        .map((value) => String(value || "").toLowerCase())
        .join("\n")
      if (keyword && !haystack.includes(keyword)) return false
      if (code && !String(dm.verification_code || "").includes(code)) return false
      const messageDate = normalizeDateOnly(String(dm.date || ""))
      if (from && messageDate && messageDate < from) return false
      if (to && messageDate && messageDate > to) return false
      if ((from || to) && !messageDate) return false
      return true
    })
  }, [messages, mailFilters])

  useEffect(() => {
    if (!filteredMessages.some((message) => message.id === selectedMessageId)) {
      setSelectedMessageId(filteredMessages[0]?.id || "")
    }
  }, [filteredMessages, selectedMessageId])

  const mailListEmptyText = useMemo(() => {
    if (accountError) return accountError
    if (messages.length && !filteredMessages.length) return "没有匹配筛选条件的邮件"
    return noHistory ? "无历史邮件" : "暂无缓存邮件"
  }, [accountError, messages.length, filteredMessages.length, noHistory])

  const applyListPayload = useCallback((payload: ListPayload) => {
    if (payload.accounts) setAccounts(payload.accounts)
    if (payload.main_mailboxes) setMainMailboxes(payload.main_mailboxes)
    if (payload.stats) setStats(payload.stats)
    if (payload.mail_sources) setMailSources(payload.mail_sources)
  }, [])

  const loadAccount = useCallback(
    async (id: string) => {
      const loadSeq = ++accountLoadSeq.current
      try {
        const data = await api<{ account: Account; cache: MailCache | null }>(
          `/api/account?id=${encodeURIComponent(id)}`,
        )
        if (loadSeq !== accountLoadSeq.current || selectedIdRef.current !== id) return
        if (data.account?.id !== id) return
        const cache = data.cache || null
        setMessages(messagesFromCache(cache))
        setNoHistory(Boolean(cache?.no_history || data.account?.no_history))
        setSelectedMessageId("")
        setAccountError(data.account?.last_error ? `错误：${data.account.last_error}` : "")
        setAccounts((prev) =>
          prev.map((account) => (account.id === id ? { ...account, ...data.account } : account)),
        )
      } catch (err) {
        if (loadSeq !== accountLoadSeq.current || selectedIdRef.current !== id) return
        if (err instanceof ApiError && err.message === "未登录") {
          setAuthenticated(false)
          return
        }
        addLog((err as Error).message)
      }
    },
    [addLog],
  )

  const loadState = useCallback(
    async (keepSelection = true, options: { reloadSelected?: boolean } = {}) => {
      const { reloadSelected = true } = options
      const data = await api<StateResponse>("/api/state")
      setAccounts(data.accounts || [])
      setMainMailboxes(data.main_mailboxes || [])
      setMailSources(data.mail_sources || [])
      setStats(data.stats || {})
      setScan(data.scan || { status: "idle" })
      setConnOk(true)

      let nextSelected = selectedIdRef.current
      const hasSelected = (data.accounts || []).some((account) => account.id === nextSelected)
      if (!keepSelection || !hasSelected) {
        nextSelected = data.accounts?.[0]?.id || ""
        setSelectedId(nextSelected)
      }
      if (nextSelected && reloadSelected) await loadAccount(nextSelected)
    },
    [loadAccount],
  )

  const selectAccount = useCallback(
    async (id: string) => {
      setSelectedId(id)
      setMessages([])
      setNoHistory(false)
      setSelectedMessageId("")
      setAccountError("")
      await loadAccount(id)
    },
    [loadAccount],
  )

  const checkSession = useCallback(async () => {
    try {
      const data = await sessionStatus()
      setAuthenticated(Boolean(data.authenticated))
      setAuthChecked(true)
      if (data.authenticated) await loadState(false)
    } catch {
      setConnOk(false)
      setAuthenticated(false)
      setAuthChecked(true)
    }
  }, [loadState])

  const login = useCallback(
    async (password: string) => {
      await api("/api/login", { method: "POST", body: { password } })
      setAuthenticated(true)
      addLog("登录成功")
      await loadState(false)
    },
    [addLog, loadState],
  )

  const logout = useCallback(async () => {
    await api("/api/logout", { method: "POST", body: {} }).catch(() => {})
    setAuthenticated(false)
    addLog("已退出登录")
  }, [addLog])

  const fetchSelected = useCallback(
    async (force = true) => {
      const account = accounts.find((item) => item.id === selectedIdRef.current)
      if (!account) return
      setBusy(true)
      try {
        const data = await api<{ cache: MailCache; account: Account }>("/api/fetch_mail", {
          method: "POST",
          body: { id: account.id, force },
        })
        const cache = data.cache || {}
        const msgs = messagesFromCache(cache)
        const nh = Boolean(cache.no_history || data.account?.no_history)
        setMessages(msgs)
        setNoHistory(nh)
        setSelectedMessageId("")
        setAccountError("")
        addLog(`${account.email} 刷新完成：${msgs.length} 封邮件`)
        toast("邮件已更新")
        setAccounts((prev) =>
          prev.map((item) =>
            item.id === account.id
              ? {
                  ...item,
                  ...(data.account || {}),
                  cached: true,
                  last_message_count: msgs.length,
                  no_history: nh,
                }
              : item,
          ),
        )
      } catch (err) {
        addLog(`${account.email} ${(err as Error).message}`)
        toast((err as Error).message, "error")
        await loadState(true, { reloadSelected: false }).catch(() => {})
      } finally {
        setBusy(false)
      }
    },
    [accounts, addLog, loadState, toast],
  )

  const importText = useCallback(
    async (text: string, mainMailbox = "") => {
      if (importing) return false
      setImporting(true)
      try {
        const data = await api<{
          stats: Record<string, number>
          accounts: Account[]
          scan: Scan
        }>("/api/import", {
          method: "POST",
          body: { text, main_mailbox: mainMailbox },
        })
        const s = data.stats || {}
        const skipped = (s.skipped_invalid || 0) + (s.skipped_non_icloud || 0)
        const scanTotal = data.scan?.total || 0
        addLog(
          `导入完成：新增 ${s.imported || 0}，更新 ${s.updated || 0}，重复 ${s.duplicates || 0}，跳过 ${skipped}`,
        )
        if (scanTotal) addLog(`已开始后台扫描历史邮件：${scanTotal} 个邮箱`)
        toast(scanTotal ? "导入完成，已开始扫描历史邮件" : "导入完成")
        setScan(data.scan || { status: "idle" })
        await loadState(true, { reloadSelected: false })
        return true
      } catch (err) {
        addLog(`导入失败：${(err as Error).message}`)
        toast((err as Error).message, "error")
        return false
      } finally {
        setImporting(false)
      }
    },
    [importing, addLog, loadState, toast],
  )

  const scanAllHistory = useCallback(async () => {
    const scannable = accounts.filter((account) => account.has_source)
    if (
      scannable.length > 50 &&
      !window.confirm(`将扫描全部 ${scannable.length} 个已配置收信源的邮箱，确认开始？`)
    ) {
      return
    }
    try {
      const data = await api<{ scan: Scan }>("/api/scan_start", {
        method: "POST",
        body: { scope: "all" },
      })
      setScan(data.scan || { status: "idle" })
      addLog(`已开始扫描历史邮件：${data.scan?.total || 0} 个邮箱`)
      toast("已开始扫描历史邮件")
    } catch (err) {
      toast((err as Error).message, "error")
    }
  }, [accounts, addLog, toast])

  const retryFailed = useCallback(async () => {
    try {
      const data = await api<{ ok: boolean; scan?: Scan; error?: string }>("/api/retry_failed", {
        method: "POST",
        body: {},
      })
      if (data.ok && data.scan) {
        setScan(data.scan)
        addLog(`开始重试失败账号：${data.scan?.total || 0} 个`)
        toast("已开始重试失败账号")
      } else {
        toast(data.error || "没有需要重试的账号", "warn")
      }
    } catch (err) {
      toast((err as Error).message, "error")
    }
  }, [addLog, toast])

  const cancelScan = useCallback(async () => {
    if (!window.confirm("确认取消当前扫描？已成功的结果会保留。")) return
    try {
      const data = await api<{ ok: boolean }>("/api/scan_cancel", { method: "POST", body: {} })
      if (data.ok) {
        addLog("扫描已取消")
        toast("扫描已取消", "warn")
      }
    } catch (err) {
      toast((err as Error).message, "error")
    }
  }, [addLog, toast])

  const clearSelectedCache = useCallback(async () => {
    const account = accounts.find((item) => item.id === selectedIdRef.current)
    if (!account) return
    if (!window.confirm(`确认清除 ${account.email} 的本地缓存？不会删除源站数据。`)) return
    try {
      await api("/api/clear_cache", { method: "POST", body: { id: account.id } })
      setMessages([])
      setNoHistory(false)
      setSelectedMessageId("")
      setAccountError("")
      addLog(`${account.email} 缓存已清理`)
      toast("缓存已清理", "warn")
      await loadState(true)
    } catch (err) {
      toast((err as Error).message, "error")
    }
  }, [accounts, addLog, loadState, toast])

  const applyAccountsAfterDelete = useCallback(
    async (
      nextAccounts: Account[],
      options: { clearMainMailbox?: boolean; clearSelection?: boolean } = {},
    ) => {
      const liveIds = new Set(nextAccounts.map((account) => account.id))
      const nextSelected = liveIds.has(selectedIdRef.current)
        ? selectedIdRef.current
        : nextAccounts[0]?.id || ""

      setAccounts(nextAccounts)
      setSelectedAccountIds((prev) =>
        options.clearSelection ? [] : prev.filter((id) => liveIds.has(id)),
      )
      setSelectedId(nextSelected)
      setMessages([])
      setNoHistory(false)
      setSelectedMessageId("")
      setAccountError("")
      if (options.clearMainMailbox) setMainMailboxFilter("")
      if (nextSelected) await loadAccount(nextSelected)
    },
    [loadAccount],
  )

  const saveMailSource = useCallback(
    async (source: Partial<MailSource>) => {
      const data = await api<ListPayload & { mail_source?: MailSource }>("/api/mail_sources", {
        method: "POST",
        body: source,
      })
      applyListPayload(data)
      addLog(`收信源已保存：${data.mail_source?.name || source.name || source.email || source.username}`)
      toast("收信源已保存", "success")
      return data.mail_source
    },
    [addLog, applyListPayload, toast],
  )

  const testMailSource = useCallback(
    async (source: Partial<MailSource>) => {
      const data = await api<ListPayload & { mail_source?: MailSource }>("/api/test_mail_source", {
        method: "POST",
        body: source,
      })
      applyListPayload(data)
      addLog(`收信源测试通过：${data.mail_source?.name || source.name || source.email || source.username}`)
      toast("IMAP 连接测试通过", "success")
      return data.mail_source
    },
    [addLog, applyListPayload, toast],
  )

  const deleteMailSource = useCallback(
    async (id: string) => {
      const data = await api<ListPayload>("/api/delete_mail_source", {
        method: "POST",
        body: { id },
      })
      applyListPayload(data)
      addLog("收信源已删除")
      toast("收信源已删除", "warn")
      await loadState(true, { reloadSelected: false })
      return true
    },
    [addLog, applyListPayload, loadState, toast],
  )

  const deleteSelected = useCallback(async () => {
    const account = accounts.find((item) => item.id === selectedIdRef.current)
    if (!account) return
    if (!window.confirm(`确认删除 ${account.email}？本地缓存也会一起删除。`)) return
    try {
      const data = await api<ListPayload>("/api/delete_account", {
        method: "POST",
        body: { id: account.id },
      })
      addLog(`${account.email} 已删除`)
      applyListPayload(data)
      await applyAccountsAfterDelete(data.accounts || [], { clearSelection: true })
      toast("邮箱已删除", "warn")
    } catch (err) {
      toast((err as Error).message, "error")
    }
  }, [accounts, addLog, applyAccountsAfterDelete, applyListPayload, toast])

  const toggleAccountSelection = useCallback((id: string, checked?: boolean) => {
    setSelectedAccountIds((prev) => {
      const exists = prev.includes(id)
      const shouldSelect = typeof checked === "boolean" ? checked : !exists
      if (shouldSelect && !exists) return [...prev, id]
      if (!shouldSelect && exists) return prev.filter((item) => item !== id)
      return prev
    })
  }, [])

  const selectVisibleAccounts = useCallback((ids: string[]) => {
    setSelectedAccountIds(Array.from(new Set(ids.filter(Boolean))))
  }, [])

  const clearAccountSelection = useCallback(() => setSelectedAccountIds([]), [])

  const deleteSelectedAccounts = useCallback(async () => {
    const ids = selectedAccountIds
    if (!ids.length) {
      toast("请先勾选要删除的邮箱", "warn")
      return
    }
    if (!window.confirm(`确认删除选中的 ${ids.length} 个子邮箱？本地缓存也会一起删除。`)) return
    try {
      const data = await api<ListPayload & { deleted?: number }>("/api/delete_accounts", {
        method: "POST",
        body: { ids },
      })
      addLog(`批量删除完成：${data.deleted || ids.length} 个子邮箱`)
      toast("选中邮箱已删除", "warn")
      applyListPayload(data)
      await applyAccountsAfterDelete(data.accounts || [], { clearSelection: true })
    } catch (err) {
      toast((err as Error).message, "error")
    }
  }, [selectedAccountIds, addLog, applyAccountsAfterDelete, applyListPayload, toast])

  const deleteMainMailboxAccounts = useCallback(async () => {
    const name = mainMailboxFilter.trim()
    if (!name) {
      toast("请先选择一个主邮箱", "warn")
      return
    }
    const count = accounts.filter((account) => (account.main_mailbox || "") === name).length
    if (!count) {
      toast("这个主邮箱下没有子邮箱", "warn")
      return
    }
    if (!window.confirm(`确认删除主邮箱「${name}」关联的 ${count} 个子邮箱？本地缓存也会一起删除。`)) return
    try {
      const data = await api<ListPayload & { deleted?: number }>("/api/delete_by_main_mailbox", {
        method: "POST",
        body: { main_mailbox: name },
      })
      addLog(`已删除主邮箱 ${name} 关联的 ${data.deleted || count} 个子邮箱`)
      toast("主邮箱关联子邮箱已删除", "warn")
      applyListPayload(data)
      await applyAccountsAfterDelete(data.accounts || [], {
        clearMainMailbox: true,
        clearSelection: true,
      })
    } catch (err) {
      toast((err as Error).message, "error")
    }
  }, [mainMailboxFilter, accounts, addLog, applyAccountsAfterDelete, applyListPayload, toast])

  const exportSelectedAccounts = useCallback(async () => {
    const ids = selectedAccountIds
    if (!ids.length) {
      toast("请先勾选要导出的邮箱", "warn")
      return
    }
    try {
      const data = await api<{ text: string; filename?: string }>("/api/export_accounts", {
        method: "POST",
        body: { ids },
      })
      const blob = new Blob([data.text || ""], { type: "text/plain;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = data.filename || "icloud-mail-links.txt"
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      addLog(`已导出 ${ids.length} 个邮箱查看链接`)
      toast("导出文件已生成", "success")
    } catch (err) {
      toast((err as Error).message, "error")
    }
  }, [selectedAccountIds, addLog, toast])

  const reload = useCallback(() => {
    loadState(true).catch((err) => toast((err as Error).message, "error"))
  }, [loadState, toast])

  useEffect(() => {
    checkSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const timer = window.setInterval(async () => {
      if (!authRef.current) return
      try {
        const prevStatus = scanRef.current?.status
        const data = await api<{ scan: Scan }>("/api/scan_status")
        const nextScan = data.scan || { status: "idle" }
        setScan(nextScan)
        const refreshList =
          prevStatus === "running" &&
          (nextScan.status === "done" || nextScan.status === "retry_waiting")
        if (
          nextScan.status === "running" ||
          nextScan.status === "retry_waiting" ||
          refreshList
        ) {
          await loadState(true, { reloadSelected: false })
        }
      } catch (err) {
        if (err instanceof ApiError && err.message === "未登录") {
          setAuthenticated(false)
          return
        }
        setConnOk(false)
      }
    }, 3000)
    return () => window.clearInterval(timer)
  }, [loadState])

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!authRef.current) return
      const status = scanRef.current?.status
      if (status === "running" || status === "retry_waiting" || status === "cancelling") return
      loadState(true, { reloadSelected: false }).catch((err) => {
        if (err instanceof ApiError && err.message === "未登录") setAuthenticated(false)
        else setConnOk(false)
      })
    }, 20000)
    return () => window.clearInterval(timer)
  }, [loadState])

  return {
    authenticated,
    authChecked,
    connOk,
    accounts,
    mainMailboxes,
    mailSources,
    stats,
    scan,
    selectedId,
    currentAccount,
    messages,
    filteredMessages,
    selectedMessageId,
    setSelectedMessageId,
    noHistory,
    mailListEmptyText,
    busy,
    importing,
    accountSearch,
    setAccountSearch,
    accountFilter,
    setAccountFilter,
    mainMailboxFilter,
    setMainMailboxFilter,
    selectedAccountIds,
    toggleAccountSelection,
    selectVisibleAccounts,
    clearAccountSelection,
    mailFilters,
    setMailFilters,
    logs,
    toasts,
    dismissToast,
    clearLog,
    addLog,
    toast,
    login,
    logout,
    reload,
    selectAccount,
    fetchSelected,
    importText,
    saveMailSource,
    testMailSource,
    deleteMailSource,
    scanAllHistory,
    retryFailed,
    cancelScan,
    clearSelectedCache,
    deleteSelected,
    deleteSelectedAccounts,
    deleteMainMailboxAccounts,
    exportSelectedAccounts,
  }
}

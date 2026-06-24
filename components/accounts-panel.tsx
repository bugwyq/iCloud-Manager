"use client"

import { useEffect, useMemo, useState } from "react"
import type { Account, AccountFilter, MainMailboxOption } from "@/lib/types"

const CHIP_DEFS: { key: AccountFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "error", label: "异常" },
  { key: "no_history", label: "无历史" },
  { key: "cached", label: "已缓存" },
  { key: "has_mail", label: "有邮件" },
]

function mailboxName(account: Account): string {
  return (account.main_mailbox || "").trim()
}

function matchesFilter(account: Account, filter: AccountFilter): boolean {
  switch (filter) {
    case "error":
      return !!account.last_error
    case "no_history":
      return Boolean(account.no_history) && !account.last_error
    case "cached":
      return Boolean(account.cached) && !account.no_history
    case "has_mail":
      return (account.last_message_count || 0) > 0
    default:
      return true
  }
}

function matchesKeyword(account: Account, keyword: string): boolean {
  if (!keyword) return true
  const localName = account.email.split("@")[0] || ""
  const haystack = [
    account.email,
    localName,
    mailboxName(account),
    account.source_host,
    account.source_url,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join("\n")
  return haystack.includes(keyword)
}

function AccountRow({
  account,
  active,
  checked,
  onSelect,
  onToggleSelection,
}: {
  account: Account
  active: boolean
  checked: boolean
  onSelect: (id: string) => void
  onToggleSelection: (id: string, checked?: boolean) => void
}) {
  const pills: React.ReactNode[] = []
  if (account.last_error) {
    pills.push(
      <span key="err" className="pill fail" title={account.last_error}>
        异常
      </span>,
    )
  }
  if (account.no_history) {
    pills.push(
      <span key="nh" className="pill dim">
        无历史
      </span>,
    )
  } else if (account.cached) {
    pills.push(
      <span key="ok" className="pill ok">
        {account.last_message_count || 0} 封
      </span>,
    )
  } else if (!account.last_error) {
    pills.push(
      <span key="todo" className="pill">
        待扫描
      </span>,
    )
  }
  if (!account.has_source) {
    pills.push(
      <span key="src" className="pill fail">
        缺链接
      </span>,
    )
  }

  const mainMailbox = mailboxName(account)

  return (
    <div className={`account-item ${active ? "active" : ""} ${checked ? "checked" : ""}`}>
      <label className="account-check" title="选择这个邮箱">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onToggleSelection(account.id, event.target.checked)}
        />
      </label>
      <button type="button" className="account-open" onClick={() => onSelect(account.id)}>
        <div className="account-main">
          <div className="account-email" title={account.email}>
            {account.email}
          </div>
          <div className="account-owner" title={mainMailbox || account.source_host || ""}>
            {mainMailbox || account.source_host || "未分组"}
          </div>
        </div>
        <div className="account-meta">{pills}</div>
      </button>
    </div>
  )
}

export function AccountsPanel({
  accounts,
  mainMailboxes,
  selectedId,
  selectedIds,
  search,
  setSearch,
  filter,
  setFilter,
  mainMailboxFilter,
  setMainMailboxFilter,
  onSelect,
  onToggleSelection,
  onSelectVisible,
  onClearSelection,
  onDeleteSelected,
  onDeleteMainMailbox,
  onExportSelected,
  onReload,
  onLogout,
}: {
  accounts: Account[]
  mainMailboxes: MainMailboxOption[]
  selectedId: string
  selectedIds: string[]
  search: string
  setSearch: (v: string) => void
  filter: AccountFilter
  setFilter: (f: AccountFilter) => void
  mainMailboxFilter: string
  setMainMailboxFilter: (v: string) => void
  onSelect: (id: string) => void
  onToggleSelection: (id: string, checked?: boolean) => void
  onSelectVisible: (ids: string[]) => void
  onClearSelection: () => void
  onDeleteSelected: () => void
  onDeleteMainMailbox: () => void
  onExportSelected: () => void
  onReload: () => void
  onLogout: () => void
}) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const keyword = search.trim().toLowerCase()
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const scoped = useMemo(
    () =>
      accounts.filter((account) => {
        if (mainMailboxFilter && mailboxName(account) !== mainMailboxFilter) return false
        return matchesKeyword(account, keyword)
      }),
    [accounts, keyword, mainMailboxFilter],
  )

  const counts = useMemo(() => {
    const c: Record<AccountFilter, number> = {
      all: 0,
      error: 0,
      no_history: 0,
      cached: 0,
      has_mail: 0,
    }
    for (const a of scoped) {
      c.all++
      if (a.last_error) c.error++
      if (a.no_history && !a.last_error) c.no_history++
      if (a.cached && !a.no_history) c.cached++
      if ((a.last_message_count || 0) > 0) c.has_mail++
    }
    return c
  }, [scoped])

  const visible = useMemo(() => scoped.filter((a) => matchesFilter(a, filter)), [scoped, filter])
  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageStart = (safePage - 1) * pageSize
  const pageAccounts = visible.slice(pageStart, pageStart + pageSize)
  const pageIds = pageAccounts.map((account) => account.id)
  const visibleIds = visible.map((account) => account.id)
  const pageSelected = pageIds.filter((id) => selectedSet.has(id)).length
  const visibleSelected = visibleIds.filter((id) => selectedSet.has(id)).length

  useEffect(() => {
    setPage(1)
  }, [keyword, filter, mainMailboxFilter, pageSize])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const subText =
    keyword || filter !== "all" || mainMailboxFilter
      ? `${visible.length} / ${accounts.length} 个子邮箱`
      : `${accounts.length} 个子邮箱`

  return (
    <>
      <div className="box accountsCard">
        <div className="sectionTitle">邮箱列表</div>
        <div className="row accountSearchRow">
          <label>
            主邮箱
            <select value={mainMailboxFilter} onChange={(e) => setMainMailboxFilter(e.target.value)}>
              <option value="">全部主邮箱</option>
              {mainMailboxes.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name} ({item.count})
                </option>
              ))}
            </select>
          </label>
          <label>
            模糊查询
            <input
              type="search"
              placeholder="邮箱 / 名称 / 主邮箱"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <button className="secondary" type="button" onClick={() => setSearch("")}>
            清空
          </button>
        </div>

        <div className="filterChips">
          {CHIP_DEFS.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className={`chip ${filter === chip.key ? "active" : ""}`}
              onClick={() => setFilter(chip.key)}
            >
              {chip.label} {counts[chip.key]}
            </button>
          ))}
        </div>

        <div className="bulkBar">
          <span className="pill">
            已选 {selectedIds.length}
            {visible.length ? ` · 本页 ${pageSelected}/${pageAccounts.length} · 筛选 ${visibleSelected}/${visible.length}` : ""}
          </span>
          <button className="secondary" type="button" onClick={() => onSelectVisible(pageIds)} disabled={!pageAccounts.length}>
            全选本页
          </button>
          <button className="secondary" type="button" onClick={() => onSelectVisible(visibleIds)} disabled={!visible.length}>
            全选筛选
          </button>
          <button className="secondary" type="button" onClick={onClearSelection} disabled={!selectedIds.length}>
            取消选择
          </button>
          <button className="exportPrimary" type="button" onClick={onExportSelected} disabled={!selectedIds.length}>
            批量导出选中{selectedIds.length ? ` ${selectedIds.length}` : ""}
          </button>
          <button className="softDanger" type="button" onClick={onDeleteSelected} disabled={!selectedIds.length}>
            删除选中
          </button>
          <button className="softDanger" type="button" onClick={onDeleteMainMailbox} disabled={!mainMailboxFilter}>
            删除主邮箱下全部
          </button>
        </div>

        <div className="pager">
          <button className="secondary" type="button" onClick={onReload}>
            刷新
          </button>
          <div className="muted">{subText}</div>
          <button className="secondary" type="button" onClick={onLogout}>
            退出
          </button>
        </div>
        <div className="pager accountPager">
          <button className="secondary" type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={safePage <= 1}>
            上一页
          </button>
          <div className="muted">
            第 {safePage} / {totalPages} 页 · {visible.length ? `${pageStart + 1}-${Math.min(pageStart + pageSize, visible.length)}` : "0"} / {visible.length}
          </div>
          <button className="secondary" type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={safePage >= totalPages}>
            下一页
          </button>
          <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value) || 50)} aria-label="每页数量">
            <option value={25}>25 / 页</option>
            <option value={50}>50 / 页</option>
            <option value={100}>100 / 页</option>
            <option value={200}>200 / 页</option>
          </select>
        </div>
      </div>

      <div className="aliases">
        {pageAccounts.length ? (
          pageAccounts.map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              active={account.id === selectedId}
              checked={selectedSet.has(account.id)}
              onSelect={onSelect}
              onToggleSelection={onToggleSelection}
            />
          ))
        ) : (
          <div className="empty">没有匹配的邮箱</div>
        )}
      </div>
    </>
  )
}

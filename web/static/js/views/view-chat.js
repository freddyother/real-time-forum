// web/static/js/views/view-chat.js
// Chat view + right sidebar (users list)

import { apiGetUsers, apiGetMessages } from '../api.js'
import { connectWS, sendWS, onWSMessage } from '../ws-chat.js'
import { getState, setStateKey } from '../state.js'
import { navigateTo } from '../router.js'

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function escapeHtml(str) {
  return String(str).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')
}

function formatHHMM(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function isNearBottom(el, threshold = 30) {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold
}

function scrollToBottom(el) {
  el.scrollTop = el.scrollHeight
}

function toMs(iso) {
  const d = new Date(iso)
  const t = d.getTime()
  return Number.isNaN(t) ? 0 : t
}

function startOfDayMs(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 0
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function dateLabelFromIso(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const day = new Date(d)
  day.setHours(0, 0, 0, 0)

  const diffDays = Math.round((today.getTime() - day.getTime()) / (24 * 60 * 60 * 1000))
  if (diffDays === 0) return 'Hoy'
  if (diffDays === 1) return 'Ayer'

  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function makeTempID() {
  return `tmp_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

// ------------------------------------------------------------
// Sidebar (RIGHT) : users list
// ------------------------------------------------------------
export async function renderChatSidebar(root) {
  const state = getState()

  if (!state.currentUser) {
    root.innerHTML = ''
    return
  }

  root.innerHTML = `
    <div class="chat-side-header">
      <div class="chat-side-title">Chat</div>
      <div class="chat-side-subtitle">Select a user</div>
    </div>
    <div class="chat-side-list" id="chatUserList">
      <div class="chat-side-loading">Loading users…</div>
    </div>
  `

  const list = root.querySelector('#chatUserList')

  let users = []
  try {
    users = await apiGetUsers(100)
  } catch (err) {
    console.error('Failed to load users:', err)
    list.innerHTML = `<div class="chat-side-empty">Could not load users.</div>`
    return
  }

  const meId = Number(state.currentUser?.id)
  users = users.filter((u) => Number(u.id) !== meId)

  if (!users.length) {
    list.innerHTML = `<div class="chat-side-empty">No other users yet.</div>`
    return
  }

  const selectedId = Number(getState().chatWithUserId) || null

  list.innerHTML = ''
  users.forEach((u) => {
    const uid = Number(u.id)
    const isActive = selectedId === uid

    const item = document.createElement('button')
    item.type = 'button'
    item.className = 'chat-user-row' + (isActive ? ' is-active' : '')

    item.innerHTML = `
      <div class="chat-user-avatar">${u.nickname ? u.nickname[0].toUpperCase() : '?'}</div>
      <div class="chat-user-info">
        <div class="chat-user-name">${escapeHtml(u.nickname || 'Unknown')}</div>
        <div class="chat-user-hint">Click to open</div>
      </div>
    `

    item.addEventListener('click', () => {
      setStateKey('chatWithUserId', uid)
      setStateKey('chatWithUserName', u.nickname || 'Unknown')
      navigateTo(`chat/${uid}`)
    })

    list.appendChild(item)
  })
}

// ------------------------------------------------------------
// Main chat page (CENTER) : conversation + compose
// ------------------------------------------------------------
export async function renderChatView(root, param) {
  // Connect WS once (module handles reconnect).
  connectWS()

  root.innerHTML = `
    <div class="chat-page">
      <div class="chat-card">
        <div class="chat-header">
          <h2 class="chat-title" id="chatTitle">Chat</h2>
          <p class="chat-subtitle" id="chatSubtitle">Select a user to start chatting</p>
        </div>

        <div class="chat-messages" id="chatMessages">
          <div class="chat-empty">No conversation selected.</div>
        </div>

        <form class="chat-compose" id="chatForm">
          <input id="chatInput" type="text" placeholder="Write a message..." disabled />
          <button class="nav-btn" type="submit" disabled>Send</button>
        </form>
      </div>
    </div>
  `

  const msgsEl = root.querySelector('#chatMessages')
  const subtitleEl = root.querySelector('#chatSubtitle')
  const titleEl = root.querySelector('#chatTitle')
  const form = root.querySelector('#chatForm')
  const input = root.querySelector('#chatInput')
  const sendBtn = form.querySelector('button')

  // param -> selected user
  const paramId = param ? Number(param) : null
  if (paramId) setStateKey('chatWithUserId', paramId)

  let selectedUserId = Number(getState().chatWithUserId) || null

  // pagination
  const PAGE_SIZE = 30
  let offset = 0
  let hasMore = true
  let loadingMore = false

  // local cache for current chat
  let allMessages = []
  let lastSendNonce = 0

  // Normalize message object (API vs WS)
  function normalizeMessage(m) {
    return {
      id: m.id ?? null,
      temp_id: m.temp_id ?? null,
      from_user_id: Number(m.from_user_id),
      to_user_id: Number(m.to_user_id),
      content: m.content ?? m.text ?? '',
      sent_at: m.sent_at || '', // should be ISO
      seen: Boolean(m.seen),
      seen_at: m.seen_at ?? null,
    }
  }

  async function fetchPage(otherId, pageOffset) {
    const data = await apiGetMessages(otherId, pageOffset, PAGE_SIZE)
    const messages = Array.isArray(data.messages) ? data.messages : []
    return messages.map(normalizeMessage)
  }

  async function loadInitial(otherId) {
    offset = 0
    hasMore = true
    allMessages = []
    msgsEl.innerHTML = `<div class="chat-empty">Loading…</div>`

    const page = await fetchPage(otherId, offset)

    allMessages = page
    hasMore = page.length === PAGE_SIZE
    renderMessages(allMessages, { preserveScroll: false })
    scrollToBottom(msgsEl)
  }

  async function loadMoreTop(otherId) {
    if (!hasMore || loadingMore) return
    loadingMore = true

    const prevScrollHeight = msgsEl.scrollHeight
    const prevScrollTop = msgsEl.scrollTop

    offset += PAGE_SIZE
    let page = []
    try {
      page = await fetchPage(otherId, offset)
    } catch (err) {
      console.error('loadMoreTop failed:', err)
      loadingMore = false
      return
    }

    if (!page.length) {
      hasMore = false
      loadingMore = false
      return
    }

    allMessages = [...page, ...allMessages]
    hasMore = page.length === PAGE_SIZE

    renderMessages(allMessages, { preserveScroll: true })

    const newScrollHeight = msgsEl.scrollHeight
    msgsEl.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight)

    loadingMore = false
  }

  msgsEl.addEventListener('scroll', () => {
    const currentId = Number(getState().chatWithUserId) || null
    if (!currentId) return
    if (msgsEl.scrollTop < 40) loadMoreTop(currentId)
  })

  function renderMessages(messages, { preserveScroll }) {
    const state = getState()
    const me = Number(state.currentUser?.id)
    const nearBottom = preserveScroll ? false : isNearBottom(msgsEl, 30)

    msgsEl.innerHTML = ''
    if (!messages.length) {
      msgsEl.innerHTML = `<div class="chat-empty">No messages yet.</div>`
      return
    }

    const TWO_MIN = 2 * 60 * 1000

    // 0) tokens with date separators
    const tokens = []
    let lastDay = null
    for (const raw of messages) {
      const m = normalizeMessage(raw)
      const dayMs = startOfDayMs(m.sent_at)
      if (lastDay === null || dayMs !== lastDay) {
        tokens.push({ type: 'sep', label: dateLabelFromIso(m.sent_at) })
        lastDay = dayMs
      }
      tokens.push({ type: 'msg', m })
    }

    // 1) group by side + (<=2min), separator always cuts groups
    const groups = []
    for (const t of tokens) {
      if (t.type === 'sep') {
        groups.push({ kind: 'sep', label: t.label })
        continue
      }

      const m = t.m
      const side = m.from_user_id === me ? 'mine' : 'theirs'
      const ts = toMs(m.sent_at)

      const prev = groups[groups.length - 1]
      if (!prev || prev.kind !== 'group') {
        groups.push({ kind: 'group', side, items: [{ m, ts }] })
        continue
      }

      if (prev.side !== side) {
        groups.push({ kind: 'group', side, items: [{ m, ts }] })
        continue
      }

      const prevItem = prev.items[prev.items.length - 1]
      if (ts - prevItem.ts > TWO_MIN) {
        groups.push({ kind: 'group', side, items: [{ m, ts }] })
      } else {
        prev.items.push({ m, ts })
      }
    }

    // 2) render
    for (const g of groups) {
      if (g.kind === 'sep') {
        const sep = document.createElement('div')
        sep.className = 'chat-date-sep'
        sep.innerHTML = `<span>${escapeHtml(g.label)}</span>`
        msgsEl.appendChild(sep)
        continue
      }

      const groupEl = document.createElement('div')
      groupEl.className = `chat-group ${g.side}`

      g.items.forEach((it, idx) => {
        const m = it.m
        const isLastInGroup = idx === g.items.length - 1

        const bubble = document.createElement('div')
        bubble.className = `chat-bubble ${g.side}`
        if (idx === 0) bubble.classList.add('is-first')
        if (isLastInGroup) bubble.classList.add('is-last')

        const isMine = g.side === 'mine'
        const seen = Boolean(m.seen || m.seen_at)

        const statusHtml = isMine && isLastInGroup ? `<div class="chat-status ${seen ? 'is-seen' : ''}">✓✓</div>` : ''

        bubble.innerHTML = `
          <div class="chat-text">${escapeHtml(m.content)}</div>
          ${isLastInGroup ? `<div class="chat-time">${formatHHMM(m.sent_at)}</div>` : ``}
          ${statusHtml}
        `

        groupEl.appendChild(bubble)
      })

      msgsEl.appendChild(groupEl)
    }

    if (nearBottom) scrollToBottom(msgsEl)

    if (lastSendNonce > 0) {
      const mineLast = msgsEl.querySelectorAll('.chat-bubble.mine.is-last')
      const target = mineLast.length ? mineLast[mineLast.length - 1] : null
      if (target) {
        target.classList.add('is-new')
        setTimeout(() => target.classList.remove('is-new'), 200)
      }
      lastSendNonce = 0
    }
  }

  async function resolveSelectedUserNickname(userId) {
    const sidebar = document.getElementById('sidebar-chat')
    if (!sidebar) return null
    const btn = sidebar.querySelector(`.chat-user-row.is-active`)
    if (btn) {
      const nameEl = btn.querySelector('.chat-user-name')
      if (nameEl) return nameEl.textContent
    }
    return null
  }

  // ---- WS listener: update UI without refetch ----
  const unsubscribe = onWSMessage((ev) => {
    if (!ev || ev.type !== 'message') return

    const me = Number(getState().currentUser?.id)
    const otherId = Number(getState().chatWithUserId) || null
    if (!me || !otherId) return

    // Only process events belonging to current open chat.
    const belongs =
      (Number(ev.from_user_id) === otherId && Number(ev.to_user_id) === me) || (Number(ev.from_user_id) === me && Number(ev.to_user_id) === otherId)

    if (!belongs) return

    const normalized = normalizeMessage(ev)

    // Reconcile optimistic message by temp_id (sender side).
    if (normalized.temp_id) {
      const idx = allMessages.findIndex((m) => m.temp_id && m.temp_id === normalized.temp_id)
      if (idx !== -1) {
        allMessages[idx] = { ...allMessages[idx], ...normalized }
      } else {
        allMessages.push(normalized)
      }
    } else {
      // Avoid duplicates by id.
      if (normalized.id && allMessages.some((m) => m.id === normalized.id)) return
      allMessages.push(normalized)
    }

    renderMessages(allMessages, { preserveScroll: false })
  })

  // initial open
  if (selectedUserId) {
    const s = getState()
    const fallbackName = s.chatWithUserName || null
    const nickname = (await resolveSelectedUserNickname(selectedUserId)) || fallbackName

    titleEl.textContent = nickname || 'Chat'
    subtitleEl.textContent = `Chatting…`
    input.disabled = false
    sendBtn.disabled = false
    input.focus()

    await loadInitial(selectedUserId)
  }

  // send message (WS)
  form.addEventListener('submit', (e) => {
    e.preventDefault()

    selectedUserId = Number(getState().chatWithUserId) || null
    if (!selectedUserId) return

    const content = input.value.trim()
    if (!content) return
    input.value = ''

    const me = Number(getState().currentUser?.id)
    const nowIso = new Date().toISOString()
    const tempID = makeTempID()

    // Optimistic insert
    allMessages.push(
      normalizeMessage({
        temp_id: tempID,
        from_user_id: me,
        to_user_id: selectedUserId,
        content,
        sent_at: nowIso,
        seen: false,
      })
    )
    lastSendNonce++
    renderMessages(allMessages, { preserveScroll: false })

    // IMPORTANT: include type:"message" so backend accepts it
    sendWS({
      type: 'message',
      to_user_id: Number(selectedUserId),
      text: content,
      temp_id: tempID,
    })
  })

  // Optional: when navigating away, stop listening (prevents duplicate handlers).
  // If your app has an unmount lifecycle, call this there.
  window.addEventListener(
    'hashchange',
    () => {
      unsubscribe()
    },
    { once: true }
  )
}

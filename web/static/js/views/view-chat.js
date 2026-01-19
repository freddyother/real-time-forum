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

  // ---------------------------
  // Message normalization + status
  // ---------------------------
  function normalizeMessage(m) {
    return {
      id: m.id ?? null,
      temp_id: m.temp_id ?? null,
      from_user_id: Number(m.from_user_id),
      to_user_id: Number(m.to_user_id),
      content: m.content ?? m.text ?? '',
      sent_at: m.sent_at || '',

      // delivery/read state
      delivered: Boolean(m.delivered), // backend should send this in API/WS
      delivered_at: m.delivered_at ?? null,
      seen: Boolean(m.seen),
      seen_at: m.seen_at ?? null,
    }
  }

  function ensureMessageShape(arr) {
    return arr.map(normalizeMessage)
  }

  function upsertMessageByIdOrTemp(msg) {
    const m = normalizeMessage(msg)

    // Reconcile optimistic by temp_id first.
    if (m.temp_id) {
      const idx = allMessages.findIndex((x) => x.temp_id && x.temp_id === m.temp_id)
      if (idx !== -1) {
        allMessages[idx] = { ...allMessages[idx], ...m }
        return
      }
    }

    // Then by id.
    if (m.id != null) {
      const idx = allMessages.findIndex((x) => x.id != null && x.id === m.id)
      if (idx !== -1) {
        allMessages[idx] = { ...allMessages[idx], ...m }
        return
      }
    }

    allMessages.push(m)
  }

  function markDeliveredLocally(messageID) {
    const idx = allMessages.findIndex((m) => m.id === messageID)
    if (idx !== -1) {
      allMessages[idx] = { ...allMessages[idx], delivered: true }
    }
  }

  function markSeenUpToLocally(seenUpToID) {
    if (!seenUpToID) return
    for (let i = 0; i < allMessages.length; i++) {
      const m = allMessages[i]
      if (m.id != null && m.id <= seenUpToID) {
        // only meaningful for messages I sent (mine) but harmless to set anyway
        allMessages[i] = { ...m, seen: true }
      }
    }
  }

  // ---------------------------
  // WS acks helpers
  // ---------------------------
  function ackDeliveredIfNeeded(evMsg) {
    const me = Number(getState().currentUser?.id)
    if (!me) return

    // If I am the recipient of this message, confirm delivered.
    if (Number(evMsg.to_user_id) !== me) return
    if (!evMsg.id) return

    sendWS({
      type: 'delivered',
      message_id: Number(evMsg.id),
    })
  }

  function sendSeenNow(otherId) {
    if (!otherId) return
    // Mark messages from otherId -> me as seen on backend.
    sendWS({
      type: 'seen',
      other_user_id: Number(otherId),
    })
  }

  // ---------------------------
  // Pagination / infinite scroll up
  // ---------------------------
  async function fetchPage(otherId, pageOffset) {
    const data = await apiGetMessages(otherId, pageOffset, PAGE_SIZE)
    const messages = Array.isArray(data.messages) ? data.messages : []
    return ensureMessageShape(messages)
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

    // When opening the chat, send "seen".
    sendSeenNow(otherId)
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

  // ---------------------------
  // Rendering (grouping + date separators + status)
  // ---------------------------
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

        // Status logic:
        // - optimistic message (no id yet) => 1 check
        // - delivered => 2 grey checks
        // - seen => 2 blue checks
        let statusText = ''
        let statusClass = ''
        if (isMine && isLastInGroup) {
          if (!m.id) {
            statusText = '✓'
            statusClass = 'is-sent'
          } else if (m.seen || m.seen_at) {
            statusText = '✓✓'
            statusClass = 'is-seen'
          } else if (m.delivered || m.delivered_at) {
            statusText = '✓✓'
            statusClass = 'is-delivered'
          } else {
            // if backend doesn't send delivered yet, still show ✓✓ as "server ack"
            statusText = '✓✓'
            statusClass = 'is-sent'
          }
        }

        const statusHtml = statusText ? `<div class="chat-status ${statusClass}">${statusText}</div>` : ''

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

  // ---------------------------
  // WS listener: update UI without refetch
  // ---------------------------
  const unsubscribe = onWSMessage((ev) => {
    if (!ev || !ev.type) return

    const me = Number(getState().currentUser?.id)
    const otherId = Number(getState().chatWithUserId) || null
    if (!me || !otherId) return

    // MESSAGE
    if (ev.type === 'message') {
      const belongs =
        (Number(ev.from_user_id) === otherId && Number(ev.to_user_id) === me) || (Number(ev.from_user_id) === me && Number(ev.to_user_id) === otherId)

      if (!belongs) return

      // Insert/update locally
      upsertMessageByIdOrTemp(ev)

      // If I'm the recipient, send delivered ack.
      ackDeliveredIfNeeded(ev)

      // If I'm currently viewing this chat and I'm near bottom, mark seen.
      // (You can remove "near bottom" if you want instant seen always.)
      if (Number(ev.from_user_id) === otherId && Number(ev.to_user_id) === me) {
        // only incoming messages
        if (isNearBottom(msgsEl, 80)) {
          sendSeenNow(otherId)
        }
      }

      renderMessages(allMessages, { preserveScroll: false })
      return
    }

    // DELIVERED
    if (ev.type === 'delivered') {
      // expected: { type:"delivered", message_id: 123, ... }
      const mid = Number(ev.message_id || ev.id || 0)
      if (!mid) return

      // Only meaningful for my outgoing messages
      markDeliveredLocally(mid)
      renderMessages(allMessages, { preserveScroll: false })
      return
    }

    // SEEN
    if (ev.type === 'seen') {
      // expected: { type:"seen", seen_up_to_id: 123, from_user_id, ... }
      const seenUpTo = Number(ev.seen_up_to_id || ev.seenUpToID || 0)
      if (!seenUpTo) return

      markSeenUpToLocally(seenUpTo)
      renderMessages(allMessages, { preserveScroll: false })
      return
    }
  })

  // ---------------------------
  // initial open
  // ---------------------------
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

  // ---------------------------
  // send message (WS) + optimistic insert
  // ---------------------------
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

    // Optimistic insert -> shows ✓
    allMessages.push(
      normalizeMessage({
        temp_id: tempID,
        from_user_id: me,
        to_user_id: selectedUserId,
        content,
        sent_at: nowIso,
        delivered: false,
        seen: false,
      })
    )

    lastSendNonce++
    renderMessages(allMessages, { preserveScroll: false })

    // Send to backend
    sendWS({
      type: 'message',
      to_user_id: Number(selectedUserId),
      text: content,
      temp_id: tempID,
    })
  })

  // Cleanup WS listener on navigation
  window.addEventListener(
    'hashchange',
    () => {
      unsubscribe()
    },
    { once: true }
  )
}

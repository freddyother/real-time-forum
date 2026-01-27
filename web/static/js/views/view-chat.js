// web/static/js/views/view-chat.js
// Chat view + right sidebar (users list)

import { apiGetUsers, apiGetMessages } from '../api.js'
import { sendWS, onWSMessage } from '../ws-chat.js'
import { getState, setStateKey, getUserPresence, onPresenceChange } from '../state.js'
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

function formatLastSeen(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''

  // Today? show HH:MM, else dd/mm HH:MM
  const now = new Date()
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()

  if (sameDay) return `last seen ${formatHHMM(iso)}`

  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `last seen ${dd}/${mm}/${yyyy} ${formatHHMM(iso)}`
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

// Keep one controller for the sidebar requests.
// Any new render aborts the previous in-flight request.
let sidebarAbortCtrl = null

function abortSidebarFetch() {
  if (sidebarAbortCtrl) {
    try {
      sidebarAbortCtrl.abort()
    } catch (_) {}
    sidebarAbortCtrl = null
  }
}

// ------------------------------------------------------------
// Sidebar (RIGHT) : users list
// ------------------------------------------------------------
export async function renderChatSidebar(root) {
  const state = getState()

  // If not logged in, clear and abort any in-flight request.
  if (!state.currentUser) {
    abortSidebarFetch()
    root.innerHTML = ''
    return
  }

  // Abort previous request before starting a new one.
  abortSidebarFetch()
  sidebarAbortCtrl = new AbortController()
  const { signal } = sidebarAbortCtrl

  // Snapshot the current user id to detect changes mid-flight.
  const meIdAtStart = Number(state.currentUser?.id) || 0

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
    // apiGetUsers must accept (limit, signal)
    users = await apiGetUsers(100, signal)
  } catch (err) {
    // If aborted, do nothing (expected during logout/rerender).
    if (err && err.name === 'AbortError') return

    console.error('Failed to load users:', err)
    list.innerHTML = `<div class="chat-side-empty">Could not load users.</div>`
    return
  }

  // If the request is not the latest one anymore, ignore.
  if (!sidebarAbortCtrl || sidebarAbortCtrl.signal !== signal) return

  // If the user logged out / switched account while the request was running, do nothing.
  const stateNow = getState()
  const meIdNow = Number(stateNow.currentUser?.id) || 0
  if (!stateNow.currentUser || meIdNow !== meIdAtStart) return

  users = Array.isArray(users) ? users : []
  users = users.filter((u) => Number(u.id) !== meIdNow)

  if (!users.length) {
    list.innerHTML = `<div class="chat-side-empty">No other users yet.</div>`
    return
  }

  const selectedId = Number(stateNow.chatWithUserId) || null

  // Helper to render presence hint
  function presenceHint(uid, fallbackLastSeenAt) {
    const p = getUserPresence(uid)
    if (p.online) return `<span class="chat-presence online">● online</span>`

    const ls = p.lastSeenAt || fallbackLastSeenAt
    if (ls) return `<span class="chat-presence lastseen">${escapeHtml(formatLastSeen(ls))}</span>`

    return `<span class="chat-presence offline">● offline</span>`
  }

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
        <div class="chat-user-hint">${presenceHint(uid, u.last_seen_at)}</div>
      </div>
    `

    item.addEventListener('click', () => {
      // If the user logs out between render and click, ignore.
      if (!getState().currentUser) return

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
  const s = getState()
  if (!s.currentUser) {
    root.innerHTML = ''
    navigateTo('login')
    return
  }

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
          <input id="chatzchatInput" style="display:none" />
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

  const paramId = param ? Number(param) : null
  if (paramId) setStateKey('chatWithUserId', paramId)

  let selectedUserId = Number(getState().chatWithUserId) || null

  const PAGE_SIZE = 30
  let offset = 0
  let hasMore = true
  let loadingMore = false

  let allMessages = []
  let lastSendNonce = 0

  // typing state (UI)
  let typingFromOther = false
  let typingHideTimer = null

  // presence subscription for the active chat user
  let unsubscribePresence = null

  function bindPresenceSubscription(otherId) {
    if (unsubscribePresence) {
      unsubscribePresence()
      unsubscribePresence = null
    }
    if (!otherId) return

    unsubscribePresence = onPresenceChange(otherId, () => {
      // si está “typing…”, no lo pisamos; si no, actualizamos
      if (!typingFromOther) renderHeaderSubtitle()
    })
  }

  function setTypingUI(on) {
    typingFromOther = Boolean(on)
    renderHeaderSubtitle()
  }

  function renderHeaderSubtitle() {
    const otherId = Number(getState().chatWithUserId) || null
    if (!otherId) {
      subtitleEl.textContent = 'Select a user to start chatting'
      return
    }

    // typing…
    if (typingFromOther) {
      subtitleEl.textContent = 'typing…'
      return
    }

    const p = getUserPresence(otherId)

    // ✅ SAME STYLE AS SIDEBAR
    if (p.online) {
      subtitleEl.innerHTML = `<span class="chat-presence online">● online</span>`
      return
    }

    if (p.lastSeenAt) {
      subtitleEl.innerHTML = `<span class="chat-presence lastseen">${escapeHtml(formatLastSeen(p.lastSeenAt))}</span>`
      return
    }

    subtitleEl.innerHTML = `<span class="chat-presence offline">● offline</span>`
  }

  // ---------------------------
  // Normalize
  // ---------------------------
  function normalizeMessage(m) {
    return {
      id: m.id ?? null,
      temp_id: m.temp_id ?? null,
      from_user_id: Number(m.from_user_id),
      to_user_id: Number(m.to_user_id),
      content: m.content ?? m.text ?? '',
      sent_at: m.sent_at || '',

      delivered: Boolean(m.delivered),
      delivered_at: m.delivered_at ?? null,
      seen: Boolean(m.seen),
      seen_at: m.seen_at ?? null,
    }
  }

  function upsertMessageByIdOrTemp(msg) {
    const m = normalizeMessage(msg)

    if (m.temp_id) {
      const idx = allMessages.findIndex((x) => x.temp_id && x.temp_id === m.temp_id)
      if (idx !== -1) {
        allMessages[idx] = { ...allMessages[idx], ...m }
        return
      }
    }

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
    if (idx !== -1) allMessages[idx] = { ...allMessages[idx], delivered: true }
  }

  function markSeenUpToLocally(seenUpToID) {
    if (!seenUpToID) return
    for (let i = 0; i < allMessages.length; i++) {
      const m = allMessages[i]
      if (m.id != null && m.id <= seenUpToID) {
        allMessages[i] = { ...m, seen: true }
      }
    }
  }

  // ---------------------------
  // WS ACK helpers
  // ---------------------------
  function ackDeliveredIfNeeded(evMsg) {
    const me = Number(getState().currentUser?.id)
    if (!me) return
    if (Number(evMsg.to_user_id) !== me) return
    if (!evMsg.id) return

    sendWS({ type: 'delivered', message_id: Number(evMsg.id) })
  }

  // ---------------------------
  // Seen: debounce/cooldown + visible + active chat guard
  // ---------------------------
  const SEEN_COOLDOWN_MS = 1000
  let lastSeenSentAt = 0
  let seenTimer = null
  let pendingSeenOtherId = null

  function isChatActive(otherId) {
    const current = Number(getState().chatWithUserId) || null
    return current != null && Number(current) === Number(otherId)
  }

  function canSendSeenNow(otherId) {
    if (!otherId) return false
    if (document.visibilityState !== 'visible') return false
    if (!isChatActive(otherId)) return false
    return true
  }

  function sendSeenNow(otherId) {
    if (!canSendSeenNow(otherId)) return
    if (!isNearBottom(msgsEl, 80)) return

    sendWS({
      type: 'seen',
      from_user_id: Number(otherId),
    })

    lastSeenSentAt = Date.now()
  }

  function scheduleSeen(otherId, _reason = '') {
    if (!otherId) return
    if (!canSendSeenNow(otherId)) return
    if (!isNearBottom(msgsEl, 80)) return

    pendingSeenOtherId = Number(otherId)

    const now = Date.now()
    const remaining = SEEN_COOLDOWN_MS - (now - lastSeenSentAt)

    if (remaining <= 0) {
      if (seenTimer) {
        clearTimeout(seenTimer)
        seenTimer = null
      }
      sendSeenNow(pendingSeenOtherId)
      pendingSeenOtherId = null
      return
    }

    if (seenTimer) return

    seenTimer = setTimeout(() => {
      seenTimer = null
      if (pendingSeenOtherId && canSendSeenNow(pendingSeenOtherId)) {
        sendSeenNow(pendingSeenOtherId)
      }
      pendingSeenOtherId = null
    }, remaining)
  }

  function onVisibilityChange() {
    const otherId = Number(getState().chatWithUserId) || null
    if (!otherId) return
    if (document.visibilityState === 'visible') scheduleSeen(otherId, 'tab-visible')
  }

  document.addEventListener('visibilitychange', onVisibilityChange)

  // ---------------------------
  // Typing (frontend -> WS) with throttle + auto-stop
  // ---------------------------
  const TYPING_THROTTLE_MS = 500
  const TYPING_IDLE_STOP_MS = 1200
  let lastTypingSentAt = 0
  let typingStopTimer = null
  let typingIsOn = false

  function stopTypingNow() {
    const otherId = Number(getState().chatWithUserId) || null
    if (!otherId) return
    if (!typingIsOn) return

    typingIsOn = false
    sendWS({ type: 'typing', to_user_id: Number(otherId), is_typing: false })
  }

  function scheduleStopTyping() {
    if (typingStopTimer) clearTimeout(typingStopTimer)
    typingStopTimer = setTimeout(() => {
      typingStopTimer = null
      stopTypingNow()
    }, TYPING_IDLE_STOP_MS)
  }

  function sendTypingOnThrottled() {
    const otherId = Number(getState().chatWithUserId) || null
    if (!otherId) return

    // Only when visible + active chat (same philosophy as seen)
    if (document.visibilityState !== 'visible') return
    if (!isChatActive(otherId)) return

    const now = Date.now()
    if (now - lastTypingSentAt < TYPING_THROTTLE_MS) {
      scheduleStopTyping()
      return
    }

    lastTypingSentAt = now
    if (!typingIsOn) typingIsOn = true

    sendWS({ type: 'typing', to_user_id: Number(otherId), is_typing: true })
    scheduleStopTyping()
  }

  input.addEventListener('input', () => {
    const v = input.value.trim()
    if (!v) {
      // If input cleared, stop immediately
      if (typingStopTimer) clearTimeout(typingStopTimer)
      typingStopTimer = null
      stopTypingNow()
      return
    }
    sendTypingOnThrottled()
  })

  input.addEventListener('blur', () => {
    if (typingStopTimer) clearTimeout(typingStopTimer)
    typingStopTimer = null
    stopTypingNow()
  })

  // ---------------------------
  // Pagination
  // ---------------------------
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

    scheduleSeen(otherId, 'open-chat')
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
    if (isNearBottom(msgsEl, 80)) scheduleSeen(currentId, 'scroll-bottom')
  })

  // ---------------------------
  // Render
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
      if (ts - prevItem.ts > TWO_MIN) groups.push({ kind: 'group', side, items: [{ m, ts }] })
      else prev.items.push({ m, ts })
    }

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

        let statusText = ''
        let statusClass = ''

        if (isMine && isLastInGroup) {
          const pending = !m.id
          const sent = !!m.id
          const delivered = Boolean(m.delivered || m.delivered_at)
          const seen = Boolean(m.seen || m.seen_at)

          if (pending) {
            statusText = '✓'
            statusClass = 'is-sent'
          } else if (sent && !delivered && !seen) {
            statusText = '✓'
            statusClass = 'is-sent'
          } else if (delivered && !seen) {
            statusText = '✓✓'
            statusClass = 'is-delivered'
          } else if (seen) {
            statusText = '✓✓'
            statusClass = 'is-seen'
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

  // ---------------------------
  // WS listener (only chat events here)
  // ---------------------------
  const unsubscribe = onWSMessage((ev) => {
    if (!ev || !ev.type) return

    const me = Number(getState().currentUser?.id)
    const otherId = Number(getState().chatWithUserId) || null
    if (!me) return

    // typing
    if (ev.type === 'typing') {
      const from = Number(ev.from_user_id || 0)
      const to = Number(ev.to_user_id || 0)
      if (!from || !to) return
      if (to !== me) return
      if (!otherId || from !== otherId) return

      const on = Boolean(ev.is_typing)
      setTypingUI(on)

      if (typingHideTimer) clearTimeout(typingHideTimer)
      if (on) {
        typingHideTimer = setTimeout(() => {
          typingHideTimer = null
          setTypingUI(false)
        }, 2000)
      } else {
        typingHideTimer = null
      }
      return
    }

    if (!otherId) return

    // message
    if (ev.type === 'message') {
      const belongs =
        (Number(ev.from_user_id) === otherId && Number(ev.to_user_id) === me) || (Number(ev.from_user_id) === me && Number(ev.to_user_id) === otherId)
      if (!belongs) return

      upsertMessageByIdOrTemp(ev)
      ackDeliveredIfNeeded(ev)

      if (Number(ev.from_user_id) === otherId && Number(ev.to_user_id) === me) {
        scheduleSeen(otherId, 'incoming-message')
      }

      renderMessages(allMessages, { preserveScroll: false })
      return
    }

    // delivered
    if (ev.type === 'delivered') {
      const mid = Number(ev.message_id || 0)
      if (!mid) return
      markDeliveredLocally(mid)
      renderMessages(allMessages, { preserveScroll: false })
      return
    }

    // seen
    if (ev.type === 'seen') {
      const seenUpTo = Number(ev.seen_up_to_id || 0)
      if (!seenUpTo) return
      markSeenUpToLocally(seenUpTo)
      renderMessages(allMessages, { preserveScroll: false })
      return
    }
  })

  // initial open
  if (selectedUserId) {
    const fallbackName = getState().chatWithUserName || null
    titleEl.textContent = fallbackName || 'Chat'

    bindPresenceSubscription(selectedUserId) // ✅ AÑADE ESTO
    renderHeaderSubtitle()

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

    // stop typing when you send
    if (typingHideTimer) clearTimeout(typingHideTimer)
    typingHideTimer = null
    typingIsOn = false

    const me = Number(getState().currentUser?.id)
    const nowIso = new Date().toISOString()
    const tempID = makeTempID()

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

    sendWS({
      type: 'message',
      to_user_id: Number(selectedUserId),
      text: content,
      temp_id: tempID,
    })
  })

  // Cleanup
  window.addEventListener(
    'hashchange',
    () => {
      unsubscribe()
      document.removeEventListener('visibilitychange', onVisibilityChange)

      if (seenTimer) clearTimeout(seenTimer)
      seenTimer = null
      pendingSeenOtherId = null

      if (typingHideTimer) clearTimeout(typingHideTimer)
      typingHideTimer = null

      if (unsubscribePresence) {
        unsubscribePresence()
        unsubscribePresence = null
      }
    },
    { once: true }
  )
}

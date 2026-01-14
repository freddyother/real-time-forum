// web/static/js/views/view-chat.js
// Chat view + right sidebar (users list)

import { apiGetUsers, apiGetMessages, apiSendMessage } from '../api.js'
import { getState, setStateKey } from '../state.js'
import { navigateTo } from '../router.js'

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function escapeHtml(str) {
  return String(str).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')
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
  // ---------- helpers ----------
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

    // dd/mm/yyyy
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yyyy = d.getFullYear()
    return `${dd}/${mm}/${yyyy}`
  }

  // ---------- UI ----------
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

  // ---------- param -> selected user ----------
  const paramId = param ? Number(param) : null
  if (paramId) setStateKey('chatWithUserId', paramId)

  let selectedUserId = Number(getState().chatWithUserId) || null

  // ---------- pagination / infinite scroll up ----------
  const PAGE_SIZE = 30
  let offset = 0
  let hasMore = true
  let loadingMore = false

  // mantenemos memoria local para poder prepend sin perder scroll
  let allMessages = []

  async function fetchPage(otherId, pageOffset) {
    const data = await apiGetMessages(otherId, pageOffset, PAGE_SIZE)
    const messages = Array.isArray(data.messages) ? data.messages : []
    return messages
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
      // Si tu API devuelve de más nuevo -> más viejo, descomenta:
      // page.reverse()
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

    // preservar posición visual
    const newScrollHeight = msgsEl.scrollHeight
    msgsEl.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight)

    loadingMore = false
  }

  // scroll up -> loading more
  msgsEl.addEventListener('scroll', () => {
    const currentId = Number(getState().chatWithUserId) || null
    if (!currentId) return
    if (msgsEl.scrollTop < 40) loadMoreTop(currentId)
  })

  // ---------- render ----------
  let lastSendNonce = 0

  function renderMessages(messages, { preserveScroll }) {
    const state = getState()
    const me = state.currentUser.id
    const nearBottom = preserveScroll ? false : isNearBottom(msgsEl, 30)

    msgsEl.innerHTML = ''
    if (!messages.length) {
      msgsEl.innerHTML = `<div class="chat-empty">No messages yet.</div>`
      return
    }

    const TWO_MIN = 2 * 60 * 1000

    // 0) construir "tokens" con separadores de fecha
    const tokens = []
    let lastDay = null
    for (const m of messages) {
      const dayMs = startOfDayMs(m.sent_at)
      if (lastDay === null || dayMs !== lastDay) {
        tokens.push({ type: 'sep', label: dateLabelFromIso(m.sent_at) })
        lastDay = dayMs
      }
      tokens.push({ type: 'msg', m })
    }

    // 1) agrupar por lado + (<=2min)
    //    IMPORTANTE: separador corta grupos siempre
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

      // cambia de lado -> nuevo grupo
      if (prev.side !== side) {
        groups.push({ kind: 'group', side, items: [{ m, ts }] })
        continue
      }

      // gap > 2min -> nuevo grupo (así NO se pierde la hora entre mensajes separados)
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

        // ✅✅ seen: SOLO tus mensajes (mine). Ajusta aquí si tu backend usa otro campo.
        const isMine = g.side === 'mine'
        const seen = Boolean(m.seen || m.seen_at) // <-- CAMBIA si tu backend es distinto

        // status sólo en el último del grupo (estilo WhatsApp/Telegram)
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

    // 3) Auto-scroll sólo si estabas abajo
    if (nearBottom) scrollToBottom(msgsEl)

    // 4) Animación sutil al enviar
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

  // ---------- nickname ----------
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

  // ---------- initial open ----------
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

  // ---------- send ----------
  form.addEventListener('submit', async (e) => {
    e.preventDefault()

    selectedUserId = getState().chatWithUserId || null
    if (!selectedUserId) return

    const content = input.value.trim()
    if (!content) return
    input.value = ''

    try {
      await apiSendMessage(selectedUserId, content)
      lastSendNonce++

      // recargamos (simple). Si quieres optimizar, hacemos append local.
      await loadInitial(selectedUserId)
    } catch (err) {
      console.error('send message failed:', err)
      alert('Could not send message.')
    }
  })
}

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
  // --- Main Layout chat ---

  function formatHHMM(iso) {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    // HH:mm 24h
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  // devuelve true si el scroll está "casi" abajo (tolerancia 30px)
  function isNearBottom(el, threshold = 30) {
    return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold
  }

  // scroll to the end
  function scrollToBottom(el) {
    el.scrollTop = el.scrollHeight
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
  if (paramId) {
    setStateKey('chatWithUserId', paramId)
  }

  let selectedUserId = Number(getState().chatWithUserId) || null

  async function loadConversation(otherId) {
    try {
      const data = await apiGetMessages(otherId, 0, 50)
      const messages = Array.isArray(data.messages) ? data.messages : []
      renderMessages(messages)
    } catch (err) {
      console.error('loadConversation failed:', err)
      msgsEl.innerHTML = `<div class="chat-empty">Could not load messages.</div>`
    }
  }

  let lastSendNonce = 0

  function renderMessages(messages) {
    const state = getState()
    const me = state.currentUser.id

    // ¿estaba el usuario “abajo” antes de re-render?
    const nearBottom = isNearBottom(msgsEl, 30)

    msgsEl.innerHTML = ''
    if (!messages.length) {
      msgsEl.innerHTML = `<div class="chat-empty">No messages yet.</div>`
      return
    }

    // helpers de tiempo
    const toMs = (iso) => {
      const d = new Date(iso)
      const t = d.getTime()
      return Number.isNaN(t) ? 0 : t
    }
    const TWO_MIN = 2 * 60 * 1000

    // 1) AGRUPAR consecutivos por lado + por tiempo (<= 2 min)
    const groups = []
    for (const m of messages) {
      const side = m.from_user_id === me ? 'mine' : 'theirs'
      const ts = toMs(m.sent_at)

      const prev = groups[groups.length - 1]
      if (!prev) {
        groups.push({ side, items: [m], lastTs: ts })
        continue
      }

      const gap = Math.abs(ts - prev.lastTs)

      // cortamos grupo si cambia de lado o si pasaron > 2 min
      if (prev.side !== side || gap > TWO_MIN) {
        groups.push({ side, items: [m], lastTs: ts })
      } else {
        prev.items.push(m)
        prev.lastTs = ts
      }
    }

    // 2) RENDER groups
    for (const g of groups) {
      const groupEl = document.createElement('div')
      groupEl.className = `chat-group ${g.side}`

      g.items.forEach((m, idx) => {
        const isLastInGroup = idx === g.items.length - 1
        const bubble = document.createElement('div')
        bubble.className = `chat-bubble ${g.side}`

        bubble.innerHTML = `
        <div class="chat-text">${escapeHtml(m.content)}</div>
        ${isLastInGroup ? `<div class="chat-time">${formatHHMM(m.sent_at)}</div>` : ``}
      `

        if (idx === 0) bubble.classList.add('is-first')
        if (isLastInGroup) bubble.classList.add('is-last')

        groupEl.appendChild(bubble)
      })

      msgsEl.appendChild(groupEl)
    }

    // 3) Auto-scroll SOLO si ya estabas abajo
    if (nearBottom) scrollToBottom(msgsEl)

    // 4) Animación sutil al enviar (última burbuja mine del último grupo mine)
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

  // --- helpers ---
  function formatHHMM(iso) {
    const d = new Date(iso)
    // HH:MM en local
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  }

  async function resolveSelectedUserNickname(userId) {
    // try to read it from the sidebar list (fast, no extra fetch)
    const sidebar = document.getElementById('sidebar-chat')
    if (!sidebar) return null

    const btn = sidebar.querySelector(`.chat-user-row.is-active`)
    if (btn) {
      const nameEl = btn.querySelector('.chat-user-name')
      if (nameEl) return nameEl.textContent
    }
    return null
  }

  // If a user is already selected (from sidebar click), open conversation automatically

  if (selectedUserId) {
    const s = getState()
    const fallbackName = s.chatWithUserName || null
    const nickname = (await resolveSelectedUserNickname(selectedUserId)) || fallbackName

    titleEl.textContent = nickname || 'Chat'
    subtitleEl.textContent = `Chatting…`
    input.disabled = false
    sendBtn.disabled = false
    input.focus()
    await loadConversation(selectedUserId)
  }

  // --- send message ---
  form.addEventListener('submit', async (e) => {
    e.preventDefault()

    // always re-read selected userId from state in case it changed
    selectedUserId = getState().chatWithUserId || null
    if (!selectedUserId) return

    const content = input.value.trim()
    if (!content) return
    input.value = ''

    try {
      await apiSendMessage(selectedUserId, content)
      lastSendNonce++
      await loadConversation(selectedUserId)
    } catch (err) {
      console.error('send message failed:', err)
      alert('Could not send message.')
    }
  })
}

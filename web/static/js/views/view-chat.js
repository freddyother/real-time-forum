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

  // ✅ If not logged in: sidebar must be empty
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
    users = await apiGetUsers(100) // returns array
  } catch (err) {
    console.error('Failed to load users:', err)
    list.innerHTML = `<div class="chat-side-empty">Could not load users.</div>`
    return
  }

  // remove myself
  const meId = state.currentUser?.id
  users = users.filter((u) => u.id !== meId)

  if (!users.length) {
    list.innerHTML = `<div class="chat-side-empty">No other users yet.</div>`
    return
  }

  const selectedId = getState().chatWithUserId || null

  list.innerHTML = ''
  users.forEach((u) => {
    const item = document.createElement('button')
    item.type = 'button'
    item.className = 'chat-user-row' + (selectedId === u.id ? ' is-active' : '')

    item.innerHTML = `
      <div class="chat-user-avatar">${u.nickname ? u.nickname[0].toUpperCase() : '?'}</div>
      <div class="chat-user-info">
        <div class="chat-user-name">${escapeHtml(u.nickname || 'Unknown')}</div>
        <div class="chat-user-hint">Click to open</div>
      </div>
    `

    item.addEventListener('click', () => {
      // ✅ store selected chat user in global state
      setStateKey('chatWithUserId', u.id)
      setStateKey('chatWithUserName', u.nickname || 'Unknown')
      // go to chat view (if you are in feed)
      navigateTo('chat')
    })

    list.appendChild(item)
  })
}

// ------------------------------------------------------------
// Main chat page (CENTER) : conversation + compose
// ------------------------------------------------------------
export async function renderChatView(root) {
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

  let selectedUserId = getState().chatWithUserId || null

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
    const nearBottom = msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 30

    msgsEl.innerHTML = ''
    if (!messages.length) {
      msgsEl.innerHTML = `<div class="chat-empty">No messages yet.</div>`
      return
    }

    // 1) AGRUPAR consecutivos por “lado” (mine/theirs)
    const groups = []
    for (const m of messages) {
      const isMine = m.from_user_id === me
      const side = isMine ? 'mine' : 'theirs'

      const prev = groups[groups.length - 1]
      if (!prev || prev.side !== side) {
        groups.push({ side, items: [m] })
      } else {
        prev.items.push(m)
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

        // si NO es el último del grupo, ocultamos hora
        bubble.innerHTML = `
        <div class="chat-text">${escapeHtml(m.content)}</div>
        ${isLastInGroup ? `<div class="chat-time">${formatHHMM(m.sent_at)}</div>` : ``}
      `

        // marcar primera/última para redondeos “telegram”
        if (idx === 0) bubble.classList.add('is-first')
        if (isLastInGroup) bubble.classList.add('is-last')

        groupEl.appendChild(bubble)
      })

      msgsEl.appendChild(groupEl)
    }

    // 3) Auto-scroll SOLO si ya estabas abajo
    if (nearBottom) msgsEl.scrollTop = msgsEl.scrollHeight

    // 4) Animación sutil: si venimos de enviar, animar última burbuja “mine”
    if (lastSendNonce > 0) {
      const lastMineBubble = msgsEl.querySelector('.chat-group.mine .chat-bubble.mine.is-last:last-child')
      // selector alternativo robusto:
      const allMineLast = msgsEl.querySelectorAll('.chat-group.mine .chat-bubble.mine.is-last')
      const target = allMineLast.length ? allMineLast[allMineLast.length - 1] : null
      if (target) {
        target.classList.add('is-new')
        setTimeout(() => target.classList.remove('is-new'), 250)
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
    const nickname = s.chatWithUserName || (await resolveSelectedUserNickname(selectedUserId)) || 'Chat'

    titleEl.textContent = nickname
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

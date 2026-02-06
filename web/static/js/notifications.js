import { onWSMessage } from './ws-chat.js'
import { getState, setStateKey } from './state.js'

export function initNotifications() {
  onWSMessage((ev) => {
    if (ev.type !== 'message') return

    const me = Number(getState().currentUser?.id)
    if (!me) return

    // message  NOT for me
    if (Number(ev.to_user_id) !== me) return

    const fromId = Number(ev.from_user_id)
    const activeChat = Number(getState().chatWithUserId)

    // 👇 I am in the chat, NO notification
    if (activeChat === fromId) return

    incrementUnread(fromId)
    showToast(ev)
  })
}

function incrementUnread(fromId) {
  const state = getState()
  const unread = { ...(state.unreadMessages || {}) }

  unread[fromId] = (unread[fromId] || 0) + 1
  setStateKey('unreadMessages', unread)
}

function showToast(ev) {
  const nick = ev.from_nickname || 'New message'
  const text = ev.content || ev.text || ''

  const toast = document.createElement('div')
  toast.className = 'toast-notification'
  toast.innerHTML = `
    <strong>${nick}</strong><br/>
    <span>${text.slice(0, 40)}</span>
  `

  document.body.appendChild(toast)

  setTimeout(() => toast.classList.add('show'), 10)
  setTimeout(() => {
    toast.classList.remove('show')
    setTimeout(() => toast.remove(), 300)
  }, 3000)
}

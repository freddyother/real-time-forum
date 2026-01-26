// web/static/js/components/navbar.js
// Renders the main navigation bar.
// This component appears on every page when the user is logged in.

import { navigateTo } from '../router.js'
import { getState, setStateKey } from '../state.js'
import { apiLogout } from '../api.js'

export function renderNavbar(root) {
  const state = getState()
  const user = state.currentUser

  // If no user is logged in, render nothing.
  if (!user) return

  // Avatar letter based on the first character of the nickname
  const avatarLetter = user.nickname ? user.nickname.charAt(0).toUpperCase() : '?'

  const nav = document.createElement('nav')
  nav.className = 'navbar'

  nav.innerHTML = `
    <div class="nav-left">
      <span class="nav-logo">Real-Time Forum</span>

      <button class="nav-btn" data-route="feed">Feed</button>
      <button class="nav-btn" data-route="new-post">New post</button>
      <button class="nav-btn" data-route="chat">Chat</button>
    </div>

    <div class="nav-right">
      <div class="nav-avatar">${avatarLetter}</div>
      <span class="nav-user">Hello, ${user.nickname}</span>
      <button class="nav-btn" id="logoutBtn">Logout</button>
    </div>
  `

  // ------------------------------------------------------------
  // Active route highlight
  // ------------------------------------------------------------
  function setActiveFromHash() {
    const hash = window.location.hash.slice(1) || 'feed'
    const baseRoute = hash.split('/')[0]

    nav.querySelectorAll('.nav-btn[data-route]').forEach((btn) => {
      const btnRoute = btn.getAttribute('data-route')
      btn.classList.toggle('active', btnRoute === baseRoute)
    })
  }

  // ------------------------------------------------------------
  // Navigation buttons
  // ------------------------------------------------------------
  nav.querySelectorAll('.nav-btn[data-route]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const route = btn.getAttribute('data-route')

      // ✅ If the user clicks "Chat", try to open the last active conversation.
      if (route === 'chat') {
        const s = getState()
        const lastId = Number(s.chatWithUserId) || null
        if (lastId) {
          navigateTo(`chat/${lastId}`)
        } else {
          navigateTo('chat')
        }
        setActiveFromHash()
        return
      }

      navigateTo(route)
      setActiveFromHash()
    })
  })

  // ------------------------------------------------------------
  // LOGOUT
  // ------------------------------------------------------------
  const logoutBtn = nav.querySelector('#logoutBtn')
  logoutBtn.addEventListener('click', async () => {
    try {
      // Clear chat selection
      setStateKey('chatWithUserId', null)
      setStateKey('chatWithUserName', null)

      // Trigger app logout (main.js will disable WS + navigate)
      setStateKey('currentUser', null)

      // Logout HTTP (delete cookie session)
      await apiLogout()
    } catch (err) {
      console.error('Logout failed:', err)
    }
  })

  // ✅ No global "hashchange" listener here (avoid leaks / duplicated handlers).
  setActiveFromHash()

  root.appendChild(nav)
}

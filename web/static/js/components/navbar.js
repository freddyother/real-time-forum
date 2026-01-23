// Renders the main navigation bar.
// This component appears on every page except when the user is not logged in.
// The router decides when it is displayed.

import { navigateTo } from '../router.js'
import { getState, setStateKey } from '../state.js'
import { apiLogout } from '../api.js'
import { closeWS } from '../ws-chat.js'

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

  nav.querySelectorAll('.nav-btn[data-route]').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigateTo(btn.getAttribute('data-route'))
      setActiveFromHash()
    })
  })

  // ------------------------------------------------------------
  // ✅ LOGOUT
  // ------------------------------------------------------------
  const logoutBtn = nav.querySelector('#logoutBtn')
  logoutBtn.addEventListener('click', async () => {
    try {
      // 1)  CLOSE WS
      closeWS()

      // 2) Limpia estado relacionado con chat
      setStateKey('chatWithUserId', null)
      setStateKey('chatWithUserName', null)

      // 3) Logout HTTP (delete cookie session)
      await apiLogout()

      // 4) clean up → router go to the login
      setStateKey('currentUser', null)

      // (optional)
      navigateTo('login')
    } catch (err) {
      console.error('Logout failed:', err)
    }
  })

  window.addEventListener('hashchange', setActiveFromHash)
  setActiveFromHash()

  root.appendChild(nav)
}

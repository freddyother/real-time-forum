// Renders the main navigation bar.
// This component appears on every page except when the user is not logged in.
// The router decides when it is displayed.

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

  // Helper: highlights the active nav button based on the current hash
  function setActiveFromHash() {
    const hash = window.location.hash.slice(1) || 'feed'
    const baseRoute = hash.split('/')[0] // e.g. "post/1" -> "post"

    nav.querySelectorAll('.nav-btn[data-route]').forEach((btn) => {
      const btnRoute = btn.getAttribute('data-route')
      const isActive = btnRoute === baseRoute
      btn.classList.toggle('active', isActive)
    })
  }

  // --- Navigation buttons ---
  nav.querySelectorAll('.nav-btn[data-route]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const route = btn.getAttribute('data-route')
      navigateTo(route)
      // We can update immediately; the hashchange event will also fire.
      setActiveFromHash()
    })
  })

  // --- Logout button ---
  const logoutBtn = nav.querySelector('#logoutBtn')
  logoutBtn.addEventListener('click', async () => {
    try {
      await apiLogout()
      setStateKey('currentUser', null) // triggers router redirect
    } catch (err) {
      console.error('Logout failed:', err)
    }
  })

  // Listen to hash changes to keep the active state in sync
  window.addEventListener('hashchange', setActiveFromHash)

  // Initial active button when the navbar is first rendered
  setActiveFromHash()

  root.appendChild(nav)
}

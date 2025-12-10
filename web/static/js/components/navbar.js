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

  const nav = document.createElement('nav')
  nav.className = 'navbar'

  nav.innerHTML = `
    <div class="nav-left">
      <span class="nav-logo">Real-Time Forum</span>
      <button class="nav-btn" data-route="feed">Feed</button>
      <button class="nav-btn" data-route="chat">Chat</button>
    </div>

    <div class="nav-right">
      <span class="nav-user">Hello, ${user.nickname}</span>
      <button class="nav-btn" id="logoutBtn">Logout</button>
    </div>
  `

  // --- Navigation buttons ---
  nav.querySelectorAll('.nav-btn[data-route]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const route = btn.getAttribute('data-route')
      navigateTo(route)
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

  root.appendChild(nav)
}

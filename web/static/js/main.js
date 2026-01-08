import { initRouter, navigateTo } from './router.js'
import { initState, getState, onStateChange } from './state.js'
import { connectWS, disconnectWS } from './websocket.js'
import { renderNavbar } from './components/navbar.js'
import { renderChatSidebar } from './views/view-chat.js'

// Helper to mount / remount the navbar when a user is logged in

function mountNavbar() {
  const navbarRoot = document.getElementById('navbar-root')
  if (!navbarRoot) return

  // Remove any existing navbar (avoid duplicates)
  const existing = navbarRoot.querySelector('.navbar')
  if (existing) existing.remove()

  // Render navbar for the current user
  renderNavbar(navbarRoot)
}

// mountChatSidebar

function mountChatSidebar() {
  const sidebar = document.getElementById('sidebar-chat')
  if (!sidebar) return

  // optional: clear before
  sidebar.innerHTML = ''
  renderChatSidebar(sidebar)
}

// Helper to remove navbar when the user logs out

function unmountNavbar() {
  const navbarRoot = document.getElementById('navbar-root')
  if (!navbarRoot) return

  const existing = navbarRoot.querySelector('.navbar')
  if (existing) existing.remove()
}

function bootstrap() {
  // Initialise global state
  initState()

  const sidebar = document.getElementById('sidebar-chat')
  renderChatSidebar(sidebar)

  // React to login / logout changes
  onStateChange('currentUser', (user) => {
    if (user) {
      // User just logged in
      connectWS(user)
      mountNavbar()
      navigateTo('feed') // go to feed when user logs in
    } else {
      // User logged out
      disconnectWS()
      unmountNavbar()
      navigateTo('login') // go to login when user logs out
    }
  })

  // Start router (hashchange listener + initial route)
  initRouter()

  // Initial route based on existing user (e.g. restored from storage)
  const state = getState()
  if (state.currentUser) {
    connectWS(state.currentUser)
    mountNavbar()
    navigateTo('feed')
  } else {
    navigateTo('login')
  }
}

bootstrap()

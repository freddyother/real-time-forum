// web/static/js/main.js
import { initRouter, navigateTo } from './router.js'
import { initState, getState, onStateChange, subscribe } from './state.js'
import { connectWS, closeWS } from './ws-chat.js'
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

  subscribe(() => rerenderChrome())

  // React to login / logout changes
  onStateChange('currentUser', (user) => {
    if (user) {
      // User just logged in
      connectWS()

      mountNavbar()
      navigateTo('feed') // go to feed when user logs in
    } else {
      // User logged out
      closeWS()
      unmountNavbar()
      navigateTo('login') // go to login when user logs out
    }
  })

  // Start router (hashchange listener + initial route)
  initRouter()

  // Initial route based on existing user (e.g. restored from storage)
  const state = getState()
  if (state.currentUser) {
    connectWS()
    mountNavbar()
    navigateTo('feed')
  } else {
    navigateTo('login')
  }
}

function rerenderChrome() {
  const navbarRoot = document.getElementById('navbar-root')
  if (!navbarRoot) renderNavbar(navbarRoot)

  const sidebar = document.getElementById('sidebar-chat')
  if (sidebar) renderChatSidebar(sidebar)
}

bootstrap()

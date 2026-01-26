// web/static/js/main.js
import { initRouter, navigateTo } from './router.js'
import { initState, getState, onStateChange, subscribe, setPresenceSnapshot, setUserPresence } from './state.js'
import { enableWS, disableWS, onWSMessage } from './ws-chat.js'
import { renderNavbar } from './components/navbar.js'
import { renderChatSidebar } from './views/view-chat.js'

let unsubscribeWS = null

function mountNavbar() {
  const navbarRoot = document.getElementById('navbar-root')
  if (!navbarRoot) return

  // Remove any existing navbar (avoid duplicates)
  const existing = navbarRoot.querySelector('.navbar')
  if (existing) existing.remove()

  renderNavbar(navbarRoot)
}

function unmountNavbar() {
  const navbarRoot = document.getElementById('navbar-root')
  if (!navbarRoot) return

  const existing = navbarRoot.querySelector('.navbar')
  if (existing) existing.remove()
}

function ensureGlobalWSListeners() {
  if (unsubscribeWS) return

  unsubscribeWS = onWSMessage((ev) => {
    if (!ev || !ev.type) return

    // presence snapshot: { type:"presence_snapshot", online:[1,2,3] }
    if (ev.type === 'presence_snapshot') {
      if (Array.isArray(ev.online)) setPresenceSnapshot(ev.online)
      return
    }

    // presence update: { type:"presence", user_id, online, last_seen_at }
    if (ev.type === 'presence') {
      const uid = Number(ev.user_id || 0)
      if (!uid) return
      setUserPresence(uid, Boolean(ev.online), ev.last_seen_at ?? null)
      return
    }
  })
}

function teardownGlobalWSListeners() {
  if (unsubscribeWS) {
    unsubscribeWS()
    unsubscribeWS = null
  }
}

function rerenderChrome() {
  const state = getState()

  // Navbar: keep it idempotent (avoid duplicates)
  if (state.currentUser) {
    mountNavbar()
  } else {
    unmountNavbar()
  }

  // Sidebar: hide the container completely when logged out
  const sidebar = document.getElementById('sidebar-chat')
  if (!sidebar) return

  if (state.currentUser) {
    sidebar.style.display = '' // show (use default CSS)
    renderChatSidebar(sidebar)
  } else {
    sidebar.innerHTML = ''
    sidebar.style.display = 'none' // hide the whole right panel
  }
}

function bootstrap() {
  initState()

  // Re-render once immediately (important for hard refresh / first paint)
  rerenderChrome()

  // Every state change, re-render the sidebar/navbar
  subscribe(() => rerenderChrome())

  onStateChange('currentUser', (user) => {
    if (user) {
      // login: WS global + global listeners
      ensureGlobalWSListeners()
      enableWS()

      mountNavbar()
      navigateTo('feed')
    } else {
      // logout: close WS + clear listeners
      disableWS()
      teardownGlobalWSListeners()

      unmountNavbar()
      navigateTo('login')

      // Ensure UI is cleaned up immediately
      rerenderChrome()
    }
  })

  initRouter()

  // Restored session
  const state = getState()
  if (state.currentUser) {
    ensureGlobalWSListeners()
    enableWS()
    mountNavbar()
    navigateTo('feed')
  } else {
    navigateTo('login')
  }

  // Ensure chrome matches the initial route/render
  rerenderChrome()
}

// Run bootstrap when DOM is ready (fixes hard refresh showing the sidebar column)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap)
} else {
  bootstrap()
}

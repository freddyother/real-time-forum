// web/static/js/router.js

import { renderAuthView } from './views/view-auth.js'
import { renderFeedView } from './views/view-feed.js'
import { renderPostView } from './views/view-post.js'
import { renderChatView, renderChatSidebar } from './views/view-chat.js'
import { renderNewPostView } from './views/view-new-post.js'

import { getState } from './state.js'

let currentView = null

export function initRouter() {
  // Run the initial route at start-up
  handleRoute()

  // Listen for subsequent changes
  window.addEventListener('hashchange', handleRoute)
}

export function navigateTo(route) {
  window.location.hash = '#' + route
}

function handleRoute() {
  const state = getState()
  const user = state.currentUser

  const hash = window.location.hash.slice(1) || 'login'
  const [view, param] = hash.split('/')

  // ✅ If user opens "#chat" without param, redirect to the last opened conversation (if any).
  if (view === 'chat' && !param) {
    const lastId = Number(state.chatWithUserId) || null
    if (lastId) {
      navigateTo(`chat/${lastId}`)
      return
    }
  }

  const app = document.getElementById('app')
  app.innerHTML = ''

  // ✅ Sidebar root (global)
  const sidebarRoot = document.getElementById('sidebar-chat')
  if (sidebarRoot) {
    // If not logged in -> empty (main.js will hide it anyway)
    if (!user) {
      sidebarRoot.innerHTML = ''
    } else {
      // If logged in -> render it always
      renderChatSidebar(sidebarRoot) // no need await
    }
  }

  // --- ROUTE PROTECTION ---
  if (!user && view !== 'login' && view !== 'register') {
    renderAuthView(app, 'login')
    currentView = 'login'
    return
  }

  if (user && (view === 'login' || view === 'register')) {
    navigateTo('feed')
    return
  }

  switch (view) {
    case 'login':
    case 'register':
      renderAuthView(app, view)
      break
    case 'feed':
      renderFeedView(app)
      break
    case 'post':
      renderPostView(app, param)
      break
    case 'new-post':
      renderNewPostView(app)
      break
    case 'chat':
      renderChatView(app, param)
      break
    default:
      if (user) navigateTo('feed')
      else navigateTo('login')
  }

  currentView = view
}

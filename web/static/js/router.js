import { renderAuthView } from './views/view-auth.js'
import { renderFeedView } from './views/view-feed.js'
import { renderPostView } from './views/view-post.js'
import { renderChatView } from './views/view-chat.js'
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

  // Read the route
  const hash = window.location.hash.slice(1) || 'login'
  const [view, param] = hash.split('/')

  const app = document.getElementById('app')
  app.innerHTML = ''

  // --- ROUTE PROTECTION ---
  // If no user is logged in, force login/registration
  if (!user && view !== 'login' && view !== 'register') {
    renderAuthView(app, 'login')
    currentView = 'login'
    return
  }

  // If you are logged in and go to login/register → send it to the feed
  if (user && (view === 'login' || view === 'register')) {
    navigateTo('feed')
    return
  }

  // --- NORMAL ROUTING ---
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

    case 'chat':
      renderChatView(app, param)
      break

    default:
      // fallback
      if (user) {
        navigateTo('feed')
      } else {
        navigateTo('login')
      }
  }

  currentView = view
}

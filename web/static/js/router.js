import { renderAuthView } from './views/view-auth.js'
import { renderFeedView } from './views/view-feed.js'
import { renderPostView } from './views/view-post.js'
import { renderChatView } from './views/view-chat.js'

let currentView = null

export function initRouter() {
  window.addEventListener('hashchange', handleRoute)
}

export function navigateTo(route) {
  window.location.hash = '#' + route
}

function handleRoute() {
  const hash = window.location.hash.slice(1) || 'login'
  const [view, param] = hash.split('/')

  const app = document.getElementById('app')
  app.innerHTML = ''

  switch (view) {
    case 'login':
    case 'register':
      renderAuthView(app, view)
      break
    case 'feed':
      renderFeedView(app)
      break
    case 'post':
      renderPostView(app, param) // param = postId
      break
    case 'chat':
      renderChatView(app, param) // param = userId
      break
    default:
      renderAuthView(app, 'login')
  }

  currentView = view
}

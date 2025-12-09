import { initRouter, navigateTo } from './router.js'
import { initState, getState, onStateChange } from './state.js'
import { connectWS, disconnectWS } from './websocket.js'
import { renderNavbar } from './components/navbar.js'
import { renderChatSidebar } from './views/view-chat.js'

function bootstrap() {
  // Initialise global state and router
  initState()
  initRouter()

  const app = document.getElementById('app')
  const sidebar = document.getElementById('sidebar-chat')

  // Render navbar and chat sidebar
  renderNavbar(app)
  renderChatSidebar(sidebar)

  // React to login / logout changes
  onStateChange('currentUser', (user) => {
    if (user) {
      connectWS(user)
      navigateTo('feed') // go to feed when user logs in
    } else {
      disconnectWS()
      navigateTo('login') // go to login when user logs out
    }
  })

  // Initial route based on current user
  const state = getState()
  if (state.currentUser) {
    connectWS(state.currentUser)
    navigateTo('feed')
  } else {
    navigateTo('login')
  }
}

bootstrap()

import { initRouter, navigateTo } from './router.js'
import { initState, getState, onStateChange } from './state.js'
import { connectWS, disconnectWS } from './websocket.js'
import { renderNavbar } from './components/navbar.js'
import { renderChatSidebar } from './views/view-chat.js'

function bootstrap() {
  initState()
  initRouter()

  const app = document.getElementById('app')
  const sidebar = document.getElementById('sidebar-chat')

  renderNavbar(app) // coloca navbar arriba del app o dentro
  renderChatSidebar(sidebar) // lista de chats/usuarios siempre visible

  // Reaccionar a cambios de usuario logueado
  onStateChange('currentUser', (user) => {
    if (user) {
      connectWS(user)
      navigateTo('feed') // ir al feed si ya está logueado
    } else {
      disconnectWS()
      navigateTo('login')
    }
  })

  // Primera ruta
  const state = getState()
  if (state.currentUser) {
    connectWS(state.currentUser)
    navigateTo('feed')
  } else {
    navigateTo('login')
  }
}

bootstrap()

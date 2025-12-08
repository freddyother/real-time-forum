import { apiLogin, apiRegister } from '../api.js'
import { setStateKey } from '../state.js'
import { navigateTo } from '../router.js'

export function renderAuthView(root, mode = 'login') {
  const container = document.createElement('div')
  container.className = 'auth-container'

  // construir formulario según mode ('login' / 'register')
  // añadir listeners submit

  root.appendChild(container)
}

import { apiLogin, apiRegister } from '../api.js'
import { setStateKey } from '../state.js'
import { navigateTo } from '../router.js'

// Renders login or register depending on "mode"
export function renderAuthView(root, mode = 'login') {
  const container = document.createElement('div')
  container.className = 'auth-container'

  if (mode === 'login') {
    container.innerHTML = `
        <h2>Login</h2>
        <form id="loginForm">
            <input type="text" id="identifier" placeholder="Email or Nickname" required>
            <input type="password" id="password" placeholder="Password" required>
            <button type="submit">Login</button>
        </form>
        <p>No account? <a href="#register">Register here</a></p>
        `

    const form = container.querySelector('#loginForm')
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const identifier = container.querySelector('#identifier').value
      const password = container.querySelector('#password').value

      try {
        const res = await apiLogin(identifier, password)
        setStateKey('currentUser', res.user)
      } catch (err) {
        alert('Invalid credentials')
      }
    })
  } else if (mode === 'register') {
    container.innerHTML = `
        <h2>Register</h2>
        <form id="registerForm">
            <input type="text" id="nickname" placeholder="Nickname" required>
            <input type="number" id="age" placeholder="Age" required>
            <input type="text" id="gender" placeholder="Gender" required>
            <input type="text" id="first" placeholder="First name" required>
            <input type="text" id="last" placeholder="Last name" required>
            <input type="email" id="email" placeholder="Email" required>
            <input type="password" id="password" placeholder="Password" required>
            <button type="submit">Register</button>
        </form>
        <p>Already have an account? <a href="#login">Login here</a></p>
        `

    const form = container.querySelector('#registerForm')
    form.addEventListener('submit', async (e) => {
      e.preventDefault()

      const data = {
        nickname: container.querySelector('#nickname').value,
        age: Number(container.querySelector('#age').value),
        gender: container.querySelector('#gender').value,
        first_name: container.querySelector('#first').value,
        last_name: container.querySelector('#last').value,
        email: container.querySelector('#email').value,
        password: container.querySelector('#password').value,
      }

      try {
        await apiRegister(data)
        alert('Account created! You may log in.')
        navigateTo('login')
      } catch (err) {
        alert('Registration failed')
      }
    })
  }

  root.appendChild(container)
}

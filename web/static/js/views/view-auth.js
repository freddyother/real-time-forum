import { apiLogin, apiRegister } from '../api.js'
import { setStateKey } from '../state.js'
import { navigateTo } from '../router.js'

// Renders the authentication view (login or register) using
// the Glass Bubbles Lavender style.
export function renderAuthView(root, mode = 'login') {
  const container = document.createElement('div')
  container.className = 'auth-container'

  if (mode === 'login') {
    renderLogin(container)
  } else {
    renderRegister(container)
  }

  root.appendChild(container)
}

// Render the login form and attach its behaviour.
function renderLogin(container) {
  container.innerHTML = `
    <div class="auth-header">
      <h2>Welcome back</h2>
      <p>Log in to continue to the forum.</p>
    </div>

    <form id="loginForm" class="auth-form">
      <label class="auth-field">
        <span>Email or nickname</span>
        <input
          type="text"
          id="identifier"
          placeholder="your@email.com or nickname"
          required
        >
      </label>

      <label class="auth-field">
        <span>Password</span>
        <input
          type="password"
          id="password"
          placeholder="••••••••"
          required
        >
      </label>

      <button type="submit">Log in</button>
    </form>

    <p class="auth-switch">
      No account yet?
      <a href="#register">Create one</a>
    </p>
  `

  const form = container.querySelector('#loginForm')

  form.addEventListener('submit', async (event) => {
    event.preventDefault()

    const identifier = container.querySelector('#identifier').value.trim()
    const password = container.querySelector('#password').value

    try {
      const res = await apiLogin(identifier, password)
      // Store the authenticated user in global state.
      setStateKey('currentUser', res.user)
      // Navigation to feed is handled by main.js on state change.
    } catch (err) {
      console.error('[LOGIN] Failed:', err)
      alert('Invalid credentials, please try again.')
    }
  })
}

// Render the registration form and attach its behaviour.
function renderRegister(container) {
  container.innerHTML = `

    <div class="auth-header">
      <h2 class="form-title">Create your account</h2>
      <p class="form-subtitle">Join the real-time forum and start posting.</p>
    </div>
   
    <form id="registerForm" class="auth-form">

        <input type="text" id="nickname" placeholder="Nickname" required>

        <input type="number" id="age" placeholder="Age +18" required>

        <input type="text" id="gender" placeholder="Gender" required>

        <input type="text" id="first" placeholder="First name" required>

        <input type="text" id="last" placeholder="Last name" required>

        <input type="email" id="email" placeholder="Email" required>

        <input type="password" id="password" placeholder="Password" maxlength="15" required>

        <button type="submit">Create account</button>
    </form>

    <p class="auth-switch">
        Already registered? <a href="#/login">Log in</a>
    </p>
`

  const form = container.querySelector('#registerForm')

  form.addEventListener('submit', async (event) => {
    event.preventDefault()

    const data = {
      nickname: container.querySelector('#nickname').value.trim(),
      age: Number(container.querySelector('#age').value),
      gender: container.querySelector('#gender').value.trim(),
      first_name: container.querySelector('#first').value.trim(),
      last_name: container.querySelector('#last').value.trim(),
      email: container.querySelector('#email').value.trim(),
      password: container.querySelector('#password').value,
    }

    try {
      await apiRegister(data)
      alert('Account created successfully. You can now log in.')
      // Use router helper to move back to the login view.
      navigateTo('login')
    } catch (err) {
      console.error('[REGISTER] Failed:', err)
      alert('Registration failed. Please check the fields and try again.')
    }
  })
}

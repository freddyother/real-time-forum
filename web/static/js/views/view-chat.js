// Renders the chat sidebar shown on the right-hand side.
export function renderChatSidebar(root) {
  const box = document.createElement('aside')
  box.className = 'chat-sidebar'
  box.innerHTML = `<p>Chat sidebar (coming soon)</p>`
  root.appendChild(box)
}

// Renders the main chat area for a specific user.
export function renderChatView(root, userId) {
  const container = document.createElement('section')
  container.className = 'chat-view'

  container.innerHTML = `
    <h2>Chat with user ${userId}</h2>
    <p>Chat view is under construction.</p>
  `

  root.appendChild(container)
}

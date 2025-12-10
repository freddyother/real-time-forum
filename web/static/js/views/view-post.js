// Renders a simple placeholder for an individual post.
// This keeps the router happy while we focus on auth and feed.
export function renderPostView(root, postId) {
  const container = document.createElement('section')
  container.className = 'post-view'

  container.innerHTML = `
    <h2>Post ${postId}</h2>
    <p>This view is under construction.</p>
  `

  root.appendChild(container)
}

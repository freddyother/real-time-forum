// Renders a single post card used in the feed.
// onClick is called when the user clicks the card.
export function renderPostCard(post, onClick) {
  const card = document.createElement('article')
  card.className = 'post-card'

  // Basic safe values
  const title = post.title || 'Untitled'
  const author = post.author || 'Unknown'
  const category = post.category || 'General'

  const created = post.created_at ? new Date(post.created_at).toLocaleString() : ''

  // Simple content preview
  const snippet = (post.content || '').length > 160 ? post.content.slice(0, 160) + '…' : post.content || ''

  card.innerHTML = `
    <header class="post-card-header">
      <h3 class="post-title">${title}</h3>
      <span class="post-category">${category}</span>
    </header>
  
    <footer class="post-meta">
      <span>by <strong>${author}</strong></span>
      ${created ? `<span> • ${created}</span>` : ''}
    </footer>
  `

  if (onClick) {
    card.addEventListener('click', onClick)
  }

  return card
}

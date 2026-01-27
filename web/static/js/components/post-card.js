// Renders a single post card used in the feed.
// onClick is called when the user clicks the card.
import { apiTogglePostReaction } from '../api.js'

export function renderPostCard(post, onClick) {
  const card = document.createElement('article')
  card.className = 'post-card'

  // Basic safe values
  const title = post.title || 'Untitled'
  const author = post.author || 'Unknown'
  const category = post.category || 'General'

  const created = post.created_at ? new Date(post.created_at).toLocaleString() : ''

  // Reactions (server-driven)
  const postId = Number(post.id || 0) || 0
  const reactionsCount = Number(post.reactions_count ?? post.likes_count ?? 0) || 0
  const iReacted = Boolean(post.i_reacted ?? post.i_liked ?? false)

  card.innerHTML = `
  <header class="post-card-header">
    <h3 class="post-title">${title}</h3>
    <span class="post-category">${category}</span>
  </header>

  <footer class="post-meta">
    <div class="post-meta-left">
      <span>by <strong>${author}</strong></span>
      ${created ? `<span> • ${created}</span>` : ''}
    </div>

    <button
      class="reaction-btn ${iReacted ? 'reacted' : ''}"
      type="button"
      data-post-id="${postId || ''}"
      aria-label="React to post"
      title="Like"
    >
      <span class="reaction-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" class="heart" focusable="false" aria-hidden="true">
          <path d="M12 21s-7.2-4.6-9.7-8.7C.6 9.1 1.9 5.9 4.9 5.1c1.7-.5 3.5.1 4.6 1.5L12 9.1l2.5-2.5c1.1-1.4 2.9-2 4.6-1.5 3 .8 4.3 4 2.6 7.2C19.2 16.4 12 21 12 21z"/>
        </svg>
      </span>
      <span class="reaction-text">${iReacted ? 'Liked' : 'Like'}</span>
      <span class="reaction-dot">·</span>
      <span class="reaction-count">${reactionsCount}</span>
    </button>
  </footer>
`

  // Card click (open post)
  if (onClick) {
    card.addEventListener('click', onClick)
  }

  // Reaction click (do not trigger card navigation)
  const reactionBtn = card.querySelector('.reaction-btn')
  if (reactionBtn) {
    reactionBtn.addEventListener('click', async (e) => {
      e.preventDefault()
      e.stopPropagation()

      if (!postId) return

      const countEl = reactionBtn.querySelector('.reaction-count')
      const textEl = reactionBtn.querySelector('.reaction-text')

      const currentCount = Number(countEl?.textContent || 0) || 0
      const wasOn = reactionBtn.classList.contains('reacted')

      // --- Optimistic UI ---
      reactionBtn.disabled = true
      reactionBtn.classList.toggle('reacted', !wasOn)
      if (textEl) textEl.textContent = !wasOn ? 'Liked' : 'Like'
      if (countEl) countEl.textContent = String(!wasOn ? currentCount + 1 : Math.max(0, currentCount - 1))

      try {
        // Ask server to toggle reaction and return authoritative count.
        const res = await apiTogglePostReaction(postId, 'like')
        // res: { reacted, reactions_count }
        if (res && typeof res.reactions_count === 'number' && countEl) countEl.textContent = String(res.reactions_count)
        if (res && typeof res.reacted === 'boolean') {
          reactionBtn.classList.toggle('reacted', res.reacted)
          if (textEl) textEl.textContent = res.reacted ? 'Liked' : 'Like'
        }
      } catch (err) {
        console.error('[REACTION] Toggle failed:', err)

        // --- Rollback UI on failure ---
        reactionBtn.classList.toggle('reacted', wasOn)
        if (textEl) textEl.textContent = wasOn ? 'Liked' : 'Like'
        if (countEl) countEl.textContent = String(currentCount)

        alert('Could not react to this post. Please try again.')
      } finally {
        reactionBtn.disabled = false
      }
    })
  }

  return card
}

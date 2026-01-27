// Post Card Detail
// web/static/js/views/view-post.js

import { apiGetPost, apiAddComment, apiTogglePostReaction } from '../api.js'
import { navigateTo } from '../router.js'

export async function renderPostView(root, postId) {
  const container = document.createElement('div')
  container.className = 'post-page'
  container.innerHTML = `<p>Loading post…</p>`
  root.appendChild(container)

  let data
  try {
    data = await apiGetPost(postId)
  } catch (err) {
    console.error('Failed to load post:', err)
    container.innerHTML = `<p>Could not load this post.</p>`
    return
  }

  const post = data.post
  const comments = data.comments || []

  // Reactions (server-driven if present; fallback safe)
  const pid = Number(post.id || 0) || 0
  const reactionsCount = Number(post.reactions_count ?? post.likes_count ?? 0) || 0
  const iReacted = Boolean(post.i_reacted ?? post.i_liked ?? false)

  // Date formatting (keep your original if you prefer raw)
  const created = post.created_at ? new Date(post.created_at).toLocaleString() : ''

  container.innerHTML = `
    <div class="post-back" id="backToFeed">← Back to Feed</div>

    <div class="post-page-card">
      <!-- LINE 1: title + category -->
      <header class="post-page-header">
        <h1 class="post-page-title">${post.title || 'Untitled'}</h1>
        <span class="post-page-category">${post.category || 'General'}</span>
      </header>

      <!-- LINE 2: by/date (left) + reactions (right) -->
      <footer class="post-page-meta">
        <div class="post-meta-left">
          <span>by <strong>${post.author || 'Unknown'}</strong></span>
          ${created ? `<span>•</span><span>${created}</span>` : ''}
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

      <article class="post-page-content">
        ${post.content || ''}
      </article>

      <section class="post-comments">
        <h2 class="comments-title">Comments (${comments.length})</h2>

        <div class="comments-list"></div>

        <form id="commentForm" class="comment-form">
          <textarea
            id="commentText"
            placeholder="Write a reply…"
            required
          ></textarea>
          <button type="submit">Add comment</button>
        </form>
      </section>
    </div>
  `

  // ---- COMMENTS ----
  const listEl = container.querySelector('.comments-list')

  function appendComment(c) {
    const item = document.createElement('div')
    item.className = 'comment-item'
    item.innerHTML = `
      <div class="comment-avatar">
        ${c.author ? c.author.charAt(0).toUpperCase() : '?'}
      </div>
      <div class="comment-body">
        <div class="comment-header">
          <span class="comment-author">${c.author || 'Unknown'}</span>
          <span class="comment-date">${c.created_at || ''}</span>
        </div>
        <p class="comment-text">${c.content || ''}</p>
      </div>
    `
    listEl.appendChild(item)
  }

  comments.forEach(appendComment)

  // ---- BACK ----
  const backBtn = container.querySelector('#backToFeed')
  backBtn.addEventListener('click', () => navigateTo('feed'))

  // ---- ADD COMMENT ----
  const form = container.querySelector('#commentForm')
  const textarea = container.querySelector('#commentText')

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const content = textarea.value.trim()
    if (!content) return

    try {
      const { comment } = await apiAddComment(post.id, content)
      appendComment(comment)
      textarea.value = ''

      const titleEl = container.querySelector('.comments-title')
      const current = listEl.children.length
      titleEl.textContent = `Comments (${current})`
    } catch (err) {
      console.error('Failed to add comment:', err)
      alert('Could not add comment. Please try again.')
    }
  })

  // ---- REACTION TOGGLE (same behavior as feed) ----
  const reactionBtn = container.querySelector('.reaction-btn')
  if (reactionBtn) {
    reactionBtn.addEventListener('click', async (e) => {
      e.preventDefault()
      e.stopPropagation()

      if (!pid) return

      const countEl = reactionBtn.querySelector('.reaction-count')
      const textEl = reactionBtn.querySelector('.reaction-text')

      const currentCount = Number(countEl?.textContent || 0) || 0
      const wasOn = reactionBtn.classList.contains('reacted')

      // optimistic UI
      reactionBtn.disabled = true
      if (wasOn) {
        reactionBtn.classList.remove('reacted')
        if (textEl) textEl.textContent = 'Like'
        if (countEl) countEl.textContent = String(Math.max(0, currentCount - 1))
      } else {
        reactionBtn.classList.add('reacted')
        if (textEl) textEl.textContent = 'Liked'
        if (countEl) countEl.textContent = String(currentCount + 1)
      }

      try {
        const res = await apiTogglePostReaction(pid, 'like')
        if (res && typeof res.reactions_count === 'number' && countEl) {
          countEl.textContent = String(res.reactions_count)
        }
        if (res && typeof res.reacted === 'boolean') {
          reactionBtn.classList.toggle('reacted', res.reacted)
          if (textEl) textEl.textContent = res.reacted ? 'Liked' : 'Like'
        }
      } catch (err) {
        console.error('[REACTION] Toggle failed:', err)

        // rollback
        reactionBtn.classList.toggle('reacted', wasOn)
        if (textEl) textEl.textContent = wasOn ? 'Liked' : 'Like'
        if (countEl) countEl.textContent = String(currentCount)

        alert('Could not react to this post. Please try again.')
      } finally {
        reactionBtn.disabled = false
      }
    })
  }
}

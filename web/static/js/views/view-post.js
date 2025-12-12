// Renders a simple placeholder for an individual post.

// web/static/js/views/view-post.js

import { apiGetPost, apiAddComment } from '../api.js'
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

  container.innerHTML = `
    <!-- Botón back -->
    <div class="post-back" id="backToFeed">← Back to Feed</div>

    <div class="post-page-card">
      <header class="post-page-header">
        <h1 class="post-page-title">${post.title}</h1>
        <span class="post-page-category">${post.category}</span>
      </header>

      <div class="post-page-meta">
        <span>by ${post.author}</span>
        <span>•</span>
        <span>${post.created_at}</span>
      </div>

      <article class="post-page-content">
        ${post.content}
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
          <span class="comment-author">${c.author}</span>
          <span class="comment-date">${c.created_at}</span>
        </div>
        <p class="comment-text">${c.content}</p>
      </div>
    `
    listEl.appendChild(item)
  }

  // Paint initial comments
  comments.forEach(appendComment)

  // Back a feed
  const backBtn = container.querySelector('#backToFeed')
  backBtn.addEventListener('click', () => {
    navigateTo('feed')
  })

  // Handle sending new comment
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

      // update title counter
      const titleEl = container.querySelector('.comments-title')
      const current = listEl.children.length
      titleEl.textContent = `Comments (${current})`
    } catch (err) {
      console.error('Failed to add comment:', err)
      alert('Could not add comment. Please try again.')
    }
  })
}

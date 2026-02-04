// web/static/js/views/view-post.js

import { apiGetPost, apiAddComment, apiTogglePostReaction, apiRegisterPostView, apiUpdatePost, apiUpdateComment } from '../api.js'
import { navigateTo } from '../router.js'
import { getState } from '../state.js'

export async function renderPostView(root, postId) {
  function escapeHtml(str) {
    return String(str).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')
  }

  root.innerHTML = ''

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

  const me = getState().currentUser
  const isOwner = Boolean(me && Number(me.id) === Number(post?.user_id))

  // Reactions
  const pid = Number(post?.id || 0) || 0
  const reactionsCount = Number(post?.reactions_count ?? post?.likes_count ?? 0) || 0
  const iReacted = Boolean(post?.i_reacted ?? post?.i_liked ?? false)

  // Views (ONLY in detail)
  const initialViews = Number(post?.views_count ?? 0) || 0

  // Date formatting
  const created = post?.created_at ? new Date(post.created_at).toLocaleString() : ''

  container.innerHTML = `
    <div class="post-back" id="backToFeed">← Back to Feed</div>

    <div class="post-page-card">
      <header class="post-page-header">
        <div class="post-title-wrap">
          <h1 class="post-page-title" id="postTitle">${escapeHtml(post?.title || 'Untitled')}</h1>
        </div>

        <div class="post-header-right">
          <span class="post-page-category" id="postCategory">${escapeHtml(post?.category || 'General')}</span>

          ${
            isOwner
              ? `
            <button class="post-menu-btn" id="postMenuBtn" type="button" aria-label="Post options">⋯</button>
            <div class="post-menu" id="postMenu" style="display:none">
              <button type="button" class="post-menu-item" id="editPostBtn">Edit</button>
            </div>
          `
              : ''
          }
        </div>
      </header>

      <footer class="post-page-meta">
        <div class="post-meta-left">
          <span>by <strong>${escapeHtml(post?.author || 'Unknown')}</strong></span>
          ${created ? `<span>•</span><span>${escapeHtml(created)}</span>` : ''}
        </div>

        <div class="post-meta-right">
          <span class="post-views" id="postViews">👁 ${initialViews} views</span>

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
        </div>
      </footer>

      <article class="post-page-content">
        ${post?.content || ''}
      </article>

      <section class="post-comments">
        <h2 class="comments-title">Comments (${comments.length})</h2>
        <div class="comments-list"></div>

        <form id="commentForm" class="comment-form">
          <textarea id="commentText" placeholder="Write a reply…" required></textarea>
          <button type="submit">Add comment</button>
        </form>
      </section>
    </div>
  `

  // ✅ Register view
  if (pid) {
    try {
      const res = await apiRegisterPostView(pid)
      const viewsEl = container.querySelector('#postViews')
      if (viewsEl && res && typeof res.views_count === 'number') {
        viewsEl.textContent = `👁 ${res.views_count} views`
      }
    } catch (err) {
      console.warn('[VIEWS] could not register view:', err)
    }
  }

  // ✅ EDIT POST (only owner)
  if (isOwner) {
    const menuBtn = container.querySelector('#postMenuBtn')
    const menu = container.querySelector('#postMenu')
    const editBtn = container.querySelector('#editPostBtn')

    const titleEl = container.querySelector('#postTitle')
    const contentEl = container.querySelector('.post-page-content')
    const categoryEl = container.querySelector('#postCategory')

    function closeMenu() {
      if (menu) menu.style.display = 'none'
    }

    menuBtn?.addEventListener('click', (e) => {
      e.stopPropagation()
      menu.style.display = menu.style.display === 'none' ? 'block' : 'none'
    })

    document.addEventListener('click', closeMenu)

    editBtn?.addEventListener('click', async () => {
      closeMenu()

      const prevTitle = post?.title || ''
      const prevContent = post?.content || ''
      const prevCategory = post?.category || 'General'

      // ⚠️ input value needs escaping, textarea content NOT
      titleEl.outerHTML = `<input id="postTitleInput" class="post-edit-title" value="${escapeHtml(prevTitle)}" />`
      contentEl.outerHTML = `<textarea id="postContentInput" class="post-edit-content"></textarea>`
      categoryEl.outerHTML = `<input id="postCategoryInput" class="post-edit-category" value="${escapeHtml(prevCategory)}" />`

      container.querySelector('#postContentInput').value = prevContent

      const metaRight = container.querySelector('.post-meta-right')
      const actions = document.createElement('div')
      actions.className = 'post-edit-actions'
      actions.innerHTML = `
        <button type="button" class="nav-btn" id="savePostEdit">Save</button>
        <button type="button" class="nav-btn" id="cancelPostEdit">Cancel</button>
      `
      metaRight?.appendChild(actions)

      const titleInput = container.querySelector('#postTitleInput')
      const contentInput = container.querySelector('#postContentInput')
      const categoryInput = container.querySelector('#postCategoryInput')

      container.querySelector('#cancelPostEdit')?.addEventListener('click', () => {
        navigateTo(`post/${pid}`)
      })

      container.querySelector('#savePostEdit')?.addEventListener('click', async () => {
        const nextTitle = titleInput.value.trim()
        const nextContent = contentInput.value.trim()
        const nextCategory = categoryInput.value.trim()

        if (!nextTitle || !nextContent) {
          alert('Title and content are required.')
          return
        }

        try {
          await apiUpdatePost(pid, { title: nextTitle, content: nextContent, category: nextCategory })
          navigateTo(`post/${pid}`)
        } catch (err) {
          console.error('[POST] update failed:', err)
          alert('Could not update post. Please try again.')
        }
      })
    })
  }

  // ---- COMMENTS ----
  const listEl = container.querySelector('.comments-list')

  function appendComment(c) {
    const me = getState().currentUser
    const isMine = Boolean(me && Number(me.id) === Number(c.user_id))

    const item = document.createElement('div')
    item.className = 'comment-item'
    item.dataset.commentId = c.id

    item.innerHTML = `
      <div class="comment-avatar">
        ${c.author ? escapeHtml(c.author.charAt(0).toUpperCase()) : '?'}
      </div>
      <div class="comment-body">
        <div class="comment-header">
          <span class="comment-author">${escapeHtml(c.author || 'Unknown')}</span>
          <span class="comment-date">${escapeHtml(c.created_at || '')}</span>
          ${isMine ? `<button type="button" class="comment-edit-btn">Edit</button>` : ``}
        </div>
        <p class="comment-text">${escapeHtml(c.content || '')}</p>
      </div>
    `

    const editBtn = item.querySelector('.comment-edit-btn')
    if (editBtn) {
      editBtn.addEventListener('click', async () => {
        const p = item.querySelector('.comment-text')
        const old = p.textContent

        p.outerHTML = `
          <div class="comment-edit-wrap">
            <textarea class="comment-edit-input"></textarea>
            <div class="comment-edit-actions">
              <button type="button" class="nav-btn comment-save">Save</button>
              <button type="button" class="nav-btn comment-cancel">Cancel</button>
            </div>
          </div>
        `

        const wrap = item.querySelector('.comment-edit-wrap')
        const input = wrap.querySelector('.comment-edit-input')
        input.value = old

        wrap.querySelector('.comment-cancel').addEventListener('click', () => {
          wrap.outerHTML = `<p class="comment-text">${escapeHtml(old)}</p>`
        })

        wrap.querySelector('.comment-save').addEventListener('click', async () => {
          const next = input.value.trim()
          if (!next) return

          try {
            const res = await apiUpdateComment(Number(c.id), next)
            const updated = res?.comment
            wrap.outerHTML = `<p class="comment-text">${escapeHtml(updated?.content ?? next)}</p>`
          } catch (err) {
            console.error('[COMMENT] update failed:', err)
            alert('Could not update comment.')
          }
        })
      })
    }

    listEl.appendChild(item)
  }

  comments.forEach(appendComment)

  // ---- BACK ----
  container.querySelector('#backToFeed')?.addEventListener('click', () => navigateTo('feed'))

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
      titleEl.textContent = `Comments (${listEl.children.length})`
    } catch (err) {
      console.error('Failed to add comment:', err)
      alert('Could not add comment. Please try again.')
    }
  })

  // ---- REACTION TOGGLE ----
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

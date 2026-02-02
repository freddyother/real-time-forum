// web/static/js/views/view-feed.js

import { apiGetPosts } from '../api.js'
import { getState, setStateKey } from '../state.js'
import { renderPostCard } from '../components/post-card.js'
import { navigateTo } from '../router.js'

const PAGE_SIZE = 10

export async function renderFeedView(root) {
  root.innerHTML = ''

  const list = document.createElement('div')
  list.className = 'feed-list'
  root.appendChild(list)

  // Load more wrapper
  const loadMoreWrap = document.createElement('div')
  loadMoreWrap.className = 'feed-load-more'

  const loadMoreBtn = document.createElement('button')
  loadMoreBtn.type = 'button'
  loadMoreBtn.className = 'nav-btn'
  loadMoreBtn.textContent = 'Load more'

  loadMoreWrap.appendChild(loadMoreBtn)
  root.appendChild(loadMoreWrap)

  let offset = 0
  let hasMore = true
  let loading = false

  function hideLoadMore() {
    loadMoreWrap.style.display = 'none'
  }

  function showLoadMore() {
    loadMoreWrap.style.display = 'flex'
  }

  function setLoading(on) {
    loading = Boolean(on)
    loadMoreBtn.disabled = loading
    loadMoreBtn.textContent = loading ? 'Loading…' : 'Load more'
  }

  function appendPosts(posts) {
    posts.forEach((p) => {
      const card = renderPostCard(p, () => navigateTo(`post/${p.id}`))
      list.appendChild(card)
    })
  }

  async function loadPage() {
    if (!hasMore || loading) return
    setLoading(true)

    try {
      const res = await apiGetPosts(PAGE_SIZE, offset)
      const newPosts = Array.isArray(res?.posts) ? res.posts : []

      // first page + empty
      if (offset === 0 && newPosts.length === 0) {
        list.innerHTML = `<p class="feed-empty">No posts yet. Be the first to create one!</p>`
        hideLoadMore()
        return
      }

      appendPosts(newPosts)

      // update state.posts (append)
      const prev = Array.isArray(getState().posts) ? getState().posts : []
      setStateKey('posts', [...prev, ...newPosts])

      // update pagination
      offset = typeof res?.nextOffset === 'number' ? res.nextOffset : offset + newPosts.length
      hasMore = Boolean(res?.hasMore)

      if (!hasMore) hideLoadMore()
      else showLoadMore()
    } catch (err) {
      console.error('[FEED] Failed to load posts:', err)
      if (offset === 0) {
        list.innerHTML = `<p class="feed-empty">Could not load posts. Please try again.</p>`
        hideLoadMore()
      } else {
        alert('Could not load more posts. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  loadMoreBtn.addEventListener('click', loadPage)

  // Initial load
  await loadPage()
}

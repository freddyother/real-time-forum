import { apiGetPosts } from '../api.js'
import { setStateKey } from '../state.js'
import { renderPostCard } from '../components/post-card.js'
import { navigateTo } from '../router.js'

// Render the main feed with a list of posts.
export async function renderFeedView(root) {
  // Clean root container
  root.innerHTML = ''

  const list = document.createElement('div')
  list.className = 'feed-list'
  root.appendChild(list)

  let posts = []
  try {
    posts = await apiGetPosts()
    setStateKey('posts', posts)
  } catch (err) {
    console.error('[FEED] Failed to load posts:', err)
    list.innerHTML = `<p class="feed-empty">Could not load posts. Please try again.</p>`
    return
  }

  if (!posts.length) {
    list.innerHTML = `<p>No posts yet. Be the first to create one!</p>`
    return
  }

  posts.forEach((p) => {
    const card = renderPostCard(p, () => navigateTo(`post/${p.id}`))
    list.appendChild(card)
  })
}

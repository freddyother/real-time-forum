import { apiGetPosts } from '../api.js'
import { setStateKey } from '../state.js'
import { renderPostCard } from '../components/post-card.js'
import { navigateTo } from '../router.js'

export async function renderFeedView(root) {
  // Load posts from the API.
  const posts = await apiGetPosts()
  console.log('[FEED] posts from API:', posts)

  setStateKey('posts', posts)

  const list = document.createElement('div')
  list.className = 'feed-list'

  if (posts.length === 0) {
    list.innerHTML = `<p>No posts yet. Be the first to create one!</p>`
  } else {
    posts.forEach((p) => {
      const card = renderPostCard(p, () => navigateTo(`post/${p.id}`))
      list.appendChild(card)
    })
  }

  root.appendChild(list)
}

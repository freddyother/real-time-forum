import { apiGetPosts } from '../api.js'
import { setStateKey } from '../state.js'
import { renderPostCard } from '../components/post-card.js'
import { navigateTo } from '../router.js'

export async function renderFeedView(root) {
  const posts = await apiGetPosts()
  setStateKey('posts', posts)

  const list = document.createElement('div')
  list.className = 'feed-list'

  posts.forEach((p) => {
    const card = renderPostCard(p, () => navigateTo(`post/${p.id}`))
    list.appendChild(card)
  })

  root.appendChild(list)
}

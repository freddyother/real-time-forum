export function renderPostCard(post, onClick) {
  const card = document.createElement('article')
  card.className = 'post-card'
  card.addEventListener('click', onClick)

  card.innerHTML = `
      <h2>${post.title}</h2>
      <p>${post.content.slice(0, 120)}...</p>
      <div class="post-meta">
        <span>${post.author}</span>
        <span>${new Date(post.createdAt).toLocaleString()}</span>
      </div>
    `

  return card
}

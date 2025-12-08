const BASE_URL = '/api'

async function request(path, options = {}) {
  const res = await fetch(BASE_URL + path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Request failed')
  }

  if (res.status === 204) return null
  return res.json()
}

export function apiRegister(data) {
  return request('/register', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function apiLogin(identifier, password) {
  return request('/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password }),
  })
}

export function apiLogout() {
  return request('/logout', { method: 'POST' })
}

export function apiGetPosts() {
  return request('/posts')
}

export function apiGetPost(id) {
  return request(`/posts/${id}`)
}

export function apiCreatePost(data) {
  return request('/posts', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function apiAddComment(postId, data) {
  return request(`/posts/${postId}/comments`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function apiGetChatHistory(userId, offset, limit = 10) {
  return request(`/chat/${userId}?offset=${offset}&limit=${limit}`)
}

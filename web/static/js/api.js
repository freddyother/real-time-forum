const BASE_URL = '/api'

// Helper for JSON-based API requests with basic logging.
async function request(path, options = {}) {
  const method = options.method || 'GET'

  const res = await fetch(BASE_URL + path, {
    credentials: 'include', // include cookies for sessions
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  })

  // Read raw body once (it may be empty).
  const text = await res.text()

  // Log every response for debugging purposes.
  console.log(`[API] ${method} ${BASE_URL + path} -> ${res.status}`, text || '(empty body)')

  // No content (e.g. 204).
  if (res.status === 204) {
    if (!res.ok) {
      throw new Error('Request failed with status ' + res.status)
    }
    return null
  }

  // Try to parse JSON if there is a body.
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      // If JSON parsing fails and status is not ok, treat as error.
      if (!res.ok) {
        throw new Error('Request failed (invalid JSON response)')
      }
      // For successful non-JSON responses, return raw text.
      return text
    }
  }

  if (!res.ok) {
    const message = (data && data.error) || 'Request failed'
    throw new Error(message)
  }

  return data
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

// Fetch list of posts and always return an array.
export async function apiGetPosts() {
  const data = await request('/posts')
  const posts = Array.isArray(data.posts) ? data.posts : []

  console.log('[API] apiGetPosts -> posts length:', posts.length)
  return posts
}

export function apiGetPost(id) {
  return request(`/posts/${id}`)
}

export async function apiCreatePost(data) {
  const res = await request('/posts', {
    method: 'POST',
    body: JSON.stringify(data),
  })

  console.log('[API] apiCreatePost -> created post id:', res.post?.id)
  return res.post
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

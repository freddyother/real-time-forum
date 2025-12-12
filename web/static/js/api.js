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

//---------Get Post by Id---------------------------------------
export async function apiGetPost(id) {
  const res = await fetch(`/api/posts/${id}`)
  if (!res.ok) {
    throw new Error(`apiGetPost failed: ${res.status}`)
  }
  return res.json() // { post, comments }
}

//---------Create Post---------------------------------------
export async function apiCreatePost(data) {
  const res = await request('/posts', {
    method: 'POST',
    body: JSON.stringify(data),
  })

  console.log('[API] apiCreatePost -> created post id:', res.post?.id)
  return res.post
}
//---------Get comments---------------------------------------
export async function apiGetComments(id) {
  const res = await fetch(`/api/posts/${id}/comments`)
  if (!res.ok) {
    throw new Error(`apiGetComments failed: ${res.status}`)
  }
  return res.json() // { comments }
}

//---------Add comment to a Post ---------------------------------------
export async function apiAddComment(postId, content) {
  const res = await fetch(`/api/posts/${postId}/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content }),
  })

  if (!res.ok) {
    throw new Error(`apiAddComment failed: ${res.status}`)
  }

  return res.json() // { comment }
}

export function apiGetChatHistory(userId, offset, limit = 10) {
  return request(`/chat/${userId}?offset=${offset}&limit=${limit}`)
}

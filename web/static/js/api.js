// web/static/js/api.js
import { setStateKey } from './state.js'
import { disableWS } from './ws-chat.js'

const BASE_URL = '/api'

// Helper for JSON-based API requests with basic logging + 401-safe.
async function request(path, options = {}) {
  const method = options.method || 'GET'

  const res = await fetch(BASE_URL + path, {
    credentials: 'include', // include cookies for sessions
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })

  // ✅ 401: session expired / logged out -> clean logout (NO spam, NO JSON parse)
  if (res.status === 401) {
    console.warn(`[API] ${method} ${BASE_URL + path} -> 401 (unauthorised)`)
    try {
      disableWS()
    } catch (_) {}
    // this will trigger your router redirect to login
    try {
      setStateKey('currentUser', null)
    } catch (_) {}
    return null
  }

  // Read raw body once (it may be empty).
  const text = await res.text().catch(() => '')

  // Log every response for debugging purposes.
  console.log(`[API] ${method} ${BASE_URL + path} -> ${res.status}`, text || '(empty body)')

  // No content (e.g. 204).
  if (res.status === 204) {
    if (!res.ok) throw new Error('Request failed with status ' + res.status)
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
  const posts = Array.isArray(data?.posts) ? data.posts : []
  console.log('[API] apiGetPosts -> posts length:', posts.length)
  return posts
}

//---------Get Post by Id---------------------------------------
export async function apiGetPost(id) {
  const data = await request(`/posts/${id}`)
  // data is { post, comments } or null if 401
  return data || { post: null, comments: [] }
}

//---------Create Post---------------------------------------
export async function apiCreatePost(data) {
  const res = await request('/posts', {
    method: 'POST',
    body: JSON.stringify(data),
  })

  // if 401 -> null
  if (!res) return null

  console.log('[API] apiCreatePost -> created post id:', res.post?.id)
  return res.post
}

//---------Get comments---------------------------------------
export async function apiGetComments(id) {
  const data = await request(`/posts/${id}/comments`)
  // data is { comments } or null if 401
  return data || { comments: [] }
}

//---------Add comment to a Post ---------------------------------------
export async function apiAddComment(postId, content) {
  const data = await request(`/posts/${postId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  })
  // data is { comment } or null if 401
  return data
}

// (si ya no lo usas, puedes borrarlo; lo dejo tal cual)
export function apiGetChatHistory(userId, offset, limit = 10) {
  return request(`/chat/${userId}?offset=${offset}&limit=${limit}`)
}

// GET /api/messages/{otherUserId}?offset=0&limit=20
export async function apiGetMessages(otherUserId, offset = 0, limit = 20) {
  const data = await request(`/messages/${otherUserId}?offset=${offset}&limit=${limit}`)
  // data is { messages: [...] } or null if 401
  return data || { messages: [] }
}

// POST /api/messages/{otherUserId} { content: "..." }
export async function apiSendMessage(otherUserId, content) {
  const data = await request(`/messages/${otherUserId}`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  })
  // data is { message: {...} } or null if 401
  return data
}

// Returns the user array.
export async function apiGetUsers(limit = 50) {
  const data = await request(`/users?limit=${limit}`)
  // 401 -> null => []
  return Array.isArray(data?.users) ? data.users : []
}

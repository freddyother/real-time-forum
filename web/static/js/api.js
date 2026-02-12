// web/static/js/api.js

import { getState, setStateKey } from './state.js'
import { disableWS } from './ws-chat.js'

const BASE_URL = '/api'

// Avoid handling the same "session expired" event multiple times.
let handledUnauthOnce = false

function handleUnauthorisedOnce(method, path) {
  const state = getState()
  const wasLoggedIn = Boolean(state.currentUser)

  // If we are already logged out, do nothing (401 can happen while leaving the app).
  if (!wasLoggedIn) return

  // If we already handled the unauthorised state once, do not spam state changes.
  if (handledUnauthOnce) return
  handledUnauthOnce = true

  console.warn(`[API] ${method} ${BASE_URL + path} -> 401 (unauthorised). Clearing session locally...`)

  try {
    disableWS()
  } catch (_) {}

  // Trigger logout flow (main.js reacts to currentUser change).
  try {
    setStateKey('currentUser', null)
  } catch (_) {}
}

// Helper for JSON-based API requests with basic logging.
async function request(path, options = {}) {
  const method = options.method || 'GET'

  let res
  try {
    res = await fetch(BASE_URL + path, {
      credentials: 'include', // include cookies for sessions
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      signal: options.signal, // ✅ correct place (NOT inside headers)
      ...options,
    })
  } catch (err) {
    // ✅ AbortController: ignore silently (expected during logout / rerenders)
    if (err && (err.name === 'AbortError' || err.code === 20)) {
      return null
    }
    throw err
  }

  // 401: session expired / logged out
  if (res.status === 401) {
    handleUnauthorisedOnce(method, path)
    return null
  }

  // Read raw body once (it may be empty).
  const text = await res.text().catch(() => '')

  console.log(`[API] ${method} ${BASE_URL + path} -> ${res.status}`, text ? '(body)' : '(empty body)')

  // No content (e.g. 204).
  if (res.status === 204) {
    if (!res.ok) {
      const err = new Error('Request failed with status ' + res.status)
      err.status = res.status
      throw err
    }
    return null
  }

  // Try to parse JSON if there is a body.
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      if (!res.ok) {
        const err = new Error('Request failed (invalid JSON response)')
        err.status = res.status
        throw err
      }
      return text
    }
  }

  if (!res.ok) {
    const message = (data && data.error) || 'Request failed'
    const err = new Error(message)
    err.status = res.status
    throw err
  }

  return data
}

export function apiRegister(data) {
  return request('/register', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function apiLogin(identifier, password) {
  // On successful login, allow future 401 handling again.
  const res = await request('/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password }),
  })

  if (res && res.user) {
    handledUnauthOnce = false
  }

  return res
}

export function apiLogout() {
  return request('/logout', { method: 'POST' })
}

// Fetch paginated posts: GET /api/posts?limit=10&offset=0
// Returns: { posts: [], has_more: boolean, next_offset: number }
export async function apiGetPosts(limit = 10, offset = 0) {
  const data = await request(`/posts?limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`)

  const posts = Array.isArray(data?.posts) ? data.posts : []
  const hasMore = Boolean(data?.has_more)
  const nextOffset = typeof data?.next_offset === 'number' ? data.next_offset : offset + posts.length

  console.log('[API] apiGetPosts -> posts:', posts.length, 'has_more:', hasMore, 'next_offset:', nextOffset)

  return { posts, hasMore, nextOffset }
}

export async function apiGetPost(id) {
  const data = await request(`/posts/${id}`)
  return data || { post: null, comments: [] }
}

export async function apiCreatePost(data) {
  const res = await request('/posts', {
    method: 'POST',
    body: JSON.stringify(data),
  })

  if (!res) return null

  console.log('[API] apiCreatePost -> created post id:', res.post?.id)
  return res.post
}

export async function apiGetComments(id) {
  const data = await request(`/posts/${id}/comments`)
  return data || { comments: [] }
}

export async function apiAddComment(postId, content) {
  const data = await request(`/posts/${postId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  })
  return data
}

export function apiGetChatHistory(userId, offset, limit = 10) {
  return request(`/chat/${userId}?offset=${offset}&limit=${limit}`)
}

// GET /api/messages/{otherUserId}?limit=10&before=123
// Returns: { messages: [], has_more: boolean, next_before: number }
export async function apiGetMessages(otherUserId, before = 0, limit = 10, signal = null) {
  const qs = new URLSearchParams()
  qs.set('limit', String(limit))
  if (before && Number(before) > 0) qs.set('before', String(before))

  const url = `/messages/${otherUserId}?${qs.toString()}`
  console.log('[CHAT] apiGetMessages URL:', url) // <-- LOG 1

  const data = await request(url, { signal })
  console.log('[CHAT] apiGetMessages resp keys:', Object.keys(data || {}), 'len=', (data?.messages || []).length) // <-- LOG 1b

  return data || { messages: [], has_more: false, next_before: 0 }
}

// POST /api/messages/{otherUserId} { content: "..." }
export async function apiSendMessage(otherUserId, content) {
  const data = await request(`/messages/${otherUserId}`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  })
  return data
}

// Returns the user array.
export async function apiGetUsers(limit = 50, signal = null) {
  const data = await request(`/users?limit=${limit}`, { signal })
  return Array.isArray(data?.users) ? data.users : []
}
// POST /api/posts/{id}/reactions { reaction: "like" }
export async function apiTogglePostReaction(postId, reaction = 'like') {
  const data = await request(`/posts/${postId}/reactions`, {
    method: 'POST',
    body: JSON.stringify({ reaction }),
  })
  // data: { post_id, reaction, reacted, reactions_count }
  return data
}

// POST /api/posts/{id}/views     View Counter
export async function apiRegisterPostView(postId) {
  const data = await request(`/posts/${postId}/views`, { method: 'POST' })
  return data // { post_id, views_count }
}

//Update Posts
export async function apiUpdatePost(postId, patch) {
  // PATCH /api/posts/{id}
  const data = await request(`/posts/${postId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  return data
}

export async function apiUpdateComment(commentId, content) {
  // PATCH /api/comments/{id}
  const data = await request(`/comments/${commentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ content }),
  })
  return data
}

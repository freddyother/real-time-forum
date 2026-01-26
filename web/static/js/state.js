// web/static/js/state.js

const state = {
  currentUser: null,
  posts: [],
  selectedPost: null,

  // chat
  chatWithUserId: null,
  chatWithUserName: null,

  chatList: [], // [{ userId, username, lastMessageDate, lastMessageSnippet, online }, ...]
  messagesByUser: {}, // { userId: [ ... ] }

  // presence (WS)
  // { [userId]: { online: boolean, lastSeenAt: string|null } }
  presenceByUser: {},
}

// Keyed listeners: { [key]: Set<fn> }
const keyedListeners = Object.create(null)

// Global listeners: Set<fn>
const globalListeners = new Set()

export function initState() {
  // optional: hydrate from localStorage
}

export function getState() {
  return state
}

export function setStateKey(key, value) {
  state[key] = value

  const set = keyedListeners[key]
  if (set) {
    for (const cb of set) {
      try {
        cb(value)
      } catch (e) {
        console.error('[state] listener error for key', key, e)
      }
    }
  }

  notify()
}

/**
 * Patch helpers (useful for nested objects like presenceByUser)
 */
export function patchStateKey(key, partial) {
  const prev = state[key]
  state[key] = { ...(prev && typeof prev === 'object' ? prev : {}), ...(partial || {}) }

  const set = keyedListeners[key]
  if (set) {
    for (const cb of set) {
      try {
        cb(state[key])
      } catch (e) {
        console.error('[state] listener error for key', key, e)
      }
    }
  }

  notify()
}

export function onStateChange(key, cb) {
  if (!keyedListeners[key]) keyedListeners[key] = new Set()
  keyedListeners[key].add(cb)
  return () => keyedListeners[key].delete(cb)
}

export function subscribe(fn) {
  globalListeners.add(fn)
  return () => globalListeners.delete(fn)
}

function notify() {
  for (const fn of globalListeners) {
    try {
      fn()
    } catch (e) {
      console.error('[state] global listener error', e)
    }
  }
}

// ---------------------------
// Presence helpers
// ---------------------------

/**
 * Apply a full snapshot of currently online user IDs.
 * - IDs in snapshot -> online: true
 * - Known users not in snapshot -> online: false
 * Keeps lastSeenAt as-is (server will push presence offline event with last_seen_at when available).
 */
export function setPresenceSnapshot(onlineIds = []) {
  const onlineSet = new Set((onlineIds || []).map((x) => Number(x)))

  const next = { ...state.presenceByUser }

  // Mark everyone we already know accordingly
  for (const key of Object.keys(next)) {
    const uid = Number(key)
    const prev = next[uid] || { online: false, lastSeenAt: null }
    next[uid] = { ...prev, online: onlineSet.has(uid) }
  }

  // Ensure snapshot users exist in map even if we didn't know them yet
  for (const uid of onlineSet) {
    const prev = next[uid] || { online: false, lastSeenAt: null }
    next[uid] = { ...prev, online: true }
  }

  state.presenceByUser = next
  notify()
}

export function setUserPresence(userId, online, lastSeenAt = null) {
  const uid = Number(userId)
  const prev = state.presenceByUser[uid] || { online: false, lastSeenAt: null }

  state.presenceByUser = {
    ...state.presenceByUser,
    [uid]: {
      online: Boolean(online),
      // Keep existing lastSeenAt if new one is null/undefined
      lastSeenAt: lastSeenAt ?? prev.lastSeenAt ?? null,
    },
  }

  notify()
}

export function getUserPresence(userId) {
  const uid = Number(userId)
  return state.presenceByUser[uid] || { online: false, lastSeenAt: null }
}

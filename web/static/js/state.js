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

export function setPresenceSnapshot(onlineIds = []) {
  const next = { ...state.presenceByUser }

  // mark everyone we know as offline first? NO: better only update known ids
  // We'll mark listed ones online and keep others as-is unless later presence says offline.
  for (const id of onlineIds) {
    const uid = Number(id)
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
      lastSeenAt: lastSeenAt ?? prev.lastSeenAt ?? null,
    },
  }

  notify()
}

export function getUserPresence(userId) {
  const uid = Number(userId)
  return state.presenceByUser[uid] || { online: false, lastSeenAt: null }
}

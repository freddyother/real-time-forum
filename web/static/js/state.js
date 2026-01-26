// web/static/js/state.js

const LS_KEY = 'rtf_state_v1'

const state = {
  currentUser: null,
  posts: [],
  selectedPost: null,

  // chat
  chatWithUserId: null,
  chatWithUserName: null,

  chatList: [],
  messagesByUser: {},

  presenceByUser: {},
}

// In-memory persisted store (loaded from localStorage once)
let persisted = {
  lastChatByUser: {}, // { [myUserId]: { chatWithUserId, chatWithUserName } }
}

// Keyed listeners: { [key]: Set<fn> }
const keyedListeners = Object.create(null)

// Global listeners: Set<fn>
const globalListeners = new Set()

export function initState() {
  // Hydrate from localStorage (best-effort)
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return
    const saved = JSON.parse(raw)

    if (saved && typeof saved === 'object') {
      if (saved.lastChatByUser && typeof saved.lastChatByUser === 'object') {
        persisted.lastChatByUser = saved.lastChatByUser
      }
    }
  } catch (e) {
    console.warn('[state] failed to hydrate localStorage', e)
  }
}

function persist() {
  // Persist only minimal UI state
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(persisted))
  } catch {
    // Ignore quota/private mode errors
  }
}

function restoreLastChatForCurrentUser() {
  const me = state.currentUser?.id
  if (!me) return

  const saved = persisted.lastChatByUser[String(me)]
  if (!saved) return

  state.chatWithUserId = saved.chatWithUserId ?? null
  state.chatWithUserName = saved.chatWithUserName ?? null
}

function saveLastChatForCurrentUser() {
  const me = state.currentUser?.id
  if (!me) return

  persisted.lastChatByUser[String(me)] = {
    chatWithUserId: state.chatWithUserId ?? null,
    chatWithUserName: state.chatWithUserName ?? null,
  }

  persist()
}

export function getState() {
  return state
}

export function setStateKey(key, value) {
  state[key] = value

  // ✅ When user logs in, restore last chat for THAT user
  if (key === 'currentUser' && value) {
    restoreLastChatForCurrentUser()
  }

  // ✅ Persist last chat only when these change (and only if we have a currentUser)
  if (key === 'chatWithUserId' || key === 'chatWithUserName') {
    saveLastChatForCurrentUser()
  }

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

const state = {
  currentUser: null,
  posts: [],
  selectedPost: null,
  chatList: [], // [{ userId, username, lastMessageDate, lastMessageSnippet, online }, ...]
  messagesByUser: {}, // { userId: [ {id, from, to, text, date}, ...] }
}

const listeners = {}

export function initState() {
  // Cargar de localStorage/cookie si quieres
}

export function getState() {
  return state
}

export function setStateKey(key, value) {
  state[key] = value
  if (listeners[key]) {
    listeners[key].forEach((cb) => cb(value))
  }
}

export function onStateChange(key, cb) {
  if (!listeners[key]) listeners[key] = []
  listeners[key].push(cb)
}

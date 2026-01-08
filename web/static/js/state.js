const state = {
  currentUser: null,
  posts: [],
  selectedPost: null,
  chatList: [], // [{ userId, username, lastMessageDate, lastMessageSnippet, online }, ...]
  messagesByUser: {}, // { userId: [ {id, from, to, text, date}, ...] }
}

const listeners = []

export function initState() {
  // loading localStorage/cookie
}

export function getState() {
  return state
}

export function setStateKey(key, value) {
  state[key] = value
  if (listeners[key]) {
    listeners[key].forEach((cb) => cb(value))
  }
  notify()
}

export function onStateChange(key, cb) {
  if (!listeners[key]) listeners[key] = []
  listeners[key].push(cb)
}

export function subscribe(fn) {
  listeners.push(fn)
  return () => {
    listeners = listeners.filter((l) => l !== fn)
  }
}

function notify() {
  for (const fn of listeners) fn()
}

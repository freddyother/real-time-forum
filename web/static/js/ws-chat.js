// web/static/js/ws-chat.js

let socket = null
let reconnectTimer = null
let reconnectAttempt = 0

const outbox = []
const msgListeners = new Set()
const statusListeners = new Set()

let isOpen = false

// ✅ gate
let shouldReconnect = false

// ✅ detect rejected loops (401 / handshake fails quickly)
let connectStartedAt = 0 // when we call new WebSocket()
let lastOpenAt = 0 // when onopen fires
let consecutiveFastCloses = 0

export function onWSMessage(cb) {
  msgListeners.add(cb)
  return () => msgListeners.delete(cb)
}

export function onWSStatus(cb) {
  statusListeners.add(cb)
  cb({ isOpen, attempt: reconnectAttempt })
  return () => statusListeners.delete(cb)
}

function emitMessage(data) {
  for (const cb of msgListeners) cb(data)
}

function emitStatus() {
  const payload = { isOpen, attempt: reconnectAttempt }
  for (const cb of statusListeners) cb(payload)
}

function buildWSUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}/ws/chat`
}

/**
 * ✅ Call this after login success (or when you want WS running globally).
 */
export function enableWS() {
  shouldReconnect = true
  connectWS()
}

/**
 * ✅ Call this on logout.
 */
export function disableWS() {
  shouldReconnect = false
  closeWS({ clearOutbox: true })
}

export function connectWS() {
  if (!shouldReconnect) return

  // Avoid duplicate connections
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return

  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  connectStartedAt = Date.now()
  lastOpenAt = 0

  socket = new WebSocket(buildWSUrl())

  socket.onopen = () => {
    isOpen = true
    reconnectAttempt = 0

    lastOpenAt = Date.now()
    consecutiveFastCloses = 0

    console.log('[WS] connected')
    emitStatus()
    flushOutbox()
  }

  socket.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data)
      emitMessage(data)
    } catch {
      console.warn('[WS] invalid JSON', e.data)
    }
  }

  socket.onclose = () => {
    isOpen = false
    emitStatus()

    const now = Date.now()

    // If onopen never happened, measure from connectStartedAt.
    const base = lastOpenAt || connectStartedAt
    const aliveMs = base ? now - base : 0

    // "fast close" = connection died very quickly (handshake rejected / unauth / server down)
    if (aliveMs > 0 && aliveMs < 700) {
      consecutiveFastCloses += 1
    } else {
      // don’t reset too aggressively; decay instead
      consecutiveFastCloses = Math.max(0, consecutiveFastCloses - 1)
    }

    // ✅ Stop reconnect if we are in a fast-close loop
    if (consecutiveFastCloses >= 3) {
      console.warn('[WS] fast-close loop detected, disabling reconnect (likely 401/unauth/server down)')
      shouldReconnect = false
      return
    }

    if (shouldReconnect) scheduleReconnect()
  }

  socket.onerror = () => {
    // onclose will handle
  }
}

function scheduleReconnect() {
  if (!shouldReconnect) return
  if (reconnectTimer) return

  reconnectAttempt += 1

  const base = 300 * Math.pow(2, reconnectAttempt) // 300, 600, 1200...
  const capped = Math.min(8000, base)
  const jitter = Math.floor(Math.random() * 250)
  const delay = capped + jitter

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connectWS()
  }, delay)
}

function flushOutbox() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  if (!outbox.length) return

  while (outbox.length) {
    const payload = outbox.shift()
    try {
      socket.send(JSON.stringify(payload))
    } catch {
      outbox.unshift(payload)
      try {
        socket.close()
      } catch (_) {}
      return
    }
  }
}

export function sendWS(payload) {
  // ✅ If disabled (logged out), don't queue.
  if (!shouldReconnect) return false

  connectWS()

  if (!socket || socket.readyState !== WebSocket.OPEN) {
    outbox.push(payload)
    return false
  }

  try {
    socket.send(JSON.stringify(payload))
    return true
  } catch {
    outbox.push(payload)
    try {
      socket.close()
    } catch (_) {}
    return false
  }
}

export function closeWS({ clearOutbox = false } = {}) {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  reconnectAttempt = 0
  isOpen = false
  emitStatus()

  if (socket) {
    try {
      socket.onclose = null
      socket.onerror = null
      socket.onmessage = null
      socket.onopen = null
      socket.close()
    } catch (_) {}
  }

  socket = null

  if (clearOutbox) outbox.length = 0
}

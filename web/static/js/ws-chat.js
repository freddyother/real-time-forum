// web/static/js/ws-chat.js

let socket = null
let reconnectTimer = null
let reconnectAttempt = 0

// Outbox queue (messages to send when the socket is open again).
const outbox = []

// Subscribers for incoming WS messages.
const msgListeners = new Set()

// Subscribers for connection status changes.
const statusListeners = new Set()

let isOpen = false

export function onWSMessage(cb) {
  msgListeners.add(cb)
  return () => msgListeners.delete(cb)
}

export function onWSStatus(cb) {
  statusListeners.add(cb)
  // Immediately emit current status
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

export function connectWS() {
  // Avoid duplicate connections.
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return

  // Clear any pending reconnect timer; we are trying now.
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  socket = new WebSocket(buildWSUrl())

  socket.onopen = () => {
    isOpen = true
    reconnectAttempt = 0
    console.log('[WS] connected')
    emitStatus()
    flushOutbox()
  }

  socket.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data)
      emitMessage(data)
    } catch (err) {
      console.warn('[WS] invalid JSON', e.data)
    }
  }

  socket.onclose = () => {
    isOpen = false
    console.log('[WS] closed')
    emitStatus()
    scheduleReconnect()
  }

  socket.onerror = () => {
    // onclose will handle reconnection.
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return

  reconnectAttempt += 1

  // Exponential backoff with jitter (helps avoid thundering herd).
  const base = 300 * Math.pow(2, reconnectAttempt) // 300ms, 600ms, 1200ms...
  const capped = Math.min(8000, base)
  const jitter = Math.floor(Math.random() * 250) // 0..250ms
  const delay = capped + jitter

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connectWS()
  }, delay)
}

function flushOutbox() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  if (!outbox.length) return

  // Send in FIFO order
  while (outbox.length) {
    const payload = outbox.shift()
    try {
      socket.send(JSON.stringify(payload))
    } catch (err) {
      // If send fails, put the payload back and reconnect.
      outbox.unshift(payload)
      try {
        socket.close()
      } catch (_) {}
      return
    }
  }
}

/**
 * Send a payload over the websocket.
 * If not connected, the payload is queued and sent after reconnection.
 *
 * @returns {boolean} true if sent immediately, false if queued
 */
export function sendWS(payload) {
  // Ensure connection exists (best effort).
  connectWS()

  if (!socket || socket.readyState !== WebSocket.OPEN) {
    outbox.push(payload)
    return false
  }

  try {
    socket.send(JSON.stringify(payload))
    return true
  } catch (err) {
    outbox.push(payload)
    try {
      socket.close()
    } catch (_) {}
    return false
  }
}

// Optional helper to force close (useful when logging out).
export function closeWS() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  reconnectAttempt = 0
  isOpen = false
  emitStatus()

  if (socket) {
    try {
      socket.close()
    } catch (_) {}
  }
  socket = null
}

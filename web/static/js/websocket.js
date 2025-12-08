import { getState, setStateKey } from './state.js'

let socket = null

export function connectWS(user) {
  if (socket) return

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const url = `${protocol}://${window.location.host}/ws/chat`

  socket = new WebSocket(url)

  socket.addEventListener('open', () => {
    console.log('WS connected')
  })

  socket.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data)

    switch (msg.type) {
      case 'chat_message':
        handleChatMessage(msg.payload)
        break
      case 'users_status':
        handleUsersStatus(msg.payload)
        break
      // otros tipos: notificaciones, etc.
    }
  })

  socket.addEventListener('close', () => {
    console.log('WS disconnected')
    socket = null
  })
}

export function disconnectWS() {
  if (socket) {
    socket.close()
    socket = null
  }
}

export function sendPrivateMessage(toUserId, text) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return

  socket.send(
    JSON.stringify({
      type: 'chat_message',
      payload: {
        toUserId,
        text,
      },
    })
  )
}

function handleChatMessage(message) {
  const state = getState()
  const otherUserId = message.fromUserId === state.currentUser.id ? message.toUserId : message.fromUserId

  const msgList = state.messagesByUser[otherUserId] || []
  msgList.push(message)
  state.messagesByUser[otherUserId] = msgList
  setStateKey('messagesByUser', { ...state.messagesByUser })

  // update chatList (last message)
  // ...
}

function handleUsersStatus(list) {
  // list = [{userId, username, online, lastMessageDate, lastMessageSnippet}, ...]
  setStateKey('chatList', list)
}

# Real-Time Forum

A modern real-time forum application built with **Go**, **SQLite**, and **vanilla JavaScript**, featuring live private messaging, presence indicators, and a clean single-page interface.

## Features

- 🔐 User authentication (sessions & cookies)
- 📝 Create, edit and browse posts with categories
- 💬 Real-time private chat (WebSockets)
- 👀 Online / offline presence + last seen
- 📩 Message delivery & seen status
- 🔔 Unread message badges
- 💬 Typing indicators
- ⚡ Single-page app (no page reloads)
- 📱 Responsive UI

## Tech Stack

- **Backend:** Go (net/http)
- **Database:** SQLite
- **Realtime:** WebSockets (gorilla/websocket)
- **Frontend:** HTML, CSS, Vanilla JavaScript
- **State management:** Client-side store
- **Sessions:** HTTP cookies

## Project Structure

```text

real-time-forum/
├─ cmd/
│  └─ server/
│     └─ main.go
│
├─ internal/
│  ├─ db/
│  │  ├─ db.go          # abrir db, migraciones básicas
│  │  └─ migrations.go  # crear tablas users, posts, comments, messages...
│  │
│  ├─ models/
│  │  ├─ user.go
│  │  ├─ post.go
│  │  ├─ comment.go
│  │  └─ message.go
│  │
│  ├─ http/
│  │  ├─ auth.go        # login, register, logout
│  │  ├─ posts.go       # CRUD posts, comments, feed
│  │  ├─ chat.go        # endpoints para histórico de mensajes
│  │  ├─ middleware.go  # sesiones, auth, logging
│  │  └─ router.go      # definición de rutas
│  │
│  └─ ws/
│     ├─ hub.go         # gestiona conexiones, broadcast, rooms privados
│     ├─ client.go      # conexión individual, envío/recepción
│     └─ handlers.go    # upgrader HTTP → WebSocket
│
├─ web/
│  ├─ index.html
│  ├─ static/
│  │  ├─ css/
│  │  │  └─ style.css
│  │  └─ js/
│  │     ├─ main.js         # entry point
│  │     ├─ router.js       # change of “views” within the SPA
│  │     ├─ state.js        # global status (user, posts, chat)
│  │     ├─ api.js          # fetch() to backend REST (login, posts...)
│  │     ├─ notifications.js    # user sidebar badge and notifications
│  │     ├─ views/
│  │     │  ├─ view-auth.js     # login / register
│  │     │  ├─ view-feed.js     # post feed
│  │     │  ├─ view-post.js     # post details + comments
│  │     │  └─ view-chat.js     # private chat + user list
│  │     ├─ components/
│  │     │  ├─ navbar.js        # top bar (logout, avatar, etc.)
│  │     │  ├─ post-card.js     # postcard feed
│  │     │  ├─ comment-list.js  # list of comments
│  │     │  └─ chat-message.js  # message bubble
│  │     └─ utils/
│  │        ├─ dom.js           # helpers for creating/updating nodes
│  │        └─ throttle.js      # throttle/debounce for chat scrolling
│  │
│  └─ assets/   # (optional: images, logos, etc.)
│
├─ go.mod
├─ go.sum
└─ README.md
```

## Running Locally

### Prerequisites

- Go 1.21+
- SQLite

### Start the server

```bash
go run ./cmd/server
```

go -> http://localhost:8080

## Environment Variables

| Variable | Description                      |
| -------- | -------------------------------- |
| `PORT`   | HTTP server port (default: 8080) |

## Notes

- SQLite is used for simplicity and local persistence.
- WebSockets are used for real-time messaging and presence updates.
- The application is designed as a lightweight SPA without external frameworks.

## License

MIT

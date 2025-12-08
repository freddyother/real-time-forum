## Real-time-forum

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
│  │     ├─ main.js         # punto de entrada
│  │     ├─ router.js       # cambio de "vistas" dentro de la SPA
│  │     ├─ state.js        # estado global (usuario, posts, chat)
│  │     ├─ api.js          # fetch() a backend REST (login, posts...)
│  │     ├─ websocket.js    # conexión WS y eventos
│  │     ├─ views/
│  │     │  ├─ view-auth.js     # login / register
│  │     │  ├─ view-feed.js     # feed de posts
│  │     │  ├─ view-post.js     # detalle de post + comentarios
│  │     │  └─ view-chat.js     # chat privado + lista de usuarios
│  │     ├─ components/
│  │     │  ├─ navbar.js        # barra superior (logout, avatar…)
│  │     │  ├─ post-card.js     # tarjeta de post para el feed
│  │     │  ├─ comment-list.js  # lista de comentarios
│  │     │  └─ chat-message.js  # burbuja de mensaje
│  │     └─ utils/
│  │        ├─ dom.js           # helpers para crear/actualizar nodos
│  │        └─ throttle.js      # throttle/debounce para scroll del chat
│  │
│  └─ assets/   # (opcional: imágenes, logos, etc.)
│
├─ go.mod
├─ go.sum
└─ README.md
```

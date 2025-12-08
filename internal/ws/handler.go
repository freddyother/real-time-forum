package ws

import (
	"net/http"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		// Puedes ajustar esto según tus necesidades (CORS).
		return true
	},
}

func (h *Hub) HandleChat(w http.ResponseWriter, r *http.Request, userID int64) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	client := &Client{
		hub:    h,
		conn:   conn,
		send:   make(chan Message, 256),
		userID: userID,
	}

	h.register <- client

	go client.writePump()
	go client.readPump()
}

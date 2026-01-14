package ws

import (
	"log"
	"net/http"

	"github.com/gorilla/websocket"
)

// upgrader converts an HTTP connection into a WebSocket connection.
// CheckOrigin can be customised depending on the application's security requirements.
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // allow all origins (adjust for production)
	},
}

// HandleChat upgrades the incoming request to a WebSocket connection
// and registers a new client within the Hub using the provided user ID.
func (h *Hub) HandleChat(w http.ResponseWriter, r *http.Request, userID int64) {

	// Attempt to establish a WebSocket connection.
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		// Log upgrade failures for debugging.
		log.Printf("[WS] Upgrade failed: %v", err)
		return
	}

	// Create a new client instance associated with this user.
	client := &Client{
		hub:    h,
		conn:   conn,
		send:   make(chan Message, 256),
		userID: userID,
	}

	// Register the client with the Hub.
	h.register <- client

	// Start goroutines responsible for reading and writing messages.
	go client.writePump()
	go client.readPump()
}

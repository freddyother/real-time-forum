package ws

// Hub manages all active WebSocket clients and routes messages between them.
type Hub struct {
	clients    map[*Client]bool // connected clients
	register   chan *Client     // incoming client connections
	unregister chan *Client     // disconnected clients
	broadcast  chan Message     // messages to be delivered
	// OnMessage is called when a client sends a message.
	// It allows the app layer (httpserver) to persist messages before broadcast.
	OnMessage func(in Message) (Message, error)
}

// Message represents a private message exchanged between two users.
type Message struct {
	ID         int64  `json:"id,omitempty"`
	FromUserID int64  `json:"from_user_id"`
	ToUserID   int64  `json:"to_user_id"`
	Text       string `json:"text"`
	SentAt     string `json:"sent_at,omitempty"`
	Seen       bool   `json:"seen,omitempty"`
}

// NewHub creates a new Hub with initialised channels and storage.
func NewHub() *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		broadcast:  make(chan Message),
	}
}

// Run listens for register, unregister, and broadcast events.
// It should be launched as a goroutine and will run for the lifetime of the server.
func (h *Hub) Run() {
	for {
		select {

		// Register a newly connected client.
		case c := <-h.register:
			h.clients[c] = true

		// Remove a disconnected client and close its channel.
		case c := <-h.unregister:
			if _, ok := h.clients[c]; ok {
				delete(h.clients, c)
				close(c.send)
			}

		// Deliver a broadcast message to the intended participants.
		case msg := <-h.broadcast:
			for c := range h.clients {

				// Only forward messages to sender and recipient.
				if c.userID == msg.ToUserID || c.userID == msg.FromUserID {
					select {
					case c.send <- msg:
					default:
						// If the client cannot receive, assume it's dead.
						delete(h.clients, c)
						close(c.send)
					}
				}
			}
		}
	}
}

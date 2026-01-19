// internal/ws/client.go
package ws

import (
	"context"
	"log"

	"github.com/gorilla/websocket"
)

// Client represents a single WebSocket connection (tab/window) for a user.
type Client struct {
	hub    *Hub
	conn   *websocket.Conn
	send   chan any // send any WS event (MessageEvent, DeliveredEvent, SeenEvent, ...)
	userID int64
}

// incomingMessage is what the frontend sends to the server via WS.
// We keep it flexible with optional fields depending on Type.
type incomingMessage struct {
	Type string `json:"type"` // "message" | "delivered" | "seen"

	// message
	ToID   int64  `json:"to_user_id,omitempty"`
	Text   string `json:"text,omitempty"`
	TempID string `json:"temp_id,omitempty"`

	// delivered
	MessageID int64 `json:"message_id,omitempty"`

	// seen (viewer opened chat with other user)
	FromUserID int64 `json:"from_user_id,omitempty"` // other user in the conversation (the sender whose messages you "see")
}

// readPump reads JSON frames from the WS connection and routes them to the hub.
func (c *Client) readPump() {
	defer func() {
		// Unregister and close connection on exit.
		c.hub.unregister <- c
		_ = c.conn.Close()
	}()

	for {
		var in incomingMessage
		if err := c.conn.ReadJSON(&in); err != nil {
			break
		}

		log.Printf("[WS] received: %+v\n", in)

		// Default to "message" if omitted (keeps frontend simpler).
		if in.Type == "" {
			in.Type = "message"
		}

		switch in.Type {

		// ------------------------------------------------------------
		// 1) MESSAGE: sender -> server (persist) -> broadcast to sender+recipient
		// ------------------------------------------------------------
		case "message":
			// Basic validation.
			if in.ToID <= 0 || in.Text == "" {
				continue
			}

			ev := MessageEvent{
				Type:       "message",
				FromUserID: c.userID,
				ToUserID:   in.ToID,
				Content:    in.Text,
				Seen:       false,
				TempID:     in.TempID,
			}

			// Persist to DB before broadcasting (if configured).
			if c.hub.OnMessage != nil {
				out, err := c.hub.OnMessage(context.Background(), ev)
				if err != nil {
					// Optionally, you can send an error event back to the sender here.
					continue
				}
				ev = out
			}

			// Broadcast to both sides (hub decides routing).
			c.hub.broadcast <- ev

		// ------------------------------------------------------------
		// 2) DELIVERED: recipient -> server (mark delivered) -> notify sender
		// ------------------------------------------------------------
		case "delivered":
			if in.MessageID <= 0 {
				continue
			}

			// If backend does not implement delivered yet, just ignore.
			if c.hub.OnDelivered == nil {
				continue
			}

			// receiverID is the current WS authenticated user.
			fromUserID, deliveredAt, err := c.hub.OnDelivered(context.Background(), c.userID, in.MessageID)
			if err != nil {
				continue
			}

			ack := DeliveredEvent{
				Type:        "delivered",
				MessageID:   in.MessageID,
				FromUserID:  fromUserID,
				ToUserID:    c.userID,
				DeliveredAt: deliveredAt,
			}

			// Notify sender (and optionally sender's other tabs).
			c.hub.sendToUser(fromUserID, ack)

		// ------------------------------------------------------------
		// 3) SEEN: viewer opened chat -> server (mark seen) -> notify sender
		// ------------------------------------------------------------
		case "seen":
			// The frontend should send {type:"seen", from_user_id: otherId}
			otherID := in.FromUserID
			if otherID <= 0 {
				continue
			}

			if c.hub.OnSeen == nil {
				continue
			}

			fromUserID, toUserID, seenUpToID, seenAt, err := c.hub.OnSeen(context.Background(), c.userID, otherID)
			if err != nil {
				continue
			}

			ev := SeenEvent{
				Type:       "seen",
				FromUserID: fromUserID,
				ToUserID:   toUserID,
				SeenUpToID: seenUpToID,
				SeenAt:     seenAt,
			}

			// Notify the original sender.
			c.hub.sendToUser(fromUserID, ev)

		default:
			// Ignore unknown event types.
			continue
		}
	}
}

// writePump writes outgoing events to the WS connection.
func (c *Client) writePump() {
	defer func() { _ = c.conn.Close() }()

	for msg := range c.send {
		if err := c.conn.WriteJSON(msg); err != nil {
			break
		}
	}
}

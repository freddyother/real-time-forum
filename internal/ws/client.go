// internal/ws/client.go
package ws

import (
	"context"
	"log"

	"github.com/gorilla/websocket"
)

type Client struct {
	hub    *Hub
	conn   *websocket.Conn
	send   chan MessageEvent
	userID int64
}

type incomingMessage struct {
	Type   string `json:"type"` // "message"
	ToID   int64  `json:"to_user_id"`
	Text   string `json:"text"`
	TempID string `json:"temp_id,omitempty"`
}

func (c *Client) readPump() {
	defer func() {
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

		// Only handle message events for now.
		if in.Type != "message" {
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
				// Optionally you can send an error event back to sender later.
				continue
			}
			ev = out
		}

		c.hub.broadcast <- ev
	}
}

func (c *Client) writePump() {
	defer func() { _ = c.conn.Close() }()

	for msg := range c.send {
		if err := c.conn.WriteJSON(msg); err != nil {
			break
		}
	}
}

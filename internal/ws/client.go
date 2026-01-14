package ws

import (
	"github.com/gorilla/websocket"
)

type Client struct {
	hub    *Hub
	conn   *websocket.Conn
	send   chan Message
	userID int64
}

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	for {
		var msg Message
		if err := c.conn.ReadJSON(&msg); err != nil {
			break
		}

		// Always trust the authenticated user from the WS connection.
		msg.FromUserID = c.userID

		// Persist message if callback exists.
		if c.hub.OnMessage != nil {
			saved, err := c.hub.OnMessage(msg)
			if err == nil {
				msg = saved
			}
		}

		c.hub.broadcast <- msg
	}
}

func (c *Client) writePump() {
	defer c.conn.Close()
	for msg := range c.send {
		if err := c.conn.WriteJSON(msg); err != nil {
			break
		}
	}
}

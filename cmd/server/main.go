package main

import (
	"log"
	"net/http"
	"os"

	mydb "real-time-forum/internal/db"
	httpserver "real-time-forum/internal/http"
	"real-time-forum/internal/ws"
)

func main() {
	// Determine database path (environment overrides default).
	dsn := "forum.db"
	if v := os.Getenv("DATABASE_PATH"); v != "" {
		dsn = v
	}

	// Open SQLite database connection.
	db, err := mydb.Open(dsn)
	if err != nil {
		log.Fatalf("error opening DB: %v", err)
	}
	defer db.Close()

	// Apply database schema migrations.
	if err := mydb.RunMigrations(db); err != nil {
		log.Fatalf("error running migrations: %v", err)
	}

	// Create and start the WebSocket hub for real-time messaging.
	hub := ws.NewHub()
	go hub.Run()

	// Create the HTTP server with all dependencies.
	server := httpserver.NewServer(db, hub)

	log.Println("listening on :8080")

	// Start the server and block until failure.
	if err := http.ListenAndServe(":8080", server.Router()); err != nil {
		log.Fatal(err)
	}
}

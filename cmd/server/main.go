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
	// Database route
	dsn := "forum.db"
	if v := os.Getenv("DATABASE_PATH"); v != "" {
		dsn = v
	}

	db, err := mydb.Open(dsn)
	if err != nil {
		log.Fatalf("error opening DB: %v", err)
	}
	defer db.Close()

	if err := mydb.RunMigrations(db); err != nil {
		log.Fatalf("error running migrations: %v", err)
	}

	// WebSocket hub
	hub := ws.NewHub()
	go hub.Run()

	// Servidor HTTP
	server := httpserver.NewServer(db, hub)

	log.Println("listening on :8080")
	if err := http.ListenAndServe(":8080", server.Router()); err != nil {
		log.Fatal(err)
	}
}

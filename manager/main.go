package main

import (
    "crypto/tls"
    "database/sql"
    "log"
    "encoding/json"
    "net"
    "net/http"
    "time"
    "os"
    "fmt"
    "strings"
    "strconv"
    _ "github.com/lib/pq"
    "github.com/go-chi/chi/v5"
    "github.com/go-chi/cors"
    "github.com/dgrijalva/jwt-go"
    "golang.org/x/crypto/bcrypt"
)

// this function to generate connection string
func getConnectionString() string {
    return fmt.Sprintf(
        "postgres://%s:%s@%s:%s/%s?sslmode=disable",
        os.Getenv("POSTGRES_USER"),
        os.Getenv("POSTGRES_PASSWORD"),
        os.Getenv("POSTGRES_HOST"),
        os.Getenv("POSTGRES_PORT"),
        os.Getenv("POSTGRES_DB"),
    )
}

var db *sql.DB

type Service struct {
	ID          int       `json:"id"`
	URL         string    `json:"url"`
	Status      string    `json:"status"`
	SSLExpiry   string    `json:"ssl_expiry"`
	LastChecked time.Time `json:"last_checked"`
}

// JWT Secret Key
var jwtSecret = []byte("your_secret_key")

type Credentials struct {
    Username string `json:"username"`
    Password string `json:"password"`
}

// Define User struct
type User struct {
    ID       int
    Username string
    Password string // Hashed password
}

// Create JWT token
func createToken(username string) (string, error) {
    token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
        "username": username,
        "exp":      time.Now().Add(time.Hour * 24).Unix(), // 1 day expiration
    })
    return token.SignedString(jwtSecret)
}

// Authenticate user and return JWT token
func login(w http.ResponseWriter, r *http.Request) {
    var creds Credentials
    err := json.NewDecoder(r.Body).Decode(&creds)
    if err != nil {
        w.WriteHeader(http.StatusBadRequest)
        return
    }

    var storedCreds User
    err = db.QueryRow("SELECT id, username, password FROM users WHERE username=$1", creds.Username).Scan(&storedCreds.ID, &storedCreds.Username, &storedCreds.Password)
    if err != nil {
        w.WriteHeader(http.StatusUnauthorized)
        return
    }

    // Compare stored hashed password with the provided password
    err = bcrypt.CompareHashAndPassword([]byte(storedCreds.Password), []byte(creds.Password))
    if err != nil {
        w.WriteHeader(http.StatusUnauthorized)
        return
    }

    // If password matches, create a JWT token
    token, err := createToken(creds.Username)
    if err != nil {
        w.WriteHeader(http.StatusInternalServerError)
        return
    }

    json.NewEncoder(w).Encode(map[string]string{"token": token})
}

// Register function to handle user registration
func Register(w http.ResponseWriter, r *http.Request) {
    var user User
    err := json.NewDecoder(r.Body).Decode(&user)
    if err != nil {
        http.Error(w, "Invalid request payload", http.StatusBadRequest)
        return
    }

    // Hash the password before storing
    hashedPassword, err := bcrypt.GenerateFromPassword([]byte(user.Password), bcrypt.DefaultCost)
    if err != nil {
        http.Error(w, "Error hashing password", http.StatusInternalServerError)
        return
    }

    // Insert the user into the database
    _, err = db.Exec("INSERT INTO users (username, password) VALUES ($1, $2)", user.Username, string(hashedPassword))
    if err != nil {
        log.Printf("Error inserting user: %v", err)
        http.Error(w, "Error inserting user into the database", http.StatusInternalServerError)
        return
    }

    w.WriteHeader(http.StatusCreated)
    json.NewEncoder(w).Encode(map[string]string{"message": "User registered successfully"})
}

// making sure https or http is appended
func AddProtocol(url string) string {
	if !strings.HasPrefix(url, "http://") && !strings.HasPrefix(url, "https://") {
		return "https://" + url
	}
	return url
}

// verify service is up
func CheckService(service *Service) {
	url := AddProtocol(service.URL)
	log.Printf("Checking service for URL: %s\n", url)

	client := http.Client{
		Timeout: 5 * time.Second,
	}

	resp, err := client.Get(url)
	if err != nil {
		service.Status = "DOWN (Timeout/Error)"
		log.Printf("Error checking service for URL %s: %v\n", url, err)
	} else {
		defer resp.Body.Close()
		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			service.Status = "UP"
			log.Printf("Service for URL %s is UP\n", url)
		} else {
			service.Status = fmt.Sprintf("DOWN (HTTP %d)", resp.StatusCode)
			log.Printf("Service for URL %s is DOWN with status %d\n", url, resp.StatusCode)
		}
	}
	service.LastChecked = time.Now()
}

// checks SSL certificate expiry
func CheckSSLExpiry(service *Service) {
	log.Printf("Checking SSL expiry for URL: %s\n", service.URL)

	dialer := &net.Dialer{
		Timeout: 5 * time.Second,
	}

	conn, err := tls.DialWithDialer(dialer, "tcp", service.URL+":443", &tls.Config{})
	if err != nil {
		service.SSLExpiry = "Error/Timeout checking SSL"
		log.Printf("Error checking SSL for URL %s: %v\n", service.URL, err)
	} else {
		defer conn.Close()
		certs := conn.ConnectionState().PeerCertificates
		if len(certs) > 0 {
			expiry := certs[0].NotAfter
			service.SSLExpiry = expiry.Format("2006-01-02 15:04:05")
			log.Printf("SSL Certificate for URL %s expires on %s\n", service.URL, service.SSLExpiry)
		} else {
			service.SSLExpiry = "No certificate found"
			log.Printf("No SSL certificate found for URL: %s\n", service.URL)
		}
	}
}

// retrieves all monitors from the database
func GetMonitors(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Query("SELECT id, url, status, ssl_expiry, last_checked FROM monitors")
	if err != nil {
		http.Error(w, "Failed to retrieve monitors", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var services []Service
	for rows.Next() {
		var service Service
		err := rows.Scan(&service.ID, &service.URL, &service.Status, &service.SSLExpiry, &service.LastChecked)
		if err != nil {
			http.Error(w, "Error scanning row", http.StatusInternalServerError)
			return
		}
		services = append(services, service)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(services)
}

// adds a new monitor to the database
func AddMonitor(w http.ResponseWriter, r *http.Request) {
	var service Service
	err := json.NewDecoder(r.Body).Decode(&service)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// to chek the service and SSL expiry
	CheckService(&service)
	CheckSSLExpiry(&service)

	// insert to the database
	err = db.QueryRow(
		"INSERT INTO monitors (url, status, ssl_expiry, last_checked) VALUES ($1, $2, $3, $4) RETURNING id",
		service.URL, service.Status, service.SSLExpiry, service.LastChecked,
	).Scan(&service.ID)

	if err != nil {
		http.Error(w, "Failed to insert monitor", http.StatusInternalServerError)
		return
	}

	// Return the inserted monitor in the response
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(service)
}

// bg task to check all services every 5 seconds
func startBackgroundCheck() {
    for {
        // Wait 5 seconds before checking all services again
        time.Sleep(5 * time.Second)

        log.Println("Starting background check of all services")

        rows, err := db.Query("SELECT id, url, status, ssl_expiry, last_checked FROM monitors")
        if err != nil {
            log.Printf("Error retrieving monitors: %v\n", err)
            continue
        }
        defer rows.Close()

        // Loop through all monitors and update their status and SSL expiry
        for rows.Next() {
            var service Service
            err := rows.Scan(&service.ID, &service.URL, &service.Status, &service.SSLExpiry, &service.LastChecked)
            if err != nil {
                log.Printf("Error scanning monitor: %v\n", err)
                continue
            }

            // check service and SSL expiry
            CheckService(&service)
            CheckSSLExpiry(&service)

            // update the monitor in the database
            _, err = db.Exec("UPDATE monitors SET status=$1, ssl_expiry=$2, last_checked=$3 WHERE id=$4",
                service.Status, service.SSLExpiry, service.LastChecked, service.ID)
            if err != nil {
                log.Printf("Error updating monitor for URL %s: %v\n", service.URL, err)
                continue
            }

            // insert into monitor_history table to keep track of history
            _, err = db.Exec("INSERT INTO monitor_history (monitor_id, status, ssl_expiry, checked_at) VALUES ($1, $2, $3, $4)",
                service.ID, service.Status, service.SSLExpiry, service.LastChecked)
            if err != nil {
                log.Printf("Error inserting monitor history for URL %s: %v\n", service.URL, err)
            } else {
                log.Printf("Monitor history for URL %s updated successfully\n", service.URL)
            }
        }
    }
}

//  retrieves historical data for a specific monitor
func GetMonitorHistory(w http.ResponseWriter, r *http.Request) {
    id := chi.URLParam(r, "id")
    log.Printf("Received request for monitor history. ID: %s", id) // Debug log

    monitorID, err := strconv.Atoi(id) // Convert ID to integer
    if err != nil {
        log.Printf("Invalid monitor ID: %s", id)
        http.Error(w, "Invalid monitor ID", http.StatusBadRequest)
        return
    }

    rows, err := db.Query("SELECT status, checked_at FROM monitor_history WHERE monitor_id=$1 ORDER BY checked_at", monitorID)
    if err != nil {
        log.Printf("Error retrieving monitor history for ID %d: %v", monitorID, err) // Debug log
        http.Error(w, "Failed to retrieve monitor history", http.StatusInternalServerError)
        return
    }
    defer rows.Close()

    var history []struct {
        Status    string    `json:"status"`
        CheckedAt time.Time `json:"checked_at"`
    }

    for rows.Next() {
        var entry struct {
            Status    string    `json:"status"`
            CheckedAt time.Time `json:"checked_at"`
        }
        if err := rows.Scan(&entry.Status, &entry.CheckedAt); err != nil {
            log.Printf("Error scanning history row for ID %d: %v", monitorID, err) // Debug log
            http.Error(w, "Error scanning row", http.StatusInternalServerError)
            return
        }
        history = append(history, entry)
    }

    if len(history) == 0 {
        log.Printf("No history found for monitor ID: %d", monitorID)
        http.Error(w, "Monitor history not found", http.StatusNotFound)
        return
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(history)
}

// removes a monitor from the database
func DeleteMonitor(w http.ResponseWriter, r *http.Request) {
    id := chi.URLParam(r, "id")

    //  delete the associated history entries
    _, err := db.Exec("DELETE FROM monitor_history WHERE monitor_id=$1", id)
    if err != nil {
        http.Error(w, "Failed to delete monitor history", http.StatusInternalServerError)
        return
    }

    //  delete the monitor from the monitors table
    result, err := db.Exec("DELETE FROM monitors WHERE id=$1", id)
    if err != nil {
        http.Error(w, "Failed to delete monitor", http.StatusInternalServerError)
        return
    }

    // check if any row was deleted
    rowsAffected, err := result.RowsAffected()
    if err != nil || rowsAffected == 0 {
        http.Error(w, "Monitor not found", http.StatusNotFound)
        return
    }

    w.WriteHeader(http.StatusNoContent) // Successfully deleted
}

// Main function with route setup
func main() {
    var err error

    connStr := getConnectionString()

    db, err = sql.Open("postgres", connStr)
    if err != nil {
        log.Fatalf("Failed to connect to database: %v\n", err)
    }
    defer db.Close()

    log.Println("Connected to database successfully")

    r := chi.NewRouter()

    // CORS settings
    corsHandler := cors.New(cors.Options{
        AllowedOrigins:   []string{"http://localhost", "http://localhost:3000"},
        AllowedMethods:   []string{"GET", "POST", "DELETE", "OPTIONS"},
        AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
        ExposedHeaders:   []string{"Link"},
        AllowCredentials: true,
        MaxAge:           300,
    })
    r.Use(corsHandler.Handler)

    // Preflight OPTIONS handler for CORS
    r.Options("/*", func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
    })

    // Register and login routes
    r.Post("/register", Register) // Registration route
    r.Post("/login", login)       // Login route

    // Monitor-related routes (ensure JWT auth is verified for these routes)
    r.Get("/monitors", GetMonitors)
    r.Post("/monitors", AddMonitor)
    r.Delete("/monitors/{id}", DeleteMonitor)
    r.Get("/monitors/{id}/history", GetMonitorHistory)

    // Start the background checking task
    go startBackgroundCheck()

    log.Println("Starting server on :8080...")
    err = http.ListenAndServe(":8080", r)
    if err != nil {
        log.Fatalf("Failed to start server: %v\n", err)
    }
}

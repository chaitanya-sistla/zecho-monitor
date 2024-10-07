# Build stage
FROM golang:1.19-alpine AS builder

WORKDIR /app

# Copy go.mod and go.sum to download dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy the rest of the application source code
COPY . .

# Build the Go app
RUN go build -o backend-app .

# Final stage
FROM alpine:latest

WORKDIR /root/

# Copy the Go binary from the builder stage
COPY --from=builder /app/backend-app .

# Expose the port the app will run on
EXPOSE 8080

# Run the Go app
CMD ["./backend-app"]


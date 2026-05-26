FROM golang:1.23-alpine AS builder

RUN apk add --no-cache git

ENV CGO_ENABLED=0 \
    GOOS=linux \
    GOARCH=amd64

WORKDIR /app

COPY go.mod go.sum ./

RUN go mod download

COPY . .

ARG SERVICE
RUN go build -o bin/server ./cmd/$SERVICE

FROM alpine:latest

RUN apk add --no-cache ca-certificates

WORKDIR /app

ARG SERVICE
COPY --from=builder /app/bin/server .
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/devdata ./devdata

EXPOSE 8080

ENTRYPOINT ["/app/server"]

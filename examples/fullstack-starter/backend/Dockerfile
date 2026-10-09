FROM golang:1.26-alpine AS builder
WORKDIR /app
# gcc + musl-dev para CGO: metacore-kernel/runtime/wasm usa pg_query_go
# (libpg_query, C). Con CGO_ENABLED=0 falla con "undefined: pg_query.Parse".
RUN apk add --no-cache git gcc musl-dev
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# Enlace estático con musl para correr en alpine sin libc dinámica.
RUN CGO_ENABLED=1 GOOS=linux go build \
    -trimpath \
    -ldflags '-s -w -linkmode external -extldflags "-static"' \
    -tags 'osusergo netgo' \
    -o server .

FROM alpine:3.21
RUN apk add --no-cache ca-certificates
COPY --from=builder /app/server /usr/local/bin/server
EXPOSE 7200
CMD ["server"]

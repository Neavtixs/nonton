package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"nonton/backend-app/configs"
	"strings"
	"sync"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

type RoomState struct {
	Playing   bool      `json:"playing"`
	Offset    float64   `json:"offset"`
	StartedAt time.Time `json:"startedAt"`
}

type Hub struct {
	clients map[chan RoomResponse]struct{}
	state   RoomState
	mu      sync.RWMutex
}

func NewHub() *Hub {
	return &Hub{
		clients: make(map[chan RoomResponse]struct{}),
	}
}

func (h *Hub) AddClient(client chan RoomResponse) RoomResponse {
	h.mu.Lock()
	h.clients[client] = struct{}{}
	h.mu.Unlock()

	return h.CurrentState()
}

func (h *Hub) RemoveClient(client chan RoomResponse) {
	h.mu.Lock()
	delete(h.clients, client)
	h.mu.Unlock()
}

func (h *Hub) Broadcast() {
	state := h.CurrentState()

	h.mu.RLock()

	snapshot := make([]chan RoomResponse, 0, len(h.clients))
	for client := range h.clients {
		snapshot = append(snapshot, client)
	}

	h.mu.RUnlock()

	for _, client := range snapshot {
		select {
		case client <- state:
		default:
		}
	}
}

func (h *Hub) Play(currentTime float64) {
	h.mu.Lock()

	h.state.Playing = true
	h.state.Offset = currentTime
	h.state.StartedAt = time.Now()

	h.mu.Unlock()

	h.Broadcast()
}

func (h *Hub) Pause(currentTime float64) {
	h.mu.Lock()

	h.state.Playing = false
	h.state.Offset = currentTime

	h.mu.Unlock()

	h.Broadcast()
}

func (h *Hub) Seek(delta float64) {
	h.mu.Lock()

	current := h.state.Offset
	if h.state.Playing {
		current += time.Since(h.state.StartedAt).Seconds()
	}

	current += delta
	if current < 0 {
		current = 0
	}

	h.state.Offset = current
	h.state.StartedAt = time.Now()

	h.mu.Unlock()

	h.Broadcast()
}

func (h *Hub) CurrentState() RoomResponse {
	h.mu.RLock()
	defer h.mu.RUnlock()

	current := h.state.Offset

	if h.state.Playing {
		current += time.Since(h.state.StartedAt).Seconds()
	}

	return RoomResponse{
		Playing:     h.state.Playing,
		CurrentTime: current,
	}
}

type RoomResponse struct {
	Playing     bool    `json:"playing"`
	CurrentTime float64 `json:"currentTime"`
}

type PlayRequest struct {
	CurrentTime float64 `json:"currentTime"`
}

type SeekRequest struct {
	Delta float64 `json:"delta"`
}

func main() {
	server := configs.NewGin()
	storage := configs.NewS3()

	server.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://127.0.0.1:3000", "http://127.0.0.1:3001", "https://nonton.muhsandi.com"},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"*"},
		AllowCredentials: true,
	}))

	hub := NewHub()

	server.GET("/api/state", func(ctx *gin.Context) {
		ctx.Writer.Header().Set("Content-Type", "text/event-stream")
		ctx.Writer.Header().Set("Cache-Control", "no-cache")
		ctx.Writer.Header().Set("Connection", "keep-alive")

		client := make(chan RoomResponse, 1)

		currentState := hub.AddClient(client)

		defer hub.RemoveClient(client)

		flusher, ok := ctx.Writer.(http.Flusher)
		if !ok {
			ctx.Status(http.StatusInternalServerError)
			return
		}

		{
			jsonData, _ := json.Marshal(currentState)
			fmt.Fprintf(ctx.Writer, "data: %s\n\n", jsonData)
			flusher.Flush()
		}

		for {
			// kirim ke browser
			select {
			case state := <-client:
				jsonData, _ := json.Marshal(state)

				fmt.Fprintf(ctx.Writer, "data: %s\n\n", jsonData)
				flusher.Flush()

			// browser disconnect
			case <-ctx.Request.Context().Done():
				return
			}

		}
	})

	server.PUT("/api/state/play", func(ctx *gin.Context) {
		var req PlayRequest

		if err := ctx.ShouldBindJSON(&req); err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"message": "invalid request",
			})
			return
		}

		hub.Play(req.CurrentTime)
		ctx.Status(http.StatusNoContent)
	})
	server.PUT("/api/state/pause", func(ctx *gin.Context) {
		var req PlayRequest

		if err := ctx.ShouldBindJSON(&req); err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"message": "invalid request",
			})
			return
		}
		hub.Pause(req.CurrentTime)
		ctx.Status(http.StatusNoContent)
	})

	server.PUT("/api/state/seek", func(ctx *gin.Context) {
		var req SeekRequest

		if err := ctx.ShouldBindJSON(&req); err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"message": "invalid request",
			})
			return
		}
		hub.Seek(req.Delta)
		ctx.Status(http.StatusNoContent)
	})

	server.GET("/api/state/current", func(ctx *gin.Context) {
		current := hub.CurrentState()

		ctx.JSON(http.StatusOK, current)
	})

	// check health
	server.GET("/api/s3/check", func(ctx *gin.Context) {
		err := storage.HealthCheck(ctx)
		if err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"sucess": false,
			})
			return
		}

		ctx.JSON(http.StatusOK, gin.H{
			"sucess": true,
		})
	})

	// get presigned url s3, to upload batch of hls
	type FileRequest struct {
		Filename    string `json:"filename"`
		ContentType string `json:"content_type"`
	}

	type PresignRequest struct {
		Files []FileRequest `json:"files"`
	}

	type PresignResponse struct {
		Key       string `json:"key"`
		UploadURL string `json:"upload_url"`
	}
	server.POST("/api/upload", func(ctx *gin.Context) {
		req := PresignRequest{}
		ctx.ShouldBindJSON(&req)

		var response []PresignResponse

		if len(req.Files) > 100 {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"msg":     "to much file",
			})
			return
		}
		for _, file := range req.Files {
			result, err := storage.PresignClient.PresignPutObject(ctx, &s3.PutObjectInput{
				Bucket:      aws.String(storage.Bucket),
				Key:         aws.String(file.Filename),
				ContentType: aws.String(file.ContentType),
			}, func(po *s3.PresignOptions) {
				po.Expires = 15 * time.Minute
			})
			if err != nil {
				ctx.JSON(http.StatusBadRequest, gin.H{
					"success": false,
				})
				return
			}

			response = append(response, PresignResponse{
				Key:       file.Filename,
				UploadURL: result.URL,
			})
		}

		ctx.JSON(http.StatusOK, gin.H{
			"success": true,
			"data":    response,
		})
	})

	//rewrite manifest
	server.GET("/api/video/*path", func(ctx *gin.Context) {
		path := ctx.Param("path")[1:]
		name := strings.Split(path, "/")

		result, err := storage.Client.GetObject(ctx, &s3.GetObjectInput{
			Bucket: aws.String(storage.Bucket),
			Key:    aws.String(path),
		})
		if err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"success": false,
			})
			return
		}

		data, err := io.ReadAll(result.Body)
		if err != nil {
			//some error
		}
		manifest := string(data)
		isMaster := strings.Contains(manifest, "#EXT-X-STREAM-INF")
		isMedia := strings.Contains(manifest, "#EXTINF")

		fmt.Println()

		lines := strings.Split(manifest, "\n")
		for i, line := range lines {
			if isMaster {
				if strings.HasPrefix(line, "#") {
					continue
				}

				if strings.TrimSpace(line) == "" {
					continue
				}

				lines[i] = fmt.Sprintf(`/api/video/%s/%s/`, name[0], name[1]) + line

			} else if isMedia {
				if strings.HasPrefix(line, "#") {
					continue
				}

				if line == "" {
					continue
				}

				presign, err := storage.PresignClient.PresignGetObject(ctx, &s3.GetObjectInput{
					Bucket: aws.String(storage.Bucket),
					Key:    aws.String(fmt.Sprintf(`%s/%s/%s/`, name[0], name[1], name[2]) + line),
				}, func(po *s3.PresignOptions) {
					po.Expires = 200 * time.Minute
				})

				if err != nil {
					ctx.JSON(http.StatusBadRequest, gin.H{
						"success": false,
					})
				}
				lines[i] = presign.URL
				//log.Println(presign)
				//lines[i] = fmt.Sprintf(`/%s/%s/%s/`, name[0], name[1], name[2]) + line

			}

		}

		newManifest := strings.Join(lines, "\n")

		ctx.Header("Content-Type", "application/vnd.apple.mpegurl")
		ctx.String(http.StatusOK, newManifest)

	})

	server.Run()
}

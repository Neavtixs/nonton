package main

import (
	"fmt"
	"net/http"
	"nonton/backend-app/configs"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	server := configs.NewGin()
	storage := configs.NewS3()

	server.Use(cors.Default())

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
		fmt.Println(req)

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

	server.Run()
}

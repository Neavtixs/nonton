package main

import (
	"net/http"
	"nonton/backend-app/configs"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/gin-gonic/gin"
)

func main() {
	server := configs.NewGin()
	storage := configs.NewS3()

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

	// get presigned url s3
	server.GET("/api/upload", func(ctx *gin.Context) {
		result, err := storage.PresignClient.PresignPutObject(ctx, &s3.PutObjectInput{
			Bucket:      aws.String(storage.Bucket),
			Key:         aws.String("baru.txt"),
			ContentType: aws.String("txt"),
		}, func(po *s3.PresignOptions) {
			po.Expires = 15 * time.Minute
		})

		if err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"success": false,
			})
			return
		}

		ctx.JSON(http.StatusOK, gin.H{
			"success": true,
			"data":    result.URL,
		})
	})

	server.Run()
}

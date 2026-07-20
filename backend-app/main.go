package main

import (
	"net/http"
	"nonton/backend-app/configs"

	"github.com/gin-gonic/gin"
)

func main() {
	server := configs.NewGin()
	aws := configs.NewS3()

	server.GET("/api/s3/check", func(ctx *gin.Context) {
		err := aws.HealthCheck(ctx)
		if err != nil {
			ctx.JSON(http.StatusOK, gin.H{
				"sucess": false,
			})
			return
		}

		ctx.JSON(http.StatusOK, gin.H{
			"sucess": true,
		})
	})

	server.Run()
}

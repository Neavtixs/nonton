package configs

import "github.com/gin-gonic/gin"

func NewGin() *gin.Engine {
	app := gin.Default()

	return app
}

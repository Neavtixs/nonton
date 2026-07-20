package configs

import (
	"context"
	"os"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type S3Config struct {
	Client        *s3.Client
	PresignClient *s3.PresignClient
	Bucket        string
}

func (s *S3Config) HealthCheck(ctx context.Context) error {
	_, err := s.Client.HeadBucket(ctx, &s3.HeadBucketInput{
		Bucket: aws.String(s.Bucket),
	})
	return err
}

func NewS3() *S3Config {
	ctx := context.Background()

	accessKeyID := os.Getenv("S3_ACCESS_KEY_ID")
	secretAccessKey := os.Getenv("S3_SECRET_ACCESS_KEY")
	endpointURL := os.Getenv("S3_ENDPOINT_URL")
	bucket := os.Getenv("S3_BUCKET")

	cfg, err := config.LoadDefaultConfig(ctx,
		config.WithRegion("us-east-1"),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(accessKeyID, secretAccessKey, "")),
	)
	if err != nil {
		panic(err)
	}

	client := s3.NewFromConfig(cfg, func(o *s3.Options) {
		if strings.TrimSpace(endpointURL) != "" {
			o.BaseEndpoint = aws.String(endpointURL)
			o.UsePathStyle = true
		}
	})
	presignClient := s3.NewPresignClient(client)

	return &S3Config{
		Client:        client,
		PresignClient: presignClient,
		Bucket:        bucket,
	}
}

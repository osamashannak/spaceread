package blobstorage

import (
	"context"
	"fmt"
	"github.com/Azure/azure-sdk-for-go/sdk/storage/azblob/blob"
	"github.com/Azure/azure-sdk-for-go/sdk/storage/azblob/sas"
	"github.com/osamashannak/uaeu-space/services/pkg/utils"
	"net"
	"os"
	"strings"
	"time"

	"github.com/Azure/azure-sdk-for-go/sdk/storage/azblob"
)

type BlobStorage struct {
	accountClient *azblob.Client
	credential    *azblob.SharedKeyCredential
	containerName string
}

func newAccessTokenCredential(accountName string, accountKey string) (*azblob.SharedKeyCredential, error) {
	credential, err := azblob.NewSharedKeyCredential(accountName, accountKey)
	if err != nil {
		return nil, fmt.Errorf("azure.newAccessTokenCredential: %w", err)
	}
	return credential, nil
}

func New(containerName string) (*BlobStorage, error) {
	accountName := os.Getenv("AZURE_STORAGE_ACCOUNT")
	if accountName == "" {
		return nil, fmt.Errorf("missing AZURE_STORAGE_ACCOUNT")
	}

	primaryURL := fmt.Sprintf("https://%s.blob.core.windows.net", accountName)

	accountKey := os.Getenv("AZURE_STORAGE_ACCESS_KEY")

	credential, err := newAccessTokenCredential(accountName, accountKey)
	if err != nil {
		return nil, err
	}

	client, err := azblob.NewClientWithSharedKeyCredential(primaryURL, credential, nil)

	if err != nil {
		return nil, fmt.Errorf("azure.NewBlobStorage: %w", err)
	}

	return &BlobStorage{
		accountClient: client,
		credential:    credential,
		containerName: containerName,
	}, nil
}

func (s *BlobStorage) CreateObject(ctx context.Context, name string, contentType, cacheControl, encoding, disposition *string, contents []byte) error {
	if strings.HasPrefix(*contentType, "video") {
		*contentType = ""
	}

	_, err := s.accountClient.UploadBuffer(
		ctx,
		s.containerName,
		name,
		contents,
		&azblob.UploadBufferOptions{HTTPHeaders: &blob.HTTPHeaders{
			BlobContentType:        contentType,
			BlobCacheControl:       cacheControl,
			BlobContentEncoding:    encoding,
			BlobContentDisposition: disposition,
		}},
	)

	return err
}

func (s *BlobStorage) GenerateSASToken(blobName string, ipAddress net.IP, expiresOn time.Time) (string, error) {
	permissions := sas.BlobPermissions{
		Read: true,
	}

	sasValues := sas.BlobSignatureValues{
		ContainerName: s.containerName,
		BlobName:      blobName,
		Permissions:   permissions.String(),
		ExpiryTime:    expiresOn,
		Protocol:      sas.ProtocolHTTPS,
	}

	if ip4 := ipAddress.To4(); ip4 != nil {
		sasValues.IPRange = sas.IPRange{
			Start: ip4,
			End:   ip4,
		}
	}

	queryParams, err := sasValues.SignWithSharedKey(s.credential)

	if err != nil {
		return "", err
	}

	return queryParams.Encode(), nil
}

func (s *BlobStorage) FormatSASURL(blobName, queryParams string) string {
	return utils.FormatBlobURL(s.accountClient.URL(), s.containerName, blobName, queryParams)
}

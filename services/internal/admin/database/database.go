package database

import (
	"github.com/osamashannak/uaeu-space/services/pkg/database"
	"github.com/osamashannak/uaeu-space/services/pkg/utils"
)

type AdminDB struct {
	db                  *database.DB
	attachmentURLFormat func(blobName string) string
}

type Option func(*AdminDB)

func WithAttachmentURLFormatter(formatter func(blobName string) string) Option {
	return func(db *AdminDB) {
		db.attachmentURLFormat = formatter
	}
}

func New(db *database.DB, opts ...Option) *AdminDB {
	adminDB := &AdminDB{
		db:                  db,
		attachmentURLFormat: defaultAttachmentURL,
	}

	for _, opt := range opts {
		opt(adminDB)
	}

	return adminDB
}

func (db *AdminDB) formatAttachmentURL(blobName string) string {
	return db.attachmentURLFormat(blobName)
}

func defaultAttachmentURL(blobName string) string {
	return utils.FormatBlobURL("https://spaceread.blob.core.windows.net", "attachments", blobName, "")
}

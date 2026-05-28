package database

import (
	"github.com/osamashannak/uaeu-space/services/pkg/database"
	"github.com/osamashannak/uaeu-space/services/pkg/utils"
)

type ProfessorDB struct {
	Db                  *database.DB
	attachmentURLFormat func(blobName string) string
}

type Option func(*ProfessorDB)

func WithAttachmentURLFormatter(formatter func(blobName string) string) Option {
	return func(db *ProfessorDB) {
		db.attachmentURLFormat = formatter
	}
}

func New(db *database.DB, opts ...Option) *ProfessorDB {
	professorDB := &ProfessorDB{
		Db:                  db,
		attachmentURLFormat: defaultAttachmentURL,
	}

	for _, opt := range opts {
		opt(professorDB)
	}

	return professorDB
}

func (db *ProfessorDB) formatAttachmentURL(blobName string) string {
	return db.attachmentURLFormat(blobName)
}

func defaultAttachmentURL(blobName string) string {
	return utils.FormatBlobURL("https://spaceread.blob.core.windows.net", "attachments", blobName, "")
}

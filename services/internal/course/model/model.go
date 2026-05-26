package model

import "time"

type Course struct {
	Tag   string
	Name  string
	Views int
}

type CourseFile struct {
	ID               string
	BlobName         string
	Name             string
	Type             string
	Size             int
	Visible          bool
	Reviewed         bool
	VtReport         *VTReportJson
	CourseTag        string
	DownloadCount    int
	CreatedAt        time.Time
	UserId           *int64
	SessionId        *int64
	ReviewedAt       *time.Time
}

type VTReportJson struct {
	Malicious        int `json:"malicious"`
	Suspicious       int `json:"suspicious"`
	Undetected       int `json:"undetected"`
	Harmless         int `json:"harmless"`
	Timeout          int `json:"timeout"`
	ConfirmedTimeout int `json:"confirmed-timeout"`
	Failure          int `json:"failure"`
	TypeUnsupported  int `json:"type-unsupported"`
}

type FileAccessToken struct {
	ClientAddress string
	QueryParams   string
	ExpiresOn     time.Time
	CreatedAt     time.Time
}

package database

import (
	"context"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	v1 "github.com/osamashannak/uaeu-space/services/internal/api/v1"
	"github.com/osamashannak/uaeu-space/services/internal/course/model"
)

func (db *CourseDB) GetCourses(ctx context.Context) ([]v1.CourseInList, error) {
	var courses = make([]v1.CourseInList, 0)

	rows, err := db.Db.Pool.Query(ctx, `SELECT name, tag FROM course.course ORDER BY views DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var (
			name string
			tag  string
		)

		err := rows.Scan(&name, &tag)
		if err != nil {
			return nil, err
		}

		courses = append(courses, v1.CourseInList{
			Name: name,
			Tag:  tag,
		})
	}

	return courses, nil
}

func (db *CourseDB) GetCourse(ctx context.Context, tag string) (*v1.CourseInList, error) {
	var course v1.CourseInList

	err := db.Db.Pool.QueryRow(ctx, `SELECT name, tag FROM course.course WHERE tag = UPPER($1)`, tag).Scan(&course.Name, &course.Tag)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	err = db.incrementCourseViews(ctx, tag)
	if err != nil {
		return nil, err
	}

	return &course, nil
}

func (db *CourseDB) GetCourseFiles(ctx context.Context, tag string) (*[]v1.File, error) {
	rows, err := db.Db.Pool.Query(ctx, `
SELECT  
    id, 
    name, 
    type,
    size,  
    download_count, 
    created_at 
FROM course.file f 
WHERE course_tag = $1 AND f.visible 
ORDER BY f.created_at DESC`, tag)

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	files := make([]v1.File, 0)

	for rows.Next() {
		var file v1.File

		err := rows.Scan(
			&file.ID,
			&file.Name,
			&file.Type,
			&file.Size,
			&file.DownloadCount,
			&file.CreatedAt,
		)

		if err != nil {
			return nil, err
		}

		files = append(files, file)

	}

	return &files, nil
}

func (db *CourseDB) incrementCourseViews(ctx context.Context, tag string) error {
	ct, err := db.Db.Pool.Exec(ctx, `UPDATE course.course SET views = views + 1 WHERE tag = UPPER($1)`, tag)

	if err != nil {
		return err
	}

	if ct.RowsAffected() == 0 {
		return fmt.Errorf("no course found with tag %q", tag)
	}

	return err
}

func (db *CourseDB) GetCourseFileBlobName(ctx context.Context, id string) (*string, error) {
	var blobName string

	err := db.Db.Pool.QueryRow(ctx, `SELECT blob_name FROM course.file WHERE id = $1 AND visible`, id).Scan(&blobName)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	return &blobName, nil
}

func (db *CourseDB) IncrementCourseFileDownloadCount(ctx context.Context, id string) error {
	ct, err := db.Db.Pool.Exec(ctx, `UPDATE course.file SET download_count = download_count + 1 WHERE id = $1`, id)

	if err != nil {
		return err
	}

	if ct.RowsAffected() == 0 {
		return fmt.Errorf("no course file found with id %s", id)
	}

	return nil
}

func (db *CourseDB) GetAccessToken(ctx context.Context, ipAddress string) (*model.FileAccessToken, error) {
	var accessToken model.FileAccessToken

	err := db.Db.Pool.QueryRow(ctx, `SELECT 
    client_address, query_params, expires_on, created_at 
FROM course.access_token 
WHERE client_address = $1`, ipAddress).Scan(&accessToken.ClientAddress, &accessToken.QueryParams, &accessToken.ExpiresOn, &accessToken.CreatedAt)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	return &accessToken, nil
}

func (db *CourseDB) InsertAccessToken(ctx context.Context, accessToken *model.FileAccessToken) error {
	_, err := db.Db.Pool.Exec(ctx, `INSERT INTO 
    course.access_token (client_address, query_params, expires_on, created_at) VALUES ($1, $2, $3, $4)`,
		accessToken.ClientAddress, accessToken.QueryParams, accessToken.ExpiresOn, accessToken.CreatedAt)

	return err
}

func (db *CourseDB) UpdateAccessToken(ctx context.Context, accessToken *model.FileAccessToken) error {
	_, err := db.Db.Pool.Exec(ctx, `UPDATE course.access_token SET query_params = $1, expires_on = $2 WHERE client_address = $3`,
		accessToken.QueryParams, accessToken.ExpiresOn, accessToken.ClientAddress)

	return err
}

func (db *CourseDB) InsertCourseFile(ctx context.Context, file *model.CourseFile) error {
	_, err := db.Db.Pool.Exec(ctx, `INSERT INTO 
	course.file (id, course_tag, name, type, size, blob_name, user_id, session_id)
	VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		file.ID, file.CourseTag, file.Name, file.Type, file.Size, file.BlobName, file.UserId, file.SessionId)

	return err
}

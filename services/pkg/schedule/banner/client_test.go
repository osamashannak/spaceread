package banner

import (
	"os"
	"testing"
	"time"
)

func TestMapRawToCleanFiltersFinalMeetingsAndMapsFaculty(t *testing.T) {
	classMeeting := rawMeeting{}
	classMeeting.MeetingTime.BeginTime = "1200"
	classMeeting.MeetingTime.EndTime = "1350"
	classMeeting.MeetingTime.Building = "F3"
	classMeeting.MeetingTime.Room = "101"
	classMeeting.MeetingTime.MeetingType = "CLAS"
	classMeeting.MeetingTime.Tuesday = true
	classMeeting.MeetingTime.Thursday = true

	finalMeeting := rawMeeting{}
	finalMeeting.MeetingTime.BeginTime = "0900"
	finalMeeting.MeetingTime.EndTime = "1100"
	finalMeeting.MeetingTime.Building = "F1"
	finalMeeting.MeetingTime.Room = "201"
	finalMeeting.MeetingTime.MeetingType = "FINL"
	finalMeeting.MeetingTime.Monday = true

	raw := []rawSection{
		{
			CRN:            "12345",
			Subject:        "COMP",
			CourseNumber:   "350",
			Title:          "Software Engineering",
			SeatsAvailable: 12,
			Faculty: []rawFaculty{
				{
					Email:       "maya.hassan@example.edu",
					DisplayName: "Maya Hassan",
				},
			},
			Meetings: []rawMeeting{
				classMeeting,
				finalMeeting,
			},
		},
	}

	clean := mapRawToClean(raw)
	if len(clean) != 1 {
		t.Fatalf("expected 1 section, got %d", len(clean))
	}

	section := clean[0]
	if section.CRN != "12345" || section.Subject != "COMP" || section.CourseNumber != "350" || section.Title != "Software Engineering" {
		t.Fatalf("section fields were not mapped correctly: %+v", section)
	}

	if len(section.Faculty) != 1 {
		t.Fatalf("expected 1 faculty member, got %d", len(section.Faculty))
	}
	if section.Faculty[0].Name != "Maya Hassan" || section.Faculty[0].Email != "maya.hassan@example.edu" {
		t.Fatalf("faculty fields were not mapped correctly: %+v", section.Faculty[0])
	}

	if len(section.Meetings) != 1 {
		t.Fatalf("expected final exam meeting to be filtered, got %d meetings", len(section.Meetings))
	}
	meeting := section.Meetings[0]
	if meeting.Type != "CLAS" || meeting.StartTime != "1200" || meeting.EndTime != "1350" || meeting.Building != "F3" || meeting.Room != "101" {
		t.Fatalf("meeting fields were not mapped correctly: %+v", meeting)
	}
	if len(meeting.Days) != 2 || meeting.Days[0] != time.Tuesday || meeting.Days[1] != time.Thursday {
		t.Fatalf("meeting days were not mapped correctly: %+v", meeting.Days)
	}
}

func TestFetchAllCoursesLive(t *testing.T) {
	if os.Getenv("BANNER_LIVE_TEST") != "1" {
		t.Skip("set BANNER_LIVE_TEST=1 to hit the live UAEU Banner endpoint")
	}

	term := os.Getenv("UAEU_BANNER_TERM")
	if term == "" {
		term = "202620"
	}

	sections, err := New().FetchAllCourses(term)
	if err != nil {
		t.Fatalf("FetchAllCourses(%q) failed: %v", term, err)
	}
	if len(sections) == 0 {
		t.Fatalf("FetchAllCourses(%q) returned no sections", term)
	}

	hasFacultyEmail := false
	facultyEmailCount := 0
	for _, section := range sections {
		if section.CRN == "" || section.Subject == "" || section.CourseNumber == "" || section.Title == "" {
			t.Fatalf("section is missing identifying fields: %+v", section)
		}
		for _, faculty := range section.Faculty {
			if faculty.Email != "" {
				hasFacultyEmail = true
				facultyEmailCount++
			}
		}
	}
	t.Logf("fetched %d sections for term %s with %d faculty email entries", len(sections), term, facultyEmailCount)
	if !hasFacultyEmail {
		t.Fatalf("FetchAllCourses(%q) returned %d sections but no faculty emails", term, len(sections))
	}
}

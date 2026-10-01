package course

import (
	"archive/zip"
	"bufio"
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"net/url"
	"path"
	"strings"
)

const (
	maxOfficeEntries       = 10000
	maxOfficeExpandedBytes = 512 << 20
	maxOfficeMetadataBytes = 4 << 20
	maxOfficeMainBytes     = 64 << 20
	packageContentTypesNS  = "http://schemas.openxmlformats.org/package/2006/content-types"
	packageRelationshipsNS = "http://schemas.openxmlformats.org/package/2006/relationships"
)

type officeMaterialFormat struct {
	mainContentType string
	root            string
	namespace       string
	strictNamespace string
}

var officeMaterialFormats = map[string]officeMaterialFormat{
	".docx": {
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
		"document", "http://schemas.openxmlformats.org/wordprocessingml/2006/main", "http://purl.oclc.org/ooxml/wordprocessingml/main",
	},
	".pptx": {
		"application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
		"presentation", "http://schemas.openxmlformats.org/presentationml/2006/main", "http://purl.oclc.org/ooxml/presentationml/main",
	},
	".xlsx": {
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
		"workbook", "http://schemas.openxmlformats.org/spreadsheetml/2006/main", "http://purl.oclc.org/ooxml/spreadsheetml/main",
	},
}

// Validate the OPC container, its main-part relationship/content type, and the
// main XML document. This is bounded format validation, not malware detection
// or complete OOXML schema validation. No archive members are extracted.
func validateOfficeMaterial(contents []byte, format officeMaterialFormat) error {
	invalid := func() error { return fmt.Errorf("file is not a valid Office document of the selected type") }
	if !bytes.HasPrefix(contents, []byte("PK\x03\x04")) {
		return invalid()
	}
	archive, err := zip.NewReader(bytes.NewReader(contents), int64(len(contents)))
	if err != nil || len(archive.File) > maxOfficeEntries {
		return invalid()
	}
	parts := make(map[string]*zip.File, len(archive.File))
	var expanded uint64
	for _, part := range archive.File {
		name := strings.TrimSuffix(part.Name, "/")
		if name == "" || strings.ContainsAny(name, `\:`) || strings.HasPrefix(name, "/") || path.Clean(name) != name ||
			name == ".." || strings.HasPrefix(name, "../") || part.Flags&1 != 0 ||
			(!part.Mode().IsRegular() && !part.FileInfo().IsDir()) {
			return invalid()
		}
		if part.UncompressedSize64 > maxOfficeExpandedBytes-expanded {
			return fmt.Errorf("Office document exceeds the expanded size limit")
		}
		expanded += part.UncompressedSize64
		key := strings.ToLower(part.Name)
		if _, duplicate := parts[key]; duplicate {
			return invalid()
		}
		parts[key] = part
	}

	var relationships struct {
		Items []struct {
			Type       string `xml:"Type,attr"`
			Target     string `xml:"Target,attr"`
			TargetMode string `xml:"TargetMode,attr"`
		} `xml:"http://schemas.openxmlformats.org/package/2006/relationships Relationship"`
	}
	if err := readOfficeMetadata(parts["_rels/.rels"], xml.Name{Space: packageRelationshipsNS, Local: "Relationships"}, &relationships); err != nil {
		return invalid()
	}
	mainPart := ""
	for _, relationship := range relationships.Items {
		if relationship.Type != "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" &&
			relationship.Type != "http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument" {
			continue
		}
		if mainPart != "" || (relationship.TargetMode != "" && relationship.TargetMode != "Internal") {
			return invalid()
		}
		mainPart, err = officePartName(relationship.Target)
		if err != nil {
			return invalid()
		}
	}
	if mainPart == "" || parts[mainPart] == nil {
		return invalid()
	}

	var contentTypes struct {
		Overrides []struct {
			PartName    string `xml:"PartName,attr"`
			ContentType string `xml:"ContentType,attr"`
		} `xml:"http://schemas.openxmlformats.org/package/2006/content-types Override"`
		Defaults []struct {
			Extension   string `xml:"Extension,attr"`
			ContentType string `xml:"ContentType,attr"`
		} `xml:"http://schemas.openxmlformats.org/package/2006/content-types Default"`
	}
	if err := readOfficeMetadata(parts["[content_types].xml"], xml.Name{Space: packageContentTypesNS, Local: "Types"}, &contentTypes); err != nil {
		return invalid()
	}
	typesByPart := make(map[string]string)
	for _, override := range contentTypes.Overrides {
		name, err := officePartName(override.PartName)
		if err != nil || typesByPart[name] != "" || override.ContentType == "" {
			return invalid()
		}
		typesByPart[name] = override.ContentType
	}
	defaults := make(map[string]string)
	for _, entry := range contentTypes.Defaults {
		ext := strings.ToLower(entry.Extension)
		if ext == "" || defaults[ext] != "" || entry.ContentType == "" {
			return invalid()
		}
		defaults[ext] = entry.ContentType
	}
	mainType := typesByPart[mainPart]
	if mainType == "" {
		mainType = defaults[strings.TrimPrefix(path.Ext(mainPart), ".")]
	}
	if mainType != format.mainContentType {
		return invalid()
	}

	main := parts[mainPart]
	if main.UncompressedSize64 > maxOfficeMainBytes {
		return fmt.Errorf("Office document main XML exceeds the size limit")
	}
	reader, err := main.Open()
	if err != nil {
		return invalid()
	}
	defer reader.Close()
	root, err := validateOfficeXML(io.LimitReader(reader, maxOfficeMainBytes+1))
	if err != nil || root.Local != format.root || (root.Space != format.namespace && root.Space != format.strictNamespace) {
		return invalid()
	}
	return nil
}

func officePartName(target string) (string, error) {
	u, err := url.Parse(target)
	if err != nil || u.IsAbs() || u.Host != "" || u.ForceQuery || u.RawQuery != "" || u.Fragment != "" {
		return "", fmt.Errorf("invalid Office part URI")
	}
	name := strings.TrimPrefix(u.Path, "/")
	if name == "" || strings.ContainsAny(name, `\:`) || path.Clean(name) != name ||
		name == ".." || strings.HasPrefix(name, "../") || strings.HasPrefix(name, "/") {
		return "", fmt.Errorf("invalid Office part path")
	}
	return strings.ToLower(name), nil
}

func readOfficeMetadata(part *zip.File, expectedRoot xml.Name, output any) error {
	if part == nil || part.UncompressedSize64 > maxOfficeMetadataBytes {
		return fmt.Errorf("missing or oversized Office metadata")
	}
	reader, err := part.Open()
	if err != nil {
		return err
	}
	defer reader.Close()
	contents, err := io.ReadAll(io.LimitReader(reader, maxOfficeMetadataBytes+1))
	if err != nil || len(contents) > maxOfficeMetadataBytes {
		return fmt.Errorf("invalid Office metadata")
	}
	root, err := validateOfficeXML(bytes.NewReader(contents))
	if err != nil || root != expectedRoot {
		return fmt.Errorf("invalid Office metadata XML")
	}
	return xml.Unmarshal(contents, output)
}

// Consume the whole XML stream (and ZIP checksum), reject DTDs, extra roots,
// malformed trailing content, and excessive nesting before unmarshalling metadata.
func validateOfficeXML(reader io.Reader) (xml.Name, error) {
	buffered := bufio.NewReader(reader)
	if prefix, _ := buffered.Peek(3); bytes.Equal(prefix, []byte{0xef, 0xbb, 0xbf}) {
		_, _ = buffered.Discard(3)
	}
	decoder := xml.NewDecoder(buffered)
	var root xml.Name
	depth := 0
	for {
		token, err := decoder.Token()
		if err == io.EOF {
			if root.Local == "" || depth != 0 {
				return root, fmt.Errorf("incomplete Office XML")
			}
			return root, nil
		}
		if err != nil {
			return root, err
		}
		switch token := token.(type) {
		case xml.StartElement:
			if depth == 0 {
				if root.Local != "" {
					return root, fmt.Errorf("multiple Office XML roots")
				}
				root = token.Name
			}
			depth++
			if depth > 128 {
				return root, fmt.Errorf("Office XML nesting limit exceeded")
			}
		case xml.EndElement:
			depth--
		case xml.CharData:
			if depth == 0 && len(bytes.TrimSpace(token)) != 0 {
				return root, fmt.Errorf("content outside Office XML root")
			}
		case xml.Directive:
			return root, fmt.Errorf("Office XML directives are not allowed")
		}
	}
}

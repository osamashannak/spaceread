package course

import (
	"encoding/binary"
	"fmt"
	"strings"
	"unicode/utf16"
)

// Legacy .doc/.ppt files are OLE Compound File Binary containers (MS-CFB).
// We parse only the header, FAT and directory to list entry names: enough to
// confirm the main stream exists and to reject known-dangerous parts.
// Stream contents are never read.

var cfbMagic = []byte{0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1}

const (
	cfbEndOfChain = 0xfffffffe
	cfbFreeSect   = 0xffffffff
	cfbMaxRegSect = 0xfffffffa
	cfbMaxEntries = 100000

	cfbStorage = 1
	cfbStream  = 2
	cfbRoot    = 5
)

var legacyOfficeFormats = map[string]string{
	".doc": "WordDocument",
	".ppt": "PowerPoint Document",
}

// Entry names (lowercase) that mark macros, packaged files or encrypted
// payloads that can't be reviewed. PowerPoint stores VBA compressed inside its
// main stream, so .ppt macros are not detectable here.
var blockedLegacyOfficeEntries = map[string]string{
	"macros":           "macros",
	"_vba_project_cur": "macros",
	"_vba_project":     "macros",
	"vba":              "macros",
	"\x01ole10native":  "embedded packaged files",
	"encryptedpackage": "encryption",
	"encryptioninfo":   "encryption",
}

type cfbEntry struct {
	name string
	kind byte
}

func validateLegacyOffice(contents []byte, mainStream string) error {
	invalid := fmt.Errorf("file is not a valid Office document of the selected type")
	entries, err := readCFBDirectory(contents)
	if err != nil {
		return invalid
	}
	found := false
	for _, entry := range entries {
		if reason, blocked := blockedLegacyOfficeEntries[strings.ToLower(entry.name)]; blocked {
			return fmt.Errorf("Office documents with %s are not allowed", reason)
		}
		if entry.kind == cfbStream && entry.name == mainStream {
			found = true
		}
	}
	if !found {
		return invalid
	}
	return nil
}

func readCFBDirectory(data []byte) ([]cfbEntry, error) {
	if len(data) < 512 || string(data[:8]) != string(cfbMagic) {
		return nil, fmt.Errorf("not a compound file")
	}
	u16 := func(b []byte, off int) uint16 { return binary.LittleEndian.Uint16(b[off:]) }
	u32 := func(b []byte, off int) uint32 { return binary.LittleEndian.Uint32(b[off:]) }

	major, shift := u16(data, 0x1a), u16(data, 0x1e)
	if u16(data, 0x1c) != 0xfffe || !((major == 3 && shift == 9) || (major == 4 && shift == 12)) {
		return nil, fmt.Errorf("unsupported compound file header")
	}
	sectorSize := 1 << shift
	sectorCount := uint32((len(data) + sectorSize - 1) / sectorSize) // upper bound, incl. header

	// Sectors may be short at the end of the file; missing bytes read as zero.
	sector := func(n uint32) ([]byte, error) {
		if n >= sectorCount {
			return nil, fmt.Errorf("sector out of range")
		}
		start := (int(n) + 1) * sectorSize
		if start >= len(data) {
			return nil, fmt.Errorf("sector out of range")
		}
		end := start + sectorSize
		if end <= len(data) {
			return data[start:end], nil
		}
		buf := make([]byte, sectorSize)
		copy(buf, data[start:])
		return buf, nil
	}

	// Collect FAT sector numbers from the header DIFAT and any DIFAT sectors.
	numFAT := u32(data, 0x2c)
	if numFAT == 0 || numFAT > sectorCount {
		return nil, fmt.Errorf("invalid FAT size")
	}
	fatSectors := make([]uint32, 0, numFAT)
	for i := 0; i < 109 && uint32(len(fatSectors)) < numFAT; i++ {
		fatSectors = append(fatSectors, u32(data, 0x4c+i*4))
	}
	next, remaining := u32(data, 0x44), u32(data, 0x48)
	seen := map[uint32]bool{}
	for uint32(len(fatSectors)) < numFAT {
		if remaining == 0 || next > cfbMaxRegSect || seen[next] {
			return nil, fmt.Errorf("invalid DIFAT chain")
		}
		seen[next] = true
		remaining--
		buf, err := sector(next)
		if err != nil {
			return nil, err
		}
		perSector := sectorSize/4 - 1
		for i := 0; i < perSector && uint32(len(fatSectors)) < numFAT; i++ {
			fatSectors = append(fatSectors, u32(buf, i*4))
		}
		next = u32(buf, perSector*4)
	}

	fat := make([]uint32, 0, int(numFAT)*sectorSize/4)
	for _, n := range fatSectors {
		buf, err := sector(n)
		if err != nil {
			return nil, err
		}
		for i := 0; i < sectorSize; i += 4 {
			fat = append(fat, u32(buf, i))
		}
	}

	// Walk the directory chain, guarding against loops.
	var entries []cfbEntry
	seen = map[uint32]bool{}
	for n := u32(data, 0x30); n != cfbEndOfChain; {
		if n > cfbMaxRegSect || int(n) >= len(fat) || seen[n] {
			return nil, fmt.Errorf("invalid directory chain")
		}
		seen[n] = true
		buf, err := sector(n)
		if err != nil {
			return nil, err
		}
		for off := 0; off+128 <= sectorSize; off += 128 {
			raw := buf[off : off+128]
			kind := raw[0x42]
			if kind == 0 {
				continue
			}
			nameLen := int(u16(raw, 0x40))
			if nameLen < 2 || nameLen > 64 || nameLen%2 != 0 {
				return nil, fmt.Errorf("invalid directory entry name")
			}
			units := make([]uint16, nameLen/2-1)
			for i := range units {
				units[i] = u16(raw, i*2)
			}
			if len(entries) == 0 && kind != cfbRoot {
				return nil, fmt.Errorf("missing root entry")
			}
			entries = append(entries, cfbEntry{name: string(utf16.Decode(units)), kind: kind})
			if len(entries) > cfbMaxEntries {
				return nil, fmt.Errorf("too many directory entries")
			}
		}
		n = fat[n]
	}
	if len(entries) == 0 {
		return nil, fmt.Errorf("empty directory")
	}
	return entries, nil
}

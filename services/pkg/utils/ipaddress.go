package utils

import (
	"encoding/json"
	"fmt"
	"github.com/osamashannak/uaeu-space/services/pkg/cache"
	"io"
	"net"
	"net/http"
	"strings"
	"time"
)

type ipPrefix struct {
	IPv4Prefix string `json:"ipv4Prefix"`
	IPv6Prefix string `json:"ipv6Prefix"`
}

type ipJSON struct {
	Prefixes []ipPrefix `json:"prefixes"`
}

var (
	ipCache = cache.New[[]*net.IPNet](time.Hour)
)

// fetchRanges downloads IP ranges from a given URL
func fetchRanges(url string) ([]*net.IPNet, error) {
	resp, err := http.Get(url)
	if err != nil {
		return nil, fmt.Errorf("fetch %s: %w", url, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", url, err)
	}

	var data ipJSON
	if err := json.Unmarshal(body, &data); err != nil {
		return nil, fmt.Errorf("unmarshal %s: %w", url, err)
	}

	var nets []*net.IPNet
	for _, p := range data.Prefixes {
		if p.IPv4Prefix != "" {
			if _, ipnet, err := net.ParseCIDR(p.IPv4Prefix); err == nil {
				nets = append(nets, ipnet)
			}
		}
		if p.IPv6Prefix != "" {
			if _, ipnet, err := net.ParseCIDR(p.IPv6Prefix); err == nil {
				nets = append(nets, ipnet)
			}
		}
	}
	return nets, nil
}

// getGoogleServiceRanges returns goog.json - cloud.json
func getGoogleServiceRanges() ([]*net.IPNet, error) {
	if ranges, found := ipCache.Get("goog-service"); found {
		return ranges, nil
	}

	googNets, err := fetchRanges("https://www.gstatic.com/ipranges/goog.json")
	if err != nil {
		return nil, err
	}

	cloudNets, err := fetchRanges("https://www.gstatic.com/ipranges/cloud.json")
	if err != nil {
		return nil, err
	}

	var result []*net.IPNet
	for _, g := range googNets {
		if !coveredByAny(g, cloudNets) {
			result = append(result, g)
		}
	}

	ipCache.Set("goog-service", result)
	return result, nil
}

// coveredByAny checks if g is inside any cloud range
func coveredByAny(g *net.IPNet, clouds []*net.IPNet) bool {
	for _, c := range clouds {
		if cidrContains(c, g) {
			return true
		}
	}
	return false
}

// cidrContains checks if netA contains the network netB
func cidrContains(netA, netB *net.IPNet) bool {
	return netA.Contains(netB.IP)
}

// IsGoogleServiceIP returns true if ip belongs to Google service ranges
func IsGoogleServiceIP(ip net.IP) bool {
	ranges, err := getGoogleServiceRanges()
	if err != nil {
		return false
	}
	for _, r := range ranges {
		if r.Contains(ip) {
			return true
		}
	}
	return false
}

// GetClientIP extracts the first non-Google IP from X-Forwarded-For, falling
// back to RemoteAddr for local development and direct requests.
func GetClientIP(r *http.Request) string {
	if r == nil {
		return ""
	}

	xffHeader := r.Header.Get("X-Forwarded-For")
	if xffHeader != "" {
		ips := strings.Split(xffHeader, ",")
		var fallbackIPv6 string
		for _, ipstr := range ips {
			parsed := parseClientIP(ipstr)
			if parsed == nil {
				continue
			}
			// Skip Google proxies.
			if shouldSkipGoogleServiceIP(parsed) {
				continue
			}
			// Prefer IPv4.
			if v4 := parsed.To4(); v4 != nil {
				return v4.String()
			}
			if fallbackIPv6 == "" {
				fallbackIPv6 = parsed.String()
			}
		}
		if fallbackIPv6 != "" {
			return fallbackIPv6
		}
	}

	if ip := parseClientIP(r.RemoteAddr); ip != nil {
		return ip.String()
	}

	return ""
}

func parseClientIP(value string) net.IP {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}

	if host, _, err := net.SplitHostPort(value); err == nil {
		value = host
	}

	value = strings.Trim(value, "[]")
	return net.ParseIP(value)
}

func shouldSkipGoogleServiceIP(ip net.IP) bool {
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() {
		return false
	}
	return IsGoogleServiceIP(ip)
}

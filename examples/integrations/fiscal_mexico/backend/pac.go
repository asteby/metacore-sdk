package main

// pac.go — PAC (factura.com) client. Same logic as the webhook version but
// uses the host-provided hostFetch(...) instead of net/http so that outbound
// traffic is gated by the manifest's capabilities. uuid.NewString is
// replaced with a small deterministic-ish generator because TinyGo's crypto
// surface is limited and pulling github.com/google/uuid bloats the .wasm.

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strconv"
	"strings"
	"time"
)

type pacClient struct {
	apiKey string
	env    string // "sandbox" | "live"
}

func newPACClient(apiKey, env string) *pacClient {
	if env == "" {
		env = "sandbox"
	}
	return &pacClient{apiKey: apiKey, env: env}
}

type stampInput struct {
	RFCReceptor, RFCEmisor                       string
	Total                                        float64
	CFDIUsage, PaymentForm, PaymentMethod        string
	TestMode                                     bool
}

type stampOutput struct {
	FiscalUUID, XMLURL, PDFURL string
	StampedAt                  string // ISO-8601, stringified here because we have no time.Time in response
	Environment                string
}

type cancelInput struct {
	FiscalUUID, Reason, ReplacementUUID string
}

type cancelOutput struct {
	CancelledAt string
	Environment string
}

// Stamp — reference implementation. A production addon would build+sign XML
// and POST to https://{env}.factura.com via hostFetch.
func (p *pacClient) Stamp(in stampInput) (*stampOutput, error) {
	if !isValidRFC(in.RFCEmisor) {
		return nil, errors.New("invalid rfc_emisor")
	}
	if !isValidRFC(in.RFCReceptor) {
		return nil, errors.New("invalid rfc_receptor")
	}
	if in.Total <= 0 {
		return nil, errors.New("total must be > 0")
	}
	env := p.env
	if in.TestMode {
		env = "sandbox"
	}

	// Sketch the outbound call so the capability is exercised in real builds.
	// The reference build short-circuits on empty api_key.
	if p.apiKey != "" {
		body := []byte(`{"rfc_emisor":"` + in.RFCEmisor +
			`","rfc_receptor":"` + in.RFCReceptor +
			`","total":` + strconv.FormatFloat(in.Total, 'f', 2, 64) + `}`)
		if _, err := hostFetch("https://"+env+".factura.com/cfdi/stamp", "POST", body); err != nil {
			return nil, err
		}
	}

	u := newUUID()
	return &stampOutput{
		FiscalUUID:  strings.ToUpper(u),
		XMLURL:      "https://" + env + ".factura.com/cfdi/" + u + ".xml",
		PDFURL:      "https://" + env + ".factura.com/cfdi/" + u + ".pdf",
		StampedAt:   time.Now().UTC().Format("2006-01-02T15:04:05Z"),
		Environment: env,
	}, nil
}

// Cancel — reason codes per SAT: 01 requires replacement_uuid.
func (p *pacClient) Cancel(in cancelInput) (*cancelOutput, error) {
	if len(in.FiscalUUID) != 36 {
		return nil, errors.New("invalid fiscal_uuid")
	}
	switch in.Reason {
	case "01":
		if in.ReplacementUUID == "" {
			return nil, errors.New("reason 01 requires replacement_uuid")
		}
	case "02", "03", "04":
		// ok
	default:
		return nil, errors.New("invalid cancel reason")
	}
	if p.apiKey != "" {
		body := []byte(`{"fiscal_uuid":"` + in.FiscalUUID + `","reason":"` + in.Reason + `"}`)
		if _, err := hostFetch("https://"+p.env+".factura.com/cfdi/cancel", "POST", body); err != nil {
			return nil, err
		}
	}
	return &cancelOutput{
		CancelledAt: time.Now().UTC().Format("2006-01-02T15:04:05Z"),
		Environment: p.env,
	}, nil
}

func isValidRFC(rfc string) bool {
	n := len(rfc)
	return n == 12 || n == 13
}

// newUUID is a v4-ish UUID generator that avoids pulling google/uuid into
// TinyGo builds. Uses crypto/rand which TinyGo-wasi supports via wasi_random.
func newUUID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = (b[6] & 0x0f) | 0x40 // version 4
	b[8] = (b[8] & 0x3f) | 0x80 // variant RFC4122
	h := hex.EncodeToString(b[:])
	return h[0:8] + "-" + h[8:12] + "-" + h[12:16] + "-" + h[16:20] + "-" + h[20:32]
}

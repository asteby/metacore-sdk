package main

// stamp.go reimplements the former HTTP handler as a pure function. What
// we dropped vs handlers.go:
//   - net/http + json.Decoder round-trip (host does I/O)
//   - Header parsing (X-Metacore-* → embedded in payload instead)
//   - HMAC verify (host authenticated before the call)
//   - writeJSON helper (we just marshal + return)

type stampReq struct {
	RecordID string       `json:"record_id"`
	// Context the host adds to every invocation.
	Invocation string        `json:"invocation"` // "action" | "tool"
	HostSurface string       `json:"host"`        // "ops" | "link"
	Tenant     string        `json:"tenant"`
	Payload    stampPayload `json:"payload"`
}

type stampPayload struct {
	InvoiceID     string  `json:"invoice_id,omitempty"`
	RFCEmisor     string  `json:"rfc_emisor,omitempty"`
	RFCReceptor   string  `json:"rfc_receptor,omitempty"`
	Total         float64 `json:"total,omitempty"`
	CFDIUsage     string  `json:"cfdi_usage,omitempty"`
	PaymentForm   string  `json:"payment_form,omitempty"`
	PaymentMethod string  `json:"payment_method,omitempty"`
	TestMode      bool    `json:"test_mode,omitempty"`
}

type stampResp struct {
	OK          bool   `json:"ok"`
	Error       string `json:"error,omitempty"`
	FiscalUUID  string `json:"fiscal_uuid,omitempty"`
	XMLURL      string `json:"xml_url,omitempty"`
	PDFURL      string `json:"pdf_url,omitempty"`
	StampedAt   string `json:"stamped_at,omitempty"`
	Environment string `json:"environment,omitempty"`
	Via         string `json:"via,omitempty"`
	Host        string `json:"host,omitempty"`
}

func doStamp(req stampReq) stampResp {
	// Tool-invocation defaults — match manifest input_schema.
	if req.Invocation == "tool" {
		if req.Payload.CFDIUsage == "" {
			req.Payload.CFDIUsage = "G03"
		}
		if req.Payload.PaymentForm == "" {
			req.Payload.PaymentForm = "03"
		}
		if req.Payload.PaymentMethod == "" {
			req.Payload.PaymentMethod = "PUE"
		}
	}

	pac := newPACClient(hostEnvGet("api_key"), hostEnvGet("environment"))
	out, err := pac.Stamp(stampInput{
		RFCReceptor:   req.Payload.RFCReceptor,
		RFCEmisor:     req.Payload.RFCEmisor,
		Total:         req.Payload.Total,
		CFDIUsage:     req.Payload.CFDIUsage,
		PaymentForm:   req.Payload.PaymentForm,
		PaymentMethod: req.Payload.PaymentMethod,
		TestMode:      req.Payload.TestMode,
	})
	if err != nil {
		hostLog("fiscal-mexico stamp FAIL tenant=" + req.Tenant + " err=" + err.Error())
		return stampResp{OK: false, Error: err.Error()}
	}
	hostLog("fiscal-mexico stamp OK tenant=" + req.Tenant + " record=" + req.RecordID + " uuid=" + out.FiscalUUID)
	return stampResp{
		OK:          true,
		FiscalUUID:  out.FiscalUUID,
		XMLURL:      out.XMLURL,
		PDFURL:      out.PDFURL,
		StampedAt:   out.StampedAt,
		Environment: out.Environment,
		Via:         req.Invocation,
		Host:        req.HostSurface,
	}
}

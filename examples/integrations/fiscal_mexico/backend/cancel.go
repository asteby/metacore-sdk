package main

// cancel.go — see stamp.go header for the architectural note.

type cancelReq struct {
	RecordID    string        `json:"record_id"`
	Invocation  string        `json:"invocation"`
	HostSurface string        `json:"host"`
	Tenant      string        `json:"tenant"`
	Payload     cancelPayload `json:"payload"`
}

type cancelPayload struct {
	FiscalUUID      string `json:"fiscal_uuid"`
	CancelReason    string `json:"cancel_reason"`
	ReplacementUUID string `json:"replacement_uuid,omitempty"`
}

type cancelResp struct {
	OK          bool   `json:"ok"`
	Error       string `json:"error,omitempty"`
	CancelledAt string `json:"cancelled_at,omitempty"`
	Environment string `json:"environment,omitempty"`
	Via         string `json:"via,omitempty"`
	Host        string `json:"host,omitempty"`
}

func doCancel(req cancelReq) cancelResp {
	pac := newPACClient(hostEnvGet("api_key"), hostEnvGet("environment"))
	out, err := pac.Cancel(cancelInput{
		FiscalUUID:      req.Payload.FiscalUUID,
		Reason:          req.Payload.CancelReason,
		ReplacementUUID: req.Payload.ReplacementUUID,
	})
	if err != nil {
		hostLog("fiscal-mexico cancel FAIL tenant=" + req.Tenant + " err=" + err.Error())
		return cancelResp{OK: false, Error: err.Error()}
	}
	hostLog("fiscal-mexico cancel OK tenant=" + req.Tenant + " record=" + req.RecordID + " uuid=" + req.Payload.FiscalUUID)
	return cancelResp{
		OK:          true,
		CancelledAt: out.CancelledAt,
		Environment: out.Environment,
		Via:         req.Invocation,
		Host:        req.HostSurface,
	}
}

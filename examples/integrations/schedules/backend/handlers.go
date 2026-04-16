package main

type actionReq struct {
	RecordID    string         `json:"record_id"`
	Invocation  string         `json:"invocation"`
	HostSurface string         `json:"host"`
	Tenant      string         `json:"tenant"`
	Payload     map[string]any `json:"payload"`
}

type actionResp struct {
	OK    bool           `json:"ok"`
	Error string         `json:"error,omitempty"`
	Data  map[string]any `json:"data,omitempty"`
	Via   string         `json:"via,omitempty"`
	Host  string         `json:"host,omitempty"`
}

func doConfirm(req actionReq) actionResp {
	hostLog("schedules confirm OK tenant=" + req.Tenant + " record=" + req.RecordID)
	return actionResp{OK: true, Via: req.Invocation, Host: req.HostSurface,
		Data: map[string]any{"status": "confirmed"}}
}

func doReschedule(req actionReq) actionResp {
	starts, _ := req.Payload["starts_at"].(string)
	ends, _ := req.Payload["ends_at"].(string)
	if starts == "" || ends == "" {
		return actionResp{OK: false, Error: "starts_at and ends_at are required"}
	}
	hostLog("schedules reschedule OK tenant=" + req.Tenant + " record=" + req.RecordID)
	return actionResp{OK: true, Via: req.Invocation, Host: req.HostSurface,
		Data: map[string]any{"starts_at": starts, "ends_at": ends, "status": "scheduled"}}
}

func doCancel(req actionReq) actionResp {
	reason, _ := req.Payload["reason"].(string)
	if reason == "" {
		return actionResp{OK: false, Error: "reason is required"}
	}
	hostLog("schedules cancel OK tenant=" + req.Tenant + " record=" + req.RecordID)
	return actionResp{OK: true, Via: req.Invocation, Host: req.HostSurface,
		Data: map[string]any{"status": "cancelled", "cancel_reason": reason}}
}

func doCreateEvent(req actionReq) actionResp {
	title, _ := req.Payload["title"].(string)
	starts, _ := req.Payload["starts_at"].(string)
	if title == "" || starts == "" {
		return actionResp{OK: false, Error: "title and starts_at are required"}
	}
	return actionResp{OK: true, Via: req.Invocation, Host: req.HostSurface,
		Data: map[string]any{"status": "scheduled", "title": title, "starts_at": starts}}
}

func doListEvents(req actionReq) actionResp {
	return actionResp{OK: true, Via: req.Invocation, Host: req.HostSurface,
		Data: map[string]any{"events": []any{}, "note": "stub — host-side lookup required"}}
}

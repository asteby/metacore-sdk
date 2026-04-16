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

func doResolve(req actionReq) actionResp {
	notes, _ := req.Payload["resolution_notes"].(string)
	if notes == "" {
		return actionResp{OK: false, Error: "resolution_notes is required"}
	}
	hostLog("tickets resolve OK tenant=" + req.Tenant + " record=" + req.RecordID)
	return actionResp{OK: true, Via: req.Invocation, Host: req.HostSurface,
		Data: map[string]any{"status": "resolved", "resolution_notes": notes}}
}

func doReassign(req actionReq) actionResp {
	assignee, _ := req.Payload["assignee_id"].(string)
	if assignee == "" {
		return actionResp{OK: false, Error: "assignee_id is required"}
	}
	if len(assignee) != 36 {
		return actionResp{OK: false, Error: "assignee_id must be a UUID"}
	}
	hostLog("tickets reassign OK tenant=" + req.Tenant + " record=" + req.RecordID)
	return actionResp{OK: true, Via: req.Invocation, Host: req.HostSurface,
		Data: map[string]any{"assignee_id": assignee}}
}

func doCreateTicket(req actionReq) actionResp {
	title, _ := req.Payload["title"].(string)
	desc, _ := req.Payload["description"].(string)
	if title == "" || desc == "" {
		return actionResp{OK: false, Error: "title and description are required"}
	}
	priority, _ := req.Payload["priority"].(string)
	if priority == "" {
		priority = "medium"
	}
	return actionResp{OK: true, Via: req.Invocation, Host: req.HostSurface,
		Data: map[string]any{"status": "open", "title": title, "priority": priority}}
}

func doUpdateTicket(req actionReq) actionResp {
	id, _ := req.Payload["ticket_id"].(string)
	if id == "" {
		return actionResp{OK: false, Error: "ticket_id is required"}
	}
	return actionResp{OK: true, Via: req.Invocation, Host: req.HostSurface,
		Data: map[string]any{"ticket_id": id, "updated": true}}
}

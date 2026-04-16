package main

// handlers.go — pure logic functions invoked by main.go exports.
// The kernel already authenticated the caller and enforced capabilities.

type actionReq struct {
	RecordID    string         `json:"record_id"`
	Invocation  string         `json:"invocation"` // "action" | "tool"
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

func doFulfill(req actionReq) actionResp {
	tracking, _ := req.Payload["tracking_number"].(string)
	carrier, _ := req.Payload["carrier"].(string)
	if tracking == "" {
		return actionResp{OK: false, Error: "tracking_number is required"}
	}
	if carrier == "" {
		return actionResp{OK: false, Error: "carrier is required"}
	}
	hostLog("orders fulfill OK tenant=" + req.Tenant + " record=" + req.RecordID)
	return actionResp{
		OK:   true,
		Data: map[string]any{"status": "fulfilled", "tracking_number": tracking, "carrier": carrier},
		Via:  req.Invocation,
		Host: req.HostSurface,
	}
}

func doCancel(req actionReq) actionResp {
	reason, _ := req.Payload["reason"].(string)
	if reason == "" {
		return actionResp{OK: false, Error: "reason is required"}
	}
	hostLog("orders cancel OK tenant=" + req.Tenant + " record=" + req.RecordID)
	return actionResp{
		OK:   true,
		Data: map[string]any{"status": "cancelled", "cancel_reason": reason},
		Via:  req.Invocation,
		Host: req.HostSurface,
	}
}

func doCreateOrder(req actionReq) actionResp {
	customerID, _ := req.Payload["customer_id"].(string)
	if customerID == "" {
		return actionResp{OK: false, Error: "customer_id is required"}
	}
	items, hasItems := req.Payload["items"]
	if !hasItems {
		return actionResp{OK: false, Error: "items is required"}
	}
	hostLog("orders create_order OK tenant=" + req.Tenant + " customer=" + customerID)
	return actionResp{
		OK:   true,
		Data: map[string]any{"status": "pending", "customer_id": customerID, "items": items},
		Via:  req.Invocation,
		Host: req.HostSurface,
	}
}

func doGetOrder(req actionReq) actionResp {
	orderID, _ := req.Payload["order_id"].(string)
	if orderID == "" {
		return actionResp{OK: false, Error: "order_id is required"}
	}
	return actionResp{
		OK:   true,
		Data: map[string]any{"order_id": orderID, "status": "unknown", "note": "stub — host-side lookup required"},
		Via:  req.Invocation,
		Host: req.HostSurface,
	}
}

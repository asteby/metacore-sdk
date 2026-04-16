package main

import "strconv"

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

func doUpdateStock(req actionReq) actionResp {
	var qty int64
	switch v := req.Payload["quantity"].(type) {
	case float64:
		qty = int64(v)
	case string:
		n, err := strconv.ParseInt(v, 10, 64)
		if err != nil {
			return actionResp{OK: false, Error: "quantity must be an integer"}
		}
		qty = n
	default:
		return actionResp{OK: false, Error: "quantity is required"}
	}
	if qty < 0 {
		return actionResp{OK: false, Error: "quantity must be >= 0"}
	}
	hostLog("catalog update_stock OK tenant=" + req.Tenant + " record=" + req.RecordID)
	return actionResp{OK: true, Via: req.Invocation, Host: req.HostSurface,
		Data: map[string]any{"stock": qty}}
}

func doTogglePublished(req actionReq) actionResp {
	hostLog("catalog toggle_published OK tenant=" + req.Tenant + " record=" + req.RecordID)
	return actionResp{OK: true, Via: req.Invocation, Host: req.HostSurface,
		Data: map[string]any{"toggled": true}}
}

func doSearchProducts(req actionReq) actionResp {
	query, _ := req.Payload["query"].(string)
	if query == "" {
		return actionResp{OK: false, Error: "query is required"}
	}
	return actionResp{OK: true, Via: req.Invocation, Host: req.HostSurface,
		Data: map[string]any{"query": query, "results": []any{}, "note": "stub — host-side search required"}}
}

func doGetProduct(req actionReq) actionResp {
	sku, _ := req.Payload["sku"].(string)
	id, _ := req.Payload["product_id"].(string)
	if sku == "" && id == "" {
		return actionResp{OK: false, Error: "sku or product_id is required"}
	}
	return actionResp{OK: true, Via: req.Invocation, Host: req.HostSurface,
		Data: map[string]any{"sku": sku, "product_id": id, "note": "stub"}}
}

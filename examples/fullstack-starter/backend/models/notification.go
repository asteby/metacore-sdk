package models

import (
	"github.com/asteby/metacore-kernel/modelbase"
	"github.com/google/uuid"
)

type Notification struct {
	modelbase.BaseUUIDModel
	UserID  *uuid.UUID `gorm:"type:uuid;index" json:"user_id"`
	Title   string     `gorm:"size:255" json:"title"`
	Message string     `gorm:"type:text" json:"message"`
	Type    string     `gorm:"size:30;default:'info'" json:"type"`
	IsRead  bool       `gorm:"default:false;index" json:"is_read"`
	Link    string     `gorm:"size:500" json:"link,omitempty"`
	Icon    string     `gorm:"size:100" json:"icon,omitempty"`
	Image   string     `gorm:"size:500" json:"image,omitempty"`
}

func (Notification) TableName() string { return "notifications" }

func (Notification) DefineTable() modelbase.TableMetadata {
	return modelbase.TableMetadata{
		Title:          "Notifications",
		DefaultPerPage: 20,
		SearchColumns:  []string{"title", "message"},
		Columns: []modelbase.ColumnDef{
			{Key: "title", Label: "Title", Type: "string", Sortable: true},
			{Key: "message", Label: "Message", Type: "string"},
			{Key: "type", Label: "Type", Type: "badge", Sortable: true},
			{Key: "is_read", Label: "Read", Type: "boolean", Sortable: true},
			{Key: "created_at", Label: "Date", Type: "date", Sortable: true},
		},
	}
}

func (Notification) DefineModal() modelbase.ModalMetadata {
	return modelbase.ModalMetadata{
		Title: "Notification",
		Fields: []modelbase.FieldDef{
			{Key: "title", Label: "Title", Type: "text", Required: true},
			{Key: "message", Label: "Message", Type: "textarea", Required: true},
			{Key: "type", Label: "Type", Type: "select", DefaultValue: "info", Options: []modelbase.OptionDef{
				{Label: "Info", Value: "info"},
				{Label: "Success", Value: "success"},
				{Label: "Warning", Value: "warning"},
				{Label: "Error", Value: "error"},
			}},
			{Key: "link", Label: "Link", Type: "text"},
		},
	}
}

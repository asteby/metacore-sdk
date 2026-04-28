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
		Title:          "models.notifications.table.title",
		DefaultPerPage: 20,
		SearchColumns:  []string{"title", "message"},
		Columns: []modelbase.ColumnDef{
			{Key: "title", Label: "models.notifications.table.columns.title", Type: "string", Sortable: true, Filterable: true},
			{Key: "message", Label: "models.notifications.table.columns.message", Type: "string", Filterable: true},
			{Key: "type", Label: "models.notifications.table.columns.type", Type: "badge", Sortable: true, Filterable: true},
			{Key: "is_read", Label: "models.notifications.table.columns.is_read", Type: "boolean", Sortable: true, Filterable: true},
			{Key: "created_at", Label: "models.notifications.table.columns.created_at", Type: "date", Sortable: true, Filterable: true},
		},
	}
}

func (Notification) DefineModal() modelbase.ModalMetadata {
	return modelbase.ModalMetadata{
		Title: "models.notifications.modal.title",
		Fields: []modelbase.FieldDef{
			{Key: "title", Label: "models.notifications.modal.fields.title", Type: "text", Required: true},
			{Key: "message", Label: "models.notifications.modal.fields.message", Type: "textarea", Required: true},
			{Key: "type", Label: "models.notifications.modal.fields.type", Type: "select", DefaultValue: "info", Options: []modelbase.OptionDef{
				{Label: "models.notifications.modal.options.info", Value: "info"},
				{Label: "models.notifications.modal.options.success", Value: "success"},
				{Label: "models.notifications.modal.options.warning", Value: "warning"},
				{Label: "models.notifications.modal.options.error", Value: "error"},
			}},
			{Key: "link", Label: "models.notifications.modal.fields.link", Type: "text"},
		},
	}
}

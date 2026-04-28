package models

import "github.com/asteby/metacore-kernel/modelbase"

// Customer is a demo domain model for managing contacts / clients.
type Customer struct {
	modelbase.BaseUUIDModel
	Name   string `json:"name" gorm:"not null"`
	Email  string `json:"email" gorm:"uniqueIndex"`
	Phone  string `json:"phone"`
	Status string `json:"status" gorm:"default:active"`
	Tags   string `json:"tags"`
}

func (Customer) TableName() string { return "customers" }

func (Customer) DefineTable() modelbase.TableMetadata {
	return modelbase.TableMetadata{
		Title:             "models.customers.table.title",
		SearchColumns:     []string{"name", "email", "phone"},
		SearchPlaceholder: "models.customers.table.search_placeholder",
		EnableCRUDActions: true,
		DefaultPerPage:    20,
		PerPageOptions:    []int{10, 20, 50},
		Columns: []modelbase.ColumnDef{
			{Key: "name", Label: "models.customers.table.columns.name", Type: "text", Sortable: true, Filterable: true},
			{Key: "email", Label: "models.customers.table.columns.email", Type: "text", Sortable: true, Filterable: true},
			{Key: "phone", Label: "models.customers.table.columns.phone", Type: "text", Filterable: true},
			{Key: "status", Label: "models.customers.table.columns.status", Type: "badge", Sortable: true, Filterable: true, UseOptions: true, Options: []modelbase.OptionDef{
				{Value: "active", Label: "models.customers.table.options.active", Color: "green"},
				{Value: "inactive", Label: "models.customers.table.options.inactive", Color: "gray"},
				{Value: "lead", Label: "models.customers.table.options.lead", Color: "blue"},
			}},
			{Key: "tags", Label: "models.customers.table.columns.tags", Type: "text", Filterable: true},
			{Key: "created_at", Label: "models.customers.table.columns.created_at", Type: "date", Sortable: true},
		},
	}
}

func (Customer) DefineModal() modelbase.ModalMetadata {
	return modelbase.ModalMetadata{
		Title:       "models.customers.modal.title",
		CreateTitle: "models.customers.modal.create_title",
		EditTitle:   "models.customers.modal.edit_title",
		DeleteTitle: "models.customers.modal.delete_title",
		Fields: []modelbase.FieldDef{
			{Key: "name", Label: "models.customers.modal.fields.name", Type: "text", Required: true},
			{Key: "email", Label: "models.customers.modal.fields.email", Type: "email", Required: true},
			{Key: "phone", Label: "models.customers.modal.fields.phone", Type: "text"},
			{Key: "status", Label: "models.customers.modal.fields.status", Type: "select", Required: true, DefaultValue: "active", Options: []modelbase.OptionDef{
				{Value: "active", Label: "models.customers.table.options.active"},
				{Value: "inactive", Label: "models.customers.table.options.inactive"},
				{Value: "lead", Label: "models.customers.table.options.lead"},
			}},
			{Key: "tags", Label: "models.customers.modal.fields.tags", Type: "text", Placeholder: "models.customers.modal.fields.tags_placeholder"},
		},
	}
}

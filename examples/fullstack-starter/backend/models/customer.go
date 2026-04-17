package models

import "github.com/asteby/metacore-kernel/modelbase"

// Customer is a demo domain model for managing contacts / clients.
type Customer struct {
	modelbase.BaseUUIDModel
	Name   string `json:"name" gorm:"not null"`
	Email  string `json:"email" gorm:"uniqueIndex"`
	Phone  string `json:"phone"`
	Status string `json:"status" gorm:"default:active"`
	Tags   string `json:"tags"` // comma-separated for simplicity
}

func (Customer) TableName() string { return "customers" }

func (Customer) DefineTable() modelbase.TableMetadata {
	return modelbase.TableMetadata{
		Title:             "Customers",
		SearchColumns:     []string{"name", "email", "phone"},
		SearchPlaceholder: "Search by name, email or phone...",
		EnableCRUDActions: true,
		DefaultPerPage:    20,
		PerPageOptions:    []int{10, 20, 50},
		Columns: []modelbase.ColumnDef{
			{Key: "name", Label: "Name", Type: "text", Sortable: true},
			{Key: "email", Label: "Email", Type: "text", Sortable: true},
			{Key: "phone", Label: "Phone", Type: "text"},
			{Key: "status", Label: "Status", Type: "badge", Sortable: true, Filterable: true, UseOptions: true, Options: []modelbase.OptionDef{
				{Value: "active", Label: "Active", Color: "green"},
				{Value: "inactive", Label: "Inactive", Color: "gray"},
				{Value: "lead", Label: "Lead", Color: "blue"},
			}},
			{Key: "tags", Label: "Tags", Type: "text"},
			{Key: "created_at", Label: "Created", Type: "date", Sortable: true},
		},
	}
}

func (Customer) DefineModal() modelbase.ModalMetadata {
	return modelbase.ModalMetadata{
		Title:       "Customer",
		CreateTitle: "New Customer",
		EditTitle:   "Edit Customer",
		DeleteTitle: "Delete Customer",
		Fields: []modelbase.FieldDef{
			{Key: "name", Label: "Name", Type: "text", Required: true},
			{Key: "email", Label: "Email", Type: "email", Required: true},
			{Key: "phone", Label: "Phone", Type: "text"},
			{Key: "status", Label: "Status", Type: "select", Required: true, DefaultValue: "active", Options: []modelbase.OptionDef{
				{Value: "active", Label: "Active"},
				{Value: "inactive", Label: "Inactive"},
				{Value: "lead", Label: "Lead"},
			}},
			{Key: "tags", Label: "Tags", Type: "text", Placeholder: "vip, wholesale, retail"},
		},
	}
}

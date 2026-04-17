package models

import (
	"github.com/asteby/metacore-kernel/modelbase"
	"github.com/shopspring/decimal"
)

// Product is a demo domain model showcasing metacore's metadata-driven CRUD.
type Product struct {
	modelbase.BaseUUIDModel
	Name        string          `json:"name" gorm:"not null"`
	SKU         string          `json:"sku" gorm:"uniqueIndex"`
	Description string          `json:"description"`
	Price       decimal.Decimal `json:"price" gorm:"type:numeric(12,2);default:0"`
	Stock       int             `json:"stock" gorm:"default:0"`
	Category    string          `json:"category"`
	Status      string          `json:"status" gorm:"default:active"`
}

func (Product) TableName() string { return "products" }

func (Product) DefineTable() modelbase.TableMetadata {
	return modelbase.TableMetadata{
		Title:             "Products",
		SearchColumns:     []string{"name", "sku", "category"},
		SearchPlaceholder: "Search by name, SKU or category...",
		EnableCRUDActions: true,
		DefaultPerPage:    20,
		PerPageOptions:    []int{10, 20, 50},
		Columns: []modelbase.ColumnDef{
			{Key: "name", Label: "Name", Type: "text", Sortable: true},
			{Key: "sku", Label: "SKU", Type: "text", Sortable: true},
			{Key: "price", Label: "Price", Type: "currency", Sortable: true},
			{Key: "stock", Label: "Stock", Type: "number", Sortable: true},
			{Key: "category", Label: "Category", Type: "text", Sortable: true, Filterable: true},
			{Key: "status", Label: "Status", Type: "badge", Sortable: true, Filterable: true, UseOptions: true, Options: []modelbase.OptionDef{
				{Value: "active", Label: "Active", Color: "green"},
				{Value: "draft", Label: "Draft", Color: "yellow"},
				{Value: "archived", Label: "Archived", Color: "gray"},
			}},
			{Key: "created_at", Label: "Created", Type: "date", Sortable: true},
		},
	}
}

func (Product) DefineModal() modelbase.ModalMetadata {
	return modelbase.ModalMetadata{
		Title:       "Product",
		CreateTitle: "New Product",
		EditTitle:   "Edit Product",
		DeleteTitle: "Delete Product",
		Fields: []modelbase.FieldDef{
			{Key: "name", Label: "Name", Type: "text", Required: true},
			{Key: "sku", Label: "SKU", Type: "text", Required: true},
			{Key: "description", Label: "Description", Type: "textarea"},
			{Key: "price", Label: "Price", Type: "number", Required: true},
			{Key: "stock", Label: "Stock", Type: "number", DefaultValue: 0},
			{Key: "category", Label: "Category", Type: "text"},
			{Key: "status", Label: "Status", Type: "select", Required: true, DefaultValue: "active", Options: []modelbase.OptionDef{
				{Value: "active", Label: "Active"},
				{Value: "draft", Label: "Draft"},
				{Value: "archived", Label: "Archived"},
			}},
		},
	}
}

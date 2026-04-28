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
		Title:             "models.products.table.title",
		SearchColumns:     []string{"name", "sku", "category"},
		SearchPlaceholder: "models.products.table.search_placeholder",
		EnableCRUDActions: true,
		DefaultPerPage:    20,
		PerPageOptions:    []int{10, 20, 50},
		Columns: []modelbase.ColumnDef{
			{Key: "name", Label: "models.products.table.columns.name", Type: "text", Sortable: true},
			{Key: "sku", Label: "models.products.table.columns.sku", Type: "text", Sortable: true},
			{Key: "price", Label: "models.products.table.columns.price", Type: "currency", Sortable: true},
			{Key: "stock", Label: "models.products.table.columns.stock", Type: "number", Sortable: true},
			{Key: "category", Label: "models.products.table.columns.category", Type: "text", Sortable: true, Filterable: true},
			{Key: "status", Label: "models.products.table.columns.status", Type: "badge", Sortable: true, Filterable: true, UseOptions: true, Options: []modelbase.OptionDef{
				{Value: "active", Label: "models.products.table.options.active", Color: "green"},
				{Value: "draft", Label: "models.products.table.options.draft", Color: "yellow"},
				{Value: "archived", Label: "models.products.table.options.archived", Color: "gray"},
			}},
			{Key: "created_at", Label: "models.products.table.columns.created_at", Type: "date", Sortable: true},
		},
	}
}

func (Product) DefineModal() modelbase.ModalMetadata {
	return modelbase.ModalMetadata{
		Title:       "models.products.modal.title",
		CreateTitle: "models.products.modal.create_title",
		EditTitle:   "models.products.modal.edit_title",
		DeleteTitle: "models.products.modal.delete_title",
		Fields: []modelbase.FieldDef{
			{Key: "name", Label: "models.products.modal.fields.name", Type: "text", Required: true},
			{Key: "sku", Label: "models.products.modal.fields.sku", Type: "text", Required: true},
			{Key: "description", Label: "models.products.modal.fields.description", Type: "textarea"},
			{Key: "price", Label: "models.products.modal.fields.price", Type: "number", Required: true},
			{Key: "stock", Label: "models.products.modal.fields.stock", Type: "number", DefaultValue: 0},
			{Key: "category", Label: "models.products.modal.fields.category", Type: "text"},
			{Key: "status", Label: "models.products.modal.fields.status", Type: "select", Required: true, DefaultValue: "active", Options: []modelbase.OptionDef{
				{Value: "active", Label: "models.products.table.options.active"},
				{Value: "draft", Label: "models.products.table.options.draft"},
				{Value: "archived", Label: "models.products.table.options.archived"},
			}},
		},
	}
}

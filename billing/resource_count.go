package billing

import (
	"fmt"
	"sync"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// softDeleteColumnCache memoises, per `(db handle, table)`, whether the
// table carries a `deleted_at` column. The lookup uses GORM's migrator —
// one round-trip to the DB — so caching avoids paying that on every Count()
// in the billing hot path.
var softDeleteColumnCache sync.Map // key: "table@<dbptr>" → bool

func tableHasSoftDelete(db *gorm.DB, table string) bool {
	key := fmt.Sprintf("%s@%p", table, db)
	if v, ok := softDeleteColumnCache.Load(key); ok {
		return v.(bool)
	}
	has := db.Migrator().HasColumn(table, "deleted_at")
	softDeleteColumnCache.Store(key, has)
	return has
}

// CountLiveResource counts rows in tableName scoped to the given org and
// excludes soft-deleted rows when the table has a `deleted_at` column.
// Use this whenever billing reads a resource population (devices, agents,
// contacts) — going through `.Table()` directly skips GORM's soft-delete
// scope and overcounts archived rows toward the plan cap.
//
// extraScopes are applied AFTER organization_id and soft-delete filters.
// They exist so host models can declare "billing should NOT count these
// rows" — e.g. the simulator/demo channel that every Link install ships
// with: the model's ApplyListScope hides it from the UI, but without
// this hook it still ticked toward the channels cap and produced
// banners like "2 / 1 canales" when the user saw only one device.
func CountLiveResource(db *gorm.DB, tableName string, orgID uuid.UUID, extraScopes ...func(*gorm.DB) *gorm.DB) (int64, error) {
	q := db.Table(tableName).Where("organization_id = ?", orgID)
	if tableHasSoftDelete(db, tableName) {
		q = q.Where("deleted_at IS NULL")
	}
	for _, scope := range extraScopes {
		if scope != nil {
			q = scope(q)
		}
	}
	var n int64
	if err := q.Count(&n).Error; err != nil {
		return 0, err
	}
	return n, nil
}

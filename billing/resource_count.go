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
func CountLiveResource(db *gorm.DB, tableName string, orgID uuid.UUID) (int64, error) {
	q := db.Table(tableName).Where("organization_id = ?", orgID)
	if tableHasSoftDelete(db, tableName) {
		q = q.Where("deleted_at IS NULL")
	}
	var n int64
	if err := q.Count(&n).Error; err != nil {
		return 0, err
	}
	return n, nil
}

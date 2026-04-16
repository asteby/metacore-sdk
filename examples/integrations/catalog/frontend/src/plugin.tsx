import { definePlugin } from "@asteby/metacore-sdk";
import { UpdateStockModal } from "./modals/UpdateStockModal";
import { TogglePublishedModal } from "./modals/TogglePublishedModal";

export default definePlugin({
  key: "catalog",
  register(api) {
    api.registry.registerModal({ slug: "catalog.update_stock",     component: UpdateStockModal });
    api.registry.registerModal({ slug: "catalog.toggle_published", component: TogglePublishedModal });
  },
});

import { definePlugin } from "@asteby/metacore-sdk";
import { FulfillModal } from "./modals/FulfillModal";
import { CancelModal } from "./modals/CancelModal";

export default definePlugin({
  key: "orders",
  register(api) {
    api.registry.registerModal({ slug: "orders.fulfill", component: FulfillModal });
    api.registry.registerModal({ slug: "orders.cancel",  component: CancelModal });
  },
});

import { definePlugin } from "@asteby/metacore-sdk";
import { ConfirmModal } from "./modals/ConfirmModal";
import { RescheduleModal } from "./modals/RescheduleModal";
import { CancelModal } from "./modals/CancelModal";

export default definePlugin({
  key: "schedules",
  register(api) {
    api.registry.registerModal({ slug: "schedules.confirm",    component: ConfirmModal });
    api.registry.registerModal({ slug: "schedules.reschedule", component: RescheduleModal });
    api.registry.registerModal({ slug: "schedules.cancel",     component: CancelModal });
  },
});

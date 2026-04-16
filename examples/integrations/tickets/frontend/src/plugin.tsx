import { definePlugin } from "@asteby/metacore-sdk";
import { ResolveModal } from "./modals/ResolveModal";
import { ReassignModal } from "./modals/ReassignModal";

export default definePlugin({
  key: "tickets",
  register(api) {
    api.registry.registerModal({ slug: "tickets.resolve",  component: ResolveModal });
    api.registry.registerModal({ slug: "tickets.reassign", component: ReassignModal });
  },
});

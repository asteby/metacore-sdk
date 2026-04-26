// Federated entry for the fiscal_mx addon. Exposed as "./plugin" per
// manifest.frontend.expose. Host applications dynamically import this module
// at addon install/boot time.
import { definePlugin } from "@asteby/metacore-sdk";
import { StampSATModal } from "./modals/StampSATModal";

export default definePlugin({
  key: "fiscal_mx",
  register(api) {
    // Custom modal for the "stamp_sat" action. The slug MUST match
    // manifest.actions.cfdi_invoices[].modal — the CLI gate enforces it.
    api.registry.registerModal({
      slug: "fiscal_mx.stamp_sat",
      component: StampSATModal,
    });
  },
});

// Federated entry for fiscal_mexico. Registers two custom modals whose slugs
// must equal manifest.actions[].modal — the CLI gate (scanTS) enforces it.
import { definePlugin } from "@asteby/metacore-sdk";
import { StampFiscalModal } from "./modals/StampFiscalModal";
import { CancelFiscalModal } from "./modals/CancelFiscalModal";

export default definePlugin({
  key: "fiscal_mexico",
  register(api) {
    api.registry.registerModal({
      slug: "fiscal_mexico.stamp_fiscal",
      component: StampFiscalModal,
    });
    api.registry.registerModal({
      slug: "fiscal_mexico.cancel_fiscal",
      component: CancelFiscalModal,
    });
  },
});

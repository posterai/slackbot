import type { Feature } from "@/features/types";
import { getCatalog } from "./catalog";
import { sandboxConfig } from "./config";
import { registerSandbox } from "./handlers";
import { statusBlocks } from "./views";

export const sandbox: Feature = {
  name: "review sandboxes",
  description:
    "*Review sandboxes:* start, pause or delete a working copy of PosterChild for a labeled pcaicode PR, and see every sandbox's status. Type `/sandbox` in the sandbox channel.",
  register: registerSandbox,
  // Read-only here: actions need a channel to thread their progress in.
  homeBlocks: async () => {
    const config = sandboxConfig();
    return statusBlocks(await getCatalog(config), {
      buttons: false,
      label: config.SANDBOX_PR_LABEL,
    });
  },
};

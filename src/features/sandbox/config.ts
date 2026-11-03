import { z } from "zod";
import { csv, defineConfig } from "@/lib/config";

export const sandboxConfig = defineConfig("sandbox", {
  SANDBOX_REPO: z.string().default("posterai/pcaicode"),
  SANDBOX_WORKFLOW: z.string().default("sandbox.yml"),
  SANDBOX_WORKFLOW_REF: z.string().default("main"),
  SANDBOX_PR_LABEL: z.string().default("sandbox"),
  SANDBOX_ALLOWED_CHANNEL_IDS: csv,
  E2B_API_KEY: z.string().min(1),
  // Must match pcaicode e2b/config.ts: TEMPLATE_NAME and TENANT_PORTS.app.
  SANDBOX_E2B_TEMPLATE: z.string().default("pcai-fullstack"),
  SANDBOX_APP_PORT: z.coerce.number().int().default(8090),
});

export type SandboxConfig = ReturnType<typeof sandboxConfig>;

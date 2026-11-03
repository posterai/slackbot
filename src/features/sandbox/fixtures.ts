import type { Candidate, LiveSandbox } from "./catalog";
import type { SandboxConfig } from "./config";

export const config: SandboxConfig = {
  SANDBOX_REPO: "posterai/pcaicode",
  SANDBOX_WORKFLOW: "sandbox.yml",
  SANDBOX_WORKFLOW_REF: "main",
  SANDBOX_PR_LABEL: "sandbox",
  SANDBOX_ALLOWED_CHANNEL_IDS: ["C_SANDBOX"],
  E2B_API_KEY: "e2b_test",
  SANDBOX_E2B_TEMPLATE: "pcai-fullstack",
  SANDBOX_APP_PORT: 8090,
};

export const candidate = (over: Partial<Candidate> = {}): Candidate => ({
  branch: "feat/impact-site",
  prNumber: 917,
  prTitle: "Impact site wizard",
  prUrl: "https://github.com/posterai/pcaicode/pull/917",
  ...over,
});

export const live = (over: Partial<LiveSandbox> = {}): LiveSandbox => ({
  branch: "feat/impact-site",
  sandboxId: "sbx1",
  state: "running",
  endAt: new Date("2026-11-03T14:05:00Z"),
  appUrl: "https://8090-sbx1.e2b.app",
  basicAuthUser: "review",
  password: "hunter2",
  ...over,
});

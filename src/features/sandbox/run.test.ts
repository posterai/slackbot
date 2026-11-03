import type { Octokit } from "@octokit/rest";
import { describe, expect, it, vi } from "vitest";
import { config } from "./fixtures";
import {
  dispatchWorkflow,
  findRunUrl,
  isAllowedChannel,
  notAllowedText,
  workflowInputs,
} from "./run";

const request = {
  action: "up" as const,
  branch: "feat/impact-site",
  name: "Impact site wizard (#917)",
  channel: "C_SANDBOX",
};

describe("allow-list", () => {
  it("accepts only listed channels", () => {
    expect(isAllowedChannel("C_SANDBOX", config)).toBe(true);
    expect(isAllowedChannel("C_OTHER", config)).toBe(false);
    expect(isAllowedChannel("D_DM", config)).toBe(false);
    expect(isAllowedChannel(undefined, config)).toBe(false);
  });
  it("points at the allowed channel", () => {
    expect(notAllowedText(config)).toContain("<#C_SANDBOX>");
    expect(
      notAllowedText({ ...config, SANDBOX_ALLOWED_CHANNEL_IDS: [] }),
    ).toContain("aren't enabled");
  });
});

it("sends sandbox.yml's inputs, with our thread to reply in", () => {
  expect(workflowInputs(request, "U123", "1730.0001")).toEqual({
    branch: "feat/impact-site",
    action: "up",
    requested_by: "<@U123>",
    slack_channel: "C_SANDBOX",
    slack_thread_ts: "1730.0001",
  });
});

it("dispatches sandbox.yml on main", async () => {
  const createWorkflowDispatch = vi.fn().mockResolvedValue({ status: 204 });
  const octokit = {
    rest: { actions: { createWorkflowDispatch } },
  } as unknown as Octokit;
  await dispatchWorkflow(octokit, config, { branch: "b", action: "up" });
  expect(createWorkflowDispatch).toHaveBeenCalledWith({
    owner: "posterai",
    repo: "pcaicode",
    workflow_id: "sandbox.yml",
    ref: "main",
    inputs: { branch: "b", action: "up" },
  });
});

describe("findRunUrl", () => {
  const runs = (titles: string[]) => ({
    data: {
      workflow_runs: titles.map((t, i) => ({
        display_title: t,
        html_url: `https://gh/run/${i}`,
      })),
    },
  });

  it("matches the run whose title has the thread ts", async () => {
    const listWorkflowRuns = vi
      .fn()
      .mockResolvedValueOnce(runs(["Sandbox up b (1.1)"]))
      .mockResolvedValueOnce(
        runs(["Sandbox up b (2.2)", "Sandbox up b (1.1)"]),
      );
    const octokit = {
      rest: { actions: { listWorkflowRuns } },
    } as unknown as Octokit;
    await expect(
      findRunUrl(octokit, config, "2.2", { delayMs: 0 }),
    ).resolves.toBe("https://gh/run/0");
    expect(listWorkflowRuns).toHaveBeenCalledTimes(2);
  });

  it("gives up quietly", async () => {
    const listWorkflowRuns = vi.fn().mockResolvedValue(runs([]));
    const octokit = {
      rest: { actions: { listWorkflowRuns } },
    } as unknown as Octokit;
    await expect(
      findRunUrl(octokit, config, "9.9", { attempts: 2, delayMs: 0 }),
    ).resolves.toBeUndefined();
  });
});

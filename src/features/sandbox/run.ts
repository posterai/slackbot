import type { Octokit } from "@octokit/rest";
import type { Logger } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import { getOctokit, splitRepo } from "@/lib/github";
import { ACTION_LABELS } from "./catalog";
import { type SandboxConfig, sandboxConfig } from "./config";
import type { ActionRequest } from "./views";

export function isAllowedChannel(
  channel: string | undefined,
  config: SandboxConfig = sandboxConfig(),
): channel is string {
  return !!channel && config.SANDBOX_ALLOWED_CHANNEL_IDS.includes(channel);
}

export function notAllowedText(
  config: SandboxConfig = sandboxConfig(),
): string {
  const channels = config.SANDBOX_ALLOWED_CHANNEL_IDS.map((c) => `<#${c}>`);
  return channels.length
    ? `Sandboxes are managed from ${channels.join(" or ")}. Run this there.`
    : "Sandboxes aren't enabled in any channel yet (SANDBOX_ALLOWED_CHANNEL_IDS is empty).";
}

/**
 * The workflow_dispatch inputs for pcaicode's `.github/workflows/sandbox.yml`.
 * `slack_channel` / `slack_thread_ts` make the workflow reply in our thread instead of
 * starting its own.
 */
export function workflowInputs(
  request: ActionRequest,
  userId: string,
  threadTs: string,
): Record<string, string> {
  return {
    branch: request.branch,
    action: request.action,
    requested_by: `<@${userId}>`,
    slack_channel: request.channel,
    slack_thread_ts: threadTs,
  };
}

export async function dispatchWorkflow(
  octokit: Octokit,
  config: SandboxConfig,
  inputs: Record<string, string>,
): Promise<void> {
  const { owner, repo } = splitRepo(config.SANDBOX_REPO);
  await octokit.rest.actions.createWorkflowDispatch({
    owner,
    repo,
    workflow_id: config.SANDBOX_WORKFLOW,
    ref: config.SANDBOX_WORKFLOW_REF,
    inputs,
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The dispatch API doesn't return the run, so look for it: sandbox.yml's `run-name`
 * includes the Slack thread ts, which makes the match exact. Best effort; undefined if
 * it doesn't show up within a few seconds.
 */
export async function findRunUrl(
  octokit: Octokit,
  config: SandboxConfig,
  threadTs: string,
  { attempts = 4, delayMs = 1500 } = {},
): Promise<string | undefined> {
  const { owner, repo } = splitRepo(config.SANDBOX_REPO);
  for (let i = 0; i < attempts; i++) {
    await sleep(delayMs);
    const { data } = await octokit.rest.actions.listWorkflowRuns({
      owner,
      repo,
      workflow_id: config.SANDBOX_WORKFLOW,
      event: "workflow_dispatch",
      per_page: 20,
    });
    const run = data.workflow_runs.find((r) =>
      r.display_title?.includes(threadTs),
    );
    if (run) return run.html_url;
  }
  return undefined;
}

function headline(request: ActionRequest, userId: string): string {
  return `*${request.name}*: ${ACTION_LABELS[request.action].toLowerCase()} (\`${request.action}\`), requested by <@${userId}>.`;
}

/**
 * Posts the request in the channel, dispatches the workflow with that message as the
 * thread to reply in, then links the Actions run. The workflow posts the result (URL,
 * password, or failure) in the thread.
 */
export async function runSandboxAction({
  client,
  logger,
  request,
  userId,
}: {
  client: WebClient;
  logger: Logger;
  request: ActionRequest;
  userId: string;
}): Promise<void> {
  const config = sandboxConfig();
  if (!isAllowedChannel(request.channel, config)) {
    await client.chat.postEphemeral({
      channel: request.channel,
      user: userId,
      text: notAllowedText(config),
    });
    return;
  }

  const posted = await client.chat.postMessage({
    channel: request.channel,
    text: `${headline(request, userId)} Starting…`,
  });
  const ts = posted.ts;
  if (!ts) throw new Error("chat.postMessage returned no ts");

  const octokit = getOctokit();
  try {
    await dispatchWorkflow(
      octokit,
      config,
      workflowInputs(request, userId, ts),
    );
  } catch (error) {
    logger.error("sandbox dispatch failed", error);
    await client.chat.update({
      channel: request.channel,
      ts,
      text: `${headline(request, userId)} :x: Couldn't start the workflow.`,
    });
    await client.chat.postMessage({
      channel: request.channel,
      thread_ts: ts,
      text: `GitHub said: ${error instanceof Error ? error.message : String(error)}`,
    });
    return;
  }

  const runUrl = await findRunUrl(octokit, config, ts).catch((error) => {
    logger.warn("couldn't find the sandbox workflow run", error);
    return undefined;
  });
  await client.chat.update({
    channel: request.channel,
    ts,
    text: `${headline(request, userId)} Working on it${
      request.action === "up" ? " (a few minutes)" : ""
    }. Updates in the thread.${runUrl ? ` <${runUrl}|Progress>` : ""}`,
  });
}

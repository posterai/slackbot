import type { KnownBlock, ModalView, PlainTextOption } from "@slack/types";
import {
  ACTION_LABELS,
  ACTIONS,
  type CatalogItem,
  type SandboxAction,
} from "./catalog";

export const PICKER_CALLBACK_ID = "sandbox_picker";
export const CONFIRM_DESTROY_CALLBACK_ID = "sandbox_confirm_destroy";
/** Prefix of the status-list buttons' action_ids; the suffix is the action. */
export const BUTTON_ACTION_PREFIX = "sandbox_action_";

/** What a button or a modal carries between Slack round trips. */
export type ActionRequest = {
  action: SandboxAction;
  branch: string;
  name: string;
  channel: string;
};

/** Slack caps plain_text in options at 75 chars. */
const clip = (s: string, max = 75) =>
  s.length > max ? `${s.slice(0, max - 1)}…` : s;

const hhmmUtc = (d: Date) =>
  `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;

/** Plain text, for select option descriptions. */
export function describeState(item: CatalogItem): string {
  const s = item.sandbox;
  if (!s) return "No sandbox yet";
  if (s.state === "paused") return "Paused";
  return `Running · pauses ${hhmmUtc(s.endAt)}`;
}

/** mrkdwn, shown in each viewer's own time zone. */
function describeStateMrkdwn(item: CatalogItem): string {
  const s = item.sandbox;
  if (!s) return ":white_circle: No sandbox yet";
  if (s.state === "paused") return ":double_vertical_bar: Paused";
  const unix = Math.floor(s.endAt.getTime() / 1000);
  return `:large_green_circle: Running · pauses <!date^${unix}^{time}|${hhmmUtc(s.endAt)}>`;
}

function itemTitle(item: CatalogItem): string {
  return item.prUrl ? `*<${item.prUrl}|${item.name}>*` : `*${item.name}*`;
}

function confirmDestroy(name: string) {
  return {
    title: { type: "plain_text" as const, text: "Delete sandbox?" },
    text: {
      type: "mrkdwn" as const,
      text: `This deletes the sandbox for *${name}* and everything entered in it. The next start makes a new one with a new URL and fresh seed data.`,
    },
    confirm: { type: "plain_text" as const, text: "Delete" },
    deny: { type: "plain_text" as const, text: "Cancel" },
    style: "danger" as const,
  };
}

function buttonValue(item: CatalogItem, action: SandboxAction): string {
  return JSON.stringify({ action, branch: item.branch, name: item.name });
}

function actionButtons(item: CatalogItem): KnownBlock {
  const running = item.sandbox?.state === "running";
  const elements = [];
  elements.push({
    type: "button" as const,
    action_id: `${BUTTON_ACTION_PREFIX}up`,
    text: {
      type: "plain_text" as const,
      text: item.sandbox ? (running ? "Update" : "Resume") : "Start",
    },
    style: "primary" as const,
    value: buttonValue(item, "up"),
  });
  if (running) {
    elements.push({
      type: "button" as const,
      action_id: `${BUTTON_ACTION_PREFIX}stop`,
      text: { type: "plain_text" as const, text: "Pause" },
      value: buttonValue(item, "stop"),
    });
  }
  if (item.sandbox) {
    elements.push({
      type: "button" as const,
      action_id: `${BUTTON_ACTION_PREFIX}destroy`,
      text: { type: "plain_text" as const, text: "Delete" },
      style: "danger" as const,
      value: buttonValue(item, "destroy"),
      confirm: confirmDestroy(item.name),
    });
  }
  return { type: "actions", elements };
}

export function statusBlocks(
  items: CatalogItem[],
  opts: { buttons: boolean; label: string },
): KnownBlock[] {
  if (items.length === 0) {
    return [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `No sandboxes yet. Add the \`${opts.label}\` label to a pcaicode PR to make it available here.`,
        },
      },
    ];
  }
  const blocks: KnownBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "Review sandboxes" },
    },
  ];
  for (const item of items) {
    const lines = [itemTitle(item), describeStateMrkdwn(item)];
    const s = item.sandbox;
    if (s) {
      lines.push(`<${s.appUrl}|Open app>`);
      if (s.password) {
        lines.push(`Site login: \`${s.basicAuthUser}\` / \`${s.password}\``);
      }
    }
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: lines.join("\n") },
    });
    if (opts.buttons) blocks.push(actionButtons(item));
  }
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `Sandboxes pause about an hour after they're started or updated; "Resume" brings one back with the latest commits. Missing one? Label its PR \`${opts.label}\`.`,
      },
    ],
  });
  return blocks;
}

export function loadingModal(): ModalView {
  return {
    type: "modal",
    callback_id: PICKER_CALLBACK_ID,
    title: { type: "plain_text", text: "Review sandbox" },
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: ":hourglass_flowing_sand: Loading sandboxes…",
        },
      },
    ],
  };
}

export function messageModal(text: string): ModalView {
  return {
    type: "modal",
    title: { type: "plain_text", text: "Review sandbox" },
    close: { type: "plain_text", text: "Close" },
    blocks: [{ type: "section", text: { type: "mrkdwn", text } }],
  };
}

/** Slack allows at most 100 options in a static select. */
const MAX_OPTIONS = 100;

export function pickerModal(items: CatalogItem[], channel: string): ModalView {
  const options: PlainTextOption[] = items
    .slice(0, MAX_OPTIONS)
    .map((item) => ({
      text: { type: "plain_text", text: clip(item.name) },
      description: { type: "plain_text", text: clip(describeState(item)) },
      value: item.branch,
    }));
  return {
    type: "modal",
    callback_id: PICKER_CALLBACK_ID,
    private_metadata: JSON.stringify({ channel }),
    title: { type: "plain_text", text: "Review sandbox" },
    submit: { type: "plain_text", text: "Go" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "input",
        block_id: "item",
        label: { type: "plain_text", text: "Sandbox" },
        element: {
          type: "static_select",
          action_id: "branch",
          placeholder: { type: "plain_text", text: "Pick a feature" },
          options,
        },
      },
      {
        type: "input",
        block_id: "action",
        label: { type: "plain_text", text: "Action" },
        element: {
          type: "radio_buttons",
          action_id: "action",
          initial_option: {
            text: { type: "plain_text", text: ACTION_LABELS.up },
            value: "up",
          },
          options: ACTIONS.map((a) => ({
            text: { type: "plain_text" as const, text: ACTION_LABELS[a] },
            value: a,
          })),
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "Progress, the link and the password are posted in a thread in this channel.",
          },
        ],
      },
    ],
  };
}

export function confirmDestroyModal(request: ActionRequest): ModalView {
  return {
    type: "modal",
    callback_id: CONFIRM_DESTROY_CALLBACK_ID,
    private_metadata: JSON.stringify(request),
    title: { type: "plain_text", text: "Delete sandbox?" },
    submit: { type: "plain_text", text: "Delete" },
    close: { type: "plain_text", text: "Back" },
    blocks: [
      {
        type: "section",
        text: confirmDestroy(request.name).text,
      },
    ],
  };
}

export const USAGE = [
  "*Review sandboxes*",
  "• `/sandbox`: pick a sandbox and an action",
  "• `/sandbox status`: every sandbox, its state, link and password",
  "• `/sandbox up|stop|destroy <#PR or name>`: e.g. `/sandbox up #917`",
].join("\n");

/** Ephemeral prompt for `/sandbox destroy <x>`: the button's confirm dialog is the check. */
export function destroyPromptBlocks(item: CatalogItem): KnownBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `Delete the sandbox for ${itemTitle(item)}?`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          action_id: `${BUTTON_ACTION_PREFIX}destroy`,
          text: { type: "plain_text", text: "Delete" },
          style: "danger",
          value: buttonValue(item, "destroy"),
          confirm: confirmDestroy(item.name),
        },
      ],
    },
  ];
}

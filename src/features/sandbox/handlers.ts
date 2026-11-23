import type {
  AllMiddlewareArgs,
  App,
  BlockAction,
  ButtonAction,
  SlackActionMiddlewareArgs,
  SlackCommandMiddlewareArgs,
  SlackViewMiddlewareArgs,
  ViewSubmitAction,
} from "@slack/bolt";
import { getCatalog, isAction, resolveItem } from "./catalog";
import { sandboxConfig } from "./config";
import { isAllowedChannel, notAllowedText, runSandboxAction } from "./run";
import {
  type ActionRequest,
  BUTTON_ACTION_PREFIX,
  CONFIRM_DESTROY_CALLBACK_ID,
  confirmDestroyModal,
  destroyPromptBlocks,
  loadingModal,
  messageModal,
  PICKER_CALLBACK_ID,
  pickerModal,
  statusBlocks,
  USAGE,
} from "./views";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function onCommand({
  ack,
  command,
  client,
  respond,
  logger,
}: AllMiddlewareArgs & SlackCommandMiddlewareArgs) {
  await ack();
  const [sub = "", ...rest] = command.text.trim().split(/\s+/).filter(Boolean);
  const arg = rest.join(" ");

  if (sub === "help") {
    await respond({ response_type: "ephemeral", text: USAGE });
    return;
  }

  const config = sandboxConfig();
  if (!isAllowedChannel(command.channel_id, config)) {
    await respond({ response_type: "ephemeral", text: notAllowedText(config) });
    return;
  }

  try {
    if (sub === "") {
      // Open first: trigger_id expires after 3 s, and GitHub + E2B can take longer.
      const opened = await client.views.open({
        trigger_id: command.trigger_id,
        view: loadingModal(),
      });
      const viewId = opened.view?.id;
      if (!viewId) return;
      try {
        const items = await getCatalog(config);
        await client.views.update({
          view_id: viewId,
          view: items.length
            ? pickerModal(items, command.channel_id)
            : messageModal(
                `No sandboxes yet. Add the \`${config.SANDBOX_PR_LABEL}\` label to a pcaicode PR to make it available here.`,
              ),
        });
      } catch (error) {
        logger.error("sandbox picker failed", error);
        await client.views.update({
          view_id: viewId,
          view: messageModal(
            `:warning: Couldn't load sandboxes: ${errorText(error)}`,
          ),
        });
      }
      return;
    }

    if (sub === "status" || sub === "list") {
      const items = await getCatalog(config);
      await respond({
        response_type: "ephemeral",
        text: `${items.length} review sandbox${items.length === 1 ? "" : "es"}`,
        blocks: statusBlocks(items, {
          buttons: true,
          label: config.SANDBOX_PR_LABEL,
        }),
      });
      return;
    }

    if (isAction(sub)) {
      const found = resolveItem(await getCatalog(config), arg);
      if ("error" in found) {
        await respond({
          response_type: "ephemeral",
          text: `${found.error} Run \`/sandbox status\` to see what's available; a PR shows up once it has the \`${config.SANDBOX_PR_LABEL}\` label.`,
        });
        return;
      }
      if (sub === "destroy") {
        await respond({
          response_type: "ephemeral",
          text: `Delete the sandbox for ${found.name}?`,
          blocks: destroyPromptBlocks(found),
        });
        return;
      }
      await runSandboxAction({
        client,
        logger,
        userId: command.user_id,
        request: {
          action: sub,
          branch: found.branch,
          name: found.name,
          channel: command.channel_id,
        },
      });
      return;
    }

    await respond({ response_type: "ephemeral", text: USAGE });
  } catch (error) {
    logger.error("/sandbox failed", error);
    await respond({
      response_type: "ephemeral",
      text: `:warning: Something went wrong: ${errorText(error)}`,
    });
  }
}

async function onButton({
  ack,
  action,
  body,
  client,
  logger,
  respond,
}: AllMiddlewareArgs & SlackActionMiddlewareArgs<BlockAction<ButtonAction>>) {
  await ack();
  try {
    const value = JSON.parse(action.value ?? "{}") as Omit<
      ActionRequest,
      "channel"
    >;
    const channel = body.channel?.id ?? body.container?.channel_id;
    if (!channel || !isAction(value.action) || !value.branch) {
      throw new Error("This button is missing its sandbox or channel.");
    }
    await runSandboxAction({
      client,
      logger,
      userId: body.user.id,
      request: { ...value, channel },
    });
  } catch (error) {
    logger.error("sandbox button failed", error);
    await respond({
      response_type: "ephemeral",
      replace_original: false,
      text: `:warning: ${errorText(error)}`,
    });
  }
}

async function onPickerSubmit({
  ack,
  body,
  view,
  client,
  logger,
}: AllMiddlewareArgs & SlackViewMiddlewareArgs<ViewSubmitAction>) {
  const selected = view.state.values.item?.branch?.selected_option;
  const action = view.state.values.action?.action?.selected_option?.value;
  if (!selected) {
    await ack({
      response_action: "errors",
      errors: { item: "Pick a sandbox." },
    });
    return;
  }
  if (!action || !isAction(action)) {
    await ack({
      response_action: "errors",
      errors: { action: "Pick an action." },
    });
    return;
  }
  const { channel } = JSON.parse(view.private_metadata) as { channel: string };
  const request: ActionRequest = {
    action,
    branch: selected.value,
    name: selected.text.text,
    channel,
  };
  if (action === "destroy") {
    await ack({
      response_action: "update",
      view: confirmDestroyModal(request),
    });
    return;
  }
  await ack();
  await runSandboxAction({
    client,
    logger,
    userId: body.user.id,
    request,
  }).catch((error) => logger.error("sandbox picker action failed", error));
}

async function onConfirmDestroy({
  ack,
  body,
  view,
  client,
  logger,
}: AllMiddlewareArgs & SlackViewMiddlewareArgs<ViewSubmitAction>) {
  await ack();
  const request = JSON.parse(view.private_metadata) as ActionRequest;
  await runSandboxAction({
    client,
    logger,
    userId: body.user.id,
    request,
  }).catch((error) => logger.error("sandbox destroy failed", error));
}

export function registerSandbox(app: App) {
  app.command("/sandbox", onCommand);
  app.action<BlockAction<ButtonAction>>(
    new RegExp(`^${BUTTON_ACTION_PREFIX}`),
    onButton,
  );
  app.view<ViewSubmitAction>(PICKER_CALLBACK_ID, onPickerSubmit);
  app.view<ViewSubmitAction>(CONFIRM_DESTROY_CALLBACK_ID, onConfirmDestroy);
}

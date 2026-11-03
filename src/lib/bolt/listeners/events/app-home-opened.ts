import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import type { KnownBlock } from "@slack/types";
import { features } from "@/features";

export const appHomeOpenedCallback = async ({
  client,
  event,
  logger,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<"app_home_opened">) => {
  // Ignore the `app_home_opened` event for anything but the Home tab
  if (event.tab !== "home") return;

  const blocks: KnownBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "PosterChild bot" },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*What I can do*\n${features.map((f) => `• ${f.description}`).join("\n")}`,
      },
    },
  ];

  // One feature failing (e.g. an upstream API is down) shouldn't blank the whole tab.
  const sections = await Promise.allSettled(
    features.map((f) => f.homeBlocks?.(event.user) ?? Promise.resolve([])),
  );
  sections.forEach((section, i) => {
    if (section.status === "fulfilled") {
      if (section.value.length)
        blocks.push({ type: "divider" }, ...section.value);
    } else {
      logger.error(
        `Home tab section for ${features[i].name} failed`,
        section.reason,
      );
      blocks.push(
        { type: "divider" },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `:warning: Couldn't load ${features[i].name} right now.`,
            },
          ],
        },
      );
    }
  });

  try {
    await client.views.publish({
      user_id: event.user,
      view: { type: "home", blocks },
    });
  } catch (error) {
    logger.error(error);
  }
};

import type { App } from "@slack/bolt";
import type { KnownBlock } from "@slack/types";

/**
 * A self-contained bot capability. Add one by creating `src/features/<name>/index.ts`
 * that exports a Feature, then listing it in `src/features/index.ts`.
 */
export type Feature = {
  name: string;
  /** One line for the Home tab's "what I can do" list (mrkdwn). */
  description: string;
  /** Register commands, actions, views, events. */
  register: (app: App) => void;
  /** Optional extra Home tab section for this user. */
  homeBlocks?: (userId: string) => Promise<KnownBlock[]>;
};

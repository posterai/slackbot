import type { App } from "@slack/bolt";
import { features } from "@/features";
import events from "./events";

const registerListeners = (app: App) => {
  events.register(app);
  for (const feature of features) feature.register(app);
};

export default registerListeners;

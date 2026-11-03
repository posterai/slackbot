import { describe, expect, it } from "vitest";
import { buildCatalog } from "./catalog";
import { candidate, live } from "./fixtures";
import {
  BUTTON_ACTION_PREFIX,
  describeState,
  pickerModal,
  statusBlocks,
} from "./views";

describe("describeState", () => {
  it("shows when a running sandbox pauses, in UTC", () => {
    const [item] = buildCatalog([candidate()], [live()]);
    expect(describeState(item)).toBe("Running · pauses 14:05 UTC");
  });
  it("paused and missing", () => {
    expect(
      describeState(
        buildCatalog([candidate()], [live({ state: "paused" })])[0],
      ),
    ).toBe("Paused");
    expect(describeState(buildCatalog([candidate()], [])[0])).toBe(
      "No sandbox yet",
    );
  });
});

describe("pickerModal", () => {
  it("lists items by name with the branch as value, capped at 100", () => {
    const items = buildCatalog(
      Array.from({ length: 120 }, (_, i) =>
        candidate({ branch: `b${i}`, prNumber: i, prTitle: `Feature ${i}` }),
      ),
      [],
    );
    const view = pickerModal(items, "C_SANDBOX");
    const select = (
      view.blocks[0] as {
        element: { options: { value: string; text: { text: string } }[] };
      }
    ).element;
    expect(select.options).toHaveLength(100);
    expect(select.options[0].text.text).toMatch(/^Feature \d+ \(#\d+\)$/);
    expect(JSON.parse(view.private_metadata ?? "")).toEqual({
      channel: "C_SANDBOX",
    });
  });

  it("clips long names to Slack's 75-char limit", () => {
    const view = pickerModal(
      buildCatalog([candidate({ prTitle: "x".repeat(200) })], []),
      "C",
    );
    const select = (
      view.blocks[0] as { element: { options: { text: { text: string } }[] } }
    ).element;
    expect(select.options[0].text.text.length).toBe(75);
  });
});

describe("statusBlocks", () => {
  const actionIds = (blocks: ReturnType<typeof statusBlocks>) =>
    blocks
      .filter((b) => b.type === "actions")
      .flatMap((b) =>
        (b as { elements: { action_id: string }[] }).elements.map(
          (e) => e.action_id,
        ),
      );

  it("offers start only when there's no sandbox", () => {
    const blocks = statusBlocks(buildCatalog([candidate()], []), {
      buttons: true,
      label: "sandbox",
    });
    expect(actionIds(blocks)).toEqual([`${BUTTON_ACTION_PREFIX}up`]);
  });

  it("offers update, pause and delete (with confirm) for a running one", () => {
    const blocks = statusBlocks(buildCatalog([candidate()], [live()]), {
      buttons: true,
      label: "sandbox",
    });
    expect(actionIds(blocks)).toEqual(
      ["up", "stop", "destroy"].map((a) => `${BUTTON_ACTION_PREFIX}${a}`),
    );
    const del = blocks
      .flatMap((b) =>
        b.type === "actions"
          ? (b as { elements: { action_id: string; confirm?: unknown }[] })
              .elements
          : [],
      )
      .find((e) => e.action_id.endsWith("destroy"));
    expect(del?.confirm).toBeDefined();
  });

  it("shows the URL and password, and no buttons when read-only", () => {
    const blocks = statusBlocks(buildCatalog([candidate()], [live()]), {
      buttons: false,
      label: "sandbox",
    });
    const text = JSON.stringify(blocks);
    expect(text).toContain("https://8090-sbx1.e2b.app");
    expect(text).toContain("hunter2");
    expect(actionIds(blocks)).toEqual([]);
  });

  it("explains the label when empty", () => {
    expect(
      JSON.stringify(statusBlocks([], { buttons: true, label: "sandbox" })),
    ).toContain("`sandbox` label");
  });
});

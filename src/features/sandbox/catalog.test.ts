import { describe, expect, it } from "vitest";
import {
  buildCatalog,
  type CatalogItem,
  isAction,
  resolveItem,
} from "./catalog";
import { candidate, live } from "./fixtures";

describe("buildCatalog", () => {
  it("names items after the PR and attaches the branch's sandbox", () => {
    const [item] = buildCatalog([candidate()], [live()]);
    expect(item.name).toBe("Impact site wizard (#917)");
    expect(item.branch).toBe("feat/impact-site");
    expect(item.sandbox?.sandboxId).toBe("sbx1");
  });

  it("keeps sandboxes with no labeled PR, named by branch", () => {
    const items = buildCatalog(
      [],
      [live({ branch: "fix/old", sandboxId: "sbx9" })],
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: "fix/old", branch: "fix/old" });
    expect(items[0].prNumber).toBeUndefined();
    expect(items[0].sandbox?.sandboxId).toBe("sbx9");
  });

  it("prefers the running sandbox when a branch has two", () => {
    const [item] = buildCatalog(
      [candidate()],
      [live({ sandboxId: "old", state: "paused" }), live({ sandboxId: "new" })],
    );
    expect(item.sandbox?.sandboxId).toBe("new");
  });

  it("sorts running, then paused, then no sandbox", () => {
    const items = buildCatalog(
      [
        candidate({ branch: "a", prNumber: 1, prTitle: "A" }),
        candidate({ branch: "b", prNumber: 2, prTitle: "B" }),
        candidate({ branch: "c", prNumber: 3, prTitle: "C" }),
      ],
      [live({ branch: "b", state: "paused" }), live({ branch: "c" })],
    );
    expect(items.map((i) => i.branch)).toEqual(["c", "b", "a"]);
  });
});

describe("resolveItem", () => {
  const items: CatalogItem[] = buildCatalog(
    [
      candidate(),
      candidate({
        branch: "feat/people",
        prNumber: 920,
        prTitle: "People page ranking",
      }),
      candidate({
        branch: "feat/people-v2",
        prNumber: 921,
        prTitle: "People page v2",
      }),
    ],
    [],
  );

  it.each([
    ["#917", "feat/impact-site"],
    ["917", "feat/impact-site"],
    ["feat/people", "feat/people"],
    ["impact site", "feat/impact-site"],
    ["People page v2 (#921)", "feat/people-v2"],
  ])("resolves %s", (arg, branch) => {
    expect(resolveItem(items, arg)).toMatchObject({ branch });
  });

  it("refuses a branch that isn't labeled", () => {
    expect(resolveItem(items, "feat/secret")).toHaveProperty("error");
  });

  it("refuses a PR that isn't labeled", () => {
    expect(resolveItem(items, "#1")).toEqual({
      error: "PR #1 isn't open with the sandbox label.",
    });
  });

  it("reports ambiguous names", () => {
    const result = resolveItem(items, "people page");
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("#920");
  });

  it("asks for an argument", () => {
    expect(resolveItem(items, "  ")).toHaveProperty("error");
  });
});

it("isAction accepts only the workflow's actions", () => {
  expect(["up", "stop", "destroy", "status", ""].map(isAction)).toEqual([
    true,
    true,
    true,
    false,
    false,
  ]);
});

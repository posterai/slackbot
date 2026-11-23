import { Sandbox } from "e2b";
import { getOctokit, splitRepo } from "@/lib/github";
import { type SandboxConfig, sandboxConfig } from "./config";

export const ACTIONS = ["up", "stop", "destroy"] as const;
export type SandboxAction = (typeof ACTIONS)[number];

export const ACTION_LABELS: Record<SandboxAction, string> = {
  up: "Start / resume",
  stop: "Pause",
  destroy: "Delete",
};

/** An open PR labeled for review sandboxes. */
export type Candidate = {
  branch: string;
  prNumber: number;
  prTitle: string;
  prUrl: string;
};

/** A live E2B sandbox, from the metadata pcaicode's `registry.ts` `toMetadata` writes. */
export type LiveSandbox = {
  branch: string;
  sandboxId: string;
  state: "running" | "paused";
  endAt: Date;
  appUrl: string;
  basicAuthUser: string;
  password?: string;
};

export type CatalogItem = {
  /** Readable name: "<PR title> (#917)", or the branch when there's no labeled PR. */
  name: string;
  branch: string;
  prNumber?: number;
  prUrl?: string;
  sandbox?: LiveSandbox;
};

export async function listCandidates(
  config: SandboxConfig = sandboxConfig(),
): Promise<Candidate[]> {
  const octokit = getOctokit();
  const { owner, repo } = splitRepo(config.SANDBOX_REPO);
  const pulls = await octokit.paginate(octokit.rest.pulls.list, {
    owner,
    repo,
    state: "open",
    per_page: 100,
  });
  return pulls
    .filter(
      (pr) =>
        !pr.draft &&
        // The workflow checks out branches of this repo only, not forks.
        pr.head.repo?.full_name === config.SANDBOX_REPO &&
        pr.labels.some((l) => l.name === config.SANDBOX_PR_LABEL),
    )
    .map((pr) => ({
      branch: pr.head.ref,
      prNumber: pr.number,
      prTitle: pr.title,
      prUrl: pr.html_url,
    }));
}

export async function listSandboxes(
  config: SandboxConfig = sandboxConfig(),
): Promise<LiveSandbox[]> {
  const paginator = Sandbox.list({
    apiKey: config.E2B_API_KEY,
    query: { template: config.SANDBOX_E2B_TEMPLATE },
  });
  const sandboxes: LiveSandbox[] = [];
  while (paginator.hasNext) {
    for (const info of await paginator.nextItems()) {
      const meta = info.metadata ?? {};
      // Sandboxes from before `create` stored metadata can't be tied to a branch.
      if (!meta.branch) continue;
      const domain = info.sandboxDomain ?? "e2b.app";
      sandboxes.push({
        branch: meta.branch,
        sandboxId: info.sandboxId,
        state: info.state,
        endAt: info.endAt,
        appUrl: `https://${config.SANDBOX_APP_PORT}-${info.sandboxId}.${domain}`,
        basicAuthUser: meta.basicAuthUser || "review",
        password: meta.basicAuthPassword || undefined,
      });
    }
  }
  return sandboxes;
}

/**
 * Labeled PRs joined with live sandboxes by branch. Sandboxes without a labeled PR are
 * kept (named by branch), so status never hides one that's running and costing money.
 */
export function buildCatalog(
  candidates: Candidate[],
  sandboxes: LiveSandbox[],
): CatalogItem[] {
  // If a branch somehow has two sandboxes, prefer the running one, then the newest.
  const byBranch = new Map<string, LiveSandbox>();
  for (const s of sandboxes) {
    const prev = byBranch.get(s.branch);
    if (
      !prev ||
      (s.state === "running" && prev.state !== "running") ||
      (s.state === prev.state && s.endAt > prev.endAt)
    ) {
      byBranch.set(s.branch, s);
    }
  }

  const items: CatalogItem[] = candidates.map((c) => ({
    name: `${c.prTitle} (#${c.prNumber})`,
    branch: c.branch,
    prNumber: c.prNumber,
    prUrl: c.prUrl,
    sandbox: byBranch.get(c.branch),
  }));
  const listed = new Set(candidates.map((c) => c.branch));
  for (const [branch, sandbox] of byBranch) {
    if (!listed.has(branch)) items.push({ name: branch, branch, sandbox });
  }

  // Running first, then paused, then the rest; alphabetical within each.
  const rank = (i: CatalogItem) =>
    i.sandbox?.state === "running" ? 0 : i.sandbox ? 1 : 2;
  return items.sort(
    (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name),
  );
}

export async function getCatalog(
  config: SandboxConfig = sandboxConfig(),
): Promise<CatalogItem[]> {
  const [candidates, sandboxes] = await Promise.all([
    listCandidates(config),
    listSandboxes(config),
  ]);
  return buildCatalog(candidates, sandboxes);
}

/**
 * Finds a catalog item from what someone typed: "#917", "917", a branch, or (a unique
 * case-insensitive substring of) the name. Free-form branches don't resolve on purpose:
 * only labeled PRs and existing sandboxes are offered.
 */
export function resolveItem(
  items: CatalogItem[],
  arg: string,
): CatalogItem | { error: string } {
  const query = arg.trim();
  if (!query) return { error: "Say which sandbox, e.g. `#917`." };

  const pr = query.match(/^#?(\d+)$/);
  if (pr) {
    const n = Number(pr[1]);
    return (
      items.find((i) => i.prNumber === n) ?? {
        error: `PR #${n} isn't open with the sandbox label.`,
      }
    );
  }

  const byBranch = items.find((i) => i.branch === query);
  if (byBranch) return byBranch;

  const q = query.toLowerCase();
  const exact = items.find((i) => i.name.toLowerCase() === q);
  if (exact) return exact;
  const matches = items.filter((i) => i.name.toLowerCase().includes(q));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    return {
      error: `"${query}" matches ${matches.length} sandboxes: ${matches
        .slice(0, 5)
        .map((m) => (m.prNumber ? `#${m.prNumber}` : `\`${m.branch}\``))
        .join(", ")}. Be more specific.`,
    };
  }
  return { error: `No sandbox called "${query}".` };
}

export function isAction(value: string): value is SandboxAction {
  return (ACTIONS as readonly string[]).includes(value);
}

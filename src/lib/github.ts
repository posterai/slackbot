import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { githubConfig } from "./config";

let octokit: Octokit | undefined;

/**
 * Octokit authenticated as the org-owned PosterChild GitHub App installation.
 * `@octokit/auth-app` mints installation tokens and refreshes them before they expire,
 * so one instance can be reused across requests in a warm function.
 */
export function getOctokit(): Octokit {
  if (octokit) return octokit;
  const config = githubConfig();
  octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: config.GITHUB_APP_ID,
      privateKey: config.GITHUB_APP_PRIVATE_KEY,
      installationId: config.GITHUB_APP_INSTALLATION_ID,
    },
  });
  return octokit;
}

/** "owner/name" → { owner, repo }. */
export function splitRepo(fullName: string): { owner: string; repo: string } {
  const [owner, repo] = fullName.split("/");
  if (!owner || !repo)
    throw new Error(`Expected "owner/repo", got "${fullName}"`);
  return { owner, repo };
}

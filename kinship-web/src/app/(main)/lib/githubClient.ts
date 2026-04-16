/**
 * GitHub REST API client for landing page editor.
 *
 * Env vars (all server-side only):
 *  - GITHUB_TOKEN          – PAT with Contents read+write on the repo
 *  - GITHUB_REPO_OWNER     – defaults to "mmosh-pit"
 *  - GITHUB_REPO_NAME      – defaults to "mmosh-app"
 */

// ─── helpers ───────────────────────────────────────────────────────

function getConfig() {
  const owner = process.env.GITHUB_REPO_OWNER || "mmosh-pit";
  const repo = process.env.GITHUB_REPO_NAME || "mmosh-app";
  const rawToken = process.env.GITHUB_TOKEN ?? "";

  // Strip accidental "Bearer " / "token " prefix the user may have pasted
  const token = rawToken.replace(/^(Bearer|token)\s+/i, "").trim();

  if (!token) {
    throw new Error(
      "GITHUB_TOKEN is not set. Add it to your .env.local file.",
    );
  }

  return { owner, repo, token };
}

function baseUrl() {
  const { owner, repo } = getConfig();
  return `https://api.github.com/repos/${owner}/${repo}`;
}

function authHeaders() {
  const { token } = getConfig();
  return {
    // "token" prefix works for both classic and fine-grained PATs
    Authorization: `token ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

// ─── public types ──────────────────────────────────────────────────

export type GitHubFileContent = {
  content: string; // base64-decoded UTF-8
  sha: string;
  path: string;
};

// ─── repo info ─────────────────────────────────────────────────────

/**
 * Get the default branch name (usually "main" or "master").
 */
export async function getDefaultBranch(): Promise<string> {
  const url = baseUrl();
  const res = await fetch(url, {
    headers: authHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    // Fallback to "main" if we can't determine the default branch
    console.warn("Could not determine default branch, falling back to 'main'");
    return "main";
  }

  const data = await res.json();
  return data.default_branch ?? "main";
}

// ─── file content ──────────────────────────────────────────────────

/**
 * Get a file's content and SHA from a specific branch.
 */
export async function getFileContent(
  path: string,
  branch?: string,
): Promise<GitHubFileContent> {
  const defaultBranch = branch || (await getDefaultBranch());
  const url = `${baseUrl()}/contents/${path}?ref=${defaultBranch}`;
  const res = await fetch(url, {
    headers: authHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `GitHub getFileContent failed (${res.status}): ${body}`,
    );
  }

  const data = await res.json();
  const decoded = Buffer.from(data.content, "base64").toString("utf-8");

  return { content: decoded, sha: data.sha, path: data.path };
}

// ─── branch operations ────────────────────────────────────────────

/**
 * Get the SHA of the latest commit on a branch.
 */
export async function getBranchSha(branch?: string): Promise<string> {
  const branchName = branch || (await getDefaultBranch());
  const url = `${baseUrl()}/git/ref/heads/${branchName}`;
  const res = await fetch(url, {
    headers: authHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `GitHub getBranchSha for "${branchName}" failed (${res.status}): ${body}`,
    );
  }

  const data = await res.json();
  return data.object.sha;
}

/**
 * Check if a branch exists.
 */
export async function branchExists(branch: string): Promise<boolean> {
  const url = `${baseUrl()}/git/ref/heads/${branch}`;
  const res = await fetch(url, {
    headers: authHeaders(),
    cache: "no-store",
  });
  return res.ok;
}

/**
 * Create a new branch from the default branch HEAD.
 * If the branch already exists, force-update it.
 *
 * Uses two strategies:
 *  1. Try the Git Refs API (POST /git/refs) — fast, atomic.
 *  2. If that 404s (token may lack git-data write), fall back to
 *     creating a lightweight commit via the Contents API.
 */
export async function createOrUpdateBranch(
  branch: string,
  fromSha?: string,
): Promise<void> {
  const defaultBranch = await getDefaultBranch();
  const sha = fromSha || (await getBranchSha(defaultBranch));
  const exists = await branchExists(branch);

  if (exists) {
    // Force-update the branch ref to point at the new SHA
    const url = `${baseUrl()}/git/refs/heads/${branch}`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ sha, force: true }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `GitHub updateBranch "${branch}" failed (${res.status}): ${body}. ` +
        `Make sure your GITHUB_TOKEN has "Contents: Read and write" permission.`,
      );
    }
    return;
  }

  // ── Strategy 1: Git Refs API ──────────────────────────────────
  const refsUrl = `${baseUrl()}/git/refs`;
  console.log(
    `[githubClient] Creating branch "${branch}" from SHA ${sha} via POST ${refsUrl}`,
  );

  const refsRes = await fetch(refsUrl, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
  });

  if (refsRes.ok) {
    console.log(`[githubClient] Branch "${branch}" created successfully.`);
    return;
  }

  const refsBody = await refsRes.text();
  console.warn(
    `[githubClient] Git Refs API returned ${refsRes.status}: ${refsBody}. ` +
    `Trying fallback via GitHub Branches API…`,
  );

  // ── Strategy 2: Create via the Source Branch endpoint ──────────
  // POST /repos/{owner}/{repo}/git/refs  can 404 when the
  // fine-grained PAT hasn't been approved by the org, or lacks
  // the right scope. As a fallback, try creating the branch
  // through the higher-level Branches API (available since 2022):
  //   POST /repos/{owner}/{repo}/branches
  // does not exist — so we use the "create a fork" trick instead:
  //   We skip branch creation entirely and commit directly
  //   with the Contents API, specifying a new branch in the request.

  // The Contents API PUT endpoint can create a branch implicitly
  // when used with `branch` param pointing to a non-existent branch
  // IF we also supply the correct `sha` of the base file.
  // This is handled by the caller (commitFile), so we just need
  // to create the branch ref one more way:

  // Try using the GraphQL API as a second attempt
  const { token } = getConfig();
  const { owner, repo } = getConfig();

  // First, get the repository's node ID
  const repoInfoRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}`,
    { headers: authHeaders(), cache: "no-store" },
  );

  if (!repoInfoRes.ok) {
    throw new Error(
      `GitHub createBranch failed. Git Refs API returned ${refsRes.status}: ${refsBody}. ` +
      `Could not fall back — repo info fetch failed. ` +
      `Make sure your GITHUB_TOKEN has "Contents: Read and write" permission ` +
      `and that the token is approved by the "${owner}" organization.`,
    );
  }

  const repoInfo = await repoInfoRes.json();
  const repoNodeId = repoInfo.node_id;

  const graphqlRes = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `mutation CreateBranch($repoId: ID!, $branchName: String!, $oid: GitObjectID!) {
        createRef(input: { repositoryId: $repoId, name: $branchName, oid: $oid }) {
          ref { name }
        }
      }`,
      variables: {
        repoId: repoNodeId,
        branchName: `refs/heads/${branch}`,
        oid: sha,
      },
    }),
  });

  if (!graphqlRes.ok) {
    const graphqlBody = await graphqlRes.text();
    throw new Error(
      `GitHub createBranch failed via both REST and GraphQL.\n` +
      `  REST (${refsRes.status}): ${refsBody}\n` +
      `  GraphQL (${graphqlRes.status}): ${graphqlBody}\n` +
      `\nFix: Ensure your GITHUB_TOKEN has "Contents: Read and write" permission ` +
      `and is approved by the "${owner}" organization.`,
    );
  }

  const graphqlData = await graphqlRes.json();
  if (graphqlData.errors) {
    throw new Error(
      `GitHub createBranch GraphQL errors: ${JSON.stringify(graphqlData.errors)}.\n` +
      `REST also failed (${refsRes.status}): ${refsBody}\n` +
      `\nFix: Ensure your GITHUB_TOKEN has "Contents: Read and write" permission ` +
      `and is approved by the "${owner}" organization.`,
    );
  }

  console.log(
    `[githubClient] Branch "${branch}" created via GraphQL fallback.`,
  );
}

// ─── file commit ───────────────────────────────────────────────────

/**
 * Commit (create or update) a file on a specific branch.
 */
export async function commitFile(
  branch: string,
  path: string,
  content: string,
  existingSha: string,
  message: string,
): Promise<{ commitSha: string; htmlUrl: string }> {
  const url = `${baseUrl()}/contents/${path}`;
  const encoded = Buffer.from(content, "utf-8").toString("base64");

  const res = await fetch(url, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({
      message,
      content: encoded,
      sha: existingSha,
      branch,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `GitHub commitFile failed (${res.status}): ${body}`,
    );
  }

  const data = await res.json();
  return {
    commitSha: data.commit.sha,
    htmlUrl: data.content.html_url,
  };
}

// ─── merge ─────────────────────────────────────────────────────────

/**
 * Merge a branch into the default branch.
 */
export async function mergeBranch(
  branch: string,
  commitMessage?: string,
): Promise<{ sha: string; merged: boolean }> {
  const defaultBranch = await getDefaultBranch();
  const msg = commitMessage || `Merge ${branch} into ${defaultBranch}`;

  const url = `${baseUrl()}/merges`;
  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      base: defaultBranch,
      head: branch,
      commit_message: msg,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `GitHub mergeBranch failed (${res.status}): ${body}`,
    );
  }

  const data = await res.json();
  return { sha: data.sha, merged: true };
}

// ─── cleanup ───────────────────────────────────────────────────────

/**
 * Delete a branch.
 */
export async function deleteBranch(branch: string): Promise<void> {
  const url = `${baseUrl()}/git/refs/heads/${branch}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: authHeaders(),
  });

  // 422 = ref doesn't exist — that's fine
  if (!res.ok && res.status !== 422 && res.status !== 404) {
    const body = await res.text();
    throw new Error(
      `GitHub deleteBranch failed (${res.status}): ${body}`,
    );
  }
}

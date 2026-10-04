import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve, join } from "node:path";
import { parallel } from "./formatter.ts";

// Popular, substantial TS codebases from GitHub's star-ranked TypeScript search.
export const repositories = [
  "microsoft/vscode",
  "angular/angular",
  "excalidraw/excalidraw",
  "supabase/supabase",
  "n8n-io/n8n",
  "freeCodeCamp/freeCodeCamp",
  "openclaw/openclaw",
  "vuejs/vue",
  "firecrawl/firecrawl",
  "langgenius/dify",
  "shadcn-ui/ui",
  "immich-app/immich",
  "google-gemini/gemini-cli",
  "ant-design/ant-design",
  "tailwindlabs/tailwindcss",
  "microsoft/playwright",
  "puppeteer/puppeteer",
  "storybookjs/storybook",
  "mermaid-js/mermaid",
  "vitejs/vite",
  "hoppscotch/hoppscotch",
  "nestjs/nest",
  "strapi/strapi",
  "withastro/astro",
  "facebook/docusaurus",
];
const exec = promisify(execFile);
export async function cloneRepos(count: number) {
  const root = resolve("tmp");
  await mkdir(root, { recursive: true });
  await parallel(repositories.slice(0, count), 5, async (repo) => {
    const path = join(root, repo.replace("/", "--"));
    try {
      await access(join(path, ".git"));
    } catch {
      await exec(
        "git",
        [
          "clone",
          "--depth=1",
          "--filter=blob:none",
          `https://github.com/${repo}.git`,
          path,
        ],
        { maxBuffer: 10_000_000 },
      );
    }
    console.log(`Cloned ${repo}`);
  });
  const search = JSON.parse(
    await readFile(join(root, "github-top.json"), "utf8"),
  );
  const manifest = await Promise.all(
    repositories.slice(0, count).map(async (repo) => ({
      repo,
      stars: search.items.find(
        (item: { full_name: string }) => item.full_name === repo,
      )?.stargazers_count,
      commit: (
        await exec("git", [
          "-C",
          join(root, repo.replace("/", "--")),
          "rev-parse",
          "HEAD",
        ])
      ).stdout.trim(),
    })),
  );
  await writeFile(join(root, "repos.json"), JSON.stringify(manifest, null, 2));
}
if (process.argv[1] === import.meta.filename)
  await cloneRepos(Number(process.argv[2] ?? 5));

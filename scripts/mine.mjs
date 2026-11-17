// Run dev / deploy against your personal config (wrangler.mine.jsonc) instead of the template.
//   npm run dev:mine      local dev server, using your config's bindings
//   npm run deploy:mine   apply new migrations to your remote D1, build, deploy
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const CONFIG = "wrangler.mine.jsonc";
if (!existsSync(CONFIG)) {
  console.error(`${CONFIG} not found. Copy wrangler.jsonc to ${CONFIG} and fill in your ids first.`);
  process.exit(1);
}
const env = { ...process.env, WRANGLER_CONFIG: CONFIG };
const run = (cmd) => {
  console.log(`\n> ${cmd}`);
  const r = spawnSync(cmd, { stdio: "inherit", shell: true, env });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

const task = process.argv[2];
if (task === "dev") {
  run(`npx wrangler d1 migrations apply phonglab --local --config ${CONFIG}`);
  run("npx vite");
} else if (task === "deploy") {
  run(`npx wrangler d1 migrations apply phonglab --remote --config ${CONFIG}`);
  run("npx vite build");
  run("npx wrangler deploy");
} else {
  console.error("usage: node scripts/mine.mjs <dev|deploy>");
  process.exit(1);
}

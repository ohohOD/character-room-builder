import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const nextCli = fileURLToPath(
  new URL("../node_modules/next/dist/bin/next", import.meta.url),
);
const result = spawnSync(process.execPath, [nextCli, "build"], {
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  env: {
    ...process.env,
    CRB_GITHUB_PAGES: "true",
    NEXT_TELEMETRY_DISABLED: "1",
  },
  stdio: "inherit",
});

process.exit(result.status ?? 1);

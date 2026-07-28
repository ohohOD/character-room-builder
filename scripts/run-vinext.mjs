import { spawn } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

const command = process.argv[2];

if (!["dev", "build", "start"].includes(command)) {
  throw new Error("Expected dev, build, or start");
}

const vinextCli = fileURLToPath(
  new URL("../node_modules/vinext/dist/cli.js", import.meta.url),
);
const child = spawn(process.execPath, [vinextCli, command], {
  env: {
    ...process.env,
    WRANGLER_LOG_PATH: ".wrangler/wrangler.log",
  },
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

child.on("exit", (code) => process.exit(code ?? 1));

import { loadEnv } from "@civis/platform/config";
import { migrate } from "./commands/migrate.js";
import { replay } from "./commands/replay.js";
import { verify } from "./commands/verify.js";

async function main() {
  const env = loadEnv(process.env);
  const [command, ...rest] = process.argv.slice(2);

  if (!command) throw new Error("Command required: migrate | replay | verify");

  switch (command) {
    case "migrate":
      await migrate(env);
      return;
    case "replay":
      await replay(env, rest);
      return;
    case "verify":
      await verify(env);
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main();

import { loadEnv } from "@civis/platform/config";
import { createWorker } from "./worker.js";

async function bootstrap() {
  const env = loadEnv(process.env);
  const worker = await createWorker(env);
  await worker.run();
}

bootstrap();

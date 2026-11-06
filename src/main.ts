import { startBot } from "./bot.js";
import { loadBotConfig } from "./config.js";

const client = await startBot(loadBotConfig());

const shutdown = async () => {
  await client.destroy();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

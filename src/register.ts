/**
 * Registers (or updates) the slash commands in the configured guild.
 *
 *   pnpm register
 */
import { REST, Routes } from "discord.js";
import { COMMAND_DEFINITIONS } from "./commands.js";
import { loadBotConfig } from "./config.js";

const config = loadBotConfig();
const rest = new REST().setToken(config.discordToken);
await rest.put(Routes.applicationGuildCommands(config.applicationId, config.guildId), { body: COMMAND_DEFINITIONS });
console.info(`Registered ${COMMAND_DEFINITIONS.length} commands in guild ${config.guildId}`);

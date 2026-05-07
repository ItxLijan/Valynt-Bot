import 'dotenv/config';
import { Client, GatewayIntentBits, Partials, Collection } from 'discord.js';
import { loadCommands } from './bot/handlers/commandHandler';
import { loadEvents } from './bot/handlers/eventHandler';
import { logger } from './utils/logger';
import { setDiscordClient } from './bot/clientRef';

declare module 'discord.js' {
  interface Client { commands: Collection<string, any>; }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences, GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember],
});

client.commands = new Collection();
setDiscordClient(client);

async function main() {
  logger.info('Starting Discord Bot...');
  await loadCommands(client);
  await loadEvents(client);
  await client.login(process.env.DISCORD_TOKEN);
}

main().catch((err) => { logger.error('Failed to start bot:', err); process.exit(1); });

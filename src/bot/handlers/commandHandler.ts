import { Client, REST, Routes } from 'discord.js';
import { readdirSync } from 'fs';
import { join } from 'path';
import { logger } from '../../utils/logger';

export async function loadCommands(client: Client) {
  const commandsPath = join(__dirname, '../commands');
  const commandFiles = readdirSync(commandsPath).filter(
    (file) => file.endsWith('.js') && !file.endsWith('.d.ts')
  );

  const commands = [];

  for (const file of commandFiles) {
    const filePath = join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
      commands.push(command.data.toJSON());
      logger.info(`Loaded command: ${command.data.name}`);
    }
  }

  // Register slash commands globally
  const rest = new REST().setToken(process.env.DISCORD_TOKEN!);
  try {
    logger.info(`Registering ${commands.length} slash commands...`);
    await rest.put(
      Routes.applicationCommands(process.env.DISCORD_CLIENT_ID!),
      { body: commands }
    );
    logger.info('Slash commands registered successfully.');
  } catch (error) {
    logger.error('Failed to register slash commands:', error);
  }
}

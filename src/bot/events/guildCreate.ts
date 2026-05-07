import { Guild } from 'discord.js';
import { prisma } from '../../database/client';
import { logger } from '../../utils/logger';

export const name = 'guildCreate';
export const once = false;

export async function execute(guild: Guild) {
  logger.info(`Bot joined guild: ${guild.name} (${guild.id})`);
  // Create empty config so guild shows up in dashboard bot-guilds list
  await prisma.guildConfig.upsert({
    where: { guildId: guild.id },
    update: {},
    create: { guildId: guild.id },
  });
}

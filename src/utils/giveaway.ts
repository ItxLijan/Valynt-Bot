import { Client } from 'discord.js';
import { prisma } from '../database/client';
import { endGiveaway } from '../bot/commands/giveaway';

export async function checkGiveaways(client: Client) {
  const expired = await prisma.giveaway.findMany({
    where: { ended: false, endsAt: { lte: new Date() } },
  });
  for (const giveaway of expired) {
    const guild = client.guilds.cache.get(giveaway.guildId);
    if (!guild) continue;
    await endGiveaway(giveaway, guild).catch(() => {});
  }
}

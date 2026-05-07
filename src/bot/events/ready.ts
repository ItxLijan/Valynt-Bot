import { Client, ActivityType } from 'discord.js';
import { logger } from '../../utils/logger';
import cron from 'node-cron';
import { prisma } from '../../database/client';
import { updateLeaderboard } from '../../utils/xpEconomy';
import { checkGiveaways } from '../../utils/giveaway';
import { checkStreams } from '../../utils/streamNotifier';

export const name = 'ready';
export const once = true;

async function updateMemberActivity(client: Client) {
  let total = 0;
  for (const [, guild] of client.guilds.cache) {
    const g = await guild.fetch().catch(() => guild);
    total += g.memberCount;
  }
  client.user?.setActivity(`${total.toLocaleString('de-DE')} Mitglieder`, { type: ActivityType.Watching });
}

export async function execute(client: Client) {
  logger.info(`✅ Bot eingeloggt als ${client.user?.tag}`);
  await updateMemberActivity(client);

  // Seed config for all existing guilds so dashboard can detect them
  for (const [, guild] of client.guilds.cache) {
    await prisma.guildConfig.upsert({
      where: { guildId: guild.id },
      update: {},
      create: { guildId: guild.id },
    }).catch(() => {});
  }
  logger.info(`Seeded config for ${client.guilds.cache.size} guilds`);

  // Member count activity every 5 minutes
  cron.schedule('*/5 * * * *', () => updateMemberActivity(client));

  // Leaderboard update every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    for (const [, guild] of client.guilds.cache) {
      await updateLeaderboard(guild.id, guild, 'xp').catch(() => {});
      await updateLeaderboard(guild.id, guild, 'coins').catch(() => {});
    }
  });

  // Birthday check daily at 8:00
  cron.schedule('0 8 * * *', async () => {
    const now = new Date();
    const today = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const birthdays = await prisma.userData.findMany({ where: { birthday: today } });
    for (const bday of birthdays) {
      const guild = client.guilds.cache.get(bday.guildId);
      if (!guild) continue;
      const config = await prisma.guildConfig.findUnique({ where: { guildId: bday.guildId } });
      if (!config?.birthdayChannel) continue;
      const channel = guild.channels.cache.get(config.birthdayChannel) as any;
      if (!channel) continue;
      await channel.send({ content: `🎂 **Herzlichen Glückwunsch zum Geburtstag, <@${bday.userId}>!** 🎉🎈` }).catch(() => {});
    }
  });

  // Voice XP & coins every minute
  cron.schedule('* * * * *', async () => {
    const sessions = await prisma.voiceSession.findMany();
    for (const session of sessions) {
      const guild = client.guilds.cache.get(session.guildId);
      if (!guild) continue;
      const config = await prisma.guildConfig.findUnique({ where: { guildId: session.guildId } });
      if (!config) continue;
      const xpBlacklist: string[] = JSON.parse(config.xpBlacklistChannels || '[]');
      const coinBlacklist: string[] = JSON.parse((config as any).coinBlacklistChannels || '[]');
      const { addXPAndCoins } = await import('../../utils/xpEconomy');
      const xpGain = xpBlacklist.includes(session.channelId) ? 0 : config.xpPerVoiceMinute;
      const coinGain = coinBlacklist.includes(session.channelId) ? 0 : config.coinsPerVoiceMinute;
      if (xpGain > 0 || coinGain > 0) {
        await addXPAndCoins(session.userId, session.guildId, xpGain, coinGain, guild).catch(() => {});
      }
    }
  });

  cron.schedule('* * * * *', () => checkGiveaways(client));
  cron.schedule('*/3 * * * *', () => checkStreams(client));
}

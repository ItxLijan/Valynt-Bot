import { prisma } from '../database/client';
import { Guild, TextChannel, EmbedBuilder } from 'discord.js';
import { FOOTER_TEXT } from './embed';

export function calculateLevel(xp: number): number {
  return Math.floor(Math.sqrt(xp / 150));
}
export function xpForLevel(level: number): number {
  return level * level * 150;
}
export async function getOrCreateUser(userId: string, guildId: string) {
  return prisma.userData.upsert({
    where: { userId_guildId: { userId, guildId } },
    update: {},
    create: { userId, guildId },
  });
}

export async function addXPAndCoins(
  userId: string, guildId: string,
  xpAmount: number, coinAmount: number,
  guild: Guild
): Promise<void> {
  const user = await getOrCreateUser(userId, guildId);
  const newXp = user.xp + xpAmount;
  const newLevel = calculateLevel(newXp);
  const leveledUp = newLevel > user.level;
  const newCoins = user.coins + coinAmount;

  await prisma.userData.update({
    where: { userId_guildId: { userId, guildId } },
    data: { xp: newXp, level: newLevel, coins: newCoins },
  });

  if (leveledUp) await sendLevelUpNotification(userId, guildId, newLevel, guild);

  const { logXpCoins } = await import('../bot/events/logEvents');
  await logXpCoins(guildId, guild, userId, xpAmount, coinAmount, newXp, newCoins, leveledUp, newLevel).catch(() => {});
}

export async function addXP(userId: string, guildId: string, amount: number, guild: Guild) {
  return addXPAndCoins(userId, guildId, amount, 0, guild);
}
export async function addCoins(userId: string, guildId: string, amount: number) {
  await getOrCreateUser(userId, guildId);
  await prisma.userData.update({
    where: { userId_guildId: { userId, guildId } },
    data: { coins: { increment: amount } },
  });
}

async function sendLevelUpNotification(userId: string, guildId: string, newLevel: number, guild: Guild) {
  const config = await prisma.guildConfig.findUnique({ where: { guildId } });
  if (!config?.xpLeaderboardChannel) return;
  const channel = guild.channels.cache.get(config.xpLeaderboardChannel) as TextChannel;
  if (!channel) return;
  const embed = new EmbedBuilder()
    .setColor(0xf0a500).setTitle('⬆️ Level Up!')
    .setDescription(`<@${userId}> hat **Level ${newLevel}** erreicht! 🎉`)
    .setFooter({ text: FOOTER_TEXT }).setTimestamp();
  await channel.send({ embeds: [embed] }).catch(() => {});
}

// Leaderboard message ID cache (in-memory, per guild+type)
const lbMessageIds = new Map<string, string>();

export async function updateLeaderboard(guildId: string, guild: Guild, type: 'xp' | 'coins') {
  const config = await prisma.guildConfig.findUnique({ where: { guildId } });
  const channelId = type === 'xp' ? config?.xpLeaderboardChannel : config?.coinLeaderboardChannel;
  if (!channelId) return;
  const channel = guild.channels.cache.get(channelId) as TextChannel;
  if (!channel) return;

  const top10 = await prisma.userData.findMany({
    where: { guildId },
    orderBy: type === 'xp' ? { xp: 'desc' } : { coins: 'desc' },
    take: 10,
  });
  const lines = await Promise.all(
    top10.map(async (u, i) => {
      const member = await guild.members.fetch(u.userId).catch(() => null);
      const name = member?.displayName ?? 'Unbekannt';
      const medals = ['🥇', '🥈', '🥉'];
      const prefix = medals[i] ?? `**#${i + 1}**`;
      return type === 'xp'
        ? `${prefix} ${name} — **${u.xp} XP** (Level ${u.level})`
        : `${prefix} ${name} — **${u.coins} 🪙**`;
    })
  );
  // No buttons/components — plain embed only
  const embed = new EmbedBuilder()
    .setColor(type === 'xp' ? 0x5865f2 : 0xf0a500)
    .setTitle(type === 'xp' ? '🏆 XP Leaderboard – Top 10' : '💰 Coins Leaderboard – Top 10')
    .setDescription(lines.join('\n') || 'Noch keine Daten.')
    .setFooter({ text: `${FOOTER_TEXT} • Wird automatisch aktualisiert` })
    .setTimestamp();

  const cacheKey = `${guildId}-${type}`;
  const cachedId = lbMessageIds.get(cacheKey);

  try {
    if (cachedId) {
      const msg = await channel.messages.fetch(cachedId).catch(() => null);
      if (msg) { await msg.edit({ embeds: [embed], components: [] }); return; }
    }
    // Scan last 20 messages for an existing leaderboard by this bot
    const msgs = await channel.messages.fetch({ limit: 20 });
    const existing = msgs.find(m =>
      m.author.bot &&
      m.embeds.length > 0 &&
      (m.embeds[0].title?.includes('Leaderboard') || m.embeds[0].title?.includes('Top 10'))
    );
    if (existing) {
      lbMessageIds.set(cacheKey, existing.id);
      await existing.edit({ embeds: [embed], components: [] });
    } else {
      const sent = await channel.send({ embeds: [embed], components: [] });
      lbMessageIds.set(cacheKey, sent.id);
    }
  } catch {
    const sent = await channel.send({ embeds: [embed], components: [] }).catch(() => null);
    if (sent) lbMessageIds.set(cacheKey, sent.id);
  }
}

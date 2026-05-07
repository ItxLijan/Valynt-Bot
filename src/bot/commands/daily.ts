import {
  SlashCommandBuilder, ChatInputCommandInteraction,
  EmbedBuilder, MessageFlags, TextChannel,
} from 'discord.js';
import { prisma } from '../../database/client';
import { FOOTER_TEXT } from '../../utils/embed';
import { addXPAndCoins } from '../../utils/xpEconomy';

export const data = new SlashCommandBuilder()
  .setName('daily')
  .setDescription('Hole deine tägliche Streak-Belohnung ab!');

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: 64 });

  const guildId = interaction.guild!.id;
  const userId  = interaction.user.id;
  const now     = new Date();

  // Load streak config
  const config = await (prisma as any).guildStreakConfig.findUnique({ where: { guildId } })
    ?? { xpBase: 50, coinsBase: 25, maxMultiplier: 7, channelId: null };

  // Load or create user streak
  const streakRec = await (prisma as any).userStreak.upsert({
    where: { userId_guildId: { userId, guildId } },
    update: {},
    create: { userId, guildId },
  });

  // Check if already claimed today
  if (streakRec.lastClaim) {
    const last = new Date(streakRec.lastClaim);
    const lastDay = new Date(last.getFullYear(), last.getMonth(), last.getDate());
    const today   = new Date(now.getFullYear(),  now.getMonth(),  now.getDate());
    const diff = (today.getTime() - lastDay.getTime()) / 86400000;

    if (diff < 1) {
      const tomorrow = new Date(today.getTime() + 86400000);
      const secs = Math.floor((tomorrow.getTime() - now.getTime()) / 1000);
      const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('⏰ Bereits abgeholt!')
        .setDescription(`Du hast deine Belohnung heute schon abgeholt!\n\nNächstes Claim in **${h}h ${m}m**.`)
        .addFields({ name: '🔥 Aktueller Streak', value: `**${streakRec.streak} Tage**`, inline: true })
        .setFooter({ text: FOOTER_TEXT })
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Streak broken if more than 1 day passed
    if (diff > 1) {
      await (prisma as any).userStreak.update({
        where: { userId_guildId: { userId, guildId } },
        data: { streak: 0 },
      });
      streakRec.streak = 0;
    }
  }

  // Calculate new streak and rewards
  const newStreak = streakRec.streak + 1;
  const multi     = Math.min(newStreak, config.maxMultiplier);
  const xpReward  = config.xpBase * multi;
  const coinReward = config.coinsBase * multi;

  await (prisma as any).userStreak.update({
    where: { userId_guildId: { userId, guildId } },
    data: { streak: newStreak, lastClaim: now, totalClaims: { increment: 1 } },
  });

  await addXPAndCoins(userId, guildId, xpReward, coinReward, interaction.guild!).catch(() => {});

  // Streak milestone emojis
  const flames = newStreak >= 30 ? '🔥🔥🔥' : newStreak >= 14 ? '🔥🔥' : '🔥';
  const milestone = newStreak === 7  ? '\n\n🎉 **7-Tage Meilenstein!**' :
                    newStreak === 14 ? '\n\n🏆 **14-Tage Meilenstein!**' :
                    newStreak === 30 ? '\n\n👑 **30-Tage Meilenstein!**' : '';

  const embed = new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle(`${flames} Daily Streak Abgeholt!`)
    .setDescription(`<@${userId}> hat ihre tägliche Belohnung abgeholt!${milestone}`)
    .addFields(
      { name: '🔥 Streak', value: `**${newStreak} Tage**`, inline: true },
      { name: '⭐ XP', value: `**+${xpReward}**`, inline: true },
      { name: '🪙 Coins', value: `**+${coinReward}**`, inline: true },
      { name: '✖️ Multiplikator', value: `**${multi}×** (Max: ${config.maxMultiplier}×)`, inline: true },
    )
    .setThumbnail(interaction.user.displayAvatarURL())
    .setFooter({ text: FOOTER_TEXT })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });

  // Also post in streak channel if configured
  if (config.channelId && config.channelId !== interaction.channel?.id) {
    const ch = interaction.guild!.channels.cache.get(config.channelId) as TextChannel | undefined;
    if (ch) await ch.send({ embeds: [embed] }).catch(() => {});
  }
}

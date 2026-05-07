import { GuildMember, EmbedBuilder, TextChannel } from 'discord.js';
import { prisma } from '../../database/client';
import { FOOTER_TEXT } from '../../utils/embed';
import { logger } from '../../utils/logger';

export const name = 'guildMemberAdd';
export const once = false;

export async function execute(member: GuildMember) {
  const guildId = member.guild.id;
  const config = await prisma.guildConfig.findUnique({ where: { guildId } });
  if (!config) return;

  // --- Auto Roles ---
  const autoRoles: string[] = JSON.parse(config.autoRoles || '[]');
  for (const roleId of autoRoles) {
    const role = member.guild.roles.cache.get(roleId);
    if (role) await member.roles.add(role).catch((e) => logger.error(`AutoRole: ${e.message}`));
  }

  // --- Welcome Message ---
  if (config.welcomeChannel) {
    const channel = member.guild.channels.cache.get(config.welcomeChannel) as TextChannel | undefined;
    if (channel) {
      const memberCount = member.guild.memberCount;
      const rawMsg = config.welcomeMessage
        || 'Willkommen auf **{server}**, {user}!\nDu bist Mitglied **#{count}**. 🎉';

      const text = rawMsg
        .replace(/{user}/g, `<@${member.id}>`)
        .replace(/{server}/g, member.guild.name)
        .replace(/{count}/g, String(memberCount))
        .replace(/{username}/g, member.user.username);

      const title = (config.welcomeTitle || `👋 Willkommen auf ${member.guild.name}!`)
        .replace(/{server}/g, member.guild.name)
        .replace(/{username}/g, member.user.username);

      const showAvatar =
        config.welcomeShowAvatar === true ||
        (config.welcomeShowAvatar as any) === 1 ||
        String(config.welcomeShowAvatar) === 'true';

      // Build avatar URL manually from CDN — most reliable
      const freshUser = await member.client.users.fetch(member.id, { force: true }).catch(() => member.user);
      const avatarHash = freshUser.avatar;
      let avatarUrl: string;
      if (avatarHash) {
        const ext = avatarHash.startsWith('a_') ? 'gif' : 'png';
        avatarUrl = `https://cdn.discordapp.com/avatars/${freshUser.id}/${avatarHash}.${ext}?size=256`;
      } else {
        const index = Number(BigInt(freshUser.id) >> 22n) % 6;
        avatarUrl = `https://cdn.discordapp.com/embed/avatars/${index}.png`;
      }

      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle(title)
        .setDescription(text)
        .setFooter({ text: FOOTER_TEXT })
        .setTimestamp();

      // setThumbnail = small image top-right, appears next to the text lines (4 lines tall)
      if (showAvatar) {
        embed.setThumbnail(avatarUrl);
      }

      await channel.send({ embeds: [embed] })
        .catch((e) => logger.error(`Welcome send: ${e.message}`));
    }
  }

  // --- Log Join ---
  if (config.logChannel) {
    const logCh = member.guild.channels.cache.get(config.logChannel) as TextChannel | undefined;
    if (logCh) {
      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('➕ Mitglied beigetreten')
        .setDescription(`<@${member.id}> (${member.user.tag}) hat den Server betreten.`)
        .addFields(
          { name: 'Account erstellt', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
          { name: 'Mitglied Nr.', value: `#${member.guild.memberCount}`, inline: true }
        )
        .setThumbnail(member.user.displayAvatarURL({ extension: 'png', size: 256 }))
        .setFooter({ text: FOOTER_TEXT })
        .setTimestamp();
      await logCh.send({ embeds: [embed] }).catch(() => {});
    }
  }
}

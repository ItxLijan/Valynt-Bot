import {
  Message, PartialMessage, EmbedBuilder, TextChannel,
  GuildMember, PartialGuildMember, Guild,
} from 'discord.js';
import { prisma } from '../../database/client';
import { FOOTER_TEXT } from '../../utils/embed';

async function sendLog(guildId: string, guild: Guild, embed: EmbedBuilder, sourceChannelId?: string) {
  const config = await prisma.guildConfig.findUnique({ where: { guildId } });
  if (!config?.logChannel) return;
  if (sourceChannelId) {
    const ignored: string[] = JSON.parse(config.logIgnoreChannels || '[]');
    if (ignored.includes(sourceChannelId)) return;
  }
  const channel = guild.channels.cache.get(config.logChannel) as TextChannel | undefined;
  if (!channel) return;
  embed.setFooter({ text: FOOTER_TEXT }).setTimestamp();
  await channel.send({ embeds: [embed] }).catch(() => {});
}

// ─── messageDelete ────────────────────────────────────────────────────────────
export const messageDeleteEvent = {
  name: 'messageDelete', once: false,
  async execute(message: Message | PartialMessage) {
    if (!message.guild) return;
    // Fetch full message if partial to get author + content
    let full: Message | PartialMessage = message;
    if (message.partial) {
      full = await (message as PartialMessage).fetch().catch(() => message);
    }
    if (full.author?.bot) return;

    const authorVal = full.author
      ? `<@${full.author.id}> (${full.author.tag})`
      : '*(nicht im Cache – Nachricht war zu alt)*';

    let contentVal = '*(kein Text)*';
    if (full.content?.trim()) {
      contentVal = full.content.slice(0, 1024);
    } else if (full.attachments && full.attachments.size > 0) {
      contentVal = `*(${full.attachments.size} Datei(en) – kein Text)*`;
    } else if (full.embeds?.length) {
      contentVal = `*(Embed-Nachricht)*`;
    }

    const embed = new EmbedBuilder().setColor(0xed4245).setTitle('🗑️ Nachricht gelöscht')
      .addFields(
        { name: 'Autor', value: authorVal, inline: true },
        { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
        { name: 'Inhalt', value: contentVal }
      );
    await sendLog(message.guild.id, message.guild, embed, message.channel.id);
  },
};

// ─── messageUpdate ────────────────────────────────────────────────────────────
export const messageUpdateEvent = {
  name: 'messageUpdate', once: false,
  async execute(oldMsg: Message | PartialMessage, newMsg: Message | PartialMessage) {
    if (!oldMsg.guild || oldMsg.author?.bot) return;
    if (oldMsg.content === newMsg.content) return;
    const embed = new EmbedBuilder().setColor(0xfee75c).setTitle('✏️ Nachricht bearbeitet')
      .addFields(
        { name: 'Autor', value: oldMsg.author ? `<@${oldMsg.author.id}> (${oldMsg.author.tag})` : 'Unbekannt', inline: true },
        { name: 'Channel', value: `<#${oldMsg.channel.id}>`, inline: true },
        { name: 'Vorher', value: oldMsg.content?.slice(0, 512) || '*Leer*' },
        { name: 'Nachher', value: newMsg.content?.slice(0, 512) || '*Leer*' }
      ).setURL(newMsg.url);
    await sendLog(oldMsg.guild.id, oldMsg.guild, embed, oldMsg.channel.id);
  },
};

// ─── guildMemberUpdate ────────────────────────────────────────────────────────
export const guildMemberUpdateEvent = {
  name: 'guildMemberUpdate', once: false,
  async execute(oldMember: GuildMember | PartialGuildMember, newMember: GuildMember) {
    const addedRoles = newMember.roles.cache.filter((r) => !oldMember.roles.cache.has(r.id));
    const removedRoles = oldMember.roles.cache.filter((r) => !newMember.roles.cache.has(r.id));
    const nickChanged = oldMember.nickname !== newMember.nickname;
    if (addedRoles.size === 0 && removedRoles.size === 0 && !nickChanged) return;
    const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('🔄 Mitglied aktualisiert')
      .setDescription(`<@${newMember.id}> (${newMember.user.tag})`)
      .setThumbnail(newMember.user.displayAvatarURL());
    if (addedRoles.size > 0) embed.addFields({ name: '✅ Rolle hinzugefügt', value: addedRoles.map((r) => r.toString()).join(', ') });
    if (removedRoles.size > 0) embed.addFields({ name: '❌ Rolle entfernt', value: removedRoles.map((r) => r.toString()).join(', ') });
    if (nickChanged) embed.addFields({ name: '✏️ Nickname', value: `${oldMember.nickname ?? '*keiner*'} → ${newMember.nickname ?? '*keiner*'}` });
    await sendLog(newMember.guild.id, newMember.guild, embed);
  },
};

// ─── guildMemberRemove ────────────────────────────────────────────────────────
export const guildMemberRemoveEvent = {
  name: 'guildMemberRemove', once: false,
  async execute(member: GuildMember | PartialGuildMember) {
    const embed = new EmbedBuilder().setColor(0xed4245).setTitle('👋 Mitglied verlassen')
      .setDescription(`<@${member.id}> (${member.user?.tag ?? 'Unbekannt'}) hat den Server verlassen.`)
      .setThumbnail(member.user?.displayAvatarURL() ?? null)
      .addFields({ name: 'Rollen', value: member.roles.cache.filter(r => !r.managed && r.id !== member.guild.id).map(r => r.toString()).join(', ') || '—' });
    await sendLog(member.guild.id, member.guild, embed);
  },
};

// ─── Shop purchase log (called from buy command) ──────────────────────────────
export async function logPurchase(guildId: string, guild: Guild, userId: string, itemName: string, price: number) {
  const config = await prisma.guildConfig.findUnique({ where: { guildId } });
  if (!config?.logChannel) return;
  const channel = guild.channels.cache.get(config.logChannel) as TextChannel | undefined;
  if (!channel) return;
  const embed = new EmbedBuilder()
    .setColor(0xf0a500).setTitle('🛒 Shop-Kauf')
    .setDescription(`<@${userId}> hat ein Item gekauft.`)
    .addFields(
      { name: '📦 Item', value: itemName, inline: true },
      { name: '💰 Preis', value: `${price} 🪙`, inline: true },
    )
    .setFooter({ text: FOOTER_TEXT }).setTimestamp();
  await channel.send({ embeds: [embed] }).catch(() => {});
}

// ─── XP / Coins / Level log ───────────────────────────────────────────────────
export async function logXpCoins(
  guildId: string, guild: Guild, userId: string,
  xpGained: number, coinsGained: number,
  newXp: number, newCoins: number,
  leveledUp: boolean, newLevel: number
) {
  const config = await prisma.guildConfig.findUnique({ where: { guildId } });
  if (!config?.logChannel) return;
  const channel = guild.channels.cache.get(config.logChannel) as TextChannel | undefined;
  if (!channel) return;
  const embed = new EmbedBuilder()
    .setColor(leveledUp ? 0xf0a500 : 0x5865f2)
    .setTitle(leveledUp ? `⬆️ Level Up! → Level ${newLevel}` : '📊 XP & Coins erhalten')
    .setDescription(`<@${userId}>`)
    .addFields(
      { name: '⭐ XP', value: `+${xpGained} → **${newXp} gesamt**`, inline: true },
      { name: '🪙 Coins', value: `+${coinsGained} → **${newCoins} gesamt**`, inline: true },
    )
    .setFooter({ text: FOOTER_TEXT }).setTimestamp();
  if (leveledUp) embed.addFields({ name: '🎯 Neues Level', value: `**${newLevel}**`, inline: true });
  await channel.send({ embeds: [embed] }).catch(() => {});
}

// ─── Ticket log ───────────────────────────────────────────────────────────────
export async function logTicket(
  guildId: string, guild: Guild,
  action: 'opened' | 'closed' | 'claimed',
  userId: string, ticketNumber: number, categoryLabel: string,
  channelId: string, claimedBy?: string
) {
  const config = await prisma.guildConfig.findUnique({ where: { guildId } });
  if (!config?.logChannel) return;
  const channel = guild.channels.cache.get(config.logChannel) as TextChannel | undefined;
  if (!channel) return;

  const colors = { opened: 0x57f287, closed: 0xed4245, claimed: 0xfee75c };
  const titles = {
    opened: `🎫 Ticket #${ticketNumber} geöffnet`,
    closed: `🔒 Ticket #${ticketNumber} geschlossen`,
    claimed: `✋ Ticket #${ticketNumber} übernommen`,
  };

  const embed = new EmbedBuilder()
    .setColor(colors[action])
    .setTitle(titles[action])
    .addFields(
      { name: 'Kategorie', value: categoryLabel, inline: true },
      { name: action === 'closed' ? 'Geschlossen von' : 'User', value: `<@${userId}>`, inline: true },
      { name: 'Channel', value: `<#${channelId}>`, inline: true },
    )
    .setFooter({ text: FOOTER_TEXT }).setTimestamp();

  if (action === 'claimed' && claimedBy) {
    embed.addFields({ name: 'Übernommen von', value: `<@${claimedBy}>`, inline: true });
  }

  await channel.send({ embeds: [embed] }).catch(() => {});
}

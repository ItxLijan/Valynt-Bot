import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder,
  MessageFlags, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel
} from 'discord.js';
import { prisma } from '../../database/client';
import { FOOTER_TEXT } from '../../utils/embed';

export const data = new SlashCommandBuilder()
  .setName('giveaway')
  .setDescription('Giveaway-Verwaltung')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub.setName('start').setDescription('Starte ein neues Giveaway')
      .addStringOption((o) => o.setName('preis').setDescription('Was wird verlost?').setRequired(true))
      .addStringOption((o) => o.setName('dauer').setDescription('Dauer z.B. 1h, 30m, 2d').setRequired(true))
      .addIntegerOption((o) => o.setName('gewinner').setDescription('Anzahl Gewinner').setRequired(true).setMinValue(1).setMaxValue(20))
      .addStringOption((o) => o.setName('beschreibung').setDescription('Beschreibung').setRequired(false))
      .addStringOption((o) => o.setName('nur-rollen').setDescription('Nur diese Rollen dürfen mitmachen (Rollen-IDs kommagetrennt)').setRequired(false))
      .addStringOption((o) => o.setName('verbotene-rollen').setDescription('Diese Rollen dürfen NICHT mitmachen (kommagetrennt)').setRequired(false))
  )
  .addSubcommand((sub) =>
    sub.setName('end').setDescription('Beende ein Giveaway vorzeitig')
      .addStringOption((o) => o.setName('id').setDescription('Giveaway-ID').setRequired(true))
  )
  .addSubcommand((sub) =>
    sub.setName('reroll').setDescription('Neuen Gewinner auslosen')
      .addStringOption((o) => o.setName('id').setDescription('Giveaway-ID').setRequired(true))
  );

function parseDuration(str: string): number {
  const match = str.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return 0;
  const n = parseInt(match[1]);
  const unit = match[2];
  const map: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return n * map[unit];
}

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: 64 });
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guild!.id;

  if (sub === 'start') {
    const preis = interaction.options.getString('preis', true);
    const dauerStr = interaction.options.getString('dauer', true);
    const gewinner = interaction.options.getInteger('gewinner', true);
    const beschreibung = interaction.options.getString('beschreibung') ?? '';
    const nurRollen = interaction.options.getString('nur-rollen')?.split(',').map(r => r.trim()).filter(Boolean) ?? [];
    const verbRollen = interaction.options.getString('verbotene-rollen')?.split(',').map(r => r.trim()).filter(Boolean) ?? [];
    const ms = parseDuration(dauerStr);
    if (!ms) { await interaction.editReply({ content: '❌ Ungültige Dauer. Beispiele: `1h`, `30m`, `2d`' }); return; }

    const config = await prisma.guildConfig.findUnique({ where: { guildId } });
    const channelId = config?.giveawayChannel ?? interaction.channel!.id;
    const channel = interaction.guild!.channels.cache.get(channelId) as TextChannel | undefined;
    if (!channel) { await interaction.editReply({ content: '❌ Giveaway-Channel nicht gefunden.' }); return; }

    const endsAt = new Date(Date.now() + ms);
    const restrictions: string[] = [];
    if (nurRollen.length) restrictions.push(`✅ Nur: ${nurRollen.map(r => `<@&${r}>`).join(', ')}`);
    if (verbRollen.length) restrictions.push(`❌ Nicht: ${verbRollen.map(r => `<@&${r}>`).join(', ')}`);

    const embed = new EmbedBuilder()
      .setColor(0xf0a500)
      .setTitle(`🎉 GIVEAWAY: ${preis}`)
      .setDescription(
        `${beschreibung ? `${beschreibung}\n\n` : ''}` +
        `Klicke auf 🎉 um teilzunehmen!\n\n` +
        `👥 **Gewinner:** ${gewinner}\n` +
        `⏰ **Endet:** <t:${Math.floor(endsAt.getTime() / 1000)}:R>\n` +
        (restrictions.length ? `\n**Voraussetzungen:**\n${restrictions.join('\n')}` : '')
      )
      .setFooter({ text: `${FOOTER_TEXT} • Endet am` })
      .setTimestamp(endsAt);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('giveaway_join').setLabel('🎉 Mitmachen').setStyle(ButtonStyle.Primary)
    );

    const msg = await channel.send({ embeds: [embed], components: [row] });

    const giveaway = await prisma.giveaway.create({
      data: {
        guildId, channelId, messageId: msg.id,
        prize: preis, description: beschreibung,
        winnerCount: gewinner, endsAt,
        requiredRoles: JSON.stringify(nurRollen),
        blacklistRoles: JSON.stringify(verbRollen),
        createdBy: interaction.user.id,
      },
    });

    // Update footer with ID so admins can always find it
    const embedWithId = EmbedBuilder.from(embed)
      .setFooter({ text: `${FOOTER_TEXT} • ID: ${giveaway.id}` });
    await msg.edit({ embeds: [embedWithId], components: [row] });

    await interaction.editReply({
      content: `✅ Giveaway gestartet in <#${channelId}>!\n📋 **Giveaway-ID:** \`${giveaway.id}\`\n*(für /giveaway end und /giveaway reroll)*`,
    });
  }

  else if (sub === 'end' || sub === 'reroll') {
    const id = interaction.options.getString('id', true);
    const giveaway = await prisma.giveaway.findUnique({ where: { id } });
    if (!giveaway || giveaway.guildId !== guildId) {
      await interaction.editReply({ content: '❌ Giveaway nicht gefunden.' }); return;
    }
    await endGiveaway(giveaway, interaction.guild!);
    await interaction.editReply({ content: '✅ Giveaway beendet und Gewinner ausgelost!' });
  }
}

export async function endGiveaway(giveaway: any, guild: any) {
  const participants: string[] = JSON.parse(giveaway.participants || '[]');
  const winnerCount = giveaway.winnerCount;

  await prisma.giveaway.update({ where: { id: giveaway.id }, data: { ended: true } });

  const channel = guild.channels.cache.get(giveaway.channelId) as TextChannel | undefined;
  if (!channel) return;

  if (!participants.length) {
    const embed = new EmbedBuilder()
      .setColor(0xed4245).setTitle(`🎉 GIVEAWAY BEENDET: ${giveaway.prize}`)
      .setDescription('😢 Niemand hat teilgenommen.')
      .setFooter({ text: FOOTER_TEXT }).setTimestamp();
    await channel.send({ embeds: [embed] }).catch(() => {});
    return;
  }

  // Pick winners
  const shuffled = [...participants].sort(() => Math.random() - 0.5);
  const winners = shuffled.slice(0, Math.min(winnerCount, shuffled.length));
  await prisma.giveaway.update({ where: { id: giveaway.id }, data: { winners: JSON.stringify(winners) } });

  const embed = new EmbedBuilder()
    .setColor(0x57f287).setTitle(`🎉 GIVEAWAY BEENDET: ${giveaway.prize}`)
    .setDescription(
      `**Gewinner:** ${winners.map(w => `<@${w}>`).join(', ')}\n\n` +
      `Herzlichen Glückwunsch! 🎊`
    )
    .setFooter({ text: FOOTER_TEXT }).setTimestamp();
  await channel.send({ content: winners.map(w => `<@${w}>`).join(' '), embeds: [embed] }).catch(() => {});

  // Disable button on original message
  if (giveaway.messageId) {
    const msg = await channel.messages.fetch(giveaway.messageId).catch(() => null);
    if (msg) {
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('giveaway_join').setLabel('🎉 Beendet').setStyle(ButtonStyle.Secondary).setDisabled(true)
      );
      await msg.edit({ components: [row] }).catch(() => {});
    }
  }
}

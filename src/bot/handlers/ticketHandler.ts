import {
  ButtonInteraction, StringSelectMenuInteraction, ModalSubmitInteraction,
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
  EmbedBuilder, ButtonBuilder, ButtonStyle, ChannelType,
  PermissionFlagsBits, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  TextChannel, MessageFlags,
} from 'discord.js';
import { prisma } from '../../database/client';
import { FOOTER_TEXT } from '../../utils/embed';
import { logTicket } from '../events/logEvents';

// ─── Strip custom emoji to just the name for display in modal title ───────────
function cleanEmojiForLabel(emoji: string | null | undefined): string {
  if (!emoji) return '🎫';
  // Custom emoji format: <:name:id> or <a:name:id>
  const match = emoji.match(/^<a?:([^:]+):\d+>$/);
  if (match) return match[1]; // just the name without < : >
  return emoji; // standard unicode emoji, use as-is
}

// ─── POST PANEL ──────────────────────────────────────────────────────────────
export async function postTicketPanel(panelId: string, guild: any) {
  const panel = await prisma.ticketPanel.findUnique({
    where: { id: panelId },
    include: { categories: { orderBy: { createdAt: 'asc' } } },
  });
  if (!panel) return;

  const channel = guild.channels.cache.get(panel.channelId) as TextChannel;
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(parseInt(panel.color.replace('#', ''), 16) || 0x5865f2)
    .setTitle(panel.title)
    .setDescription(panel.description)
    .setFooter({ text: FOOTER_TEXT })
    .setTimestamp();

  // Always use select menu (cleaner, supports custom emojis better)
  const select = new StringSelectMenuBuilder()
    .setCustomId(`ticket_panel_${panel.id}`)
    .setPlaceholder('📋 Wähle eine Kategorie...')
    .addOptions(
      panel.categories.map((cat) => {
        const opt = new StringSelectMenuOptionBuilder()
          .setLabel(cat.label)
          .setValue(cat.id)
          .setDescription(cat.description?.slice(0, 100) ?? 'Klicken um ein Ticket zu öffnen');
        // Only set emoji if it's a valid unicode or custom discord emoji
        if (cat.emoji) {
          try {
            // Custom emoji: <:name:id>
            const customMatch = cat.emoji.match(/^<a?:([^:]+):(\d+)>$/);
            if (customMatch) {
              opt.setEmoji({ name: customMatch[1], id: customMatch[2] });
            } else {
              opt.setEmoji(cat.emoji);
            }
          } catch { /* ignore invalid emoji */ }
        }
        return opt;
      })
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

  // Delete old panel message
  if (panel.messageId) {
    const old = await channel.messages.fetch(panel.messageId).catch(() => null);
    if (old) await old.delete().catch(() => {});
  }

  const msg = await channel.send({ embeds: [embed], components: [row] });
  await prisma.ticketPanel.update({ where: { id: panel.id }, data: { messageId: msg.id } });
}

// ─── BUTTON HANDLER ──────────────────────────────────────────────────────────
export async function handleTicketButton(interaction: ButtonInteraction) {
  const id = interaction.customId;
  if (id.startsWith('ticket_close_')) await closeTicket(interaction);
  else if (id === 'ticket_claim') await claimTicket(interaction);
}

// ─── SELECT MENU ─────────────────────────────────────────────────────────────
export async function handleTicketSelect(interaction: StringSelectMenuInteraction) {
  const categoryId = interaction.values[0];
  await openTicketOrModal(interaction as any, categoryId);
}

// ─── MODAL SUBMIT ─────────────────────────────────────────────────────────────
export async function handleTicketModal(interaction: ModalSubmitInteraction) {
  const categoryId = interaction.customId.replace('ticket_modal_', '');
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const category = await prisma.ticketCategory.findUnique({
    where: { id: categoryId },
    include: { questions: { orderBy: { order: 'asc' } } },
  });
  if (!category) { await interaction.editReply({ content: '❌ Fehler.' }); return; }

  const answers = category.questions.map((q) => ({
    question: q.label,
    answer: (() => { try { return interaction.fields.getTextInputValue(`q_${q.id}`) || '—'; } catch { return '—'; } })(),
  }));

  await createTicketDirect(interaction as any, categoryId, answers);
}

// ─── OPEN TICKET OR SHOW MODAL ────────────────────────────────────────────────
async function openTicketOrModal(interaction: any, categoryId: string) {
  const category = await prisma.ticketCategory.findUnique({
    where: { id: categoryId },
    include: { questions: { orderBy: { order: 'asc' } } },
  });
  if (!category) {
    await interaction.reply({ content: '❌ Kategorie nicht gefunden.', flags: MessageFlags.Ephemeral });
    return;
  }

  // Check for existing open ticket
  const existing = await prisma.ticket.findFirst({
    where: { userId: interaction.user.id, guildId: interaction.guild!.id, status: 'open', categoryId },
  });
  if (existing) {
    await interaction.reply({
      content: `❌ Du hast bereits ein offenes Ticket: <#${existing.channelId}>`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (category.questions.length > 0) {
    const emojiName = cleanEmojiForLabel(category.emoji);
    const modal = new ModalBuilder()
      .setCustomId(`ticket_modal_${categoryId}`)
      .setTitle(`${emojiName} ${category.label}`.slice(0, 45));

    const rows = category.questions.slice(0, 5).map((q) =>
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(`q_${q.id}`)
          .setLabel(q.label.slice(0, 45))
          .setPlaceholder((q.placeholder ?? '').slice(0, 100))
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(q.required)
          .setMaxLength(1000)
      )
    );
    modal.addComponents(...rows);
    await interaction.showModal(modal);
  } else {
    await interaction.reply({ content: '⏳ Ticket wird erstellt...', flags: MessageFlags.Ephemeral });
    await createTicketDirect(interaction, categoryId, []);
  }
}

// ─── CREATE TICKET ────────────────────────────────────────────────────────────
async function createTicketDirect(interaction: any, categoryId: string, answers: { question: string; answer: string }[]) {
  const category = await prisma.ticketCategory.findUnique({ where: { id: categoryId } });
  if (!category) return;

  const guild = interaction.guild!;
  const userId = interaction.user.id;

  const count = await prisma.ticket.count({ where: { guildId: guild.id } });
  const ticketNumber = count + 1;

  const member = await guild.members.fetch(userId).catch(() => null);
  const username = (member?.user.username ?? 'user').toLowerCase().replace(/[^a-z0-9]/g, '');
  const channelName = (category.channelNamePattern || '{username}-{id}')
    .replace('{username}', username)
    .replace('{id}', String(ticketNumber))
    .replace('{category}', category.label.toLowerCase().replace(/[^a-z0-9]/g, ''))
    .slice(0, 100);

  const supportRoles: string[] = JSON.parse(category.supportRoles || '[]');
  const permissionOverwrites: any[] = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: guild.members.me!.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
  ];
  for (const roleId of supportRoles) {
    permissionOverwrites.push({
      id: roleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages],
    });
  }

  const channelOptions: any = {
    name: channelName,
    type: ChannelType.GuildText,
    permissionOverwrites,
  };
  if (category.categoryId) channelOptions.parent = category.categoryId;

  const ticketChannel = await guild.channels.create(channelOptions).catch((e: any) => {
    console.error('[Ticket] Channel create failed:', e.message);
    return null;
  });

  if (!ticketChannel) {
    const msg = { content: '❌ Ticket konnte nicht erstellt werden. Fehlen mir Berechtigungen?', flags: MessageFlags.Ephemeral };
    if (interaction.editReply) await interaction.editReply(msg).catch(() => {});
    else await interaction.followUp(msg).catch(() => {});
    return;
  }

  const ticket = await prisma.ticket.create({
    data: { guildId: guild.id, channelId: ticketChannel.id, userId, categoryId, answers: JSON.stringify(answers), ticketNumber },
  });

  // Ticket embed
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`🎫 Ticket #${ticketNumber} — ${category.label}`)
    .setDescription(
      `Hallo <@${userId}>, willkommen!\nEin Teammitglied meldet sich so schnell wie möglich.\n\n` +
      `Klicke auf **🔒 Schließen** wenn dein Anliegen erledigt ist.`
    )
    .setFooter({ text: FOOTER_TEXT })
    .setTimestamp();

  if (answers.length > 0) {
    embed.addFields(answers.map((a) => ({ name: a.question, value: a.answer.slice(0, 1024) || '—', inline: false })));
  }

  const closeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`ticket_close_${ticket.id}`).setLabel('🔒 Schließen').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ticket_claim').setLabel('✋ Übernehmen').setStyle(ButtonStyle.Secondary),
  );

  await (ticketChannel as TextChannel).send({
    content: `<@${userId}>${supportRoles.map(r => ` <@&${r}>`).join('')}`,
    embeds: [embed],
    components: [closeRow],
  });

  // Log ticket opened
  await logTicket(guild.id, guild, 'opened', userId, ticketNumber, category.label, ticketChannel.id).catch(() => {});

  const replyMsg = { content: `✅ Ticket erstellt: <#${ticketChannel.id}>`, flags: MessageFlags.Ephemeral };
  if (interaction.editReply) await interaction.editReply(replyMsg).catch(() => {});
  else await interaction.followUp(replyMsg).catch(() => {});
}

// ─── CLOSE TICKET ─────────────────────────────────────────────────────────────
async function closeTicket(interaction: ButtonInteraction) {
  await interaction.reply({ content: '🔒 Wird geschlossen...', flags: MessageFlags.Ephemeral });

  const ticket = await prisma.ticket.findUnique({ where: { channelId: interaction.channel!.id } });
  if (!ticket) { await interaction.editReply({ content: '❌ Kein Ticket gefunden.' }); return; }

  await prisma.ticket.update({ where: { id: ticket.id }, data: { status: 'closed', closedAt: new Date() } });

  const category = await prisma.ticketCategory.findUnique({ where: { id: ticket.categoryId } }).catch(() => null);

  // Log
  await logTicket(
    ticket.guildId, interaction.guild!, 'closed',
    interaction.user.id, ticket.ticketNumber,
    category?.label ?? 'Unbekannt', interaction.channel!.id
  ).catch(() => {});

  const embed = new EmbedBuilder()
    .setColor(0xed4245).setTitle('🔒 Ticket geschlossen')
    .setDescription(`Geschlossen von <@${interaction.user.id}>`)
    .setFooter({ text: FOOTER_TEXT }).setTimestamp();

  await (interaction.channel as TextChannel).send({ embeds: [embed] });
  setTimeout(async () => { await interaction.channel?.delete().catch(() => {}); }, 5000);
}

// ─── CLAIM TICKET ─────────────────────────────────────────────────────────────
async function claimTicket(interaction: ButtonInteraction) {
  const ticket = await prisma.ticket.findUnique({ where: { channelId: interaction.channel!.id } });
  await prisma.ticket.update({
    where: { channelId: interaction.channel!.id },
    data: { claimedBy: interaction.user.id },
  }).catch(() => {});

  const category = await prisma.ticketCategory.findUnique({ where: { id: ticket?.categoryId ?? '' } }).catch(() => null);

  await logTicket(
    interaction.guild!.id, interaction.guild!, 'claimed',
    ticket?.userId ?? interaction.user.id,
    ticket?.ticketNumber ?? 0,
    category?.label ?? 'Unbekannt',
    interaction.channel!.id,
    interaction.user.id
  ).catch(() => {});

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setDescription(`✋ <@${interaction.user.id}> hat dieses Ticket übernommen.`)
    .setFooter({ text: FOOTER_TEXT }).setTimestamp();
  await (interaction.channel as TextChannel).send({ embeds: [embed] });
  await interaction.reply({ content: '✅ Ticket übernommen!', flags: MessageFlags.Ephemeral });
}

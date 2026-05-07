import {
  SlashCommandBuilder, ChatInputCommandInteraction,
  PermissionFlagsBits, MessageFlags, EmbedBuilder,
} from 'discord.js';
import { prisma } from '../../database/client';
import { FOOTER_TEXT } from '../../utils/embed';
import { postTicketPanel } from '../handlers/ticketHandler';

export const data = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Ticket-System verwalten')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

  // panel create
  .addSubcommand(s => s.setName('panel-erstellen').setDescription('Erstelle ein neues Ticket-Panel in diesem Channel')
    .addStringOption(o => o.setName('titel').setDescription('Panel Titel').setRequired(true))
    .addStringOption(o => o.setName('beschreibung').setDescription('Panel Beschreibung').setRequired(false))
    .addStringOption(o => o.setName('farbe').setDescription('Farbe als Hex z.B. #5865f2').setRequired(false))
  )

  // panel post
  .addSubcommand(s => s.setName('panel-posten').setDescription('Panel-Nachricht in Channel senden')
    .addStringOption(o => o.setName('panel-id').setDescription('Panel ID').setRequired(true))
  )

  // category add
  .addSubcommand(s => s.setName('kategorie-hinzufügen').setDescription('Füge eine Kategorie zu einem Panel hinzu')
    .addStringOption(o => o.setName('panel-id').setDescription('Panel ID').setRequired(true))
    .addStringOption(o => o.setName('label').setDescription('Name der Kategorie').setRequired(true))
    .addStringOption(o => o.setName('emoji').setDescription('Emoji').setRequired(false))
    .addStringOption(o => o.setName('beschreibung').setDescription('Kurzbeschreibung').setRequired(false))
    .addStringOption(o => o.setName('discord-kategorie').setDescription('Discord Kategorie-Channel ID (wo Tickets erstellt werden)').setRequired(false))
    .addStringOption(o => o.setName('support-rollen').setDescription('Support-Rollen IDs kommagetrennt').setRequired(false))
    .addStringOption(o => o.setName('channel-name').setDescription('Muster z.B. {username}-{id} oder ticket-{id}').setRequired(false))
  )

  // question add
  .addSubcommand(s => s.setName('frage-hinzufügen').setDescription('Frage zu einer Kategorie hinzufügen')
    .addStringOption(o => o.setName('kategorie-id').setDescription('Kategorie ID').setRequired(true))
    .addStringOption(o => o.setName('frage').setDescription('Die Frage / Label').setRequired(true))
    .addStringOption(o => o.setName('platzhalter').setDescription('Placeholder Text').setRequired(false))
    .addBooleanOption(o => o.setName('pflicht').setDescription('Pflichtfeld?').setRequired(false))
  )

  // list panels
  .addSubcommand(s => s.setName('panels').setDescription('Zeige alle Panels an'))

  // delete category
  .addSubcommand(s => s.setName('kategorie-löschen').setDescription('Kategorie löschen')
    .addStringOption(o => o.setName('kategorie-id').setDescription('Kategorie ID').setRequired(true))
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: 64 });
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guild!.id;

  // ── panel-erstellen ──
  if (sub === 'panel-erstellen') {
    const panel = await prisma.ticketPanel.create({
      data: {
        guildId,
        channelId: interaction.channel!.id,
        title: interaction.options.getString('titel', true),
        description: interaction.options.getString('beschreibung') ?? 'Wähle eine Kategorie aus um ein Ticket zu öffnen.',
        color: interaction.options.getString('farbe') ?? '#5865f2',
      },
    });
    await interaction.editReply({
      content: `✅ Panel erstellt!\n**Panel ID:** \`${panel.id}\`\n\nFüge nun Kategorien hinzu mit \`/ticket kategorie-hinzufügen panel-id:${panel.id}\`\nDann poste das Panel mit \`/ticket panel-posten panel-id:${panel.id}\``,
    });
  }

  // ── panel-posten ──
  else if (sub === 'panel-posten') {
    const panelId = interaction.options.getString('panel-id', true);
    const panel = await prisma.ticketPanel.findUnique({ where: { id: panelId }, include: { categories: true } });
    if (!panel || panel.guildId !== guildId) { await interaction.editReply({ content: '❌ Panel nicht gefunden.' }); return; }
    if (!panel.categories.length) { await interaction.editReply({ content: '❌ Füge zuerst Kategorien hinzu!' }); return; }
    await postTicketPanel(panelId, interaction.guild!);
    await interaction.editReply({ content: '✅ Panel gepostet!' });
  }

  // ── kategorie-hinzufügen ──
  else if (sub === 'kategorie-hinzufügen') {
    const panelId = interaction.options.getString('panel-id', true);
    const panel = await prisma.ticketPanel.findUnique({ where: { id: panelId } });
    if (!panel || panel.guildId !== guildId) { await interaction.editReply({ content: '❌ Panel nicht gefunden.' }); return; }

    const supportRolesRaw = interaction.options.getString('support-rollen')?.split(',').map(r => r.trim()).filter(Boolean) ?? [];
    const cat = await prisma.ticketCategory.create({
      data: {
        panelId,
        guildId,
        label: interaction.options.getString('label', true),
        emoji: interaction.options.getString('emoji') ?? '🎫',
        description: interaction.options.getString('beschreibung') ?? '',
        categoryId: interaction.options.getString('discord-kategorie') ?? null,
        supportRoles: JSON.stringify(supportRolesRaw),
        channelNamePattern: interaction.options.getString('channel-name') ?? '{username}-{id}',
      },
    });
    await interaction.editReply({
      content: `✅ Kategorie **${cat.label}** hinzugefügt!\n**Kategorie ID:** \`${cat.id}\`\n\nOptional: Fragen hinzufügen mit \`/ticket frage-hinzufügen kategorie-id:${cat.id}\`\nDann Panel neu posten mit \`/ticket panel-posten panel-id:${panelId}\``,
    });
  }

  // ── frage-hinzufügen ──
  else if (sub === 'frage-hinzufügen') {
    const catId = interaction.options.getString('kategorie-id', true);
    const cat = await prisma.ticketCategory.findUnique({ where: { id: catId } });
    if (!cat || cat.guildId !== guildId) { await interaction.editReply({ content: '❌ Kategorie nicht gefunden.' }); return; }

    const count = await prisma.ticketQuestion.count({ where: { categoryId: catId } });
    if (count >= 5) { await interaction.editReply({ content: '❌ Maximal 5 Fragen pro Kategorie (Discord Modal-Limit).' }); return; }

    await prisma.ticketQuestion.create({
      data: {
        categoryId: catId,
        label: interaction.options.getString('frage', true),
        placeholder: interaction.options.getString('platzhalter') ?? '',
        required: interaction.options.getBoolean('pflicht') ?? true,
        order: count,
      },
    });
    await interaction.editReply({ content: `✅ Frage hinzugefügt! (${count + 1}/5)` });
  }

  // ── panels ──
  else if (sub === 'panels') {
    const panels = await prisma.ticketPanel.findMany({ where: { guildId }, include: { categories: { include: { questions: true } } } });
    if (!panels.length) { await interaction.editReply({ content: 'Noch keine Panels.' }); return; }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2).setTitle('🎫 Ticket Panels').setFooter({ text: FOOTER_TEXT }).setTimestamp();

    for (const p of panels) {
      embed.addFields({
        name: `${p.title} — \`${p.id}\``,
        value: p.categories.map(c => `  • **${c.emoji} ${c.label}** (\`${c.id}\`) — ${c.questions.length} Fragen`).join('\n') || '  *Keine Kategorien*',
      });
    }
    await interaction.editReply({ embeds: [embed] });
  }

  // ── kategorie-löschen ──
  else if (sub === 'kategorie-löschen') {
    const catId = interaction.options.getString('kategorie-id', true);
    await prisma.ticketCategory.delete({ where: { id: catId } }).catch(() => {});
    await interaction.editReply({ content: '✅ Kategorie gelöscht.' });
  }
}

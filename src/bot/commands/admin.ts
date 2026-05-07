import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import { prisma } from '../../database/client';
import { calculateLevel, xpForLevel, getOrCreateUser } from '../../utils/xpEconomy';

export const data = new SlashCommandBuilder()
  .setName('admin')
  .setDescription('Admin-Verwaltung von Usern')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  // --- XP ---
  .addSubcommand((sub) =>
    sub
      .setName('xp-set')
      .setDescription('Setzt die XP eines Users auf einen bestimmten Wert')
      .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
      .addIntegerOption((o) => o.setName('menge').setDescription('XP-Menge').setRequired(true).setMinValue(0))
  )
  .addSubcommand((sub) =>
    sub
      .setName('xp-add')
      .setDescription('Gibt einem User XP dazu')
      .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
      .addIntegerOption((o) => o.setName('menge').setDescription('XP-Menge').setRequired(true).setMinValue(1))
  )
  .addSubcommand((sub) =>
    sub
      .setName('xp-remove')
      .setDescription('Zieht einem User XP ab')
      .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
      .addIntegerOption((o) => o.setName('menge').setDescription('XP-Menge').setRequired(true).setMinValue(1))
  )
  // --- Level ---
  .addSubcommand((sub) =>
    sub
      .setName('level-set')
      .setDescription('Setzt den Level eines Users direkt (XP wird automatisch angepasst)')
      .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
      .addIntegerOption((o) => o.setName('level').setDescription('Level').setRequired(true).setMinValue(0).setMaxValue(500))
  )
  // --- Coins ---
  .addSubcommand((sub) =>
    sub
      .setName('coins-set')
      .setDescription('Setzt die Coins eines Users auf einen bestimmten Wert')
      .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
      .addIntegerOption((o) => o.setName('menge').setDescription('Coin-Menge').setRequired(true).setMinValue(0))
  )
  .addSubcommand((sub) =>
    sub
      .setName('coins-add')
      .setDescription('Gibt einem User Coins dazu')
      .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
      .addIntegerOption((o) => o.setName('menge').setDescription('Coin-Menge').setRequired(true).setMinValue(1))
  )
  .addSubcommand((sub) =>
    sub
      .setName('coins-remove')
      .setDescription('Zieht einem User Coins ab')
      .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
      .addIntegerOption((o) => o.setName('menge').setDescription('Coin-Menge').setRequired(true).setMinValue(1))
  )
  // --- Info ---
  .addSubcommand((sub) =>
    sub
      .setName('info')
      .setDescription('Zeigt alle Bot-Daten eines Users an')
      .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
  )
  // --- Reset ---
  .addSubcommand((sub) =>
    sub
      .setName('reset')
      .setDescription('Setzt alle Bot-Daten eines Users zurück (XP, Level, Coins)')
      .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
  )
  // --- Counting Set ---
  .addSubcommand((sub) =>
    sub
      .setName('counting-set')
      .setDescription('Setzt den Zähler auf eine Zahl und sendet sie in den Counting-Channel')
      .addIntegerOption((o) => o.setName('zahl').setDescription('Startzahl').setRequired(true).setMinValue(0))
  )
  // --- Clear ---
  .addSubcommand((sub) =>
    sub
      .setName('clear')
      .setDescription('Löscht Nachrichten in diesem Channel')
      .addStringOption((o) => o.setName('menge').setDescription('Anzahl (1-100) oder "all"').setRequired(true))
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: 64 });

  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guild!.id;

  // ===== COUNTING SET =====
  if (sub === 'counting-set') {
    const zahl = interaction.options.getInteger('zahl', true);
    const config = await prisma.guildConfig.findUnique({ where: { guildId } });
    if (!config?.countingChannel) {
      await interaction.editReply({ content: '❌ Kein Counting-Channel konfiguriert.' });
      return;
    }
    const channel = interaction.guild!.channels.cache.get(config.countingChannel) as any;
    if (!channel) { await interaction.editReply({ content: '❌ Channel nicht gefunden.' }); return; }
    await prisma.guildConfig.update({
      where: { guildId },
      data: { countingCurrent: zahl, countingLastUserId: null },
    });
    await channel.send(`${zahl}`);
    await channel.setTopic(`Nächste Zahl: ${zahl + 1}`).catch(() => {});
    await interaction.editReply({ content: `✅ Counting auf **${zahl}** gesetzt und in <#${config.countingChannel}> gesendet.` });
    return;
  }

  // ===== CLEAR =====
  if (sub === 'clear') {
    const menge = interaction.options.getString('menge', true);
    const channel = interaction.channel as any;
    if (menge.toLowerCase() === 'all') {
      let deleted = 0;
      while (true) {
        const msgs = await channel.messages.fetch({ limit: 100 });
        if (msgs.size === 0) break;
        const recent = msgs.filter((m: any) => Date.now() - m.createdTimestamp < 12096e5);
        if (recent.size < 1) break;
        await channel.bulkDelete(recent, true).catch(() => {});
        deleted += recent.size;
        if (recent.size < 2) break;
        await new Promise(r => setTimeout(r, 1000));
      }
      await interaction.editReply({ content: `✅ **${deleted}** Nachrichten gelöscht.` });
    } else {
      const count = Math.min(parseInt(menge), 100);
      if (isNaN(count) || count < 1) {
        await interaction.editReply({ content: '❌ Ungültige Zahl. Verwende 1-100 oder "all".' });
        return;
      }
      const msgs = await channel.messages.fetch({ limit: count });
      const recent = msgs.filter((m: any) => Date.now() - m.createdTimestamp < 12096e5);
      await channel.bulkDelete(recent, true).catch(() => {});
      await interaction.editReply({ content: `✅ **${recent.size}** Nachrichten gelöscht.` });
    }
    return;
  }

  // All other subcommands need a user option
  const target = interaction.options.getUser('user', true);
  const amount = interaction.options.getInteger('menge') ?? 0;
  await getOrCreateUser(target.id, guildId);

  // ===== XP SET =====
  if (sub === 'xp-set') {
    const newLevel = calculateLevel(amount);
    await prisma.userData.update({
      where: { userId_guildId: { userId: target.id, guildId } },
      data: { xp: amount, level: newLevel },
    });
    await interaction.editReply({ embeds: [successEmbed(target.tag, '⭐ XP gesetzt', `**XP:** ${amount}\n**Level:** ${newLevel}`)] });
  }

  // ===== XP ADD =====
  else if (sub === 'xp-add') {
    const user = await prisma.userData.update({
      where: { userId_guildId: { userId: target.id, guildId } },
      data: { xp: { increment: amount } },
    });
    const newLevel = calculateLevel(user.xp);
    if (newLevel !== user.level) {
      await prisma.userData.update({
        where: { userId_guildId: { userId: target.id, guildId } },
        data: { level: newLevel },
      });
    }
    await interaction.editReply({ embeds: [successEmbed(target.tag, '⭐ XP hinzugefügt', `**+${amount} XP**\nNeue XP: ${user.xp} | Level: ${newLevel}`)] });
  }

  // ===== XP REMOVE =====
  else if (sub === 'xp-remove') {
    const current = await prisma.userData.findUnique({ where: { userId_guildId: { userId: target.id, guildId } } });
    const newXp = Math.max(0, (current?.xp ?? 0) - amount);
    const newLevel = calculateLevel(newXp);
    await prisma.userData.update({
      where: { userId_guildId: { userId: target.id, guildId } },
      data: { xp: newXp, level: newLevel },
    });
    await interaction.editReply({ embeds: [successEmbed(target.tag, '⭐ XP abgezogen', `-${amount} XP\nNeue XP: ${newXp} | Level: ${newLevel}`)] });
  }

  // ===== LEVEL SET =====
  else if (sub === 'level-set') {
    const level = interaction.options.getInteger('level', true);
    const newXp = xpForLevel(level); // XP wird auf genau das Level gesetzt
    await prisma.userData.update({
      where: { userId_guildId: { userId: target.id, guildId } },
      data: { xp: newXp, level },
    });
    await interaction.editReply({ embeds: [successEmbed(target.tag, '🎯 Level gesetzt', `**Level:** ${level}\n**XP:** ${newXp} (Basis für dieses Level)`)] });
  }

  // ===== COINS SET =====
  else if (sub === 'coins-set') {
    await prisma.userData.update({
      where: { userId_guildId: { userId: target.id, guildId } },
      data: { coins: amount },
    });
    await interaction.editReply({ embeds: [successEmbed(target.tag, '🪙 Coins gesetzt', `**Coins:** ${amount}`)] });
  }

  // ===== COINS ADD =====
  else if (sub === 'coins-add') {
    const user = await prisma.userData.update({
      where: { userId_guildId: { userId: target.id, guildId } },
      data: { coins: { increment: amount } },
    });
    await interaction.editReply({ embeds: [successEmbed(target.tag, '🪙 Coins hinzugefügt', `**+${amount} 🪙**\nNeue Coins: ${user.coins}`)] });
  }

  // ===== COINS REMOVE =====
  else if (sub === 'coins-remove') {
    const current = await prisma.userData.findUnique({ where: { userId_guildId: { userId: target.id, guildId } } });
    const newCoins = Math.max(0, (current?.coins ?? 0) - amount);
    await prisma.userData.update({
      where: { userId_guildId: { userId: target.id, guildId } },
      data: { coins: newCoins },
    });
    await interaction.editReply({ embeds: [successEmbed(target.tag, '🪙 Coins abgezogen', `-${amount} 🪙\nNeue Coins: ${newCoins}`)] });
  }

  // ===== INFO =====
  else if (sub === 'info') {
    const user = await prisma.userData.findUnique({ where: { userId_guildId: { userId: target.id, guildId } } });
    if (!user) {
      await interaction.editReply({ content: `❌ Keine Daten für <@${target.id}> vorhanden.` });
      return;
    }
    const nextLevelXp = xpForLevel((user.level ?? 0) + 1);
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`🔍 Admin-Info: ${target.tag}`)
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: '⭐ XP', value: `${user.xp}`, inline: true },
        { name: '🎯 Level', value: `${user.level}`, inline: true },
        { name: '📈 XP bis nächstes Level', value: `${nextLevelXp - user.xp}`, inline: true },
        { name: '🪙 Coins', value: `${user.coins}`, inline: true },
        { name: '⛏️ Minecraft', value: user.mcUsername ? `${user.mcUsername} (${user.mcVersion})` : '—', inline: true },
        { name: '🎂 Geburtstag', value: user.birthday ?? '—', inline: true },
      )
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  }

  // ===== RESET =====
  else if (sub === 'reset') {
    await prisma.userData.update({
      where: { userId_guildId: { userId: target.id, guildId } },
      data: { xp: 0, level: 0, coins: 0 },
    });
    await interaction.editReply({ embeds: [successEmbed(target.tag, '🗑️ Daten zurückgesetzt', 'XP, Level und Coins wurden auf 0 gesetzt.')] });
  }
}

function successEmbed(username: string, title: string, description: string) {
  return new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(title)
    .setDescription(`**User:** ${username}\n\n${description}`)
    .setTimestamp();
}

// ─── Additional admin commands exported separately ────────────────────────────

export const countingSetData = new SlashCommandBuilder()
  .setName('admin-counting-set')
  .setDescription('Setzt den Counting-Zähler und schreibt die Zahl in den Channel')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addIntegerOption(o => o.setName('zahl').setDescription('Startzahl').setRequired(true).setMinValue(0));

export async function countingSetExecute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: 64 });
  const guildId = interaction.guild!.id;
  const zahl = interaction.options.getInteger('zahl', true);

  const config = await prisma.guildConfig.findUnique({ where: { guildId } });
  if (!config?.countingChannel) {
    await interaction.editReply({ content: '❌ Kein Counting-Channel konfiguriert.' });
    return;
  }

  const channel = interaction.guild!.channels.cache.get(config.countingChannel) as any;
  if (!channel) { await interaction.editReply({ content: '❌ Channel nicht gefunden.' }); return; }

  // Update DB
  await prisma.guildConfig.update({
    where: { guildId },
    data: { countingCurrent: zahl, countingLastUserId: null },
  });

  // Send the number into the channel
  await channel.send(`${zahl}`);
  await channel.setTopic(`Nächste Zahl: ${zahl + 1}`).catch(() => {});

  await interaction.editReply({ content: `✅ Counting auf **${zahl}** gesetzt und in <#${config.countingChannel}> gesendet.` });
}

export const clearData = new SlashCommandBuilder()
  .setName('admin-clear')
  .setDescription('Löscht Nachrichten in diesem Channel')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(o =>
    o.setName('menge').setDescription('Anzahl (1-100) oder "all" für alle').setRequired(true)
  );

export async function clearExecute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: 64 });
  const menge = interaction.options.getString('menge', true);
  const channel = interaction.channel as any;

  if (menge.toLowerCase() === 'all') {
    // Delete in batches of 100
    let deleted = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const msgs = await channel.messages.fetch({ limit: 100 });
      if (msgs.size === 0) break;
      // Can only bulk delete messages < 14 days old
      const recent = msgs.filter((m: any) => Date.now() - m.createdTimestamp < 12096e5);
      if (recent.size === 0) break;
      await channel.bulkDelete(recent, true).catch(() => {});
      deleted += recent.size;
      if (recent.size < 2) break;
      await new Promise(r => setTimeout(r, 1000));
    }
    await interaction.editReply({ content: `✅ **${deleted}** Nachrichten gelöscht.` });
  } else {
    const count = Math.min(parseInt(menge), 100);
    if (isNaN(count) || count < 1) {
      await interaction.editReply({ content: '❌ Ungültige Zahl. Verwende 1-100 oder "all".' });
      return;
    }
    const msgs = await channel.messages.fetch({ limit: count });
    const recent = msgs.filter((m: any) => Date.now() - m.createdTimestamp < 12096e5);
    await channel.bulkDelete(recent, true).catch(() => {});
    await interaction.editReply({ content: `✅ **${recent.size}** Nachrichten gelöscht.` });
  }
}

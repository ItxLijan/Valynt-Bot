import { Client, Interaction, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger';
import { prisma } from '../../database/client';

export const name = 'interactionCreate';
export const once = false;

export async function execute(interaction: Interaction) {
  const client = interaction.client as Client & { commands: Map<string, any> };

  // --- Autocomplete ---
  if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);
    if (command?.autocomplete) {
      await command.autocomplete(interaction).catch(() => {});
    }
    return;
  }

  // --- Button interactions ---
  if (interaction.isButton()) {
    if (interaction.customId === 'giveaway_join') {
      await handleGiveawayJoin(interaction).catch((err: any) => {
        if (err?.code !== 10062 && err?.code !== 40060) logger.error('Giveaway button error:', err);
      });
    }
    if (interaction.customId.startsWith('ticket_')) {
      const { handleTicketButton } = await import('../handlers/ticketHandler');
      await handleTicketButton(interaction).catch((err: any) => {
        if (err?.code !== 10062 && err?.code !== 40060) logger.error('Ticket button error:', err);
      });
    }
    if (interaction.customId.startsWith('quiz_letter_')) {
      await handleQuizLetterButton(interaction).catch(() => {});
    }
    if (interaction.customId.startsWith('quiz_skip_btn_')) {
      await handleQuizSkipButton(interaction).catch(() => {});
    }
    if (interaction.customId.startsWith('quiz_hint_btn_')) {
      await handleQuizHintButton(interaction).catch(() => {});
    }
    return;
  }

  // --- Modal (ticket questions) ---
  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('ticket_modal_')) {
      const { handleTicketModal } = await import('../handlers/ticketHandler');
      await handleTicketModal(interaction).catch((err: any) => {
        if (err?.code !== 10062 && err?.code !== 40060) logger.error('Ticket modal error:', err);
      });
    }
    return;
  }

  // --- Select menus (ticket panel) ---
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId.startsWith('ticket_panel_')) {
      const { handleTicketSelect } = await import('../handlers/ticketHandler');
      await handleTicketSelect(interaction).catch((err: any) => {
        if (err?.code !== 10062 && err?.code !== 40060) logger.error('Ticket select error:', err);
      });
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) { logger.warn(`Command not found: ${interaction.commandName}`); return; }

  try {
    await command.execute(interaction);
  } catch (error: any) {
    if (error?.code === 10062 || error?.code === 40060) {
      logger.warn(`Interaction expired: ${interaction.commandName}`);
      return;
    }
    logger.error(`Error in command ${interaction.commandName}:`, error);
    const msg = { content: '❌ Ein Fehler ist aufgetreten.', flags: 64 };
    try {
      if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
      else await interaction.reply(msg);
    } catch {}
  }
}

async function handleGiveawayJoin(interaction: any) {
  // Reply immediately to avoid 10062
  await interaction.reply({ content: '⏳ Verarbeite...', flags: 64 });

  const guildId = interaction.guild!.id;
  const userId = interaction.user.id;

  const giveaway = await prisma.giveaway.findFirst({
    where: { guildId, messageId: interaction.message.id, ended: false },
  });

  if (!giveaway) {
    await interaction.editReply({ content: '❌ Dieses Giveaway ist bereits beendet.' });
    return;
  }

  const member = await interaction.guild!.members.fetch(userId).catch(() => null);
  if (member) {
    const requiredRoles: string[] = JSON.parse(giveaway.requiredRoles || '[]');
    const blacklistRoles: string[] = JSON.parse(giveaway.blacklistRoles || '[]');
    if (blacklistRoles.length && blacklistRoles.some((r: string) => member.roles.cache.has(r))) {
      await interaction.editReply({ content: '❌ Deine Rolle darf nicht teilnehmen.' });
      return;
    }
    if (requiredRoles.length && !requiredRoles.some((r: string) => member.roles.cache.has(r))) {
      await interaction.editReply({ content: '❌ Du hast nicht die benötigte Rolle.' });
      return;
    }
  }

  const participants: string[] = JSON.parse(giveaway.participants || '[]');
  if (participants.includes(userId)) {
    const updated = participants.filter((p) => p !== userId);
    await prisma.giveaway.update({ where: { id: giveaway.id }, data: { participants: JSON.stringify(updated) } });
    await interaction.editReply({ content: `😔 Du hast das Giveaway verlassen. (${updated.length} Teilnehmer)` });
  } else {
    participants.push(userId);
    await prisma.giveaway.update({ where: { id: giveaway.id }, data: { participants: JSON.stringify(participants) } });
    await interaction.editReply({ content: `✅ Du nimmst jetzt teil! (${participants.length} Teilnehmer)` });
  }
}

// ─── QUIZ LETTER BUTTON ───────────────────────────────────────────────────────
async function handleQuizLetterButton(interaction: any) {
  await interaction.reply({ content: '⏳', flags: 64 });

  const parts = interaction.customId.split('_'); // quiz_letter_A_questionId
  const letter = parts[2];
  const questionId = parts.slice(3).join('_');

  const guildId = interaction.guild!.id;
  const activeQuiz = await prisma.activeQuiz.findUnique({ where: { guildId } });
  if (!activeQuiz || activeQuiz.questionId !== questionId) {
    await interaction.editReply({ content: '❌ Diese Frage ist nicht mehr aktiv.' });
    return;
  }

  const question = await prisma.quizQuestion.findUnique({ where: { id: questionId } });
  if (!question) { await interaction.editReply({ content: '❌ Frage nicht gefunden.' }); return; }

  // Show progressively more of the answer (each click reveals next letter of next word)
  const hintsUsed = activeQuiz.hintsUsed;
  const words = question.answer.split(' ');
  const revealed = words.map((w: string, i: number) => {
    if (i < hintsUsed) return w; // fully revealed words
    if (i === hintsUsed) return w[0] + '_'.repeat(w.length - 1); // current word first letter
    return '_'.repeat(w.length); // hidden
  }).join(' ');

  await prisma.activeQuiz.update({ where: { guildId }, data: { hintsUsed: Math.min(hintsUsed + 1, words.length) } });
  await interaction.editReply({ content: `🔤 Buchstaben-Tipp: \`${revealed}\`` });
}

// ─── QUIZ SKIP BUTTON ─────────────────────────────────────────────────────────
async function handleQuizSkipButton(interaction: any) {
  await interaction.reply({ content: '⏳', flags: 64 });

  const guildId = interaction.guild!.id;
  const activeQuiz = await prisma.activeQuiz.findUnique({ where: { guildId } });
  if (!activeQuiz) { await interaction.editReply({ content: '❌ Kein aktives Quiz.' }); return; }

  const question = await prisma.quizQuestion.findUnique({ where: { id: activeQuiz.questionId } });
  await prisma.activeQuiz.delete({ where: { guildId } });

  await interaction.editReply({ content: `⏭️ Übersprungen! Die Antwort war: **${question?.answer ?? '???'}**\nNächste Frage in 30 Sekunden...` });

  const { postNewQuiz } = await import('./messageCreate');
  setTimeout(() => postNewQuiz(guildId, interaction.client), 30000);
}

// ─── QUIZ HINT BUTTON ─────────────────────────────────────────────────────────
async function handleQuizHintButton(interaction: any) {
  await interaction.reply({ content: '⏳', flags: 64 });

  const guildId = interaction.guild!.id;
  const activeQuiz = await prisma.activeQuiz.findUnique({ where: { guildId } });
  if (!activeQuiz) { await interaction.editReply({ content: '❌ Kein aktives Quiz.' }); return; }

  const question = await prisma.quizQuestion.findUnique({ where: { id: activeQuiz.questionId } });
  if (!question?.hint) {
    await interaction.editReply({ content: '💡 Für diese Frage gibt es keinen Tipp.' });
    return;
  }
  await interaction.editReply({ content: `💡 **Tipp:** ${question.hint}` });
}

import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { quizHintExecute } from './quiz';

export const data = new SlashCommandBuilder()
  .setName('quiz-hint')
  .setDescription('Fordere einen Tipp für das aktuelle Emoji-Quiz an');

export const execute = quizHintExecute;

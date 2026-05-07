import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { quizSkipExecute } from './quiz';

export const data = new SlashCommandBuilder()
  .setName('quiz-skip')
  .setDescription('Überspringe die aktuelle Quiz-Frage');

export const execute = quizSkipExecute;

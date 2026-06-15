const { SlashCommandBuilder } = require('discord.js');
const player = require('../utils/player');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pausa la reproducción'),

  async execute(interaction) {
    const queue = player.getQueue(interaction.guildId);

    if (!queue?.isPlaying) {
      return interaction.reply({ content: '❌ No hay nada reproduciéndose.', ephemeral: true });
    }

    const paused = player.pause(interaction.guildId);
    await interaction.reply(paused ? '⏸️ Pausado.' : '❌ No se pudo pausar.');
  },
};

const { SlashCommandBuilder } = require('discord.js');
const player = require('../utils/player');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Salta la canción actual'),

  async execute(interaction) {
    const queue = player.getQueue(interaction.guildId);

    if (!queue?.isPlaying) {
      return interaction.reply({ content: '❌ No hay nada reproduciéndose.', ephemeral: true });
    }

    const skipped = queue.currentSong?.title || 'canción actual';
    player.skip(interaction.guildId);

    await interaction.reply(`⏭️ Saltado: **${skipped}**`);
  },
};

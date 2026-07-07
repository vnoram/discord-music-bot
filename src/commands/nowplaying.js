const { SlashCommandBuilder } = require('discord.js');
const player = require('../utils/player');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Muestra el panel de control de la canción actual'),

  async execute(interaction) {
    const queue = player.getQueue(interaction.guildId);

    if (!queue?.currentSong) {
      return interaction.reply({ content: '❌ No hay ninguna canción reproduciéndose.', ephemeral: true });
    }

    const embed = player.buildNowPlayingEmbed(queue.currentSong, queue);
    const components = player.buildNowPlayingComponents(queue.isPaused, queue.loop);

    // Borrar el panel anterior si existe
    if (queue.nowPlayingMessage) {
      queue.nowPlayingMessage.delete().catch(() => {});
    }

    // Enviar nuevo panel y guardarlo como el panel activo
    const msg = await interaction.reply({ embeds: [embed], components, fetchReply: true });
    queue.nowPlayingMessage = msg;
  },
};

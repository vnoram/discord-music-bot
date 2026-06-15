const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const player = require('../utils/player');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Muestra la canción que se está reproduciendo ahora'),

  async execute(interaction) {
    const queue = player.getQueue(interaction.guildId);

    if (!queue?.currentSong) {
      return interaction.reply({ content: '❌ No hay ninguna canción reproduciéndose.', ephemeral: true });
    }

    const song = queue.currentSong;
    const dur = song.durationMs ? player._formatDuration(song.durationMs) : '?';

    const embed = new EmbedBuilder()
      .setColor(0x1db954)
      .setTitle('🎵 Reproduciendo ahora')
      .setDescription(`**${song.title}**\n*${song.artist}*`)
      .addFields(
        { name: 'Duración', value: dur, inline: true },
        { name: 'Canciones en cola', value: String(queue.songs.length), inline: true }
      );

    if (song.thumbnail) embed.setThumbnail(song.thumbnail);

    await interaction.reply({ embeds: [embed] });
  },
};

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const player = require('../utils/player');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Muestra las canciones en cola')
    .addIntegerOption((opt) =>
      opt.setName('pagina').setDescription('Página (10 canciones por página)').setMinValue(1)
    ),

  async execute(interaction) {
    const queue = player.getQueue(interaction.guildId);

    if (!queue) {
      return interaction.reply({ content: '❌ No hay cola activa.', ephemeral: true });
    }

    const page = (interaction.options.getInteger('pagina') || 1) - 1;
    const perPage = 10;
    const songs = queue.songs;
    const totalPages = Math.max(1, Math.ceil(songs.length / perPage));

    if (page >= totalPages && songs.length > 0) {
      return interaction.reply({ content: `❌ Solo hay ${totalPages} página(s).`, ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setColor(0x1db954) // Verde Spotify
      .setTitle('🎵 Cola de reproducción');

    // Canción actual
    if (queue.currentSong) {
      embed.addFields({
        name: '▶️ Reproduciendo ahora',
        value: `**${queue.currentSong.title}** — *${queue.currentSong.artist}*`,
      });
    }

    if (songs.length === 0) {
      embed.setDescription('La cola está vacía.');
    } else {
      const slice = songs.slice(page * perPage, page * perPage + perPage);
      const lines = slice.map(
        (s, i) => `\`${page * perPage + i + 1}.\` **${s.title}** — *${s.artist}*`
      );
      embed.setDescription(lines.join('\n'));
      embed.setFooter({ text: `Página ${page + 1}/${totalPages} · ${songs.length} canciones en cola` });
    }

    await interaction.reply({ embeds: [embed] });
  },
};

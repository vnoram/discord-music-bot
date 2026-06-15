const { SlashCommandBuilder } = require('discord.js');
const player = require('../utils/player');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Detiene la música y desconecta el bot'),

  async execute(interaction) {
    const queue = player.getQueue(interaction.guildId);

    if (!queue) {
      return interaction.reply({ content: '❌ El bot no está en ningún canal de voz.', ephemeral: true });
    }

    player.destroy(interaction.guildId);
    await interaction.reply('⏹️ Música detenida y cola borrada. ¡Hasta luego!');
  },
};

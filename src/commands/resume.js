const { SlashCommandBuilder } = require('discord.js');
const player = require('../utils/player');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Reanuda la reproducción'),

  async execute(interaction) {
    const queue = player.getQueue(interaction.guildId);

    if (!queue) {
      return interaction.reply({ content: '❌ El bot no está conectado.', ephemeral: true });
    }

    const resumed = player.resume(interaction.guildId);
    await interaction.reply(resumed ? '▶️ Reproducción reanudada.' : '❌ No estaba pausado.');
  },
};

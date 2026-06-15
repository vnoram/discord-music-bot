const { SlashCommandBuilder } = require('discord.js');
const player = require('../utils/player');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Ajusta el volumen del bot (1-100)')
    .addIntegerOption((opt) =>
      opt
        .setName('nivel')
        .setDescription('Nivel de volumen (1-100)')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    ),

  async execute(interaction) {
    const queue = player.getQueue(interaction.guildId);

    if (!queue) {
      return interaction.reply({ content: '❌ El bot no está conectado.', ephemeral: true });
    }

    const nivel = interaction.options.getInteger('nivel');
    player.setVolume(interaction.guildId, nivel / 100);

    await interaction.reply(`🔊 Volumen ajustado a **${nivel}%**`);
  },
};

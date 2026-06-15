/**
 * Registra los slash commands en Discord.
 * Ejecutar UNA vez (o cuando cambien los comandos):
 *   node src/deploy-commands.js
 *
 * Con GUILD_ID en .env: registra solo en ese servidor (instantáneo, ideal para pruebas).
 * Sin GUILD_ID: registra globalmente (puede tardar hasta 1 hora en propagarse).
 */
require('dotenv').config();

const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');

for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
  const cmd = require(path.join(commandsPath, file));
  if (cmd.data) commands.push(cmd.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`📡 Registrando ${commands.length} comando(s)...`);

    let data;
    if (process.env.GUILD_ID) {
      // Registro en servidor específico (instantáneo)
      data = await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands }
      );
      console.log(`✅ ${data.length} comando(s) registrados en el servidor ${process.env.GUILD_ID}`);
    } else {
      // Registro global
      data = await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
      console.log(`✅ ${data.length} comando(s) registrados globalmente (puede tardar hasta 1 hora)`);
    }
  } catch (error) {
    console.error('❌ Error registrando comandos:', error);
    process.exit(1);
  }
})();

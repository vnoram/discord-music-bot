require('dotenv').config();

// Asegurar ffmpeg-static en el PATH para @discordjs/voice
const ffmpegPath = require('ffmpeg-static');
process.env.FFMPEG_PATH = ffmpegPath;

const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');

// ── Validar variables de entorno ───────────────────────────────────────────
const required = ['DISCORD_TOKEN', 'CLIENT_ID', 'SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`❌ Faltan variables de entorno: ${missing.join(', ')}`);
  console.error('   Copia .env.example a .env y llénalo.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
  ],
});

client.commands = new Collection();

// ── Cargar comandos ────────────────────────────────────────────────────────
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
  const cmd = require(path.join(commandsPath, file));
  if (cmd.data && cmd.execute) {
    client.commands.set(cmd.data.name, cmd);
    console.log(`  ✔ Comando cargado: /${cmd.data.name}`);
  }
}

// ── Eventos ────────────────────────────────────────────────────────────────
client.once('ready', () => {
  console.log(`\n✅ Bot conectado como: ${client.user.tag}`);
  console.log(`   Servidores: ${client.guilds.cache.size}`);
  client.user.setActivity('Spotify 🎵', { type: 2 }); // 2 = LISTENING
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`[Error] /${interaction.commandName}:`, error);
    const msg = { content: '❌ Ocurrió un error ejecutando ese comando.', ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(msg).catch(() => {});
    } else {
      await interaction.reply(msg).catch(() => {});
    }
  }
});

// ── Manejo de errores no capturados ───────────────────────────────────────
process.on('unhandledRejection', (err) => console.error('[UnhandledRejection]', err));
process.on('uncaughtException', (err) => console.error('[UncaughtException]', err));

client.login(process.env.DISCORD_TOKEN);

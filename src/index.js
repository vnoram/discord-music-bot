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
  process.exit(1);
}

// ── Cookies de YouTube (opcional pero recomendado para IPs de datacenter) ──
if (process.env.YOUTUBE_COOKIES) {
  try {
    const content = Buffer.from(process.env.YOUTUBE_COOKIES, 'base64').toString('utf8');
    fs.writeFileSync('/tmp/yt-cookies.txt', content);
    console.log('🍪 YouTube cookies cargadas');
  } catch (e) {
    console.warn('⚠️  No se pudieron cargar las cookies de YouTube:', e.message);
  }
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
  client.user.setActivity('Spotify 🎵', { type: 2 });
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

process.on('unhandledRejection', (err) => console.error('[UnhandledRejection]', err));
process.on('uncaughtException', (err) => console.error('[UncaughtException]', err));

client.login(process.env.DISCORD_TOKEN);

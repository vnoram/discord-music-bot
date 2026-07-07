require('dotenv').config();

// Asegurar ffmpeg-static en el PATH para @discordjs/voice
const ffmpegPath = require('ffmpeg-static');
process.env.FFMPEG_PATH = ffmpegPath;

const { Client, GatewayIntentBits, Collection, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const player = require('./utils/player');

// ── Validar variables de entorno ───────────────────────────────────────────
const required = ['DISCORD_TOKEN', 'CLIENT_ID', 'SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`❌ Faltan variables de entorno: ${missing.join(', ')}`);
  console.error('   Copia .env.example a .env y llénalo.');
  process.exit(1);
}

// ── Decodificar cookies de YouTube ────────────────────────────────────────
const COOKIES_PATH = '/tmp/yt-cookies.txt';
if (process.env.YOUTUBE_COOKIES) {
  try {
    fs.writeFileSync(COOKIES_PATH, Buffer.from(process.env.YOUTUBE_COOKIES, 'base64').toString('utf8'));
    console.log('🍪 YouTube cookies cargadas');
  } catch (e) {
    console.warn('⚠️ No se pudieron cargar las cookies de YouTube:', e.message);
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
  client.user.setActivity('Spotify 🎵', { type: 2 }); // 2 = LISTENING
});

client.on('interactionCreate', async (interaction) => {
  // ── Slash commands ──────────────────────────────────────────────────────
  if (interaction.isChatInputCommand()) {
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
    return;
  }

  // ── Botones del panel de control ────────────────────────────────────────
  if (interaction.isButton() && interaction.customId.startsWith('player:')) {
    await handlePlayerButton(interaction);
  }
});

async function handlePlayerButton(interaction) {
  const guildId = interaction.guildId;
  const queue = player.getQueue(guildId);

  if (!queue) {
    return interaction.reply({ content: '❌ No hay reproducción activa.', ephemeral: true });
  }

  switch (interaction.customId) {
    case 'player:pause_resume': {
      if (queue.isPaused) {
        player.resume(guildId);
        await interaction.update({
          embeds: [player.buildNowPlayingEmbed(queue.currentSong, queue)],
          components: player.buildNowPlayingComponents(false, queue.loop),
        });
      } else {
        player.pause(guildId);
        await interaction.update({
          embeds: [player.buildNowPlayingEmbed(queue.currentSong, queue)],
          components: player.buildNowPlayingComponents(true, queue.loop),
        });
      }
      break;
    }

    case 'player:skip': {
      player.skip(guildId);
      // El panel se actualiza automáticamente en playNext()
      await interaction.reply({ content: '⏭️ Saltando...', ephemeral: true });
      break;
    }

    case 'player:shuffle': {
      const ok = player.shuffle(guildId);
      await interaction.reply({
        content: ok ? '🔀 Cola mezclada!' : '❌ No hay suficientes canciones para mezclar.',
        ephemeral: true,
      });
      break;
    }

    case 'player:loop': {
      const isLoop = player.toggleLoop(guildId);
      await interaction.update({
        embeds: [player.buildNowPlayingEmbed(queue.currentSong, queue)],
        components: player.buildNowPlayingComponents(queue.isPaused, isLoop),
      });
      break;
    }

    case 'player:stop': {
      player.destroy(guildId);
      // destroy() ya edita el mensaje del panel
      await interaction.reply({ content: '⏹️ Reproducción detenida.', ephemeral: true }).catch(() => {});
      break;
    }

    case 'player:queue': {
      const songs = queue.songs;
      const embed = new EmbedBuilder().setColor(0x1db954).setTitle('📋 Cola de reproducción');

      if (queue.currentSong) {
        embed.addFields({
          name: '▶️ Reproduciendo ahora',
          value: `**${queue.currentSong.title}** — *${queue.currentSong.artist}*`,
        });
      }

      if (songs.length === 0) {
        embed.setDescription('No hay más canciones en cola.');
      } else {
        const lines = songs.slice(0, 15).map(
          (s, i) => `\`${i + 1}.\` **${s.title}** — *${s.artist}*`
        );
        if (songs.length > 15) lines.push(`... y ${songs.length - 15} más`);
        embed.setDescription(lines.join('\n'));
        embed.setFooter({ text: `${songs.length} canciones en total` });
      }

      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    default:
      await interaction.reply({ content: '❓ Botón desconocido.', ephemeral: true });
  }
}

// ── Manejo de errores no capturados ───────────────────────────────────────
process.on('unhandledRejection', (err) => console.error('[UnhandledRejection]', err));
process.on('uncaughtException', (err) => console.error('[UncaughtException]', err));

client.login(process.env.DISCORD_TOKEN);

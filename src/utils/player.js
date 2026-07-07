const {
  createAudioPlayer,
  createAudioResource,
  joinVoiceChannel,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  NoSubscriberBehavior,
} = require('@discordjs/voice');
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const play = require('play-dl');

// Mapa: guildId -> GuildQueue
const queues = new Map();

function getQueue(guildId) {
  return queues.get(guildId) || null;
}

function createQueue(guild, voiceChannel, textChannel) {
  const audioPlayer = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
  });

  const queue = {
    guild,
    voiceChannel,
    textChannel,
    connection: null,
    audioPlayer,
    songs: [],
    currentSong: null,
    isPlaying: false,
    isPaused: false,
    loop: false,
    volume: 0.5,
    loading: false,
    nowPlayingMessage: null, // mensaje del panel de control
  };

  queues.set(guild.id, queue);
  _setupPlayerEvents(guild.id, audioPlayer);
  return queue;
}

function _setupPlayerEvents(guildId, audioPlayer) {
  audioPlayer.on(AudioPlayerStatus.Idle, () => {
    playNext(guildId);
  });

  audioPlayer.on('error', (err) => {
    console.error(`[Player] Error en guild ${guildId}:`, err.message);
    playNext(guildId);
  });
}

async function connect(queue) {
  const connection = joinVoiceChannel({
    channelId: queue.voiceChannel.id,
    guildId: queue.guild.id,
    adapterCreator: queue.guild.voiceAdapterCreator,
    selfDeaf: true,
  });

  queue.connection = connection;
  connection.subscribe(queue.audioPlayer);

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
  } catch {
    destroy(queue.guild.id);
    throw new Error('No se pudo conectar al canal de voz.');
  }

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      destroy(queue.guild.id);
    }
  });

  return connection;
}

async function resolveYoutube(song) {
  if (song.url) return song.url;
  const query = `${song.title} ${song.artist} audio`;
  const results = await play.search(query, { limit: 1, source: { youtube: 'video' } });
  if (!results.length) throw new Error(`No se encontró en YouTube: ${song.title}`);
  return results[0].url;
}

async function playNext(guildId) {
  const queue = queues.get(guildId);
  if (!queue) return;

  // Si loop está activo, volver a poner la canción actual al frente
  if (queue.loop && queue.currentSong) {
    queue.songs.unshift(queue.currentSong);
  }

  if (queue.songs.length === 0) {
    queue.currentSong = null;
    queue.isPlaying = false;
    queue.isPaused = false;

    // Actualizar panel mostrando que terminó
    if (queue.nowPlayingMessage) {
      queue.nowPlayingMessage.edit({
        content: '✅ Cola finalizada.',
        embeds: [],
        components: [],
      }).catch(() => {});
      queue.nowPlayingMessage = null;
    }

    // Desconectar tras 5 min de silencio
    setTimeout(() => {
      const q = queues.get(guildId);
      if (q && !q.isPlaying && q.songs.length === 0) destroy(guildId);
    }, 300_000);
    return;
  }

  const song = queue.songs.shift();
  queue.currentSong = song;
  queue.isPlaying = true;
  queue.isPaused = false;

  try {
    const url = await resolveYoutube(song);
    song.url = url;

    const stream = await play.stream(url, { quality: 2 });
    const resource = createAudioResource(stream.stream, {
      inputType: stream.type,
      inlineVolume: true,
    });
    resource.volume?.setVolume(queue.volume);

    queue.audioPlayer.play(resource);

    // Enviar o actualizar el panel de control
    await _sendOrUpdateNowPlaying(queue);

  } catch (err) {
    console.error(`[Player] Error reproduciendo "${song.title}":`, err.message);
    if (queue.textChannel) {
      queue.textChannel
        .send(`⚠️ No pude reproducir **${song.title}**, saltando...`)
        .catch(() => {});
    }
    playNext(guildId);
  }
}

async function _sendOrUpdateNowPlaying(queue) {
  if (!queue.textChannel) return;

  const embed = buildNowPlayingEmbed(queue.currentSong, queue);
  const components = buildNowPlayingComponents(false, queue.loop);

  try {
    if (queue.nowPlayingMessage) {
      await queue.nowPlayingMessage.edit({ content: '', embeds: [embed], components });
    } else {
      queue.nowPlayingMessage = await queue.textChannel.send({ embeds: [embed], components });
    }
  } catch {
    // Si el mensaje fue borrado, enviar uno nuevo
    queue.nowPlayingMessage = await queue.textChannel
      .send({ embeds: [embed], components })
      .catch(() => null);
  }
}

// ── Helpers públicos para construir embed y botones ───────────────────────────

function buildNowPlayingEmbed(song, queue) {
  const embed = new EmbedBuilder()
    .setColor(0x1db954)
    .setAuthor({ name: '♫ DJ Gamora' })
    .setTitle(song.title)
    .setDescription(`*${song.artist}*`);

  if (song.thumbnail) embed.setThumbnail(song.thumbnail);

  const fields = [];
  if (song.durationMs) {
    fields.push({ name: '⏱ Duración', value: _formatDuration(song.durationMs), inline: true });
  }
  fields.push({ name: '🎶 En cola', value: `${queue.songs.length} canción(es)`, inline: true });
  if (queue.loop) fields.push({ name: '🔁 Loop', value: 'Activado', inline: true });

  embed.addFields(fields);
  return embed;
}

function buildNowPlayingComponents(isPaused, isLoop) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('player:pause_resume')
        .setEmoji(isPaused ? '▶️' : '⏸️')
        .setLabel(isPaused ? 'Reanudar' : 'Pausar')
        .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('player:skip')
        .setEmoji('⏭️')
        .setLabel('Siguiente')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('player:shuffle')
        .setEmoji('🔀')
        .setLabel('Mezclar')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('player:loop')
        .setEmoji('🔁')
        .setLabel('Loop')
        .setStyle(isLoop ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('player:stop')
        .setEmoji('⏹️')
        .setLabel('Detener')
        .setStyle(ButtonStyle.Danger),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('player:queue')
        .setEmoji('📋')
        .setLabel('Ver cola')
        .setStyle(ButtonStyle.Primary),
    ),
  ];
}

// ── Controles ─────────────────────────────────────────────────────────────────

function skip(guildId) {
  const queue = queues.get(guildId);
  if (!queue) return false;
  queue.loop = false; // saltar cancela el loop actual
  queue.audioPlayer.stop(true);
  return true;
}

function pause(guildId) {
  const queue = queues.get(guildId);
  if (!queue) return false;
  const ok = queue.audioPlayer.pause();
  if (ok) queue.isPaused = true;
  return ok;
}

function resume(guildId) {
  const queue = queues.get(guildId);
  if (!queue) return false;
  const ok = queue.audioPlayer.unpause();
  if (ok) queue.isPaused = false;
  return ok;
}

function setVolume(guildId, vol) {
  const queue = queues.get(guildId);
  if (!queue) return false;
  queue.volume = vol;
  const resource = queue.audioPlayer.state?.resource;
  if (resource?.volume) resource.volume.setVolume(vol);
  return true;
}

function clearQueue(guildId) {
  const queue = queues.get(guildId);
  if (queue) queue.songs = [];
}

function shuffle(guildId) {
  const queue = queues.get(guildId);
  if (!queue || queue.songs.length < 2) return false;
  for (let i = queue.songs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [queue.songs[i], queue.songs[j]] = [queue.songs[j], queue.songs[i]];
  }
  return true;
}

function toggleLoop(guildId) {
  const queue = queues.get(guildId);
  if (!queue) return false;
  queue.loop = !queue.loop;
  return queue.loop;
}

function destroy(guildId) {
  const queue = queues.get(guildId);
  if (!queue) return;

  if (queue.nowPlayingMessage) {
    queue.nowPlayingMessage.edit({
      content: '⏹️ Reproducción detenida.',
      embeds: [],
      components: [],
    }).catch(() => {});
    queue.nowPlayingMessage = null;
  }

  queue.songs = [];
  queue.isPlaying = false;
  try { queue.audioPlayer.stop(true); } catch {}
  try { queue.connection?.destroy(); } catch {}
  queues.delete(guildId);
}

function _formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

module.exports = {
  getQueue,
  createQueue,
  connect,
  playNext,
  skip,
  pause,
  resume,
  setVolume,
  clearQueue,
  shuffle,
  toggleLoop,
  destroy,
  buildNowPlayingEmbed,
  buildNowPlayingComponents,
  _formatDuration,
};

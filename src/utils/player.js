const {
  createAudioPlayer,
  createAudioResource,
  joinVoiceChannel,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  NoSubscriberBehavior,
  StreamType,
} = require('@discordjs/voice');
const { searchYoutube, getDirectUrl, createFfmpegStream } = require('./ytdlp');

const queues = new Map();

function getQueue(guildId) {
  return queues.get(guildId) || null;
}

function createQueue(guild, voiceChannel, textChannel) {
  const audioPlayer = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
  });

  const queue = {
    guild, voiceChannel, textChannel,
    connection: null, audioPlayer,
    songs: [], currentSong: null,
    isPlaying: false, volume: 0.5, loading: false,
  };

  queues.set(guild.id, queue);
  _setupPlayerEvents(guild.id, audioPlayer);
  return queue;
}

function _setupPlayerEvents(guildId, audioPlayer) {
  audioPlayer.on(AudioPlayerStatus.Idle, () => playNext(guildId));
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

async function resolveYoutubeUrl(song) {
  if (song.url) return song.url;
  const query = `${song.title} ${song.artist} audio`;
  const result = await searchYoutube(query);
  return result.url;
}

async function playNext(guildId) {
  const queue = queues.get(guildId);
  if (!queue) return;

  if (queue.songs.length === 0) {
    queue.currentSong = null;
    queue.isPlaying = false;
    setTimeout(() => {
      const q = queues.get(guildId);
      if (q && !q.isPlaying && q.songs.length === 0) destroy(guildId);
    }, 300_000);
    return;
  }

  const song = queue.songs.shift();
  queue.currentSong = song;
  queue.isPlaying = true;

  try {
    const youtubeUrl = await resolveYoutubeUrl(song);
    song.url = youtubeUrl;

    console.log(`[Player] Obteniendo URL directa para: ${song.title}`);
    const directUrl = await getDirectUrl(youtubeUrl);
    console.log(`[Player] Iniciando ffmpeg stream`);

    const stream = createFfmpegStream(directUrl);
    const resource = createAudioResource(stream, {
      inputType: StreamType.Raw,
      inlineVolume: true,
    });
    resource.volume?.setVolume(queue.volume);

    queue.audioPlayer.play(resource);

    if (queue.textChannel) {
      const dur = song.durationMs ? _formatDuration(song.durationMs) : '?';
      queue.textChannel
        .send(`🎵 **Reproduciendo:** ${song.title} — *${song.artist}* \`[${dur}]\``)
        .catch(() => {});
    }
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

function skip(guildId) {
  const queue = queues.get(guildId);
  if (!queue) return false;
  queue.audioPlayer.stop(true);
  return true;
}

function pause(guildId) {
  const queue = queues.get(guildId);
  if (!queue) return false;
  return queue.audioPlayer.pause();
}

function resume(guildId) {
  const queue = queues.get(guildId);
  if (!queue) return false;
  return queue.audioPlayer.unpause();
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

function destroy(guildId) {
  const queue = queues.get(guildId);
  if (!queue) return;
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
  getQueue, createQueue, connect, playNext,
  skip, pause, resume, setVolume, clearQueue, destroy, _formatDuration,
};

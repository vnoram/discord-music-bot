const { SlashCommandBuilder } = require('discord.js');
const player = require('../utils/player');
const spotify = require('../utils/spotify');
const ytdlp = require('../utils/ytdlp');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Reproduce una canción o playlist de Spotify / YouTube')
    .addStringOption((opt) =>
      opt
        .setName('query')
        .setDescription('URL de Spotify (canción/playlist/álbum) o nombre de canción')
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const query = interaction.options.getString('query').trim();
    const voiceChannel = interaction.member?.voice?.channel;

    if (!voiceChannel) {
      return interaction.editReply('❌ Debes estar en un canal de voz para usar este comando.');
    }

    const perms = voiceChannel.permissionsFor(interaction.client.user);
    if (!perms?.has('Connect') || !perms?.has('Speak')) {
      return interaction.editReply('❌ No tengo permisos para conectarme a ese canal de voz.');
    }

    let songs = [];

    try {
      const spInfo = spotify.parseSpotifyUrl(query);

      if (spInfo) {
        // ── SPOTIFY ──────────────────────────────────────────────────────────
        if (spInfo.type === 'track') {
          const meta = await spotify.getTrack(spInfo.id);
          songs = [{ ...meta, url: null }];
          await interaction.editReply(`🎵 **Añadido:** ${meta.title} — *${meta.artist}*`);

        } else if (spInfo.type === 'playlist') {
          const info = await spotify.getPlaylistInfo(spInfo.id);
          await interaction.editReply(`⏳ Cargando playlist **${info.name}** (${info.total} canciones)...`);
          return _loadSpotifyTracksPartial(spInfo.id, 'playlist', interaction);

        } else if (spInfo.type === 'album') {
          const info = await spotify.getAlbumInfo(spInfo.id);
          await interaction.editReply(`⏳ Cargando álbum **${info.name}** (${info.total} canciones)...`);
          return _loadSpotifyTracksPartial(spInfo.id, 'album', interaction);
        }

      } else if (_isYouTubeUrl(query)) {
        // ── YOUTUBE URL ───────────────────────────────────────────────────────
        const info = await ytdlp.getVideoInfo(query);
        songs = [info];
        await interaction.editReply(`🎵 **Añadido:** ${info.title} — *${info.artist}*`);

      } else {
        // ── BÚSQUEDA DE TEXTO ─────────────────────────────────────────────────
        const result = await ytdlp.searchYoutube(query);
        songs = [result];
        await interaction.editReply(`🎵 **Añadido:** ${result.title} — *${result.artist}*`);
      }

    } catch (err) {
      console.error('[play] Error:', err);
      return interaction.editReply(`❌ Error al cargar la música: ${err.message}`);
    }

    if (!songs.length) return interaction.editReply('❌ No se pudieron cargar canciones.');
    await _enqueueAndPlay(interaction, voiceChannel, songs);
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function _loadSpotifyTracksPartial(id, type, interaction) {
  const voiceChannel = interaction.member?.voice?.channel;
  const generator = type === 'playlist'
    ? spotify.getPlaylistTracks(id)
    : spotify.getAlbumTracks(id);

  const firstBatch = [];
  let count = 0;

  for await (const track of generator) {
    firstBatch.push(spotify.trackToSongMeta(track));
    count++;
    if (count >= 5) break;
  }

  if (!firstBatch.length) {
    await interaction.editReply('❌ No se encontraron canciones en esa playlist/álbum.');
    return;
  }

  await _enqueueAndPlay(interaction, voiceChannel, firstBatch);
  _loadRemainingTracks(id, type, generator, interaction).catch(console.error);
}

async function _loadRemainingTracks(id, type, generator, interaction) {
  const guildId = interaction.guildId;
  let total = 0;

  for await (const track of generator) {
    const queue = player.getQueue(guildId);
    if (!queue) break;
    queue.songs.push(spotify.trackToSongMeta(track));
    total++;
  }

  if (total > 0) {
    interaction.channel
      ?.send(`✅ Playlist completa: **${total + 5}** canciones en la cola.`)
      .catch(() => {});
  }
}

async function _enqueueAndPlay(interaction, voiceChannel, songs) {
  const guildId = interaction.guildId;
  let queue = player.getQueue(guildId);
  const wasEmpty = !queue;

  if (!queue) {
    queue = player.createQueue(interaction.guild, voiceChannel, interaction.channel);
    try {
      await player.connect(queue);
    } catch (err) {
      player.destroy(guildId);
      await interaction.followUp(`❌ ${err.message}`).catch(() => {});
      return;
    }
  }

  queue.songs.push(...songs);

  if (wasEmpty || !queue.isPlaying) {
    await player.playNext(guildId);
  }
}

function _isYouTubeUrl(str) {
  return str.includes('youtube.com') || str.includes('youtu.be');
}

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const play = require('play-dl');
const player = require('../utils/player');
const spotify = require('../utils/spotify');

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

    // ── Determinar fuente ────────────────────────────────────────────────────
    let songs = [];
    let playlistName = null;

    try {
      const spInfo = spotify.parseSpotifyUrl(query);

      if (spInfo) {
        // ── SPOTIFY ──────────────────────────────────────────────────────────
        if (spInfo.type === 'track') {
          const meta = await spotify.getTrack(spInfo.id);
          songs = [{ ...meta, url: null }];
          await interaction.editReply(`🔍 Buscando en YouTube: **${meta.title}** — *${meta.artist}*`);

        } else if (spInfo.type === 'playlist') {
          const info = await spotify.getPlaylistInfo(spInfo.id);
          playlistName = info.name;
          await interaction.editReply(`⏳ Cargando playlist **${info.name}** (${info.total} canciones)...`);
          // Cargar en background; las primeras 5 las añadimos ahora
          songs = await _loadSpotifyTracksPartial(spInfo.id, 'playlist', interaction);
          return; // _loadSpotifyTracksPartial maneja el resto

        } else if (spInfo.type === 'album') {
          const info = await spotify.getAlbumInfo(spInfo.id);
          playlistName = info.name;
          await interaction.editReply(`⏳ Cargando álbum **${info.name}** (${info.total} canciones)...`);
          songs = await _loadSpotifyTracksPartial(spInfo.id, 'album', interaction);
          return;
        }

      } else if (_isYouTubeUrl(query)) {
        // ── YOUTUBE URL ───────────────────────────────────────────────────────
        const ytType = play.yt_validate(query);
        if (ytType === 'playlist') {
          const pl = await play.playlist_info(query, { incomplete: true });
          const videos = await pl.all_videos();
          songs = videos.map((v) => ({
            title: v.title || 'Sin título',
            artist: v.channel?.name || 'YouTube',
            url: v.url,
            durationMs: (v.durationInSec || 0) * 1000,
            thumbnail: v.thumbnails?.[0]?.url || null,
          }));
          await interaction.editReply(`📋 Playlist de YouTube: **${pl.title}** (${songs.length} canciones)`);
        } else {
          const info = await play.video_info(query);
          const v = info.video_details;
          songs = [{
            title: v.title || 'Sin título',
            artist: v.channel?.name || 'YouTube',
            url: query,
            durationMs: (v.durationInSec || 0) * 1000,
            thumbnail: v.thumbnails?.[0]?.url || null,
          }];
          await interaction.editReply(`🎵 Añadido: **${songs[0].title}**`);
        }

      } else {
        // ── BÚSQUEDA ──────────────────────────────────────────────────────────
        const results = await play.search(query, { limit: 1, source: { youtube: 'video' } });
        if (!results.length) return interaction.editReply('❌ No encontré resultados para esa búsqueda.');
        const v = results[0];
        songs = [{
          title: v.title || 'Sin título',
          artist: v.channel?.name || 'YouTube',
          url: v.url,
          durationMs: (v.durationInSec || 0) * 1000,
          thumbnail: v.thumbnails?.[0]?.url || null,
        }];
        await interaction.editReply(`🎵 Añadido: **${songs[0].title}** — *${songs[0].artist}*`);
      }

    } catch (err) {
      console.error('[play] Error cargando canción:', err);
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

  // Recoger primeras 5 canciones para empezar a reproducir rápido
  for await (const track of generator) {
    firstBatch.push(spotify.trackToSongMeta(track));
    count++;
    if (count >= 5) break;
  }

  if (!firstBatch.length) {
    await interaction.editReply('❌ No se encontraron canciones en esa playlist/álbum.');
    return [];
  }

  await _enqueueAndPlay(interaction, voiceChannel, firstBatch);

  // Continuar cargando el resto en background
  _loadRemainingTracks(id, type, generator, interaction).catch(console.error);

  return [];
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
      ?.send(`✅ Playlist completa cargada: **${total + 5}** canciones en total en la cola.`)
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

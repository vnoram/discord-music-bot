const SpotifyWebApi = require('spotify-web-api-node');

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
});

let tokenExpiry = 0;

async function ensureToken(retries = 2) {
  if (Date.now() < tokenExpiry - 60_000) return;
  try {
    const data = await spotifyApi.clientCredentialsGrant();
    spotifyApi.setAccessToken(data.body.access_token);
    tokenExpiry = Date.now() + data.body.expires_in * 1000;
  } catch (err) {
    tokenExpiry = 0; // forzar reintento la próxima vez
    if (retries > 0) {
      console.warn(`[Spotify] Error de token, reintentando (${retries} restantes)...`);
      await new Promise((r) => setTimeout(r, 1000));
      return ensureToken(retries - 1);
    }
    throw new Error(`No se pudo obtener token de Spotify: ${err.message}`);
  }
}

// Soporta open.spotify.com, spotify.com, URLs con /intl-XX/ y parámetros ?si=...
function parseSpotifyUrl(url) {
  const match = url.match(/spotify\.com\/(?:intl-\w+\/)?(track|playlist|album)\/([A-Za-z0-9]+)/);
  return match ? { type: match[1], id: match[2] } : null;
}

async function getTrack(id) {
  await ensureToken();
  const { body } = await spotifyApi.getTrack(id);
  return {
    title: body.name,
    artist: body.artists.map((a) => a.name).join(', '),
    thumbnail: body.album?.images?.[0]?.url || null,
    durationMs: body.duration_ms,
  };
}

async function getPlaylistInfo(id) {
  await ensureToken();
  // Sin filtro fields para garantizar que tracks.total esté disponible
  const { body } = await spotifyApi.getPlaylist(id);
  return {
    name: body.name,
    total: body.tracks?.total || 0,
    thumbnail: body.images?.[0]?.url || null,
  };
}

async function* getPlaylistTracks(id) {
  await ensureToken();

  // getPlaylistTracks da 403 con Client Credentials en modo dev.
  // Usamos getPlaylist que sí funciona y devuelve la primera página de tracks.
  const { body: playlist } = await spotifyApi.getPlaylist(id);
  let page = playlist.tracks;

  while (page) {
    for (const item of (page.items || [])) {
      if (item?.track) yield item.track;
    }
    if (!page.next) break;

    // Paginar usando la URL 'next' directamente con el token vigente
    try {
      const token = spotifyApi.getAccessToken();
      const res = await fetch(page.next, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) break;
      page = await res.json();
    } catch {
      break;
    }
  }
}

async function getAlbumInfo(id) {
  await ensureToken();
  const { body } = await spotifyApi.getAlbum(id);
  return {
    name: body.name,
    total: body.tracks.total,
    thumbnail: body.images?.[0]?.url || null,
  };
}

async function* getAlbumTracks(id) {
  await ensureToken();
  const { body: album } = await spotifyApi.getAlbum(id);
  let offset = 0;
  const limit = 50;

  while (true) {
    const { body } = await spotifyApi.getAlbumTracks(id, { offset, limit });
    for (const track of body.items) {
      yield {
        name: track.name,
        artists: track.artists.length > 0 ? track.artists : album.artists,
        duration_ms: track.duration_ms,
        album: { images: album.images },
      };
    }
    if (!body.next) break;
    offset += limit;
  }
}

function trackToSearchQuery(track) {
  const artist = track.artists?.[0]?.name || '';
  return `${track.name} ${artist} audio`.trim();
}

function trackToSongMeta(track) {
  return {
    title: track.name,
    artist: (track.artists || []).map((a) => a.name).join(', '),
    thumbnail: track.album?.images?.[0]?.url || null,
    durationMs: track.duration_ms,
    url: null,
  };
}

module.exports = {
  parseSpotifyUrl,
  getTrack,
  getPlaylistInfo,
  getPlaylistTracks,
  getAlbumInfo,
  getAlbumTracks,
  trackToSearchQuery,
  trackToSongMeta,
};

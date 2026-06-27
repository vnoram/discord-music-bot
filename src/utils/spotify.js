const SpotifyWebApi = require('spotify-web-api-node');

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
});

let tokenExpiry = 0;

async function ensureToken(retries = 2) {
  if (Date.now() < tokenExpiry - 60_000) return;
  try {
    if (process.env.SPOTIFY_REFRESH_TOKEN) {
      // OAuth user token — permite acceder a playlists y el endpoint /tracks
      const auth = Buffer.from(
        `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
      ).toString('base64');
      const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: process.env.SPOTIFY_REFRESH_TOKEN,
        }),
      });
      const data = await res.json();
      if (!data.access_token) throw new Error(JSON.stringify(data));
      spotifyApi.setAccessToken(data.access_token);
      tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;
      console.log('[Spotify] Token OAuth renovado correctamente.');
    } else {
      // Fallback: Client Credentials (no accede a /tracks de playlists)
      const data = await spotifyApi.clientCredentialsGrant();
      spotifyApi.setAccessToken(data.body.access_token);
      tokenExpiry = Date.now() + data.body.expires_in * 1000;
      console.warn('[Spotify] Usando Client Credentials — playlists pueden fallar.');
    }
  } catch (err) {
    tokenExpiry = 0;
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
  const token = spotifyApi.getAccessToken();

  // Usar GET /playlists/{id}?limit=50&offset=N (endpoint core, no restringido)
  // en vez de GET /playlists/{id}/tracks (403 en modo desarrollo desde nov 2024)
  let offset = 0;
  const limit = 50;
  let total = null;

  while (true) {
    const url = `https://api.spotify.com/v1/playlists/${id}?limit=${limit}&offset=${offset}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Spotify playlist (offset=${offset}): ${res.status} | ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    const tracks = data.tracks;
    console.log(`[Spotify DEBUG] offset=${offset} tracks=${JSON.stringify(tracks).slice(0, 400)}`);
    if (!tracks?.items?.length) break;
    if (total === null) total = tracks.total;
    for (const item of tracks.items) {
      if (item?.track) yield item.track;
    }
    offset += limit;
    if (!tracks.next || offset >= total) break;
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

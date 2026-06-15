/**
 * Wrapper para yt-dlp — reemplaza play-dl para streaming/búsqueda en YouTube.
 * Usa el cliente iOS de YouTube para evadir la detección de bots en servidores cloud.
 */
const { spawn } = require('child_process');

const YTDLP_ARGS_BASE = [
  '--extractor-arg', 'youtube:player_client=ios,web',
  '--no-warnings',
  '-q',
];

/**
 * Busca en YouTube y devuelve la URL del primer resultado.
 */
async function searchYoutube(query) {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', [
      `ytsearch1:${query}`,
      '--dump-json',
      '--no-playlist',
      ...YTDLP_ARGS_BASE,
    ]);

    let output = '';
    let errOutput = '';
    proc.stdout.on('data', (d) => (output += d.toString()));
    proc.stderr.on('data', (d) => (errOutput += d.toString()));
    proc.on('close', (code) => {
      const trimmed = output.trim();
      if (!trimmed) return reject(new Error(`yt-dlp search falló: ${errOutput}`));
      try {
        const info = JSON.parse(trimmed);
        resolve({
          url: info.webpage_url || `https://www.youtube.com/watch?v=${info.id}`,
          title: info.title || query,
          artist: info.uploader || 'YouTube',
          durationMs: (info.duration || 0) * 1000,
          thumbnail: info.thumbnail || null,
        });
      } catch (e) {
        reject(new Error(`yt-dlp parse error: ${e.message}`));
      }
    });
    proc.on('error', (e) => reject(new Error(`yt-dlp no encontrado: ${e.message}`)));
  });
}

/**
 * Obtiene info de una URL de YouTube.
 */
async function getVideoInfo(url) {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', [
      url,
      '--dump-json',
      '--no-playlist',
      ...YTDLP_ARGS_BASE,
    ]);

    let output = '';
    proc.stdout.on('data', (d) => (output += d.toString()));
    proc.on('close', () => {
      const trimmed = output.trim();
      if (!trimmed) return reject(new Error('No se pudo obtener info del video'));
      try {
        const info = JSON.parse(trimmed);
        resolve({
          url: info.webpage_url || url,
          title: info.title || 'Sin título',
          artist: info.uploader || 'YouTube',
          durationMs: (info.duration || 0) * 1000,
          thumbnail: info.thumbnail || null,
        });
      } catch (e) {
        reject(e);
      }
    });
    proc.on('error', (e) => reject(new Error(`yt-dlp no encontrado: ${e.message}`)));
  });
}

/**
 * Crea un stream de audio para una URL de YouTube.
 * Devuelve el stdout del proceso yt-dlp (Readable stream).
 */
function createAudioStream(url) {
  const proc = spawn('yt-dlp', [
    url,
    '-f', 'bestaudio[acodec=opus]/bestaudio[ext=webm]/bestaudio',
    '--extractor-arg', 'youtube:player_client=ios,web',
    '--no-playlist',
    '-o', '-',
    '-q', '--no-warnings',
  ]);

  proc.stderr.on('data', (d) => {
    const msg = d.toString();
    if (msg.trim()) console.error('[yt-dlp]', msg.trim());
  });

  proc.on('error', (e) => {
    console.error('[yt-dlp] Error al iniciar proceso:', e.message);
  });

  return proc.stdout;
}

module.exports = { searchYoutube, getVideoInfo, createAudioStream };

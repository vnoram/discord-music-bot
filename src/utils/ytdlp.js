/**
 * Wrapper para yt-dlp — reemplaza play-dl para streaming/búsqueda en YouTube.
 * Usa el cliente iOS de YouTube para evadir la detección de bots en servidores cloud.
 */
const { spawn } = require('child_process');
const path = require('path');

// Binario local descargado en postinstall, o el del PATH si existe
const YTDLP_BIN = path.join(__dirname, '../../bin/yt-dlp');

const BASE_ARGS = [
  '--extractor-arg', 'youtube:player_client=ios,web',
  '--no-warnings',
  '-q',
];

async function searchYoutube(query) {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP_BIN, [
      `ytsearch1:${query}`,
      '--dump-json',
      '--no-playlist',
      ...BASE_ARGS,
    ]);

    let out = '', err = '';
    proc.stdout.on('data', (d) => (out += d));
    proc.stderr.on('data', (d) => (err += d));
    proc.on('close', () => {
      const trimmed = out.trim();
      if (!trimmed) return reject(new Error(`yt-dlp search falló: ${err}`));
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
    proc.on('error', (e) => reject(new Error(`yt-dlp error: ${e.message}`)));
  });
}

async function getVideoInfo(url) {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP_BIN, [
      url, '--dump-json', '--no-playlist', ...BASE_ARGS,
    ]);

    let out = '';
    proc.stdout.on('data', (d) => (out += d));
    proc.on('close', () => {
      const trimmed = out.trim();
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
    proc.on('error', (e) => reject(new Error(`yt-dlp error: ${e.message}`)));
  });
}

function createAudioStream(url) {
  const proc = spawn(YTDLP_BIN, [
    url,
    '-f', 'bestaudio[acodec=opus]/bestaudio[ext=webm]/bestaudio',
    '--extractor-arg', 'youtube:player_client=ios,web',
    '--no-playlist',
    '-o', '-',
    '-q', '--no-warnings',
  ]);

  proc.stderr.on('data', (d) => {
    const msg = d.toString().trim();
    if (msg) console.error('[yt-dlp]', msg);
  });
  proc.on('error', (e) => console.error('[yt-dlp] spawn error:', e.message));

  return proc.stdout;
}

module.exports = { searchYoutube, getVideoInfo, createAudioStream };

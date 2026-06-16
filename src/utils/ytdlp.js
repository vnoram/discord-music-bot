const { spawn } = require('child_process');
const path = require('path');
const ffmpegPath = require('ffmpeg-static');

const YTDLP_BIN = path.join(__dirname, '../../bin/yt-dlp');

async function searchYoutube(query) {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP_BIN, [
      `ytsearch1:${query}`,
      '--dump-json', '--no-playlist', '--no-warnings', '-q',
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
      url, '--dump-json', '--no-playlist', '--no-warnings', '-q',
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

// Retorna stream PCM raw listo para StreamType.Raw
function createAudioStream(url) {
  const ytdlp = spawn(YTDLP_BIN, [
    url,
    '-f', 'bestaudio/best',
    '--no-playlist',
    '-o', '-',
    '--no-warnings',
    '-q',
  ]);

  const ffmpeg = spawn(ffmpegPath, [
    '-i', 'pipe:0',
    '-analyzeduration', '0',
    '-loglevel', 'error',
    '-f', 's16le',
    '-ar', '48000',
    '-ac', '2',
    'pipe:1',
  ]);

  ytdlp.stdout.pipe(ffmpeg.stdin);

  ytdlp.stderr.on('data', (d) => {
    const msg = d.toString().trim();
    if (msg) console.error('[yt-dlp]', msg);
  });
  ffmpeg.stderr.on('data', (d) => {
    const msg = d.toString().trim();
    if (msg) console.error('[ffmpeg]', msg);
  });
  ytdlp.on('error', (e) => console.error('[yt-dlp spawn]', e.message));
  ffmpeg.on('error', (e) => console.error('[ffmpeg spawn]', e.message));

  return ffmpeg.stdout;
}

module.exports = { searchYoutube, getVideoInfo, createAudioStream };

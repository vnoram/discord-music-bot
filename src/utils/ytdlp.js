const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const YTDLP_BIN = path.join(__dirname, '../../bin/yt-dlp');
const COOKIES_PATH = '/tmp/yt-cookies.txt';

function baseArgs() {
  const args = ['--no-warnings'];
  if (fs.existsSync(COOKIES_PATH)) {
    args.push('--cookies', COOKIES_PATH);
  }
  return args;
}

function _searchOnce(query) {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP_BIN, [
      `ytsearch1:${query}`,
      '--dump-json', '--no-playlist',
      ...baseArgs(),
    ]);
    let out = '', err = '';
    proc.stdout.on('data', (d) => (out += d));
    proc.stderr.on('data', (d) => (err += d));
    proc.on('close', () => {
      const trimmed = out.trim();
      if (!trimmed) return reject(new Error(`yt-dlp search falló: ${err.trim()}`));
      try {
        const info = JSON.parse(trimmed);
        resolve({
          url: info.webpage_url || `https://www.youtube.com/watch?v=${info.id}`,
          title: info.title || query,
          artist: info.uploader || 'YouTube',
          durationMs: (info.duration || 0) * 1000,
          thumbnail: info.thumbnail || null,
        });
      } catch (e) { reject(new Error(`yt-dlp parse error: ${e.message}`)); }
    });
    proc.on('error', (e) => reject(new Error(`yt-dlp error: ${e.message}`)));
  });
}

async function searchYoutube(query, retries = 2) {
  try {
    return await _searchOnce(query);
  } catch (err) {
    if (retries > 0) {
      console.warn(`[yt-dlp] Reintentando búsqueda (${retries} restantes): ${query}`);
      await new Promise((r) => setTimeout(r, 1500));
      return searchYoutube(query, retries - 1);
    }
    throw err;
  }
}

async function getVideoInfo(url) {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP_BIN, [url, '--dump-json', '--no-playlist', ...baseArgs()]);
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
      } catch (e) { reject(e); }
    });
    proc.on('error', (e) => reject(new Error(`yt-dlp error: ${e.message}`)));
  });
}

function createAudioStream(url) {
  const proc = spawn(YTDLP_BIN, [url, '-f', 'bestaudio/best', '--no-playlist', '-o', '-', ...baseArgs()]);
  proc.stderr.on('data', (d) => { const msg = d.toString().trim(); if (msg) console.error('[yt-dlp]', msg); });
  proc.on('error', (e) => console.error('[yt-dlp] spawn error:', e.message));
  return proc.stdout;
}

module.exports = { searchYoutube, getVideoInfo, createAudioStream };

import { spawn } from 'node:child_process';
import { rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import ffmpegBinary from 'ffmpeg-static';
import ffprobeBinary from 'ffprobe-static';

export const ffmpegPath = process.env.FFMPEG_PATH || ffmpegBinary;
export const ffprobePath = process.env.FFPROBE_PATH || ffprobeBinary.path;
const formats = 'mov,matroska,webm,avi,mpeg,mpegvideo,asf,mpegts';

export function originalPath(config, m) {
  return path.join(config.originals, `${m.id}${m.extension}`);
}

function run(binary, args, { onProgress, signal, timeout = 0 } = {}) {
  return new Promise((resolve, reject) => {
    if (!binary) return reject(new Error('PROCESS_UNAVAILABLE'));
    const child = spawn(binary, args, { shell: false, windowsHide: true, signal,
      stdio: ['ignore', 'pipe', 'ignore'] });
    let output = '', buffer = '';
    let timer;
    if (timeout) timer = setTimeout(() => child.kill('SIGKILL'), timeout);
    child.stdout.on('data', chunk => {
      if (onProgress) {
        buffer += chunk.toString();
        const lines = buffer.split('\n'); buffer = lines.pop() || '';
        for (const line of lines) if (line.startsWith('out_time_us=')) onProgress(Number(line.slice(12)) / 1e6);
      } else {
        output += chunk.toString();
        if (output.length > 1024 * 1024) child.kill('SIGKILL');
      }
    });
    child.once('error', () => { clearTimeout(timer); reject(new Error('PROCESS_FAILED')); });
    child.once('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve(output); else reject(new Error('PROCESS_FAILED'));
    });
  });
}

export async function probe(file) {
  const output = await run(ffprobePath, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-format_whitelist', formats,
    '-show_entries', 'format=duration,format_name:stream=codec_type,codec_name,width,height,duration,pix_fmt',
    '-of', 'json', file], { timeout: 60_000 });
  const info = JSON.parse(output);
  const video = info.streams?.find(s => s.codec_type === 'video');
  const audios = info.streams?.filter(s => s.codec_type === 'audio') || [];
  if (!video || !video.width || !video.height) throw new Error('INVALID_VIDEO');
  const duration = Number(info.format?.duration || video.duration || 0);
  return { duration: Number.isFinite(duration) ? Math.max(0, duration) : 0,
    width: video.width, height: video.height, videoCodec: video.codec_name || '',
    audioCodec: audios.map(a => a.codec_name).join(','), pixelFormat: video.pix_fmt || '' };
}

export function createMediaQueue(config, store) {
  const pending = new Set();
  let running = false, stopped = false, controller;
  const waiter = [];

  async function prepare(id) {
    const m = store.get(id);
    if (!m || m.status !== 'processing') return;
    const source = originalPath(config, m);
    const destination = path.join(config.prepared, `${id}.mp4`);
    const partial = path.join(config.scratch, `${id}.mp4`);
    controller = new AbortController();
    const signal = controller.signal;
    try {
      await stat(source);
      // H.264 + AAC in MP4 is broadly playable on browsers and Android TV.
      const compatibleH264 = m.videoCodec === 'h264' && m.pixelFormat === 'yuv420p';
      const direct = ['.mp4', '.m4v'].includes(m.extension) && compatibleH264
        && (!m.audioCodec || m.audioCodec.split(',').every(c => c === 'aac' || c === 'mp3'));
      let playable = 'original';
      if (!direct) {
        let lastProgress = 0;
        const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
          '-protocol_whitelist', 'file,pipe', '-format_whitelist', formats, '-i', source, '-map', '0:v:0', '-map', '0:a:0?',
          '-sn', '-dn'];
        if (compatibleH264) args.push('-c:v', 'copy');
        else args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
          '-pix_fmt', 'yuv420p', '-threads', '2', '-vf', "scale=w='min(1920,iw)':h=-2:force_divisible_by=2");
        args.push('-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-progress', 'pipe:1', partial);
        await run(ffmpegPath, args, { signal, onProgress(seconds) {
          const progress = Math.min(97, Math.floor(seconds / Math.max(m.duration, 1) * 97));
          if (progress > lastProgress) { store.state(id, { progress }); lastProgress = progress; }
        } });
        if (stopped) return;
        await rename(partial, destination);
        playable = 'prepared';
      }
      let poster = false;
      try {
        await run(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
          '-protocol_whitelist', 'file,pipe', '-format_whitelist', formats, '-ss', String(Math.min(m.duration * 0.2, 30)),
          '-i', source, '-frames:v', '1', '-vf', 'scale=720:-2', '-q:v', '3',
          path.join(config.posters, `${id}.jpg`)], { signal, timeout: 30_000 });
        poster = true;
      } catch { /* A missing thumbnail must not prevent playback. */ }
      if (!stopped) store.state(id, { status: 'ready', progress: 100, error: null, playable, poster });
    } catch {
      await rm(partial, { force: true }).catch(() => {});
      if (!stopped) store.state(id, { status: 'error', progress: 0,
        error: 'No pudimos preparar este video. Verifica el archivo y vuelve a intentar.' });
    } finally { controller = undefined; }
  }

  async function drain() {
    if (running || stopped) return;
    running = true;
    while (pending.size && !stopped) {
      const id = pending.values().next().value;
      pending.delete(id);
      await prepare(id);
    }
    running = false;
    if (!stopped) waiter.splice(0).forEach(resolve => resolve());
  }
  return {
    enqueue(id) { if (!stopped) { pending.add(id); void drain(); } },
    idle() { return running ? new Promise(resolve => waiter.push(resolve)) : Promise.resolve(); },
    async close() {
      stopped = true; pending.clear(); controller?.abort();
      while (running) await new Promise(resolve => setTimeout(resolve, 20));
      waiter.splice(0).forEach(resolve => resolve());
    },
  };
}

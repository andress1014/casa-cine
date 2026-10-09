import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { run, ffmpegPath, originalPath } from './media.mjs';

export const subtitleLimit = 5 * 1024 ** 2;
const textCodecs = new Set(['subrip','srt','webvtt','ass','ssa','mov_text','text']);
const formats = 'mov,matroska,webm,avi,mpeg,mpegvideo,asf,mpegts';
const language = value => /^[a-z]{2,3}(-[a-zA-Z]{2})?$/.test(value || '') ? value : 'und';
const label = value => String(value || '').replace(/[\x00-\x1f]/g,'').slice(0,80);
export const subtitlePath = (config, mediaId, id) => path.join(config.subtitles,mediaId,`${id}.vtt`);

export async function convertSubtitle(source, extension, destination, signal) {
  const input = await readFile(source);
  if (!input.length || input.length > subtitleLimit) throw new Error('INVALID_SUBTITLE');
  new TextDecoder('utf-8',{ fatal: true }).decode(input);
  const partial = `${destination}.partial.vtt`;
  try {
    await run(ffmpegPath,['-hide_banner','-loglevel','error','-nostdin','-y','-protocol_whitelist','file,pipe',
      '-format_whitelist',extension === '.srt' ? 'srt' : 'webvtt','-i',source,'-map','0:s:0','-c:s','webvtt',partial],{ signal,timeout:30_000 });
    const output = await readFile(partial);
    if (output.length > subtitleLimit || !output.toString('utf8').startsWith('WEBVTT') || !output.includes(Buffer.from('-->'))) throw new Error('INVALID_SUBTITLE');
    await rename(partial,destination);
  } finally { await rm(partial,{ force: true }); }
}

export async function prepareExtras(config, store, media, info, signal) {
  const source = originalPath(config,media), image = path.join(config.scratch,`${media.id}-poster.jpg`);
  const destination = path.join(config.posters,`${media.id}.jpg`);
  const base = ['-hide_banner','-loglevel','error','-nostdin','-y','-protocol_whitelist','file,pipe','-format_whitelist',formats];
  const imageArgs = ['-frames:v','1','-vf','scale=720:1080:force_original_aspect_ratio=decrease','-q:v','3'];
  let poster = Boolean(media.poster), posterSource = media.posterSource || null;
  const covers = info.streams.filter(s => s.codec_type === 'video' && s.disposition?.attached_pic);
  const attachments = info.streams.filter(s => s.codec_type === 'attachment' && /^(image\/jpeg|image\/png)$/.test(s.tags?.mimetype || '') && s.extradata_size <= subtitleLimit)
    .sort((a,b) => Number(/cover|folder/i.test(b.tags?.filename || '')) - Number(/cover|folder/i.test(a.tags?.filename || '')));
  let gotCover = false;
  for (const cover of [...covers,...attachments].slice(0,4)) {
    const attached = path.join(config.scratch,`${media.id}-cover.${cover.tags?.mimetype === 'image/png' ? 'png' : 'jpg'}`);
    try {
      if (cover.codec_type === 'video') await run(ffmpegPath,[...base,'-i',source,'-map',`0:${cover.index}`,...imageArgs,image],{ signal,timeout:30_000 });
      else {
        await run(ffmpegPath,[...base,`-dump_attachment:${cover.index}`,attached,'-i',source,'-map',`0:${info.videoIndex}`,'-frames:v','0','-f','null','-'],{ signal,timeout:30_000 });
        if ((await stat(attached)).size > subtitleLimit) throw new Error('IMAGE_TOO_LARGE');
        await run(ffmpegPath,['-hide_banner','-loglevel','error','-nostdin','-y','-protocol_whitelist','file,pipe','-format_whitelist','image2,png_pipe,jpeg_pipe','-i',attached,...imageArgs,image],{ signal,timeout:30_000 });
      }
      await rename(image,destination); poster = true; posterSource = 'embedded'; gotCover = true; break;
    } catch { /* Invalid embedded artwork falls back to a video frame. */ }
    finally { await rm(attached,{ force: true }); }
  }
  if (!gotCover) {
    try {
      await run(ffmpegPath,[...base,'-ss',String(Math.min(info.duration * 0.2,30)),'-i',source,'-map',`0:${info.videoIndex}`,...imageArgs,image],{ signal,timeout:30_000 });
      await rename(image,destination); poster = true; posterSource = 'frame';
    } catch { /* Playback does not depend on artwork. */ }
  }
  await rm(image,{ force: true });
  const tracks = JSON.parse(store.get(media.id)?.subtitleTracks || '[]').filter(t => t.source === 'external'), warnings = [];
  const oldEmbedded = JSON.parse(media.subtitleTracks || '[]').filter(t => t.source === 'embedded');
  await mkdir(path.join(config.subtitles,media.id),{ recursive: true });
  const streams = info.streams.filter(s => s.codec_type === 'subtitle');
  if (streams.length > 12) warnings.push('Se procesan hasta 12 pistas de subtítulos por video.');
  for (const stream of streams.slice(0,12)) {
    if (!textCodecs.has(stream.codec_name)) { warnings.push(`${label(stream.tags?.title || stream.codec_name)}: subtítulos de imagen no disponibles; añade SRT o VTT.`); continue; }
    const previous = oldEmbedded.find(t => t.streamIndex === stream.index), id = previous?.id || randomUUID();
    const output = subtitlePath(config,media.id,id), partial = `${output}.partial.vtt`;
    try {
      await run(ffmpegPath,[...base,'-i',source,'-map',`0:${stream.index}`,'-c:s','webvtt',partial],{ signal,timeout:60_000 });
      const content = await readFile(partial);
      if (content.length > subtitleLimit || !content.toString('utf8').startsWith('WEBVTT')) throw new Error('INVALID_SUBTITLE');
      await rename(partial,output);
      tracks.push({ id, language: language(stream.tags?.language), label: label(stream.tags?.title) || `Subtítulos ${language(stream.tags?.language)}`, forced: Boolean(stream.disposition?.forced), source: 'embedded', streamIndex: stream.index });
    } catch { warnings.push('No pudimos extraer pista de subtítulos. Puedes añadir SRT o VTT.'); }
    finally { await rm(partial,{ force: true }); }
  }
  if (store.get(media.id)) { store.extras(media.id,tracks,warnings,posterSource); store.state(media.id,{ poster }); }
  return poster;
}

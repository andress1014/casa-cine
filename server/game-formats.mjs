import { open, readFile } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import path from 'node:path';

export const gameSystems = [
  { id: 'psx', name: 'PlayStation 1', core: 'pcsx_rearmed', extensions: ['.chd','.pbp','.zip'], maxBytes: 1024 ** 3 },
  { id: 'snes', name: 'Super Nintendo', core: 'snes9x', extensions: ['.sfc','.smc','.zip'], maxBytes: 16 * 1024 ** 2 },
];
export const gameFail = (status,message) => Object.assign(new Error('GAMING_OPERATION_FAILED'), { publicStatus: status, publicMessage: message });
const invalid = () => gameFail(415,'Archivo no válido. PS1: CHD, PBP o ZIP con un CUE y todas sus pistas BIN. SNES: SFC/SMC o ZIP con una ROM.');

async function sample(filename,count = 4096,position = 0) {
  const h = await open(filename,'r');
  try { const b = Buffer.alloc(count); const { bytesRead } = await h.read(b,0,count,position); return b.subarray(0,bytesRead); }
  finally { await h.close(); }
}

// Read metadata and small CUE files only. Never extract uploaded archives onto server disk.
async function inspectZip(filename,size,system) {
  const tailSize = Math.min(size,65557), tail = await sample(filename,tailSize,size-tailSize);
  let at = -1;
  for (let i = tail.length-22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === 0x06054b50 && i+22+tail.readUInt16LE(i+20) === tail.length) { at = i; break; }
  }
  if (at < 0 || tail.readUInt16LE(at+4) || tail.readUInt16LE(at+6)) throw invalid();
  const count = tail.readUInt16LE(at+10), centralSize = tail.readUInt32LE(at+12), offset = tail.readUInt32LE(at+16);
  if (!count || count > 256 || count !== tail.readUInt16LE(at+8) || centralSize > 128*1024 || offset+centralSize !== size-tailSize+at) throw invalid();
  const central = await sample(filename,centralSize,offset), entries = []; let cursor = 0, expanded = 0;
  for (let i = 0; i < count; i++) {
    if (cursor+46 > central.length || central.readUInt32LE(cursor) !== 0x02014b50) throw invalid();
    const nameLength = central.readUInt16LE(cursor+28), extra = central.readUInt16LE(cursor+30), comment = central.readUInt16LE(cursor+32);
    const end = cursor+46+nameLength+extra+comment;
    if (end > central.length) throw invalid();
    const name = central.subarray(cursor+46,cursor+46+nameLength).toString('utf8');
    const flags = central.readUInt16LE(cursor+8), method = central.readUInt16LE(cursor+10), compressed = central.readUInt32LE(cursor+20);
    const length = central.readUInt32LE(cursor+24), local = central.readUInt32LE(cursor+42), mode = central.readUInt32LE(cursor+38) >>> 16;
    if (!name || name.length > 255 || /[\x00-\x1f\\/:]/.test(name) || name === '.' || name === '..'
      || flags & 65 || ![0,8].includes(method) || (mode & 0xf000) === 0xa000 || local+30+compressed > offset
      || !length || compressed === 0xffffffff || length === 0xffffffff || local === 0xffffffff
      || entries.some(e => e.name.toLowerCase() === name.toLowerCase())) throw invalid();
    expanded += length;
    if (expanded > (system === 'psx' ? 1500*1024**2 : 16*1024**2)) throw gameFail(413,'ZIP descomprimido demasiado grande para navegador.');
    const header = await sample(filename,30,local);
    if (header.length !== 30 || header.readUInt32LE(0) !== 0x04034b50 || header.readUInt16LE(6) !== flags || header.readUInt16LE(8) !== method) throw invalid();
    const localNameLength = header.readUInt16LE(26), dataOffset = local+30+localNameLength+header.readUInt16LE(28);
    const localName = await sample(filename,localNameLength,local+30);
    if (localName.toString('utf8') !== name || dataOffset+compressed > offset) throw invalid();
    entries.push({ name, extension: path.extname(name).toLowerCase(), compressed, length, method, dataOffset }); cursor = end;
  }
  if (cursor !== central.length) throw invalid();
  const getSmall = async e => {
    if (e.length > 65536 || e.compressed > 65536) throw invalid();
    const b = await sample(filename,e.compressed,e.dataOffset);
    const data = e.method === 8 ? inflateRawSync(b,{ maxOutputLength: 65536 }) : b;
    if (data.length !== e.length) throw invalid(); return data;
  };
  if (system === 'snes') {
    if (entries.length !== 1 || !['.sfc','.smc'].includes(entries[0].extension) || entries[0].length < 32768) throw invalid();
  } else {
    const cues = entries.filter(e => e.extension === '.cue'), bins = entries.filter(e => e.extension === '.bin');
    if (cues.length !== 1 || !bins.length || entries.some(e => !['.cue','.bin','.sbi'].includes(e.extension))) throw invalid();
    const cue = (await getSmall(cues[0])).toString('utf8').replace(/^\uFEFF/,'');
    const refs = [...cue.matchAll(/^\s*FILE\s+(?:"([^"]+)"|(\S+))\s+BINARY\s*$/gim)].map(m => m[1] || m[2]);
    if (!refs.length || !/\bTRACK\s+\d+\s+(MODE[12]\/\d+|AUDIO)/i.test(cue) || refs.some(n => !bins.some(e => e.name === n)) || bins.some(e => !refs.includes(e.name))) throw invalid();
  }
}

export async function validateGame(file,system) {
  const spec = gameSystems.find(s => s.id === system), extension = path.extname(file.originalname).toLowerCase();
  if (!spec || !spec.extensions.includes(extension) || !file.size) throw invalid();
  if (file.size > spec.maxBytes) throw gameFail(413,`${spec.name}: archivo supera límite de ${spec.id === 'psx' ? '1 GB' : '16 MB'}.`);
  const b = await sample(file.path);
  if (b.subarray(0,2).toString() === 'MZ' || b.subarray(0,4).equals(Buffer.from([127,69,76,70]))) throw invalid();
  if (extension === '.zip') {
    try { await inspectZip(file.path,file.size,system); } catch (e) { if (e.publicStatus) throw e; throw invalid(); }
  } else if (extension === '.chd') {
    if (b.subarray(0,8).toString() !== 'MComprHD' || b.length < 124 || b.readUInt32BE(12) !== 5 || b.readUInt32BE(8) !== 124) throw invalid();
    const logical = b.readBigUInt64BE(32);
    if (!logical || logical > BigInt(1500*1024**2)) throw gameFail(413,'CHD expandido supera límite de 1500 MB.');
  } else if (extension === '.pbp') {
    if (b.length < 40 || !b.subarray(0,4).equals(Buffer.from([0,80,66,80]))) throw invalid();
    const start = b.readUInt32LE(32);
    if (start < 40 || start+12 > file.size) throw invalid();
    const magic = (await sample(file.path,12,start)).toString();
    if (!magic.startsWith('PSISOIMG') && !magic.startsWith('PSTITLEIMG')) throw invalid();
  } else if (file.size < 32768 || ![0,512].includes(file.size % 1024)) throw invalid();
  return extension;
}

const biosHashes = {
  '8dd7d5296a650fac7319bce665a6a53c': ['jp','scph5500.bin'],
  '490f666e1afb15b7362b406ed1cea246': ['us','scph5501.bin'],
  '32736f17079d0b2b7024407c39bd3050': ['eu','scph5502.bin'],
  'c53ca5908936d412331790f4426c6c33': ['us','PSXONPSP660.bin'],
  '6e3735ff4c7dc899ee98981385f6f3d0': ['us','scph101.bin'],
  '1e68c231d0896b7eadcad1d7d8e76129': ['us','scph7001.bin'],
  '924e392ed05558ffdb115408c263dccf': ['us','scph1001.bin'],
};
export async function validateBios(filename) {
  const { createHash } = await import('node:crypto'); const data = await readFile(filename);
  const md5 = createHash('md5').update(data).digest('hex'), match = biosHashes[md5];
  if (!match) throw gameFail(415,'BIOS PS1 no reconocida. Usa copia válida de tu consola (SCPH5500, 5501, 5502, 1001, 7001, 101 o PSXONPSP660).');
  return { region: match[0], filename: match[1], md5 };
}

// Filename hints shared by automatic lookup and the manual search form.
export function movieTitleHint(value) {
  let title = String(value || '').replace(/\.(mp4|m4v|mov|webm|mkv|avi|mpeg|mpg|wmv|ts)$/i,'')
    .replace(/[._]/g,' ').replace(/\s+/g,' ').trim();
  const technical = /\b(?:2160p|1080p|720p|480p|4k|bluray|blu-ray|brrip|bdrip|webrip|web[- ]?dl|hdrip|hdtv|h[ .]?26[45]|x26[45]|hevc|dual[- ]?(?:lat|audio)|cinecalidad)\b/i;
  const marker = title.search(technical);
  if (marker >= 0) title = title.slice(0,marker).trim();
  let year;
  const match = title.match(/(?:\s|[([\-])((?:19|20)\d{2})[)\]]?\s*[- ]*$/);
  if (match && Number(match[1]) <= new Date().getFullYear()+2 && /[\p{L}]/u.test(title.slice(0,match.index))) {
    year = match[1]; title = title.slice(0,match.index);
  }
  title = title.replace(/\bS\d{1,2}(?:E\d{1,3})?\b.*$/i,'').replace(/[- ]+$/,'').trim().slice(0,160);
  return { title,year };
}

export function normalizedMovieTitle(value) {
  return String(value || '').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
}

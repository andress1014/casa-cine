export type Section = 'home' | 'cinema' | 'files' | 'gaming';
export const sectionPaths: Record<Section,string> = { home: '/', cinema: '/cine', files: '/archivos', gaming: '/gaming' };
export function currentSection(): Section {
  return (Object.entries(sectionPaths).find(([,path]) => path === window.location.pathname.replace(/\/$/, '') || path === window.location.pathname)?.[0] || 'home') as Section;
}
export type Folder = { id: string; name: string; parentId: string | null; createdAt: string };
export type HomeFile = { id: string; title: string; originalName: string; extension: string; kind: 'document' | 'image' | 'archive' | 'text'; size: number;
  addedBy: string; createdAt: string; sha256: string; folderId: string | null; downloadUrl: string };
export type Hub = { name: string; version: string; cinema: { count: number; ready: number; bytes: number };
  files: { count: number; bytes: number; folders: number }; gaming: { count: number; bytes: number }; recentFiles: HomeFile[];
  storage: { totalBytes: number; availableBytes: number; usedBytes: number } };
export function folderPath(id: string | null, folders: Folder[]): string {
  const names: string[] = []; let current = id;
  for (let i = 0; current && i < 12; i++) { const folder = folders.find(f => f.id === current); if (!folder) break; names.unshift(folder.name); current = folder.parentId; }
  return names.length ? names.join(' / ') : 'Mis archivos';
}

export type InstalledExtension = {
  id: string;
  name: string;
  displayName: string;
  description: string;
  version: string;
  publisher: string;
  installedAt: number;
  vsixPath?: string;
  installDir?: string;
  main?: string;
  enabled?: boolean;
};

const KEY = 'gopilot.extensions.installed';

export function loadInstalledExtensions(): InstalledExtension[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x) => ({
        id: typeof x?.id === 'string' ? x.id : '',
        name: typeof x?.name === 'string' ? x.name : '',
        displayName: typeof x?.displayName === 'string' ? x.displayName : '',
        description: typeof x?.description === 'string' ? x.description : '',
        version: typeof x?.version === 'string' ? x.version : '',
        publisher: typeof x?.publisher === 'string' ? x.publisher : '',
        installedAt: typeof x?.installedAt === 'number' ? x.installedAt : 0,
        vsixPath: typeof x?.vsixPath === 'string' ? x.vsixPath : undefined,
        installDir: typeof x?.installDir === 'string' ? x.installDir : undefined,
        main: typeof x?.main === 'string' ? x.main : undefined,
        enabled: typeof x?.enabled === 'boolean' ? x.enabled : true,
      }))
      .filter((x) => x.id && x.name);
  } catch {
    return [];
  }
}

export function saveInstalledExtensions(list: InstalledExtension[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function upsertInstalledExtension(ext: InstalledExtension) {
  const prev = loadInstalledExtensions();
  const idx = prev.findIndex((x) => x.id === ext.id);
  const next = [...prev];
  if (idx >= 0) next[idx] = ext;
  else next.unshift(ext);
  saveInstalledExtensions(next);
  return next;
}

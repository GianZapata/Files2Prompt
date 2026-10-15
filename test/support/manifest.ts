import fs from 'fs';
import path from 'path';

export interface ManifestCommand {
  command: string;
  title: string;
  category?: string;
  icon?: string | { light?: string };
}

export interface ManifestMenuEntry {
  command?: string;
  submenu?: string;
  group?: string;
  when?: string;
}

export interface ManifestSubmenu {
  id: string;
  icon?: string;
}

export interface ManifestKeybinding {
  command: string;
  when?: string;
}

export interface ManifestContributions {
  commands: ManifestCommand[];
  submenus?: ManifestSubmenu[];
  keybindings: ManifestKeybinding[];
  menus: Record<string, ManifestMenuEntry[]>;
}

export interface Manifest {
  extensionKind?: string[];
  contributes: ManifestContributions;
}

const repoRoot = path.join(__dirname, '../../..');

export const readJson = <T>(relativePath: string) =>
  JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as T;

export const readManifest = () => readJson<Manifest>('package.json');

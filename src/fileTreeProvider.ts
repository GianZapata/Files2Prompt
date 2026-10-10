import type { DiscoveredRepository } from './gitRepos';
import { repositoryLabel } from './gitRepos';
import type { ForcedRoot } from './ignore/ignoreReason';

import * as fs from 'fs';
import * as path from 'path';

import * as vscode from 'vscode';

import { createIgnoreResolver } from './ignore/ignoreResolver';
import {
  filesSelectedByFolder,
  filesSelectedByFolderAsync,
  omittedFoldersForSelection
} from './ignore/selectFiles';
import { parentCheckbox, watcherShouldRefresh } from './parentCheck';

export class FileTreeProvider
  implements vscode.TreeDataProvider<FileItem>, vscode.Disposable
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    FileItem | undefined | null | void
  > = new vscode.EventEmitter<FileItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    FileItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private workspaceRoot: string;
  private checkedItems: Map<string, vscode.TreeItemCheckboxState> = new Map();
  private resolver = createIgnoreResolver({ workspaceRoot: '' });
  private forcedRoots: ForcedRoot[] = [];
  private repositories: DiscoveredRepository[] = [];
  private ignoredExtensions: Set<string> = new Set();
  private excludePatterns: string[] = [];
  private watcher: vscode.FileSystemWatcher;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private disposables: vscode.Disposable[] = [];

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.reloadRules();

    // Create a file system watcher
    this.watcher = vscode.workspace.createFileSystemWatcher('**/*');

    this.disposables.push(
      this.watcher,
      this.watcher.onDidCreate(uri => this.onFileSystemChanged(uri)),
      this.watcher.onDidDelete(uri => this.onFileSystemChanged(uri)),
      this.watcher.onDidChange(uri => this.onFileSystemChanged(uri)),
      vscode.workspace.onDidChangeConfiguration(event => {
        if (
          event.affectsConfiguration('files2prompt.ignoredExtensions') ||
          event.affectsConfiguration('files2prompt.exclude') ||
          event.affectsConfiguration('files2prompt.maxFileBytes')
        ) {
          this.reloadRules();
          this.refresh();
        }
      })
    );
  }

  public dispose(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private onFileSystemChanged(uri: vscode.Uri): void {
    const relativePath = path.relative(this.workspaceRoot, uri.fsPath);

    if (
      !watcherShouldRefresh(relativePath, directory =>
        this.isExcluded(directory, 'directory')
      )
    ) {
      return;
    }

    if (
      uri.fsPath.endsWith('.gitignore') ||
      uri.fsPath.endsWith('.promptignore')
    ) {
      this.resolver.invalidate(uri.fsPath);
    }

    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    this.refreshTimer = setTimeout(() => this.refresh(), 200);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  clearChecks(): void {
    this.forcedRoots = [];
    this.reloadRules();
    this.checkedItems.clear();
    this.refresh();
  }

  setRepositories(repositories: DiscoveredRepository[]): void {
    this.repositories = repositories;
    this.refresh();
  }

  repositoryAt(relativePath: string): DiscoveredRepository | undefined {
    const normalized = relativePath.replace(/\\/g, '/').replace(/\/$/, '');

    return this.repositories.find(repo => repo.relativePath === normalized);
  }

  explain(relativePath: string, kind: 'file' | 'directory') {
    return this.resolver.explain(relativePath, kind);
  }

  forcedRootList(): ForcedRoot[] {
    return this.forcedRoots.map(root => ({ ...root }));
  }

  addForcedRoot(root: ForcedRoot): void {
    const relativePath = root.relativePath
      .replace(/\\/g, '/')
      .replace(/\/$/, '');

    this.forcedRoots = [
      ...this.forcedRoots.filter(item => item.relativePath !== relativePath),
      { ...root, relativePath }
    ];
    this.reloadRules();
  }

  removeForcedRoot(relativePath: string): void {
    const normalized = relativePath.replace(/\\/g, '/').replace(/\/$/, '');

    this.forcedRoots = this.forcedRoots.filter(
      root => root.relativePath !== normalized
    );
    this.reloadRules();
  }

  setForcedRoots(roots: ForcedRoot[]): void {
    this.forcedRoots = roots.map(root => ({
      ...root,
      relativePath: root.relativePath.replace(/\\/g, '/').replace(/\/$/, '')
    }));
    this.reloadRules();
  }

  forcedRootFor(relativePath: string): ForcedRoot | undefined {
    const normalized = relativePath.replace(/\\/g, '/');

    return this.forcedRoots
      .filter(
        root =>
          normalized === root.relativePath ||
          normalized.startsWith(`${root.relativePath}/`)
      )
      .sort(
        (left, right) => right.relativePath.length - left.relativePath.length
      )[0];
  }

  async countIfForced(folderPath: string, root: ForcedRoot): Promise<number> {
    const preview = createIgnoreResolver({
      workspaceRoot: this.workspaceRoot,
      excludePatterns: [...this.excludePatterns],
      ignoredExtensions: [...this.ignoredExtensions],
      forcedRoots: [...this.forcedRoots, root]
    });
    const result = await filesSelectedByFolderAsync(
      this.workspaceRoot,
      folderPath,
      preview.resolve
    );

    return result.files.length;
  }

  async selectFolder(
    folderPath: string,
    options: { isCancelled?: () => boolean } = {}
  ): Promise<'applied' | 'cancelled'> {
    const snapshot = new Map(this.checkedItems);
    const result = await filesSelectedByFolderAsync(
      this.workspaceRoot,
      folderPath,
      this.resolver.resolve,
      options
    );

    if (result.cancelled) {
      this.checkedItems = snapshot;
      this.refresh();

      return 'cancelled';
    }

    this.checkedItems.set(folderPath, vscode.TreeItemCheckboxState.Checked);

    for (const filePath of result.files) {
      this.checkedItems.set(filePath, vscode.TreeItemCheckboxState.Checked);
      let parent = path.dirname(filePath);

      while (parent.startsWith(folderPath)) {
        this.checkedItems.set(parent, vscode.TreeItemCheckboxState.Checked);

        if (parent === folderPath) {
          break;
        }

        parent = path.dirname(parent);
      }
    }

    let dirPath = path.dirname(folderPath);

    while (dirPath.startsWith(this.workspaceRoot)) {
      await this.updateParentState(dirPath);
      dirPath = path.dirname(dirPath);
    }
    this.refresh();

    return 'applied';
  }

  async selectionStats(): Promise<{ count: number; bytes: number }> {
    const files = this.getCheckedFiles();
    let bytes = 0;

    for (const filePath of files) {
      try {
        bytes += (await fs.promises.stat(filePath)).size;
      } catch {
        continue;
      }
    }

    return { count: files.length, bytes };
  }

  getTreeItem(element: FileItem): vscode.TreeItem {
    const key = element.resourceUri.fsPath;

    if (element.isDirectory && element.isGitIgnored) {
      element.checkboxState = undefined;

      return element;
    }

    const checkboxState =
      this.checkedItems.get(key) ?? vscode.TreeItemCheckboxState.Unchecked;

    element.checkboxState = checkboxState;

    return element;
  }

  async getChildren(element?: FileItem): Promise<FileItem[]> {
    if (!this.workspaceRoot) {
      vscode.window.showInformationMessage('No workspace folder found.');

      return [];
    }

    if (!element) {
      return [
        this.withRepositoryLabel(
          '',
          new FileItem(
            path.basename(this.workspaceRoot),
            vscode.Uri.file(this.workspaceRoot),
            vscode.TreeItemCollapsibleState.Expanded,
            true,
            this.checkedItems.get(this.workspaceRoot) ??
              vscode.TreeItemCheckboxState.Unchecked,
            false,
            false
          )
        )
      ];
    }

    const dirPath = element.resourceUri.fsPath;

    return this.getFilesAndDirectories(dirPath);
  }

  private async getFilesAndDirectories(dirPath: string): Promise<FileItem[]> {
    const items: FileItem[] = [];
    const dirEntries = await fs.promises.readdir(dirPath, {
      withFileTypes: true
    });

    // Sort directories above files and alphabetically
    dirEntries.sort((a, b) => {
      const aIsDir = a.isDirectory() || a.isSymbolicLink();
      const bIsDir = b.isDirectory() || b.isSymbolicLink();

      if (aIsDir && !bIsDir) {
        return -1;
      }
      if (!aIsDir && bIsDir) {
        return 1;
      }

      return a.name.localeCompare(b.name);
    });

    for (const entry of dirEntries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(this.workspaceRoot, fullPath);
      const uri = vscode.Uri.file(fullPath);

      let isDirectory = entry.isDirectory();
      let isSymbolicLink = entry.isSymbolicLink();
      let isBrokenLink = false;

      if (isSymbolicLink) {
        try {
          const stats = await fs.promises.stat(fullPath);

          isDirectory = stats.isDirectory();
        } catch {
          // The symlink is broken
          isBrokenLink = true;
        }
      }

      // Skip broken symlinks
      if (isBrokenLink) {
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase().replace('.', '');
      const isIgnoredExtension = this.ignoredExtensions.has(extension);
      const isGitIgnored = this.isExcluded(
        relativePath,
        isDirectory ? 'directory' : 'file'
      );

      const key = fullPath;
      const parentChecked =
        this.checkedItems.get(path.dirname(fullPath)) ===
        vscode.TreeItemCheckboxState.Checked;
      const allowed = !isGitIgnored && !isIgnoredExtension;
      let checkboxState = this.checkedItems.get(key);

      if (isDirectory && isGitIgnored) {
        checkboxState = undefined;
      } else if (parentChecked && allowed) {
        checkboxState = vscode.TreeItemCheckboxState.Checked;
        this.checkedItems.set(fullPath, checkboxState);
      } else if (checkboxState === undefined) {
        checkboxState = vscode.TreeItemCheckboxState.Unchecked;
      }

      const decision = this.resolver.resolve(
        relativePath,
        isDirectory ? 'directory' : 'file'
      );
      const item = new FileItem(
        entry.name,
        uri,
        isDirectory
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None,
        isDirectory,
        isDirectory && isGitIgnored ? undefined : checkboxState,
        isGitIgnored || isIgnoredExtension,
        isSymbolicLink
      );

      if (decision.manual) {
        item.description = vscode.l10n.t('ignored · included manually');
      }

      items.push(this.withRepositoryLabel(relativePath, item));
    }

    return items;
  }

  async updateCheckState(
    item: FileItem,
    state: vscode.TreeItemCheckboxState
  ): Promise<void> {
    const key = item.resourceUri.fsPath;

    this.checkedItems.set(key, state);

    if (item.isDirectory) {
      const selected = filesSelectedByFolder(
        this.workspaceRoot,
        key,
        this.resolver.resolve
      );

      for (const filePath of selected) {
        const nextState =
          state === vscode.TreeItemCheckboxState.Checked
            ? vscode.TreeItemCheckboxState.Checked
            : vscode.TreeItemCheckboxState.Unchecked;

        this.checkedItems.set(filePath, nextState);
        let parent = path.dirname(filePath);

        while (parent.startsWith(key)) {
          this.checkedItems.set(parent, nextState);
          if (parent === key) {
            break;
          }
          parent = path.dirname(parent);
        }
      }

      if (state !== vscode.TreeItemCheckboxState.Checked) {
        this.clearDescendantChecks(key);
      }
    }

    // Update parent directories' states
    let dirPath = path.dirname(key);

    while (dirPath.startsWith(this.workspaceRoot)) {
      await this.updateParentState(dirPath);
      dirPath = path.dirname(dirPath);
    }

    this.refresh();
  }

  private async updateParentState(dirPath: string): Promise<void> {
    const dirEntries = await fs.promises.readdir(dirPath, {
      withFileTypes: true
    });

    const visible: Array<{ excluded: boolean; checked: boolean }> = [];

    for (const entry of dirEntries) {
      const siblingPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(this.workspaceRoot, siblingPath);

      const extension = path.extname(entry.name).toLowerCase().replace('.', '');
      const isIgnoredExtension = this.ignoredExtensions.has(extension);

      if (
        this.isExcluded(
          relativePath,
          entry.isDirectory() ? 'directory' : 'file'
        ) ||
        isIgnoredExtension
      ) {
        visible.push({ excluded: true, checked: false });

        continue;
      }

      visible.push({
        excluded: false,
        checked:
          this.checkedItems.get(siblingPath) ===
          vscode.TreeItemCheckboxState.Checked
      });
    }

    this.checkedItems.set(
      dirPath,
      parentCheckbox(visible) === 'checked'
        ? vscode.TreeItemCheckboxState.Checked
        : vscode.TreeItemCheckboxState.Unchecked
    );
  }

  omittedFolders(): string[] {
    const directories = [...this.checkedItems.entries()]
      .filter(
        ([filePath, state]) =>
          state === vscode.TreeItemCheckboxState.Checked &&
          fs.existsSync(filePath) &&
          fs.lstatSync(filePath).isDirectory()
      )
      .map(([filePath]) => filePath);

    return omittedFoldersForSelection(
      this.workspaceRoot,
      directories,
      this.resolver.resolve
    );
  }

  resolvePath(relativePath: string, kind: 'file' | 'directory') {
    return this.resolver.resolve(relativePath, kind);
  }

  getCheckedFiles(): string[] {
    return Array.from(this.checkedItems.entries())
      .filter(
        ([filePath, state]) =>
          state === vscode.TreeItemCheckboxState.Checked &&
          fs.existsSync(filePath) &&
          fs.lstatSync(filePath).isFile() &&
          this.resolver.resolve(
            path.relative(this.workspaceRoot, filePath),
            'file'
          ).included
      )
      .map(([filePath]) => filePath);
  }

  public async setCheckedFiles(filePaths: string[]): Promise<void> {
    // Clear existing checks
    this.checkedItems.clear();

    // For each file in filePaths, set its checkboxState to Checked
    for (const filePath of filePaths) {
      if (!fs.existsSync(filePath) || !fs.lstatSync(filePath).isFile()) {
        continue;
      }

      const relativePath = path.relative(this.workspaceRoot, filePath);

      if (!this.resolver.resolve(relativePath, 'file').included) {
        continue;
      }

      this.checkedItems.set(filePath, vscode.TreeItemCheckboxState.Checked);
    }

    // Update parent directories' checkbox states
    for (const filePath of filePaths) {
      let dirPath = path.dirname(filePath);

      while (dirPath.startsWith(this.workspaceRoot)) {
        await this.updateParentState(dirPath);
        dirPath = path.dirname(dirPath);
      }
    }

    this.refresh();
  }

  private withRepositoryLabel(relativePath: string, item: FileItem): FileItem {
    const repo = this.repositoryAt(relativePath);

    if (!repo) {
      return item;
    }

    const label = repositoryLabel(repo);

    item.description = vscode.l10n.t(label.message, ...label.args);
    item.contextValue = 'repository';

    return item;
  }

  private isExcluded(
    relativePath: string,
    kind: 'file' | 'directory'
  ): boolean {
    return !this.resolver.resolve(relativePath, kind).included;
  }

  private clearDescendantChecks(dirPath: string): void {
    for (const key of [...this.checkedItems.keys()]) {
      if (key !== dirPath && key.startsWith(dirPath + path.sep)) {
        this.checkedItems.set(key, vscode.TreeItemCheckboxState.Unchecked);
      }
    }
  }

  private reloadRules(): void {
    const config = vscode.workspace.getConfiguration('files2prompt');
    const extensionsString = config.get<string>(
      'ignoredExtensions',
      'png,jpg,jpeg,gif,svg'
    );

    this.ignoredExtensions = new Set(
      extensionsString.split(',').map(ext => ext.trim().toLowerCase())
    );
    this.excludePatterns = config.get<string[]>('exclude', []);
    this.resolver = createIgnoreResolver({
      workspaceRoot: this.workspaceRoot,
      excludePatterns: this.excludePatterns,
      ignoredExtensions: [...this.ignoredExtensions],
      forcedRoots: this.forcedRoots
    });
  }
}

export class FileItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly resourceUri: vscode.Uri,
    public collapsibleState: vscode.TreeItemCollapsibleState,
    public isDirectory: boolean,
    public checkboxState: vscode.TreeItemCheckboxState | undefined,
    public isGitIgnored: boolean,
    public isSymbolicLink: boolean = false
  ) {
    super(label, collapsibleState);

    this.tooltip = this.resourceUri.fsPath;
    this.iconPath = new vscode.ThemeIcon(this.isDirectory ? 'folder' : 'file');
    this.checkboxState = checkboxState;
    this.contextValue = isDirectory ? 'folder' : 'file';
    if (isDirectory && isGitIgnored) {
      this.description = 'excluida';
    }

    if (this.isSymbolicLink) {
      // Optionally, you can adjust the icon or label to indicate a symlink
      this.description = this.description
        ? this.description + ' (symlink)'
        : '(symlink)';
    }
  }
}

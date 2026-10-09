import * as fs from 'fs';
import * as path from 'path';

import * as vscode from 'vscode';

import { createIgnoreResolver } from './ignore/ignoreResolver';
import { filesSelectedByFolder } from './ignore/selectFiles';

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
  private ignoredExtensions: Set<string> = new Set();
  private watcher: vscode.FileSystemWatcher;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.reloadRules();

    // Create a file system watcher
    this.watcher = vscode.workspace.createFileSystemWatcher('**/*');

    this.watcher.onDidCreate(uri => this.onFileSystemChanged(uri));
    this.watcher.onDidDelete(uri => this.onFileSystemChanged(uri));
    this.watcher.onDidChange(uri => this.onFileSystemChanged(uri));

    // Listen for configuration changes
    vscode.workspace.onDidChangeConfiguration(event => {
      if (
        event.affectsConfiguration('files2prompt.ignoredExtensions') ||
        event.affectsConfiguration('files2prompt.exclude') ||
        event.affectsConfiguration('files2prompt.maxFileBytes')
      ) {
        this.reloadRules();
        this.refresh();
      }
    });
  }

  public dispose(): void {
    this.watcher.dispose();
  }

  private onFileSystemChanged(uri: vscode.Uri): void {
    if (
      uri.fsPath.endsWith('.gitignore') ||
      uri.fsPath.endsWith('.promptignore')
    ) {
      this.reloadRules();
    }

    this.refresh();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  clearChecks(): void {
    this.checkedItems.clear();
    this.refresh();
  }

  getTreeItem(element: FileItem): vscode.TreeItem {
    const key = element.resourceUri.fsPath;
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
      const isGitIgnored = this.isGitIgnored(relativePath);

      const key = fullPath;
      let checkboxState = this.checkedItems.get(key);

      if (checkboxState === undefined) {
        const parentPath = path.dirname(fullPath);
        const parentCheckboxState = this.checkedItems.get(parentPath);

        if (
          parentCheckboxState === vscode.TreeItemCheckboxState.Checked &&
          !isGitIgnored &&
          !isIgnoredExtension
        ) {
          checkboxState = vscode.TreeItemCheckboxState.Checked;
          this.checkedItems.set(fullPath, checkboxState);
        } else {
          checkboxState = vscode.TreeItemCheckboxState.Unchecked;
        }
      }

      const item = new FileItem(
        entry.name,
        uri,
        isDirectory
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None,
        isDirectory,
        checkboxState,
        isGitIgnored || isIgnoredExtension,
        isSymbolicLink
      );

      items.push(item);
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
        this.checkedItems.set(
          filePath,
          state === vscode.TreeItemCheckboxState.Checked
            ? vscode.TreeItemCheckboxState.Checked
            : vscode.TreeItemCheckboxState.Unchecked
        );
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

    let allChecked = true;
    let hasNonIgnoredChild = false;

    for (const entry of dirEntries) {
      const siblingPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(this.workspaceRoot, siblingPath);

      const extension = path.extname(entry.name).toLowerCase().replace('.', '');
      const isIgnoredExtension = this.ignoredExtensions.has(extension);

      if (this.isGitIgnored(relativePath) || isIgnoredExtension) {
        continue; // Skip gitignored items and ignored extensions
      }

      hasNonIgnoredChild = true;

      const state =
        this.checkedItems.get(siblingPath) ??
        vscode.TreeItemCheckboxState.Unchecked;

      if (state !== vscode.TreeItemCheckboxState.Checked) {
        allChecked = false;
        break;
      }
    }

    if (hasNonIgnoredChild) {
      if (allChecked) {
        this.checkedItems.set(dirPath, vscode.TreeItemCheckboxState.Checked);
      } else {
        this.checkedItems.set(dirPath, vscode.TreeItemCheckboxState.Unchecked);
      }
    } else {
      // If no non-ignored children, set parent to unchecked
      this.checkedItems.set(dirPath, vscode.TreeItemCheckboxState.Unchecked);
    }
  }

  private async updateDirectoryCheckState(
    dirPath: string,
    state: vscode.TreeItemCheckboxState,
    parentIsGitIgnored: boolean
  ): Promise<void> {
    const dirEntries = await fs.promises.readdir(dirPath, {
      withFileTypes: true
    });

    for (const entry of dirEntries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(this.workspaceRoot, fullPath);
      const isGitIgnored = this.isGitIgnored(relativePath);

      const extension = path.extname(entry.name).toLowerCase().replace('.', '');
      const isIgnoredExtension = this.ignoredExtensions.has(extension);

      if (!parentIsGitIgnored && (isGitIgnored || isIgnoredExtension)) {
        // Skip gitignored items and ignored extensions when parent is not gitignored
        continue;
      }

      this.checkedItems.set(fullPath, state);

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

      if (isDirectory && !isBrokenLink) {
        await this.updateDirectoryCheckState(fullPath, state, isGitIgnored);
      }
    }
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

  private isGitIgnored(relativePath: string): boolean {
    return !this.resolver.resolve(relativePath, 'file').included;
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
    this.resolver = createIgnoreResolver({
      workspaceRoot: this.workspaceRoot,
      excludePatterns: config.get<string[]>('exclude', []),
      ignoredExtensions: [...this.ignoredExtensions]
    });
  }
}

export class FileItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly resourceUri: vscode.Uri,
    public collapsibleState: vscode.TreeItemCollapsibleState,
    public isDirectory: boolean,
    public checkboxState: vscode.TreeItemCheckboxState,
    public isGitIgnored: boolean,
    public isSymbolicLink: boolean = false
  ) {
    super(label, collapsibleState);

    this.tooltip = this.resourceUri.fsPath;
    this.iconPath = new vscode.ThemeIcon(this.isDirectory ? 'folder' : 'file');
    this.checkboxState = checkboxState;

    if (this.isSymbolicLink) {
      // Optionally, you can adjust the icon or label to indicate a symlink
      this.description = this.description
        ? this.description + ' (symlink)'
        : '(symlink)';
    }
  }
}

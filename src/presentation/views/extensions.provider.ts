import * as vscode from 'vscode';

import {
  extensionCounts,
  matchesExtension
} from '../../domain/services/extension-filter.service';

export interface ExtensionRowRecord {
  suffix: string;
  count: number;
}

export class ExtensionRowItem extends vscode.TreeItem {
  constructor(
    readonly suffix: string,
    count: number,
    checked: boolean
  ) {
    super(`${suffix} (${count})`, vscode.TreeItemCollapsibleState.None);
    this.description = String(count);
    this.contextValue = 'extensionRow';
    this.checkboxState = checked
      ? vscode.TreeItemCheckboxState.Checked
      : vscode.TreeItemCheckboxState.Unchecked;

    this.accessibilityInformation = {
      label: vscode.l10n.t('{0}, {1} files', suffix, count)
    };
  }
}

export class ExtensionsProvider implements vscode.TreeDataProvider<ExtensionRowItem> {
  private rows: ExtensionRowRecord[] = [];
  private selected = new Set<string>();
  private available: string[] = [];
  private readonly emitter = new vscode.EventEmitter<
    ExtensionRowItem | undefined
  >();

  readonly onDidChangeTreeData = this.emitter.event;

  setFiles = (available: string[], selected: string[]) => {
    this.available = available;
    this.selected = new Set(selected);
    this.rows = extensionCounts(available).map(([suffix, count]) => ({
      suffix,
      count
    }));

    this.emitter.fire(undefined);
  };

  availableFiles = () => [...this.available];

  selectedFiles = () => [...this.selected];

  refresh = () => {
    this.emitter.fire(undefined);
  };

  getTreeItem = (element: ExtensionRowItem) => element;

  getChildren = () =>
    this.rows.map(row => {
      const query = row.suffix === '(no extension)' ? '' : row.suffix;
      const matched = this.available.filter(file =>
        matchesExtension(file, query)
      );

      const checked =
        matched.length > 0 && matched.every(file => this.selected.has(file));

      return new ExtensionRowItem(row.suffix, row.count, checked);
    });
}

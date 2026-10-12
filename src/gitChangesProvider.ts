import * as vscode from 'vscode';

import type { DiscoveredRepository } from './gitRepos';
import { changeBadge, type PromptChange } from './selectChanges';
import {
  groupChangesByRepo,
  repoNodeLabel,
  type ChangeGroup
} from './sideViews';

export class GitChangeItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsible: vscode.TreeItemCollapsibleState,
    readonly kind: 'repo' | 'file',
    readonly repo: string,
    readonly change?: PromptChange,
    readonly group?: ChangeGroup
  ) {
    super(label, collapsible);
  }
}

export class GitChangesProvider implements vscode.TreeDataProvider<GitChangeItem> {
  private listed: PromptChange[] = [];
  private included = new Set<string>();
  private repos: DiscoveredRepository[] = [];
  private readonly emitter = new vscode.EventEmitter<
    GitChangeItem | undefined
  >();

  readonly onDidChangeTreeData = this.emitter.event;

  setListed(changes: PromptChange[]) {
    this.listed = changes;
    this.refresh();
  }

  listedChanges() {
    return this.listed.map(change => ({ ...change }));
  }

  setIncluded(changes: PromptChange[]) {
    this.included = new Set(
      changes.map(change => `${change.repo}\0${change.path}`)
    );
    this.refresh();
  }

  setRepositories(repos: DiscoveredRepository[]) {
    this.repos = repos;
    this.refresh();
  }

  replaceRepo(repo: string, changes: PromptChange[]) {
    this.listed = [
      ...this.listed.filter(change => change.repo !== repo),
      ...changes
    ];
    this.refresh();
  }

  refresh() {
    this.emitter.fire(undefined);
  }

  getTreeItem(element: GitChangeItem) {
    return element;
  }

  getChildren(element?: GitChangeItem) {
    if (element?.kind === 'file') {
      return [];
    }

    if (element?.kind === 'repo') {
      return (element.group?.changes ?? []).map(change =>
        this.fileItem(change)
      );
    }

    const groups = groupChangesByRepo(this.listed);
    const known = new Set(groups.map(group => group.repo));

    for (const repo of this.repos) {
      if (known.has(repo.relativePath)) {
        continue;
      }

      groups.push({
        repo: repo.relativePath,
        branch: repo.branch,
        scope: 'uncommitted',
        head: repo.branch,
        changes: []
      });
    }

    return groups.map(group => this.repoItem(group));
  }

  private repoItem(group: ChangeGroup) {
    const label = repoNodeLabel(group.repo, group.branch ?? group.head);
    const item = new GitChangeItem(
      label,
      vscode.TreeItemCollapsibleState.Expanded,
      'repo',
      group.repo,
      undefined,
      group
    );

    item.contextValue = 'gitRepo';
    item.description = group.scope;
    item.accessibilityInformation = {
      label: vscode.l10n.t(
        '{0}, scope {1}. Expand to review changed files.',
        label,
        group.scope
      )
    };

    return item;
  }

  private fileItem(change: PromptChange) {
    const badge = changeBadge(change.status) || change.status;
    const item = new GitChangeItem(
      change.path,
      vscode.TreeItemCollapsibleState.None,
      'file',
      change.repo,
      change
    );

    item.description = badge;
    item.contextValue = 'gitChangeFile';
    item.checkboxState = this.included.has(`${change.repo}\0${change.path}`)
      ? vscode.TreeItemCheckboxState.Checked
      : vscode.TreeItemCheckboxState.Unchecked;
    item.accessibilityInformation = {
      label: vscode.l10n.t('{0}, {1}', change.path, badge)
    };

    return item;
  }
}

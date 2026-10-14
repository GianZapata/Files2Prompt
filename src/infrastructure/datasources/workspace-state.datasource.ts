import type { StateDataSource } from '../../domain/datasources/state.datasource';

import * as vscode from 'vscode';

export class WorkspaceStateDataSource implements StateDataSource {
  constructor(private readonly memento: vscode.Memento) {}

  get = <T>(key: string, defaultValue?: T): T | undefined =>
    this.memento.get<T>(key, defaultValue as T);

  update = async <T>(key: string, value: T): Promise<void> =>
    this.memento.update(key, value);
}

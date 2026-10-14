export enum ChangeSelectionMode {
  Add = 'add',
  Replace = 'replace'
}

export type AnyChangeSelectionMode =
  ChangeSelectionMode | `${ChangeSelectionMode}`;

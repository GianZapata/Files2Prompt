export enum FolderSelectionOutcome {
  Applied = 'applied',
  Cancelled = 'cancelled'
}

export type AnyFolderSelectionOutcome =
  FolderSelectionOutcome | `${FolderSelectionOutcome}`;

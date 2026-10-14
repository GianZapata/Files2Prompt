export enum CopyStop {
  Completed = 'completed',
  UserCancelled = 'user-cancelled',
  FileBudget = 'file-budget',
  TotalBytes = 'total-bytes'
}

export type AnyCopyStop = CopyStop | `${CopyStop}`;

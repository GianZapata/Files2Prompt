export enum OperationKind {
  Copy = 'copy',
  Preview = 'preview',
  Cancelled = 'cancelled',
  EmptySelection = 'empty-selection',
  Save = 'save'
}

export type AnyOperationKind = OperationKind | `${OperationKind}`;

export enum PathKind {
  File = 'file',
  Directory = 'directory'
}

export type AnyPathKind = PathKind | `${PathKind}`;

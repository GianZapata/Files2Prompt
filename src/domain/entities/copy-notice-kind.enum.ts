export enum CopyNoticeKind {
  Limit = 'limit',
  Tokens = 'tokens'
}

export type AnyCopyNoticeKind = CopyNoticeKind | `${CopyNoticeKind}`;

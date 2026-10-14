export enum RepositoryKind {
  Repository = 'repository',
  Submodule = 'submodule'
}

export type AnyRepositoryKind = RepositoryKind | `${RepositoryKind}`;

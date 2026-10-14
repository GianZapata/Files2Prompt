export abstract class WorkspaceFilesDataSource {
  abstract existsAndIsFile(filePath: string): Promise<boolean>;
  abstract sizeOf(filePath: string): Promise<number | undefined>;
  abstract isBinary(filePath: string): Promise<boolean>;
  abstract readText(filePath: string): Promise<string>;
}

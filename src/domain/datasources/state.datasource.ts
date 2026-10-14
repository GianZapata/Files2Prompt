export abstract class StateDataSource {
  abstract get<T>(key: string, defaultValue?: T): T | undefined;
  abstract update<T>(key: string, value: T): Promise<void>;
}

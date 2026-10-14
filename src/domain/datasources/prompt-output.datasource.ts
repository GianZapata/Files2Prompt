export abstract class PromptOutputDataSource {
  abstract write(text: string): Promise<void>;
}

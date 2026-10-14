import type { AnyCopyStop } from '../entities/copy-stop.enum';

export interface TakeUntilStopOptions {
  isCancelled: () => boolean;
  maxFiles: number;
  maxTotalBytes: number;
  byteLength: (accepted: string[]) => number;
}

export interface TakeUntilStopResult {
  stop: AnyCopyStop;
  accepted: string[];
}

export const takeUntilStop = async (
  files: string[],
  options: TakeUntilStopOptions
): Promise<TakeUntilStopResult> => {
  const accepted: string[] = [];

  for (const file of files) {
    await new Promise(resolve => setImmediate(resolve));

    if (options.isCancelled()) {
      return { stop: 'user-cancelled' as AnyCopyStop, accepted };
    }

    if (accepted.length >= options.maxFiles) {
      return { stop: 'file-budget' as AnyCopyStop, accepted };
    }

    accepted.push(file);

    if (options.byteLength(accepted) > options.maxTotalBytes) {
      accepted.pop();

      return { stop: 'total-bytes' as AnyCopyStop, accepted };
    }
  }

  return { stop: 'completed' as AnyCopyStop, accepted };
};

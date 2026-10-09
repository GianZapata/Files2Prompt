export type CopyStop =
  'completed' | 'user-cancelled' | 'file-budget' | 'total-bytes';

export const takeUntilStop = async (
  files: string[],
  options: {
    isCancelled: () => boolean;
    maxFiles: number;
    maxTotalBytes: number;
    byteLength: (accepted: string[]) => number;
  }
) => {
  const accepted: string[] = [];

  for (const file of files) {
    await new Promise(resolve => setImmediate(resolve));

    if (options.isCancelled()) {
      return { stop: 'user-cancelled' as CopyStop, accepted };
    }

    if (accepted.length >= options.maxFiles) {
      return { stop: 'file-budget' as CopyStop, accepted };
    }

    accepted.push(file);

    if (options.byteLength(accepted) > options.maxTotalBytes) {
      accepted.pop();

      return { stop: 'total-bytes' as CopyStop, accepted };
    }
  }

  return { stop: 'completed' as CopyStop, accepted };
};

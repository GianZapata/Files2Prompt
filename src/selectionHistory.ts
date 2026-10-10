const sameSnapshot = (left: string[], right: string[]) => {
  if (left.length !== right.length) {
    return false;
  }

  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();

  return sortedLeft.every((value, index) => value === sortedRight[index]);
};

export const createSelectionHistory = (
  initial: string[][] = [],
  start = initial.length - 1
) => {
  let entries = initial.slice(-20).map(item => [...item]);
  let index = entries.length === 0 ? -1 : Math.min(start, entries.length - 1);

  const trim = () => {
    if (entries.length > 20) {
      const extra = entries.length - 20;

      entries = entries.slice(extra);
      index -= extra;
    }
  };

  return {
    record: (snapshot: string[]) => {
      const current = entries[index];

      if (current && sameSnapshot(current, snapshot)) {
        return;
      }

      entries = entries.slice(0, index + 1);
      entries.push([...snapshot]);
      index = entries.length - 1;
      trim();
    },
    back: () => {
      if (index <= 0) {
        return undefined;
      }

      index -= 1;

      return [...entries[index]];
    },
    forward: () => {
      if (index < 0 || index >= entries.length - 1) {
        return undefined;
      }

      index += 1;

      return [...entries[index]];
    },
    canBack: () => index > 0,
    canForward: () => index >= 0 && index < entries.length - 1,
    entries: () => entries.map(item => [...item]),
    position: () => index
  };
};

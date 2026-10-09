export const createCopyGate = () => {
  let active = false;

  return {
    tryStart: () => {
      if (active) {
        return false;
      }

      active = true;

      return true;
    },
    finish: () => {
      active = false;
    }
  };
};

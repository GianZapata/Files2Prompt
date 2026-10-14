const INDENT = '  ';

interface TreeNode {
  name: string;
  isDirectory: boolean;
  children: Map<string, TreeNode>;
}

export interface TreeAccumulator {
  measure: (posixPath: string) => number;
  add: (posixPath: string) => void;
  render: () => string;
  isEmpty: () => boolean;
}

const lineBytes = (depth: number, name: string, isDirectory: boolean) =>
  Buffer.byteLength(`${INDENT.repeat(depth)}${name}${isDirectory ? '/' : ''}`);

const byTypeThenName = (a: TreeNode, b: TreeNode) => {
  if (a.isDirectory !== b.isDirectory) {
    return a.isDirectory ? -1 : 1;
  }

  if (a.name === b.name) {
    return 0;
  }

  return a.name < b.name ? -1 : 1;
};

const linesOf = (node: TreeNode, depth: number): string[] =>
  [...node.children.values()]
    .sort(byTypeThenName)
    .flatMap(child => [
      `${INDENT.repeat(depth)}${child.name}${child.isDirectory ? '/' : ''}`,
      ...linesOf(child, depth + 1)
    ]);

export const createTreeAccumulator = (): TreeAccumulator => {
  const root: TreeNode = {
    name: '',
    isDirectory: true,
    children: new Map()
  };

  let nodeCount = 0;

  const segmentsOf = (posixPath: string) =>
    posixPath.split('/').filter(segment => segment !== '');

  const measure = (posixPath: string) => {
    const segments = segmentsOf(posixPath);

    let current: TreeNode | undefined = root;
    let bytes = 0;
    let created = 0;

    segments.forEach((name, depth) => {
      const isDirectory = depth < segments.length - 1;
      const existing: TreeNode | undefined = current?.children.get(name);

      current = existing;

      if (existing !== undefined) {
        return;
      }

      bytes += lineBytes(depth, name, isDirectory);
      created += 1;
    });

    const newlines = nodeCount === 0 ? Math.max(created - 1, 0) : created;

    return bytes + newlines;
  };

  const add = (posixPath: string) => {
    const segments = segmentsOf(posixPath);

    let current = root;

    segments.forEach((name, depth) => {
      const isDirectory = depth < segments.length - 1;
      const existing = current.children.get(name);

      if (existing !== undefined) {
        current = existing;

        return;
      }

      const node: TreeNode = { name, isDirectory, children: new Map() };

      current.children.set(name, node);
      nodeCount += 1;
      current = node;
    });
  };

  return {
    measure,
    add,
    render: () => linesOf(root, 0).join('\n'),
    isEmpty: () => nodeCount === 0
  };
};

import * as vscode from 'vscode';

export type QuickPickAnswer =
  vscode.QuickPickItem | readonly vscode.QuickPickItem[] | undefined;

export interface WindowScript {
  pickFor?: (
    placeHolder: string | undefined,
    items: readonly vscode.QuickPickItem[]
  ) => QuickPickAnswer;
  saveUri?: vscode.Uri;
}

export interface RecordedMessage {
  message: string;
  actions: string[];
}

export interface WindowRecording {
  saveOptions: vscode.SaveDialogOptions[];
  messages: RecordedMessage[];
  revealed: vscode.Uri[];
  restore: () => void;
}

const replaceMember = (target: object, key: string, value: unknown) => {
  const original = Reflect.get(target, key);
  const define = (next: unknown) =>
    Reflect.defineProperty(target, key, {
      value: next,
      configurable: true,
      writable: true
    });

  if (!define(value)) {
    throw new Error(`Cannot replace ${key} on the vscode API`);
  }

  return () => {
    define(original);
  };
};

export const stubWindow = (script: WindowScript): WindowRecording => {
  const recording: WindowRecording = {
    saveOptions: [],
    messages: [],
    revealed: [],
    restore: () => undefined
  };

  const record = (message: string, rest: unknown[]) => {
    recording.messages.push({
      message,
      actions: rest.filter((item): item is string => typeof item === 'string')
    });

    return Promise.resolve(undefined);
  };

  const showQuickPick = async (
    items:
      | readonly vscode.QuickPickItem[]
      | Thenable<readonly vscode.QuickPickItem[]>,
    options?: vscode.QuickPickOptions
  ) => script.pickFor?.(options?.placeHolder, await items);

  const showSaveDialog = (options?: vscode.SaveDialogOptions) => {
    recording.saveOptions.push(options ?? {});

    return Promise.resolve(script.saveUri);
  };

  const original = vscode.commands.executeCommand.bind(vscode.commands);

  const executeCommand = (command: string, ...args: unknown[]) => {
    if (command !== 'revealFileInOS') {
      return original(command, ...args);
    }

    recording.revealed.push(args[0] as vscode.Uri);

    return Promise.resolve(undefined);
  };

  const restorers = [
    replaceMember(vscode.window, 'showQuickPick', showQuickPick),
    replaceMember(vscode.window, 'showSaveDialog', showSaveDialog),
    replaceMember(
      vscode.window,
      'showInformationMessage',
      (message: string, ...rest: unknown[]) => record(message, rest)
    ),
    replaceMember(
      vscode.window,
      'showWarningMessage',
      (message: string, ...rest: unknown[]) => record(message, rest)
    ),
    replaceMember(vscode.commands, 'executeCommand', executeCommand)
  ];

  recording.restore = () => {
    for (const restore of restorers.reverse()) {
      restore();
    }
  };

  return recording;
};

export const withStubs = async <T>(
  script: WindowScript,
  work: (recording: WindowRecording) => PromiseLike<T>
): Promise<T> => {
  const recording = stubWindow(script);

  try {
    return await work(recording);
  } finally {
    recording.restore();
  }
};

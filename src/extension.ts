import * as fs from 'fs';
import * as path from 'path';

import { XMLParser } from 'fast-xml-parser';
import * as vscode from 'vscode';

import { FileTreeProvider } from './fileTreeProvider';
import { planPaste } from './pastePlan';

export function activate(context: vscode.ExtensionContext) {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (workspaceFolders) {
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const fileTreeProvider = new FileTreeProvider(workspaceRoot);

    const treeView = vscode.window.createTreeView('files2PromptView', {
      treeDataProvider: fileTreeProvider,
      manageCheckboxStateManually: true
    });

    context.subscriptions.push(fileTreeProvider);

    let history: string[][] = [];
    let historyPosition: number = -1;

    context.subscriptions.push(
      vscode.commands.registerCommand('files2prompt.refresh', () =>
        fileTreeProvider.refresh()
      ),
      vscode.commands.registerCommand('files2prompt.copyFiles', async () => {
        const checkedFiles = fileTreeProvider.getCheckedFiles();

        if (checkedFiles.length === 0) {
          vscode.window.showWarningMessage('No files selected.');

          return;
        }

        const lastSelection = history[historyPosition] || [];

        if (!arraysEqual(checkedFiles, lastSelection)) {
          if (historyPosition < history.length - 1) {
            history = history.slice(0, historyPosition + 1);
          }
          history.push([...checkedFiles]);
          historyPosition++;
        }

        const xmlOutput = await generateXmlOutput(checkedFiles);

        const config = vscode.workspace.getConfiguration('files2prompt');
        const systemMessage = config.get<string>('systemMessage');

        let finalOutput = xmlOutput;

        if (systemMessage && systemMessage.trim() !== '') {
          finalOutput =
            `<systemMessage>
<![CDATA[
${systemMessage}
]]>
</systemMessage>
` + finalOutput;
        }

        await vscode.env.clipboard.writeText(finalOutput);

        vscode.window.showInformationMessage(
          'File contents copied to clipboard.'
        );
      }),
      vscode.commands.registerCommand('files2prompt.clearChecks', () => {
        fileTreeProvider.clearChecks();
        vscode.window.showInformationMessage('All checks have been cleared.');
      }),
      vscode.commands.registerCommand('files2prompt.goBack', async () => {
        if (historyPosition > 0) {
          historyPosition--;
          const previousSelection = history[historyPosition];

          await fileTreeProvider.setCheckedFiles(previousSelection);
        } else {
          vscode.window.showWarningMessage(
            'No previous selection to go back to.'
          );
        }
      }),
      vscode.commands.registerCommand('files2prompt.goForward', async () => {
        if (historyPosition < history.length - 1) {
          historyPosition++;
          const nextSelection = history[historyPosition];

          await fileTreeProvider.setCheckedFiles(nextSelection);
        } else {
          vscode.window.showWarningMessage(
            'No next selection to go forward to.'
          );
        }
      }),
      vscode.commands.registerCommand('files2prompt.pasteXml', async () => {
        const clipboardContent = await vscode.env.clipboard.readText();

        await processXmlContent(clipboardContent);
      }),
      vscode.commands.registerCommand(
        'files2prompt.copyOpenFiles',
        async () => {
          const tabGroups: ReadonlyArray<vscode.TabGroup> =
            vscode.window.tabGroups.all;

          let xmlContent = '';

          for (const group of tabGroups) {
            for (const tab of group.tabs) {
              if (tab.input instanceof vscode.TabInputText) {
                const fileUri = tab.input.uri;
                const filePath = fileUri.fsPath;

                if (fs.existsSync(filePath)) {
                  const content = fs.readFileSync(filePath, 'utf-8');

                  const fileName = path.relative(
                    vscode.workspace.workspaceFolders![0].uri.fsPath,
                    filePath
                  );

                  xmlContent += `<file name="${fileName}">
<![CDATA[
${content}
]]>
</file>
`;
                }
              }
            }
          }

          if (xmlContent === '') {
            vscode.window.showWarningMessage('No open files to copy.');

            return;
          }

          const finalOutput = `<files>
${xmlContent}</files>`;

          await vscode.env.clipboard.writeText(finalOutput);
          vscode.window.showInformationMessage(
            'Open file contents copied to clipboard.'
          );
        }
      )
    );

    treeView.onDidChangeCheckboxState(async e => {
      for (const [item, state] of e.items) {
        await fileTreeProvider.updateCheckState(item, state);
      }
    });

    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('files2prompt.systemMessage')) {
          // Handle any dynamic updates if necessary
        }
      })
    );
  } else {
    vscode.window.showInformationMessage(
      'Please open a workspace folder to use this extension.'
    );
  }
}

export function deactivate() {}

async function generateXmlOutput(filePaths: string[]): Promise<string> {
  let xmlContent = '';

  for (const filePath of filePaths) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const fileName = path.relative(
      vscode.workspace.workspaceFolders![0].uri.fsPath,
      filePath
    );

    xmlContent += `<file name="${fileName}">
<![CDATA[
${content}
]]>
</file>
`;
  }

  return `<files>
${xmlContent}</files>`;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();

  for (let i = 0; i < sortedA.length; i++) {
    if (sortedA[i] !== sortedB[i]) {
      return false;
    }
  }

  return true;
}

async function processXmlContent(xmlContent: string) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    cdataPropName: '__cdata',
    trimValues: false
  });

  let jsonObj;

  try {
    jsonObj = parser.parse(xmlContent);
  } catch (error) {
    vscode.window.showErrorMessage('Error parsing XML content from clipboard.');

    return;
  }

  if (!jsonObj || !jsonObj.files || !jsonObj.files.file) {
    vscode.window.showErrorMessage(
      'No file content found. See documentation for usage.'
    );

    return;
  }

  const files = Array.isArray(jsonObj.files.file)
    ? jsonObj.files.file
    : [jsonObj.files.file];
  const workspaceRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;
  const planned = planPaste(
    workspaceRoot,
    files
      .filter((fileObj: { '@_name'?: string }) => fileObj['@_name'])
      .map(
        (fileObj: {
          '@_name': string;
          __cdata?: string;
          '#text'?: string;
        }) => ({
          name: fileObj['@_name'],
          content: fileObj['__cdata'] ?? fileObj['#text'] ?? ''
        })
      ),
    absolutePath =>
      vscode.workspace.textDocuments.some(
        document =>
          !document.isUntitled &&
          document.isDirty &&
          document.uri.fsPath === absolutePath
      )
  );

  if (!planned.ok) {
    vscode.window.showErrorMessage(
      `Paste stopped (${planned.reason}): ${planned.paths.join(', ')}`
    );

    return;
  }

  const changedFiles: { path: string; uri: vscode.Uri }[] = [];
  const newFiles: { path: string; uri: vscode.Uri }[] = [];

  for (const write of planned.writes) {
    const fileUri = vscode.Uri.file(write.absolutePath);

    await fs.promises.mkdir(path.dirname(write.absolutePath), {
      recursive: true
    });

    if (write.existed) {
      const existingContent = await fs.promises.readFile(
        write.absolutePath,
        'utf8'
      );

      if (existingContent !== write.content) {
        await fs.promises.writeFile(write.absolutePath, write.content, 'utf8');
        changedFiles.push({ path: write.relativePath, uri: fileUri });
      }
    } else {
      await fs.promises.writeFile(write.absolutePath, write.content, 'utf8');
      newFiles.push({ path: write.relativePath, uri: fileUri });
    }
  }

  if (changedFiles.length > 0 || newFiles.length > 0) {
    // Create quick pick items for all changed/new files
    const quickPickItems: vscode.QuickPickItem[] = [
      ...changedFiles.map(f => ({
        label: `📝 ${f.path}`,
        description: 'Modified',
        uri: f.uri
      })),
      ...newFiles.map(f => ({
        label: `✨ ${f.path}`,
        description: 'New',
        uri: f.uri
      }))
    ];

    // Show information message with multiple actions
    vscode.window
      .showInformationMessage(
        `Files have been updated successfully. ${changedFiles.length} modified, ${newFiles.length} new.`,
        'Show Details',
        'Open Changed Files'
      )
      .then(async selection => {
        if (selection === 'Show Details') {
          // Create and show output channel with details and clickable links
          const channel = vscode.window.createOutputChannel(
            'Files2Prompt Changes'
          );

          channel.clear();

          if (changedFiles.length > 0) {
            channel.appendLine('Modified files:');
            changedFiles.forEach(file => {
              channel.appendLine(`${file.path}`);
            });
            channel.appendLine('');
          }

          if (newFiles.length > 0) {
            channel.appendLine('New files:');
            newFiles.forEach(file => {
              channel.appendLine(`${file.path}`);
            });
          }

          channel.show();
        } else if (selection === 'Open Changed Files') {
          // Show quick pick with all changed files
          const selected = await vscode.window.showQuickPick(quickPickItems, {
            placeHolder: 'Select files to open',
            canPickMany: true
          });

          if (selected) {
            // Open each selected file
            for (const item of selected) {
              const uri = (item as any).uri;

              if (uri) {
                const doc = await vscode.workspace.openTextDocument(uri);

                await vscode.window.showTextDocument(doc, { preview: false });
              }
            }
          }
        }
      });
  } else {
    vscode.window.showInformationMessage('No files were changed.');
  }
}

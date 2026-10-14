import * as vscode from 'vscode';

import {
  createDetailsSource,
  createPreviewSource,
  DETAILS_SCHEME,
  PREVIEW_SCHEME
} from './prompt-preview.source';

export interface PromptVirtualDocuments {
  previewSource: ReturnType<typeof createPreviewSource>;
  previewEmitter: vscode.EventEmitter<vscode.Uri>;
  previewUri: vscode.Uri;
  detailsSource: ReturnType<typeof createDetailsSource>;
  detailsEmitter: vscode.EventEmitter<vscode.Uri>;
  detailsUri: vscode.Uri;
  disposables: vscode.Disposable[];
}

export const createPromptVirtualDocuments = (): PromptVirtualDocuments => {
  const detailsSource = createDetailsSource();
  const detailsEmitter = new vscode.EventEmitter<vscode.Uri>();
  const detailsUri = vscode.Uri.parse(detailsSource.uri);

  const previewSource = createPreviewSource();
  const previewEmitter = new vscode.EventEmitter<vscode.Uri>();
  const previewUri = vscode.Uri.parse(previewSource.uri);

  const previewProvider = vscode.workspace.registerTextDocumentContentProvider(
    PREVIEW_SCHEME,
    {
      onDidChange: previewEmitter.event,
      provideTextDocumentContent: () => previewSource.get()
    }
  );

  const detailsProvider = vscode.workspace.registerTextDocumentContentProvider(
    DETAILS_SCHEME,
    {
      onDidChange: detailsEmitter.event,
      provideTextDocumentContent: () => detailsSource.get()
    }
  );

  return {
    previewSource,
    previewEmitter,
    previewUri,
    detailsSource,
    detailsEmitter,
    detailsUri,
    disposables: [
      previewEmitter,
      detailsEmitter,
      previewProvider,
      detailsProvider
    ]
  };
};

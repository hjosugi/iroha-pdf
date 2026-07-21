import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';

import type { WorkspaceDocument } from '@iroha-pdf/core';
import { createId, saveDocument } from './database';

function documentsDirectory(): Directory {
  const directory = new Directory(Paths.document, 'iroha-pdf', 'documents');
  if (!directory.exists) directory.create({ intermediates: true });
  return directory;
}

export async function importPdfFromSystem(): Promise<WorkspaceDocument | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;

  const asset = result.assets[0];
  if (!asset) return null;
  // DocumentPicker represents Files/iCloud/Android SAF providers. The app owns
  // only the copied destination, while the provider's original remains external.
  return importPdfFile(new File(asset.uri), asset.name, 'external-provider');
}

export async function importPdfFile(
  source: File,
  title: string,
  sourceKind: WorkspaceDocument['source'],
  sourceId?: string,
  sourceRevision?: string,
): Promise<WorkspaceDocument> {
  const id = createId('pdf');
  const destination = new File(documentsDirectory(), `${id}.pdf`);
  source.copy(destination);
  const document: WorkspaceDocument = {
    id,
    title: title.replace(/\.pdf$/i, ''),
    localUri: destination.uri,
    mimeType: 'application/pdf',
    source: sourceKind,
    sourceId,
    sourceRevision,
    sizeBytes: destination.size,
    modifiedAt: new Date().toISOString(),
  };
  await saveDocument(document);
  return document;
}

export function createOutputPdf(name: string, bytes: Uint8Array): File {
  const safeName = name.replace(/[^a-zA-Z0-9._-]+/g, '-');
  const output = new File(Paths.cache, `${Date.now()}-${safeName}`);
  output.create({ overwrite: true, intermediates: true });
  output.write(bytes);
  return output;
}

export function createPermanentPdf(name: string, bytes: Uint8Array): File {
  const safeName = name.replace(/[^a-zA-Z0-9._-]+/g, '-');
  const output = new File(documentsDirectory(), `${Date.now()}-${safeName}`);
  output.create({ overwrite: false, intermediates: true });
  output.write(bytes);
  return output;
}

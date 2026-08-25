import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { WorkspaceDocument } from '@iroha-pdf/core';
import { createId, deleteDocument, saveDocument } from './database';

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
  await source.copy(destination);
  const document: WorkspaceDocument = {
    id,
    title: baseName(title),
    localUri: destination.uri,
    mimeType: 'application/pdf',
    source: sourceKind,
    sourceId,
    sourceRevision,
    sizeBytes: destination.size,
    modifiedAt: new Date().toISOString(),
  };
  try {
    await saveDocument(document);
  } catch (error) {
    // Do not leave an invisible private copy behind when the catalogue write
    // fails. The provider original remains untouched and can be selected again.
    if (destination.exists) destination.delete();
    throw error;
  }
  return document;
}

export async function removeImportedDocument(document: WorkspaceDocument): Promise<void> {
  const file = new File(document.localUri);
  // The URI always points at the private copy made by importPdfFile. Provider
  // originals are never deleted by this app.
  if (!file.exists) {
    await deleteDocument(document.id);
    return;
  }

  // Quarantine first, then remove the catalogue row. If SQLite rejects the
  // transaction, moving the bytes back keeps the library entry usable instead
  // of leaving it pointed at a file already destroyed.
  const quarantined = new File(Paths.cache, `iroha-delete-${document.id}.pdf`);
  if (quarantined.exists) quarantined.delete();
  file.moveSync(quarantined);
  try {
    await deleteDocument(document.id);
  } catch (error) {
    file.moveSync(new File(document.localUri));
    throw error;
  }
  file.delete();
}

export function createOutputPdf(name: string, bytes: Uint8Array): File {
  const safeName = name.replace(/[^a-zA-Z0-9._-]+/g, '-');
  const output = new File(Paths.cache, `${Date.now()}-${safeName}`);
  output.create({ overwrite: true, intermediates: true });
  output.write(bytes);
  return output;
}

/**
 * Hands a produced PDF to the system share sheet. Every producer wants the
 * same two hints — the MIME type for Android and the UTI for iOS — and a file
 * offered without them arrives somewhere as an untyped blob.
 */
export async function sharePdf(file: File): Promise<void> {
  await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
}

/** The document title a produced file should be named after. */
export function baseName(fileName: string): string {
  return fileName.replace(/\.pdf$/i, '');
}

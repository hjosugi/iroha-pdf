import { useMemo } from 'react';
import { createPluginRegistration } from '@embedpdf/core';
import { EmbedPDF, type PluginBatchRegistrations } from '@embedpdf/core/react';
import { usePdfiumEngine } from '@embedpdf/engines/react';
import { ConsoleLogger } from '@embedpdf/models';
import { AnnotationPluginPackage } from '@embedpdf/plugin-annotation/react';
import { DocumentManagerPluginPackage } from '@embedpdf/plugin-document-manager/react';
import { ExportPluginPackage } from '@embedpdf/plugin-export/react';
import { HistoryPluginPackage } from '@embedpdf/plugin-history/react';
import { InteractionManagerPluginPackage } from '@embedpdf/plugin-interaction-manager/react';
import { PanPluginPackage } from '@embedpdf/plugin-pan/react';
import { PrintPluginPackage } from '@embedpdf/plugin-print/react';
import { RenderPluginPackage } from '@embedpdf/plugin-render/react';
import { RotatePluginPackage } from '@embedpdf/plugin-rotate/react';
import { ScrollPluginPackage, ScrollStrategy } from '@embedpdf/plugin-scroll/react';
import { SelectionPluginPackage } from '@embedpdf/plugin-selection/react';
import { TilingPluginPackage } from '@embedpdf/plugin-tiling/react';
import { ViewportPluginPackage } from '@embedpdf/plugin-viewport/react';
import { ZoomMode, ZoomPluginPackage } from '@embedpdf/plugin-zoom/react';

import { Workspace } from './Workspace';

const logger = new ConsoleLogger();

export function App() {
  const { engine, isLoading, error } = usePdfiumEngine({ logger });
  const plugins: PluginBatchRegistrations = useMemo(
    () => [
      createPluginRegistration(DocumentManagerPluginPackage),
      createPluginRegistration(ViewportPluginPackage, { viewportGap: 12 }),
      createPluginRegistration(ScrollPluginPackage, {
        defaultStrategy: ScrollStrategy.Vertical,
      }),
      createPluginRegistration(InteractionManagerPluginPackage),
      createPluginRegistration(ZoomPluginPackage, {
        defaultZoomLevel: ZoomMode.FitPage,
      }),
      createPluginRegistration(PanPluginPackage),
      createPluginRegistration(RotatePluginPackage),
      createPluginRegistration(RenderPluginPackage),
      createPluginRegistration(TilingPluginPackage, {
        tileSize: 768,
        overlapPx: 2.5,
        extraRings: 0,
      }),
      createPluginRegistration(SelectionPluginPackage),
      createPluginRegistration(AnnotationPluginPackage),
      createPluginRegistration(HistoryPluginPackage),
      createPluginRegistration(ExportPluginPackage),
      createPluginRegistration(PrintPluginPackage),
    ],
    [],
  );

  if (error) {
    return <main className="center-state">PDF engine failed: {error.message}</main>;
  }

  if (isLoading || !engine) {
    return <main className="center-state">Loading local PDF engine…</main>;
  }

  return (
    <EmbedPDF engine={engine} logger={logger} plugins={plugins}>
      {({ pluginsReady, activeDocumentId, documentStates }) =>
        pluginsReady ? (
          <Workspace activeDocumentId={activeDocumentId} documentStates={documentStates} />
        ) : (
          <main className="center-state">Preparing workspace…</main>
        )
      }
    </EmbedPDF>
  );
}

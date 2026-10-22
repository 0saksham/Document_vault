import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Set up the local pdf.js worker
if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
}

export default function PdfViewer({ data, onRenderSuccess, onRenderError }) {
  const containerRef = useRef(null);
  const [numPages, setNumPages] = useState(0);
  const [pdfDoc, setPdfDoc] = useState(null);
  const renderTasksRef = useRef([]);

  // Load PDF document from raw decrypted bytes
  useEffect(() => {
    let isCancelled = false;
    let loadingTask = null;

    async function loadPdf() {
      try {
        if (!data || data.byteLength === 0) {
          throw new Error('Empty PDF byte buffer');
        }

        loadingTask = pdfjsLib.getDocument({
          data: new Uint8Array(data),
          cMapUrl: '/pdfjs/cmaps/',
          cMapPacked: true,
          standardFontDataUrl: '/pdfjs/standard_fonts/',
        });

        const doc = await loadingTask.promise;
        if (isCancelled) return;

        setPdfDoc(doc);
        setNumPages(doc.numPages);
        if (onRenderSuccess) onRenderSuccess(doc.numPages);
      } catch (err) {
        if (isCancelled) return;
        console.error('Failed to parse or load PDF with pdf.js:', err);
        if (onRenderError) onRenderError(err);
      }
    }

    loadPdf();

    return () => {
      isCancelled = true;
      if (loadingTask) {
        try { loadingTask.destroy(); } catch {}
      }
    };
  }, [data]);

  // Render all pages onto canvases
  useEffect(() => {
    if (!pdfDoc || numPages === 0 || !containerRef.current) return;

    let isCancelled = false;
    // Cancel any active render tasks
    renderTasksRef.current.forEach((t) => {
      try { t.cancel(); } catch {}
    });
    renderTasksRef.current = [];

    const container = containerRef.current;
    container.innerHTML = '';

    async function renderAllPages() {
      const dpr = window.devicePixelRatio || 1;

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        if (isCancelled) break;

        try {
          const page = await pdfDoc.getPage(pageNum);
          if (isCancelled) break;

          // Target unscaled width (around 800px max or container width)
          const unscaledViewport = page.getViewport({ scale: 1 });
          const targetWidth = Math.min(850, window.innerWidth - 60);
          const baseScale = targetWidth / unscaledViewport.width;
          const viewport = page.getViewport({ scale: baseScale });

          // Create page wrapper
          const pageDiv = document.createElement('div');
          pageDiv.className = 'pdf-page-container';
          pageDiv.style.position = 'relative';
          pageDiv.style.marginBottom = '16px';
          pageDiv.style.borderRadius = '6px';
          pageDiv.style.overflow = 'hidden';
          pageDiv.style.boxShadow = '0 8px 30px rgba(0, 0, 0, 0.4)';
          pageDiv.style.background = '#ffffff';

          // Canvas for sharp text with devicePixelRatio
          const canvas = document.createElement('canvas');
          canvas.className = 'pdf-page-canvas';
          canvas.width = Math.floor(viewport.width * dpr);
          canvas.height = Math.floor(viewport.height * dpr);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;
          canvas.style.display = 'block';

          const ctx = canvas.getContext('2d', { alpha: false });
          ctx.scale(dpr, dpr);

          pageDiv.appendChild(canvas);
          container.appendChild(pageDiv);

          const renderContext = {
            canvasContext: ctx,
            viewport: viewport,
          };

          const renderTask = page.render(renderContext);
          renderTasksRef.current.push(renderTask);
          await renderTask.promise;
        } catch (err) {
          if (err?.name === 'RenderingCancelledException') {
            // Normal cancellation
            return;
          }
          console.error(`Error rendering PDF page ${pageNum}:`, err);
        }
      }
    }

    renderAllPages();

    return () => {
      isCancelled = true;
      renderTasksRef.current.forEach((t) => {
        try { t.cancel(); } catch {}
      });
      renderTasksRef.current = [];
    };
  }, [pdfDoc, numPages]);

  return (
    <div
      ref={containerRef}
      className="pdf-pages-wrapper"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '20px 0',
        pointerEvents: 'none', // Allow dragging on parent container
      }}
    />
  );
}

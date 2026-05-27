import { useState } from 'react';
import { Download, Upload, FileText, Check, AlertCircle } from 'lucide-react';
import { useOverlay } from '@/providers/overlay-context';
import { useRawApp } from '@/providers/db-context';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { exportAllJsonFull, importFromJson } from '@/data/export-service';

type ExportStatus = 'idle' | 'exporting' | 'importing' | 'success' | 'error';

export function ExportPanel() {
  const { overlay, closeOverlay } = useOverlay();
  const { app, db } = useRawApp();
  const [status, setStatus] = useState<ExportStatus>('idle');
  const [message, setMessage] = useState('');

  const isOpen = overlay === 'export';

  const handleExport = async () => {
    if (!app || !db) return;
    setStatus('exporting');
    try {
      const blob = await exportAllJsonFull(app, db);
      const date = new Date().toISOString().split('T')[0];
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bible-tools-backup-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus('success');
      setMessage('Backup downloaded successfully.');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file || !db) return;
      setStatus('importing');
      try {
        const result = await importFromJson(db, file);
        setStatus('success');
        setMessage(`Restored: ${result.imported.join(', ')}`);
        // Force a full page reload to pick up all restored data
        window.location.reload();
      } catch (err) {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Import failed');
      }
    };
    input.click();
  };

  const handleClose = () => {
    setStatus('idle');
    setMessage('');
    closeOverlay();
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent
        className="top-1/4 translate-y-0 p-0 gap-0 w-full max-w-md rounded-xl bg-background border border-border overflow-hidden"
        showCloseButton={false}
      >
        <div className="px-4 pt-4 pb-2 border-b border-border">
          <h2 className="font-sans text-lg font-semibold text-foreground">Export & Backup</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Export your data as JSON for backup, or restore from a previous backup.
          </p>
        </div>

        <div className="p-4 space-y-3">
          <button
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-accent transition-colors text-left"
            onClick={handleExport}
            disabled={status === 'exporting' || status === 'importing'}
          >
            <Download className="size-5 text-muted-foreground shrink-0" />
            <div>
              <div className="text-sm font-medium text-foreground">Export All (JSON)</div>
              <div className="text-xs text-muted-foreground">
                Bookmarks, notes, markers, collections, preferences
              </div>
            </div>
          </button>

          <button
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-accent transition-colors text-left"
            onClick={handleImport}
            disabled={status === 'exporting' || status === 'importing'}
          >
            <Upload className="size-5 text-muted-foreground shrink-0" />
            <div>
              <div className="text-sm font-medium text-foreground">Import Backup</div>
              <div className="text-xs text-muted-foreground">
                Restore from a previously exported JSON file
              </div>
            </div>
          </button>

          {/* Status message */}
          {status !== 'idle' && (
            <div
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                status === 'success'
                  ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                  : status === 'error'
                    ? 'bg-red-500/10 text-red-700 dark:text-red-400'
                    : 'bg-accent text-muted-foreground'
              }`}
            >
              {status === 'success' && <Check className="size-4 shrink-0" />}
              {status === 'error' && <AlertCircle className="size-4 shrink-0" />}
              {(status === 'exporting' || status === 'importing') && (
                <FileText className="size-4 shrink-0 animate-pulse" />
              )}
              <span>
                {status === 'exporting' && 'Exporting…'}
                {status === 'importing' && 'Importing…'}
                {(status === 'success' || status === 'error') && message}
              </span>
            </div>
          )}
        </div>

        <div className="border-t border-border px-4 py-3 flex justify-end">
          <button
            className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
            onClick={handleClose}
          >
            Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

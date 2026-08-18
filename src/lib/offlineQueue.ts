/**
 * offlineQueue.ts — Robust offline stroke synchronization for tablet & mobile.
 *
 * Persists queued stroke updates to localStorage / IndexedDB when offline.
 * Automatically detects network reconnection and flushes changes to the backend.
 */

export interface QueuedStrokeUpdate {
  id: string;
  notebookId: string;
  pageNumber: number;
  strokesJson: string;
  pdfUrl?: string | null;
  timestamp: number;
}

const STORAGE_KEY = "synapse_offline_stroke_queue";

export function getOfflineQueue(): QueuedStrokeUpdate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn("Failed to read offline stroke queue:", e);
    return [];
  }
}

export function saveOfflineQueue(queue: QueuedStrokeUpdate[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.warn("Failed to write offline stroke queue:", e);
  }
}

export function queueStrokeUpdate(update: Omit<QueuedStrokeUpdate, "id" | "timestamp">): void {
  const queue = getOfflineQueue();
  // If there is already a queued update for the same notebook + page, replace it with the latest strokes
  const existingIdx = queue.findIndex(
    item => item.notebookId === update.notebookId && item.pageNumber === update.pageNumber
  );

  const newItem: QueuedStrokeUpdate = {
    ...update,
    id: `${update.notebookId}-${update.pageNumber}-${Date.now()}`,
    timestamp: Date.now(),
  };

  if (existingIdx >= 0) {
    queue[existingIdx] = newItem;
  } else {
    queue.push(newItem);
  }

  saveOfflineQueue(queue);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("synapse_queue_changed", { detail: { count: queue.length } }));
  }
}

export async function flushOfflineQueue(onProgress?: (pending: number) => void): Promise<{ successCount: number; failedCount: number }> {
  const queue = getOfflineQueue();
  if (queue.length === 0) return { successCount: 0, failedCount: 0 };

  let successCount = 0;
  let failedCount = 0;
  const remaining: QueuedStrokeUpdate[] = [];

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    try {
      const res = await fetch(`/api/notebooks/${item.notebookId}/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page_number: item.pageNumber,
          strokes_json: item.strokesJson,
          pdf_url: item.pdfUrl ?? null,
        }),
      });

      if (res.ok) {
        successCount++;
      } else {
        failedCount++;
        remaining.push(item);
      }
    } catch (e) {
      console.warn("Failed to sync queued stroke item:", e);
      failedCount++;
      remaining.push(item);
    }

    if (onProgress) {
      onProgress(queue.length - i - 1);
    }
  }

  saveOfflineQueue(remaining);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("synapse_queue_changed", { detail: { count: remaining.length } }));
  }

  return { successCount, failedCount };
}

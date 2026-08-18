"use client";
import { useEffect, useState, useCallback } from "react";
import { flushOfflineQueue, getOfflineQueue } from "@/lib/offlineQueue";
import styles from "./PWAProvider.module.css";

// Interface for beforeinstallprompt event
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export default function PWAProvider({ children }: { children: React.ReactNode }) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  // 1. Register Service Worker & Setup Online/Offline Handlers
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check initial online status
    setIsOnline(navigator.onLine);
    setPendingSyncCount(getOfflineQueue().length);

    // Register Service Worker
    if ("serviceWorker" in navigator && process.env.NODE_ENV !== "development") {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((reg) => {
            console.log("Synapse PWA Service Worker registered:", reg.scope);
          })
          .catch((err) => {
            console.warn("Service Worker registration failed:", err);
          });
      });
    }

    // Check if already in standalone mode (installed app)
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window.navigator as any).standalone === true;
    setIsInstalled(isStandalone);

    // Listen for beforeinstallprompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    // Listen for app installed
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener("appinstalled", handleAppInstalled);

    // Online/offline handlers
    const handleOnline = async () => {
      setIsOnline(true);
      setIsSyncing(true);
      try {
        await flushOfflineQueue((remaining) => setPendingSyncCount(remaining));
      } finally {
        setIsSyncing(false);
        setPendingSyncCount(getOfflineQueue().length);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    const handleQueueChanged = (e: Event) => {
      const custom = e as CustomEvent<{ count: number }>;
      setPendingSyncCount(custom.detail?.count ?? getOfflineQueue().length);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("synapse_queue_changed", handleQueueChanged);

    // If online on mount, check and flush any leftover queued strokes
    if (navigator.onLine) {
      flushOfflineQueue().then(() => setPendingSyncCount(getOfflineQueue().length));
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("synapse_queue_changed", handleQueueChanged);
    };
  }, []);

  const handleInstallClick = useCallback(async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
    }
    setInstallPrompt(null);
  }, [installPrompt]);

  return (
    <>
      {children}

      {/* Offline / Sync Banner */}
      {!isOnline && (
        <div className={styles.offlineToast} role="status" aria-live="polite">
          <div className={styles.offlineDot} />
          <span>Offline Mode — Changes saved locally to tablet</span>
          {pendingSyncCount > 0 && (
            <span className={styles.queueBadge}>{pendingSyncCount} queued</span>
          )}
        </div>
      )}

      {isOnline && isSyncing && (
        <div className={styles.syncToast} role="status" aria-live="polite">
          <svg className={styles.spin} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <span>Syncing offline notes with cloud…</span>
        </div>
      )}

      {/* Install PWA Prompt on Tablets & Mobile */}
      {installPrompt && !isInstalled && !isDismissed && (
        <div className={styles.installBanner} role="dialog" aria-label="Install Synapse Notes app">
          <div className={styles.installIcon}>
            <svg width="24" height="24" viewBox="0 0 36 36" fill="none">
              <rect width="36" height="36" rx="8" fill="var(--accent)" />
              <path d="M10 12h16M10 18h11M10 24h14" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </div>
          <div className={styles.installContent}>
            <h4>Install Synapse Notes</h4>
            <p>Add to your home screen for full-screen tablet handwriting & offline access.</p>
          </div>
          <div className={styles.installActions}>
            <button className="btn btn-primary" onClick={handleInstallClick} id="pwa-install-btn">
              Install App
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => setIsDismissed(true)}
              id="pwa-dismiss-btn"
              aria-label="Dismiss install prompt"
            >
              Later
            </button>
          </div>
        </div>
      )}
    </>
  );
}

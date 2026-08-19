"use client";

export interface PyodideExecutionResult {
  stdout: string;
  stderr: string;
  error?: string;
  images: string[];
  executionTimeMs: number;
}

export type PyodideStatus = "idle" | "loading" | "ready" | "error";

let pyodideInstance: any = null;
let pyodideLoadingPromise: Promise<any> | null = null;
let pyodideStatus: PyodideStatus = "idle";
let statusListeners: ((status: PyodideStatus) => void)[] = [];

function notifyStatus(status: PyodideStatus) {
  pyodideStatus = status;
  for (const listener of statusListeners) {
    try {
      listener(status);
    } catch (e) {
      console.warn("Pyodide status listener error:", e);
    }
  }
}

export function subscribePyodideStatus(listener: (status: PyodideStatus) => void) {
  statusListeners.push(listener);
  listener(pyodideStatus);
  return () => {
    statusListeners = statusListeners.filter(l => l !== listener);
  };
}

export function getPyodideStatus(): PyodideStatus {
  return pyodideStatus;
}

/**
 * Loads Pyodide from CDN script tag dynamically if not already available
 */
export async function getPyodide(): Promise<any> {
  if (pyodideInstance) return pyodideInstance;
  if (pyodideLoadingPromise) return pyodideLoadingPromise;

  notifyStatus("loading");

  pyodideLoadingPromise = (async () => {
    try {
      if (typeof window === "undefined") {
        throw new Error("Pyodide can only run in the browser environment");
      }

      // Check if window.loadPyodide exists
      if (!(window as any).loadPyodide) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js";
          script.async = true;
          script.onload = () => resolve();
          script.onerror = err => reject(new Error(`Failed to load Pyodide script: ${err}`));
          document.head.appendChild(script);
        });
      }

      const loadPyodideFn = (window as any).loadPyodide;
      if (!loadPyodideFn) {
        throw new Error("Pyodide script loaded but window.loadPyodide is not defined");
      }

      const pyodide = await loadPyodideFn({
        indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/",
      });

      // Setup standard Python environment hooks for IO capture
      await pyodide.runPythonAsync(`
import sys
import io

class OutputCapture:
    def __init__(self):
        self.stdout_buffer = io.StringIO()
        self.stderr_buffer = io.StringIO()
        self._orig_stdout = sys.stdout
        self._orig_stderr = sys.stderr

    def start(self):
        self.stdout_buffer = io.StringIO()
        self.stderr_buffer = io.StringIO()
        sys.stdout = self.stdout_buffer
        sys.stderr = self.stderr_buffer

    def stop(self):
        sys.stdout = self._orig_stdout
        sys.stderr = self._orig_stderr
        return self.stdout_buffer.getvalue(), self.stderr_buffer.getvalue()

_capture = OutputCapture()
`);

      pyodideInstance = pyodide;
      notifyStatus("ready");
      return pyodide;
    } catch (err) {
      console.error("Pyodide initialization failed:", err);
      notifyStatus("error");
      pyodideLoadingPromise = null;
      throw err;
    }
  })();

  return pyodideLoadingPromise;
}

/**
 * Executes a single code string in the shared Python session
 */
export async function executePythonCode(code: string): Promise<PyodideExecutionResult> {
  const startTime = performance.now();
  const pyodide = await getPyodide();

  let stdout = "";
  let stderr = "";
  let error: string | undefined;
  const images: string[] = [];

  try {
    // Start capturing stdout/stderr
    pyodide.runPython("_capture.start()");

    // Try executing user code
    const result = await pyodide.runPythonAsync(code);

    // Stop capturing
    const [capturedOut, capturedErr] = pyodide.runPython("_capture.stop()").toJs();
    stdout = capturedOut || "";
    stderr = capturedErr || "";

    // If there was an unassigned return expression (like in Jupyter), append its representation
    if (result !== undefined && result !== null && typeof result.toString === "function") {
      const resStr = result.toString();
      if (resStr && resStr !== "None" && resStr !== "[object Object]") {
        stdout += (stdout ? "\n" : "") + resStr;
      }
    }

    // Check if matplotlib figures were created and export them
    try {
      const plotCapture = await pyodide.runPythonAsync(`
def _get_matplotlib_figures():
    imgs = []
    if 'matplotlib' in sys.modules and 'matplotlib.pyplot' in sys.modules:
        import matplotlib.pyplot as plt
        import base64
        for fig_num in plt.get_fignums():
            fig = plt.figure(fig_num)
            buf = io.BytesIO()
            fig.savefig(buf, format='png', bbox_inches='tight', dpi=120)
            buf.seek(0)
            img_b64 = base64.b64encode(buf.read()).decode('utf-8')
            imgs.append(f"data:image/png;base64,{img_b64}")
        plt.close('all')
    return imgs

_get_matplotlib_figures()
`);
      if (plotCapture && typeof plotCapture.toJs === "function") {
        const generatedImages = plotCapture.toJs();
        if (Array.isArray(generatedImages)) {
          images.push(...generatedImages);
        }
      }
    } catch (plotErr) {
      console.warn("Plot capture check:", plotErr);
    }
  } catch (err: any) {
    try {
      const [capturedOut, capturedErr] = pyodide.runPython("_capture.stop()").toJs();
      stdout = capturedOut || "";
      stderr = capturedErr || "";
    } catch {
      // ignore
    }
    error = err?.message || String(err);
  }

  const executionTimeMs = Math.round(performance.now() - startTime);

  return {
    stdout: stdout.trim(),
    stderr: stderr.trim(),
    error,
    images,
    executionTimeMs,
  };
}

/**
 * Resets the active Python kernel by re-initializing fresh global scope
 */
export async function resetPythonKernel(): Promise<void> {
  const pyodide = await getPyodide();
  await pyodide.runPythonAsync(`
import sys
# Clear non-built-in global variables
keep_keys = {'sys', 'io', 'OutputCapture', '_capture', '__name__', '__doc__', '__package__', '__loader__', '__spec__', '__builtins__'}
for key in list(globals().keys()):
    if key not in keep_keys and not key.startswith('__'):
        del globals()[key]
`);
}

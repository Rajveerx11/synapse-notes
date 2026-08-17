"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import styles from "./login.module.css";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const username = usernameRef.current?.value.trim() || "";
    const password = passwordRef.current?.value || "";

    if (!username || !password) {
      setError("Please fill in all fields");
      setLoading(false);
      return;
    }

    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      let json: { ok?: boolean; error?: string } = {};
      try {
        json = await res.json();
      } catch {
        json = { error: `Server error (${res.status})` };
      }

      setLoading(false);

      if (!res.ok) {
        setError(json.error || "Authentication failed. Please try again.");
        return;
      }

      router.replace("/");
    } catch (err: unknown) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Network error. Please try again.");
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        {/* Logo */}
        <div className={styles.logo}>
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <rect width="36" height="36" rx="10" fill="var(--accent)" />
            <path d="M10 12h16M10 18h10M10 24h13" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
            <circle cx="27" cy="24" r="4" fill="white" opacity="0.9" />
            <path d="M25.5 24l1 1 2-2" stroke="var(--accent)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Synapse Notes</span>
        </div>

        <h1 className={styles.title}>
          {mode === "login" ? "Welcome back" : "Create account"}
        </h1>
        <p className={styles.subtitle}>
          {mode === "login"
            ? "Sign in to your notebook"
            : "Your AI-powered study companion"}
        </p>

        <form onSubmit={submit} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="username">Username</label>
            <input
              id="username"
              ref={usernameRef}
              type="text"
              placeholder="e.g. rajveer"
              autoComplete="username"
              required
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              ref={passwordRef}
              type="password"
              placeholder="••••••••"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <button type="submit" className={`btn btn-primary ${styles.submit}`} disabled={loading}>
            {loading ? "Please wait…" : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <p className={styles.toggle}>
          {mode === "login" ? "No account?" : "Already have an account?"}
          {" "}
          <button
            className={styles.toggleBtn}
            onClick={() => { setMode(m => m === "login" ? "register" : "login"); setError(""); }}
          >
            {mode === "login" ? "Register" : "Sign In"}
          </button>
        </p>
      </div>
    </div>
  );
}

"use client";
import React, { useRef, useState, useEffect, useMemo, useCallback } from "react";
import {
  SupportedLanguage,
  LANGUAGE_OPTIONS,
  highlightCodeLine,
} from "@/lib/codeHighlighter";
import styles from "./CodeEditorBlock.module.css";

interface Props {
  code: string;
  language: SupportedLanguage;
  lineHeightRatio: number;
  onCodeChange: (code: string) => void;
  onLanguageChange: (lang: SupportedLanguage) => void;
  onLineHeightChange: (ratio: number) => void;
  isDrawingMode?: boolean;
}

export default function CodeEditorBlock({
  code,
  language,
  lineHeightRatio,
  onCodeChange,
  onLanguageChange,
  onLineHeightChange,
  isDrawingMode = false,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const lines = useMemo(() => code.split("\n"), [code]);

  // Sync textarea height / scroll with preview container
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onCodeChange(e.target.value);
  };

  const handleCopy = useCallback(async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn("Copy failed:", err);
    }
  }, [code]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle tab key for clean 2-space indentation
    if (e.key === "Tab") {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const newCode = code.substring(0, start) + "  " + code.substring(end);
      onCodeChange(newCode);
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      }, 0);
    }
  };

  // Base font size and calculated pixel line height
  const fontSizePx = 14;
  const computedLineHeightPx = Math.round(fontSizePx * lineHeightRatio);

  return (
    <div className={styles.container}>
      {/* Top Header Bar */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.badge}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
            <span>Code Snippet</span>
          </div>

          {/* Language Selector */}
          <select
            value={language}
            onChange={(e) => onLanguageChange(e.target.value as SupportedLanguage)}
            className={styles.select}
            aria-label="Code language"
          >
            {LANGUAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Line Height Selector */}
          <div className={styles.lineHeightGroup}>
            <span className={styles.lineHeightLabel}>Spacing:</span>
            {[
              { label: "1.8x", val: 1.8 },
              { label: "2.4x", val: 2.4 },
              { label: "3.0x", val: 3.0 },
            ].map((opt) => (
              <button
                key={opt.val}
                className={`${styles.spacingBtn} ${
                  lineHeightRatio === opt.val ? styles.spacingBtnActive : ""
                }`}
                onClick={() => onLineHeightChange(opt.val)}
                title={`Line spacing ${opt.label}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.headerRight}>
          <button
            className={`${styles.modeToggleBtn} ${!isEditing ? styles.modeToggleActive : ""}`}
            onClick={() => setIsEditing((v) => !v)}
            title="Toggle between typing and stylus pen annotation mode"
          >
            {isEditing ? "Done Typing" : "Edit Code"}
          </button>

          <button
            className={styles.copyBtn}
            onClick={handleCopy}
            title="Copy clean formatted code to clipboard"
          >
            {copied ? (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span style={{ color: "#22c55e" }}>Copied!</span>
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <span>Copy Raw</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Editor Body */}
      <div
        className={styles.editorBody}
        style={{
          lineHeight: `${computedLineHeightPx}px`,
          fontSize: `${fontSizePx}px`,
        }}
      >
        {/* Line Numbers Gutter */}
        <div className={styles.gutter} aria-hidden="true">
          {lines.map((_, i) => (
            <div
              key={i}
              className={styles.gutterLine}
              style={{ height: `${computedLineHeightPx}px` }}
            >
              {i + 1}
            </div>
          ))}
        </div>

        {/* Code Content Area */}
        <div className={styles.codeArea}>
          {/* Syntax Highlighted View */}
          <div className={styles.syntaxLayer} aria-hidden="true">
            {lines.map((line, i) => (
              <div
                key={i}
                className={styles.syntaxLine}
                style={{ height: `${computedLineHeightPx}px` }}
                dangerouslySetInnerHTML={{
                  __html: highlightCodeLine(line, language),
                }}
              />
            ))}
          </div>

          {/* Editable Textarea (active during edit mode) */}
          <textarea
            ref={textareaRef}
            value={code}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            className={`${styles.textarea} ${
              !isEditing || isDrawingMode ? styles.textareaDisabled : ""
            }`}
            style={{
              lineHeight: `${computedLineHeightPx}px`,
              fontSize: `${fontSizePx}px`,
            }}
            placeholder="Type or paste your code snippet here..."
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
          />
        </div>
      </div>
    </div>
  );
}

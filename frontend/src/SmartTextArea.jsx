import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import './SmartTextArea.css';

/**
 * Detect format: 'json' | 'xml' | 'text'
 */
function detectFormat(text) {
  const trimmed = text.trim();
  if (!trimmed) return 'text';

  // JSON heuristic
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    return 'json';
  }

  // XML heuristic
  if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
    return 'xml';
  }

  return 'text';
}

/**
 * Find the line number for a character position in text.
 */
function posToLine(text, pos) {
  return text.substring(0, pos).split('\n').length;
}

/**
 * Custom JSON linter — scans text to find the ACTUAL error location.
 * JSON.parse reports where the parser FAILS (e.g. at '}'), but the real
 * issue (e.g. a trailing comma) is earlier. This scanner catches trailing
 * commas and other common errors at their actual position.
 *
 * Returns { valid, error, errorLine }
 */
function validateJSON(text) {
  try {
    JSON.parse(text);
    return { valid: true, error: null, errorLine: null };
  } catch (e) {
    const msg = e.message;
    let errorPos = -1;

    // Extract position from error message (Chrome/V8 style: "at position 123")
    const posMatch = msg.match(/position\s+(\d+)/i);
    if (posMatch) {
      errorPos = parseInt(posMatch[1], 10);
    } else {
      // Firefox style: "line 123 column 456"
      const linColMatch = msg.match(/line\s+(\d+)\s+column\s+(\d+)/i);
      if (linColMatch) {
        const lineNum = parseInt(linColMatch[1], 10);
        const colNum = parseInt(linColMatch[2], 10);
        const lines = text.split('\n');
        errorPos = 0;
        for (let j = 0; j < lineNum - 1; j++) {
          errorPos += lines[j].length + 1; // +1 for \n
        }
        errorPos += colNum - 1;
      }
    }

    // ── Parser-Anchored Backtrack ──
    // If we have a failure position, look backwards for the ACTUAL cause (like a trailing comma)
    if (errorPos !== -1) {
      let i = errorPos - 1;
      // Skip backwards over whitespace
      while (i >= 0 && /[\s\n\r\t]/.test(text[i])) i--;

      // If the first non-whitespace character before the failure is a comma,
      // then that comma IS the trailing comma causing the parse error.
      if (text[i] === ',') {
        const actualLine = posToLine(text, i);
        return {
          valid: false,
          error: "Invalid JSON",
          errorLine: actualLine,
        };
      }
    }

    // Fallback: Use the line reported directly in the message or derived from position
    let fallbackLine = null;
    const lineMatch = msg.match(/line\s+(\d+)/i);
    if (lineMatch) {
      fallbackLine = parseInt(lineMatch[1], 10);
    } else if (errorPos !== -1) {
      fallbackLine = posToLine(text, errorPos);
    }

    let cleanMsg = msg.replace(/^JSON\.parse:\s*/i, '');
    if (cleanMsg.length > 100) cleanMsg = cleanMsg.substring(0, 100) + '…';
    return { valid: false, error: `Invalid JSON: ${cleanMsg}`, errorLine: fallbackLine };
  }
}

/**
 * Validate XML — returns { valid, error, errorLine }
 */
function validateXML(text) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'application/xml');
  const parseError = doc.querySelector('parsererror');
  if (!parseError) {
    return { valid: true, error: null, errorLine: null };
  }

  const errorText = parseError.textContent;
  let errorLine = null;
  const lineMatch = errorText.match(/line\s+(\d+)/i);
  if (lineMatch) {
    errorLine = parseInt(lineMatch[1], 10);
  }

  // Clean up the error message
  let cleanError = errorText.split('\n')[0].trim();
  if (cleanError.length > 120) cleanError = cleanError.substring(0, 120) + '…';

  return { valid: false, error: cleanError, errorLine };
}

/**
 * Beautify JSON string
 */
function beautifyJSON(text) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text; // return as-is if can't parse
  }
}

/**
 * Beautify XML string
 */
function beautifyXML(xml) {
  let formatted = '';
  let indent = '';
  const tab = '  ';
  xml = xml.replace(/>\s*</g, '><');
  xml.split(/>\s*</).forEach((node) => {
    if (node.match(/^\/\w/)) indent = indent.substring(tab.length);
    formatted += indent + '<' + node + '>\r\n';
    if (node.match(/^<?\w[^>]*[^/]$/)) indent += tab;
  });
  return formatted.trim();
}

/**
 * SmartTextArea — code-editor-style textarea with line numbers,
 * format detection, beautify, and error highlighting.
 */
export default function SmartTextArea({
  value = '',
  onChange,
  placeholder = '',
  readOnly = false,
  dark = false,
  id,
  showBeautify = true,
  maxHeight = '75vh', // Limit growth to stay within page
}) {
  const textareaRef = useRef(null);
  const gutterRef = useRef(null);
  const [copied, setCopied] = React.useState(false);

  // ── Format detection ──────────────────────────────
  const format = useMemo(() => detectFormat(value), [value]);

  // ── Validation ────────────────────────────────────
  const validation = useMemo(() => {
    const trimmed = value.trim();
    if (!trimmed) return { valid: true, error: null, errorLine: null };

    if (format === 'json') return validateJSON(trimmed);
    if (format === 'xml') return validateXML(trimmed);
    return { valid: true, error: null, errorLine: null };
  }, [value, format]);

  // ── Auto-resize (Disabled to prevent page expansion) ───
  // We now rely on CSS flexbox and maxHeight to control the editor's size.

  const autoResize = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const sHeight = textarea.scrollHeight;
    textarea.style.height = sHeight + 'px';
  }, []);

  useEffect(() => {
    autoResize();
  }, [value, autoResize]);


  // ── Sync gutter scroll with textarea ──────────────
  const handleScroll = useCallback(() => {
    if (gutterRef.current && textareaRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  // ── Line count ────────────────────────────────────
  const lines = useMemo(() => {
    const lineCount = value.split('\n').length;
    return Array.from({ length: lineCount }, (_, i) => i + 1);
  }, [value]);

  // ── Change handler ────────────────────────────────
  const handleChange = (e) => {
    if (onChange) onChange(e.target.value);
  };

  // ── Beautify handler ──────────────────────────────
  const handleBeautify = () => {
    if (!onChange) return;
    const trimmed = value.trim();
    if (!trimmed) return;

    if (format === 'json') {
      onChange(beautifyJSON(trimmed));
    } else if (format === 'xml') {
      onChange(beautifyXML(trimmed));
    }
  };

  // ── Copy handler ──────────────────────────────────
  const handleCopy = () => {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ── Format label ──────────────────────────────────
  const formatLabel = format === 'json' ? 'JSON' : format === 'xml' ? 'XML' : 'TEXT';

  return (
    <div className={`smart-editor${dark ? ' smart-editor--dark' : ''}`}>
      {/* Toolbar */}
      <div className="smart-editor__toolbar">
        <div className="smart-editor__toolbar-left">
          {value.trim() && (
            <span className="smart-editor__format-badge">{formatLabel}</span>
          )}
        </div>
        <div className="smart-editor__toolbar-actions">
          {value.trim() && (
            <button
              type="button"
              className={`smart-editor__beautify-btn ${copied ? 'copied' : ''}`}
              onClick={handleCopy}
              title="Copy to clipboard"
            >
              {copied ? '✓ Copied' : '📋 Copy'}
            </button>
          )}
          {showBeautify && value.trim() && format !== 'text' && (
            <button
              type="button"
              className="smart-editor__beautify-btn"
              onClick={handleBeautify}
              title="Beautify / Format"
            >
              ✨ Beautify
            </button>
          )}
        </div>
      </div>

      {/* Body: Gutter + Textarea */}
      <div className="smart-editor__body" style={{ maxHeight }}>
        <div className="smart-editor__gutter" ref={gutterRef}>
          {lines.map((lineNum) => (
            <div
              key={lineNum}
              className={`smart-editor__gutter-line${
                validation.errorLine === lineNum ? ' error' : ''
              }`}
            >
              {lineNum}
            </div>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          id={id}
          className="smart-editor__textarea"
          value={value}
          onChange={handleChange}
          onScroll={handleScroll}
          placeholder={placeholder}
          readOnly={readOnly}
          spellCheck={false}
          wrap="off"
          style={{ maxHeight, overflowY: 'auto' }}
        />
      </div>

      {/* Error badge */}
      {!validation.valid && validation.error && (
        <div className="smart-editor__error-badge">
          <span className="smart-editor__error-icon">❌</span>
          <span>
            {validation.errorLine
              ? `Line ${validation.errorLine}: ${validation.error}`
              : validation.error}
          </span>
        </div>
      )}
    </div>
  );
}

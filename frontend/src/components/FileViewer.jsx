import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { ConversationPanel } from './ConversationModal';

const API = '';

function findSegmentForLine(segments, lineNum) {
  if (!Array.isArray(segments)) return null;
  for (const seg of segments) {
    const start = seg.start_line ?? seg.startLine;
    const end = seg.end_line ?? seg.endLine;
    if (lineNum >= start && lineNum <= end) return seg;
  }
  return null;
}

function findAttributionForLine(attributions, lineNum) {
  if (!Array.isArray(attributions)) return null;
  for (const a of attributions) {
    const start = a.start_line ?? a.startLine;
    const end = a.end_line ?? a.endLine;
    if (lineNum >= start && lineNum <= end) return a;
  }
  return null;
}

function formatAuthorTime(ts) {
  if (ts == null) return '';
  const d = new Date(ts * 1000);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Light background from commit sha for segment hint */
function gutterColorForSegment(commitSha, index) {
  const str = commitSha ? String(commitSha).slice(0, 7) : `seg-${index}`;
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsla(${hue}, 18%, 94%, 0.85)`;
}

const LINE_HEIGHT = 14;
const GUTTER_WIDTH = 36;
const RESIZE_HANDLE_WIDTH = 6;
const BLAME_PANE_MIN = 120;
const BLAME_PANE_MAX = 400;
const SIDE_PANE_MIN = 200;
const SIDE_PANE_MAX = 500;

export default function FileViewer({ path, content, gitBlameSegments, agentTraceBlame }) {
  const [hoverLine, setHoverLine] = useState(null);
  const [pinnedLine, setPinnedLine] = useState(null);
  const [showGitBlame, setShowGitBlame] = useState(false);
  const [showTraceBlame, setShowTraceBlame] = useState(false);
  const [blamePaneWidth, setBlamePaneWidth] = useState(180);
  const [tracePaneWidth, setTracePaneWidth] = useState(180);
  const [sidePaneWidth, setSidePaneWidth] = useState(260);
  const [resizingBlame, setResizingBlame] = useState(false);
  const [resizingTrace, setResizingTrace] = useState(false);
  const [resizingSide, setResizingSide] = useState(false);
  const [conversationUrl, setConversationUrl] = useState(null);
  const [conversationContent, setConversationContent] = useState(null);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [conversationError, setConversationError] = useState(null);
  const dragStart = useRef({ x: 0, width: 0 });

  const fetchConversation = useCallback(() => {
    if (!conversationUrl) return;
    setConversationLoading(true);
    setConversationError(null);
    setConversationContent(null);
    fetch(`${API}/api/conversation?url=${encodeURIComponent(conversationUrl)}`)
      .then((r) => {
        if (!r.ok) return r.json().then((j) => Promise.reject(new Error(j.error || r.statusText)));
        return r.json();
      })
      .then((data) => {
        if (data.open_external && data.url) {
          window.open(data.url, '_blank', 'noopener,noreferrer');
          setConversationUrl(null);
          setConversationLoading(false);
          return;
        }
        setConversationContent(data.content ?? '');
        setConversationLoading(false);
      })
      .catch((e) => {
        setConversationError(e.message || 'Failed to load conversation');
        setConversationLoading(false);
      });
  }, [conversationUrl]);

  useEffect(() => {
    if (conversationUrl) fetchConversation();
  }, [conversationUrl, fetchConversation]);

  const showAnyBlame = showGitBlame || showTraceBlame;

  useEffect(() => {
    if (!resizingBlame && !resizingTrace && !resizingSide) return;
    const onMove = (e) => {
      const dx = e.clientX - dragStart.current.x;
      if (resizingBlame) {
        const w = Math.max(BLAME_PANE_MIN, Math.min(BLAME_PANE_MAX, dragStart.current.width + dx));
        setBlamePaneWidth(w);
      } else if (resizingTrace) {
        const w = Math.max(BLAME_PANE_MIN, Math.min(BLAME_PANE_MAX, dragStart.current.width + dx));
        setTracePaneWidth(w);
      } else if (resizingSide) {
        const w = Math.max(SIDE_PANE_MIN, Math.min(SIDE_PANE_MAX, dragStart.current.width - dx));
        setSidePaneWidth(w);
      }
    };
    const onUp = () => {
      setResizingBlame(false);
      setResizingTrace(false);
      setResizingSide(false);
    };
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
  }, [resizingBlame, resizingTrace, resizingSide]);

  const lines = useMemo(() => {
    if (content == null || content === '') return [];
    return content.split('\n');
  }, [content]);

  const detailLine = pinnedLine ?? hoverLine;
  const gitSegment = detailLine != null ? findSegmentForLine(gitBlameSegments, detailLine) : null;
  const attr =
    detailLine != null && agentTraceBlame?.attributions
      ? findAttributionForLine(agentTraceBlame.attributions, detailLine)
      : null;

  const handleLineClick = useCallback((lineNum) => {
    setPinnedLine((prev) => (prev === lineNum ? null : lineNum));
  }, []);

  const segments = Array.isArray(gitBlameSegments) ? gitBlameSegments : [];
  const attributions = Array.isArray(agentTraceBlame?.attributions) ? agentTraceBlame.attributions : [];

  return (
    <>
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        minWidth: 0,
      }}
    >
      {/* Toggles: Git blame and/or Agent trace blame (can select both, one, or none = file only) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          borderBottom: '1px solid #e0e0e0',
          backgroundColor: '#f8f8f8',
          fontSize: 12,
          flexShrink: 0,
          padding: '4px 12px',
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showGitBlame}
            onChange={(e) => setShowGitBlame(e.target.checked)}
          />
          <span style={{ color: showGitBlame ? '#0969da' : '#656d76', fontWeight: showGitBlame ? 600 : 400 }}>
            Git blame
          </span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showTraceBlame}
            onChange={(e) => setShowTraceBlame(e.target.checked)}
          />
          <span style={{ color: showTraceBlame ? '#0a7c42' : '#656d76', fontWeight: showTraceBlame ? 600 : 400 }}>
            Agent trace blame
          </span>
        </label>
        {!showAnyBlame && (
          <span style={{ color: '#888', fontSize: 11 }}>File only — check one or both for blame</span>
        )}
      </div>

      {/* Main: scrollable file; side pane only when Git or Trace tab */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          minHeight: 0,
          minWidth: 0,
        }}
      >
        {/* Single scroll container: each row = line number | blame? | code so they stay aligned */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            overflow: 'auto',
          }}
        >
          {lines.map((line, i) => {
            const lineNum = i + 1;
            const seg = findSegmentForLine(segments, lineNum);
            const a = findAttributionForLine(attributions, lineNum);
            const hasTrace = a != null;
            const isHover = hoverLine === lineNum;
            const isPinned = pinnedLine === lineNum;
            const showHighlight = showAnyBlame;
            const rowHighlightBg = showHighlight && (isPinned ? 'rgba(10, 124, 66, 0.1)' : isHover ? 'rgba(9, 105, 218, 0.06)' : null);
            const gutterBg = rowHighlightBg ?? (!showAnyBlame ? '#f6f8fa' : (seg ? gutterColorForSegment(seg.commit_sha, seg.start_line) : undefined));
            const blameBg = rowHighlightBg ?? '#fafafa';
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  minHeight: LINE_HEIGHT,
                  boxSizing: 'border-box',
                  cursor: showHighlight ? 'pointer' : 'default',
                }}
                onMouseEnter={showHighlight ? () => setHoverLine(lineNum) : undefined}
                onMouseLeave={showHighlight ? () => setHoverLine(null) : undefined}
                onClick={showHighlight ? () => handleLineClick(lineNum) : undefined}
              >
                {/* Line number — same row, stretches with code if it wraps */}
                <div
                  style={{
                    flex: `0 0 ${GUTTER_WIDTH}px`,
                    width: GUTTER_WIDTH,
                    borderRight: '1px solid #e0e0e0',
                    fontFamily: 'ui-monospace, monospace',
                    fontSize: 10,
                    lineHeight: `${LINE_HEIGHT}px`,
                    color: '#656d76',
                    textAlign: 'right',
                    userSelect: 'none',
                    paddingRight: 4,
                    backgroundColor: gutterBg,
                    borderLeft: showAnyBlame && hasTrace ? '2px solid #0a7c42' : '2px solid transparent',
                    display: 'flex',
                    alignItems: 'flex-start',
                    paddingTop: 0,
                  }}
                >
                  <span style={{ flexShrink: 0 }}>{lineNum}</span>
                </div>

                {/* Git blame column — when showGitBlame */}
                {showGitBlame && (
                  <div
                    style={{
                      flex: `0 0 ${blamePaneWidth}px`,
                      width: blamePaneWidth,
                      borderRight: '1px solid #e0e0e0',
                      fontFamily: 'ui-monospace, monospace',
                      fontSize: 9,
                      lineHeight: `${LINE_HEIGHT}px`,
                      color: '#656d76',
                      userSelect: 'none',
                      padding: '0 4px',
                      backgroundColor: blameBg,
                      overflowWrap: 'break-word',
                      wordBreak: 'break-word',
                      whiteSpace: 'normal',
                      display: 'flex',
                      alignItems: 'flex-start',
                    }}
                    title={seg ? `${seg.commit_sha?.slice(0, 7)} ${seg.author} — ${seg.summary || ''}` : ''}
                  >
                    {seg ? (
                      <>
                        <span style={{ color: '#0969da', fontFamily: 'monospace' }}>{seg.commit_sha?.slice(0, 7) ?? '—'}</span>
                        <span style={{ color: '#656d76', marginLeft: 4 }}>{seg.author ?? '—'}</span>
                      </>
                    ) : (
                      <span style={{ color: '#adbac7' }}>—</span>
                    )}
                  </div>
                )}

                {/* Resize handle between git and trace — only when both are on */}
                {showGitBlame && showTraceBlame && (
                  <div
                    role="separator"
                    style={{
                      flex: `0 0 ${RESIZE_HANDLE_WIDTH}px`,
                      width: RESIZE_HANDLE_WIDTH,
                      minHeight: LINE_HEIGHT,
                      cursor: 'col-resize',
                      backgroundColor: resizingBlame ? 'rgba(9, 105, 218, 0.2)' : 'transparent',
                      borderLeft: '1px solid #e0e0e0',
                      flexShrink: 0,
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      dragStart.current = { x: e.clientX, width: blamePaneWidth };
                      setResizingBlame(true);
                    }}
                  />
                )}

                {/* Agent trace blame column — when showTraceBlame */}
                {showTraceBlame && (
                  <div
                    style={{
                      flex: `0 0 ${tracePaneWidth}px`,
                      width: tracePaneWidth,
                      borderRight: '1px solid #e0e0e0',
                      fontFamily: 'ui-monospace, monospace',
                      fontSize: 9,
                      lineHeight: `${LINE_HEIGHT}px`,
                      color: '#656d76',
                      userSelect: 'none',
                      padding: '0 4px',
                      backgroundColor: blameBg,
                      overflowWrap: 'break-word',
                      wordBreak: 'break-word',
                      whiteSpace: 'normal',
                      display: 'flex',
                      alignItems: 'flex-start',
                    }}
                    title={a ? `Model: ${a.model_id || '—'}` : ''}
                  >
                    {a ? (
                      <span style={{ color: '#0a7c42', fontSize: 10 }}>{a.model_id ?? '—'}</span>
                    ) : (
                      <span style={{ color: '#adbac7' }}>—</span>
                    )}
                  </div>
                )}

                {/* Resize handle between blame area and code — resizes last blame column (trace if on, else git) */}
                {showAnyBlame && (
                  <div
                    role="separator"
                    style={{
                      flex: `0 0 ${RESIZE_HANDLE_WIDTH}px`,
                      width: RESIZE_HANDLE_WIDTH,
                      minHeight: LINE_HEIGHT,
                      cursor: 'col-resize',
                      backgroundColor: (showTraceBlame ? resizingTrace : resizingBlame) ? 'rgba(9, 105, 218, 0.2)' : 'transparent',
                      borderLeft: '1px solid #e0e0e0',
                      flexShrink: 0,
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (showTraceBlame) {
                        dragStart.current = { x: e.clientX, width: tracePaneWidth };
                        setResizingTrace(true);
                      } else {
                        dragStart.current = { x: e.clientX, width: blamePaneWidth };
                        setResizingBlame(true);
                      }
                    }}
                  />
                )}

                {/* Code — same row; can wrap and row grows, gutter/blame stretch with it */}
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontFamily: 'ui-monospace, monospace',
                    fontSize: 12,
                    lineHeight: `${LINE_HEIGHT}px`,
                    paddingLeft: 6,
                    backgroundColor: rowHighlightBg ?? 'transparent',
                    borderLeft: showHighlight && isPinned ? '2px solid #0a7c42' : '2px solid transparent',
                    display: 'flex',
                    alignItems: 'flex-start',
                  }}
                >
                  <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {line || '\u00A0'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Side pane resize handle + pane — when any blame is selected */}
        {showAnyBlame && (
          <>
            <div
              role="separator"
              style={{
                flex: `0 0 ${RESIZE_HANDLE_WIDTH}px`,
                width: RESIZE_HANDLE_WIDTH,
                minHeight: 0,
                cursor: 'col-resize',
                backgroundColor: resizingSide ? 'rgba(9, 105, 218, 0.2)' : '#e8e8e8',
                borderLeft: '1px solid #e0e0e0',
                flexShrink: 0,
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                dragStart.current = { x: e.clientX, width: sidePaneWidth };
                setResizingSide(true);
              }}
            />
            <aside
              style={{
                flex: `0 0 ${sidePaneWidth}px`,
                width: sidePaneWidth,
                borderLeft: '1px solid #e0e0e0',
                backgroundColor: '#fafafa',
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0,
                minHeight: 0,
                overflow: 'hidden',
              }}
            >
            <div
              style={{
                padding: '4px 8px',
                borderBottom: '1px solid #e8e8e8',
                backgroundColor: '#f0f0f0',
                fontSize: 11,
                fontWeight: 600,
                color: '#333',
                flexShrink: 0,
              }}
            >
              {detailLine != null ? (
                <>
                  Line {detailLine}
                  {pinnedLine === detailLine && (
                    <button
                      type="button"
                      onClick={() => setPinnedLine(null)}
                      style={{
                        marginLeft: 8,
                        padding: '2px 6px',
                        fontSize: 10,
                        cursor: 'pointer',
                        border: '1px solid #ccc',
                        borderRadius: 4,
                        background: '#fff',
                      }}
                    >
                      Unpin
                    </button>
                  )}
                </>
              ) : (
                'Hover or click a line'
              )}
            </div>
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                padding: 8,
                fontSize: 11,
              }}
            >
              <div
                style={{
                  flex: conversationUrl != null ? '0 0 auto' : 1,
                  minHeight: 0,
                  overflow: 'auto',
                }}
              >
                {detailLine == null ? (
                  <p style={{ margin: 0, color: '#888', fontSize: 11 }}>
                    Hover or click a line to see blame details here. Pane stays visible while you scroll.
                  </p>
                ) : (
                  <>
                    {showGitBlame && (
                      <section style={{ marginBottom: showTraceBlame ? 16 : 0 }}>
                        <div style={{ color: '#0969da', fontWeight: 600, fontSize: 11, marginBottom: 6 }}>Git blame</div>
                        <GitBlameTab
                          lineNum={detailLine}
                          gitSegment={gitSegment}
                          segments={segments}
                          formatAuthorTime={formatAuthorTime}
                        />
                      </section>
                    )}
                    {showTraceBlame && (
                      <section>
                        <div style={{ color: '#0a7c42', fontWeight: 600, fontSize: 11, marginBottom: 6 }}>Agent trace blame</div>
                        <TraceBlameTab
                          lineNum={detailLine}
                          attr={attr}
                          attributions={attributions}
                          onOpenConversation={setConversationUrl}
                        />
                      </section>
                    )}
                  </>
                )}
              </div>
              {conversationUrl != null && (
                <ConversationPanel
                  content={conversationContent}
                  loading={conversationLoading}
                  error={conversationError}
                  onClose={() => {
                    setConversationUrl(null);
                    setConversationContent(null);
                    setConversationError(null);
                  }}
                  onRetry={fetchConversation}
                />
              )}
            </div>
            </aside>
          </>
        )}
      </div>
    </div>
    </>
  );
}

function GitBlameTab({ lineNum, gitSegment, segments, formatAuthorTime }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {gitSegment ? (
        <section>
          <div style={{ color: '#656d76', marginBottom: 2, fontWeight: 600, fontSize: 10 }}>This segment</div>
          <div style={{ fontSize: 11 }}><strong>{gitSegment.author ?? '—'}</strong></div>
          <div style={{ fontSize: 10, color: '#666' }}>{formatAuthorTime(gitSegment.author_time)}</div>
          <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#0969da' }}>
            {gitSegment.commit_sha?.slice(0, 7) ?? '—'}
          </div>
          {gitSegment.summary && (
            <div style={{ marginTop: 2, color: '#555', fontSize: 10 }}>{gitSegment.summary}</div>
          )}
          <div style={{ marginTop: 2, fontSize: 10, color: '#656d76' }}>
            Lines {gitSegment.start_line}–{gitSegment.end_line}
          </div>
        </section>
      ) : (
        <p style={{ margin: 0, color: '#888', fontSize: 10 }}>No git blame for line {lineNum}.</p>
      )}

      {segments.length > 0 && (
        <section>
          <div style={{ color: '#656d76', marginBottom: 2, fontWeight: 600, fontSize: 10 }}>
            Ranges in this file
          </div>
          <ul style={{ margin: 0, paddingLeft: 14, maxHeight: 120, overflow: 'auto', fontSize: 10 }}>
            {segments.map((seg, idx) => (
              <li key={idx} style={{ marginBottom: 4 }}>
                <span style={{ fontFamily: 'monospace', color: '#0969da' }}>
                  {seg.commit_sha?.slice(0, 7) ?? '—'}
                </span>
                {' · '}
                <span style={{ color: '#555' }}>lines {seg.start_line}–{seg.end_line}</span>
                {seg.summary && (
                  <span style={{ color: '#888' }}> — {seg.summary.slice(0, 35)}
                    {seg.summary.length > 35 ? '…' : ''}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function TraceBlameTab({ lineNum, attr, attributions, onOpenConversation }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {attr ? (
        <section>
          <div style={{ color: '#656d76', marginBottom: 2, fontWeight: 600, fontSize: 10 }}>This attribution</div>
          <div style={{ fontSize: 10 }}>Tier: {attr.tier ?? '—'}</div>
          {attr.confidence != null && (
            <div style={{ fontSize: 10 }}>Confidence: {(attr.confidence * 100).toFixed(0)}%</div>
          )}
          {attr.trace_id && (
            <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#0a7c42', wordBreak: 'break-all' }}>
              Trace ID: {attr.trace_id}
            </div>
          )}
          {attr.model_id && (
            <div style={{ fontSize: 10, wordBreak: 'break-all' }}>Model ID: {attr.model_id}</div>
          )}
          {attr.contributor_type && <div style={{ fontSize: 10 }}>Type: {attr.contributor_type}</div>}
          {attr.tool && <div style={{ fontSize: 10 }}>Tool: {attr.tool}</div>}
          {attr.commit_sha && (
            <div style={{ fontSize: 10, color: '#656d76' }}>
              Commit: {attr.commit_sha.slice(0, 7)}
            </div>
          )}
          {attr.conversation_url && (
            <button
              type="button"
              onClick={() => onOpenConversation?.(attr.conversation_url)}
              style={{
                fontSize: 10,
                wordBreak: 'break-all',
                color: '#0a7c42',
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                textDecoration: 'underline',
                textAlign: 'left',
              }}
            >
              Open conversation
            </button>
          )}
          {attr.conversation_summary && (
            <div style={{ marginTop: 2, color: '#555', fontSize: 10 }}>{attr.conversation_summary}</div>
          )}
          {attr.signals && attr.signals.length > 0 && (
            <div style={{ marginTop: 2, fontSize: 10, color: '#656d76' }}>
              Signals: {attr.signals.join(', ')}
            </div>
          )}
          <div style={{ marginTop: 2, fontSize: 10, color: '#656d76' }}>
            Lines {attr.start_line ?? attr.startLine}–{attr.end_line ?? attr.endLine}
          </div>
        </section>
      ) : (
        <p style={{ margin: 0, color: '#888', fontSize: 10 }}>No trace attribution for line {lineNum}.</p>
      )}

      {attributions.length > 0 && (
        <section>
          <div style={{ color: '#656d76', marginBottom: 2, fontWeight: 600, fontSize: 10 }}>
            Attributions in this file
          </div>
          <ul style={{ margin: 0, paddingLeft: 14, maxHeight: 120, overflow: 'auto', fontSize: 10 }}>
            {attributions.map((a, idx) => (
              <li key={idx} style={{ marginBottom: 4 }}>
                <span style={{ fontWeight: 600, color: '#0a7c42' }}>Tier {a.tier ?? '—'}</span>
                {' · '}
                <span style={{ color: '#555' }}>
                  lines {a.start_line ?? a.startLine}–{a.end_line ?? a.endLine}
                </span>
                {a.trace_id && (
                  <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#888' }}>
                    {' '}{a.trace_id.slice(0, 8)}…
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

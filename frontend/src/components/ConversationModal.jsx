import React, { useState, useEffect, useCallback } from 'react';

const API = '';

// ---------------------------------------------------------------------------
// Cursor transcript: one user message + one agent response.
// Segregate into two dialogue types only; apply markdown to agent, no extra parsing.
// ---------------------------------------------------------------------------

const USER_LINE_RE = /^\s*(user|human):\s*$/i;
const ASSISTANT_LINE_RE = /^\s*assistant:\s*$/i;

/**
 * Split transcript into one user block and one agent block.
 * - User: from first "user:" or "human:" up to first "assistant:" (exclusive), or to end if no assistant.
 * - Agent: from first "assistant:" to end (all subsequent content, including more "assistant:" lines).
 */
function parseCursorTranscript(content) {
  if (!content || typeof content !== 'string') return [];
  const lines = content.split('\n');
  let userStart = -1;
  let assistantStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (USER_LINE_RE.test(lines[i]) && userStart === -1) userStart = i;
    if (ASSISTANT_LINE_RE.test(lines[i]) && assistantStart === -1) assistantStart = i;
    if (userStart !== -1 && assistantStart !== -1) break;
  }
  const blocks = [];
  if (userStart !== -1 && (assistantStart === -1 || userStart < assistantStart)) {
    const end = assistantStart > userStart ? assistantStart : lines.length;
    const userContent = lines.slice(userStart + 1, end).join('\n').trim();
    if (userContent) blocks.push({ role: 'user', content: userContent, format: 'cursor' });
  }
  if (assistantStart !== -1) {
    const agentContent = lines.slice(assistantStart + 1).join('\n').trim();
    if (agentContent) blocks.push({ role: 'assistant', content: agentContent, format: 'cursor' });
  }
  if (blocks.length === 0 && content.trim()) {
    blocks.push({ role: 'raw', content: content.trim() });
  }
  return blocks;
}

/** Parse XML-style tag conversation into blocks (fallback) */
function parseTaggedConversation(content) {
  if (!content || typeof content !== 'string') return [];
  const blocks = [];
  const tagNames = ['user', 'assistant', 'human', 'ai', 'message', 'system'];
  let pos = 0;
  const s = content;
  while (pos < s.length) {
    const open = s.indexOf('<', pos);
    if (open === -1) break;
    const closeBracket = s.indexOf('>', open);
    if (closeBracket === -1) break;
    const tagPart = s.slice(open + 1, closeBracket).trim();
    const tagName = (tagPart.split(/\s/)[0] || '').toLowerCase();
    if (!tagNames.includes(tagName)) {
      pos = open + 1;
      continue;
    }
    const closeTag = `</${tagName}>`;
    const end = s.indexOf(closeTag, closeBracket + 1);
    if (end === -1) break;
    const body = s.slice(closeBracket + 1, end).trim();
    const role = tagName === 'message' ? (tagPart.match(/role\s*=\s*["']?(\w+)/i)?.[1] || 'message') : tagName;
    blocks.push({ role, rawTag: tagName, content: body, format: 'tag' });
    pos = end + closeTag.length;
  }
  if (blocks.length === 0 && content.trim()) {
    blocks.push({ role: 'raw', content: content.trim() });
  }
  return blocks;
}

/** Cursor format (user:/assistant:) → two blocks; else tag format; else single raw block */
function parseConversation(content) {
  if (!content || typeof content !== 'string') return [];
  const s = content.trim();
  if (!s) return [];
  if (s.split('\n').some((line) => USER_LINE_RE.test(line) || ASSISTANT_LINE_RE.test(line))) {
    const cursorBlocks = parseCursorTranscript(content);
    if (cursorBlocks.length > 0) return cursorBlocks;
  }
  const tagBlocks = parseTaggedConversation(content);
  if (tagBlocks.length > 0) return tagBlocks;
  return [{ role: 'raw', content: s }];
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');
}

/** Apply markdown only: **bold**, `code`, ```blocks```. No extra parsing. */
function applyMarkdown(text) {
  if (!text) return '';
  const placeholders = [];
  let out = String(text)
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const id = placeholders.length;
      placeholders.push(
        '<pre class="conv-code-block" data-lang="' + escapeHtml(lang) + '"><code>' +
          escapeHtml(code.trim()) + '</code></pre>'
      );
      return '\u0001' + id + '\u0001';
    });
  out = escapeHtml(out);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/`([^`]+)`/g, '<code class="conv-inline-code">$1</code>');
  placeholders.forEach((ph, i) => {
    out = out.split('\u0001' + i + '\u0001').join(ph);
  });
  return out;
}

/** User block: optionally strip <user_query> inner text, then escape (no markdown). */
function formatUserContent(text) {
  if (!text) return '';
  const m = text.match(/<user_query>([\s\S]*?)<\/user_query>/i);
  const plain = m ? m[1].trim() : text;
  return escapeHtml(plain);
}

/** Agent block: show as-is with markdown only. */
function formatAgentContent(text) {
  return applyMarkdown(text || '');
}

const AGENT_ROLES = new Set(['assistant', 'ai', 'message']);
const AGENT_PREVIEW_LEN = 400;
const AGENT_CONTENT_MAX_HEIGHT = 320;

function ConversationBlock({ block, index, expandAllAgents, expandedBlocks, onToggleBlock }) {
  const isAgent = AGENT_ROLES.has(block.role);
  const isCursor = block.format === 'cursor';
  const isAgentBlock = isAgent && (block.role === 'assistant' || block.role === 'ai' || block.role === 'message');
  const isLongAgent = isAgentBlock && block.content.length > AGENT_PREVIEW_LEN;
  const effectiveExpanded = expandAllAgents === true || !isLongAgent || (expandedBlocks && expandedBlocks.has(index));
  const displayContent =
    isLongAgent && !effectiveExpanded ? block.content.slice(0, AGENT_PREVIEW_LEN) + '…' : block.content;

  const formatted =
    isCursor && block.role === 'user'
      ? formatUserContent(block.content)
      : isCursor && block.role === 'assistant'
        ? formatAgentContent(displayContent)
        : block.format === 'tag' || block.role === 'raw'
          ? escapeHtml(block.content)
          : formatAgentContent(displayContent);

  const label = block.role === 'user' ? 'User' : block.role === 'assistant' ? 'Agent' : block.role;

  return (
    <div
      style={{
        marginBottom: 12,
        border: '1px solid #e0e0e0',
        borderRadius: 6,
        overflow: 'hidden',
        backgroundColor: isAgent ? '#fafbfc' : '#fff',
      }}
    >
      <div
        style={{
          padding: '6px 10px',
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'capitalize',
          color: isAgent ? '#0a7c42' : '#0969da',
          backgroundColor: isAgent ? '#e8f5e9' : '#e8f4fc',
          borderBottom: '1px solid #e0e0e0',
        }}
      >
        {label}
      </div>
      <div
        style={{
          padding: 10,
          fontSize: 12,
          fontFamily: 'inherit',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          lineHeight: 1.45,
          maxHeight: isLongAgent && !effectiveExpanded
            ? 120
            : isLongAgent && effectiveExpanded
              ? AGENT_CONTENT_MAX_HEIGHT
              : undefined,
          overflow: isLongAgent && !effectiveExpanded
            ? 'hidden'
            : isLongAgent && effectiveExpanded
              ? 'auto'
              : 'visible',
        }}
        dangerouslySetInnerHTML={{ __html: formatted }}
      />
      {isLongAgent && (
        <div style={{ padding: '0 10px 10px' }}>
          <button
            type="button"
            onClick={() => onToggleBlock && onToggleBlock(index, effectiveExpanded)}
            style={{
              padding: '4px 10px',
              fontSize: 11,
              color: '#0969da',
              background: 'none',
              border: '1px solid #0969da',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            {effectiveExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      )}
    </div>
  );
}

/** Inline conversation panel for the side pane: fills remaining height, scrollable body. */
export function ConversationPanel({ content, loading, error, onClose, onRetry }) {
  const [expandAllAgents, setExpandAllAgents] = useState(false);
  const [expandedBlocks, setExpandedBlocks] = useState(() => new Set());
  const blocks = content != null ? parseConversation(content) : [];
  const hasLongAgent = blocks.some(
    (b) => AGENT_ROLES.has(b.role) && b.content && b.content.length > AGENT_PREVIEW_LEN
  );

  const handleExpandAllChange = (checked) => {
    setExpandAllAgents(checked);
    if (!checked) setExpandedBlocks(new Set());
  };

  const handleToggleBlock = (index, currentlyExpanded) => {
    if (currentlyExpanded) {
      setExpandedBlocks((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
      setExpandAllAgents(false);
    } else {
      setExpandedBlocks((prev) => new Set(prev).add(index));
      setExpandAllAgents(false);
    }
  };

  return (
    <section
      style={{
        marginTop: 12,
        border: '1px solid #e0e0e0',
        borderRadius: 6,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        flex: 1,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 8px',
          borderBottom: '1px solid #e0e0e0',
          backgroundColor: '#f0f0f0',
          fontSize: 11,
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        <span style={{ color: '#333' }}>Conversation</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!loading && !error && hasLongAgent && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, cursor: 'pointer', fontWeight: 400 }}>
              <input
                type="checkbox"
                checked={expandAllAgents}
                onChange={(e) => handleExpandAllChange(e.target.checked)}
              />
              <span>{expandAllAgents ? 'Collapse all' : 'Expand all'}</span>
            </label>
          )}
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '2px 8px',
              fontSize: 10,
              border: '1px solid #ccc',
              borderRadius: 4,
              cursor: 'pointer',
              backgroundColor: '#fff',
            }}
          >
            Close
          </button>
        </div>
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          padding: 8,
          fontSize: 11,
        }}
      >
        {loading && <div style={{ color: '#666', fontSize: 11 }}>Loading conversation…</div>}
        {error && (
          <div style={{ color: '#c00', fontSize: 11 }}>
            {error}
            <button
              type="button"
              onClick={onRetry}
              style={{ marginLeft: 6, padding: '2px 6px', fontSize: 10, cursor: 'pointer' }}
            >
              Retry
            </button>
          </div>
        )}
        {!loading && !error && blocks.length === 0 && content != null && (
          <pre
            style={{
              margin: 0,
              fontSize: 11,
              fontFamily: 'ui-monospace, monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {content}
          </pre>
        )}
        {!loading && !error && blocks.length > 0 &&
          blocks.map((block, i) => (
            <ConversationBlock
              key={i}
              block={block}
              index={i}
              expandAllAgents={expandAllAgents}
              expandedBlocks={expandedBlocks}
              onToggleBlock={handleToggleBlock}
            />
          ))}
      </div>
    </section>
  );
}

export default function ConversationModal({ conversationUrl, onClose }) {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandAllAgents, setExpandAllAgents] = useState(false);
  const [expandedBlocks, setExpandedBlocks] = useState(() => new Set());

  const fetchContent = useCallback(() => {
    if (!conversationUrl) return;
    setLoading(true);
    setError(null);
    setContent(null);
    fetch(`${API}/api/conversation?url=${encodeURIComponent(conversationUrl)}`)
      .then((r) => {
        if (!r.ok) return r.json().then((j) => Promise.reject(new Error(j.error || r.statusText)));
        return r.json();
      })
      .then((data) => {
        if (data.open_external && data.url) {
          window.open(data.url, '_blank', 'noopener,noreferrer');
          onClose();
          return;
        }
        setContent(data.content ?? '');
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message || 'Failed to load conversation');
        setLoading(false);
      });
  }, [conversationUrl]);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  const blocks = content != null ? parseConversation(content) : [];
  const hasLongAgent = blocks.some(
    (b) => AGENT_ROLES.has(b.role) && b.content && b.content.length > AGENT_PREVIEW_LEN
  );

  const handleExpandAllChange = (checked) => {
    setExpandAllAgents(checked);
    if (!checked) setExpandedBlocks(new Set());
  };

  const handleToggleBlock = (index, currentlyExpanded) => {
    if (currentlyExpanded) {
      setExpandedBlocks((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
      setExpandAllAgents(false);
    } else {
      setExpandedBlocks((prev) => new Set(prev).add(index));
      setExpandAllAgents(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.4)',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          width: '90%',
          maxWidth: 720,
          maxHeight: '85vh',
          backgroundColor: '#fff',
          borderRadius: 8,
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid #e0e0e0',
            backgroundColor: '#f8f8f8',
            flexShrink: 0,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Conversation</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {hasLongAgent && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', fontWeight: 400 }}>
                <input
                  type="checkbox"
                  checked={expandAllAgents}
                  onChange={(e) => handleExpandAllChange(e.target.checked)}
                />
                <span>{expandAllAgents ? 'Collapse all' : 'Expand all'}</span>
              </label>
            )}
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '4px 12px',
                fontSize: 12,
                border: '1px solid #ccc',
                borderRadius: 4,
                cursor: 'pointer',
                backgroundColor: '#fff',
              }}
            >
              Close
            </button>
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {loading && <div style={{ color: '#666', fontSize: 13 }}>Loading conversation…</div>}
          {error && (
            <div style={{ color: '#c00', fontSize: 13 }}>
              {error}
              <button
                type="button"
                onClick={fetchContent}
                style={{ marginLeft: 8, padding: '2px 8px', fontSize: 12, cursor: 'pointer' }}
              >
                Retry
              </button>
            </div>
          )}
          {!loading && !error && blocks.length === 0 && (
            <pre
              style={{
                margin: 0,
                fontSize: 12,
                fontFamily: 'ui-monospace, monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {content}
            </pre>
          )}
          {!loading && !error && blocks.length > 0 &&
            blocks.map((block, i) => (
              <ConversationBlock
                key={i}
                block={block}
                index={i}
                expandAllAgents={expandAllAgents}
                expandedBlocks={expandedBlocks}
                onToggleBlock={handleToggleBlock}
              />
            ))}
        </div>
      </div>
    </div>
  );
}

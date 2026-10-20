// ============================================================
// State
// ============================================================
let messages = []; // { role: 'user'|'model', parts: [{text}], image?, mimeType?, imageUrl? }
let pendingImages = []; // { base64, mimeType, previewUrl, name }
let isStreaming = false;

// ============================================================
// DOM refs
// ============================================================
let sendBtn, messageInput, attachBtn, fileInput, clearBtn,
    menuBtn, sidebarClose, sidebarOverlay, sidebar,
    chatContainer, messagesEl, typingIndicator, imagePreviewStrip, welcome;

// ============================================================
// Utility: escape HTML to prevent XSS
// ============================================================
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ============================================================
// Markdown renderer (safe — escapes HTML first)
// ============================================================
function renderMarkdown(text) {
  if (!text) return '';

  // Split into code blocks and non-code-block sections
  const parts = [];
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'code', lang: match[1] || '', content: match[2] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) });
  }

  let html = '';

  for (const part of parts) {
    if (part.type === 'code') {
      const langClass = part.lang ? ` class="language-${escapeHtml(part.lang)}"` : '';
      html += `<pre><code${langClass}>${escapeHtml(part.content.trimEnd())}</code></pre>`;
    } else {
      let t = part.content;

      // Escape HTML in text sections
      t = escapeHtml(t);

      // Headings (must be at start of line)
      t = t.replace(/^### (.+)$/gm, '<h3>$1</h3>');
      t = t.replace(/^## (.+)$/gm, '<h2>$1</h2>');
      t = t.replace(/^# (.+)$/gm, '<h1>$1</h1>');

      // Bold and italic
      t = t.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
      t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      t = t.replace(/\*(.+?)\*/g, '<em>$1</em>');
      t = t.replace(/_(.+?)_/g, '<em>$1</em>');

      // Inline code (after escaping so backticks are plain)
      t = t.replace(/`([^`]+)`/g, '<code>$1</code>');

      // Unordered lists
      t = t.replace(/^[ \t]*[-*+] (.+)$/gm, '<li>$1</li>');
      t = t.replace(/(<li>.*<\/li>)/s, (block) => `<ul>${block}</ul>`);
      // Fix multiple ul wrapping — wrap consecutive li runs
      t = t.replace(/(<\/li>\n?<li>)/g, '$1');
      // Simpler: replace adjacent li elements with wrapping
      t = t.replace(/((?:<li>.*?<\/li>\n?)+)/g, (block) => {
        // Only wrap if not already inside ul/ol
        if (!block.startsWith('<ul>') && !block.startsWith('<ol>')) {
          return `<ul>${block}</ul>`;
        }
        return block;
      });

      // Ordered lists
      t = t.replace(/^[ \t]*\d+\. (.+)$/gm, '<li data-ol>$1</li>');
      t = t.replace(/((?:<li data-ol>.*?<\/li>\n?)+)/g, (block) => {
        return `<ol>${block.replace(/ data-ol/g, '')}</ol>`;
      });

      // Paragraphs: double newlines → paragraph breaks
      // Replace \r\n with \n first
      t = t.replace(/\r\n/g, '\n');
      // Split on double newlines
      const paragraphs = t.split(/\n\n+/);
      t = paragraphs.map(p => {
        p = p.trim();
        if (!p) return '';
        // Don't wrap block elements in <p>
        if (/^<(h[1-6]|ul|ol|pre|blockquote)/.test(p)) return p;
        // Replace remaining single newlines with <br>
        p = p.replace(/\n/g, '<br>');
        return `<p>${p}</p>`;
      }).filter(Boolean).join('');

      html += t;
    }
  }

  return html;
}

// ============================================================
// Render a single message bubble into DOM
// ============================================================
function renderMessage(message, streaming = false) {
  const isUser = message.role === 'user';
  const isError = message.isError;

  const msgEl = document.createElement('div');
  msgEl.className = `message message--${isUser ? 'user' : 'assistant'}${isError ? ' message-error' : ''}`;

  const bubbleEl = document.createElement('div');
  bubbleEl.className = 'message-bubble';

  // Image (user messages with image)
  if (message.imageUrl) {
    const img = document.createElement('img');
    img.className = 'message-image';
    img.src = message.imageUrl;
    img.alt = 'Attached image';
    img.loading = 'lazy';
    bubbleEl.appendChild(img);
  }

  // Content
  const contentEl = document.createElement('div');
  contentEl.className = 'message-content';
  const textContent = message.parts && message.parts[0] ? message.parts[0].text : '';
  contentEl.innerHTML = renderMarkdown(textContent);
  bubbleEl.appendChild(contentEl);

  // Copy button for assistant messages
  if (!isUser && !isError) {
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.title = 'Copy response';
    copyBtn.setAttribute('aria-label', 'Copy response');
    copyBtn.textContent = '📋';
    copyBtn.addEventListener('click', () => {
      copyToClipboard(textContent, copyBtn);
    });
    bubbleEl.appendChild(copyBtn);
  }

  msgEl.appendChild(bubbleEl);

  // Timestamp
  const timeEl = document.createElement('div');
  timeEl.className = 'message-time';
  timeEl.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  msgEl.appendChild(timeEl);

  messagesEl.appendChild(msgEl);
  scrollToBottom();

  // Return reference so streaming can update contentEl
  return { msgEl, contentEl, bubbleEl, copyBtn: bubbleEl.querySelector('.copy-btn') };
}

// ============================================================
// Copy to clipboard
// ============================================================
function copyToClipboard(text, btnEl) {
  navigator.clipboard.writeText(text).then(() => {
    const prev = btnEl.textContent;
    btnEl.textContent = '✓';

    // Show tooltip
    const tooltip = document.createElement('span');
    tooltip.className = 'copy-tooltip';
    tooltip.textContent = 'Copied!';
    btnEl.parentElement.appendChild(tooltip);

    setTimeout(() => {
      btnEl.textContent = prev;
      if (tooltip.parentElement) tooltip.parentElement.removeChild(tooltip);
    }, 1800);
  }).catch(() => {
    // Fallback for older browsers
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    btnEl.textContent = '✓';
    setTimeout(() => { btnEl.textContent = '📋'; }, 1800);
  });
}

// ============================================================
// File handling
// ============================================================
function handleFileSelect(files) {
  const fileArray = Array.from(files);
  const maxSize = 10 * 1024 * 1024; // 10MB

  for (const file of fileArray) {
    if (!file.type.startsWith('image/')) {
      showToast('Only image files are supported.');
      continue;
    }
    if (file.size > maxSize) {
      showToast(`"${file.name}" exceeds the 10MB limit.`);
      continue;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const base64 = dataUrl.split(',')[1];
      pendingImages.push({
        base64,
        mimeType: file.type,
        previewUrl: dataUrl,
        name: file.name
      });
      renderImagePreviews();
    };
    reader.readAsDataURL(file);
  }
}

// ============================================================
// Render image preview strip
// ============================================================
function renderImagePreviews() {
  imagePreviewStrip.innerHTML = '';

  pendingImages.forEach((img, index) => {
    const thumb = document.createElement('div');
    thumb.className = 'image-thumb';

    const imgEl = document.createElement('img');
    imgEl.src = img.previewUrl;
    imgEl.alt = img.name;
    imgEl.title = img.name;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'image-thumb-remove';
    removeBtn.innerHTML = '✕';
    removeBtn.setAttribute('aria-label', `Remove ${img.name}`);
    removeBtn.addEventListener('click', () => {
      pendingImages.splice(index, 1);
      renderImagePreviews();
    });

    thumb.appendChild(imgEl);
    thumb.appendChild(removeBtn);
    imagePreviewStrip.appendChild(thumb);
  });
}

// ============================================================
// Simple toast notification
// ============================================================
function showToast(msg) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed; bottom: 90px; left: 50%; transform: translateX(-50%);
    background: #ef4444; color: #fff; padding: 8px 18px; border-radius: 8px;
    font-size: 13px; z-index: 9999; animation: fadeIn 0.2s ease;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => { if (toast.parentElement) document.body.removeChild(toast); }, 3000);
}

// ============================================================
// Show / hide typing indicator
// ============================================================
function showTypingIndicator() {
  typingIndicator.style.display = 'flex';
  scrollToBottom();
}

function hideTypingIndicator() {
  typingIndicator.style.display = 'none';
}

// ============================================================
// Scroll chat to bottom
// ============================================================
function scrollToBottom() {
  requestAnimationFrame(() => {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  });
}

// ============================================================
// Hide welcome screen
// ============================================================
function hideWelcome() {
  if (welcome && welcome.style.display !== 'none') {
    welcome.style.display = 'none';
  }
}

// ============================================================
// Stream response from /api/chat
// ============================================================
async function streamResponse(userMessages, attachedImage, attachedMimeType) {
  isStreaming = true;
  sendBtn.disabled = true;
  messageInput.disabled = true;

  showTypingIndicator();

  // Create a placeholder assistant message element
  const placeholderMsg = {
    role: 'model',
    parts: [{ text: '' }]
  };
  const { contentEl, msgEl, copyBtn } = renderMessage(placeholderMsg);
  hideTypingIndicator();

  let accumulated = '';

  try {
    const body = {
      messages: userMessages.map(m => ({
        role: m.role,
        parts: m.parts || [{ text: m.content || '' }]
      }))
    };

    // Only send the image with the last user message
    if (attachedImage && attachedMimeType) {
      body.image = attachedImage;
      body.mimeType = attachedMimeType;
    }

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      let errMsg = `Server error: ${response.status}`;
      try {
        const errData = await response.json();
        errMsg = errData.error || errMsg;
      } catch (_) { /* ignore */ }
      throw new Error(errMsg);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const data = trimmed.slice(5).trim();

        if (data === '[DONE]') {
          // Finalize
          break;
        }

        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            throw new Error(parsed.error);
          }
          if (parsed.chunk) {
            accumulated += parsed.chunk;
            contentEl.innerHTML = renderMarkdown(accumulated);
            // Update copy button's click handler with fresh accumulated text
            if (copyBtn) {
              copyBtn.onclick = () => copyToClipboard(accumulated, copyBtn);
            }
            scrollToBottom();
          }
        } catch (parseErr) {
          // If it's not our thrown error, skip malformed SSE data
          if (parseErr.message && !parseErr.message.includes('JSON')) {
            throw parseErr;
          }
        }
      }
    }

    // Push assistant message to state
    messages.push({
      role: 'model',
      parts: [{ text: accumulated }]
    });

  } catch (err) {
    console.error('Stream error:', err);
    accumulated = '';
    // Show error in the existing bubble
    msgEl.classList.add('message-error');
    contentEl.innerHTML = `<p>⚠️ ${escapeHtml(err.message || 'Something went wrong. Please try again.')}</p>`;
    if (copyBtn) copyBtn.style.display = 'none';
  } finally {
    isStreaming = false;
    sendBtn.disabled = false;
    messageInput.disabled = false;
    hideTypingIndicator();
    messageInput.focus();
  }
}

// ============================================================
// Send message
// ============================================================
async function sendMessage() {
  if (isStreaming) return;

  const text = messageInput.value.trim();
  if (!text && pendingImages.length === 0) return;

  // Build user message
  const userMessage = {
    role: 'user',
    parts: [{ text: text || '(image attached)' }]
  };

  // Capture the first pending image (multimodal)
  let attachedImage = null;
  let attachedMimeType = null;

  if (pendingImages.length > 0) {
    attachedImage = pendingImages[0].base64;
    attachedMimeType = pendingImages[0].mimeType;
    userMessage.image = attachedImage;
    userMessage.mimeType = attachedMimeType;
    userMessage.imageUrl = pendingImages[0].previewUrl;
  }

  // Push to state
  messages.push(userMessage);

  // Render user bubble
  renderMessage(userMessage);

  // Clear input UI
  messageInput.value = '';
  autoResizeTextarea();
  pendingImages = [];
  renderImagePreviews();

  // Hide welcome
  hideWelcome();

  // Stream
  await streamResponse([...messages], attachedImage, attachedMimeType);
}

// ============================================================
// Auto-resize textarea
// ============================================================
function autoResizeTextarea() {
  messageInput.style.height = 'auto';
  const maxH = 200;
  const newH = Math.min(messageInput.scrollHeight, maxH);
  messageInput.style.height = `${newH}px`;
}

// ============================================================
// Clear chat
// ============================================================
function clearChat() {
  messages = [];
  pendingImages = [];
  messagesEl.innerHTML = '';
  renderImagePreviews();
  hideTypingIndicator();
  if (welcome) welcome.style.display = 'flex';
  messageInput.value = '';
  autoResizeTextarea();
  messageInput.focus();
}

// ============================================================
// Sidebar
// ============================================================
function toggleSidebar() {
  sidebar.classList.toggle('open');
  sidebarOverlay.classList.toggle('active');
}

function closeSidebar() {
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('active');
}

// ============================================================
// Drag and drop
// ============================================================
function handleDrop(e) {
  e.preventDefault();
  const files = e.dataTransfer.files;
  if (files && files.length > 0) {
    handleFileSelect(files);
  }
}

// ============================================================
// Init
// ============================================================
function initApp() {
  // Grab DOM refs
  sendBtn = document.getElementById('sendBtn');
  messageInput = document.getElementById('messageInput');
  attachBtn = document.getElementById('attachBtn');
  fileInput = document.getElementById('fileInput');
  clearBtn = document.getElementById('clearBtn');
  menuBtn = document.getElementById('menuBtn');
  sidebarClose = document.getElementById('sidebarClose');
  sidebarOverlay = document.getElementById('sidebarOverlay');
  sidebar = document.getElementById('sidebar');
  chatContainer = document.getElementById('chatContainer');
  messagesEl = document.getElementById('messages');
  typingIndicator = document.getElementById('typingIndicator');
  imagePreviewStrip = document.getElementById('imagePreviewStrip');
  welcome = document.getElementById('welcome');

  // Send button
  sendBtn.addEventListener('click', sendMessage);

  // Textarea: Enter to send, Shift+Enter for newline, auto-resize
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  messageInput.addEventListener('input', autoResizeTextarea);

  // File attach
  attachBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelect(e.target.files);
      // Reset input so same file can be re-selected
      fileInput.value = '';
    }
  });

  // Drag and drop on chat container
  chatContainer.addEventListener('dragover', (e) => {
    e.preventDefault();
    chatContainer.style.outline = '2px dashed var(--accent-purple)';
  });
  chatContainer.addEventListener('dragleave', () => {
    chatContainer.style.outline = '';
  });
  chatContainer.addEventListener('drop', (e) => {
    chatContainer.style.outline = '';
    handleDrop(e);
  });

  // Clear chat
  clearBtn.addEventListener('click', clearChat);

  // Sidebar
  menuBtn.addEventListener('click', toggleSidebar);
  sidebarClose.addEventListener('click', closeSidebar);
  sidebarOverlay.addEventListener('click', closeSidebar);

  // Close sidebar on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSidebar();
  });

  // Focus input on load
  messageInput.focus();
}

document.addEventListener('DOMContentLoaded', initApp);

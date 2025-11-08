import {
  createSessionStorageAdapter,
  createSweetLinkClient,
  type SweetLinkHandshakeResponse,
  type SweetLinkSessionBootstrap,
  type SweetLinkStatusSnapshot,
} from 'sweetlink/runtime/browser';

interface DemoApi {
  updateKpi(value: number): number | null;
  toggleBadge(): string | null;
  pulseCard(): boolean;
  randomizeChart(): boolean;
}

declare global {
  interface Window {
    demo: DemoApi;
  }
  interface GlobalThis {
    demo: DemoApi;
  }
}

const statusLog = document.querySelector<HTMLPreElement>('#status-log');
const enableButton = document.querySelector<HTMLButtonElement>('#enable-btn');
const kpiValue = document.querySelector<HTMLElement>('#kpi-value');
const badgeStatus = document.querySelector<HTMLElement>('#badge-status');
const actionButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-demo="pulse"]')];
const mockChart = document.querySelector<HTMLElement>('#mock-chart');
const tlsStatusContainer = document.querySelector<HTMLElement>('#tls-status');
const tlsStatusMessage = document.querySelector<HTMLElement>('#tls-status-message');
const tlsOpenButton = document.querySelector<HTMLButtonElement>('#tls-open');
const tlsRetryButton = document.querySelector<HTMLButtonElement>('#tls-retry');
const sessionChip = document.querySelector<HTMLElement>('#session-chip');
const sessionPrefix = document.querySelector<HTMLElement>('#session-prefix');
const sessionNameDisplay = document.querySelector<HTMLElement>('#session-name');

const copyResetTimers = new WeakMap<HTMLButtonElement, number>();
const sessionStorageAdapter = createSessionStorageAdapter();

const sweetLinkLogger = {
  info(message: string, ...details: unknown[]) {
    console.info('[SweetLink]', message, ...details);
    appendStatus(`[info] ${message}`);
  },
  warn(message: string, ...details: unknown[]) {
    console.warn('[SweetLink]', message, ...details);
    appendStatus(`[warn] ${message}`);
  },
  error(message: string, error: unknown) {
    console.error('[SweetLink]', message, error);
    appendStatus(`[error] ${message}${error instanceof Error ? ` – ${error.message}` : ''}`);
  },
};

const sweetLinkClient = createSweetLinkClient({
  storage: sessionStorageAdapter,
  status: {
    onStatusSnapshot: handleStatusSnapshot,
  },
  logger: sweetLinkLogger,
  autoReconnectHandshake: requestHandshake,
});

type TlsState = 'checking' | 'trusted' | 'untrusted' | 'unreachable';

let tlsStatusInFlight: Promise<void> | null = null;

function setEnableButtonEnabled(enabled: boolean) {
  if (enableButton) {
    enableButton.disabled = !enabled;
  }
}

function updateTlsStatus(state: TlsState, message: string) {
  if (!tlsStatusContainer || !tlsStatusMessage) {
    return;
  }
  tlsStatusContainer.dataset.state = state;
  tlsStatusMessage.textContent = message;

  if (state === 'trusted') {
    tlsStatusContainer.style.display = 'none';
    setEnableButtonEnabled(true);
    return;
  }

  tlsStatusContainer.style.display = 'flex';
  setEnableButtonEnabled(false);
}

async function checkTlsStatus(options: { force?: boolean } = {}) {
  if (tlsStatusInFlight && !options.force) {
    return await tlsStatusInFlight;
  }

  tlsStatusInFlight = (async () => {
    updateTlsStatus('checking', 'Checking daemon TLS status…');
    try {
      const response = await fetch('/api/sweetlink/status', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!response.ok) {
        updateTlsStatus('unreachable', `Daemon status request failed (${response.status}).`);
        return;
      }
      const payload = (await response.json()) as {
        daemonUrl: string;
        reachable: boolean;
        tlsTrusted: boolean;
        message: string | null;
      };
      if (!payload.reachable) {
        const reason = payload.message ? ` (${payload.message})` : '';
        updateTlsStatus(
          'unreachable',
          `SweetLink daemon is offline. Start it with \`pnpm sweetlink:daemon\`${reason}.`
        );
        return;
      }
      if (!payload.tlsTrusted) {
        const reason = payload.message ? ` (${payload.message})` : '';
        updateTlsStatus(
          'untrusted',
          `Browser has not trusted the SweetLink certificate yet. Open the daemon URL and accept the certificate${reason}.`
        );
        return;
      }
      updateTlsStatus('trusted', 'Daemon TLS certificate is trusted.');
    } catch (error) {
      updateTlsStatus(
        'unreachable',
        `Unable to verify daemon TLS status${error instanceof Error ? `: ${error.message}` : ''}`
      );
    }
  })();

  try {
    await tlsStatusInFlight;
  } finally {
    tlsStatusInFlight = null;
  }
}

function appendStatus(line: string) {
  if (!statusLog) return;
  const now = new Date().toISOString();
  statusLog.textContent = `${statusLog.textContent ?? ''}\n[${now}] ${line}`.trim();
}

function resolveCopySourceText(button: HTMLButtonElement): string | null {
  const sourceId = button.dataset.copySource;
  if (!sourceId) {
    return null;
  }
  const sourceElement = document.getElementById(sourceId);
  if (!sourceElement) {
    return null;
  }
  if (sourceElement instanceof HTMLInputElement || sourceElement instanceof HTMLTextAreaElement) {
    const value = sourceElement.value;
    return value.length > 0 ? value : null;
  }
  const text = sourceElement.textContent ?? '';
  const cleaned = text.replace(/\s+$/u, '');
  return cleaned.length > 0 ? cleaned : null;
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    if (fallbackCopy(text)) {
      return true;
    }
    if (error instanceof Error) {
      appendStatus(`Clipboard copy failed: ${error.message}`);
    }
    return false;
  }
}

function fallbackCopy(text: string): boolean {
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '-9999px';
    textArea.style.opacity = '0';
    document.body.append(textArea);
    textArea.focus();
    textArea.select();
    const success = document.execCommand('copy');
    textArea.remove();
    return success;
  } catch {
    return false;
  }
}

function resetCopyButton(button: HTMLButtonElement): void {
  const timer = copyResetTimers.get(button);
  if (timer) {
    window.clearTimeout(timer);
    copyResetTimers.delete(button);
  }
  const defaultLabel = button.dataset.copyDefault ?? 'Copy to clipboard';
  const defaultHtml = button.dataset.copyDefaultHtml;
  const defaultIcon = button.dataset.copyIcon ?? '📋';
  button.classList.remove('copied');
  if (defaultHtml) {
    button.innerHTML = defaultHtml;
  } else {
    button.innerHTML = `<span aria-hidden="true">${defaultIcon}</span>`;
  }
  button.setAttribute('aria-label', defaultLabel);
}

function markButtonCopied(button: HTMLButtonElement): void {
  resetCopyButton(button);
  const successLabel = button.dataset.copySuccess ?? 'Copied!';
  const successIcon = button.dataset.copySuccessIcon ?? '✓';
  button.classList.add('copied');
  button.innerHTML = `<span aria-hidden="true">${successIcon}</span>`;
  button.setAttribute('aria-label', successLabel);
  const timeout = window.setTimeout(() => {
    resetCopyButton(button);
  }, 2000);
  copyResetTimers.set(button, timeout);
}

function setupCopyButtons(): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>('[data-copy-source]');
  for (const button of buttons) {
    const defaultLabel = button.dataset.copyLabel ?? button.getAttribute('aria-label') ?? 'Copy to clipboard';
    button.dataset.copyDefault = defaultLabel;
    button.dataset.copyDefaultHtml = button.innerHTML;
    if (!button.dataset.copyIcon && button.innerHTML.trim().length === 0) {
      button.dataset.copyIcon = '📋';
      button.innerHTML = '<span aria-hidden="true">📋</span>';
    }
    if (!button.hasAttribute('aria-label')) {
      button.setAttribute('aria-label', defaultLabel);
    }
    button.addEventListener('click', async () => {
      const sourceText = resolveCopySourceText(button);
      if (!sourceText) {
        appendStatus(`Copy failed: no text found for ${button.dataset.copyLabel ?? 'selection'}.`);
        resetCopyButton(button);
        return;
      }
      const copied = await copyTextToClipboard(sourceText);
      if (copied) {
        markButtonCopied(button);
        appendStatus(`Copied ${button.dataset.copyLabel ?? 'text'} to clipboard.`);
      } else {
        appendStatus(`Copy failed for ${button.dataset.copyLabel ?? 'text'}.`);
        resetCopyButton(button);
      }
    });
  }
}

function setSessionIndicator(state: 'inactive' | 'pending' | 'active', label?: string, prefix?: string) {
  if (!sessionChip || !sessionNameDisplay || !sessionPrefix) return;
  sessionChip.dataset.state = state;
  const hidden = state === 'inactive';
  sessionChip.setAttribute('aria-hidden', hidden ? 'true' : 'false');
  let resolvedPrefix = prefix;
  if (!resolvedPrefix) {
    if (state === 'active') {
      resolvedPrefix = 'Connected as';
    } else if (state === 'pending') {
      resolvedPrefix = 'Awaiting CLI';
    } else {
      resolvedPrefix = 'CLI Session';
    }
  }
  sessionPrefix.textContent = resolvedPrefix;
  sessionNameDisplay.textContent = label ?? '—';
}

const demoApi: DemoApi = {
  updateKpi(value) {
    if (!kpiValue) return null;
    const nextValue = Math.max(0, Math.min(100, Number(value) || 0));
    kpiValue.textContent = `${nextValue.toFixed(0)}%`;
    kpiValue.classList.add('highlight');
    globalThis.setTimeout(() => kpiValue.classList.remove('highlight'), 600);
    appendStatus(`KPI value updated to ${nextValue.toFixed(0)}%.`);
    return nextValue;
  },
  toggleBadge() {
    if (!badgeStatus) return null;
    const current = (badgeStatus.textContent ?? '').trim();
    const next = current === 'beta' ? 'stable' : 'beta';
    badgeStatus.textContent = next;
    badgeStatus.dataset.state = next;
    appendStatus(`Badge toggled to "${next}".`);
    return next;
  },
  pulseCard() {
    const card = document.querySelector<HTMLElement>('#screenshot-card');
    if (!card) return false;
    card.classList.add('pulse');
    globalThis.setTimeout(() => card.classList.remove('pulse'), 800);
    appendStatus('Screenshot card pulse animation triggered.');
    return true;
  },
  randomizeChart() {
    if (!mockChart) return false;
    const bars = [...mockChart.querySelectorAll<HTMLElement>('.bar')];
    for (const bar of bars) {
      const height = 35 + Math.random() * 60;
      bar.style.height = `${height}%`;
    }
    appendStatus('Chart bars randomized.');
    return true;
  },
};

globalThis.demo = demoApi;

async function requestHandshake(): Promise<SweetLinkHandshakeResponse> {
  appendStatus('Requesting SweetLink handshake…');
  const response = await fetch('/api/sweetlink/handshake', { method: 'POST' });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Handshake failed (${response.status}): ${text}`);
  }
  return (await response.json()) as SweetLinkHandshakeResponse;
}

function normalizeHandshakePayload(handshake: SweetLinkHandshakeResponse): SweetLinkSessionBootstrap {
  return {
    sessionId: handshake.sessionId,
    sessionToken: handshake.sessionToken,
    socketUrl: handshake.socketUrl,
    expiresAtMs: normalizeExpiresAtMs(handshake.expiresAt),
    codename: null,
  };
}

function normalizeExpiresAtMs(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value > 10_000_000_000 ? value : value * 1000;
}

function handleStatusSnapshot(snapshot: SweetLinkStatusSnapshot) {
  switch (snapshot.status) {
    case 'idle': {
      setSessionIndicator('inactive');
      setEnableButtonEnabled(true);
      break;
    }
    case 'connecting': {
      const label = snapshot.codename ?? 'Awaiting CLI';
      setSessionIndicator('pending', label, 'Connecting');
      setEnableButtonEnabled(false);
      break;
    }
    case 'connected': {
      const label = snapshot.codename ?? 'SweetLink';
      setSessionIndicator('active', label, 'Connected as');
      setEnableButtonEnabled(false);
      appendStatus(`CLI attached as "${label}".`);
      break;
    }
    case 'error': {
      const reason = snapshot.reason ?? 'unknown error';
      appendStatus(`SweetLink reported an error: ${reason}`);
      setSessionIndicator('inactive', reason, 'Error');
      setEnableButtonEnabled(true);
      break;
    }
  }
}

async function enableSweetLink() {
  if (!enableButton) return;
  setEnableButtonEnabled(false);
  setSessionIndicator('pending', 'Requesting session…', 'SweetLink');
  try {
    const handshake = await requestHandshake();
    appendStatus(`Handshake granted. Session ${handshake.sessionId}. Connecting to ${handshake.socketUrl}…`);
    const bootstrap = normalizeHandshakePayload(handshake);
    setSessionIndicator('pending', `Session ${handshake.sessionId.slice(0, 8)}`, 'Awaiting CLI');
    await sweetLinkClient.startSession(bootstrap);
    appendStatus('SweetLink session registered. Run "pnpm sweetlink sessions" to inspect.');
    demoApi.randomizeChart();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendStatus(`Failed to enable SweetLink: ${message}`);
    setEnableButtonEnabled(true);
    setSessionIndicator('inactive');
    void checkTlsStatus({ force: true });
  }
}

setupCopyButtons();
for (const button of actionButtons) {
  button.addEventListener('click', () => {
    demoApi.pulseCard();
  });
}
enableButton?.addEventListener('click', () => {
  appendStatus('Starting SweetLink activation…');
  void enableSweetLink();
});

tlsOpenButton?.addEventListener('click', () => {
  window.open('https://localhost:4455', '_blank', 'noopener');
});

tlsRetryButton?.addEventListener('click', () => {
  void checkTlsStatus({ force: true });
});

async function resumeStoredSession() {
  const stored = sessionStorageAdapter.load();
  if (!stored) {
    return;
  }
  const isFresh = typeof sessionStorageAdapter.isFresh === 'function' ? sessionStorageAdapter.isFresh : null;
  if (isFresh && !isFresh(stored)) {
    sessionStorageAdapter.clear();
    return;
  }
  appendStatus(`Found stored SweetLink session ${stored.sessionId.slice(0, 8)}. Attempting to resume…`);
  setSessionIndicator('pending', stored.codename ?? stored.sessionId.slice(0, 8), 'Reconnecting');
  try {
    await sweetLinkClient.startSession(stored);
    appendStatus('Stored SweetLink session resumed.');
  } catch (error) {
    sessionStorageAdapter.clear();
    appendStatus(`Failed to resume stored session: ${describeError(error)}`);
    setSessionIndicator('inactive');
    setEnableButtonEnabled(true);
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

// eslint-disable-next-line unicorn/prefer-top-level-await
void (async () => {
  await checkTlsStatus();
  await resumeStoredSession();
})();

setSessionIndicator('inactive');

export type DemoClientApi = DemoApi;

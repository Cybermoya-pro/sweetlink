type ConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';
type AsyncFunctionConstructor = new (...args: string[]) => (...fnArgs: unknown[]) => Promise<unknown>;

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

const HEARTBEAT_INTERVAL_MS = 15_000;

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

let socket: WebSocket | null = null;
let sessionId: string | null = null;
let heartbeatHandle: ReturnType<typeof setInterval> | null = null;
const pendingConsoleEvents: SweetLinkConsoleEvent[] = [];

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

interface SweetLinkConsoleEvent {
  id: string;
  timestamp: number;
  level: ConsoleLevel;
  args: unknown[];
}

interface SweetLinkHandshakeResponse {
  sessionId: string;
  sessionToken: string;
  socketUrl: string;
  expiresAt: number;
}

interface SweetLinkRunScriptCommand {
  type: 'runScript';
  id: string;
  code: string;
}

interface SweetLinkNavigateCommand {
  type: 'navigate';
  id: string;
  target: string;
}

type SweetLinkCommand = SweetLinkRunScriptCommand | SweetLinkNavigateCommand | Record<string, unknown>;

interface SweetLinkServerCommandMessage {
  kind: 'command';
  sessionId: string;
  command: SweetLinkCommand;
}

interface SweetLinkServerMetadataMessage {
  kind: 'metadata';
  codename: string;
}

interface SweetLinkServerDisconnectMessage {
  kind: 'disconnect';
  reason?: string;
}

type SweetLinkServerMessage =
  | SweetLinkServerCommandMessage
  | SweetLinkServerMetadataMessage
  | SweetLinkServerDisconnectMessage
  | Record<string, unknown>;

interface SweetLinkCommandResultSuccess {
  ok: true;
  commandId: string;
  durationMs: number;
  data?: unknown;
}

interface SweetLinkCommandResultError {
  ok: false;
  commandId: string;
  durationMs: number;
  error: string;
  stack?: string;
}

type SweetLinkCommandResult = SweetLinkCommandResultSuccess | SweetLinkCommandResultError;

function appendStatus(line: string) {
  if (!statusLog) return;
  const now = new Date().toISOString();
  statusLog.textContent = `${statusLog.textContent ?? ''}\n[${now}] ${line}`.trim();
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

function recordConsoleEvent(level: ConsoleLevel, args: unknown[]) {
  const event: SweetLinkConsoleEvent = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    level,
    args,
  };
  if (socket?.readyState === WebSocket.OPEN && sessionId) {
    flushConsoleEvents([event]);
  } else {
    pendingConsoleEvents.push(event);
  }
}

function flushConsoleEvents(events: SweetLinkConsoleEvent[]) {
  if (!socket || socket.readyState !== WebSocket.OPEN || !sessionId || events.length === 0) {
    return;
  }
  socket.send(
    JSON.stringify({
      kind: 'console',
      sessionId,
      events,
    })
  );
}

function installConsoleForwarder() {
  const levels: ConsoleLevel[] = ['log', 'info', 'warn', 'error', 'debug'];
  for (const level of levels) {
    // biome-ignore lint/suspicious/noConsole: instrumentation for demo telemetry
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      try {
        recordConsoleEvent(level, args);
      } catch {
        // ignore instrumentation issues
      }
    };
  }
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

function startHeartbeat() {
  if (!sessionId || !socket) {
    return;
  }
  stopHeartbeat();
  heartbeatHandle = globalThis.setInterval(() => {
    if (socket?.readyState === WebSocket.OPEN && sessionId) {
      socket.send(JSON.stringify({ kind: 'heartbeat', sessionId }));
    }
  }, HEARTBEAT_INTERVAL_MS * 0.8);
}

function stopHeartbeat() {
  if (heartbeatHandle !== null) {
    clearInterval(heartbeatHandle);
    heartbeatHandle = null;
  }
}

function sendCommandResult(result: SweetLinkCommandResult) {
  if (!socket || socket.readyState !== WebSocket.OPEN || !sessionId) {
    return;
  }
  socket.send(
    JSON.stringify({
      kind: 'commandResult',
      sessionId,
      result,
    })
  );
}

async function executeRunScript(command: SweetLinkRunScriptCommand) {
  if (typeof command.code !== 'string') {
    throw new TypeError('SweetLink runScript command is missing code.');
  }
  const AsyncFunction = (async () => {}).constructor as AsyncFunctionConstructor;
  const fn = new AsyncFunction('demo', `"use strict"; return (${command.code});`);
  return await fn.call(globalThis, demoApi);
}

async function handleCommandMessage(message: SweetLinkServerCommandMessage) {
  const { command } = message;
  if (!command || typeof command !== 'object') {
    return;
  }

  const start = performance.now();
  try {
    switch (command.type) {
      case 'runScript': {
        const result = await executeRunScript(command as SweetLinkRunScriptCommand);
        sendCommandResult({
          ok: true,
          commandId: command.id,
          durationMs: Math.round(performance.now() - start),
          data: result,
        });
        return;
      }
      case 'navigate': {
        const navigateCommand = command as SweetLinkNavigateCommand;
        if (typeof navigateCommand.target !== 'string' || navigateCommand.target.length === 0) {
          throw new TypeError('Missing navigate target');
        }
        globalThis.location.assign(navigateCommand.target);
        sendCommandResult({
          ok: true,
          commandId: navigateCommand.id,
          durationMs: Math.round(performance.now() - start),
          data: globalThis.location.href,
        });
        return;
      }
      default: {
        throw new Error(
          `Command "${String((command as { type?: unknown }).type)}" is not implemented in the demo client.`
        );
      }
    }
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    sendCommandResult({
      ok: false,
      commandId: (command as { id: string }).id,
      durationMs: Math.round(performance.now() - start),
      error: messageText,
      stack: error instanceof Error && error.stack ? error.stack : undefined,
    });
  }
}

function handleServerMessage(event: MessageEvent<string>) {
  if (!event?.data) {
    return;
  }
  let parsed: SweetLinkServerMessage;
  try {
    parsed = JSON.parse(event.data) as SweetLinkServerMessage;
  } catch (error) {
    appendStatus(`Received invalid message: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  switch (parsed.kind) {
    case 'command': {
      void handleCommandMessage(parsed as SweetLinkServerCommandMessage);
      break;
    }
    case 'metadata': {
      const codename = (parsed as SweetLinkServerMetadataMessage).codename;
      appendStatus(`CLI attached as "${codename}".`);
      setSessionIndicator('active', codename, 'Connected as');
      break;
    }
    case 'disconnect': {
      appendStatus(
        `Daemon requested disconnect: ${(parsed as SweetLinkServerDisconnectMessage).reason ?? 'unknown reason'}`
      );
      break;
    }
    default: {
      const parsedKind = (parsed as { kind?: unknown }).kind;
      const kind = typeof parsedKind === 'string' ? parsedKind : 'unknown';
      appendStatus(`Received message: ${kind}`);
      break;
    }
  }
}

async function connectToDaemon(handshake: SweetLinkHandshakeResponse) {
  return await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(handshake.socketUrl);
    socket = ws;
    sessionId = handshake.sessionId;

    ws.addEventListener('open', () => {
      appendStatus('Connected. Registering session with daemon…');
      const payload = {
        kind: 'register',
        token: handshake.sessionToken,
        sessionId: handshake.sessionId,
        url: globalThis.location.href,
        title: document.title,
        userAgent: navigator.userAgent,
        topOrigin: globalThis.location.origin,
      };
      ws.send(JSON.stringify(payload));
      flushConsoleEvents(pendingConsoleEvents.splice(0));
      startHeartbeat();
      updateTlsStatus('trusted', 'Daemon TLS certificate is trusted.');
      resolve();
    });

    ws.addEventListener('message', (event) => handleServerMessage(event as MessageEvent<string>));

    ws.addEventListener('close', (event) => {
      appendStatus(`Socket closed (${event.code}${event.reason ? `: ${event.reason}` : ''}).`);
      stopHeartbeat();
      setSessionIndicator('inactive');
      setEnableButtonEnabled(true);
    });

    ws.addEventListener('error', (event) => {
      const errorText = event instanceof ErrorEvent ? (event.message ?? 'unknown error') : 'unknown error';
      appendStatus(`WebSocket error: ${errorText}`);
      stopHeartbeat();
      setSessionIndicator('inactive');
      setEnableButtonEnabled(true);
      void checkTlsStatus({ force: true });
      if (event instanceof ErrorEvent && event.error instanceof Error) {
        reject(event.error);
        return;
      }
      reject(new Error(errorText));
    });
  });
}

async function enableSweetLink() {
  if (!enableButton) return;
  setEnableButtonEnabled(false);
  setSessionIndicator('pending', 'Requesting session…', 'SweetLink');
  try {
    const handshake = await requestHandshake();
    appendStatus(`Handshake granted. Session ${handshake.sessionId}. Connecting to ${handshake.socketUrl}…`);
    setSessionIndicator('pending', `Session ${handshake.sessionId.slice(0, 8)}`, 'Awaiting CLI');
    await connectToDaemon(handshake);
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

installConsoleForwarder();
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

// eslint-disable-next-line unicorn/prefer-top-level-await
void checkTlsStatus();

setSessionIndicator('inactive');

export type DemoClientApi = DemoApi;

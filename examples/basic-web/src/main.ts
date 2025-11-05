type ConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

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
}

const HEARTBEAT_INTERVAL_MS = 15_000;

const statusLog = document.querySelector<HTMLPreElement>('#status-log');
const enableButton = document.querySelector<HTMLButtonElement>('#enable-btn');
const kpiValue = document.querySelector<HTMLElement>('#kpi-value');
const badgeStatus = document.querySelector<HTMLElement>('#badge-status');
const actionButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-demo="pulse"]')];
const mockChart = document.querySelector<HTMLElement>('#mock-chart');

let socket: WebSocket | null = null;
let sessionId: string | null = null;
let heartbeatHandle: ReturnType<typeof setInterval> | null = null;
const pendingConsoleEvents: SweetLinkConsoleEvent[] = [];

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
    window.setTimeout(() => kpiValue.classList.remove('highlight'), 600);
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
    window.setTimeout(() => card.classList.remove('pulse'), 800);
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

window.demo = demoApi;

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
  heartbeatHandle = window.setInterval(() => {
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
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
    ...args: string[]
  ) => (...fnArgs: unknown[]) => Promise<unknown>;
  const fn = new AsyncFunction('demo', `"use strict"; return (${command.code});`);
  return await fn.call(window, demoApi);
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
        window.location.assign(navigateCommand.target);
        sendCommandResult({
          ok: true,
          commandId: navigateCommand.id,
          durationMs: Math.round(performance.now() - start),
          data: window.location.href,
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
      appendStatus(`CLI attached as "${(parsed as SweetLinkServerMetadataMessage).codename}".`);
      break;
    }
    case 'disconnect': {
      appendStatus(
        `Daemon requested disconnect: ${(parsed as SweetLinkServerDisconnectMessage).reason ?? 'unknown reason'}`
      );
      break;
    }
    default: {
      appendStatus(`Received message: ${String((parsed as { kind?: unknown }).kind ?? 'unknown')}`);
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
        url: window.location.href,
        title: document.title,
        userAgent: navigator.userAgent,
        topOrigin: window.location.origin,
      };
      ws.send(JSON.stringify(payload));
      flushConsoleEvents(pendingConsoleEvents.splice(0));
      startHeartbeat();
      resolve();
    });

    ws.addEventListener('message', (event) => handleServerMessage(event as MessageEvent<string>));

    ws.addEventListener('close', (event) => {
      appendStatus(`Socket closed (${event.code}${event.reason ? `: ${event.reason}` : ''}).`);
      stopHeartbeat();
      if (enableButton) enableButton.disabled = false;
    });

    ws.addEventListener('error', (event) => {
      const errorText = (event as ErrorEvent).message ?? 'unknown error';
      appendStatus(`WebSocket error: ${errorText}`);
      stopHeartbeat();
      if (enableButton) enableButton.disabled = false;
      reject((event as ErrorEvent).error ?? new Error(errorText));
    });
  });
}

async function enableSweetLink() {
  if (!enableButton) return;
  enableButton.disabled = true;
  try {
    const handshake = await requestHandshake();
    appendStatus(`Handshake granted. Session ${handshake.sessionId}. Connecting to ${handshake.socketUrl}…`);
    await connectToDaemon(handshake);
    appendStatus('SweetLink session registered. Run "pnpm sweetlink sessions" to inspect.');
    demoApi.randomizeChart();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendStatus(`Failed to enable SweetLink: ${message}`);
    enableButton.disabled = false;
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

export type DemoClientApi = DemoApi;

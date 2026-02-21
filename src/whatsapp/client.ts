import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason,
} from '@whiskeysockets/baileys';
import type { WASocket, ConnectionState } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import fs from 'fs';
import { config } from '../config';

let sock: WASocket | null = null;
let connected = false;
let retryCount = 0;
let keepaliveInterval: ReturnType<typeof setInterval> | null = null;

// Backoff: 5s, 10s, 20s, 40s, 60s, 60s, 60s...
function getRetryDelay(): number {
  const base = 5000;
  const delay = Math.min(base * Math.pow(2, retryCount), 60_000);
  return delay;
}

function disconnectReasonName(code: number | undefined): string {
  if (code === DisconnectReason.badSession) return 'badSession';
  if (code === DisconnectReason.connectionClosed) return 'connectionClosed';
  if (code === DisconnectReason.connectionLost) return 'connectionLost';
  if (code === DisconnectReason.connectionReplaced) return 'connectionReplaced';
  if (code === DisconnectReason.loggedOut) return 'loggedOut';
  if (code === DisconnectReason.restartRequired) return 'restartRequired';
  if (code === DisconnectReason.timedOut) return 'timedOut';
  if (code === DisconnectReason.multideviceMismatch) return 'multideviceMismatch';
  return `unknown(${code})`;
}

export function getWhatsAppSocket(): WASocket | null {
  return sock;
}

export async function connectWhatsApp(): Promise<WASocket> {
  if (!fs.existsSync(config.authInfoPath)) {
    fs.mkdirSync(config.authInfoPath, { recursive: true });
  }

  const logger = pino({ level: 'silent' });
  const { state, saveCreds } = await useMultiFileAuthState(config.authInfoPath);
  const { version } = await fetchLatestBaileysVersion();

  console.log(`📱 Baileys version: ${version.join('.')}`);

  sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    version,
    logger,
    printQRInTerminal: false,
    browser: ['PadelBot', 'Chrome', '1.0.0'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
    keepAliveIntervalMs: 30_000, // Baileys built-in ping every 30s
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update: Partial<ConnectionState>) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n📱 Escanea este QR con WhatsApp → Dispositivos vinculados → Vincular dispositivo:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      connected = false;
      stopKeepalive();

      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const reasonName = disconnectReasonName(statusCode);
      const errorMsg = (lastDisconnect?.error as Boom)?.message || '';

      console.log(`⚠️ WhatsApp desconectado — razón: ${reasonName} (${statusCode}) ${errorMsg}`);

      if (statusCode === DisconnectReason.loggedOut) {
        // Session permanently invalidated — need new QR scan
        console.log('❌ Sesión cerrada permanentemente. Limpiando auth_info/ para nuevo QR...');
        try {
          const files = fs.readdirSync(config.authInfoPath);
          for (const f of files) {
            fs.unlinkSync(`${config.authInfoPath}/${f}`);
          }
        } catch (e) { /* ignore */ }
        sock = null;
        // Reconnect to show new QR
        const delay = getRetryDelay();
        retryCount++;
        console.log(`🔄 Reconectando en ${delay / 1000}s para mostrar nuevo QR...`);
        setTimeout(() => connectWhatsApp(), delay);
      } else {
        // Transient error — always retry with backoff (never give up)
        const delay = getRetryDelay();
        retryCount++;
        console.log(`🔄 Reintento #${retryCount} en ${delay / 1000}s...`);
        setTimeout(() => connectWhatsApp(), delay);
      }
    }

    if (connection === 'open') {
      retryCount = 0;
      connected = true;
      console.log('✅ WhatsApp conectado');
      startKeepalive();
    }
  });

  // Prevent unhandled WebSocket errors from crashing
  if (sock.ws && typeof (sock.ws as any).on === 'function') {
    (sock.ws as any).on('error', (err: Error) => {
      console.error('WebSocket error:', err.message);
    });
  }

  return sock;
}

// --- Keepalive: presence ping every 5 min to prevent idle disconnect ---

function startKeepalive() {
  stopKeepalive();
  keepaliveInterval = setInterval(async () => {
    if (!sock || !connected) return;
    try {
      await sock.sendPresenceUpdate('available');
    } catch (err) {
      console.warn('⚠️ Keepalive ping falló:', (err as Error).message);
    }
  }, 5 * 60 * 1000); // every 5 minutes
  console.log('💓 Keepalive activado (cada 5 min)');
}

function stopKeepalive() {
  if (keepaliveInterval) {
    clearInterval(keepaliveInterval);
    keepaliveInterval = null;
  }
}

// --- Public API ---

export function isWhatsAppConnected(): boolean {
  return connected && sock !== null;
}

/**
 * Try to reconnect if disconnected. Called by cron as safety net.
 */
export async function ensureConnected(): Promise<void> {
  if (connected && sock) return;
  console.log('🔄 ensureConnected: WhatsApp no conectado, reconectando...');
  try {
    await connectWhatsApp();
  } catch (err) {
    console.error('❌ ensureConnected falló:', err);
  }
}

export async function sendMessage(jid: string, text: string): Promise<boolean> {
  const target = jid.endsWith('@g.us') ? `GRUPO` : `DM(${jid})`;

  if (config.waDryRun) {
    console.log(`\n📨 [DRY RUN] → ${target}\n${text}\n`);
    return true;
  }

  if (!sock || !connected) {
    console.warn(`⚠️ WhatsApp no conectado (sock=${!!sock}, connected=${connected}) — mensaje NO enviado → ${target}`);
    return false;
  }

  try {
    await sock.sendMessage(jid, { text });
    console.log(`📨 Mensaje enviado → ${target}`);
    return true;
  } catch (err) {
    console.error(`❌ Error enviando mensaje → ${target}:`, err);
    return false;
  }
}

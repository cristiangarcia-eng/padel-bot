import { WASocket } from '@whiskeysockets/baileys';
import { config } from '../config';

export function setupMessageHandlers(sock: WASocket): void {
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    console.log(`📩 messages.upsert (type: ${type}, count: ${messages.length})`);

    for (const msg of messages) {
      const jid = msg.key.remoteJid;
      if (!jid || !msg.message) continue;

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        '';

      // Log ALL group messages with their JID
      if (jid.endsWith('@g.us')) {
        console.log(`💬 GRUPO → ID: ${jid} | fromMe: ${msg.key.fromMe} | Texto: ${text.slice(0, 80)}`);
      }

      // Only respond in the configured group
      if (jid !== config.waGroupId) continue;

      // Simple command: !padel → respond with link
      if (text.trim().toLowerCase() === '!padel') {
        await sock.sendMessage(jid, {
          text: `🎾 Apúntate a las partidas aquí:\n\n${config.baseUrl}`,
          linkPreview: { title: 'PadelBot', description: 'Organiza partidas de pádel' } as any,
        });
      }
    }
  });
}

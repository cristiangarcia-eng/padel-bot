import { config } from './config';
import { getDb } from './db/database';
import { startServer } from './web/server';
import { connectWhatsApp } from './whatsapp/client';
import { setupMessageHandlers } from './whatsapp/handlers';
import { setupCronJobs } from './scheduler/cron';

async function main() {
  console.log('🎾 PadelBot arrancando...');

  // Initialize database
  getDb();
  console.log('💾 Base de datos inicializada');

  // Start web server
  startServer();

  if (config.waDryRun) {
    // Dry run mode: no Baileys connection, messages logged to console
    console.log('📱 WhatsApp en modo DRY RUN (mensajes se muestran en consola)');
    setupCronJobs();
  } else if (config.waEnabled) {
    // Real WhatsApp connection
    try {
      const sock = await connectWhatsApp();
      setupMessageHandlers(sock);
      console.log('📱 WhatsApp iniciado (esperando conexión...)');
    } catch (err) {
      console.error('⚠️ Error conectando WhatsApp:', err);
    }
    setupCronJobs();
  } else {
    console.log('📱 WhatsApp desactivado (WA_ENABLED != true)');
  }

  console.log('🎾 PadelBot listo');
}

main().catch(console.error);

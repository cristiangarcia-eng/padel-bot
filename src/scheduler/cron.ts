import cron from 'node-cron';
import { config } from '../config';
import { sendWeeklyMessage, processQueuedNotifications } from '../whatsapp/notifications';
import { ensureConnected } from '../whatsapp/client';

export function setupCronJobs(): void {
  // Sunday message: open slots for next week
  cron.schedule(`0 ${config.sundayMessageHour} * * 0`, () => {
    console.log('⏰ Cron: enviando mensaje dominical');
    const nextMonday = new Date();
    nextMonday.setDate(nextMonday.getDate() + 1);
    const weekStart = nextMonday.toISOString().split('T')[0];
    sendWeeklyMessage(weekStart);
  });

  // Every hour: check for confirmed matches whose notification window has opened
  cron.schedule('0 * * * *', () => {
    console.log('⏰ Cron: revisando notificaciones pendientes');
    processQueuedNotifications().catch(err => {
      console.error('Error processing queued notifications:', err);
    });
  });

  // Every 10 minutes: ensure WhatsApp is connected (safety net)
  if (config.waEnabled && !config.waDryRun) {
    cron.schedule('*/10 * * * *', () => {
      ensureConnected().catch(err => {
        console.error('Error en ensureConnected:', err);
      });
    });
    console.log('🔄 Cron: reconexión WhatsApp cada 10 min activada');
  }

  console.log('⏰ Cron jobs programados');
}

import { Router, Request, Response } from 'express';
import { addBlockedSlot, removeBlockedSlot, getBlockedSlots } from '../../db/queries';
import { sendWeeklyMessage, processQueuedNotifications } from '../../whatsapp/notifications';

const router = Router();

// GET /api/admin/blocked
router.get('/blocked', (_req: Request, res: Response) => {
  const slots = getBlockedSlots();
  res.json(slots);
});

// POST /api/admin/block
router.post('/block', (req: Request, res: Response) => {
  const { day_of_week, start_time, end_time, reason } = req.body;

  if (day_of_week === undefined || !start_time || !end_time) {
    res.status(400).json({ error: 'Faltan campos obligatorios (day_of_week, start_time, end_time)' });
    return;
  }

  if (day_of_week < 0 || day_of_week > 6) {
    res.status(400).json({ error: 'day_of_week debe ser entre 0 (lunes) y 6 (domingo)' });
    return;
  }

  const slot = addBlockedSlot(day_of_week, start_time, end_time, reason);
  res.json({ ok: true, slot });
});

// DELETE /api/admin/block/:id
router.delete('/block/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  const removed = removeBlockedSlot(id);

  if (!removed) {
    res.status(404).json({ error: 'Slot bloqueado no encontrado' });
    return;
  }

  res.json({ ok: true });
});

// POST /api/admin/send-weekly — trigger weekly message manually
router.post('/send-weekly', async (_req: Request, res: Response) => {
  const nextMonday = new Date();
  const day = nextMonday.getDay();
  const diff = day === 0 ? 1 : 8 - day;
  nextMonday.setDate(nextMonday.getDate() + diff);
  const weekStart = `${nextMonday.getFullYear()}-${String(nextMonday.getMonth() + 1).padStart(2, '0')}-${String(nextMonday.getDate()).padStart(2, '0')}`;
  await sendWeeklyMessage(weekStart);
  res.json({ ok: true, weekStart });
});

// POST /api/admin/process-notifications — trigger queued notifications check
router.post('/process-notifications', async (_req: Request, res: Response) => {
  await processQueuedNotifications();
  res.json({ ok: true });
});

export default router;

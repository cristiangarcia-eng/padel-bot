import { Router, Request, Response } from 'express';
import {
  getWeekDates,
  getPartidosForDateRange,
  getBlockedSlots,
  createPartido,
  getPartidoById,
  joinPartido,
  leavePartido,
  deletePartido,
  countPlayers,
  confirmPartido,
  getPlayerLevelByPhone,
} from '../../db/queries';
import { config } from '../../config';
import { notifyMilestoneIfReady } from '../../whatsapp/notifications';

const router = Router();

// GET /api/players/level?phone=34612345678
router.get('/players/level', (req: Request, res: Response) => {
  const phone = req.query.phone as string;
  if (!phone) { res.json({ level: '' }); return; }
  res.json({ level: getPlayerLevelByPhone(phone) });
});

// GET /api/partidos?week=2026-02-23
router.get('/', (req: Request, res: Response) => {
  const weekParam = req.query.week as string | undefined;
  const { dates } = getWeekDates(weekParam);
  const weekEnd = dates[dates.length - 1];
  const partidos = getPartidosForDateRange(dates[0], weekEnd);
  const blockedSlots = getBlockedSlots();

  const dayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

  const days = dates.map((date, i) => {
    const dayOfWeek = i; // 0=lunes
    const dayPartidos = partidos
      .filter(p => p.slot_date === date)
      .map(p => ({
        id: p.id,
        time: p.start_time,
        creator: p.creator_name,
        confirmed: !!p.confirmed,
        players: p.players.map(pl => ({
          name: pl.player_name,
          phone: pl.player_phone,
          member_type: pl.is_sports_member === 1 ? 'deportivo' : pl.is_sports_member === 2 ? 'paseante' : 'no_socio',
          level: pl.level || '',
        })),
        count: p.players.length,
        max: config.playersPerMatch,
      }));

    const dayBlocked = blockedSlots
      .filter(b => b.day_of_week === dayOfWeek)
      .map(b => ({
        id: b.id,
        start_time: b.start_time,
        end_time: b.end_time,
        reason: b.reason,
      }));

    return {
      date,
      dayName: dayNames[i],
      partidos: dayPartidos,
      blocked: dayBlocked,
    };
  });

  res.json({ weekStart: dates[0], weekEnd, days });
});

// GET /api/partidos/:id
router.get('/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  const partido = getPartidoById(id);
  if (!partido) {
    res.status(404).json({ error: 'Partido no encontrado' });
    return;
  }
  res.json(partido);
});

// POST /api/partidos — create a new match at any time
router.post('/', (req: Request, res: Response) => {
  const { slot_date, start_time, player_name, player_phone, member_type, level } = req.body;

  if (!slot_date || !start_time || !player_name || !player_phone) {
    res.status(400).json({ error: 'Faltan campos obligatorios' });
    return;
  }

  // Validate time format (HH:MM)
  if (!/^\d{2}:\d{2}$/.test(start_time)) {
    res.status(400).json({ error: 'Formato de hora inválido (usa HH:MM)' });
    return;
  }

  // Check blocked slots
  const date = new Date(slot_date + 'T00:00:00');
  const jsDay = date.getDay();
  const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1;
  const blockedSlots = getBlockedSlots();
  const blocked = blockedSlots.find(b => {
    if (b.day_of_week !== dayOfWeek) return false;
    return start_time >= b.start_time && start_time < b.end_time;
  });
  if (blocked) {
    res.status(409).json({ error: `Horario bloqueado: ${blocked.reason || 'No disponible'}` });
    return;
  }

  const memberTypeNum = member_type === 'deportivo' ? 1 : member_type === 'paseante' ? 2 : 0;
  const partido = createPartido(slot_date, start_time, player_name, player_phone, memberTypeNum, level || '');
  res.json({ ok: true, partido });
});

// POST /api/partidos/:id/join
router.post('/:id/join', (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  const { player_name, player_phone, member_type, level } = req.body;

  if (!player_name || !player_phone) {
    res.status(400).json({ error: 'Faltan campos obligatorios' });
    return;
  }

  const partido = getPartidoById(id);
  if (!partido) {
    res.status(404).json({ error: 'Partido no encontrado' });
    return;
  }

  if (partido.players.length >= config.playersPerMatch) {
    res.status(409).json({ error: 'El partido ya está completo' });
    return;
  }

  const memberTypeNum = member_type === 'deportivo' ? 1 : member_type === 'paseante' ? 2 : 0;
  try {
    joinPartido(id, player_name, player_phone, memberTypeNum, level || '');
  } catch (err: any) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(409).json({ error: 'Ya estás apuntado a este partido' });
      return;
    }
    throw err;
  }

  const newCount = countPlayers(id);
  if (newCount >= config.playersPerMatch && !partido.confirmed) {
    confirmPartido(id);
  }

  const updated = getPartidoById(id)!;

  // Trigger milestone notifications (2/4, 3/4, 4/4)
  if (newCount >= 2) {
    notifyMilestoneIfReady(
      updated.slot_date, updated.start_time, updated.players, updated.id,
      newCount, !!updated.notified_2, !!updated.notified_3,
      !!updated.confirmed, !!updated.notified
    ).catch(err => {
      console.error('Error notifying milestone:', err);
    });
  }

  res.json({ ok: true, partido: updated });
});

// DELETE /api/partidos/:id/leave
router.delete('/:id/leave', (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  const { player_phone } = req.body;

  if (!player_phone) {
    res.status(400).json({ error: 'Falta player_phone' });
    return;
  }

  const removed = leavePartido(id, player_phone);
  if (!removed) {
    res.status(404).json({ error: 'No se encontró la inscripción' });
    return;
  }

  res.json({ ok: true });
});

// DELETE /api/partidos/:id — cancel partido (creator only)
router.delete('/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  const { player_phone } = req.body;

  const partido = getPartidoById(id);
  if (!partido) {
    res.status(404).json({ error: 'Partido no encontrado' });
    return;
  }

  if (partido.creator_phone !== player_phone) {
    res.status(403).json({ error: 'Solo el creador puede cancelar el partido' });
    return;
  }

  deletePartido(id);
  res.json({ ok: true });
});

export default router;

import { getDb } from './database';
import { config } from '../config';

export interface Partido {
  id: number;
  slot_date: string;
  start_time: string;
  creator_name: string;
  creator_phone: string;
  confirmed: number;
  notified: number;
  notified_2: number;
  notified_3: number;
  published: number;
  created_at: string;
}

export interface PartidoPlayer {
  id: number;
  partido_id: number;
  player_name: string;
  player_phone: string;
  is_sports_member: number;
  level: string;
  joined_at: string;
}

export interface BlockedSlot {
  id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
  reason: string | null;
}

// --- Partidos ---

export function createPartido(
  slotDate: string,
  startTime: string,
  creatorName: string,
  creatorPhone: string,
  memberType: number,
  level: string
): Partido & { players: PartidoPlayer[] } {
  const db = getDb();

  const stmt = db.prepare(
    'INSERT INTO partidos (slot_date, start_time, creator_name, creator_phone, published) VALUES (?, ?, ?, ?, 0)'
  );
  const result = stmt.run(slotDate, startTime, creatorName, creatorPhone);
  const partidoId = result.lastInsertRowid as number;

  // Creator auto-joins
  db.prepare(
    'INSERT INTO partido_players (partido_id, player_name, player_phone, is_sports_member, level) VALUES (?, ?, ?, ?, ?)'
  ).run(partidoId, creatorName, creatorPhone, memberType, level);

  return getPartidoById(partidoId)!;
}

export function getPartidoById(id: number): (Partido & { players: PartidoPlayer[] }) | undefined {
  const db = getDb();
  const partido = db.prepare('SELECT * FROM partidos WHERE id = ?').get(id) as Partido | undefined;
  if (!partido) return undefined;
  const players = db.prepare(
    'SELECT * FROM partido_players WHERE partido_id = ? ORDER BY joined_at ASC'
  ).all(id) as PartidoPlayer[];
  return { ...partido, players };
}

export function getPartidosForDateRange(startDate: string, endDate: string): (Partido & { players: PartidoPlayer[] })[] {
  const db = getDb();
  const partidos = db.prepare(
    'SELECT * FROM partidos WHERE slot_date >= ? AND slot_date <= ? ORDER BY slot_date, start_time'
  ).all(startDate, endDate) as Partido[];

  return partidos.map(p => {
    const players = db.prepare(
      'SELECT * FROM partido_players WHERE partido_id = ? ORDER BY joined_at ASC'
    ).all(p.id) as PartidoPlayer[];
    return { ...p, players };
  });
}

export function joinPartido(
  partidoId: number,
  playerName: string,
  playerPhone: string,
  memberType: number,
  level: string
): PartidoPlayer {
  const db = getDb();
  const stmt = db.prepare(
    'INSERT INTO partido_players (partido_id, player_name, player_phone, is_sports_member, level) VALUES (?, ?, ?, ?, ?)'
  );
  const result = stmt.run(partidoId, playerName, playerPhone, memberType, level);
  return db.prepare('SELECT * FROM partido_players WHERE id = ?').get(result.lastInsertRowid) as PartidoPlayer;
}

export function leavePartido(partidoId: number, playerPhone: string): boolean {
  const db = getDb();
  const result = db.prepare(
    'DELETE FROM partido_players WHERE partido_id = ? AND player_phone = ?'
  ).run(partidoId, playerPhone);
  return result.changes > 0;
}

export function deletePartido(id: number): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM partidos WHERE id = ?').run(id);
  return result.changes > 0;
}

export function countPlayers(partidoId: number): number {
  const db = getDb();
  const row = db.prepare(
    'SELECT COUNT(*) as count FROM partido_players WHERE partido_id = ?'
  ).get(partidoId) as { count: number };
  return row.count;
}

export function confirmPartido(partidoId: number): void {
  const db = getDb();
  db.prepare('UPDATE partidos SET confirmed = 1 WHERE id = ?').run(partidoId);
}

export function publishPartido(partidoId: number): void {
  const db = getDb();
  db.prepare('UPDATE partidos SET published = 1 WHERE id = ?').run(partidoId);
}

export function markPartidoNotified(partidoId: number): void {
  const db = getDb();
  db.prepare('UPDATE partidos SET notified = 1 WHERE id = ?').run(partidoId);
}

export function markPartidoNotified2(partidoId: number): void {
  const db = getDb();
  db.prepare('UPDATE partidos SET notified_2 = 1 WHERE id = ?').run(partidoId);
}

export function markPartidoNotified3(partidoId: number): void {
  const db = getDb();
  db.prepare('UPDATE partidos SET notified_3 = 1 WHERE id = ?').run(partidoId);
}

export function getUnnotifiedConfirmed(): (Partido & { players: PartidoPlayer[] })[] {
  const db = getDb();
  const partidos = db.prepare(
    'SELECT * FROM partidos WHERE confirmed = 1 AND notified = 0'
  ).all() as Partido[];
  return partidos.map(p => {
    const players = db.prepare(
      'SELECT * FROM partido_players WHERE partido_id = ? ORDER BY joined_at ASC'
    ).all(p.id) as PartidoPlayer[];
    return { ...p, players };
  });
}

export function getPartidosWithPendingMilestones(): (Partido & { players: PartidoPlayer[] })[] {
  const db = getDb();
  const partidos = db.prepare(
    'SELECT * FROM partidos WHERE notified_2 = 0 OR notified_3 = 0 OR (confirmed = 1 AND notified = 0)'
  ).all() as Partido[];
  return partidos.map(p => {
    const players = db.prepare(
      'SELECT * FROM partido_players WHERE partido_id = ? ORDER BY joined_at ASC'
    ).all(p.id) as PartidoPlayer[];
    return { ...p, players };
  });
}

// --- Player lookup ---

export function getPlayerLevelByPhone(phone: string): string {
  const db = getDb();
  const row = db.prepare(
    "SELECT level FROM partido_players WHERE player_phone = ? AND level != '' ORDER BY id DESC LIMIT 1"
  ).get(phone) as { level: string } | undefined;
  return row?.level || '';
}

// --- Blocked Slots ---

export function getBlockedSlots(): BlockedSlot[] {
  const db = getDb();
  return db.prepare('SELECT * FROM blocked_slots ORDER BY day_of_week, start_time').all() as BlockedSlot[];
}

export function addBlockedSlot(dayOfWeek: number, startTime: string, endTime: string, reason?: string): BlockedSlot {
  const db = getDb();
  const stmt = db.prepare('INSERT INTO blocked_slots (day_of_week, start_time, end_time, reason) VALUES (?, ?, ?, ?)');
  const result = stmt.run(dayOfWeek, startTime, endTime, reason || null);
  return db.prepare('SELECT * FROM blocked_slots WHERE id = ?').get(result.lastInsertRowid) as BlockedSlot;
}

export function removeBlockedSlot(id: number): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM blocked_slots WHERE id = ?').run(id);
  return result.changes > 0;
}

// --- Date helper ---

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// --- Week helper ---

export function getWeekDates(weekStartStr?: string): { dates: string[]; weekStart: Date } {
  let weekStart: Date;
  if (weekStartStr) {
    weekStart = new Date(weekStartStr + 'T00:00:00');
  } else {
    weekStart = new Date();
    const day = weekStart.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    weekStart.setDate(weekStart.getDate() + diff);
  }
  weekStart.setHours(0, 0, 0, 0);

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    dates.push(formatLocalDate(d));
  }
  return { dates, weekStart };
}

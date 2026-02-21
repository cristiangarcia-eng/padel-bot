import { sendMessage } from './client';
import { config } from '../config';
import {
  PartidoPlayer,
  getPartidosWithPendingMilestones,
  markPartidoNotified,
  markPartidoNotified2,
  markPartidoNotified3,
} from '../db/queries';

const dayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const day = dayNames[d.getDay()];
  const num = d.getDate();
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const month = months[d.getMonth()];
  return `${day.charAt(0).toUpperCase() + day.slice(1)} ${num} ${month}`;
}

/**
 * Check if a notification can be sent now.
 * Rule: can notify from the day before the match (00:00).
 */
export function canNotifyNow(slotDate: string): boolean {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const matchDay = new Date(slotDate + 'T00:00:00');
  const notifyFrom = new Date(matchDay);
  notifyFrom.setDate(notifyFrom.getDate() - 1);

  return today >= notifyFrom;
}

// --- Milestone: 2/4 players ---

async function sendMilestone2(
  slotDate: string,
  startTime: string,
  players: PartidoPlayer[],
  partidoId: number
): Promise<boolean> {
  const playerNames = players.map(p => p.player_name).join(', ');
  const dateFormatted = formatDate(slotDate);

  const msg = [
    `🎾 *¡Se está formando partido!* ${dateFormatted} a las ${startTime}`,
    `🏓 Ya están: ${playerNames}`,
    `👉 Faltan 2 — ¡apúntate! ${config.baseUrl}`,
  ].join('\n');

  const sent = await sendMessage(config.waGroupId, msg);
  if (sent) {
    markPartidoNotified2(partidoId);
    console.log(`📨 Milestone 2/4 enviado para partido ${partidoId}`);
  } else {
    console.log(`⚠️ Milestone 2/4 NO enviado para partido ${partidoId} — se reintentará`);
  }
  return sent;
}

// --- Milestone: 3/4 players ---

async function sendMilestone3(
  slotDate: string,
  startTime: string,
  players: PartidoPlayer[],
  partidoId: number
): Promise<boolean> {
  const playerNames = players.map(p => p.player_name).join(', ');
  const dateFormatted = formatDate(slotDate);

  const msg = [
    `🔥 *¡Falta UNO!* ${dateFormatted} a las ${startTime}`,
    `🏓 Ya están: ${playerNames}`,
    `👉 ¡Última plaza! ${config.baseUrl}`,
  ].join('\n');

  const sent = await sendMessage(config.waGroupId, msg);
  if (sent) {
    markPartidoNotified3(partidoId);
    console.log(`📨 Milestone 3/4 enviado para partido ${partidoId}`);
  } else {
    console.log(`⚠️ Milestone 3/4 NO enviado para partido ${partidoId} — se reintentará`);
  }
  return sent;
}

// --- Milestone: 4/4 confirmed ---

async function sendConfirmed(
  slotDate: string,
  startTime: string,
  players: PartidoPlayer[],
  partidoId: number
): Promise<boolean> {
  const memberLabel = (m: number) => m === 1 ? 'SD' : m === 2 ? 'SP' : 'NS';
  const playerNamesWithType = players.map(p => `${p.player_name} (${memberLabel(p.is_sports_member)})`).join(', ');
  const dateFormatted = formatDate(slotDate);

  const groupMsg = [
    `✅ *Partido confirmado*: ${dateFormatted} a las ${startTime}`,
    `🏓 ${playerNamesWithType}`,
    `📍 Pista del club`,
  ].join('\n');

  const groupSent = await sendMessage(config.waGroupId, groupMsg);
  if (!groupSent) {
    console.log(`⚠️ Confirmación 4/4 NO enviada para partido ${partidoId} — se reintentará`);
    return false;
  }

  for (const player of players) {
    if (!player.player_phone) continue;
    const jid = `${player.player_phone}@s.whatsapp.net`;
    const dmMsg = [
      `🎾 ¡Tu partido está confirmado!`,
      `📅 ${dateFormatted} a las ${startTime}`,
      `🏓 Jugadores: ${playerNamesWithType}`,
      `📍 Pista del club`,
    ].join('\n');

    await sendMessage(jid, dmMsg);
  }

  markPartidoNotified(partidoId);
  console.log(`📨 Confirmación 4/4 enviada para partido ${partidoId}`);
  return true;
}

// --- Public API: try to send milestone if within time window ---

export async function notifyMilestoneIfReady(
  slotDate: string,
  startTime: string,
  players: PartidoPlayer[],
  partidoId: number,
  playerCount: number,
  notified2: boolean,
  notified3: boolean,
  confirmed: boolean,
  notified4: boolean
): Promise<void> {
  if (!canNotifyNow(slotDate)) {
    console.log(`⏳ Partido ${partidoId} (${playerCount}/4) — notificación aplazada hasta día anterior (${slotDate})`);
    return;
  }

  if (playerCount >= 4 && confirmed && !notified4) {
    if (!notified2) markPartidoNotified2(partidoId);
    if (!notified3) markPartidoNotified3(partidoId);
    await sendConfirmed(slotDate, startTime, players, partidoId);
  } else if (playerCount === 3 && !notified3) {
    if (!notified2) markPartidoNotified2(partidoId);
    await sendMilestone3(slotDate, startTime, players, partidoId);
  } else if (playerCount === 2 && !notified2) {
    await sendMilestone2(slotDate, startTime, players, partidoId);
  }
}

/**
 * Cron: check all partidos with pending milestones and send those whose window has opened.
 * Only sends the message for the current state — skips outdated lower milestones.
 */
export async function processQueuedNotifications(): Promise<void> {
  const pending = getPartidosWithPendingMilestones();
  for (const p of pending) {
    if (!canNotifyNow(p.slot_date)) continue;

    const count = p.players.length;

    if (count >= 4 && p.confirmed && !p.notified) {
      if (!p.notified_2) markPartidoNotified2(p.id);
      if (!p.notified_3) markPartidoNotified3(p.id);
      await sendConfirmed(p.slot_date, p.start_time, p.players, p.id);
    } else if (count >= 3 && !p.notified_3) {
      if (!p.notified_2) markPartidoNotified2(p.id);
      await sendMilestone3(p.slot_date, p.start_time, p.players, p.id);
    } else if (count >= 2 && !p.notified_2) {
      await sendMilestone2(p.slot_date, p.start_time, p.players, p.id);
    }
  }
}

export async function sendWeeklyMessage(weekStartDate: string): Promise<void> {
  const dateFormatted = formatDate(weekStartDate);
  const msg = [
    `🎾 *¡Plazas abiertas para la semana del ${dateFormatted}!*`,
    ``,
    `Crea o únete a partidas aquí: ${config.baseUrl}`,
  ].join('\n');

  try {
    await sendMessage(config.waGroupId, msg);
    console.log('📨 Mensaje semanal enviado al grupo');
  } catch (err) {
    console.error('Error sending weekly message:', err);
  }
}

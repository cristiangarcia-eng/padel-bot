import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

export const config = {
  waEnabled: process.env.WA_ENABLED === 'true',
  waDryRun: process.env.WA_DRY_RUN === 'true',
  waGroupId: process.env.WA_GROUP_ID || '',
  port: parseInt(process.env.PORT || '3000', 10),
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  slotDurationMinutes: parseInt(process.env.SLOT_DURATION_MINUTES || '75', 10),
  slotStartHour: parseInt(process.env.SLOT_START_HOUR || '9', 10),
  slotEndHour: parseInt(process.env.SLOT_END_HOUR || '22', 10),
  playersPerMatch: parseInt(process.env.PLAYERS_PER_MATCH || '4', 10),
  adminPhone: process.env.ADMIN_PHONE || '',
  sundayMessageHour: parseInt(process.env.SUNDAY_MESSAGE_HOUR || '10', 10),
  dbPath: path.resolve(__dirname, '..', 'data', 'padel.db'),
  authInfoPath: path.resolve(__dirname, '..', 'auth_info'),
};

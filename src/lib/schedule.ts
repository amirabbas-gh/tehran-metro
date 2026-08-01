import schedulesData from "../assets/data/schedules.json";
import { toPersianDigits } from "./format";
import type {
  DayType,
  HeadwayPeriod,
  LineSchedule,
  ScheduleDirection,
  SchedulesFile,
  TravelDirection,
} from "../types/metro";

const schedules = schedulesData as SchedulesFile;

export const AVG_HOP_MINUTES = schedules.avgHopMinutes ?? 2.5;
export const TRANSFER_WALK_MINUTES = schedules.transferWalkMinutes ?? 4;

/** Iran week: Sat–Wed = weekday, Thu = thursday, Fri = friday (holidays ≈ friday). */
export function getDayType(date: Date = new Date()): DayType {
  const day = date.getDay(); // 0 Sun … 5 Fri, 6 Sat
  if (day === 5) return "friday";
  if (day === 4) return "thursday";
  return "weekday";
}

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToClock(totalMinutes: number): string {
  const normalized = ((Math.round(totalMinutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  const clock = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return toPersianDigits(clock);
}

export function dateToMinutes(date: Date): number {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

export function getLineSchedule(lineId: number): LineSchedule | undefined {
  return schedules.lines[String(lineId)];
}

function periodsFor(
  line: LineSchedule,
  direction: TravelDirection,
  dayType: DayType
): HeadwayPeriod[] {
  const dir: ScheduleDirection | undefined = line.directions[direction];
  if (!dir) return [];
  return dir[dayType] ?? [];
}

function findPeriod(
  periods: HeadwayPeriod[],
  timeMinutes: number
): HeadwayPeriod | null {
  for (const period of periods) {
    const from = timeToMinutes(period.from);
    const to = timeToMinutes(period.to);
    if (timeMinutes >= from && timeMinutes < to) return period;
  }
  // Exact end-of-day match: allow standing at the final boundary.
  for (const period of periods) {
    const to = timeToMinutes(period.to);
    if (Math.abs(timeMinutes - to) < 1e-6) return period;
  }
  return null;
}

/**
 * Minutes until the next train, given official headway for this line/direction.
 * Departures are modeled as aligned to each headway window's start time.
 */
export function waitForNextTrain(
  lineId: number,
  timeMinutes: number,
  direction: TravelDirection,
  dayType: DayType = getDayType()
): number {
  const line = getLineSchedule(lineId);
  if (!line) return TRANSFER_WALK_MINUTES;

  const periods = periodsFor(line, direction, dayType);
  if (!periods.length) return Number.POSITIVE_INFINITY;

  const firstFrom = timeToMinutes(periods[0].from);
  const lastTo = Math.max(...periods.map((p) => timeToMinutes(p.to)));

  if (timeMinutes >= lastTo) return Number.POSITIVE_INFINITY;

  if (timeMinutes < firstFrom) {
    return firstFrom - timeMinutes;
  }

  const period = findPeriod(periods, timeMinutes);
  if (!period) return Number.POSITIVE_INFINITY;

  const headway = period.headwayMinutes;
  if (headway <= 0) return 0;

  const periodStart = timeToMinutes(period.from);
  const elapsed = timeMinutes - periodStart;
  const sinceLast = elapsed % headway;
  // Exactly on a departure slot → board immediately.
  if (sinceLast < 1e-9 || headway - sinceLast < 1e-9) return 0;
  return headway - sinceLast;
}

/** Travel time for one inter-station hop (minutes). */
export function hopTravelMinutes(distanceKm: number): number {
  // Prefer distance-based estimate (~32 km/h commercial speed), floor at 1.5 min.
  if (distanceKm > 0) {
    return Math.max(1.5, (distanceKm / 32) * 60);
  }
  return AVG_HOP_MINUTES;
}

export function formatDurationFa(totalMinutes: number): string {
  const mins = Math.max(0, Math.round(totalMinutes));
  if (mins < 60) return `${toPersianDigits(mins)} دقیقه`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return `${toPersianDigits(h)} ساعت`;
  return `${toPersianDigits(h)} ساعت و ${toPersianDigits(m)} دقیقه`;
}

/**
 * Soft wait when service has ended: use half the last headway window so the UI
 * can still show an approximate arrival clock.
 */
export function estimateWaitMinutes(
  lineId: number,
  timeMinutes: number,
  direction: TravelDirection,
  dayType: DayType = getDayType()
): number {
  const exact = waitForNextTrain(lineId, timeMinutes, direction, dayType);
  if (Number.isFinite(exact)) return exact;

  const line = getLineSchedule(lineId);
  if (!line) return AVG_HOP_MINUTES;

  const periods = periodsFor(line, direction, dayType);
  if (!periods.length) return AVG_HOP_MINUTES * 2;

  const last = periods[periods.length - 1];
  return Math.max(AVG_HOP_MINUTES, last.headwayMinutes / 2);
}

import { createHash } from "node:crypto";
import { faker } from "@faker-js/faker";
import {
  PrismaClient,
  OperatorStatus,
  RouteStatus,
  ScheduleStatus,
  BookingStatus,
} from "@prisma/client";

const prisma = new PrismaClient();

// Set fixed seed for deterministic reproducible generation
faker.seed(42);

const OPERATOR_COUNT = 200;
const ROUTE_COUNT = 300;
const SCHEDULE_COUNT = 300;
const BOOKING_COUNT = 500;

const CREATED_EPOCH_MS = Date.UTC(2026, 8, 1, 4, 0, 0);
const CREATED_STEP_MINUTES = 5;

const DEPARTURE_EPOCH_MS = Date.UTC(2026, 9, 5, 4, 0, 0);
const DEPARTURE_DAY_COUNT = 30;
const DEPARTURES_PER_DAY = 10;
const DEPARTURE_SLOT_HOURS = 2;

const SEAT_OPTIONS = [14, 18, 30, 45] as const;

const BUS_MODELS: Record<number, string> = {
  14: "Toyota HiAce 14-Seater",
  18: "Mercedes-Benz Sprinter 18-Seater",
  30: "Toyota Coaster 30-Seater",
  45: "Marcopolo Executive 45-Seater",
};

const PLATE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

const NIGERIAN_CITIES = [
  { state: "Lagos", city: "Jibowu Terminal" },
  { state: "Lagos", city: "Ajah Terminal" },
  { state: "Lagos", city: "Ojota Bus Park" },
  { state: "FCT", city: "Utako Central Park" },
  { state: "FCT", city: "Jabi Park" },
  { state: "Enugu", city: "Holy Ghost Park" },
  { state: "Anambra", city: "Onitsha Main Park" },
  { state: "Anambra", city: "Awka Terminal" },
  { state: "Rivers", city: "Port Harcourt Waterlines" },
  { state: "Oyo", city: "Ibadan Challenge Park" },
  { state: "Imo", city: "Owerri Control Post" },
  { state: "Edo", city: "Benin City Akpakpava" },
  { state: "Kaduna", city: "Kaduna Central Park" },
  { state: "Kano", city: "Sabon Gari Terminal" },
];

const OPERATORS_DATA = [
  { name: "Peace Mass Transit", code: "PMT", hq: "Enugu", email: "support@peacemass.ng", phone: "+2348030000001" },
  { name: "GIG Logistics & Express", code: "GIG", hq: "Lagos", email: "contact@gigm.ng", phone: "+2348030000002" },
  { name: "Young Shall Grow Motors", code: "YSG", hq: "Lagos", email: "info@ysgmotors.ng", phone: "+2348030000003" },
  { name: "GUO Transport Service", code: "GUO", hq: "Anambra", email: "care@guotransport.ng", phone: "+2348030000004" },
  { name: "Ekene Dili Chukwu Express", code: "EDC", hq: "Anambra", email: "info@ekenedilichukwu.ng", phone: "+2348030000005" },
  { name: "Chisco Transport Nigeria", code: "CTN", hq: "Lagos", email: "help@chiscogroup.ng", phone: "+2348030000006" },
  { name: "ABC Transport Plc", code: "ABC", hq: "Imo", email: "support@abctransport.ng", phone: "+2348030000007" },
  { name: "Libra Motors", code: "LBM", hq: "Lagos", email: "customercare@libramotors.ng", phone: "+2348030000008" },
  { name: "Ifesinachi Transport", code: "IFT", hq: "Enugu", email: "info@ifesinachi.ng", phone: "+2348030000009" },
  { name: "God is Good Executive", code: "GGE", hq: "Edo", email: "executive@gge.ng", phone: "+2348030000010" },
];

type IdPrefix = "op" | "rot" | "sch" | "bkg";

// Deterministic replacement for random cuid2: same `<prefix>_<24 lowercase alnum>`
// shape, but derived from a stable natural key so re-seeding produces identical IDs.
function seededId(prefix: IdPrefix, ...parts: (string | number)[]): string {
  const digest = createHash("sha256").update(`${prefix}:${parts.join(":")}`).digest("hex");
  return `${prefix}_${digest.slice(0, 24)}`;
}

// 7919 is prime, so (index * 7919) % 900000 is injective for index < 900000.
function bookingReference(index: number): string {
  return `NG-BUS-${100000 + ((index * 7919) % 900000)}`;
}

function createdAtFor(index: number): Date {
  return new Date(CREATED_EPOCH_MS + index * CREATED_STEP_MINUTES * 60_000);
}

function plateFor(scheduleId: string): string {
  const h = createHash("sha256").update(`plate:${scheduleId}`).digest("hex");
  const letter = (offset: number) => PLATE_LETTERS[parseInt(h.slice(offset, offset + 2), 16) % PLATE_LETTERS.length];
  const digits = 100 + (parseInt(h.slice(4, 7), 16) % 900);
  return `${letter(0)}${letter(2)}-${digits}-${letter(7)}${letter(9)}`;
}

async function main() {
  if (DEPARTURE_DAY_COUNT * DEPARTURES_PER_DAY !== SCHEDULE_COUNT) {
    throw new Error(
      `Departure grid ${DEPARTURE_DAY_COUNT}x${DEPARTURES_PER_DAY} does not cover ${SCHEDULE_COUNT} schedules`
    );
  }

  console.log("Cleaning database tables...");
  await prisma.booking.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.route.deleteMany();
  await prisma.operator.deleteMany();

  // Booking tally per schedule is needed up front so availableSeats can be derived.
  const bookingsPerSchedule = new Array<number>(SCHEDULE_COUNT).fill(0);
  for (let b = 0; b < BOOKING_COUNT; b++) {
    bookingsPerSchedule[b % SCHEDULE_COUNT] += 1;
  }

  console.log(`Seeding ${OPERATOR_COUNT} Operators...`);
  const operatorRows = [];
  for (let i = 0; i < OPERATOR_COUNT; i++) {
    const real = OPERATORS_DATA[i];
    const code = real ? real.code : `NTL-${String(i - OPERATORS_DATA.length + 1).padStart(4, "0")}`;
    const slug = code.toLowerCase().replace(/[^a-z0-9]/g, "");
    const hq = NIGERIAN_CITIES[i % NIGERIAN_CITIES.length].state;

    operatorRows.push({
      id: seededId("op", code),
      name: real ? real.name : `${faker.company.name()} (${code})`,
      code,
      headquarters: real ? real.hq : hq,
      supportEmail: real ? real.email : `ops.${slug}@example.com`,
      supportPhone: real ? real.phone : `+2348${((i * 7919) % 1000000000).toString().padStart(9, "0")}`,
      status: OperatorStatus.ACTIVE,
      createdAt: createdAtFor(i),
    });
  }
  await prisma.operator.createMany({ data: operatorRows });

  console.log(`Seeding ${ROUTE_COUNT} Routes...`);
  const pairSeen = new Map<string, number>();
  const routeRows = [];
  for (let i = 0; i < ROUTE_COUNT; i++) {
    const operator = operatorRows[i % OPERATOR_COUNT];

    // Deterministic sweep over every ordered city pair, so filters hit real data.
    const pairCount = NIGERIAN_CITIES.length * (NIGERIAN_CITIES.length - 1);
    const p = i % pairCount;
    const originIdx = Math.floor(p / (NIGERIAN_CITIES.length - 1));
    let destIdx = p % (NIGERIAN_CITIES.length - 1);
    if (destIdx >= originIdx) destIdx += 1;

    const origin = NIGERIAN_CITIES[originIdx];
    const destination = NIGERIAN_CITIES[destIdx];

    const distanceKm = faker.number.int({ min: 120, max: 950 });
    const estimatedMinutes = Math.round(distanceKm * 1.5 + faker.number.int({ min: 20, max: 90 }));
    const baseFareAmount = faker.number.int({ min: 15000, max: 45000 }) * 100;

    const pairKey = `${operator.code}|${origin.city}|${destination.city}`;
    const occurrence = pairSeen.get(pairKey) ?? 0;
    pairSeen.set(pairKey, occurrence + 1);

    routeRows.push({
      id: seededId("rot", pairKey, occurrence),
      operatorId: operator.id,
      originState: origin.state,
      originCity: origin.city,
      destinationState: destination.state,
      destinationCity: destination.city,
      distanceKm,
      estimatedMinutes,
      baseFareAmount,
      currency: "NGN",
      status: RouteStatus.ACTIVE,
      createdAt: createdAtFor(i),
    });
  }
  await prisma.route.createMany({ data: routeRows });

  console.log(`Seeding ${SCHEDULE_COUNT} Schedules...`);
  const scheduleRows = [];
  for (let i = 0; i < SCHEDULE_COUNT; i++) {
    const route = routeRows[i];
    const totalSeats = faker.helpers.arrayElement(SEAT_OPTIONS);
    const booked = bookingsPerSchedule[i];
    const availableSeats = totalSeats - booked;
    if (availableSeats < 0) {
      throw new Error(`Schedule ${i} overbooked: ${booked} bookings > ${totalSeats} seats`);
    }

    const departureTime = new Date(
      DEPARTURE_EPOCH_MS +
        (i % DEPARTURE_DAY_COUNT) * 86_400_000 +
        Math.floor(i / DEPARTURE_DAY_COUNT) * DEPARTURE_SLOT_HOURS * 3_600_000
    );

    scheduleRows.push({
      id: seededId("sch", route.id),
      routeId: route.id,
      operatorId: route.operatorId,
      busRegistrationNumber: "",
      busModel: BUS_MODELS[totalSeats],
      totalSeats,
      availableSeats,
      departureTime,
      arrivalTime: new Date(departureTime.getTime() + route.estimatedMinutes * 60_000),
      fareAmount: route.baseFareAmount + faker.number.int({ min: -2000, max: 5000 }) * 100,
      currency: "NGN",
      status: ScheduleStatus.SCHEDULED,
      createdAt: createdAtFor(i),
    });
  }
  for (const row of scheduleRows) {
    row.busRegistrationNumber = plateFor(row.id);
  }
  await prisma.schedule.createMany({ data: scheduleRows });

  console.log(`Seeding ${BOOKING_COUNT} Bookings...`);
  const usedRefs = new Set<string>();
  const seatCursor = new Array<number>(SCHEDULE_COUNT).fill(0);
  const bookingRows = [];
  for (let b = 0; b < BOOKING_COUNT; b++) {
    const s = b % SCHEDULE_COUNT;
    const schedule = scheduleRows[s];
    const ref = bookingReference(b);

    if (usedRefs.has(ref)) {
      throw new Error(`Duplicate bookingReference '${ref}' generated at index ${b}`);
    }
    usedRefs.add(ref);

    const seatNumber = (seatCursor[s] += 1);
    if (seatNumber > schedule.totalSeats) {
      throw new Error(`Seat ${seatNumber} exceeds capacity ${schedule.totalSeats} for schedule ${schedule.id}`);
    }

    bookingRows.push({
      id: seededId("bkg", ref),
      scheduleId: schedule.id,
      passengerName: faker.person.fullName(),
      passengerPhone: `+2348${faker.string.numeric(9)}`,
      passengerEmail: faker.internet.email().toLowerCase(),
      seatNumber,
      totalAmount: schedule.fareAmount,
      currency: "NGN",
      bookingReference: ref,
      status: BookingStatus.CONFIRMED,
      createdAt: createdAtFor(b),
    });
  }
  await prisma.booking.createMany({ data: bookingRows });

  const [operators, routes, schedules, bookings] = await Promise.all([
    prisma.operator.count(),
    prisma.route.count(),
    prisma.schedule.count(),
    prisma.booking.count(),
  ]);

  const overbooked = await prisma.schedule.count({ where: { availableSeats: { lt: 0 } } });
  const negativeFares = await prisma.schedule.count({ where: { fareAmount: { lte: 0 } } });
  const distinctDepartures = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(DISTINCT "departureTime") AS n FROM "Schedule"`;
  const duplicateSeats = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS n FROM (
      SELECT "scheduleId", "seatNumber" FROM "Booking"
      GROUP BY "scheduleId", "seatNumber" HAVING COUNT(*) > 1
    ) t`;

  const fingerprintRows = await Promise.all([
    prisma.operator.findMany({ select: { id: true, code: true, createdAt: true }, orderBy: { id: "asc" } }),
    prisma.route.findMany({
      select: { id: true, originCity: true, destinationCity: true, baseFareAmount: true, createdAt: true },
      orderBy: { id: "asc" },
    }),
    prisma.schedule.findMany({
      select: { id: true, routeId: true, departureTime: true, arrivalTime: true, availableSeats: true, createdAt: true },
      orderBy: { id: "asc" },
    }),
    prisma.booking.findMany({
      select: { id: true, scheduleId: true, seatNumber: true, bookingReference: true, createdAt: true },
      orderBy: { id: "asc" },
    }),
  ]);

  const canonical = fingerprintRows
    .flat()
    .map((r) => JSON.stringify(r, Object.keys(r as object).sort()))
    .join("\n");
  const fingerprint = createHash("sha256").update(canonical).digest("hex").slice(0, 32);

  console.log("\n--- Seed verification ---");
  console.log(`Operators:  ${operators}`);
  console.log(`Routes:     ${routes}`);
  console.log(`Schedules:  ${schedules}`);
  console.log(`Bookings:   ${bookings}`);
  console.log(`Distinct departureTime values: ${distinctDepartures[0]?.n ?? "n/a"}`);
  console.log(`Overbooked schedules (availableSeats < 0): ${overbooked}`);
  console.log(`Duplicate (scheduleId, seatNumber) pairs: ${duplicateSeats[0]?.n ?? "n/a"}`);
  console.log(`Non-positive fares: ${negativeFares}`);
  console.log(`Dataset fingerprint: ${fingerprint}`);

  if (
    operators !== OPERATOR_COUNT ||
    routes !== ROUTE_COUNT ||
    schedules !== SCHEDULE_COUNT ||
    bookings !== BOOKING_COUNT
  ) {
    throw new Error(
      `Count mismatch: got ${operators}/${routes}/${schedules}/${bookings}, expected ${OPERATOR_COUNT}/${ROUTE_COUNT}/${SCHEDULE_COUNT}/${BOOKING_COUNT}`
    );
  }
  if (overbooked > 0 || negativeFares > 0) {
    throw new Error("Seed produced invalid seat or fare data");
  }

  console.log("Database successfully seeded!");
}

main()
  .catch((e) => {
    console.error("Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { PrismaClient, OperatorStatus, RouteStatus, ScheduleStatus, BookingStatus } from "@prisma/client";
import { faker } from "@faker-js/faker";
import { createId } from "@paralleldrive/cuid2";

const prisma = new PrismaClient();

// Set fixed seed for deterministic reproducible generation
faker.seed(42);

function genId(prefix: "op" | "rot" | "sch" | "bkg"): string {
  return `${prefix}_${createId()}`;
}

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

async function main() {
  console.log("Cleaning database tables...");
  await prisma.booking.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.route.deleteMany();
  await prisma.operator.deleteMany();

  console.log("Seeding 10 Operators...");
  const operators = [];
  for (const op of OPERATORS_DATA) {
    const created = await prisma.operator.create({
      data: {
        id: genId("op"),
        name: op.name,
        code: op.code,
        headquarters: op.hq,
        supportEmail: op.email,
        supportPhone: op.phone,
        status: OperatorStatus.ACTIVE,
      },
    });
    operators.push(created);
  }

  console.log("Seeding 50 Routes...");
  const routes = [];
  for (let i = 0; i < 50; i++) {
    const operator = operators[i % operators.length];
    
    // Pick two distinct cities
    const originIdx = faker.number.int({ min: 0, max: NIGERIAN_CITIES.length - 1 });
    let destIdx = faker.number.int({ min: 0, max: NIGERIAN_CITIES.length - 1 });
    while (destIdx === originIdx) {
      destIdx = faker.number.int({ min: 0, max: NIGERIAN_CITIES.length - 1 });
    }

    const origin = NIGERIAN_CITIES[originIdx];
    const destination = NIGERIAN_CITIES[destIdx];
    const distanceKm = faker.number.int({ min: 120, max: 950 });
    const estimatedMinutes = Math.round(distanceKm * 1.5 + faker.number.int({ min: 20, max: 90 }));
    // Base fare in integer kobo: e.g. ₦15,000 to ₦45,000 => 1,500,000 to 4,500,000 kobo
    const baseFareAmount = faker.number.int({ min: 15000, max: 45000 }) * 100;

    const createdRoute = await prisma.route.create({
      data: {
        id: genId("rot"),
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
      },
    });
    routes.push(createdRoute);
  }

  console.log("Seeding 200 Schedules...");
  const schedules = [];
  const busModels = [
    "Toyota HiAce 14-Seater",
    "Toyota Coaster 30-Seater",
    "Mercedes-Benz Sprinter 18-Seater",
    "Marcopolo Executive 45-Seater",
    "Nissan Urvan 14-Seater",
  ];

  for (let i = 0; i < 200; i++) {
    const route = routes[i % routes.length];
    const totalSeats = faker.helpers.arrayElement([14, 18, 30, 45]);
    const availableSeats = faker.number.int({ min: 2, max: totalSeats });
    
    // Future departure date within next 30 days
    const departureTime = faker.date.soon({ days: 30 });
    const arrivalTime = new Date(departureTime.getTime() + route.estimatedMinutes * 60 * 1000);
    
    const stateLetter1 = faker.string.alpha({ length: 2, casing: "upper" });
    const stateLetter2 = faker.string.alpha({ length: 2, casing: "upper" });
    const regNum = `${stateLetter1}-${faker.number.int({ min: 100, max: 999 })}-${stateLetter2}`;

    const createdSchedule = await prisma.schedule.create({
      data: {
        id: genId("sch"),
        routeId: route.id,
        operatorId: route.operatorId,
        busRegistrationNumber: regNum,
        busModel: faker.helpers.arrayElement(busModels),
        totalSeats,
        availableSeats,
        departureTime,
        arrivalTime,
        fareAmount: route.baseFareAmount + faker.number.int({ min: -2000, max: 5000 }) * 100,
        currency: "NGN",
        status: ScheduleStatus.SCHEDULED,
      },
    });
    schedules.push(createdSchedule);
  }

  console.log("Seeding 500 Bookings...");
  for (let i = 0; i < 500; i++) {
    const schedule = schedules[i % schedules.length];
    const seatNumber = (i % schedule.totalSeats) + 1;
    const refNum = `NG-BUS-${faker.number.int({ min: 100000, max: 999999 })}`;

    await prisma.booking.create({
      data: {
        id: genId("bkg"),
        scheduleId: schedule.id,
        passengerName: faker.person.fullName(),
        passengerPhone: `+2348${faker.string.numeric(9)}`,
        passengerEmail: faker.internet.email().toLowerCase(),
        seatNumber,
        totalAmount: schedule.fareAmount,
        currency: "NGN",
        bookingReference: refNum,
        status: BookingStatus.CONFIRMED,
      },
    });
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

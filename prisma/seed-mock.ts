import { PrismaClient, TransactionType, BillType, DepositStatus } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  // ═══════════════════════════════════════════════════════
  // Reference Data
  // ═══════════════════════════════════════════════════════

  await prisma.bookingStatus.createMany({
    data: [
      { id: 1, status: "PENDING" },
      { id: 2, status: "ACTIVE" },
      { id: 3, status: "COMPLETED" },
      { id: 4, status: "CANCELLED" },
    ],
    skipDuplicates: true,
  });

  await prisma.paymentStatus.createMany({
    data: [
      { id: 1, status: "PENDING" },
      { id: 2, status: "VERIFIED" },
      { id: 3, status: "REJECTED" },
    ],
    skipDuplicates: true,
  });

  await prisma.roomStatus.createMany({
    data: [
      { id: 1, status: "Available" },
      { id: 2, status: "Occupied" },
      { id: 3, status: "Maintenance" },
    ],
    skipDuplicates: true,
  });

  await prisma.role.createMany({
    data: [
      { id: 1, name: "Admin", description: "Full system access" },
      { id: 2, name: "Manager", description: "Property management access" },
      { id: 3, name: "Staff", description: "Day-to-day operations" },
      { id: 4, name: "Viewer", description: "Read-only access" },
    ],
    skipDuplicates: true,
  });

  // ═══════════════════════════════════════════════════════
  // Settings
  // ═══════════════════════════════════════════════════════

  await prisma.setting.createMany({
    data: [
      { setting_key: "APP_SETUP", setting_value: "true" },
      { setting_key: "COMPANY_NAME", setting_value: "Mi Casa Suites" },
      { setting_key: "COMPANY_IMAGE", setting_value: "" },
      { setting_key: "REGISTRATION_ENABLED", setting_value: "false" },
      { setting_key: "MONTHLY_INVOICE_EMAIL_REMINDER_ENABLED", setting_value: "true" },
    ],
    skipDuplicates: true,
  });

  // ═══════════════════════════════════════════════════════
  // Users
  // ═══════════════════════════════════════════════════════

  const hashedPassword = await bcrypt.hash("admin123", 10);
  const staffPassword = await bcrypt.hash("staff123", 10);

  const admin = await prisma.siteUser.upsert({
    where: { email: "admin@micasasuites.com" },
    update: {},
    create: {
      name: "Administrator",
      email: "admin@micasasuites.com",
      password: hashedPassword,
      role_id: 1,
    },
  });

  await prisma.siteUser.upsert({
    where: { email: "manager@micasasuites.com" },
    update: {},
    create: {
      name: "Budi Santoso",
      email: "manager@micasasuites.com",
      password: staffPassword,
      role_id: 2,
    },
  });

  await prisma.siteUser.upsert({
    where: { email: "staff@micasasuites.com" },
    update: {},
    create: {
      name: "Siti Rahayu",
      email: "staff@micasasuites.com",
      password: staffPassword,
      role_id: 3,
    },
  });

  // ═══════════════════════════════════════════════════════
  // Locations
  // ═══════════════════════════════════════════════════════

  const loc1 = await prisma.location.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, name: "Mi Casa Sudirman", address: "Jl. Jend. Sudirman No. 45, Jakarta Selatan" },
  });

  const loc2 = await prisma.location.upsert({
    where: { id: 2 },
    update: {},
    create: { id: 2, name: "Mi Casa Kemang", address: "Jl. Kemang Raya No. 12, Jakarta Selatan" },
  });

  // ═══════════════════════════════════════════════════════
  // Room Types
  // ═══════════════════════════════════════════════════════

  const studio = await prisma.roomType.upsert({
    where: { type: "Studio" },
    update: {},
    create: { type: "Studio", description: "Kamar studio kompak dengan kitchenette" },
  });

  const oneBR = await prisma.roomType.upsert({
    where: { type: "1 Bedroom" },
    update: {},
    create: { type: "1 Bedroom", description: "Satu kamar tidur dengan ruang tamu terpisah" },
  });

  const twoBR = await prisma.roomType.upsert({
    where: { type: "2 Bedroom" },
    update: {},
    create: { type: "2 Bedroom", description: "Dua kamar tidur, cocok untuk keluarga" },
  });

  // ═══════════════════════════════════════════════════════
  // Durations
  // ═══════════════════════════════════════════════════════

  const dur3 = await prisma.duration.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, duration: "3 Bulan", month_count: 3 },
  });

  const dur6 = await prisma.duration.upsert({
    where: { id: 2 },
    update: {},
    create: { id: 2, duration: "6 Bulan", month_count: 6 },
  });

  const dur12 = await prisma.duration.upsert({
    where: { id: 3 },
    update: {},
    create: { id: 3, duration: "1 Tahun", month_count: 12 },
  });

  // ═══════════════════════════════════════════════════════
  // Room Type Durations (pricing matrix)
  // ═══════════════════════════════════════════════════════

  const rtdData = [
    { room_type_id: studio.id, duration_id: dur3.id, suggested_price: 4500000, location_id: loc1.id },
    { room_type_id: studio.id, duration_id: dur6.id, suggested_price: 4000000, location_id: loc1.id },
    { room_type_id: studio.id, duration_id: dur12.id, suggested_price: 3500000, location_id: loc1.id },
    { room_type_id: oneBR.id, duration_id: dur3.id, suggested_price: 7000000, location_id: loc1.id },
    { room_type_id: oneBR.id, duration_id: dur6.id, suggested_price: 6500000, location_id: loc1.id },
    { room_type_id: oneBR.id, duration_id: dur12.id, suggested_price: 6000000, location_id: loc1.id },
    { room_type_id: twoBR.id, duration_id: dur6.id, suggested_price: 9000000, location_id: loc1.id },
    { room_type_id: twoBR.id, duration_id: dur12.id, suggested_price: 8000000, location_id: loc1.id },
    { room_type_id: studio.id, duration_id: dur3.id, suggested_price: 5000000, location_id: loc2.id },
    { room_type_id: studio.id, duration_id: dur6.id, suggested_price: 4500000, location_id: loc2.id },
    { room_type_id: oneBR.id, duration_id: dur6.id, suggested_price: 7500000, location_id: loc2.id },
    { room_type_id: oneBR.id, duration_id: dur12.id, suggested_price: 7000000, location_id: loc2.id },
  ];

  for (const rtd of rtdData) {
    await prisma.roomTypeDuration.upsert({
      where: {
        room_type_id_duration_id_location_id: {
          room_type_id: rtd.room_type_id,
          duration_id: rtd.duration_id,
          location_id: rtd.location_id,
        },
      },
      update: {},
      create: rtd,
    });
  }

  // ═══════════════════════════════════════════════════════
  // Rooms — Location 1 (Sudirman)
  // ═══════════════════════════════════════════════════════

  const rooms: { room_number: string; room_type_id: number; status_id: number; location_id: number }[] = [
    { room_number: "101", room_type_id: studio.id, status_id: 2, location_id: loc1.id },
    { room_number: "102", room_type_id: studio.id, status_id: 2, location_id: loc1.id },
    { room_number: "103", room_type_id: studio.id, status_id: 1, location_id: loc1.id },
    { room_number: "104", room_type_id: studio.id, status_id: 1, location_id: loc1.id },
    { room_number: "201", room_type_id: oneBR.id, status_id: 2, location_id: loc1.id },
    { room_number: "202", room_type_id: oneBR.id, status_id: 2, location_id: loc1.id },
    { room_number: "203", room_type_id: oneBR.id, status_id: 1, location_id: loc1.id },
    { room_number: "301", room_type_id: twoBR.id, status_id: 2, location_id: loc1.id },
    { room_number: "302", room_type_id: twoBR.id, status_id: 3, location_id: loc1.id },
    // Location 2 (Kemang)
    { room_number: "A1", room_type_id: studio.id, status_id: 2, location_id: loc2.id },
    { room_number: "A2", room_type_id: studio.id, status_id: 1, location_id: loc2.id },
    { room_number: "A3", room_type_id: studio.id, status_id: 1, location_id: loc2.id },
    { room_number: "B1", room_type_id: oneBR.id, status_id: 2, location_id: loc2.id },
    { room_number: "B2", room_type_id: oneBR.id, status_id: 2, location_id: loc2.id },
    { room_number: "B3", room_type_id: oneBR.id, status_id: 1, location_id: loc2.id },
  ];

  const createdRooms: Record<string, number> = {};
  for (const room of rooms) {
    const r = await prisma.room.upsert({
      where: { room_number_location_id: { room_number: room.room_number, location_id: room.location_id } },
      update: {},
      create: room,
    });
    createdRooms[`${room.location_id}-${room.room_number}`] = r.id;
  }

  // ═══════════════════════════════════════════════════════
  // Tenants
  // ═══════════════════════════════════════════════════════

  const tenants = [
    { name: "Ahmad Wijaya", email: "ahmad.wijaya@gmail.com", phone: "+6281234567890", id_number: "3174012345670001" },
    { name: "Diana Putri", email: "diana.putri@yahoo.com", phone: "+6285678901234", id_number: "3174012345670002" },
    { name: "Reza Firmansyah", email: "reza.f@outlook.com", phone: "+6287654321098", id_number: "3174012345670003" },
    { name: "Maya Sari", email: "maya.sari@gmail.com", phone: "+6281122334455", id_number: "3174012345670004" },
    { name: "Kevin Hartanto", email: "kevin.h@gmail.com", phone: "+6289988776655", id_number: "3174012345670005" },
    { name: "Lisa Anggraini", email: "lisa.a@hotmail.com", phone: "+6282233445566", id_number: "3174012345670006" },
    { name: "Andi Prasetyo", email: "andi.p@gmail.com", phone: "+6281987654321", id_number: "3174012345670007" },
    { name: "Dewi Lestari", email: "dewi.l@gmail.com", phone: "+6285511223344", id_number: "3174012345670008" },
  ];

  const createdTenants: string[] = [];
  for (const t of tenants) {
    const tenant = await prisma.tenant.upsert({
      where: { id: t.id_number },
      update: {},
      create: { id: t.id_number, ...t },
    });
    createdTenants.push(tenant.id);
  }

  // ═══════════════════════════════════════════════════════
  // Add-ons
  // ═══════════════════════════════════════════════════════

  const parkingAddon = await prisma.addOn.upsert({
    where: { name_location_id: { name: "Parkir Mobil", location_id: loc1.id } },
    update: {},
    create: {
      name: "Parkir Mobil",
      description: "Slot parkir mobil di basement",
      location_id: loc1.id,
      requires_input: true,
      pricing: {
        create: [
          { price: 500000, interval_start: 0, interval_end: 6, is_full_payment: false },
          { price: 400000, interval_start: 6, interval_end: null, is_full_payment: false },
        ],
      },
    },
  });

  const laundryAddon = await prisma.addOn.upsert({
    where: { name_location_id: { name: "Laundry", location_id: loc1.id } },
    update: {},
    create: {
      name: "Laundry",
      description: "Layanan laundry bulanan",
      location_id: loc1.id,
      requires_input: false,
      pricing: {
        create: [
          { price: 250000, interval_start: 0, interval_end: null, is_full_payment: false },
        ],
      },
    },
  });

  const internetAddon = await prisma.addOn.upsert({
    where: { name_location_id: { name: "Internet Upgrade", location_id: loc1.id } },
    update: {},
    create: {
      name: "Internet Upgrade",
      description: "Upgrade ke 100 Mbps",
      location_id: loc1.id,
      requires_input: false,
      pricing: {
        create: [
          { price: 150000, interval_start: 0, interval_end: null, is_full_payment: false },
        ],
      },
    },
  });

  // ═══════════════════════════════════════════════════════
  // Bookings (various statuses)
  // ═══════════════════════════════════════════════════════

  // Active bookings
  const booking1 = await prisma.booking.create({
    data: {
      room_id: createdRooms[`${loc1.id}-101`],
      tenant_id: createdTenants[0],
      start_date: new Date("2026-01-01"),
      end_date: new Date("2026-12-31"),
      duration_id: dur12.id,
      status_id: 2,
      fee: 3500000,
    },
  });

  const booking2 = await prisma.booking.create({
    data: {
      room_id: createdRooms[`${loc1.id}-102`],
      tenant_id: createdTenants[1],
      start_date: new Date("2026-03-01"),
      end_date: new Date("2026-08-31"),
      duration_id: dur6.id,
      status_id: 2,
      fee: 4000000,
    },
  });

  const booking3 = await prisma.booking.create({
    data: {
      room_id: createdRooms[`${loc1.id}-201`],
      tenant_id: createdTenants[2],
      start_date: new Date("2026-02-01"),
      end_date: new Date("2027-01-31"),
      duration_id: dur12.id,
      status_id: 2,
      fee: 6000000,
    },
  });

  const booking4 = await prisma.booking.create({
    data: {
      room_id: createdRooms[`${loc1.id}-202`],
      tenant_id: createdTenants[3],
      start_date: new Date("2026-04-01"),
      end_date: new Date("2026-09-30"),
      duration_id: dur6.id,
      status_id: 2,
      fee: 6500000,
    },
  });

  const booking5 = await prisma.booking.create({
    data: {
      room_id: createdRooms[`${loc1.id}-301`],
      tenant_id: createdTenants[4],
      start_date: new Date("2026-01-15"),
      end_date: new Date("2027-01-14"),
      duration_id: dur12.id,
      status_id: 2,
      fee: 8000000,
      is_rolling: true,
    },
  });

  // Location 2 bookings
  const booking6 = await prisma.booking.create({
    data: {
      room_id: createdRooms[`${loc2.id}-A1`],
      tenant_id: createdTenants[5],
      start_date: new Date("2026-02-01"),
      end_date: new Date("2026-07-31"),
      duration_id: dur6.id,
      status_id: 2,
      fee: 4500000,
    },
  });

  const booking7 = await prisma.booking.create({
    data: {
      room_id: createdRooms[`${loc2.id}-B1`],
      tenant_id: createdTenants[6],
      start_date: new Date("2026-03-01"),
      end_date: new Date("2027-02-28"),
      duration_id: dur12.id,
      status_id: 2,
      fee: 7000000,
    },
  });

  const booking8 = await prisma.booking.create({
    data: {
      room_id: createdRooms[`${loc2.id}-B2`],
      tenant_id: createdTenants[7],
      start_date: new Date("2026-05-01"),
      end_date: new Date("2026-07-31"),
      duration_id: dur3.id,
      status_id: 2,
      fee: 7500000,
    },
  });

  // Completed booking
  const bookingCompleted = await prisma.booking.create({
    data: {
      room_id: createdRooms[`${loc1.id}-103`],
      tenant_id: createdTenants[0],
      start_date: new Date("2025-06-01"),
      end_date: new Date("2025-11-30"),
      duration_id: dur6.id,
      status_id: 3,
      fee: 4000000,
    },
  });

  // ═══════════════════════════════════════════════════════
  // Booking Add-ons
  // ═══════════════════════════════════════════════════════

  await prisma.bookingAddOn.create({
    data: {
      addon_id: parkingAddon.id,
      booking_id: booking1.id,
      start_date: new Date("2026-01-01"),
      end_date: new Date("2026-12-31"),
      input: "B 1234 ABC",
    },
  });

  await prisma.bookingAddOn.create({
    data: {
      addon_id: laundryAddon.id,
      booking_id: booking3.id,
      start_date: new Date("2026-02-01"),
      end_date: new Date("2027-01-31"),
    },
  });

  await prisma.bookingAddOn.create({
    data: {
      addon_id: internetAddon.id,
      booking_id: booking5.id,
      start_date: new Date("2026-01-15"),
      is_rolling: true,
    },
  });

  // ═══════════════════════════════════════════════════════
  // Deposits
  // ═══════════════════════════════════════════════════════

  await prisma.deposit.create({ data: { booking_id: booking1.id, amount: 3500000, status: DepositStatus.HELD } });
  await prisma.deposit.create({ data: { booking_id: booking2.id, amount: 4000000, status: DepositStatus.HELD } });
  await prisma.deposit.create({ data: { booking_id: booking3.id, amount: 6000000, status: DepositStatus.HELD } });
  await prisma.deposit.create({ data: { booking_id: booking4.id, amount: 6500000, status: DepositStatus.HELD } });
  await prisma.deposit.create({ data: { booking_id: booking5.id, amount: 8000000, status: DepositStatus.HELD } });
  await prisma.deposit.create({ data: { booking_id: booking6.id, amount: 4500000, status: DepositStatus.HELD } });
  await prisma.deposit.create({ data: { booking_id: booking7.id, amount: 7000000, status: DepositStatus.UNPAID } });
  await prisma.deposit.create({ data: { booking_id: booking8.id, amount: 7500000, status: DepositStatus.HELD } });
  await prisma.deposit.create({
    data: {
      booking_id: bookingCompleted.id,
      amount: 4000000,
      status: DepositStatus.REFUNDED,
      refunded_amount: 4000000,
      refunded_at: new Date("2025-12-05"),
    },
  });

  // ═══════════════════════════════════════════════════════
  // Bills & Bill Items (monthly bills for active bookings)
  // ═══════════════════════════════════════════════════════

  const activeBookings = [
    { booking: booking1, fee: 3500000, start: new Date("2026-01-01") },
    { booking: booking2, fee: 4000000, start: new Date("2026-03-01") },
    { booking: booking3, fee: 6000000, start: new Date("2026-02-01") },
    { booking: booking4, fee: 6500000, start: new Date("2026-04-01") },
    { booking: booking5, fee: 8000000, start: new Date("2026-01-15") },
  ];

  const billIds: number[] = [];
  const today = new Date("2026-06-09");

  for (const { booking, fee, start } of activeBookings) {
    let current = new Date(start);
    while (current <= today) {
      const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
      const dueDate = monthEnd;
      const monthName = current.toLocaleDateString("id-ID", { month: "long", year: "numeric" });

      const bill = await prisma.bill.create({
        data: {
          booking_id: booking.id,
          description: `Tagihan untuk Bulan ${monthName}`,
          due_date: dueDate,
          bill_item: {
            create: [
              {
                description: `Sewa kamar - ${monthName}`,
                amount: fee,
                type: BillType.GENERATED,
              },
            ],
          },
        },
      });
      billIds.push(bill.id);

      current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    }
  }

  // Add add-on bill items to booking1's bills (parking)
  const booking1Bills = await prisma.bill.findMany({
    where: { booking_id: booking1.id },
    orderBy: { due_date: "asc" },
  });
  for (const bill of booking1Bills) {
    await prisma.billItem.create({
      data: {
        bill_id: bill.id,
        description: "Parkir Mobil (B 1234 ABC)",
        amount: 500000,
        type: BillType.GENERATED,
        related_id: { addon_id: parkingAddon.id },
      },
    });
  }

  // ═══════════════════════════════════════════════════════
  // Payments (partial and full payments)
  // ═══════════════════════════════════════════════════════

  // Booking 1: paid all months through May
  const booking1PaidBills = booking1Bills.slice(0, 5);
  for (const bill of booking1PaidBills) {
    const payment = await prisma.payment.create({
      data: {
        booking_id: booking1.id,
        amount: 4000000, // rent + parking
        payment_date: new Date(bill.due_date.getFullYear(), bill.due_date.getMonth(), 5),
        status_id: 2, // VERIFIED
      },
    });
    await prisma.paymentBill.create({
      data: { payment_id: payment.id, bill_id: bill.id, amount: 4000000 },
    });
  }

  // Booking 2: paid first 2 months
  const booking2Bills = await prisma.bill.findMany({
    where: { booking_id: booking2.id },
    orderBy: { due_date: "asc" },
  });
  for (const bill of booking2Bills.slice(0, 2)) {
    const payment = await prisma.payment.create({
      data: {
        booking_id: booking2.id,
        amount: 4000000,
        payment_date: new Date(bill.due_date.getFullYear(), bill.due_date.getMonth(), 3),
        status_id: 2,
      },
    });
    await prisma.paymentBill.create({
      data: { payment_id: payment.id, bill_id: bill.id, amount: 4000000 },
    });
  }

  // Booking 3: paid through April, May pending
  const booking3Bills = await prisma.bill.findMany({
    where: { booking_id: booking3.id },
    orderBy: { due_date: "asc" },
  });
  for (const bill of booking3Bills.slice(0, 3)) {
    const payment = await prisma.payment.create({
      data: {
        booking_id: booking3.id,
        amount: 6000000,
        payment_date: new Date(bill.due_date.getFullYear(), bill.due_date.getMonth(), 1),
        status_id: 2,
      },
    });
    await prisma.paymentBill.create({
      data: { payment_id: payment.id, bill_id: bill.id, amount: 6000000 },
    });
  }
  // May payment pending verification
  if (booking3Bills.length > 3) {
    const pendingPayment = await prisma.payment.create({
      data: {
        booking_id: booking3.id,
        amount: 6000000,
        payment_date: new Date("2026-05-28"),
        status_id: 1, // PENDING
      },
    });
    await prisma.paymentBill.create({
      data: { payment_id: pendingPayment.id, bill_id: booking3Bills[3].id, amount: 6000000 },
    });
  }

  // Booking 5: big payment covering multiple months
  const booking5Bills = await prisma.bill.findMany({
    where: { booking_id: booking5.id },
    orderBy: { due_date: "asc" },
  });
  if (booking5Bills.length >= 3) {
    const bulkPayment = await prisma.payment.create({
      data: {
        booking_id: booking5.id,
        amount: 24000000, // 3 months
        payment_date: new Date("2026-01-20"),
        status_id: 2,
      },
    });
    for (const bill of booking5Bills.slice(0, 3)) {
      await prisma.paymentBill.create({
        data: { payment_id: bulkPayment.id, bill_id: bill.id, amount: 8000000 },
      });
    }
  }

  // A rejected payment
  await prisma.payment.create({
    data: {
      booking_id: booking4.id,
      amount: 6500000,
      payment_date: new Date("2026-04-10"),
      status_id: 3, // REJECTED
    },
  });

  // ═══════════════════════════════════════════════════════
  // Guests & Guest Stays
  // ═══════════════════════════════════════════════════════

  const guest1 = await prisma.guest.create({
    data: {
      name: "John Smith",
      email: "john.smith@email.com",
      phone: "+1234567890",
      booking_id: booking1.id,
    },
  });

  await prisma.guestStay.create({
    data: {
      guest_id: guest1.id,
      start_date: new Date("2026-06-01"),
      end_date: new Date("2026-06-15"),
      daily_fee: 75000,
    },
  });

  const guest2 = await prisma.guest.create({
    data: {
      name: "Tanaka Yuki",
      email: "tanaka.y@email.jp",
      booking_id: booking3.id,
    },
  });

  await prisma.guestStay.create({
    data: {
      guest_id: guest2.id,
      start_date: new Date("2026-05-20"),
      end_date: new Date("2026-07-10"),
      daily_fee: 100000,
    },
  });

  // ═══════════════════════════════════════════════════════
  // Check-in/Check-out Logs
  // ═══════════════════════════════════════════════════════

  await prisma.checkInOutLog.createMany({
    data: [
      { booking_id: booking1.id, event_type: "CHECK_IN", event_date: new Date("2026-01-01"), tenant_id: createdTenants[0] },
      { booking_id: booking2.id, event_type: "CHECK_IN", event_date: new Date("2026-03-01"), tenant_id: createdTenants[1] },
      { booking_id: booking3.id, event_type: "CHECK_IN", event_date: new Date("2026-02-01"), tenant_id: createdTenants[2] },
      { booking_id: booking4.id, event_type: "CHECK_IN", event_date: new Date("2026-04-01"), tenant_id: createdTenants[3] },
      { booking_id: booking5.id, event_type: "CHECK_IN", event_date: new Date("2026-01-15"), tenant_id: createdTenants[4] },
      { booking_id: bookingCompleted.id, event_type: "CHECK_IN", event_date: new Date("2025-06-01"), tenant_id: createdTenants[0] },
      { booking_id: bookingCompleted.id, event_type: "CHECK_OUT", event_date: new Date("2025-11-30"), tenant_id: createdTenants[0] },
    ],
  });

  // ═══════════════════════════════════════════════════════
  // Transactions (income + expenses)
  // ═══════════════════════════════════════════════════════

  const txData = [
    // Income from rent
    { amount: 4000000, description: "Pembayaran sewa Kamar 101 - Jan 2026", date: new Date("2026-01-05"), type: TransactionType.INCOME, location_id: loc1.id, category: "Sewa" },
    { amount: 4000000, description: "Pembayaran sewa Kamar 101 - Feb 2026", date: new Date("2026-02-05"), type: TransactionType.INCOME, location_id: loc1.id, category: "Sewa" },
    { amount: 4000000, description: "Pembayaran sewa Kamar 101 - Mar 2026", date: new Date("2026-03-05"), type: TransactionType.INCOME, location_id: loc1.id, category: "Sewa" },
    { amount: 4000000, description: "Pembayaran sewa Kamar 101 - Apr 2026", date: new Date("2026-04-05"), type: TransactionType.INCOME, location_id: loc1.id, category: "Sewa" },
    { amount: 4000000, description: "Pembayaran sewa Kamar 101 - Mei 2026", date: new Date("2026-05-05"), type: TransactionType.INCOME, location_id: loc1.id, category: "Sewa" },
    { amount: 4000000, description: "Pembayaran sewa Kamar 102 - Mar 2026", date: new Date("2026-03-03"), type: TransactionType.INCOME, location_id: loc1.id, category: "Sewa" },
    { amount: 4000000, description: "Pembayaran sewa Kamar 102 - Apr 2026", date: new Date("2026-04-03"), type: TransactionType.INCOME, location_id: loc1.id, category: "Sewa" },
    { amount: 6000000, description: "Pembayaran sewa Kamar 201 - Feb 2026", date: new Date("2026-02-01"), type: TransactionType.INCOME, location_id: loc1.id, category: "Sewa" },
    { amount: 6000000, description: "Pembayaran sewa Kamar 201 - Mar 2026", date: new Date("2026-03-01"), type: TransactionType.INCOME, location_id: loc1.id, category: "Sewa" },
    { amount: 6000000, description: "Pembayaran sewa Kamar 201 - Apr 2026", date: new Date("2026-04-01"), type: TransactionType.INCOME, location_id: loc1.id, category: "Sewa" },
    { amount: 24000000, description: "Pembayaran sewa Kamar 301 - Jan-Mar 2026", date: new Date("2026-01-20"), type: TransactionType.INCOME, location_id: loc1.id, category: "Sewa" },
    // Deposit income
    { amount: 3500000, description: "Deposit Kamar 101 - Ahmad Wijaya", date: new Date("2025-12-28"), type: TransactionType.INCOME, location_id: loc1.id, category: "Deposit" },
    { amount: 4000000, description: "Deposit Kamar 102 - Diana Putri", date: new Date("2026-02-25"), type: TransactionType.INCOME, location_id: loc1.id, category: "Deposit" },
    { amount: 8000000, description: "Deposit Kamar 301 - Kevin Hartanto", date: new Date("2026-01-10"), type: TransactionType.INCOME, location_id: loc1.id, category: "Deposit" },
    // Expenses
    { amount: 2500000, description: "Biaya listrik gedung - Jan 2026", date: new Date("2026-01-25"), type: TransactionType.EXPENSE, location_id: loc1.id, category: "Utilitas" },
    { amount: 2800000, description: "Biaya listrik gedung - Feb 2026", date: new Date("2026-02-25"), type: TransactionType.EXPENSE, location_id: loc1.id, category: "Utilitas" },
    { amount: 2600000, description: "Biaya listrik gedung - Mar 2026", date: new Date("2026-03-25"), type: TransactionType.EXPENSE, location_id: loc1.id, category: "Utilitas" },
    { amount: 2700000, description: "Biaya listrik gedung - Apr 2026", date: new Date("2026-04-25"), type: TransactionType.EXPENSE, location_id: loc1.id, category: "Utilitas" },
    { amount: 2500000, description: "Biaya listrik gedung - Mei 2026", date: new Date("2026-05-25"), type: TransactionType.EXPENSE, location_id: loc1.id, category: "Utilitas" },
    { amount: 1500000, description: "Biaya air - Jan 2026", date: new Date("2026-01-20"), type: TransactionType.EXPENSE, location_id: loc1.id, category: "Utilitas" },
    { amount: 1600000, description: "Biaya air - Feb 2026", date: new Date("2026-02-20"), type: TransactionType.EXPENSE, location_id: loc1.id, category: "Utilitas" },
    { amount: 3500000, description: "Perbaikan AC Kamar 302", date: new Date("2026-03-15"), type: TransactionType.EXPENSE, location_id: loc1.id, category: "Maintenance" },
    { amount: 1200000, description: "Cleaning service - Mei 2026", date: new Date("2026-05-01"), type: TransactionType.EXPENSE, location_id: loc1.id, category: "Operasional" },
    { amount: 15000000, description: "Gaji staff - Mei 2026", date: new Date("2026-05-30"), type: TransactionType.EXPENSE, location_id: loc1.id, category: "Gaji" },
    // Location 2 transactions
    { amount: 4500000, description: "Pembayaran sewa A1 - Feb 2026", date: new Date("2026-02-05"), type: TransactionType.INCOME, location_id: loc2.id, category: "Sewa" },
    { amount: 7000000, description: "Pembayaran sewa B1 - Mar 2026", date: new Date("2026-03-05"), type: TransactionType.INCOME, location_id: loc2.id, category: "Sewa" },
    { amount: 1800000, description: "Biaya listrik - Feb 2026", date: new Date("2026-02-25"), type: TransactionType.EXPENSE, location_id: loc2.id, category: "Utilitas" },
  ];

  await prisma.transaction.createMany({ data: txData });

  // ═══════════════════════════════════════════════════════
  // Calendar Events
  // ═══════════════════════════════════════════════════════

  await prisma.event.createMany({
    data: [
      {
        title: "Maintenance AC - Kamar 302",
        description: "Jadwal perbaikan AC unit luar",
        start: new Date("2026-06-12T09:00:00"),
        end: new Date("2026-06-12T12:00:00"),
        backgroundColor: "#f97316",
        textColor: "#ffffff",
      },
      {
        title: "Inspeksi Kebakaran Tahunan",
        description: "Inspeksi alat pemadam dan jalur evakuasi",
        start: new Date("2026-06-20T08:00:00"),
        end: new Date("2026-06-20T17:00:00"),
        allDay: true,
        backgroundColor: "#ef4444",
        textColor: "#ffffff",
      },
      {
        title: "Fumigasi Gedung",
        description: "Pest control rutin bulanan",
        start: new Date("2026-06-15T14:00:00"),
        end: new Date("2026-06-15T16:00:00"),
        backgroundColor: "#8b5cf6",
        textColor: "#ffffff",
      },
      {
        title: "Meeting Penghuni",
        description: "Rapat bulanan dengan penghuni",
        start: new Date("2026-06-25T19:00:00"),
        end: new Date("2026-06-25T20:30:00"),
        backgroundColor: "#0ea5e9",
        textColor: "#ffffff",
      },
    ],
  });

  // ═══════════════════════════════════════════════════════
  // Penalties
  // ═══════════════════════════════════════════════════════

  await prisma.penalty.create({
    data: {
      booking_id: booking4.id,
      description: "Keterlambatan pembayaran bulan April 2026",
      amount: 200000,
    },
  });

  console.log("Mock data seeded successfully!");
  console.log(`- 2 locations, 15 rooms, 3 room types, 3 durations`);
  console.log(`- 8 tenants, 9 bookings (8 active + 1 completed)`);
  console.log(`- 3 add-ons with tiered pricing`);
  console.log(`- Bills generated through June 2026`);
  console.log(`- Multiple payments (verified, pending, rejected)`);
  console.log(`- 9 deposits (various statuses)`);
  console.log(`- 2 guests with stays`);
  console.log(`- ${txData.length} financial transactions`);
  console.log(`- 4 calendar events`);
  console.log(`\nLogin: admin@micasasuites.com / admin123`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

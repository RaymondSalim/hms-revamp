import type { DriveStep } from "driver.js";

export const tourSteps: DriveStep[] = [
  {
    element: "aside",
    popover: {
      title: "Navigasi",
      description:
        "Menu navigasi utama. Semua halaman yang bisa Anda akses tersedia di sini, dikelompokkan berdasarkan kategori.",
      side: "right",
      align: "start",
    },
  },
  {
    element: "[data-tour='location-picker']",
    popover: {
      title: "Pemilih Lokasi",
      description:
        "Pilih lokasi properti yang ingin Anda kelola. Semua data (kamar, pemesanan, tagihan) akan disesuaikan dengan lokasi yang dipilih.",
      side: "bottom",
      align: "end",
    },
  },
  {
    element: "[data-tour='wib-clock']",
    popover: {
      title: "Zona Waktu Bisnis",
      description:
        "Semua tanggal dan waktu yang ditampilkan menggunakan zona waktu WIB (UTC+7), terlepas dari lokasi Anda saat ini.",
      side: "bottom",
      align: "center",
    },
  },
  {
    element: "[data-tour='dashboard-stats']",
    popover: {
      title: "Ringkasan Dashboard",
      description:
        "Lihat statistik penting: jumlah kamar terisi, check-in/out hari ini, dan tingkat hunian di lokasi yang dipilih.",
      side: "bottom",
      align: "start",
    },
  },
  {
    element: "a[href='/bookings']",
    popover: {
      title: "Pemesanan",
      description:
        "Kelola semua pemesanan kamar. Buat pemesanan baru, check-in/out penyewa, dan atur pemesanan bergulir (rolling) tanpa tanggal akhir.",
      side: "right",
      align: "start",
    },
  },
  {
    element: "a[href='/bills']",
    popover: {
      title: "Tagihan",
      description:
        "Tagihan dibuat otomatis setiap bulan berdasarkan pemesanan aktif. Anda bisa edit tanggal jatuh tempo dan tambah item manual.",
      side: "right",
      align: "start",
    },
  },
  {
    element: "a[href='/payments']",
    popover: {
      title: "Pembayaran",
      description:
        "Catat pembayaran dari penyewa. Pembayaran akan dialokasikan otomatis ke tagihan tertua yang belum lunas.",
      side: "right",
      align: "start",
    },
  },
  {
    element: "a[href='/availability']",
    popover: {
      title: "Ketersediaan Kamar",
      description:
        "Cek ketersediaan kamar untuk periode tertentu. Berguna saat ada calon penyewa baru yang ingin booking.",
      side: "right",
      align: "start",
    },
  },
  {
    element: "a[href='/help']",
    popover: {
      title: "Pusat Bantuan",
      description:
        "Kapan saja Anda butuh panduan, kunjungi halaman bantuan untuk penjelasan lengkap tentang setiap fitur dan alur kerja.",
      side: "right",
      align: "start",
    },
  },
];

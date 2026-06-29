"use client";

import { useState } from "react";
import { useTour } from "@/app/_components/tour/tour-provider";

interface HelpSection {
  id: string;
  title: string;
  content: string[];
}

const sections: HelpSection[] = [
  {
    id: "daily-workflow",
    title: "Alur Kerja Harian",
    content: [
      "1. Buka Dashboard — periksa check-in/check-out hari ini dan kamar tersedia.",
      "2. Proses check-in untuk penyewa yang baru datang melalui halaman Pemesanan.",
      "3. Periksa tagihan jatuh tempo di halaman Tagihan.",
      "4. Catat pembayaran yang diterima di halaman Pembayaran.",
      "5. Proses check-out untuk penyewa yang selesai masa tinggalnya.",
      "Tugas Hari Ini: panel di atas Dashboard menampilkan jumlah check-in hari ini, pembayaran yang belum diverifikasi, tagihan terlambat, dan pemesanan yang akan berakhir. Klik kartu untuk membuka daftar terkait.",
      "Pencarian Cepat (⌘K / Ctrl-K): tekan ⌘K (atau Ctrl-K) di mana saja untuk membuka pencarian global. Cari penyewa, pemesanan, tagihan, atau kamar di seluruh lokasi yang dapat Anda akses, lalu klik hasil untuk membukanya.",
    ],
  },
  {
    id: "bookings",
    title: "Pemesanan",
    content: [
      "Pemesanan Tetap: memiliki tanggal mulai dan selesai yang pasti. Tagihan dibuat otomatis untuk seluruh periode.",
      "Pemesanan Bergulir (Rolling): hanya memiliki tanggal mulai, tanpa tanggal akhir. Tagihan dibuat otomatis setiap bulan selama pemesanan masih aktif.",
      "Mengakhiri pemesanan bergulir: klik 'Akhiri' pada baris pemesanan, pilih tanggal akhir. Sistem akan membuat semua tagihan hingga tanggal tersebut. Tindakan ini tidak dapat dibatalkan.",
      "Check-in/Check-out: gunakan tombol aksi pada tabel pemesanan. Check-out akan mengakhiri pemesanan.",
    ],
  },
  {
    id: "bills",
    title: "Tagihan",
    content: [
      "Tagihan dibuat otomatis berdasarkan pemesanan aktif. Setiap bulan, sistem akan membuat tagihan baru dengan item biaya sewa.",
      "Anda bisa mengedit tagihan: ubah tanggal jatuh tempo, tambah item manual (misal: biaya listrik tambahan), atau edit item yang ada.",
      "Item bertipe 'GENERATED' dibuat otomatis oleh sistem (biaya sewa). Item 'CREATED' adalah item yang ditambah manual.",
      "Status tagihan: UNPAID (belum bayar), PARTIAL (sebagian), PAID (lunas), OVERDUE (lewat jatuh tempo).",
      "Kirim Email: gunakan tombol 'Kirim Email' di menu aksi tagihan untuk mengirim ulang email pengingat ke penyewa. Email berisi rincian tagihan dan lampiran invoice PDF.",
      "Download PDF: klik ikon unduh pada tagihan untuk mengunduh invoice dalam format PDF.",
    ],
  },
  {
    id: "payments",
    title: "Pembayaran",
    content: [
      "Catat pembayaran dengan klik 'Tambah Pembayaran'. Pilih pemesanan dan masukkan jumlah.",
      "Pembayaran dialokasikan otomatis ke tagihan tertua yang belum lunas (FIFO).",
      "Jika pembayaran melebihi total tagihan, sisa akan menjadi kredit untuk tagihan berikutnya.",
      "Bukti pembayaran (foto transfer, kuitansi) bisa diunggah sebagai lampiran.",
    ],
  },
  {
    id: "deposits",
    title: "Deposit",
    content: [
      "Deposit adalah uang jaminan yang dibayar penyewa di awal pemesanan.",
      "Deposit dicatat terpisah dari pembayaran bulanan dan tidak dialokasikan ke tagihan.",
      "Saat penyewa check-out, deposit bisa dikembalikan atau digunakan untuk menutup tagihan tertunggak.",
    ],
  },
  {
    id: "availability",
    title: "Ketersediaan Kamar",
    content: [
      "Gunakan halaman Ketersediaan untuk memeriksa kamar yang tersedia dalam rentang tanggal tertentu.",
      "Pilih tanggal mulai dan selesai, sistem akan menampilkan jumlah kamar tersedia per tipe.",
      "Warna indikator: hijau (banyak tersedia), kuning (terbatas), merah (penuh).",
      "Berguna saat ada calon penyewa baru yang bertanya ketersediaan.",
    ],
  },
  {
    id: "financials",
    title: "Laporan Keuangan",
    content: [
      "Ringkasan: lihat total pendapatan, piutang, dan tren per bulan.",
      "Umur Piutang: analisis tagihan tertunggak berdasarkan berapa lama sudah lewat jatuh tempo.",
      "Ekspor: unduh data dalam format Excel untuk kebutuhan pembukuan atau audit.",
    ],
  },
  {
    id: "settings",
    title: "Pengaturan (Admin)",
    content: [
      "Lokasi: tambah/edit properti yang dikelola. Setiap lokasi memiliki kamar dan penyewa terpisah.",
      "Pengguna: tambah staf baru dan atur hak akses mereka.",
      "Hak Akses: buat peran (role) dengan izin spesifik. Misal: 'Resepsionis' hanya bisa lihat pemesanan tapi tidak bisa edit keuangan.",
      "Tombol tindakan dinonaktifkan: Jika peran Anda tidak memiliki izin untuk suatu tindakan (misalnya menambah atau menghapus), tombolnya akan tampil redup dan tidak dapat diklik. Arahkan kursor ke tombol untuk melihat keterangannya.",
      "Kebijakan Tagihan: atur tanggal jatuh tempo default dan denda keterlambatan.",
      "Template Email: kustomisasi email notifikasi yang dikirim ke penyewa. Editor visual (WYSIWYG) tersedia untuk edit konten tanpa perlu tahu HTML. Gunakan tombol 'HTML' untuk beralih ke mode kode mentah.",
      "Template Email — Variabel: klik badge variabel (misal: {{tenant_name}}) untuk menyisipkan data dinamis ke dalam template.",
      "Template Email — Kirim Test: gunakan tombol 'Kirim Test' untuk mengirim email percobaan dengan data contoh ke email Anda sendiri, termasuk lampiran PDF jika berlaku.",
      "Template Email — Layout: template 'Layout Email' membungkus semua email keluar. Edit layout untuk mengubah header, footer, dan warna yang berlaku di semua jenis email.",
      "Invoice PDF: template 'Invoice PDF' mengatur tampilan invoice yang dilampirkan ke email tagihan dan bisa diunduh dari halaman tagihan. Edit HTML untuk mengubah desain invoice. Gunakan 'Download Test PDF' untuk melihat hasil.",
      "Invoice PDF — Nama File: atur pola nama file (misal: invoice-{{invoice_number}}) yang digunakan saat mengunduh atau melampirkan PDF.",
      "Log Email: lihat riwayat semua email yang dikirim sistem (pengingat tagihan, reset password, email test). Saring berdasarkan status Berhasil/Gagal, cari berdasarkan penerima atau subjek, dan klik 'Detail' untuk melihat konten email yang dikirim atau pesan kesalahan.",
      "Log Email — Kirim Ulang: untuk email yang berhasil terkirim, gunakan 'Kirim Ulang' untuk mengirim konten yang sama persis ke penerima yang sama. Catatan: lampiran PDF tidak disertakan saat kirim ulang.",
    ],
  },
  {
    id: "faq",
    title: "Pertanyaan Umum (FAQ)",
    content: [
      "T: Bagaimana mengakhiri pemesanan bergulir?\nJ: Pada tabel Pemesanan, klik tombol 'Akhiri' di baris yang sesuai. Pilih tanggal akhir, lalu konfirmasi. Semua tagihan hingga tanggal tersebut akan dibuat otomatis.",
      "T: Pembayaran sudah dicatat tapi tagihan masih 'UNPAID'?\nJ: Pastikan pembayaran sudah dikonfirmasi (status VERIFIED). Pembayaran pending tidak dialokasikan ke tagihan.",
      "T: Bisa membatalkan check-out?\nJ: Tidak. Check-out bersifat final. Jika ada kesalahan, buat pemesanan baru.",
      "T: Bagaimana menambah biaya tambahan (listrik, air)?\nJ: Buka halaman Tagihan, klik 'Edit' pada tagihan yang sesuai, lalu tambah item baru di bagian bawah modal.",
      "T: Zona waktu apa yang digunakan sistem?\nJ: Semua tanggal dan waktu menggunakan WIB (Waktu Indonesia Barat, UTC+7), terlepas dari lokasi akses Anda.",
      "T: Apa arti banner kuning 'Mode uji — waktu sistem dibekukan'?\nJ: Pada lingkungan uji coba (preview), waktu sistem sengaja dibekukan pada tanggal tertentu agar data contoh dan pengujian konsisten. Banner ini tidak akan pernah muncul di lingkungan produksi.",
      "T: Bagaimana cara melihat profil lengkap penyewa?\nJ: Klik nama penyewa di tabel Penyewa atau ikon detail (mata) di kolom Aksi. Halaman profil menampilkan ringkasan keuangan, daftar pemesanan, tagihan & pembayaran, serta catatan internal.",
      "T: Bagaimana mencari atau mengurutkan data pada tabel?\nJ: Ketik di kotak pencarian untuk mencari ke seluruh data (bukan hanya halaman yang tampil), dan klik judul kolom untuk mengurutkan. Pencarian, urutan, dan halaman tersimpan di alamat (URL) sehingga bisa di-bookmark dan dibagikan.",
    ],
  },
];

export function HelpClient() {
  const { startTour, resetTour } = useTour();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedIds(new Set(sections.map((s) => s.id)));
  };

  const collapseAll = () => {
    setExpandedIds(new Set());
  };

  const handleRestartTour = () => {
    resetTour();
    startTour();
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1
          className="text-2xl font-semibold"
          style={{
            fontFamily: "var(--font-display), serif",
            color: "var(--color-text-primary)",
          }}
        >
          Pusat Bantuan
        </h1>
        <button
          onClick={handleRestartTour}
          className="px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-colors"
          style={{ backgroundColor: "var(--color-accent)" }}
        >
          Ulangi Tur Panduan
        </button>
      </div>

      <p
        className="mb-6 text-sm"
        style={{ color: "var(--color-text-secondary)" }}
      >
        Panduan lengkap penggunaan sistem manajemen properti. Klik pada setiap
        bagian untuk membuka penjelasan detail.
      </p>

      <div className="flex gap-2 mb-4">
        <button
          onClick={expandAll}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-text-secondary)",
          }}
        >
          Buka Semua
        </button>
        <button
          onClick={collapseAll}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-text-secondary)",
          }}
        >
          Tutup Semua
        </button>
      </div>

      <div className="space-y-2">
        {sections.map((section) => {
          const isExpanded = expandedIds.has(section.id);
          return (
            <div
              key={section.id}
              className="rounded-xl border overflow-hidden"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg-card)",
              }}
            >
              <button
                onClick={() => toggle(section.id)}
                className="w-full flex items-center justify-between px-5 py-4 text-left transition-colors"
                style={{ color: "var(--color-text-primary)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor =
                    "var(--color-accent-light)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <span className="font-medium">{section.title}</span>
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-5 h-5 transition-transform duration-200"
                  style={{
                    transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  <path
                    fillRule="evenodd"
                    d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
              {isExpanded && (
                <div
                  className="px-5 pb-4 space-y-3"
                  style={{ borderTop: "1px solid var(--color-border)" }}
                >
                  <div className="pt-3" />
                  {section.content.map((item, idx) => (
                    <p
                      key={idx}
                      className="text-sm leading-relaxed whitespace-pre-line"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {item}
                    </p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * ============================================================
 *  BOT PENCATATAN KEUANGAN WHATSAPP → GOOGLE SHEETS  (v3)
 *  + Dashboard Target vs Realisasi 12 periode gajian (25 → 24)
 *  Gateway: Fonnte  |  Platform: Google Apps Script
 * ============================================================
 *  POLA PESAN (di grup diawali "/"):
 *     /[jenis] [nominal] [keterangan] #[pos]
 *     jenis : keluar / masuk / nabung  (boleh dikosongkan)
 *  Contoh:
 *     /kontrakan 1.500.000
 *     /jajan o 50rb
 *     /masuk 5.000.000 gaji istri
 *     /nabung 1jt kuliah a
 *     /keluar 50rb obat #Lainnya
 *  Perintah: /saldo /sisa /hari ini /rekap /rekap 9 2026 /hapus /kategori /bantuan
 * ============================================================
 */

// ======================= KONFIGURASI ========================
const CONFIG = {
  FONNTE_TOKEN: 'ISI_TOKEN_FONNTE_ANDA',
  ALLOWED_NUMBERS: [],                         // format 62, contoh ['6281234567890','628xxxxxxxxxx']
  IZINKAN_GRUP: true,
  ALLOWED_GROUPS: [],                          // contoh ['120363xxxxxxxxxxxx@g.us']
  PREFIX_GRUP: '/',
  BALAS_TRANSAKSI_GRUP: false,                 // false = di grup, catatan masuk/keluar/nabung disimpan TANPA balasan
  BALAS_FORMAT_SALAH_GRUP: true,               // true = tetap beri tahu jika format pesan tidak dikenali
  DEBUG: false,

  // ---- Dashboard ----
  GRUP_DASHBOARD: 'ISI_ID_GRUP@g.us',          // hanya transaksi grup ini yang masuk dashboard (ID dari tab Log)
  TANGGAL_GAJIAN: 25,                          // periode = tgl 25 s/d tgl 24 bulan berikutnya
  PERIODE_AWAL: { tahun: 2026, bulan: 9 },     // gajian 25 September 2026
  JUMLAH_PERIODE: 12,

  SHEET_TRANSAKSI: 'Transaksi',
  SHEET_RINGKASAN: 'Ringkasan',
  SHEET_LOG: 'Log',
  SHEET_TARGET: 'Target Anggaran',             // tab target (dibuat otomatis, angkanya bisa diedit)
  SHEET_SUMBER: 'Dashboard Nabung',            // opsional: jika tab ini ada, angka awal diambil dari sini
  SHEET_PERIODE_INI: 'Realisasi Periode',
  SHEET_12_BULAN: 'Realisasi 12 Bulan',
  SHEET_HELPER: '_Periode',
  TIMEZONE: 'Asia/Jakarta',
};

/**
 * DAFTAR POS — mengikuti tab "Dashboard Nabung".
 * nama = kategori yang tercatat | target = nilai awal (0 di repositori; isi angka asli di tab Target Anggaran)
 * cari = nama baris di tab Dashboard Nabung (hanya dipakai jika tab itu ada)
 * kata = kata kunci pengenal (yang paling panjang/spesifik menang)
 */
const POS = [
  // ---------- PEMASUKAN ----------
  { k: 'Pemasukan',  nama: 'Gaji Istri',      target: 0, cari: 'Gaji Istri', kata: ['gaji istri'] },
  { k: 'Pemasukan',  nama: 'Gaji Suami',      target: 0, cari: 'Gaji suami', kata: ['gaji suami'] },
  { k: 'Pemasukan',  nama: 'Pemasukan Lain',  target: 0, cari: '', kata: ['gaji', 'bonus', 'thr', 'komisi', 'jualan', 'dividen', 'cashback', 'refund', 'pemasukan lain'] },
  // ---------- TABUNGAN ----------
  { k: 'Tabungan',   nama: 'Kuliah A',      target: 0, cari: '', kata: ['kuliah a', 'tabungan kuliah', 'kuliah', 'semester', 'ukt'] },
  { k: 'Tabungan',   nama: 'Dana Darurat',    target: 0, cari: 'Dana Darurat Suami & istri', kata: ['dana darurat', 'darurat', 'brangkas', 'brankas'] },
  { k: 'Tabungan',   nama: 'Tabungan Rumah',  target: 0, cari: '', kata: ['tabungan rumah', 'rumah', 'logam mulia', 'emas', 'antam', 'lm'] },
  { k: 'Tabungan',   nama: 'Tabungan Lain',   target: 0, cari: '', kata: [] },
  // ---------- PENGELUARAN WAJIB ----------
  { k: 'Pengeluaran', nama: 'Bayar Kontrakan',     target: 0, cari: 'Bayar Kontrakan', kata: ['kontrakan', 'sewa rumah', 'sewa'] },
  { k: 'Pengeluaran', nama: 'WiFi',                target: 0, cari: 'WiFi', kata: ['wifi', 'wi-fi', 'indihome', 'biznet', 'myrepublic', 'first media'] },
  { k: 'Pengeluaran', nama: 'Listrik',             target: 0, cari: 'Listrik', kata: ['listrik', 'pln', 'token listrik', 'token'] },
  { k: 'Pengeluaran', nama: 'Renang Suami',        target: 0, cari: 'Member Renang suami', kata: ['renang suami'] },
  { k: 'Pengeluaran', nama: 'Renang Istri',        target: 0, cari: 'Member Renang istri', kata: ['renang istri'] },
  { k: 'Pengeluaran', nama: 'Gemini',              target: 0, cari: 'Member Gemini (Google Play)', kata: ['gemini', 'google play', 'google one'] },
  { k: 'Pengeluaran', nama: 'Bultang',             target: 0, cari: 'Member Bultang', kata: ['bultang', 'badminton', 'bulutangkis', 'bulu tangkis'] },
  { k: 'Pengeluaran', nama: 'Claude AI',           target: 0, cari: 'Langganan Claude AI', kata: ['claude'] },
  { k: 'Pengeluaran', nama: 'Internet Suami',      target: 0, cari: 'Internet suami', kata: ['internet suami', 'kuota suami', 'paket data', 'internet'] },
  { k: 'Pengeluaran', nama: 'Pulsa Istri',         target: 0, cari: 'Pulsa & Masa Aktif istri', kata: ['pulsa istri', 'masa aktif', 'pulsa'] },
  { k: 'Pengeluaran', nama: 'BPJS Suami',          target: 0, cari: 'BPJS suami', kata: ['bpjs'] },
  { k: 'Pengeluaran', nama: 'Kas Kantor Istri',    target: 0, cari: 'Iuran Kas Bagian Kantor istri', kata: ['kas kantor', 'iuran kas', 'iuran', 'kas'] },
  { k: 'Pengeluaran', nama: 'Jajan O',          target: 0, cari: '', kata: ['jajan o'] },
  { k: 'Pengeluaran', nama: 'Bensin Suami',        target: 0, cari: 'Bensin Motor Suami', kata: ['bensin', 'pertalite', 'pertamax', 'bbm'] },
  { k: 'Pengeluaran', nama: 'Pod Suami',           target: 0, cari: 'Pod suami', kata: ['pod', 'liquid', 'vape', 'coil', 'cartridge', 'catridge'] },
  { k: 'Pengeluaran', nama: 'Jajan Istri',         target: 0, cari: 'Uang jajan bulanan istri', kata: ['jajan istri'] },
  { k: 'Pengeluaran', nama: 'Ongkos KRL',          target: 0, cari: 'Ongkos: KRL PP Stasiun', kata: ['krl', 'kereta', 'commuter'] },
  { k: 'Pengeluaran', nama: 'Ongkos TJ/Gojek',     target: 0, cari: 'Ongkos: TJ/Gojek', kata: ['tj', 'transjakarta', 'busway', 'gojek', 'grab', 'ojol', 'ojek', 'maxim'] },
  { k: 'Pengeluaran', nama: 'Belanja Mingguan',    target: 0, cari: 'Uang Belanja Mingguan', kata: ['belanja mingguan', 'belanja', 'sayur', 'pasar', 'lauk', 'ikan', 'ayam', 'daging', 'telur', 'buah', 'tahu', 'tempe'] },
  { k: 'Pengeluaran', nama: 'Belanja Bulanan',     target: 0, cari: 'Uang Belanja Bulanan', kata: ['belanja bulanan', 'beras', 'minyak', 'mie', 'indomie', 'sabun', 'deterjen', 'sembako', 'gas', 'galon', 'shampo', 'odol', 'tisu'] },
  { k: 'Pengeluaran', nama: 'Jajan Self-Care',     target: 0, cari: 'Jajan Mingguan (Self-Care Reward)', kata: ['jajan', 'self care', 'kopi', 'snack', 'makan', 'minum', 'boba', 'gofood', 'grabfood', 'shopeefood'] },
  { k: 'Pengeluaran', nama: 'Pengembangan Diri',   target: 0, cari: 'Biaya pengembangan diri istri & suami', kata: ['pengembangan diri', 'skincare', 'les', 'kursus', 'baju', 'celana', 'sepatu', 'buku', 'salon', 'kosmetik', 'makeup'] },
];

const KATA_MASUK  = ['masuk', 'pemasukan', 'terima', 'dapat'];
const KATA_KELUAR = ['keluar', 'pengeluaran'];
const KATA_TABUNG = ['nabung', 'menabung', 'tabung', 'setor', 'simpan'];
const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

// ======================= SETUP ==============================
/** Jalankan sekali (aman diulang, data transaksi tidak terhapus). */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());

  const sh = ss.getSheetByName(CONFIG.SHEET_TRANSAKSI) || ss.insertSheet(CONFIG.SHEET_TRANSAKSI);
  const header = ['Waktu', 'ID Buku (No/Grup)', 'Nama', 'Jenis', 'Kategori', 'Nominal', 'Keterangan', 'Pesan Asli', 'ID', 'No Pengirim'];
  sh.getRange(1, 1, 1, header.length).setValues([header])
    .setFontWeight('bold').setBackground('#1f7a4d').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  sh.getRange('A:A').setNumberFormat('dd/mm/yyyy HH:mm');
  sh.getRange('B:B').setNumberFormat('@');
  sh.getRange('J:J').setNumberFormat('@');
  sh.getRange('F:F').setNumberFormat('"Rp "#,##0');
  Logger.log('Setup selesai. Lanjut jalankan buatDashboard().');
}

// ======================= WEBHOOK ============================
function doGet() {
  return ContentService.createTextOutput('Bot keuangan WhatsApp aktif ✅');
}

function doPost(e) {
  try {
    if (CONFIG.DEBUG) logRaw_(e);
    const data = parseBody_(e);
    const rawSender = String(data.sender || '').trim();
    const isGroup = rawSender.indexOf('@g.us') > -1 || data.isgroup === true || data.isgroup === 'true';
    const pengirim = String(isGroup ? (data.member || '') : rawSender).replace(/\D/g, '');
    const nama = data.name || data.pushname || '';
    let message = String(data.message || data.pesan || '').trim();
    if (!rawSender || !message) return ok_();

    if (isGroup) {
      if (!CONFIG.IZINKAN_GRUP) return ok_();
      if (CONFIG.ALLOWED_GROUPS.length && CONFIG.ALLOWED_GROUPS.indexOf(rawSender) === -1) return ok_();
      if (message.indexOf(CONFIG.PREFIX_GRUP) !== 0) return ok_();
      message = message.slice(CONFIG.PREFIX_GRUP.length).trim();
    } else if (message.indexOf(CONFIG.PREFIX_GRUP) === 0) {
      message = message.slice(CONFIG.PREFIX_GRUP.length).trim();
    }
    if (!message) return ok_();
    if (CONFIG.ALLOWED_NUMBERS.length && CONFIG.ALLOWED_NUMBERS.indexOf(pengirim) === -1) return ok_();

    const cache = CacheService.getScriptCache();
    const dupKey = 'msg_' + (data.inboxid || data.id ||
      Utilities.base64Encode(rawSender + '|' + pengirim + '|' + message + '|' + (data.timestamp || ''))).toString().slice(0, 200);
    if (cache.get(dupKey)) return ok_();
    cache.put(dupKey, '1', 20);

    const ctx = {
      buku: isGroup ? rawSender : pengirim,
      target: isGroup ? rawSender : pengirim,
      pengirim: pengirim,
      nama: nama || pengirim,
      isGroup: isGroup,
    };
    const balasan = prosesPesan(ctx, message);
    if (balasan) kirimWA_(ctx.target, balasan);
  } catch (err) {
    console.error('doPost error: ' + err.stack);
  }
  return ok_();
}

function parseBody_(e) {
  if (e && e.postData && e.postData.contents) {
    try { return JSON.parse(e.postData.contents); } catch (_) {}
  }
  return (e && e.parameter) || {};
}

function ok_() {
  return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function logRaw_(e) {
  try {
    const ss = getSpreadsheet_();
    const sh = ss.getSheetByName(CONFIG.SHEET_LOG) || ss.insertSheet(CONFIG.SHEET_LOG);
    sh.appendRow([new Date(), (e && e.postData && e.postData.contents) || JSON.stringify((e && e.parameter) || {})]);
    if (sh.getLastRow() > 300) sh.deleteRows(2, 100);
  } catch (_) {}
}

// ======================= LOGIKA BOT =========================
function prosesPesan(ctx, message) {
  const teks = message.toLowerCase().replace(/\s+/g, ' ').trim();
  if (['bantuan', 'help', 'menu', 'start', 'halo', 'hai'].indexOf(teks) > -1) return pesanBantuan_(ctx.isGroup);
  if (teks === 'saldo') return cmdSaldo_(ctx);
  if (teks === 'sisa' || teks === 'anggaran' || teks === 'budget') return cmdSisa_(ctx);
  if (teks === 'hari ini') return cmdHariIni_(ctx);
  if (teks === 'hapus' || teks === 'undo' || teks === 'batal') return cmdHapus_(ctx);
  if (teks === 'kategori' || teks === 'pos') return cmdKategori_(ctx.isGroup);
  if (/^(rekap|laporan)\b/.test(teks)) return cmdRekap_(ctx, teks);

  const trx = parseTransaksi_(message);
  const p = ctx.isGroup ? CONFIG.PREFIX_GRUP : '';
  if (!trx) {
    if (ctx.isGroup && !CONFIG.BALAS_FORMAT_SALAH_GRUP) return '';
    return `🤔 Format belum sesuai.\n\nGunakan pola:\n\`\`\`${p}jenis nominal keterangan\`\`\`\n` +
      `Contoh: *${p}keluar 25rb jajan*\n\nKetik *${p}bantuan* untuk panduan lengkap.`;
  }
  return simpanTransaksi_(ctx, trx, message);
}

function parseTransaksi_(message) {
  let teks = message.trim();
  let jenis = null;

  if (/^[+-]/.test(teks)) {
    jenis = teks[0] === '+' ? 'Pemasukan' : 'Pengeluaran';
    teks = teks.slice(1).trim();
  }

  let tag = null;
  const h = teks.match(/#([\w-]+)/);
  if (h) {
    tag = h[1].replace(/[_-]+/g, ' ');
    teks = teks.replace(h[0], '').trim();
  }

  const tokens = teks.split(/\s+/).filter(Boolean);
  if (!jenis && tokens.length) {
    const t0 = tokens[0].toLowerCase();
    if (KATA_MASUK.indexOf(t0) > -1)       { jenis = 'Pemasukan';   tokens.shift(); }
    else if (KATA_KELUAR.indexOf(t0) > -1) { jenis = 'Pengeluaran'; tokens.shift(); }
    else if (KATA_TABUNG.indexOf(t0) > -1) { jenis = 'Tabungan';    tokens.shift(); }
  }

  let idx = -1, nominal = 0;
  tokens.forEach((tok, i) => {
    const n = parseNominal_(tok);
    if (n !== null && n > nominal) { nominal = n; idx = i; }
  });
  if (idx === -1 || nominal <= 0) return null;
  tokens.splice(idx, 1);

  const keterangan = tokens.join(' ').trim() || '-';
  const pos = cariPos_(tag || keterangan);
  let kategori;

  if (tag && !pos) {
    kategori = tag.replace(/\b\w/g, c => c.toUpperCase());
    jenis = jenis || 'Pengeluaran';
  } else if (jenis === 'Tabungan') {
    kategori = pos && pos.k === 'Tabungan' ? pos.nama : 'Tabungan Lain';
  } else if (jenis === 'Pemasukan') {
    kategori = pos && pos.k === 'Pemasukan' ? pos.nama : 'Pemasukan Lain';
  } else if (jenis === 'Pengeluaran') {
    kategori = pos && pos.k === 'Pengeluaran' ? pos.nama : 'Lainnya';
  } else if (pos) {
    jenis = pos.k; kategori = pos.nama;
  } else {
    jenis = 'Pengeluaran'; kategori = 'Lainnya';
  }
  return { jenis, nominal, kategori, keterangan };
}

function parseNominal_(token) {
  const s = String(token).toLowerCase().replace(/^rp\.?/, '').trim();
  const m = s.match(/^(\d[\d.,]*)(rb|ribu|k|jt|juta)?$/);
  if (!m) return null;
  let angka = m[1];
  const satuan = m[2];
  let nilai;
  if (satuan) {
    const sep = (angka.match(/[.,]/g) || []).length;
    angka = sep === 1 ? angka.replace(',', '.') : angka.replace(/[.,]/g, '');
    nilai = parseFloat(angka);
    if (satuan === 'rb' || satuan === 'ribu' || satuan === 'k') nilai *= 1000;
    if (satuan === 'jt' || satuan === 'juta') nilai *= 1000000;
  } else {
    nilai = parseInt(angka.replace(/[.,]/g, ''), 10);
  }
  return isNaN(nilai) ? null : Math.round(nilai);
}

/** Mencari pos berdasarkan kata kunci terpanjang yang cocok. */
function cariPos_(teks) {
  const t = ' ' + String(teks).toLowerCase() + ' ';
  let best = null, bestLen = 0;
  POS.forEach(p => {
    p.kata.concat([p.nama.toLowerCase()]).forEach(kw => {
      if (kw.length <= bestLen) return;
      const pola = kw.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&').replace(/\s+/g, '\\s+');
      if (new RegExp('(^|[^a-z0-9])' + pola + '([^a-z0-9]|$)').test(t)) { best = p; bestLen = kw.length; }
    });
  });
  return best;
}

function simpanTransaksi_(ctx, trx, pesanAsli) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    getSheet_().appendRow([
      new Date(), "'" + ctx.buku, ctx.nama, trx.jenis, trx.kategori, trx.nominal,
      trx.keterangan, pesanAsli, Utilities.getUuid().slice(0, 8), "'" + ctx.pengirim,
    ]);
  } finally {
    lock.releaseLock();
  }

  // Di grup: simpan diam-diam, tanpa balasan
  if (ctx.isGroup && !CONFIG.BALAS_TRANSAKSI_GRUP) return '';

  const per = periodeBerjalan_();
  const h = hitung_(ambilData_(ctx.buku).filter(r => dalamPeriode_(r.waktu, per)));
  const target = bacaTarget_()[trx.kategori] || 0;
  const terpakai = h.perKat[trx.kategori] || 0;
  const ikon = { Pemasukan: '🟢', Tabungan: '💖', Pengeluaran: '🔴' }[trx.jenis] || '🔴';
  const p = ctx.isGroup ? CONFIG.PREFIX_GRUP : '';

  const out = [
    '✅ *Tercatat!*' + (ctx.isGroup ? ` (oleh ${ctx.nama})` : ''),
    `${ikon} ${trx.jenis}: *${rupiah_(trx.nominal)}*`,
    `🏷️ Pos: ${trx.kategori}`,
    `📝 Ket: ${trx.keterangan}`,
  ];
  if (target > 0) {
    if (trx.jenis === 'Pengeluaran') {
      const sisa = target - terpakai;
      out.push('', `📌 Anggaran ${trx.kategori}: ${rupiah_(terpakai)} / ${rupiah_(target)}`);
      out.push(sisa < 0 ? `⚠️ *Lewat anggaran ${rupiah_(-sisa)}*` : `   Sisa: *${rupiah_(sisa)}*`);
    } else {
      out.push('', `🎯 Progres ${trx.kategori}: ${rupiah_(terpakai)} / ${rupiah_(target)}` +
        (terpakai >= target ? ' ✅' : ''));
    }
  } else if (trx.kategori === 'Lainnya' && trx.jenis === 'Pengeluaran') {
    out.push('', `ℹ️ Tidak masuk pos mana pun. Ketik *${p}kategori* untuk daftar pos.`);
  }
  out.push(
    '',
    `📅 ${per.label} (${per.rentang})`,
    `🟢 ${rupiah_(h.masuk)} | 💖 ${rupiah_(h.tabung)} | 🔴 ${rupiah_(h.keluar)}`,
    `💵 Sisa kas: *${rupiah_(h.masuk - h.tabung - h.keluar)}*`,
    '',
    `_Salah input? Ketik *${p}hapus*_`
  );
  return out.join('\n');
}

// ======================= PERINTAH ===========================
function cmdSaldo_(ctx) {
  const h = hitung_(ambilData_(ctx.buku));
  return [
    `💰 *SALDO KESELURUHAN${ctx.isGroup ? ' GRUP' : ''}*`,
    `🟢 Total masuk   : ${rupiah_(h.masuk)}`,
    `💖 Total nabung  : ${rupiah_(h.tabung)}`,
    `🔴 Total keluar  : ${rupiah_(h.keluar)}`,
    '━━━━━━━━━━━━━━',
    `💵 Sisa kas: *${rupiah_(h.masuk - h.tabung - h.keluar)}*`,
    `(${h.jumlah} transaksi)`,
  ].join('\n');
}

function cmdSisa_(ctx) {
  const per = periodeBerjalan_();
  const h = hitung_(ambilData_(ctx.buku).filter(r => dalamPeriode_(r.waktu, per)));
  const tg = bacaTarget_();
  const out = [`📌 *SISA ANGGARAN*`, `📅 ${per.label} (${per.rentang})`, '', '💖 *Tabungan*'];
  POS.filter(p => p.k === 'Tabungan' && tg[p.nama] > 0).forEach(p => {
    const real = h.perKat[p.nama] || 0;
    out.push(`${real >= tg[p.nama] ? '✅' : '⏳'} ${p.nama}: ${rupiah_(real)} / ${rupiah_(tg[p.nama])}`);
  });
  out.push('', '🔴 *Pengeluaran*');
  POS.filter(p => p.k === 'Pengeluaran' && tg[p.nama] > 0).forEach(p => {
    const real = h.perKat[p.nama] || 0, sisa = tg[p.nama] - real;
    const e = sisa < 0 ? '🔴' : (real >= 0.8 * tg[p.nama] ? '🟡' : '🟢');
    out.push(`${e} ${p.nama}: sisa ${rupiah_(sisa)}`);
  });
  const lain = h.perJenis.Pengeluaran['Lainnya'] || 0;
  if (lain) out.push(`⚠️ Di luar pos: ${rupiah_(lain)}`);
  return out.join('\n');
}

function cmdHariIni_(ctx) {
  const hari = kunciTgl_(new Date());
  const rows = ambilData_(ctx.buku).filter(r => kunciTgl_(r.waktu) === hari);
  if (!rows.length) return '📅 Belum ada transaksi hari ini.';
  const ikon = { Pemasukan: '🟢', Tabungan: '💖', Pengeluaran: '🔴' };
  const daftar = rows.map((r, i) => {
    const jam = Utilities.formatDate(r.waktu, CONFIG.TIMEZONE, 'HH:mm');
    return `${i + 1}. ${ikon[r.jenis] || '🔴'} ${jam} ${rupiah_(r.nominal)} - ${r.kategori}` +
      (ctx.isGroup ? ` _(${r.nama})_` : '');
  });
  const h = hitung_(rows);
  return ['📅 *TRANSAKSI HARI INI*', ...daftar, '━━━━━━━━━━━━━━',
    `🟢 ${rupiah_(h.masuk)} | 💖 ${rupiah_(h.tabung)} | 🔴 ${rupiah_(h.keluar)}`].join('\n');
}

function cmdRekap_(ctx, teks) {
  let per = periodeBerjalan_();
  const m = teks.match(/(\d{1,2})(?:[\s\/-]+(\d{4}))?$/);
  if (m) {
    const b = Number(m[1]);
    if (b < 1 || b > 12) return '⚠️ Bulan tidak valid. Contoh: *rekap 9 2026* (= periode gajian September 2026)';
    per = periode_(m[2] ? Number(m[2]) : per.tahun, b);
  }
  const rows = ambilData_(ctx.buku).filter(r => dalamPeriode_(r.waktu, per));
  if (!rows.length) return `📊 Tidak ada transaksi di ${per.label} (${per.rentang}).`;
  const h = hitung_(rows);
  const fmt = o => Object.keys(o).sort((a, b) => o[b] - o[a]).map(k => `  • ${k}: ${rupiah_(o[k])}`).join('\n') || '  -';

  const out = [
    `📊 *REKAP ${per.label.toUpperCase()}*`, `(${per.rentang})`, '',
    `🟢 *Pemasukan: ${rupiah_(h.masuk)}*`, fmt(h.perJenis.Pemasukan), '',
    `💖 *Tabungan: ${rupiah_(h.tabung)}*`, fmt(h.perJenis.Tabungan), '',
    `🔴 *Pengeluaran: ${rupiah_(h.keluar)}*`, fmt(h.perJenis.Pengeluaran),
  ];
  if (ctx.isGroup) out.push('', '👥 *Pengeluaran per anggota:*', fmt(h.perOrang));
  out.push('━━━━━━━━━━━━━━', `💵 Sisa kas: *${rupiah_(h.masuk - h.tabung - h.keluar)}*`, `(${h.jumlah} transaksi)`);
  return out.join('\n');
}

function cmdHapus_(ctx) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = getSheet_();
    const v = sh.getDataRange().getValues();
    for (let i = v.length - 1; i >= 1; i--) {
      const bukuCocok = String(v[i][1]).trim() === ctx.buku;
      const orangCocok = !ctx.isGroup || String(v[i][9]).replace(/\D/g, '') === ctx.pengirim;
      if (bukuCocok && orangCocok) {
        sh.deleteRow(i + 1);
        return `🗑️ Transaksi terakhir${ctx.isGroup ? ' milik ' + ctx.nama : ''} dihapus:\n${v[i][3]} ${rupiah_(v[i][5])} - ${v[i][4]} (${v[i][6]})`;
      }
    }
    return '⚠️ Tidak ada transaksi Anda yang bisa dihapus.';
  } finally {
    lock.releaseLock();
  }
}

function cmdKategori_(isGroup) {
  const p = isGroup ? CONFIG.PREFIX_GRUP : '';
  const grup = { Pemasukan: '🟢 *PEMASUKAN*', Tabungan: '💖 *TABUNGAN*', Pengeluaran: '🔴 *PENGELUARAN WAJIB*' };
  const out = ['🏷️ *DAFTAR POS & KATA KUNCI*'];
  Object.keys(grup).forEach(k => {
    out.push('', grup[k]);
    POS.filter(x => x.k === k && x.kata.length).forEach(x => out.push(`• ${x.nama}: _${x.kata.slice(0, 3).join(', ')}_`));
  });
  out.push('', 'Tidak cocok? Tambahkan *#NamaPos*', `Contoh: _${p}keluar 300rb kado #Lainnya_`);
  return out.join('\n');
}

function pesanBantuan_(isGroup) {
  const p = isGroup ? CONFIG.PREFIX_GRUP : '';
  const out = ['🤖 *BOT CATATAN KEUANGAN*' + (isGroup ? ' (BUKU GRUP)' : ''), ''];
  out.push(
    '📌 *FORMAT PENGIRIMAN*',
    '```' + p + 'jenis  nominal  keterangan  #pos```',
    '',
    '1️⃣ *jenis* → keluar / masuk / nabung',
    '    _(boleh dikosongkan, ditebak dari keterangan)_',
    '2️⃣ *nominal* → wajib',
    '    _25000 · 25.000 · 25rb · 25k · 1,5jt_',
    '3️⃣ *keterangan* → sebut nama pos, mis. jajan o',
    '4️⃣ *#pos* → opsional, kalau pos tidak terbaca',
    '',
    '✏️ *CONTOH*',
    `• ${p}kontrakan 1.500.000`,
    `• ${p}jajan o 50rb`,
    `• ${p}belanja sayur 85rb`,
    `• ${p}masuk 5.000.000 gaji istri`,
    `• ${p}nabung 1jt kuliah a`,
    '',
    '📋 *PERINTAH LAIN*',
    `• ${p}sisa → sisa anggaran per pos`,
    `• ${p}hari ini → transaksi hari ini`,
    `• ${p}rekap → rekap periode gajian ini`,
    `• ${p}rekap 9 2026 → periode gajian tertentu`,
    `• ${p}saldo → saldo keseluruhan`,
    `• ${p}hapus → batalkan catatan terakhir${isGroup ? ' Anda' : ''}`,
    `• ${p}kategori → daftar pos & kata kunci`
  );
  if (isGroup) out.push('', `⚠️ Di grup, setiap pesan untuk bot *wajib diawali "${p}"*`);
  return out.join('\n');
}

// ======================= PERIODE GAJIAN =====================
function pad_(n) { return ('0' + n).slice(-2); }
function kunciTgl_(d) { return Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy-MM-dd'); }

/** Periode gajian bulan `bulan` (1-12): tgl 25 bulan itu s/d tgl 24 bulan berikutnya. */
function periode_(tahun, bulan) {
  const G = CONFIG.TANGGAL_GAJIAN;
  const t2 = bulan === 12 ? tahun + 1 : tahun, b2 = bulan === 12 ? 1 : bulan + 1;
  return {
    tahun: tahun, bulan: bulan,
    mulai: `${tahun}-${pad_(bulan)}-${pad_(G)}`,
    selesai: `${t2}-${pad_(b2)}-${pad_(G)}`,              // tidak termasuk
    label: `Gajian ${BLN[bulan - 1]} ${tahun}`,
    rentang: `${G} ${BLN[bulan - 1]} – ${G - 1} ${BLN[b2 - 1]} ${t2}`,
  };
}

function periodeBerjalan_(d) {
  d = d || new Date();
  let y = Number(Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy'));
  let m = Number(Utilities.formatDate(d, CONFIG.TIMEZONE, 'M'));
  const day = Number(Utilities.formatDate(d, CONFIG.TIMEZONE, 'd'));
  if (day < CONFIG.TANGGAL_GAJIAN) { m--; if (m < 1) { m = 12; y--; } }
  return periode_(y, m);
}

function dalamPeriode_(waktu, per) {
  const k = kunciTgl_(waktu);
  return k >= per.mulai && k < per.selesai;
}

// ======================= HELPER DATA ========================
function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet_() {
  const sh = getSpreadsheet_().getSheetByName(CONFIG.SHEET_TRANSAKSI);
  if (!sh) throw new Error('Sheet Transaksi belum ada. Jalankan setup() dulu.');
  return sh;
}

function ambilData_(buku) {
  return getSheet_().getDataRange().getValues().slice(1)
    .filter(r => r[0] instanceof Date && String(r[1]).trim() === buku)
    .map(r => ({ waktu: r[0], nama: r[2], jenis: r[3], kategori: r[4], nominal: Number(r[5]) || 0, keterangan: r[6] }));
}

function hitung_(rows) {
  const h = { masuk: 0, tabung: 0, keluar: 0, jumlah: 0, perKat: {}, perOrang: {},
              perJenis: { Pemasukan: {}, Tabungan: {}, Pengeluaran: {} } };
  rows.forEach(r => {
    h.jumlah++;
    const j = r.jenis === 'Pemasukan' || r.jenis === 'Tabungan' ? r.jenis : 'Pengeluaran';
    if (j === 'Pemasukan') h.masuk += r.nominal;
    else if (j === 'Tabungan') h.tabung += r.nominal;
    else {
      h.keluar += r.nominal;
      const n = r.nama || 'Tanpa nama';
      h.perOrang[n] = (h.perOrang[n] || 0) + r.nominal;
    }
    h.perKat[r.kategori] = (h.perKat[r.kategori] || 0) + r.nominal;
    h.perJenis[j][r.kategori] = (h.perJenis[j][r.kategori] || 0) + r.nominal;
  });
  return h;
}

/** Target per pos, dibaca dari tab Target Anggaran (cache 5 menit). */
function bacaTarget_() {
  const cache = CacheService.getScriptCache();
  const c = cache.get('target_pos');
  if (c) return JSON.parse(c);
  const hasil = {};
  POS.forEach(p => hasil[p.nama] = p.target || 0);
  const sh = getSpreadsheet_().getSheetByName(CONFIG.SHEET_TARGET);
  if (sh && sh.getLastRow() > 1) {
    sh.getRange(2, 2, sh.getLastRow() - 1, 2).getValues().forEach(r => {
      const n = String(r[0]).trim();
      if (n && hasil.hasOwnProperty(n)) hasil[n] = Number(r[1]) || 0;
    });
  }
  cache.put('target_pos', JSON.stringify(hasil), 300);
  return hasil;
}

function rupiah_(n) {
  const s = Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (n < 0 ? '-Rp ' : 'Rp ') + s;
}

// ======================= DASHBOARD ==========================
/** Jalankan dari editor untuk membuat/memperbarui tab dashboard. Aman diulang. */
function buatDashboard() {
  const ss = getSpreadsheet_();
  deteksiPemisah_(ss);
  const baris = siapkanTarget_(ss);
  buatSheetPeriode_(ss);
  buatSheetPeriodeIni_(ss, baris);
  buatSheet12Bulan_(ss, baris);
  CacheService.getScriptCache().remove('target_pos');
  Logger.log('Dashboard selesai dibuat. Ubah angka anggaran di tab "' + CONFIG.SHEET_TARGET + '".');
}

/**
 * Membuat tab Target Anggaran jika belum ada (angka awal dari tab Dashboard Nabung bila ada,
 * jika tidak dari nilai target di daftar POS). Jika tab sudah ada, angka yang sudah Anda ubah
 * TIDAK ditimpa; hanya pos yang belum ada yang ditambahkan.
 * Mengembalikan peta nama pos → nomor baris.
 */
function siapkanTarget_(ss) {
  let sh = ss.getSheetByName(CONFIG.SHEET_TARGET);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.SHEET_TARGET);
    sh.getRange('A1:D1').setValues([['Kelompok', 'Pos', 'Target / periode', 'Catatan']])
      .setFontWeight('bold').setFontColor('#ffffff').setBackground(WARNA.header);
    sh.setFrozenRows(1);
  }

  // Angka dari Dashboard Nabung (opsional)
  const sumber = {};
  const src = ss.getSheetByName(CONFIG.SHEET_SUMBER);
  if (src) {
    src.getDataRange().getValues().forEach(r => {
      const n = String(r[1]).trim().toLowerCase();
      if (n && typeof r[3] === 'number' && sumber[n] === undefined) sumber[n] = r[3];
    });
  }

  const ada = {};
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues().forEach((r, i) => {
      const n = String(r[0]).trim();
      if (n) ada[n] = i + 2;
    });
  }

  const baru = POS.filter(p => !ada[p.nama]).map(p => {
    const dariSumber = p.cari ? sumber[p.cari.toLowerCase()] : undefined;
    return [p.k, p.nama, dariSumber !== undefined ? dariSumber : (p.target || 0), ''];
  });
  if (baru.length) {
    const start = sh.getLastRow() + 1;
    sh.getRange(start, 1, baru.length, 4).setValues(baru);
    baru.forEach((r, i) => ada[r[1]] = start + i);
  }

  const n = sh.getLastRow() - 1;
  sh.getRange(2, 3, n, 1).setNumberFormat('"Rp "#,##0').setBackground('#fff2cc');
  sh.setColumnWidth(1, 120); sh.setColumnWidth(2, 220); sh.setColumnWidth(3, 150); sh.setColumnWidth(4, 300);
  sh.getRange('F1').setValue('💡 Ubah angka di kolom kuning bila anggaran berubah. Dashboard ikut menyesuaikan.')
    .setFontStyle('italic').setFontColor('#666666');
  return ada;
}

function rumusTarget_(p, baris) {
  const row = baris[p.nama];
  return row ? `='${CONFIG.SHEET_TARGET}'!C${row}` : (p.target || 0);
}

function rumusSum_(kriteriaKolom, kriteria, mulai, selesai) {
  const T = `'${CONFIG.SHEET_TRANSAKSI}'`, H = `'${CONFIG.SHEET_HELPER}'`;
  return `SUMIFS(${T}!$F:$F,${T}!$B:$B,${H}!$E$2,${T}!$${kriteriaKolom}:$${kriteriaKolom},${kriteria},` +
         `${T}!$A:$A,">="&${mulai},${T}!$A:$A,"<"&${selesai})`;
}

/**
 * PEMISAH RUMUS
 * Spreadsheet berlokal Indonesia memakai ";" sebagai pemisah argumen (=SUM(1;2)) dan "," sebagai desimal.
 * Rumus di script ditulis gaya Inggris (koma), lalu diubah otomatis sesuai lokal spreadsheet.
 */
let PEMISAH_ = ',';

function deteksiPemisah_(ss) {
  const tes = ss.insertSheet('_tes_pemisah');
  try {
    tes.getRange('A1').setFormula('=SUM(1,2)');
    SpreadsheetApp.flush();
    PEMISAH_ = String(tes.getRange('A1').getDisplayValue()) === '3' ? ',' : ';';
  } finally {
    ss.deleteSheet(tes);
  }
  Logger.log('Pemisah rumus spreadsheet: "' + PEMISAH_ + '"');
}

function lokal_(f) {
  if (PEMISAH_ !== ';' || typeof f !== 'string' || f.charAt(0) !== '=') return f;
  let out = '', dq = false, sq = false;
  for (let i = 0; i < f.length; i++) {
    const ch = f.charAt(i);
    if (ch === '"' && !sq) { dq = !dq; out += ch; continue; }
    if (ch === "'" && !dq) { sq = !sq; out += ch; continue; }
    if (!dq && !sq) {
      if (ch === ',') { out += ';'; continue; }
      if (ch === '.' && /\d/.test(f.charAt(i - 1)) && /\d/.test(f.charAt(i + 1))) { out += ','; continue; }
    }
    out += ch;
  }
  return out;
}

/** Menulis teks, angka, dan rumus sekaligus (rumus disesuaikan dengan lokal). */
function tulis_(range, data) {
  range.setValues(data.map(r => r.map(v => (v === null || v === undefined) ? '' : lokal_(v))));
}

function kolom_(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function resetSheet_(ss, nama) {
  const sh = ss.getSheetByName(nama) || ss.insertSheet(nama);
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart().clearDataValidations();
  sh.clear();
  sh.setConditionalFormatRules([]);
  sh.showRows(1, sh.getMaxRows());
  sh.showColumns(1, sh.getMaxColumns());
  return sh;
}

function buatSheetPeriode_(ss) {
  const sh = resetSheet_(ss, CONFIG.SHEET_HELPER);
  const G = CONFIG.TANGGAL_GAJIAN;
  sh.getRange('A1:C1').setValues([['Label', 'Mulai', 'Selesai (tidak termasuk)']]);
  sh.getRange('A2').setValue('Periode berjalan');
  sh.getRange('B2').setFormula(lokal_(`=IF(DAY(TODAY())>=${G},DATE(YEAR(TODAY()),MONTH(TODAY()),${G}),DATE(YEAR(TODAY()),MONTH(TODAY())-1,${G}))`));
  sh.getRange('C2').setFormula(lokal_('=EDATE(B2,1)'));
  const rows = [];
  for (let i = 0; i < CONFIG.JUMLAH_PERIODE; i++) {
    let y = CONFIG.PERIODE_AWAL.tahun, m = CONFIG.PERIODE_AWAL.bulan + i;
    while (m > 12) { m -= 12; y++; }
    const r = 3 + i;
    rows.push([`Gajian ${BLN[m - 1]} ${y}`, `=DATE(${y},${m},${G})`, `=EDATE(B${r},1)`]);
  }
  tulis_(sh.getRange(3, 1, rows.length, 3), rows);
  sh.getRange(2, 2, rows.length + 1, 2).setNumberFormat('dd mmm yyyy');
  sh.getRange('E1').setValue('ID Grup Dashboard');
  sh.getRange('E2').setNumberFormat('@').setValue(CONFIG.GRUP_DASHBOARD);
  sh.hideSheet();
}

const WARNA = {
  judul: '#1f3b5c', header: '#2e5c8a',
  Pemasukan: '#d9ead3', Tabungan: '#fce5f0', Pengeluaran: '#fde9d9', Skor: '#e8eaf6', total: '#f3f3f3',
};
const JUDUL_SEKSI = { Pemasukan: '💼 PEMASUKAN', Tabungan: '💖 POS TABUNGAN', Pengeluaran: '🎀 PENGELUARAN WAJIB' };

function rumusStatus_(k, r) {
  if (k === 'Pengeluaran') {
    return `=IF(C${r}=0,IF(D${r}>0,"⚠️ Tidak dianggarkan",""),IF(D${r}>C${r},"🔴 Lewat anggaran",IF(D${r}>=0.8*C${r},"🟡 Hampir habis","🟢 Aman")))`;
  }
  return `=IF(C${r}=0,IF(D${r}>0,"✅ Ada",""),IF(D${r}>=C${r},"✅ Tercapai",IF(D${r}>0,"⏳ Sebagian","⬜ Belum")))`;
}

/** Tab "Realisasi Periode": pilih periode dari dropdown, lihat target vs realisasi per pos. */
function buatSheetPeriodeIni_(ss, baris) {
  const sh = resetSheet_(ss, CONFIG.SHEET_PERIODE_INI);
  const H = `'${CONFIG.SHEET_HELPER}'`;
  const akhirHelper = 2 + CONFIG.JUMLAH_PERIODE;
  const lookup = kol => `=VLOOKUP($B$2,${H}!$A$2:$C$${akhirHelper},${kol},FALSE)`;

  sh.getRange('A1:G1').merge().setValue('📊 TARGET vs REALISASI — PER PERIODE GAJIAN')
    .setFontSize(14).setFontWeight('bold').setFontColor('#ffffff').setBackground(WARNA.judul);
  sh.getRange('A2').setValue('Pilih periode ▸').setFontWeight('bold');
  sh.getRange('B2').setValue('Periode berjalan').setBackground('#fff2cc').setFontWeight('bold')
    .setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInRange(ss.getSheetByName(CONFIG.SHEET_HELPER).getRange(`A2:A${akhirHelper}`), true).build());
  sh.getRange('C2').setValue('Mulai').setHorizontalAlignment('right');
  sh.getRange('D2').setFormula(lokal_(lookup(2)));
  sh.getRange('E2').setValue('s/d').setHorizontalAlignment('right');
  sh.getRange('F2').setFormula(lokal_(lookup(3) + '-1'));
  sh.getRange('H2').setFormula(lokal_(lookup(3)));
  sh.getRange('D2:H2').setNumberFormat('dd mmm yyyy');
  sh.getRange('A3:G3').merge().setValue('Realisasi otomatis dari tab "' + CONFIG.SHEET_TRANSAKSI + '" (catatan WhatsApp grup). Target dari tab "' + CONFIG.SHEET_TARGET + '".')
    .setFontStyle('italic').setFontColor('#666666');

  sh.getRange('A5:G5').setValues([['Kelompok', 'Pos', 'Target', 'Realisasi', 'Sisa / Kurang', '% Target', 'Status']])
    .setFontWeight('bold').setFontColor('#ffffff').setBackground(WARNA.header);

  const data = [], gaya = [], total = {};
  let r = 6;
  ['Pemasukan', 'Tabungan', 'Pengeluaran'].forEach(k => {
    data.push([JUDUL_SEKSI[k], '', '', '', '', '', '']); gaya.push([r, 'seksi', k]); r++;
    const first = r;
    POS.filter(p => p.k === k).forEach(p => {
      data.push([k, p.nama, rumusTarget_(p, baris),
        '=' + rumusSum_('E', `$B${r}`, '$D$2', '$H$2'),
        `=C${r}-D${r}`, `=IF(C${r}=0,"",D${r}/C${r})`, rumusStatus_(k, r)]);
      r++;
    });
    if (k === 'Pengeluaran') {
      data.push([k, 'Di luar pos (tak terencana)', 0,
        '=' + rumusSum_('D', '"Pengeluaran"', '$D$2', '$H$2') + `-SUM(D${first}:D${r - 1})`,
        `=C${r}-D${r}`, '', `=IF(D${r}>0,"⚠️ Cek transaksi","")`]);
      r++;
    }
    const last = r - 1;
    data.push([`TOTAL ${k.toUpperCase()}`, '', `=SUM(C${first}:C${last})`, `=SUM(D${first}:D${last})`,
      `=C${r}-D${r}`, `=IF(C${r}=0,"",D${r}/C${r})`, '']);
    gaya.push([r, 'total', k]); total[k] = r; r++;
    data.push(['', '', '', '', '', '', '']); r++;
  });

  const m = total.Pemasukan, t = total.Tabungan, k = total.Pengeluaran;
  data.push(['📊 SCORECARD ARUS KAS', '', 'Target', 'Realisasi', '', '', '']); gaya.push([r, 'seksi', 'Skor']); r++;
  data.push(['', 'Total Pemasukan', `=C${m}`, `=D${m}`, '', '', '']); r++;
  data.push(['', 'Total Tabungan', `=C${t}`, `=D${t}`, '', `=IF(D${m}=0,"",D${t}/D${m})`, '← rasio dari pemasukan']); r++;
  data.push(['', 'Total Pengeluaran', `=C${k}`, `=D${k}`, '', `=IF(D${m}=0,"",D${k}/D${m})`, '← rasio dari pemasukan']); r++;
  data.push(['', 'SISA KAS (Masuk − Nabung − Keluar)', `=C${m}-C${t}-C${k}`, `=D${m}-D${t}-D${k}`, '', '',
    `=IF(D${r}<0,"🔴 Defisit","🟢 Surplus")`]);
  gaya.push([r, 'total', 'Skor']); r++;

  tulis_(sh.getRange(6, 1, data.length, 7), data);
  gaya.forEach(([row, jenis, k]) => {
    const rg = sh.getRange(row, 1, 1, 7).setFontWeight('bold').setBackground(jenis === 'seksi' ? WARNA[k] : WARNA.total);
    if (jenis === 'seksi') rg.setFontSize(11);
  });
  sh.getRange(6, 3, data.length, 3).setNumberFormat('"Rp "#,##0;[Red]-"Rp "#,##0');
  sh.getRange(6, 6, data.length, 1).setNumberFormat('0%');
  sh.getRange(6, 1, data.length, 1).setFontColor('#999999');
  gaya.forEach(([row]) => sh.getRange(row, 1).setFontColor('#000000'));
  sh.setColumnWidth(1, 170); sh.setColumnWidth(2, 260);
  sh.setColumnWidths(3, 3, 130); sh.setColumnWidth(6, 80); sh.setColumnWidth(7, 170);
  sh.hideColumns(8);
  sh.setFrozenRows(5);
}

/** Tab "Realisasi 12 Bulan": grid pos × 12 periode gajian. */
function buatSheet12Bulan_(ss, baris) {
  const sh = resetSheet_(ss, CONFIG.SHEET_12_BULAN);
  const H = `'${CONFIG.SHEET_HELPER}'`;
  const N = CONFIG.JUMLAH_PERIODE;
  const C0 = 4;                                  // kolom D = periode pertama
  const cTotal = C0 + N, cTarget = cTotal + 1, cSelisih = cTotal + 2, cPersen = cTotal + 3;
  const L = kolom_, nKol = cPersen;

  sh.getRange(1, 1, 1, nKol).setBackground(WARNA.judul);
  sh.getRange(1, 1).setValue('📅 TARGET vs REALISASI 12 PERIODE GAJIAN (25 → 24)')
    .setFontSize(14).setFontWeight('bold').setFontColor('#ffffff');
  sh.getRange(2, 1).setValue('Realisasi otomatis dari tab Transaksi (catatan WhatsApp grup). Merah = lewat anggaran, hijau = target tabungan tercapai, kuning = periode berjalan.')
    .setFontStyle('italic').setFontColor('#666666');

  const h3 = ['Kelompok', 'Pos', 'Target / periode'], h4 = ['', '', ''], h5 = ['', '', ''];
  for (let i = 0; i < N; i++) {
    h3.push(`=${H}!A${3 + i}`); h4.push(`=${H}!B${3 + i}`); h5.push(`=${H}!C${3 + i}`);
  }
  h3.push('Total Realisasi', 'Target 12 Periode', 'Selisih (Target − Real)', '% Target');
  h4.push('', '', '', ''); h5.push('', '', '', '');
  tulis_(sh.getRange(3, 1, 3, nKol), [h3, h4, h5]);
  sh.getRange(3, 1, 2, nKol).setFontWeight('bold').setFontColor('#ffffff').setBackground(WARNA.header)
    .setHorizontalAlignment('center').setWrap(true);
  sh.getRange(4, C0, 2, N).setNumberFormat('dd mmm yy');
  sh.hideRows(5);

  const data = [], gaya = [], total = {}, itemRows = [];
  let r = 6;
  const barisPos = (k, nama, target, rumusPeriode) => {
    const row = [k, nama, target];
    for (let i = 0; i < N; i++) row.push(rumusPeriode(L(C0 + i)));
    row.push(`=SUM(${L(C0)}${r}:${L(C0 + N - 1)}${r})`, `=C${r}*${N}`,
      `=${L(cTarget)}${r}-${L(cTotal)}${r}`, `=IF(${L(cTarget)}${r}=0,"",${L(cTotal)}${r}/${L(cTarget)}${r})`);
    return row;
  };
  const kosong = () => new Array(nKol).fill('');

  ['Pemasukan', 'Tabungan', 'Pengeluaran'].forEach(k => {
    const s = kosong(); s[0] = JUDUL_SEKSI[k]; data.push(s); gaya.push([r, 'seksi', k]); r++;
    const first = r;
    POS.filter(p => p.k === k).forEach(p => {
      data.push(barisPos(k, p.nama, rumusTarget_(p, baris),
        c => '=' + rumusSum_('E', `$B${r}`, `${c}$4`, `${c}$5`)));
      itemRows.push(r); r++;
    });
    if (k === 'Pengeluaran') {
      const f = first, l = r - 1;
      data.push(barisPos(k, 'Di luar pos (tak terencana)', 0,
        c => '=' + rumusSum_('D', '"Pengeluaran"', `${c}$4`, `${c}$5`) + `-SUM(${c}${f}:${c}${l})`));
      r++;
    }
    const last = r - 1;
    const t = [`TOTAL ${k.toUpperCase()}`, '', `=SUM(C${first}:C${last})`];
    for (let i = 0; i <= N + 1; i++) { const c = L(C0 + i); t.push(`=SUM(${c}${first}:${c}${last})`); }
    t.push(`=${L(cTarget)}${r}-${L(cTotal)}${r}`, `=IF(${L(cTarget)}${r}=0,"",${L(cTotal)}${r}/${L(cTarget)}${r})`);
    data.push(t); gaya.push([r, 'total', k]); total[k] = r; r++;
    data.push(kosong()); r++;
  });

  const m = total.Pemasukan, t = total.Tabungan, k = total.Pengeluaran;
  const s = kosong(); s[0] = '📊 SCORECARD ARUS KAS'; data.push(s); gaya.push([r, 'seksi', 'Skor']); r++;

  const sisa = ['', 'SISA KAS (Masuk − Nabung − Keluar)', `=C${m}-C${t}-C${k}`];
  for (let i = 0; i <= N + 1; i++) { const c = L(C0 + i); sisa.push(`=${c}${m}-${c}${t}-${c}${k}`); }
  sisa.push('', ''); data.push(sisa); gaya.push([r, 'total', 'Skor']); r++;

  const akum = ['', 'Akumulasi Tabungan', ''];
  for (let i = 0; i < N; i++) {
    const c = L(C0 + i);
    akum.push(i === 0 ? `=${c}${t}` : `=${L(C0 + i - 1)}${r}+${c}${t}`);
  }
  akum.push('', '', '', ''); data.push(akum); r++;

  const rasio = ['', 'Rasio Tabungan / Pemasukan', ''];
  for (let i = 0; i <= N; i++) { const c = L(C0 + i); rasio.push(`=IF(${c}${m}=0,"",${c}${t}/${c}${m})`); }
  rasio.push('', '', ''); data.push(rasio); const barisRasio = r; r++;

  tulis_(sh.getRange(6, 1, data.length, nKol), data);
  gaya.forEach(([row, jenis, kk]) => sh.getRange(row, 1, 1, nKol).setFontWeight('bold')
    .setBackground(jenis === 'seksi' ? WARNA[kk] : WARNA.total));
  sh.getRange(6, 3, data.length, cSelisih - 2).setNumberFormat('"Rp "#,##0;[Red]-"Rp "#,##0');
  sh.getRange(6, cPersen, data.length, 1).setNumberFormat('0%');
  sh.getRange(barisRasio, C0, 1, N + 1).setNumberFormat('0%');
  sh.getRange(6, 1, data.length, 1).setFontColor('#999999');
  gaya.forEach(([row]) => sh.getRange(row, 1).setFontColor('#000000'));

  // Pewarnaan otomatis
  const area = sh.getRange(6, C0, r - 6, N);
  const atas = `${L(C0)}6`;
  const aturan = [
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(lokal_(`=AND($A6="Pengeluaran",$C6>0,${atas}>$C6)`))
      .setBackground('#f4c7c3').setFontColor('#a50e0e').setRanges([area]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(lokal_(`=AND($A6="Tabungan",$C6>0,${atas}>=$C6)`))
      .setBackground('#b7e1cd').setFontColor('#0b5d1e').setRanges([area]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(lokal_(`=AND(${L(C0)}$4<=TODAY(),TODAY()<${L(C0)}$5)`))
      .setBackground('#fff2cc').setRanges([sh.getRange(3, C0, r - 3, N)]).build(),
  ];
  sh.setConditionalFormatRules(aturan);

  sh.setColumnWidth(1, 150); sh.setColumnWidth(2, 240); sh.setColumnWidth(3, 120);
  sh.setColumnWidths(C0, N, 110);
  sh.setColumnWidths(cTotal, 3, 130); sh.setColumnWidth(cPersen, 80);
  sh.setFrozenRows(4); sh.setFrozenColumns(2);
}

// ======================= KIRIM WHATSAPP =====================
function kirimWA_(target, pesan) {
  const res = UrlFetchApp.fetch('https://api.fonnte.com/send', {
    method: 'post',
    headers: { Authorization: CONFIG.FONNTE_TOKEN },
    payload: { target: target, message: pesan, countryCode: '62' },
    muteHttpExceptions: true,
  });
  console.log('Fonnte: ' + res.getContentText());
}

/** Jalankan setiap kali bot dimasukkan ke grup baru. */
function ambilDaftarGrup() {
  const opsi = { method: 'post', headers: { Authorization: CONFIG.FONNTE_TOKEN }, muteHttpExceptions: true };
  Logger.log('Perbarui grup: ' + UrlFetchApp.fetch('https://api.fonnte.com/fetch-group', opsi).getContentText());
  Utilities.sleep(5000);
  Logger.log('Daftar grup: ' + UrlFetchApp.fetch('https://api.fonnte.com/get-whatsapp-group', opsi).getContentText());
}

// ======================= TESTING ============================
/** Uji pengenalan pos TANPA menyimpan ke sheet. */
function testPengenalan() {
  ['kontrakan 1.500.000', 'jajan o 50rb', 'belanja sayur 85rb', 'beras 5kg 75rb',
   'masuk 5.000.000 gaji istri', 'nabung 1jt kuliah a', 'nabung 1jt rumah', 'tj 10rb',
   'krl 6000', 'bensin 50rb', 'kopi 20rb', 'pulsa 100rb', 'obat 45rb', 'kado 300rb #Sosial']
    .forEach(t => {
      const x = parseTransaksi_(t);
      Logger.log(t + '  →  ' + (x ? `${x.jenis} | ${x.kategori} | ${rupiah_(x.nominal)}` : 'TIDAK DIKENALI'));
    });
  Logger.log('Periode berjalan: ' + JSON.stringify(periodeBerjalan_()));
}

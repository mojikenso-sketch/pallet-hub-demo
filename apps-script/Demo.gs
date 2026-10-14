/**
 * Pallet Hub — DEMO EDITION helpers (บริษัท ตัวอย่าง อินดัสทรี จำกัด / Demo Co., Ltd.)
 *
 * Owner setup (once, from the Apps Script editor):
 *   setupDemo()      creates the "Pallet Hub Demo Database" spreadsheet (via
 *                    setupSystem), sets the public demo password, writes the
 *                    sample data, stores DEMO_LAST_RESET and installs ONE hourly
 *                    trigger that runs demoAutoReset().
 * Afterwards:
 *   demoAutoReset()  (trigger, every hour) re-seeds when >= DEMO_RESET_HOURS (5)
 *                    hours have passed since DEMO_LAST_RESET.
 *   resetDemoNow()   manual reset to the sample data at any time.
 *
 * Slim demo: the "premium" actions in DEMO_LOCKED_ACTIONS (and a return in
 * damaged condition) are refused by the API with DEMO_LOCKED_MESSAGE, so they
 * cannot be called directly either. Only the owner's editor functions above
 * (and the seed) still use them.
 *
 * The sample data is the plain list DEMO_SEED_PLAN below. Every entry is
 * written through the normal business functions (actionReceive_, actionIssue_,
 * ...) with "now" pinned to the entry's own date/time (DEMO_NOW_MS_), so stock
 * checks, doc numbers, repair tickets and audit_logs are exactly what the real
 * system would have produced. Dates are relative to the moment of the reset,
 * so the demo never looks stale.
 */

var DEMO_LAST_RESET_PROPERTY = "DEMO_LAST_RESET";
var DEMO_ADMIN_PASSWORD = "demo1234";      // public: shown on the page and in README_DEMO.txt
var DEMO_RESET_HOURS = 5;                    // shared data is re-seeded every 5 hours
var DEMO_TRIGGER_EVERY_HOURS = 1;           // demoAutoReset runs hourly (resets 5-6 h apart)
var DEMO_TRIGGER_HANDLER = "demoAutoReset";
var DEMO_SYSTEM_ACTOR = "ระบบทดลอง (Demo)";
var DEMO_COMPANY = "บริษัท ตัวอย่าง อินดัสทรี จำกัด (Demo Co., Ltd.)";

// true (always in the deployed demo): "รีเซ็ตข้อมูล / Reset data" restores the
// sample data. The engine regression tests (test/gas-mock.js) switch it off to
// exercise the original empty reset; the demo tests switch it back on.
var DEMO_RESET_RESTORES_SEED = true;

// Slim demo: these API actions belong to the full version only. true in the
// deployed demo; the engine regression tests switch it off to exercise them.
var DEMO_LOCK_PREMIUM = true;
var DEMO_LOCKED_MESSAGE = "ฟีเจอร์นี้มีในเวอร์ชันเต็ม";
var DEMO_LOCKED_ACTIONS = [
  "damage", "repair_start", "repair_done", "scrap",                       // แจ้งชำรุด / งานซ่อม / ตัดจำหน่าย
  "movement_update", "movement_delete", "repair_update", "repair_delete", // แก้ไข / ลบรายการย้อนหลัง
  "dept_save", "dept_delete",                                             // ตั้งค่าฝ่าย
  "reset_data",                                                           // ปุ่มรีเซ็ตข้อมูล
  "export", "logs_export"                                                 // ส่งออก Excel (ประวัติ / Log)
];

// "now" override used only while the seed is written (see nowParts_ in Code.gs).
var DEMO_NOW_MS_ = null;

// Fictional people (by index in DEMO_SEED_PLAN "by").
var DEMO_ACTORS = [
  "กมลวรรณ ศรีสุข",   // 0 เจ้าหน้าที่คลังพาเลท
  "ณัฐพล แก้วมณี",     // 1 หัวหน้าคลังพาเลท
  "ปิยะนุช ทองดี",     // 2 เจ้าหน้าที่คลังพาเลท (กะบ่าย)
  "สุรชัย มั่นคง"      // 3 ช่างซ่อมพาเลท
];

// Short department keys -> names (same as SEED_DEPARTMENTS in Code.gs).
var DEMO_DEPTS = {
  P: "ฝ่ายผลิต", B: "ฝ่ายบรรจุ", W: "ฝ่ายคลังสินค้า", S: "ฝ่ายจัดส่ง / ขนส่ง",
  R: "ฝ่ายวัตถุดิบ", M: "ฝ่ายซ่อมบำรุง", Q: "ฝ่ายควบคุมคุณภาพ (QC)", E: "ฝ่ายสิ่งแวดล้อม"
};

/*
 * Sample movements, in time order. Fields:
 *   d / t   day offset from today (negative = past) and "HH:MM"   — or —
 *   ago     minutes before the reset moment (entries of "today")
 *   a       action: receive | issue | return | damage | repair_start | repair_done | scrap
 *   ty, sz  pallet type key (RM / PK / FG / PL) and size
 *   q       quantity
 *   dp      department key (issue / return)
 *   by      actor index (DEMO_ACTORS), p = optional free-text person
 *   n       note (or the damage cause for damage / damaged returns)
 *   bad     true = return in damaged condition (opens a repair ticket)
 *   tk      repair ticket label: set on damage / damaged return, used by
 *           repair_start / repair_done / scrap of the same ticket
 */
var DEMO_SEED_PLAN = [
  { d: -28, t: "08:30", a: "receive", ty: "RM", sz: "1.2x1.2", q: 120, by: 1, n: "รับพาเลทใหม่ ล็อตเปิดระบบ" },
  { d: -28, t: "09:10", a: "receive", ty: "PK", sz: "1.1x1.1", q: 80, by: 1, n: "รับพาเลทใหม่ ล็อตเปิดระบบ" },
  { d: -28, t: "09:40", a: "receive", ty: "PK", sz: "1.2x1.2", q: 60, by: 1, n: "รับพาเลทใหม่ ล็อตเปิดระบบ" },
  { d: -28, t: "10:20", a: "receive", ty: "FG", sz: "1.2x1.2", q: 100, by: 0, n: "รับพาเลทใหม่ ล็อตเปิดระบบ" },
  { d: -28, t: "10:50", a: "receive", ty: "FG", sz: "1.1x1.1", q: 40, by: 0, n: "" },
  { d: -28, t: "13:30", a: "receive", ty: "PL", sz: "1.2x1.2", q: 60, by: 0, n: "พาเลทพลาสติกสำหรับวางลัง" },
  { d: -27, t: "08:15", a: "issue", ty: "RM", sz: "1.2x1.2", q: 40, dp: "R", by: 0, p: "สมพร ใจเย็น", n: "รองรับวัตถุดิบเข้าโกดัง" },
  { d: -27, t: "10:00", a: "issue", ty: "PK", sz: "1.1x1.1", q: 30, dp: "B", by: 0, p: "อรุณี ประจำสุข", n: "" },
  { d: -27, t: "14:00", a: "issue", ty: "FG", sz: "1.2x1.2", q: 35, dp: "W", by: 2, p: "ธีรวัฒน์ สายสุวรรณ", n: "" },
  { d: -26, t: "08:30", a: "issue", ty: "RM", sz: "1.2x1.2", q: 25, dp: "P", by: 0, p: "วิชัย ทำดี", n: "ไลน์ผลิต 1" },
  { d: -26, t: "13:00", a: "issue", ty: "PL", sz: "1.2x1.2", q: 20, dp: "B", by: 2, p: "อรุณี ประจำสุข", n: "วางลังสินค้า" },
  { d: -25, t: "09:00", a: "issue", ty: "FG", sz: "1.2x1.2", q: 20, dp: "S", by: 0, p: "ประยุทธ ขับดี", n: "เตรียมโหลดขึ้นรถ" },
  { d: -24, t: "15:00", a: "return", ty: "FG", sz: "1.2x1.2", q: 10, dp: "S", by: 2, p: "ประยุทธ ขับดี", n: "" },
  { d: -23, t: "08:40", a: "issue", ty: "PK", sz: "1.2x1.2", q: 25, dp: "P", by: 0, p: "วิชัย ทำดี", n: "ไลน์ผลิต 2" },
  { d: -22, t: "10:30", a: "return", ty: "RM", sz: "1.2x1.2", q: 15, dp: "R", by: 0, p: "สมพร ใจเย็น", n: "" },
  { d: -21, t: "09:15", a: "issue", ty: "FG", sz: "1.1x1.1", q: 15, dp: "S", by: 0, p: "ประยุทธ ขับดี", n: "" },
  { d: -20, t: "08:20", a: "damage", ty: "RM", sz: "1.2x1.2", q: 4, by: 0, n: "ไม้แผ่นบนแตก 2 แผ่น จากงาโฟล์คลิฟต์", tk: "A" },
  { d: -19, t: "09:00", a: "repair_start", tk: "A", by: 3 },
  { d: -18, t: "11:00", a: "issue", ty: "RM", sz: "1.2x1.2", q: 20, dp: "P", by: 2, p: "วิชัย ทำดี", n: "" },
  { d: -17, t: "14:30", a: "return", ty: "PK", sz: "1.1x1.1", q: 12, dp: "B", by: 2, p: "อรุณี ประจำสุข", n: "" },
  { d: -16, t: "15:30", a: "repair_done", tk: "A", by: 3, n: "เปลี่ยนไม้แผ่นบน 2 แผ่น ตอกตะปูใหม่" },
  { d: -15, t: "10:10", a: "return", ty: "FG", sz: "1.2x1.2", q: 3, dp: "S", bad: true, by: 0, p: "ประยุทธ ขับดี", n: "ขาพาเลทหัก ตกจากรถขนส่ง", tk: "B" },
  { d: -14, t: "09:30", a: "repair_start", tk: "B", by: 3 },
  { d: -13, t: "16:00", a: "scrap", tk: "B", by: 1, n: "เสียหายหนัก ไม่คุ้มค่าซ่อม" },
  { d: -12, t: "08:45", a: "receive", ty: "RM", sz: "1.2x1.2", q: 30, by: 1, n: "รับพาเลทเพิ่ม รองรับวัตถุดิบล็อตใหม่" },
  { d: -12, t: "13:20", a: "issue", ty: "FG", sz: "1.2x1.2", q: 25, dp: "W", by: 2, p: "ธีรวัฒน์ สายสุวรรณ", n: "" },
  { d: -11, t: "09:50", a: "damage", ty: "PK", sz: "1.1x1.1", q: 2, by: 0, n: "ตะปูโผล่ เสี่ยงทำถุงบรรจุขาด", tk: "J" },
  { d: -11, t: "14:00", a: "issue", ty: "PK", sz: "1.1x1.1", q: 20, dp: "B", by: 2, p: "อรุณี ประจำสุข", n: "" },
  { d: -10, t: "09:00", a: "repair_start", tk: "J", by: 3 },
  { d: -10, t: "13:10", a: "damage", ty: "PK", sz: "1.1x1.1", q: 2, by: 0, n: "ไม้รองแตกร้าว", tk: "C" },
  { d: -9, t: "10:00", a: "repair_start", tk: "C", by: 3 },
  { d: -9, t: "14:40", a: "return", ty: "RM", sz: "1.2x1.2", q: 10, dp: "P", by: 2, p: "วิชัย ทำดี", n: "" },
  { d: -8, t: "08:30", a: "damage", ty: "PK", sz: "1.2x1.2", q: 1, by: 0, n: "พาเลทบิดงอ ใช้งานไม่ได้", tk: "G" },
  { d: -8, t: "11:00", a: "issue", ty: "FG", sz: "1.1x1.1", q: 4, dp: "Q", by: 0, p: "ศิริพร ตรวจดี", n: "ใช้วางสินค้ารอตรวจสอบ" },
  { d: -7, t: "09:20", a: "issue", ty: "RM", sz: "1.2x1.2", q: 15, dp: "P", by: 0, p: "วิชัย ทำดี", n: "" },
  { d: -7, t: "16:20", a: "repair_done", tk: "C", by: 3, n: "เปลี่ยนไม้รอง 1 ท่อน" },
  { d: -6, t: "10:40", a: "return", ty: "RM", sz: "1.2x1.2", q: 5, dp: "P", bad: true, by: 0, p: "วิชัย ทำดี", n: "ไม้แผ่นล่างหัก โดนงาโฟล์คลิฟต์", tk: "D" },
  { d: -6, t: "15:00", a: "scrap", tk: "G", by: 1, n: "ผุและบิดงอ" },
  { d: -5, t: "09:00", a: "repair_start", tk: "D", by: 3 },
  { d: -5, t: "11:30", a: "receive", ty: "FG", sz: "1.2x1.2", q: 20, by: 1, n: "รับพาเลทเพิ่ม" },
  { d: -5, t: "14:00", a: "issue", ty: "FG", sz: "1.2x1.2", q: 18, dp: "S", by: 2, p: "ประยุทธ ขับดี", n: "" },
  { d: -4, t: "08:50", a: "damage", ty: "FG", sz: "1.2x1.2", q: 3, by: 0, n: "ไม้แผ่นบนหลุด", tk: "I" },
  { d: -4, t: "13:30", a: "return", ty: "PL", sz: "1.2x1.2", q: 8, dp: "B", by: 2, p: "อรุณี ประจำสุข", n: "" },
  { d: -4, t: "15:10", a: "issue", ty: "PK", sz: "1.2x1.2", q: 10, dp: "B", by: 2, p: "อรุณี ประจำสุข", n: "" },
  { d: -3, t: "09:00", a: "repair_start", tk: "I", by: 3 },
  { d: -3, t: "10:15", a: "damage", ty: "PL", sz: "1.2x1.2", q: 3, by: 0, n: "พาเลทพลาสติกร้าวที่มุม", tk: "E" },
  { d: -3, t: "14:20", a: "issue", ty: "PL", sz: "1.2x1.2", q: 6, dp: "E", by: 2, p: "มานพ รักษ์โลก", n: "ใช้วางถังคัดแยกขยะ" },
  { d: -2, t: "09:30", a: "return", ty: "FG", sz: "1.1x1.1", q: 2, dp: "S", bad: true, by: 0, p: "ประยุทธ ขับดี", n: "ขาพาเลทแตก", tk: "F" },
  { d: -2, t: "11:00", a: "issue", ty: "RM", sz: "1.2x1.2", q: 18, dp: "R", by: 0, p: "สมพร ใจเย็น", n: "" },
  { d: -2, t: "15:45", a: "return", ty: "FG", sz: "1.2x1.2", q: 12, dp: "W", by: 2, p: "ธีรวัฒน์ สายสุวรรณ", n: "" },
  { d: -1, t: "08:40", a: "issue", ty: "PK", sz: "1.1x1.1", q: 15, dp: "B", by: 0, p: "อรุณี ประจำสุข", n: "" },
  { d: -1, t: "10:20", a: "scrap", tk: "J", by: 1, n: "ซ่อมแล้วไม่ผ่านการตรวจสอบ" },
  { d: -1, t: "13:00", a: "return", ty: "PK", sz: "1.2x1.2", q: 8, dp: "P", by: 2, p: "วิชัย ทำดี", n: "" },
  { d: -1, t: "15:30", a: "issue", ty: "RM", sz: "1.2x1.2", q: 3, dp: "M", by: 2, p: "เกรียงไกร ช่างกล", n: "ใช้รองอะไหล่เครื่องจักร" },
  { ago: 280, a: "receive", ty: "PL", sz: "1.2x1.2", q: 20, by: 1, n: "รับพาเลทพลาสติกเพิ่ม" },
  { ago: 250, a: "issue", ty: "RM", sz: "1.2x1.2", q: 20, dp: "P", by: 0, p: "วิชัย ทำดี", n: "ไลน์ผลิต 1" },
  { ago: 220, a: "issue", ty: "FG", sz: "1.2x1.2", q: 15, dp: "S", by: 0, p: "ประยุทธ ขับดี", n: "" },
  { ago: 190, a: "damage", ty: "RM", sz: "1.2x1.2", q: 2, by: 0, n: "ไม้แผ่นบนแตกร้าว", tk: "H" },
  { ago: 160, a: "return", ty: "FG", sz: "1.2x1.2", q: 6, dp: "S", by: 0, p: "ประยุทธ ขับดี", n: "" },
  { ago: 130, a: "issue", ty: "PK", sz: "1.1x1.1", q: 10, dp: "B", by: 2, p: "อรุณี ประจำสุข", n: "" },
  { ago: 100, a: "repair_done", tk: "I", by: 3, n: "ตอกไม้แผ่นบนใหม่" },
  { ago: 70, a: "return", ty: "RM", sz: "1.2x1.2", q: 8, dp: "R", by: 2, p: "สมพร ใจเย็น", n: "" },
  { ago: 40, a: "issue", ty: "PL", sz: "1.2x1.2", q: 10, dp: "B", by: 2, p: "อรุณี ประจำสุข", n: "" },
  { ago: 15, a: "issue", ty: "FG", sz: "1.1x1.1", q: 5, dp: "W", by: 2, p: "ธีรวัฒน์ สายสุวรรณ", n: "" }
];

/* ===================== owner functions (run from the editor) ===================== */

/** Run ONCE after pasting the files: spreadsheet + password + sample data + hourly trigger. */
function setupDemo() {
  var setup = setupSystem();
  var props = PropertiesService.getScriptProperties();
  props.setProperty(RESET_PASSWORD_PROPERTY, DEMO_ADMIN_PASSWORD);
  props.deleteProperty(TEAMS_WEBHOOK_PROPERTY); // never used by the demo
  var reset = resetDemoNow();
  var trigger = installDemoTrigger_();
  var result = {
    company: DEMO_COMPANY,
    spreadsheetUrl: setup.spreadsheetUrl,
    demoPassword: DEMO_ADMIN_PASSWORD,
    seeded: reset.seeded,
    trigger: trigger,
    demo: demoInfo_()
  };
  console.log(JSON.stringify(result));
  return result;
}

/** Hourly trigger: re-seeds when DEMO_RESET_HOURS have passed since DEMO_LAST_RESET. */
function demoAutoReset() {
  var last = Date.parse(PropertiesService.getScriptProperties().getProperty(DEMO_LAST_RESET_PROPERTY) || "");
  var due = isNaN(last) ? 0 : demoDueMs_(last);
  if (Date.now() >= due) {
    var r = resetDemoNow();
    console.log("[DEMO] auto reset done: " + JSON.stringify(r.seeded));
    return { reset: true, seeded: r.seeded, demo: demoInfo_() };
  }
  console.log("[DEMO] auto reset skipped: next reset " + demoInfo_().nextReset);
  return { reset: false, demo: demoInfo_() };
}

/** Manual reset to the sample data (also used by setupDemo / demoAutoReset). */
function resetDemoNow() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    resetRequest_(DEMO_SYSTEM_ACTOR);
    var res = seedDemoData_();
    audit_("setting", "รีเซ็ตข้อมูล", "รีเซ็ตข้อมูลระบบทดลอง (Demo) อัตโนมัติ กลับเป็นค่าเริ่มต้น (" + res.counts.movements +
      " รายการเคลื่อนไหว, " + res.counts.repairs + " ใบแจ้งซ่อม)");
    flush_();
    markDemoReset_();
    return { reset: true, seeded: res.counts, removed: res.removed };
  } finally {
    REQ_ = null;
    lock.releaseLock();
  }
}

/* ===================== seed ===================== */

/*
 * Wipes every data sheet (pallet_types, departments, repairs, movements,
 * audit_logs; header rows kept) and writes the sample data. Works inside the
 * current request (REQ_, e.g. reset_data under the script lock) or, when no
 * request is active, as its own request that is flushed at the end.
 * Returns { removed: {sheet: rows}, counts: {movements, repairs, ...} }.
 * This app stores no files in Drive, so there is nothing else to clean up.
 */
function seedDemoData_() {
  var own = !REQ_;
  if (own) resetRequest_(DEMO_SYSTEM_ACTOR);
  var actor = REQ_.actor;
  var removed = {};
  try {
    TABLE_ORDER.forEach(function (name) {
      var sheet = db_().getSheetByName(name) || prepareSheet_(db_(), name, null);
      var n = Math.max(0, sheet.getLastRow() - 1);
      if (n > 0) sheet.getRange(2, 1, n, Math.max(sheet.getLastColumn(), SCHEMA[name].length)).clearContent();
      removed[name] = n;
      delete REQ_.tables[name];
      delete REQ_.appends[name];
      REQ_.dirty[name] = true;
    });
    REQ_.updates = [];
    REQ_.deletes = [];
    REQ_.teams = null;

    var base = Date.now();
    DEMO_NOW_MS_ = base - 29 * 86400000;
    SEED_TYPES.forEach(function (t) {
      insert_("pallet_types", { tkey: t[0], code: t[1], name: t[2], short: t[3], description: t[4], color: t[5], sizes: t[6], sort: t[7] });
    });
    SEED_DEPARTMENTS.forEach(function (d) {
      insert_("departments", { name: d[0], icon: d[1], color: d[2], active: 1 });
    });

    var types = {};
    table_("pallet_types").rows.forEach(function (t) { types[t.tkey] = t.id; });
    var tickets = {};
    demoSeedTimes_(base).forEach(function (e) {
      var ms = e.ms;
      var at = formatUtcParts_(new Date(ms + TZ_OFFSET_MS));
      DEMO_NOW_MS_ = ms + 60000; // recorded a minute after the moment it happened
      REQ_.actor = DEMO_ACTORS[e.by] || DEMO_SYSTEM_ACTOR;
      var input = { date: at.date, time: at.time, person: e.p || "", note: e.n || "" };
      var r;
      if (e.tk && (e.a === "repair_start" || e.a === "repair_done" || e.a === "scrap")) {
        var tk = tickets[e.tk];
        if (!tk) throw new Error("demo seed: unknown ticket " + e.tk);
        input.id = tk.id;
        input.ticket_no = tk.ticket_no;
        if (e.a === "repair_start") input.person = DEMO_ACTORS[e.by];
        if (e.a === "repair_done") input.person = "";
        r = handleWrite_(e.a, input);
      } else {
        input.type_id = types[e.ty];
        input.size = e.sz;
        input.qty = e.q;
        if (e.dp) input.department = DEMO_DEPTS[e.dp];
        if (e.a === "damage" || e.bad) { input.cause = e.n; input.note = ""; }
        if (e.a === "return") input.condition = e.bad ? "damaged" : "good";
        r = handleWrite_(e.a, input);
        if (e.tk) {
          var mv = null;
          table_("movements").rows.forEach(function (m) { if (m.id === r.id) mv = m; });
          tickets[e.tk] = getRepair_(mv.repair_id);
        }
      }
      REQ_.teams = null; // the seed never notifies
    });
  } finally {
    DEMO_NOW_MS_ = null;
    if (REQ_) REQ_.actor = actor;
  }
  var counts = {
    pallet_types: table_("pallet_types").rows.length,
    departments: table_("departments").rows.length,
    movements: table_("movements").rows.length,
    repairs: table_("repairs").rows.length,
    audit_logs: table_("audit_logs").rows.length
  };
  if (own) {
    flush_();
    REQ_ = null;
  }
  return { removed: removed, counts: counts };
}

// The plan with absolute times (ms, UTC epoch), relative to baseMs (= now).
// "d/t" entries are anchored on the Bangkok calendar day of baseMs - 7 h, so
// a reset made before 07:00 never puts yesterday's fixed times after the
// "ago" entries of today. Entries are returned in time order.
function demoSeedTimes_(baseMs) {
  var anchor = formatUtcParts_(new Date(baseMs + TZ_OFFSET_MS - 7 * 3600000)).date;
  var anchorMs = parseDt_(anchor) - TZ_OFFSET_MS; // 00:00 Bangkok of the anchor day
  var list = DEMO_SEED_PLAN.map(function (e, i) {
    var ms;
    if (e.ago != null) {
      ms = baseMs - e.ago * 60000;
    } else {
      var hm = e.t.split(":");
      ms = anchorMs + e.d * 86400000 + (Number(hm[0]) * 60 + Number(hm[1])) * 60000;
    }
    ms = Math.floor(ms / 60000) * 60000; // minute precision, like the forms
    var o = {};
    Object.keys(e).forEach(function (k) { o[k] = e[k]; });
    o.ms = ms;
    o.i = i;
    return o;
  });
  return list.sort(function (a, b) { return a.ms - b.ms || a.i - b.i; });
}

/* ===================== slim demo: locked (full version) features ===================== */

// true when the API must refuse this action in the demo (see DEMO_LOCKED_ACTIONS).
function demoLockedAction_(action, input) {
  if (!DEMO_LOCK_PREMIUM) return false;
  if (DEMO_LOCKED_ACTIONS.indexOf(action) !== -1) return true;
  // รับคืนสภาพชำรุด opens a repair ticket (the repair workflow is full version only)
  return action === "return" && !!input && input.condition === "damaged";
}

// Called first by doGet / doPost: {ok:false, error: DEMO_LOCKED_MESSAGE, code: "DEMO_LOCKED"}.
function assertDemoUnlocked_(action, input) {
  if (demoLockedAction_(action, input)) fail_(DEMO_LOCKED_MESSAGE, "DEMO_LOCKED");
}

/* ===================== schedule ===================== */

function markDemoReset_() {
  PropertiesService.getScriptProperties().setProperty(DEMO_LAST_RESET_PROPERTY, new Date(Date.now()).toISOString());
}

// Moment the data is due for a re-seed after a reset at lastMs (the hourly
// trigger run at or after it does the reset, i.e. 5-6 hours after lastMs).
function demoDueMs_(lastMs) {
  return lastMs + DEMO_RESET_HOURS * 3600000;
}

// { lastReset, nextReset (ISO, lastReset + DEMO_RESET_HOURS), intervalHours, ... }
function demoInfo_() {
  var raw = "";
  try { raw = PropertiesService.getScriptProperties().getProperty(DEMO_LAST_RESET_PROPERTY) || ""; } catch (ignored) {}
  var last = Date.parse(raw);
  return {
    demo: true,
    company: DEMO_COMPANY,
    intervalHours: DEMO_RESET_HOURS,
    lastReset: isNaN(last) ? null : new Date(last).toISOString(),
    nextReset: isNaN(last) ? null : new Date(demoDueMs_(last)).toISOString()
  };
}

// Exactly one hourly trigger for demoAutoReset (older ones for it are removed).
function installDemoTrigger_() {
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === DEMO_TRIGGER_HANDLER) { ScriptApp.deleteTrigger(t); removed++; }
  });
  ScriptApp.newTrigger(DEMO_TRIGGER_HANDLER).timeBased().everyHours(DEMO_TRIGGER_EVERY_HOURS).create();
  return { handler: DEMO_TRIGGER_HANDLER, everyHours: DEMO_TRIGGER_EVERY_HOURS, removedOld: removed };
}

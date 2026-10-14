// URL ของ Google Apps Script Web App (ลงท้ายด้วย /exec) — ใส่หลัง Deploy แล้ว (แทนที่ PASTE_DEPLOYED_EXEC_URL_HERE)
window.PALLET_CONFIG = { apiUrl: "https://script.google.com/macros/s/AKfycbzQlT0UIvibo-qMsvLpofcXH78a6VXV5JUgIrjnKHN5Z5Qtpni8dCuZE-vOUzJzG_9GTg/exec" };
// ข้อความติดต่อที่แสดงในแถบ Demo ด้านบนทุกหน้า — แก้ไขได้ที่นี่ที่เดียว
window.DEMO_CONTACT = "สนใจใช้งานจริง ติดต่อ: Fastwork / LINE: (ใส่ภายหลัง)";
// ทดลองใช้ 5 ชั่วโมงต่อผู้เข้าชม (นับตาม IP + อุปกรณ์) — gateUrl = URL /exec ของโปรเจกต์ Apps Script "Trial Gate"
// (แทนที่ PASTE_TRIAL_GATE_URL_HERE; ถ้ายังไม่ใส่หรือเชื่อมต่อไม่ได้ เว็บยังใช้งานได้ตามปกติ)
window.DEMO_TRIAL = {
  gateUrl: 'https://script.google.com/macros/s/AKfycbwQzhsI1OIN-YUumWLE0n1150c9hTPC--Npm19k44AIDjneJfn2SFXnTYxsW9OGbO0/exec',
  app: 'pallet',
  hours: 5,
  contact: window.DEMO_CONTACT,
  priceHtml: 'สิทธิ์ใช้งานรายปี 4,900 บาท/ปี · ขายขาด 12,900 บาท (5 บัญชีผู้ใช้)'
};

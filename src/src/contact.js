// Thông tin liên hệ THT – Trụ sở chính TP.HCM và Chi nhánh Đà Nẵng luôn hiển thị ngang nhau.
export const OFFICES = [
  { key: "hcm", vi: "Trụ sở chính TP.HCM", short: "TP.HCM", phone: "(+84) 28 3517 8796", email: "tht@thtaudit.com.vn", addr: "25 Hoàng Hoa Thám, P. Gia Định, TP.HCM" },
  { key: "dn", vi: "Chi nhánh Đà Nẵng", short: "Đà Nẵng", phone: "(+84) 901 144 078", email: "danang@thtaudit.com.vn", addr: "312 Lê Đại Hành, P. Cẩm Lệ, Đà Nẵng" },
];
const [HCM, DN] = OFFICES;

// Chân bài Facebook (gọn, 2 dòng ngang nhau)
export const FB_FOOTER = [
  `📍 ${HCM.short}: ☎ ${HCM.phone} · ✉ ${HCM.email}`,
  `📍 ${DN.short}: ☎ ${DN.phone} · ✉ ${DN.email}`,
].join("\n");

const CONTACT_LINE = /(0901|3517|8796|144\s?078|tht@thtaudit|danang@thtaudit|📞|📧|☎|✉|hotline|THT sẵn sàng|sẵn sàng hỗ trợ|quét (mã )?QR|quét QR)/i;

// Bỏ mọi dòng liên hệ/lời mời do AI tự viết, chèn chân liên hệ chuẩn trước dòng hashtag.
export function withFbFooter(caption) {
  const lines = String(caption || "").split("\n").filter((l) => !CONTACT_LINE.test(l));
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  let tags = [];
  while (lines.length && /^\s*(#\S+\s*)+$/.test(lines[lines.length - 1])) tags.unshift(lines.pop());
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return [lines.join("\n"), "", FB_FOOTER, ...(tags.length ? ["", ...tags] : [])].join("\n").trim();
}

// Bài Facebook song ngữ: phần tiếng Việt → "🇬🇧 English below" → bản tiếng Anh → liên hệ → hashtag.
// Giữ facebook_caption chỉ là tiếng Việt; ghép tại lúc xem trước / đăng để không bị lặp khi dựng lại.
const EN_MARK = /english below/i;
const splitTags = (text) => {
  const lines = String(text || "").split("\n").filter((l) => !CONTACT_LINE.test(l) && !EN_MARK.test(l));
  const tags = [];
  const trim = () => { while (lines.length && !lines[lines.length - 1].trim()) lines.pop(); };
  trim();
  while (lines.length && /^\s*(#\S+\s*)+$/.test(lines[lines.length - 1])) tags.unshift(lines.pop());
  trim();
  return { body: lines.join("\n").trim(), tags };
};
export function fbCaption(content, env = {}) {
  const vi = splitTags(content?.facebook_caption);
  const enText = content?.en?.facebook_caption;
  const bilingual = enText && !content?.bilingual_off && env.BILINGUAL !== "0";
  const en = bilingual ? splitTags(enText) : null;
  const sh = content?.share;
  const credit = sh?.url ? ["", sh.source ? `🎬 Xem video gốc của ${sh.source}: ${sh.url}` : `🎬 Xem video gốc: ${sh.url}`] : [];
  return [vi.body, ...credit, ...(en && en.body ? ["", "🇬🇧 English below", "", en.body] : []), "", FB_FOOTER, ...(vi.tags.length ? ["", ...vi.tags] : [])].join("\n").trim();
}

// Câu liên hệ cuối thư tư vấn (4 ngôn ngữ), hai văn phòng ngang nhau
export const LETTER_CLOSING = {
  vi: `Mọi thắc mắc, Quý khách vui lòng liên hệ THT – ${HCM.vi}: ${HCM.phone} · ${HCM.email}; ${DN.vi}: ${DN.phone} · ${DN.email}.`,
  en: `For any questions, please contact THT – Head Office (Ho Chi Minh City): ${HCM.phone} · ${HCM.email}; Da Nang Branch: ${DN.phone} · ${DN.email}.`,
  zh_hans: `如有任何疑问，请联系 THT——胡志明市总部：${HCM.phone} · ${HCM.email}；岘港分公司：${DN.phone} · ${DN.email}。`,
  zh_hant: `如有任何疑問，請聯繫 THT——胡志明市總部：${HCM.phone} · ${HCM.email}；峴港分公司：${DN.phone} · ${DN.email}。`,
};

'use strict';
// Builds one PDF in this order: generated annual circular, legacy uploaded PDF,
// then additional attachments (oldest upload first). Never modifies source PDFs.
const MAX_PDFS = 60;
const MAX_INPUT_BYTES = 150 * 1024 * 1024;
const MAX_PAGES = 2500;

async function mergeCircularAndAttachments(circularBytes, attachments = [], pdfLib) {
  const { PDFDocument } = pdfLib || require('pdf-lib');
  if (!Array.isArray(attachments)) throw new Error('รูปแบบรายการเอกสารแนบไม่ถูกต้อง');
  if (attachments.length > MAX_PDFS) throw new Error(`แนบเอกสารได้สูงสุด ${MAX_PDFS} ไฟล์ต่อฉบับ`);
  const main = Buffer.from(circularBytes || []);
  if (main.subarray(0, 5).toString() !== '%PDF-') throw new Error('เอกสารเวียนหลักไม่ใช่ PDF');
  if (!attachments.length) return {bytes: main, attachmentCount: 0};
  const inputSize = attachments.reduce((sum, item) => sum + (item.file_data?.length || 0), main.length);
  if (inputSize > MAX_INPUT_BYTES) throw new Error('เอกสารเวียนและไฟล์แนบมีขนาดรวมเกิน 150 MB');
  const combined = await PDFDocument.create();
  let count = 0;
  for (const [index, item] of [{file_name:'เอกสารเวียนหลัก', file_data:main}, ...attachments].entries()) {
    const label = String(item.file_name || `เอกสารแนบ ${index}`).slice(0, 150);
    const bytes = Buffer.from(item.file_data || []);
    if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error(`ไฟล์ ${label} ไม่ใช่ PDF ที่ถูกต้อง`);
    let original;
    try { original = await PDFDocument.load(bytes); }
    catch (error) { throw new Error(`ไม่สามารถรวมไฟล์ “${label}” ได้ กรุณาตรวจสอบว่า PDF ไม่เสียหายหรือมีการเข้ารหัส (${error.message || error})`); }
    const n = original.getPageCount();
    if (n < 1) throw new Error(`ไฟล์ “${label}” ไม่มีหน้ากระดาษ`);
    count += n;
    if (count > MAX_PAGES) throw new Error(`เอกสารรวมเกิน ${MAX_PAGES} หน้า`);
    const pages = await combined.copyPages(original, original.getPageIndices());
    for (const page of pages) combined.addPage(page);
  }
  return {bytes: Buffer.from(await combined.save()), attachmentCount: attachments.length, pageCount: count};
}
module.exports = {mergeCircularAndAttachments};

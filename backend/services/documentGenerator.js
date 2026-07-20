// Document generation service — builds the 4 core PDF documents from deal data
// using PDFKit. Generated files are written to /generated-docs and the path is
// returned so the caller (dealController / SignNow service) can upload them.
//
// DOC-001: Transaction & Escrow Agreement (seller + buyer sign)
// DOC-002: Limited Power of Attorney (seller only)
// DOC-003: Broker Referral Agreement (broker + ClearDrive, only if referral partner)
// DOC-009: Buyer Payment Instruction (informational, no signature)

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { formatDubai } = require('../utils/timezone');

const OUTPUT_DIR = path.join(__dirname, '..', 'generated-docs');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const COMPANY = {
  name: process.env.COMPANY_NAME || 'LUXE F.Z.E (trading as ClearDrive)',
  registration: process.env.COMPANY_REGISTRATION || 'Ajman Free Zone Reg. 47522',
  signatory: process.env.COMPANY_SIGNATORY || 'Gerard Peters, Founder & Director',
  email: process.env.COMPANY_EMAIL || 'info@cleardriveuae.com',
  phone: process.env.COMPANY_PHONE || '+971 50 174 1090',
  website: process.env.COMPANY_WEBSITE || 'cleardriveuae.com',
  iban: process.env.COMPANY_IBAN || 'AE590330000019101875219',
  accountName: process.env.COMPANY_ACCOUNT_NAME || 'LUXE FZE',
  bank: process.env.COMPANY_BANK || 'Mashreq Bank',
  escrowPartner: process.env.ESCROW_PARTNER_NAME || 'TrustIn Financial Technologies LLC (ADGM Regulated, FSRA Licensed)',
};

const NAVY = '#0D2A4A';
const GOLD = '#C9A84C';
const MUTED = '#64748B';

// ---------- shared layout helpers ----------

function newDoc() {
  return new PDFDocument({ size: 'A4', margin: 50 });
}

function drawHeader(doc, title, ref) {
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(20).text('ClearDrive', { continued: false });
  doc.fillColor(MUTED).font('Helvetica').fontSize(9).text("UAE's Vehicle Escrow Service");
  doc.moveDown(0.5);
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(14).text(title);
  doc.fillColor(MUTED).font('Helvetica').fontSize(10).text(`Deal Reference: ${ref}`);
  doc.moveDown(1);
  doc.strokeColor(GOLD).lineWidth(1.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(1);
  doc.fillColor('#1E293B');
}

function sectionTitle(doc, text) {
  doc.moveDown(0.8);
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(12).text(text);
  doc.fillColor('#1E293B').font('Helvetica').fontSize(10);
  doc.moveDown(0.3);
}

function kv(doc, label, value) {
  doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text(label, { continued: true });
  doc.font('Helvetica').fontSize(10).fillColor('#1E293B').text(`  ${value ?? '-'}`);
}

function paragraph(doc, text) {
  doc.font('Helvetica').fontSize(10).fillColor('#1E293B').text(text, { align: 'left' });
  doc.moveDown(0.5);
}

function footer(doc, generatedRef) {
  doc.moveDown(2);
  doc.strokeColor('#E8E2D3').lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(0.5);
  doc.fontSize(8).fillColor(MUTED).text(
    `${COMPANY.name} — ${COMPANY.registration} — ${COMPANY.email} — ${COMPANY.phone} — ${COMPANY.website}`,
    { align: 'center' }
  );
  doc.fontSize(8).fillColor(MUTED).text(`Generated ${formatDubai(new Date())} (Asia/Dubai) — ${generatedRef}`, { align: 'center' });
}

function saveAndFinish(doc, filename) {
  return new Promise((resolve, reject) => {
    const filePath = path.join(OUTPUT_DIR, filename);
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    doc.end();
    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
}

// ---------- DOC-001: Transaction & Escrow Agreement ----------

/**
 * @param {object} deal - full deal row joined with seller/buyer user data
 * @param {object} seller - user row
 * @param {object} buyer - user row
 * @returns {Promise<string>} generated PDF file path
 */
async function generateDoc001(deal, seller, buyer) {
  const doc = newDoc();
  drawHeader(doc, 'Transaction & Escrow Agreement (DOC-001)', deal.ref);

  sectionTitle(doc, '1. Parties');
  kv(doc, 'SELLER', `${seller?.full_name || '-'} — EID ${seller?.emirates_id || '-'} — ${seller?.phone || '-'}`);
  kv(doc, 'BUYER', `${buyer?.full_name || '-'} — EID ${buyer?.emirates_id || '-'} — ${buyer?.phone || '-'}`);
  kv(doc, 'ESCROW AGENT', COMPANY.escrowPartner);
  kv(doc, 'FACILITATOR', `${COMPANY.name} (${COMPANY.registration})`);

  sectionTitle(doc, '2. Vehicle Details');
  kv(doc, 'Plate', deal.plate);
  kv(doc, 'Make / Model / Year', `${deal.make || '-'} ${deal.model || '-'} ${deal.year || '-'}`);
  kv(doc, 'Colour', deal.colour);
  kv(doc, 'VIN', deal.vin);
  kv(doc, 'Emirate', deal.emirate);
  kv(doc, 'Mileage', deal.mileage ? `${deal.mileage} km` : '-');

  sectionTitle(doc, '3. Financial Breakdown (AED)');
  kv(doc, 'Sale Price', formatAed(deal.sale_price));
  if (deal.product === 'loanclear') {
    kv(doc, 'Outstanding Loan Balance', formatAed(deal.loan_amount));
    kv(doc, 'Loan Bank', deal.loan_bank);
  }
  kv(doc, 'Traffic Fines (RTA verified)', formatAed(deal.fines_amount));
  kv(doc, 'ClearDrive Fee', formatAed(deal.cd_fee));
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(GOLD).text(`Net Proceeds to Seller: ${formatAed(deal.net_proceeds)}`);
  doc.fillColor('#1E293B');

  sectionTitle(doc, '4. Fund Release Sequence');
  paragraph(doc,
    `1. Buyer transfers full sale price of ${formatAed(deal.sale_price)} to the escrow IBAN provided by ${COMPANY.escrowPartner}.\n` +
    `2. Upon confirmed receipt of funds, the Escrow Agent simultaneously settles the outstanding loan balance with ${deal.loan_bank || 'the lending bank'} ` +
    `(LoanClear deals only) and any outstanding RTA traffic fines on the vehicle.\n` +
    `3. Once the loan is cleared and any mortgage/finance interest is released by the bank, the parties attend RTA Tasjeel to complete ` +
    `ownership transfer within 48 hours of clearance.\n` +
    `4. Upon confirmation of a completed RTA ownership transfer (transfer certificate uploaded), the Escrow Agent releases the Net Proceeds ` +
    `to the Seller's nominated account, less the ClearDrive Fee which is deducted automatically at source.`
  );

  sectionTitle(doc, '5. Seller Obligations and Warranties');
  paragraph(doc,
    'The Seller warrants that: (a) they are the true and lawful registered owner of the vehicle described above, or the duly authorised representative ' +
    'thereof; (b) the vehicle is free of any undisclosed liens, mortgages or third-party claims other than the loan balance disclosed above; ' +
    '(c) all information provided regarding outstanding traffic fines has been verified via the RTA Dubai application and is accurate as of the date of upload; ' +
    '(d) the Seller shall cooperate fully and promptly with all steps required to complete the transfer, including attendance at RTA Tasjeel within the ' +
    'timeframe specified above.'
  );

  sectionTitle(doc, '6. Buyer Acknowledgements');
  paragraph(doc,
    'The Buyer acknowledges that: (a) funds must be transferred only to the exact escrow IBAN and reference provided in the Buyer Payment Instruction ' +
    '(DOC-009); (b) ClearDrive and the Escrow Agent bear no liability for funds sent to any other account; (c) the Buyer has independently inspected ' +
    'the vehicle, or waives the right to further inspection, prior to authorising this Agreement; (d) ownership transfer will only be effected once ' +
    'funds have cleared into the escrow account.'
  );

  sectionTitle(doc, '7. Default');
  paragraph(doc,
    'Should either party fail to fulfil their obligations under this Agreement within a reasonable timeframe (not exceeding 14 calendar days from the ' +
    'relevant trigger event, absent documented cause), the non-defaulting party may elect to terminate this Agreement, in which case escrowed funds ' +
    '(if any) shall be returned to the Buyer, less any costs already irrevocably incurred (e.g. fines already paid to RTA).'
  );

  sectionTitle(doc, '8. Governing Law');
  paragraph(doc, 'This Agreement is governed by the laws of the United Arab Emirates and subject to the exclusive jurisdiction of the Dubai Courts.');

  sectionTitle(doc, 'Signatures');
  doc.moveDown(2);
  doc.text('_____________________________', 50, doc.y);
  doc.text(`Seller: ${seller?.full_name || ''}      Date: __________`, 50, doc.y + 5);
  doc.moveDown(2);
  doc.text('_____________________________', 50, doc.y);
  doc.text(`Buyer: ${buyer?.full_name || ''}      Date: __________`, 50, doc.y + 5);

  footer(doc, 'DOC-001');
  return saveAndFinish(doc, `${deal.ref}_DOC-001_Transaction-Escrow-Agreement.pdf`);
}

// ---------- DOC-002: Limited Power of Attorney ----------

async function generateDoc002(deal, seller) {
  const doc = newDoc();
  drawHeader(doc, 'Limited Power of Attorney (DOC-002)', deal.ref);

  sectionTitle(doc, 'Grantor');
  kv(doc, 'Name', seller?.full_name);
  kv(doc, 'Emirates ID', seller?.emirates_id);
  kv(doc, 'Nationality', seller?.nationality);
  kv(doc, 'Phone', seller?.phone);

  sectionTitle(doc, 'Grantee');
  kv(doc, 'Company', `${COMPANY.name} (${COMPANY.registration})`);
  kv(doc, 'Signatory', COMPANY.signatory);

  sectionTitle(doc, 'Vehicle');
  kv(doc, 'Plate', deal.plate);
  kv(doc, 'VIN', deal.vin);
  kv(doc, 'Make / Model / Year', `${deal.make || '-'} ${deal.model || '-'} ${deal.year || '-'}`);

  sectionTitle(doc, 'Scope of Authority');
  paragraph(doc,
    `The Grantor hereby grants ${COMPANY.name} limited authority, solely in connection with Deal Reference ${deal.ref}, to act on the Grantor's ` +
    'behalf for the following purposes only:'
  );
  const powers = [
    `Obtain the loan settlement figure from ${deal.loan_bank || 'the financing bank'} in respect of the above vehicle.`,
    `Instruct ${COMPANY.escrowPartner} to pay the outstanding loan balance directly to ${deal.loan_bank || 'the financing bank'} from escrowed funds.`,
    `Collect the No Objection Certificate (NOC) / mortgage release letter from ${deal.loan_bank || 'the financing bank'} upon settlement.`,
    `Instruct ${COMPANY.escrowPartner} to pay any outstanding RTA traffic fines on the vehicle from escrowed funds.`,
    `Deduct the agreed ClearDrive Fee (${formatAed(deal.cd_fee)}) from the escrow balance prior to release of Net Proceeds.`,
    'Coordinate directly with the RTA to remove the mortgage/finance interest recorded against the vehicle following loan settlement.',
  ];
  powers.forEach((p, i) => paragraph(doc, `${i + 1}. ${p}`));

  paragraph(doc,
    'This Power of Attorney is strictly limited to the six (6) purposes listed above, is valid only for the duration of Deal Reference ' +
    `${deal.ref}, and does not grant any authority to sell, transfer, or otherwise dispose of the vehicle on the Grantor's behalf.`
  );

  sectionTitle(doc, 'Signature');
  doc.moveDown(2);
  doc.text('_____________________________', 50, doc.y);
  doc.text(`Grantor (Seller): ${seller?.full_name || ''}      Date: __________`, 50, doc.y + 5);

  footer(doc, 'DOC-002');
  return saveAndFinish(doc, `${deal.ref}_DOC-002_Limited-Power-of-Attorney.pdf`);
}

// ---------- DOC-003: Broker Referral Agreement ----------

async function generateDoc003(deal, partner) {
  const doc = newDoc();
  drawHeader(doc, 'Broker Referral Agreement (DOC-003)', deal.ref);

  sectionTitle(doc, 'Parties');
  kv(doc, 'Referral Partner', `${partner?.name || '-'} (${partner?.company || '-'})`);
  kv(doc, 'Partner Type', partner?.type);
  kv(doc, 'Phone / Email', `${partner?.phone || '-'} / ${partner?.email || '-'}`);
  kv(doc, 'ClearDrive', `${COMPANY.name} (${COMPANY.registration})`);

  sectionTitle(doc, 'Deal Reference');
  kv(doc, 'Deal Ref', deal.ref);
  kv(doc, 'Vehicle', `${deal.make || '-'} ${deal.model || '-'} ${deal.year || '-'} — Plate ${deal.plate || '-'}`);

  sectionTitle(doc, 'Referral Fee');
  kv(doc, 'Fee Amount', formatAed(deal.referral_fee));
  paragraph(doc, 'Payment Terms: the Referral Fee shall be paid to the Partner within 5 (five) business days of Deal completion, ' +
    'to the bank account on file with ClearDrive.');

  sectionTitle(doc, 'Confidentiality');
  paragraph(doc,
    'Both parties agree to keep all commercial and personal data relating to this Deal confidential and to use it solely for the purposes ' +
    'of completing the referral and associated payment.'
  );

  sectionTitle(doc, 'Signatures');
  doc.moveDown(2);
  doc.text('_____________________________', 50, doc.y);
  doc.text(`Partner: ${partner?.name || ''}      Date: __________`, 50, doc.y + 5);
  doc.moveDown(2);
  doc.text('_____________________________', 50, doc.y);
  doc.text(`ClearDrive: ${COMPANY.signatory}      Date: __________`, 50, doc.y + 5);

  footer(doc, 'DOC-003');
  return saveAndFinish(doc, `${deal.ref}_DOC-003_Broker-Referral-Agreement.pdf`);
}

// ---------- DOC-009: Buyer Payment Instruction ----------

async function generateDoc009(deal) {
  const doc = newDoc();
  drawHeader(doc, 'Buyer Payment Instruction (DOC-009)', deal.ref);

  sectionTitle(doc, 'Transfer Details');
  doc.font('Helvetica-Bold').fontSize(11).fillColor(GOLD).text(`Amount to Transfer: ${formatAed(deal.sale_price)}`);
  doc.fillColor('#1E293B');
  doc.moveDown(0.3);
  kv(doc, 'Escrow IBAN', deal.trustin_escrow_iban || 'PENDING — will be issued once escrow is set up');
  kv(doc, 'Escrow Agent', COMPANY.escrowPartner);
  kv(doc, 'Reference (mandatory)', `${deal.ref} — ${deal.seller_acc_name || 'Seller'}`);
  kv(doc, 'Deadline', '24 hours from receipt of this instruction');

  sectionTitle(doc, 'Important');
  paragraph(doc, `⚠ Only send funds to the exact IBAN above. ClearDrive and ${COMPANY.escrowPartner} are not liable for funds sent to any other account.`);
  paragraph(doc, 'Ensure the reference exactly matches the format shown above so your payment can be matched to your deal automatically.');

  sectionTitle(doc, 'What Happens Next');
  paragraph(doc,
    '1. Once your transfer is received and confirmed by the Escrow Agent, both parties are notified instantly via WhatsApp.\n' +
    '2. The Escrow Agent settles the seller\'s outstanding loan balance (if applicable) and any RTA traffic fines directly.\n' +
    '3. Both parties attend RTA Tasjeel to complete the ownership transfer.\n' +
    '4. Once the transfer certificate is confirmed, the Net Proceeds are released to the Seller and this Deal is marked complete.'
  );

  footer(doc, 'DOC-009');
  return saveAndFinish(doc, `${deal.ref}_DOC-009_Buyer-Payment-Instruction.pdf`);
}

function formatAed(value) {
  if (value === null || value === undefined || isNaN(value)) return 'AED 0.00';
  return `AED ${Number(value).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

module.exports = {
  generateDoc001,
  generateDoc002,
  generateDoc003,
  generateDoc009,
  OUTPUT_DIR,
};

import { createClientFromRequest } from '../_shared/base44shim.ts';
import ExcelJS from 'npm:exceljs@4.4.0';
import { Buffer } from 'node:buffer';
import { consumeActionQuota } from '../_shared/rateLimits.ts';

const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B0F19' } };
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
const MONEY = '#,##0.00';
const PERCENT = '0.0%';

const STATUS_FILL = {
  VERIFIED: 'FFDCFCE7',
  PARTIALLY_VERIFIED: 'FFFEF3C7',
  ESTIMATED: 'FFFEF9C3',
  UNVERIFIED: 'FFFFE4E6',
  UNAVAILABLE: 'FFE2E8F0',
};

const clean = (value, max = 1200) =>
  typeof value === 'string' ? value.trim().slice(0, max) : value === 0 ? '0' : '';

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().replace('T', ' ').slice(0, 16);
};

function headerRow(sheet) {
  const row = sheet.getRow(1);
  row.height = 30;
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF94A3B8' } } };
  });
  row.commit();
}

function link(cell, url) {
  if (!url) {
    cell.value = 'Not available';
    cell.font = { color: { argb: 'FF94A3B8' }, italic: true };
    return;
  }
  cell.value = { text: url, hyperlink: url };
  cell.font = { color: { argb: 'FF0284C7' }, underline: true };
  cell.alignment = { wrapText: true, vertical: 'top' };
}

function statusCell(cell, status) {
  const value = status || 'UNAVAILABLE';
  cell.value = value;
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STATUS_FILL[value] || STATUS_FILL.UNAVAILABLE } };
  cell.font = { bold: true, color: { argb: 'FF0F172A' } };
  cell.alignment = { horizontal: 'center', vertical: 'top' };
}

function wrapBody(sheet, fromRow) {
  for (let r = fromRow; r <= sheet.rowCount; r += 1) {
    sheet.getRow(r).eachCell((cell) => {
      if (!cell.alignment) cell.alignment = { wrapText: true, vertical: 'top' };
      else cell.alignment = { ...cell.alignment, wrapText: true, vertical: 'top' };
    });
    sheet.getRow(r).commit();
  }
}

/* ------------------------------------------ trusted-host image fetch ---- */
/*
 * Product image URLs live inside report data that the owning user can edit, so
 * they are never fetched from arbitrary hosts. Only the platform's own storage
 * hosts are accepted; any other URL is skipped and the row keeps its text data.
 * Redirects are refused outright, so an allowed host cannot bounce the request
 * somewhere else.
 */

const TRUSTED_IMAGE_HOSTS = new Set(['media.base44.com', 'static.wixstatic.com']);
const MAX_IMAGE_BYTES = 2000000;

function trustedImageTarget(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim() || rawUrl.length > 2048) return null;
  let url;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.port) return null;
  if (!TRUSTED_IMAGE_HOSTS.has(url.hostname.toLowerCase())) return null;
  return url.toString();
}

async function fetchImage(rawUrl) {
  const target = trustedImageTarget(rawUrl);
  if (!target) {
    console.warn('exportResearchXlsx: image host not allowed, skipped', String(rawUrl).slice(0, 120));
    return null;
  }
  try {
    const response = await fetch(target, { signal: AbortSignal.timeout(8000), redirect: 'error' });
    if (!response.ok) return null;
    const type = (response.headers.get('content-type') || '').toLowerCase();
    const extension = type.includes('png') ? 'png' : type.includes('jpeg') || type.includes('jpg') ? 'jpeg' : null;
    if (!extension) return null;
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > MAX_IMAGE_BYTES) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) return null;
    return { buffer: Buffer.from(bytes), extension };
  } catch {
    return null;
  }
}

async function buildWorkbook(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Hazel · Coinexa.net';
  workbook.created = new Date();

  const products = Array.isArray(report.products) ? report.products : [];
  const currency = report.assumptions?.currency || 'EGP';

  /* ---------------------------------------------- 1. Product Overview ---- */
  const overview = workbook.addWorksheet('Product Overview', { views: [{ state: 'frozen', ySplit: 1 }] });
  overview.columns = [
    { header: '#', key: 'index', width: 5 },
    { header: 'Product', key: 'product', width: 34 },
    { header: 'Supplier', key: 'supplier', width: 14 },
    { header: 'Supplier product URL (verified)', key: 'url', width: 44 },
    { header: `Supplier price (${currency})`, key: 'price', width: 14 },
    { header: 'Price status', key: 'priceStatus', width: 18 },
    { header: 'Stock', key: 'stock', width: 14 },
    { header: 'Price / stock verified at', key: 'verified', width: 20 },
    { header: `Selling price (${currency})`, key: 'selling', width: 14 },
    { header: `Net profit (${currency})`, key: 'net', width: 14 },
    { header: 'Margin', key: 'margin', width: 10 },
    { header: 'Score', key: 'score', width: 9 },
    { header: 'Score status', key: 'scoreStatus', width: 16 },
    { header: 'Confidence', key: 'confidence', width: 18 },
    { header: 'Final recommendation', key: 'recommendation', width: 60 },
    { header: 'Image', key: 'image', width: 16 },
  ];
  headerRow(overview);

  products.forEach((product, index) => {
    const row = overview.addRow({
      index: index + 1,
      product: product.name,
      supplier: product.supplier_name || 'Unknown',
      price: product.supplier_price ?? null,
      stock: product.stock_status || 'unknown',
      verified: formatDate(product.verified_at),
      selling: product.selling_price ?? null,
      net: product.profit?.net_profit ?? null,
      margin: product.profit?.margin_percent != null ? product.profit.margin_percent / 100 : null,
      score: product.score?.total ?? null,
      confidence: product.confidence || 'UNAVAILABLE',
      recommendation: product.recommendation || '',
    });
    link(row.getCell('url'), product.supplier_url);
    statusCell(row.getCell('priceStatus'), product.supplier_price_status);
    statusCell(row.getCell('scoreStatus'), product.score?.complete ? 'VERIFIED' : 'PARTIALLY_VERIFIED');
    statusCell(row.getCell('confidence'), product.confidence);
    row.getCell('price').numFmt = MONEY;
    row.getCell('selling').numFmt = MONEY;
    row.getCell('net').numFmt = MONEY;
    row.getCell('margin').numFmt = PERCENT;
    row.height = 76;
    row.commit();
  });

  if (!products.length) {
    overview.addRow({
      product: 'No product met the verification standard for this request.',
      recommendation: (report.limitations || []).join(' · ').slice(0, 900),
    });
  }
  wrapBody(overview, 2);

  /* ------------------------------------------- 2. Supplier Comparison ---- */
  const supplierSheet = workbook.addWorksheet('Supplier Comparison', { views: [{ state: 'frozen', ySplit: 1 }] });
  supplierSheet.columns = [
    { header: 'Product', key: 'product', width: 34 },
    { header: 'Supplier platform', key: 'supplier', width: 16 },
    { header: 'Product URL', key: 'url', width: 46 },
    { header: `Price (${currency})`, key: 'price', width: 14 },
    { header: 'Price status', key: 'priceStatus', width: 18 },
    { header: 'Stock', key: 'stock', width: 14 },
    { header: 'Shipping information', key: 'shipping', width: 30 },
    { header: 'Link check', key: 'link', width: 40 },
    { header: 'Verified at', key: 'verified', width: 20 },
  ];
  headerRow(supplierSheet);
  products.forEach((product) => {
    const row = supplierSheet.addRow({
      product: product.name,
      supplier: product.supplier_name || 'Unknown',
      price: product.supplier_price ?? null,
      stock: product.stock_status || 'unknown',
      shipping: product.shipping_note || 'Not provided',
      link: product.supplier_url_reason || '',
      verified: formatDate(product.verified_at),
    });
    link(row.getCell('url'), product.supplier_url);
    statusCell(row.getCell('priceStatus'), product.supplier_price_status);
    row.getCell('price').numFmt = MONEY;
    row.commit();
  });
  if (!products.length) supplierSheet.addRow({ product: 'No verified supplier listing found.' });
  wrapBody(supplierSheet, 2);

  /* ------------------------------------ 3. Egyptian Competitor Analysis ---- */
  const competitorSheet = workbook.addWorksheet('Egyptian Competitor Analysis', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  competitorSheet.columns = [
    { header: 'Product', key: 'product', width: 30 },
    { header: 'Competitor', key: 'competitor', width: 24 },
    { header: 'Competitor product URL', key: 'url', width: 44 },
    { header: `Competitor price (${currency})`, key: 'competitorPrice', width: 16 },
    { header: `Supplier price (${currency})`, key: 'supplierPrice', width: 16 },
    { header: 'Difference', key: 'difference', width: 14 },
    { header: 'Competitor markup over supplier', key: 'markup', width: 20 },
    { header: 'Notes', key: 'note', width: 32 },
  ];
  headerRow(competitorSheet);
  products.forEach((product) => {
    (product.competitors || []).forEach((competitor) => {
      const row = competitorSheet.addRow({
        product: product.name,
        competitor: competitor.name,
        competitorPrice: competitor.price ?? null,
        supplierPrice: product.supplier_price ?? null,
        note: competitor.note || '',
      });
      link(row.getCell('url'), competitor.url);
      row.getCell('competitorPrice').numFmt = MONEY;
      row.getCell('supplierPrice').numFmt = MONEY;
      row.getCell('difference').value = { formula: `IF(D${row.number}="","",D${row.number}-E${row.number})` };
      row.getCell('difference').numFmt = MONEY;
      row.getCell('markup').value = {
        formula: `IF(OR(D${row.number}="",E${row.number}="",E${row.number}=0),"",D${row.number}/E${row.number}-1)`,
      };
      row.getCell('markup').numFmt = PERCENT;
      row.commit();
    });
  });
  if (!competitorSheet.rowCount) competitorSheet.addRow({ product: 'No Egyptian competitor listings were observed.' });
  wrapBody(competitorSheet, 2);

  /* ------------------------------------------- 4. Profit Calculations ---- */
  const profitSheet = workbook.addWorksheet('Profit Calculations', { views: [{ state: 'frozen', ySplit: 1 }] });
  profitSheet.columns = [
    { header: 'Product', key: 'product', width: 30 },
    { header: `Selling price (${currency})`, key: 'selling', width: 15 },
    { header: `Supplier cost (${currency})`, key: 'cost', width: 15 },
    { header: 'Shipping', key: 'shipping', width: 12 },
    { header: 'Advertising', key: 'ads', width: 12 },
    { header: 'Payment fees', key: 'fee', width: 13 },
    { header: 'Packaging', key: 'packaging', width: 12 },
    { header: 'Expected returns', key: 'returns', width: 14 },
    { header: 'Other', key: 'other', width: 11 },
    { header: 'Total expenses', key: 'totalExpenses', width: 15 },
    { header: 'Gross profit', key: 'gross', width: 14 },
    { header: 'Net profit', key: 'net', width: 14 },
    { header: 'Margin', key: 'margin', width: 10 },
    { header: 'Break-even price', key: 'breakEven', width: 15 },
    { header: 'Profit status', key: 'status', width: 18 },
    { header: 'What is assumed', key: 'notes', width: 52 },
  ];
  headerRow(profitSheet);
  products.forEach((product) => {
    const profit = product.profit || {};
    const expense = (key) => profit.expenses?.find((item) => item.key === key)?.amount ?? 0;
    const row = profitSheet.addRow({
      product: product.name,
      selling: profit.selling_price ?? null,
      cost: profit.supplier_cost ?? null,
      shipping: expense('shipping_cost'),
      ads: expense('advertising_cost'),
      fee: expense('payment_fee'),
      packaging: expense('packaging_cost'),
      returns: expense('expected_return_cost'),
      other: expense('other_cost'),
      breakEven: profit.break_even_price ?? null,
    });
    const r = row.number;
    row.getCell('totalExpenses').value = { formula: `SUM(D${r}:I${r})` };
    row.getCell('gross').value = { formula: `B${r}-C${r}` };
    row.getCell('net').value = { formula: `K${r}-J${r}` };
    row.getCell('margin').value = { formula: `IF(B${r}=0,"",L${r}/B${r})` };
    row.getCell('margin').numFmt = PERCENT;
    for (const key of ['selling', 'cost', 'shipping', 'ads', 'fee', 'packaging', 'returns', 'other', 'totalExpenses', 'gross', 'net', 'breakEven']) {
      row.getCell(key).numFmt = MONEY;
    }
    statusCell(row.getCell('status'), profit.status);
    row.getCell('notes').value = (profit.notes || []).join(' ');
    row.commit();
  });
  if (!products.length) profitSheet.addRow({ product: 'Nothing to calculate.' });
  wrapBody(profitSheet, 2);

  /* ------------------------------------- 5. Demand & Market Research ---- */
  const demandSheet = workbook.addWorksheet('Demand & Market Research', { views: [{ state: 'frozen', ySplit: 1 }] });
  demandSheet.columns = [
    { header: 'Product', key: 'product', width: 30 },
    { header: 'Customer problem', key: 'pain', width: 38 },
    { header: 'Target audience', key: 'audience', width: 26 },
    { header: 'Demand signals observed', key: 'signals', width: 46 },
    { header: 'Saturation', key: 'saturation', width: 30 },
    { header: 'Differentiation angle', key: 'differentiation', width: 30 },
    { header: 'Advantages', key: 'advantages', width: 28 },
    { header: 'Disadvantages', key: 'disadvantages', width: 28 },
    { header: 'Missing information', key: 'missing', width: 32 },
    { header: 'Score verdict', key: 'verdict', width: 44 },
  ];
  headerRow(demandSheet);
  products.forEach((product) => {
    const row = demandSheet.addRow({
      product: product.name,
      pain: product.pain_point || 'Not established',
      audience: product.target_audience || 'Not established',
      signals: (product.demand_evidence || [])
        .map((item) => `${item.statement}${item.source_url ? ` (${item.source_url})` : ' (no source)'}`)
        .join(' • '),
      saturation: product.saturation || 'Not established',
      differentiation: product.differentiation || 'Not established',
      advantages: (product.advantages || []).join(' • ') || 'None identified',
      disadvantages: (product.disadvantages || []).join(' • ') || 'None identified',
      missing: (product.missing_information || []).join(' • ') || 'None',
      verdict: product.score?.verdict || '',
    });
    row.commit();
  });
  if (!products.length) demandSheet.addRow({ product: 'No demand evidence was collected.' });
  wrapBody(demandSheet, 2);

  /* ------------------------------------ 6. Evidence & Source Links ----- */
  const evidenceSheet = workbook.addWorksheet('Evidence & Source Links');
  evidenceSheet.columns = [
    { header: 'Label', key: 'label', width: 48 },
    { header: 'URL', key: 'url', width: 62 },
    { header: 'Kind', key: 'kind', width: 18 },
    { header: 'Used for', key: 'usedFor', width: 34 },
  ];
  evidenceSheet.addRow(['Research report', report.query]);
  evidenceSheet.addRow(['Market', report.market || 'Egypt']);
  evidenceSheet.addRow(['Suppliers in scope', (report.suppliers || []).join(', ')]);
  evidenceSheet.addRow(['Researched at', formatDate(report.researched_at)]);
  evidenceSheet.addRow(['Report id', report.id]);
  evidenceSheet.addRow(['Overall confidence', report.overall_confidence || 'UNAVAILABLE']);
  evidenceSheet.addRow(['Expense assumptions', JSON.stringify(report.assumptions || {})]);
  evidenceSheet.addRow([]);
  const tableStart = evidenceSheet.rowCount + 1;
  evidenceSheet.addRow(['Label', 'URL', 'Kind', 'Used for']);
  const tableHeader = evidenceSheet.getRow(tableStart);
  tableHeader.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
  });

  (report.sources || []).forEach((source) => {
    const row = evidenceSheet.addRow({ label: source.label, kind: source.kind || 'source', usedFor: 'Research source' });
    link(row.getCell('url'), source.url);
    row.commit();
  });
  products.forEach((product) => {
    if (product.supplier_url) {
      const row = evidenceSheet.addRow({ label: `${product.name} — supplier page`, kind: 'supplier', usedFor: product.supplier_name || 'Supplier' });
      link(row.getCell('url'), product.supplier_url);
      row.commit();
    }
    (product.competitors || []).forEach((competitor) => {
      const row = evidenceSheet.addRow({ label: `${product.name} — ${competitor.name}`, kind: 'competitor', usedFor: 'Competitor price' });
      link(row.getCell('url'), competitor.url);
      row.commit();
    });
    (product.demand_evidence || []).forEach((item) => {
      const row = evidenceSheet.addRow({ label: `${product.name} — demand signal`, kind: 'demand', usedFor: item.statement.slice(0, 120) });
      link(row.getCell('url'), item.source_url);
      row.commit();
    });
  });
  if (report.limitations?.length) {
    evidenceSheet.addRow([]);
    evidenceSheet.addRow(['Limitations stated by the research']);
    report.limitations.forEach((item) => evidenceSheet.addRow(['', item]));
  }
  wrapBody(evidenceSheet, 1);

  /* ----------------------------------------------------- product images --- */
  await Promise.all(
    products.slice(0, 5).map(async (product, index) => {
      if (!product.image_url) return;
      const image = await fetchImage(product.image_url);
      if (!image) return;
      try {
        const imageId = workbook.addImage({ buffer: image.buffer, extension: image.extension });
        overview.addImage(imageId, { tl: { col: 15.1, row: index + 1.05 }, ext: { width: 88, height: 88 } });
      } catch {
        /* image support is best-effort, the row keeps its text data */
      }
    })
  );

  console.log(
    `exportResearchXlsx: built ${workbook.worksheets.length} sheets for ${products.length} product(s)`
  );
  return workbook.xlsx.writeBuffer();
}

export default async function (req) {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth
    .me()
    .catch((error) => (error.status === 401 ? null : Promise.reject(error)));
  if (!user) return Response.json({ error: 'Please sign in.' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const reportId = typeof body.report_id === 'string' ? body.report_id.trim() : '';
  if (!reportId) return Response.json({ error: 'report_id is required' }, { status: 400 });

  const report = await base44.entities.ResearchReport.get(reportId).catch((error) =>
    error.status === 404 || error.status === 403 ? null : Promise.reject(error)
  );
  if (!report) return Response.json({ error: 'Research report not found' }, { status: 404 });
  if (report.created_by_id !== user.id && user.role !== 'admin') {
    return Response.json({ error: 'You do not have access to this report.' }, { status: 403 });
  }

  // Building a workbook is cheap for one report and expensive in a loop, so the
  // export is capped per user. Checked after ownership, before any work starts.
  const quota = await consumeActionQuota({
    base44,
    user,
    kind: 'export_xlsx',
    organizationId: report.organization_id || '',
  });
  if (!quota.ok) return Response.json({ error: quota.message }, { status: 429 });

  try {
    const buffer = await buildWorkbook(report);
    const slug = (report.query || 'research')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'research';
    const fileName = `hazel-research-${slug}-${new Date().toISOString().slice(0, 10)}.xlsx`;

    const file = new File([buffer], fileName, { type: MIME });
    const { file_uri } = await base44.asServiceRole.integrations.Core.UploadPrivateFile({ file });
    if (!file_uri) throw new Error('The workbook was built but could not be stored.');

    const { signed_url } = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
      file_uri,
      expires_in: 3600,
    });

    await base44.entities.ResearchReport.update(report.id, {
      xlsx_file_uri: file_uri,
      xlsx_generated_at: new Date().toISOString(),
    });

    return Response.json({ file_uri, signed_url, file_name: fileName });
  } catch (error) {
    console.error('exportResearchXlsx failed', error);
    return Response.json(
      { error: error?.message || 'The Excel file could not be generated.' },
      { status: 502 }
    );
  }
}
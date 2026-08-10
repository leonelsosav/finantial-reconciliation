import { createWorker, PSM } from 'tesseract.js';
import { PredictionService } from './prediction.service';

export interface OcrParsedTransaction {
  id: string;
  date: string;
  description: string;
  reference: string;
  amount: number;
  lowConfidence: boolean;
  client_id: string;
}

export type BankType = 'BBVA' | 'Banorte' | 'Inbursa' | 'STP' | 'Convenia';

interface RawTx {
  date: string;
  description: string;
  reference: string;
  amount: number;
  lowConfidence: boolean;
}

// ── Utilities ──────────────────────────────────────────────────────────────

// Matches Mexican-peso amounts tolerantly: the "$" is frequently dropped by
// OCR on low-resolution screenshots, and the decimal point is sometimes
// misread as another separator (comma or hyphen). parseMXN() below is what
// actually makes sense of whichever separators survive.
// The trailing (?!:) rejects HH:MM-style time fragments (e.g. a mangled
// "...2026.10:28" timestamp) that would otherwise look exactly like money
// once "$" is optional — a real peso amount is never followed by a colon.
const MONEY_SRC = '\\$?\\s*((?:\\d{1,3}(?:[,.]\\d{3})+|\\d+)[.,\\-]\\d{2})(?!:)(?![0-9])';
const moneyRe = (flags = '') => new RegExp(MONEY_SRC, flags);

// Strips everything but digits and treats the final two as cents, so it
// doesn't matter whether OCR rendered the amount as "9,923.50", "15.500.00"
// (period used as thousands separator) or "21,297-60" (decimal point
// misread as a hyphen) — all three normalize to the correct peso value.
function parseMXN(raw: string): number {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 0) return 0;
  if (digits.length <= 2) return parseFloat(digits) || 0;
  return parseFloat(`${digits.slice(0, -2)}.${digits.slice(-2)}`) || 0;
}

// ── BBVA Parser ────────────────────────────────────────────────────────────
// Columns: Día | Concepto / Referencia | Cargo | Abono | Saldo
// A row has EITHER a Cargo (debit) OR an Abono (credit), never both.
// Debit keywords: ENVIADO, RETIRO, PAGO DE NOMINA
// Credit keywords: RECIBIDO, ABONO
// This crop of the statement never shows a month/year anywhere (only the
// bare "Día" column), so month/year fall back to the current date.
// OCR's line ordering within a row isn't reliable — the "Día" digit can land
// either before or after the wrapped Concepto text — so blocks are anchored
// on the one thing that's stable: the "SPEI RECIBIDO/ENVIADO" text itself.

function parseBBVA(text: string): RawTx[] {
  const results: RawTx[] = [];

  const headerDateM = text.match(/\b(\d{1,2})\/(\d{2})\/(\d{4})\b/);
  const today = new Date();
  const month = headerDateM?.[2] ?? String(today.getMonth() + 1).padStart(2, '0');
  const year  = headerDateM?.[3] ?? String(today.getFullYear());

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Group lines into transaction blocks. A new block starts on any line
  // containing "SPEI RECIBIDO"/"SPEI ENVIADO".
  const blocks: string[] = [];
  let cur: string | null = null;

  for (const line of lines) {
    if (/SPEI\s+(RECIBIDO|ENVIADO)/i.test(line)) {
      if (cur) blocks.push(cur);
      cur = line;
    } else if (cur) {
      cur += ' ' + line;
    }
  }
  if (cur) blocks.push(cur);

  for (const blockText of blocks) {
    const amounts = [...blockText.matchAll(moneyRe('g'))].map(m => parseMXN(m[1]));
    if (amounts.length === 0) continue;

    const txAmount = amounts[0]; // first amount = transaction; second (if any) = running saldo

    // Description: strip all dollar amounts (Cargo/Abono/Saldo), keeping
    // any concept text that OCR placed around them.
    const description = blockText
      .replace(moneyRe('g'), '')
      .replace(/\s+/g, ' ')
      .trim();

    const isDebit = /ENVIADO|RETIRO|PAGO\s+DE\s+NOMINA/i.test(description);
    const amount  = isDebit ? -txAmount : txAmount;

    // Reference: slash-separated SPEI codes, e.g. "BANAMEX/0130637377"
    const refM = description.match(/([A-Z]+\/\d+)/i);
    const reference = refM?.[0] ?? '';

    // Día column value: a 1–2 digit number immediately followed by the long
    // numeric tail of the SPEI tracking code (e.g. "09 0090726SERVICIO...").
    const dayM = blockText.match(/\b(\d{1,2})\s+\d{6,8}\D/);
    const day = (dayM?.[1] ?? String(today.getDate())).padStart(2, '0');

    results.push({
      date: `${day}/${month}/${year}`,
      description: description.substring(0, 100),
      reference,
      amount,
      lowConfidence: !refM,
    });
  }

  return results;
}

// ── Banorte Parser ─────────────────────────────────────────────────────────
// Columns: CUENTA | FECHA DE OPERACION | FECHA | REFERENCIA | DESCRIPCION |
//          COD.TRANSAC | SUCURSAL | DEPOSITOS | RETIROS | SALDO |
//          MOVIMIENTO | DESCRIPCION DETALLADA
// DEPOSITOS/RETIROS are mutually exclusive per row, like BBVA's Cargo/Abono.
// The RETIROS placeholder "-" for a deposit row is read inconsistently by
// OCR (sometimes present, sometimes dropped entirely), so it isn't a
// reliable sign signal, so direction is read from "SPEI RECIBIDO"/"SPEI
// ENVIADO" in DESCRIPCION DETALLADA instead — the same wording BBVA and
// Inbursa already use for the same purpose.
// OCR can also read the wrapped DESCRIPCION DETALLADA text before the
// numeric row instead of after it, so rows are grouped by contiguous
// non-header, non-summary lines rather than a fixed "next line" lookahead.

function parseBanorte(text: string): RawTx[] {
  const results: RawTx[] = [];
  const rawLines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const isHeaderOrSummary = (l: string) =>
    l.includes('|') || /^(?:DEP[ÓO]SITOS|OPERACIONES|TOTAL)\b/i.test(l);

  const blocks: string[] = [];
  let cur: string[] = [];
  for (const line of rawLines) {
    if (isHeaderOrSummary(line)) {
      if (cur.length) blocks.push(cur.join(' '));
      cur = [];
    } else {
      cur.push(line);
    }
  }
  if (cur.length) blocks.push(cur.join(' '));

  for (const combined of blocks) {
    const dateM = combined.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
    if (!dateM) continue;
    const date = dateM[1];

    const amounts = [...combined.matchAll(moneyRe('g'))].map(m => parseMXN(m[1]));
    if (amounts.length === 0) continue;

    // First dollar figure in the row is always DEPOSITOS or RETIROS
    // (whichever is populated); the second is SALDO.
    const isCredit = /SPEI\s+RECIBIDO/i.test(combined);
    const isDebit = /SPEI\s+ENVIADO/i.test(combined);
    const amount = isDebit ? -Math.abs(amounts[0]) : Math.abs(amounts[0]);

    // Prefer DESCRIPCION DETALLADA (the SPEI block within the row)
    const speiM = combined.match(/SPEI\s+(?:RECIBIDO|ENVIADO)[^$]*/i);
    const description = speiM
      ? speiM[0].trim().replace(/\s+/g, ' ').substring(0, 100)
      : combined.replace(moneyRe('g'), '').replace(/\s+/g, ' ').substring(0, 80);

    // Prefer the CVE RAST / clave de rastreo (long alphanumeric token from
    // DESCRIPCION DETALLADA, e.g. "036INBU09072026284693567") over the plain
    // REFERENCIA column, which is frequently all zeros and not unique.
    const claveM = combined.match(/\b([A-Z0-9]{15,})\b/);
    const refM = combined.match(/\b(\d{8,})\b/);
    const reference = claveM?.[1] ?? refM?.[1] ?? '';

    results.push({ date, description, reference, amount, lowConfidence: !isCredit && !isDebit });
  }

  return results;
}

// ── Inbursa Parser ─────────────────────────────────────────────────────────
// Columns: Fecha | No. Referencia | Movimiento | Cargo | Abono | Saldo |
//          Ordenante | Cheque | Clave de Rastreo | Causa de Devolución
// Skip "SALDO INICIAL" rows.
// DEPOSITO SPEI → Abono (positive); RETIRO/CARGO → negative.

function parseInbursa(text: string): RawTx[] {
  const results: RawTx[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const dateM = line.match(/^(\d{2}\/\d{2}\/\d{4})/);
    if (!dateM) continue;
    if (/SALDO\s+INICIAL/i.test(line)) continue;

    const date = dateM[1];
    // Combine up to 2 following lines to capture Ordenante / Clave de Rastreo —
    // but stop at the next row's date line. Rows aren't reliably separated by
    // a blank line once empty lines are filtered out, so without this bound
    // the window can swallow the next transaction's Clave de Rastreo too.
    const windowLines = [line];
    for (let j = i + 1; j <= i + 2 && j < lines.length; j++) {
      if (/^\d{2}\/\d{2}\/\d{4}/.test(lines[j])) break;
      windowLines.push(lines[j]);
    }
    const combined = windowLines.join(' ');

    const allAmounts = [...combined.matchAll(moneyRe('g'))].map(m => parseMXN(m[1]));
    if (allAmounts.length === 0) continue;

    const isCredit = /DEPOSITO\s+SPEI|TRANSFERENCIA\s+RECIBIDA/i.test(combined);
    const isDebit  = /RETIRO\s+SPEI|CARGO|PAGO\s+DE\s+NOMINA/i.test(combined);
    let amount = allAmounts[0];
    if (isDebit) amount = -amount;

    // Build description from Movimiento + Ordenante
    const movM       = combined.match(/(?:DEPOSITO SPEI|RETIRO SPEI|TRANSFERENCIA[^\d$]*)/i);
    const ordenanteM = combined.match(/([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑA-Z\s]+(?:SA DE CV|S\.A\. DE C\.V\.))[^\d$]*/i);
    const description = [movM?.[0].trim(), ordenanteM?.[0].trim()]
      .filter(Boolean)
      .join(' - ')
      .replace(/\s+/g, ' ')
      .substring(0, 100) || line.substring(0, 80);

    // No. Referencia (numeric after date)
    const noRefM = line.match(/\d{2}\/\d{2}\/\d{4}\s+(\d{7,})/);

    // Clave de Rastreo: long alphanumeric tracking key (≥15 chars)
    const claves = [...combined.matchAll(/\b([A-Z0-9]{15,})\b/g)].map(m => m[1]);
    const clave  = claves.length > 0 ? claves[claves.length - 1] : '';

    results.push({
      date,
      description,
      reference: clave || (noRefM?.[1] ?? ''),
      amount,
      lowConfidence: !isCredit && !isDebit,
    });
  }

  return results;
}

// ── STP Parser ─────────────────────────────────────────────────────────────
// Columns: Fecha | Tipo | Estatus | Tipo de pago | Referencia | Concepto |
//          Monto | Comisión | Depósito final | Movimiento en la cuenta | Saldo | Comprobante
// Fecha uses Spanish month names + time, e.g. "Julio 31, 2026. 14:52".
// Tipo is an explicit "Retiro" / "Abono" label — the only reliable sign signal.
// Concepto is free text (e.g. "PAGO", "PAGO ADMIN INMUEBLE...") and must NOT be
// used to infer direction: it can read "PAGO" on a credit (Abono) row too.

const SPANISH_MONTHS: Record<string, string> = {
  enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06',
  julio: '07', agosto: '08', septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12',
};

// The leading character of the "Fecha" column is often clipped by OCR (e.g.
// "Julio" reads as "ulio"), since it sits right at the screenshot's edge —
// so the first letter of each month name is matched optionally.
const STP_DATE_RE = new RegExp(
  `\\b(${Object.keys(SPANISH_MONTHS).map(m => `${m[0]}?${m.slice(1)}`).join('|')})\\s+(\\d{1,2}),?\\s*(\\d{4})`,
  'i'
);

function resolveSpanishMonth(raw: string): string | undefined {
  const lower = raw.toLowerCase();
  if (SPANISH_MONTHS[lower]) return SPANISH_MONTHS[lower];
  const key = Object.keys(SPANISH_MONTHS).find(m => m.endsWith(lower));
  return key ? SPANISH_MONTHS[key] : undefined;
}

function parseSTPAmount(raw: string): number {
  let s = raw.replace(/[\$\£\€\¥\s]/g, '');
  
  // Look for thousands separator followed by exactly 3 digits (e.g. 6,072000 or 16.168 80)
  const thousandsM = s.match(/([.,])(\d{3})/);
  if (thousandsM) {
    const separator = thousandsM[1];
    const sepIndex = s.indexOf(separator);
    const afterSeparator = s.substring(sepIndex + 1);
    const beforeDigits = s.substring(0, sepIndex).replace(/\D/g, '');
    const afterDigits = afterSeparator.replace(/\D/g, '');
    
    const mainPart = beforeDigits + afterDigits.substring(0, 3);
    let centsPart = afterDigits.substring(3);
    if (!centsPart) centsPart = '00';
    if (centsPart.length > 2) centsPart = centsPart.substring(0, 2);
    
    return parseFloat(`${mainPart}.${centsPart}`) || 0;
  }
  
  return parseMXN(s);
}

function parseSTP(text: string): RawTx[] {
  const results: RawTx[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const today = new Date();
  
  // Pre-scan document to locate a valid month name and year (default to current month/year)
  let detectedMonth = String(today.getMonth() + 1).padStart(2, '0');
  let detectedYear = String(today.getFullYear());
  
  const allDateMatches = [...text.matchAll(new RegExp(STP_DATE_RE.source, 'gi'))];
  for (const m of allDateMatches) {
    const resolved = resolveSpanishMonth(m[1]);
    if (resolved) {
      detectedMonth = resolved;
      const yr = m[3];
      detectedYear = (yr.startsWith('20') || yr === '2026') ? '2026' : yr;
      break;
    }
  }

  for (const line of lines) {
    const isRetiro = /\bRETIRO\b/i.test(line);
    const isAbono = /\bABONO\b/i.test(line);
    if ((!isRetiro && !isAbono) || !/SPEI/i.test(line)) continue;

    // Extract day number from the start of the line (first 20 chars)
    const dayM = line.substring(0, 20).match(/\b(\d{1,2})\b/);
    const day = dayM ? dayM[1].padStart(2, '0') : String(today.getDate()).padStart(2, '0');
    const date = `${day}/${detectedMonth}/${detectedYear}`;

    // Extract reference number following SPEI keyword
    const speiM = line.match(/SPEI\s+(\$?[A-Z0-9/]+)/i);
    let reference = '';
    let suffixStart = 0;
    if (speiM) {
      reference = speiM[1].replace('$', '');
      suffixStart = line.indexOf(speiM[0]) + speiM[0].length;
    } else {
      const fallbackRef = line.match(/SPEI\s+(\d+)/i);
      reference = fallbackRef?.[1] ?? '';
      suffixStart = fallbackRef ? line.indexOf(fallbackRef[0]) + fallbackRef[0].length : 0;
    }

    const suffix = suffixStart > 0 ? line.substring(suffixStart) : line;

    // Suffix starts after reference; locate first currency symbol
    const currencyIdx = suffix.search(/[\$\£\€\¥]/);
    if (currencyIdx === -1) continue;

    const slicedFromCurrency = suffix.substring(currencyIdx);

    // Extract the primary transaction amount (starts at this currency symbol)
    const amountM = slicedFromCurrency.match(/^[\$\£\€\¥]\s*([\d,.\-\s]+)/);
    if (!amountM) continue;

    const amountVal = parseSTPAmount(amountM[1]);
    const amount = isRetiro ? -Math.abs(amountVal) : Math.abs(amountVal);

    const conceptText = suffix.substring(0, currencyIdx).trim();
    const description = conceptText
      .replace(/\b(PACS|PEA|SPEI)\b/gi, '')
      .trim()
      .replace(/\s+/g, ' ')
      .substring(0, 100) || 'Transferencia STP';

    results.push({
      date,
      description,
      reference,
      amount,
      lowConfidence: !reference || !dayM,
    });
  }

  return results;
}

// ── Convenia Parser ────────────────────────────────────────────────────────
function parseConvenia(text: string): RawTx[] {
  const results: RawTx[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const dateM = line.match(/\b(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}|\d{2}-\d{2}-\d{4})\b/);
    if (!dateM) continue;

    const date = dateM[1];
    const combined = [line, lines[i + 1] ?? '', lines[i + 2] ?? ''].join(' ');

    const amounts = [...combined.matchAll(moneyRe('g'))].map(m => parseMXN(m[1]));
    if (amounts.length === 0) continue;

    let amount = amounts[0];
    
    const isCredit = /DEPOSITO|ABONO|INYECCION|INGRESO/i.test(combined);
    if (!isCredit) {
      amount = -Math.abs(amount);
    }

    const refM = combined.match(/\b(CONV-\d+|FOLIO-\d+|\b\d{6,12}\b)/i);
    const reference = refM?.[1] ?? '';

    const descM = combined.match(/(?:CONCEPTO|DESCRIPCION|PAGO|NOMINA|DISPERSION):\s*([^$]*)/i);
    let description = descM?.[1]?.trim() || '';
    if (!description) {
      description = combined.replace(moneyRe('g'), '').replace(date, '').replace(reference, '').trim().substring(0, 80);
    }

    results.push({
      date,
      description: description.replace(/\s+/g, ' ').substring(0, 100) || 'Transacción Convenia',
      reference,
      amount,
      lowConfidence: !refM,
    });
  }

  return results;
}

// ── Image preprocessing ───────────────────────────────────────────────────
// Bank-portal screenshots are frequently small crops (a few hundred px
// tall). Tesseract reads those very unreliably at native resolution — this
// is the main source of missed/garbled transactions, not the parsing
// regexes. Upscaling before recognition dramatically improves accuracy.

const TARGET_LONG_EDGE = 3600;
const MAX_UPSCALE = 5;

async function upscaleForOcr(file: File): Promise<HTMLCanvasElement> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('No se pudo cargar la imagen para procesarla.'));
      image.src = objectUrl;
    });

    const longEdge = Math.max(img.naturalWidth, img.naturalHeight);
    const scale = Math.min(MAX_UPSCALE, Math.max(1, TARGET_LONG_EDGE / longEdge));

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo preparar la imagen para OCR.');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // Grayscale + high contrast native filters make text significantly more readable for Tesseract
    ctx.filter = 'grayscale(100%) contrast(150%)';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    return canvas;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

// ── Main Service ───────────────────────────────────────────────────────────

export const OcrService = {
  async processScreenshot(
    file: File,
    onProgress?: (pct: number) => void,
    selectedBank?: string
  ): Promise<OcrParsedTransaction[]> {
    onProgress?.(5);

    if (!selectedBank || !['BBVA', 'Banorte', 'Inbursa', 'STP', 'Convenia'].includes(selectedBank)) {
      throw new Error('Banco no soportado o no seleccionado.');
    }

    const resolvedBank = selectedBank as BankType;

    const preprocessed = await upscaleForOcr(file);
    onProgress?.(8);

    const worker = await createWorker('spa', 1, {
      logger: (m: { status: string; progress: number }) => {
        if (m.status === 'recognizing text') {
          // Map Tesseract progress (0–1) to 10–80%
          onProgress?.(10 + Math.round(m.progress * 70));
        }
      },
    });

    let rawText: string;
    try {
      // Automatic page-segmentation is unstable across image sizes for
      // these table layouts (the same screenshot can go from cleanly
      // readable to garbled a few hundred px apart); forcing "single
      // column of variable-sized text" is far more consistent.
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_COLUMN });
      const { data } = await worker.recognize(preprocessed);
      rawText = data.text;
      console.log('[OcrService] Raw text:', rawText);
    } finally {
      await worker.terminate();
    }

    onProgress?.(85);

    const rawTxs: RawTx[] =
      resolvedBank === 'BBVA'     ? parseBBVA(rawText) :
      resolvedBank === 'Banorte'  ? parseBanorte(rawText) :
      resolvedBank === 'Inbursa'  ? parseInbursa(rawText) :
      resolvedBank === 'STP'      ? parseSTP(rawText) :
                                    parseConvenia(rawText);

    if (rawTxs.length === 0) {
      throw new Error(
        `No se encontraron transacciones para ${resolvedBank} en la imagen. Verifique que la captura muestre la tabla de movimientos.`
      );
    }

    onProgress?.(90);

    // Enrich with client predictions
    const enriched = await Promise.all(
      rawTxs.map(async (tx, idx) => {
        let client_id = '';
        try {
          const p = await PredictionService.predictClientFromDescription(tx.description, tx.amount);
          client_id = p?.client_id ?? '';
        } catch { /* leave empty on prediction failure */ }
        return { ...tx, id: String(idx + 1), client_id };
      })
    );

    onProgress?.(100);
    return enriched;
  },
};

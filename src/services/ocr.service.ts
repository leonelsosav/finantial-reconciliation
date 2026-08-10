import { createWorker } from 'tesseract.js';
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

type BankType = 'BBVA' | 'Banorte' | 'Inbursa' | 'STP' | 'Convenia';

interface RawTx {
  date: string;
  description: string;
  reference: string;
  amount: number;
  lowConfidence: boolean;
}

// ── Utilities ──────────────────────────────────────────────────────────────

function detectBank(text: string): BankType | null {
  const t = text.toUpperCase();

  // Primary logo text (may be missed if rendered as image)
  if (t.includes('BBVA')) return 'BBVA';
  if (t.includes('BANORTE') || t.includes('BANCO MERCANTIL DEL NORTE')) return 'Banorte';
  if (t.includes('INBURSA') || t.includes('BANCA EN LINEA EMPRESARIAL')) return 'Inbursa';
  if (t.includes('STP') || t.includes('SISTEMA DE TRANSFERENCIAS')) return 'STP';
  if (t.includes('CONVENIA')) return 'Convenia';

  // Fallback: page layout fingerprints unique to each bank
  // BBVA: distinctive page title + SPEI sender codes
  if (
    t.includes('CUENTA CON') ||
    t.includes('SIN CHEQUERA') ||
    t.includes('RECIBIDOBANAMEX') ||
    t.includes('RECIBIDOBBVA') ||
    (t.includes('CONCEPTO') && t.includes('REFERENCIA') && t.includes('ABONO') && t.includes('CARGO'))
  ) return 'BBVA';

  // Banorte: unique column headers
  if (
    t.includes('CUENTAS DE CHEQUES') ||
    t.includes('DESCRIPCION DETALLADA') ||
    t.includes('COD.TRANSAC') ||
    t.includes('RFC: BMN')
  ) return 'Banorte';

  // Inbursa: unique column headers and section labels
  if (
    t.includes('CLAVE DE RASTREO') ||
    t.includes('MOVIMIENTOS POR CUENTA') ||
    t.includes('CAUSA DE DEVOLUCION') ||
    t.includes('ORDENANTE') ||
    t.includes('NO. REFERENCIA')
  ) return 'Inbursa';

  return null;
}

function parseMXN(str: string): number {
  return parseFloat(str.replace(/[$,\s]/g, '')) || 0;
}

// ── BBVA Parser ────────────────────────────────────────────────────────────
// Columns: Día | Concepto / Referencia | Cargo | Abono | Saldo
// The page header shows the full date, e.g., "09/07/2026".
// Each transaction row starts with a 1–2 digit day number.
// A row has EITHER a Cargo (debit) OR an Abono (credit), never both.
// Debit keywords: ENVIADO, RETIRO, PAGO DE NOMINA
// Credit keywords: RECIBIDO, ABONO

function parseBBVA(text: string): RawTx[] {
  const results: RawTx[] = [];

  // Extract header month/year from first date in the document
  const headerDateM = text.match(/\b(\d{1,2})\/(\d{2})\/(\d{4})\b/);
  const month = headerDateM?.[2] ?? '01';
  const year  = headerDateM?.[3] ?? '2024';

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Group lines into transaction blocks.
  // A new block starts when a line begins with a day number (1–31)
  // followed immediately by a SPEI/ATM/RETIRO/PAGO/TRANSFERENCIA keyword.
  const blocks: { day: string; text: string }[] = [];
  let cur: { day: string; text: string } | null = null;

  for (const line of lines) {
    const m = line.match(/^(\d{1,2})\s+(SPEI|ATM|RETIRO|PAGO|TRANSF|CARGO|DEPOSITO|ABONO)/i);
    if (m && parseInt(m[1]) >= 1 && parseInt(m[1]) <= 31) {
      if (cur) blocks.push(cur);
      cur = { day: m[1].padStart(2, '0'), text: line };
    } else if (cur) {
      cur.text += ' ' + line;
    }
  }
  if (cur) blocks.push(cur);

  for (const { day, text: blockText } of blocks) {
    const amounts = [...blockText.matchAll(/\$\s*([\d,]+\.\d{2})/g)].map(m => parseMXN(m[1]));
    if (amounts.length === 0) continue;

    const txAmount = amounts[0]; // first amount = transaction; second (if any) = running saldo

    // Description: everything before the first '$', strip leading day number
    const description = blockText.split('$')[0].replace(/^\d{1,2}\s*/, '').trim().replace(/\s+/g, ' ');

    const isDebit = /ENVIADO|RETIRO|PAGO\s+DE\s+NOMINA/i.test(description);
    const amount  = isDebit ? -txAmount : txAmount;

    // Reference: slash-separated SPEI codes, e.g. "BANAMEX/0130637377"
    const refM = description.match(/([A-Z]+\/\d+)/i);
    const reference = refM?.[0] ?? '';

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
// Deposit rows:    "$22,000.00  -  $22,275.19"  → DEPOSITOS=$22k, RETIROS=0
// Withdrawal rows: "-  $X,XXX.XX  $X,XXX.XX"   → DEPOSITOS=0,  RETIROS=$X

function parseBanorte(text: string): RawTx[] {
  const results: RawTx[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const dateM = line.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
    if (!dateM) continue;

    // Skip header rows that have no amounts
    if (/^(?:FECHA|CUENTA|DEPOSITOS|RETIROS|SALDO)\b/i.test(line) && !/\$/.test(line)) continue;

    const date = dateM[1];
    const combined = line + ' ' + (lines[i + 1] ?? '');

    // Detect deposit: "$AMOUNT -" pattern (RETIROS column is a dash)
    const depositM = combined.match(/\$\s*([\d,]+\.\d{2})\s+[-–]\s+/);
    // Detect withdrawal: "- $AMOUNT" or "- $0.00" pattern
    const retiroM  = combined.match(/[-–]\s+\$([\d,]+\.\d{2})/);

    let amount: number;
    let lowConfidence = false;

    if (depositM) {
      amount = parseMXN(depositM[1]);
    } else {
      // Extract first dollar amount, then use keywords to determine sign
      const firstM = combined.match(/\$\s*([\d,]+\.\d{2})/);
      if (!firstM) continue;
      amount = parseMXN(firstM[1]);
      if (/RETIRO|ENVIADO|NOMINA|CARGO/i.test(combined)) amount = -amount;
      else if (!retiroM) lowConfidence = true;
    }

    // Prefer DESCRIPCION DETALLADA (the SPEI block at the end of the row)
    const speiM = combined.match(/SPEI\s+RECIBIDO[^$\d]*/i);
    const description = speiM
      ? speiM[0].trim().replace(/\s+/g, ' ').substring(0, 100)
      : combined.replace(/\$[\d,]+\.\d{2}/g, '').replace(/\s+/g, ' ').substring(0, 80);

    // REFERENCIA column: long numeric string before the amounts
    const refM = line.match(/\b(\d{8,})\b/);
    const reference = refM?.[1] ?? '';

    results.push({ date, description, reference, amount, lowConfidence });
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
    // Combine up to 2 following lines to capture Ordenante / Clave de Rastreo
    const combined = [line, lines[i + 1] ?? '', lines[i + 2] ?? ''].join(' ');

    const allAmounts = [...combined.matchAll(/\$([\d,]+\.\d{2})/g)].map(m => parseMXN(m[1]));
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
function parseSTP(text: string): RawTx[] {
  const results: RawTx[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const dateM = line.match(/\b(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}|\d{2}-\d{2}-\d{4})\b/);
    if (!dateM) continue;

    const date = dateM[1];
    const combined = [line, lines[i + 1] ?? '', lines[i + 2] ?? ''].join(' ');

    const amounts = [...combined.matchAll(/\$?\s*([\d,]+\.\d{2})/g)].map(m => parseMXN(m[1]));
    if (amounts.length === 0) continue;

    let amount = amounts[0];
    
    const isDebit = /RETIRO|EGRESO|CARGO|PAGO|ENVIADO|ENVIO|-[–\s]*\$/i.test(combined);
    if (isDebit) {
      amount = -Math.abs(amount);
    } else {
      amount = Math.abs(amount);
    }

    const refM = combined.match(/\b([A-Z0-9]{15,30})\b/);
    const reference = refM?.[1] ?? '';

    const descM = combined.match(/(?:CONCEPTO|DESCRIPCION|MOTIVO|REFERENCIA):\s*([^$]*)/i);
    let description = descM?.[1]?.trim() || '';
    if (!description) {
      description = combined.replace(/\$[\d,]+\.\d{2}/g, '').replace(date, '').replace(reference, '').trim().substring(0, 80);
    }

    results.push({
      date,
      description: description.replace(/\s+/g, ' ').substring(0, 100) || 'Transferencia STP',
      reference,
      amount,
      lowConfidence: !refM,
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

    const amounts = [...combined.matchAll(/\$?\s*([\d,]+\.\d{2})/g)].map(m => parseMXN(m[1]));
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
      description = combined.replace(/\$[\d,]+\.\d{2}/g, '').replace(date, '').replace(reference, '').trim().substring(0, 80);
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

// ── Main Service ───────────────────────────────────────────────────────────

export const OcrService = {
  async processScreenshot(
    file: File,
    onProgress?: (pct: number) => void,
    selectedBank?: string
  ): Promise<OcrParsedTransaction[]> {
    onProgress?.(5);

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
      const { data } = await worker.recognize(file);
      rawText = data.text;
    } finally {
      await worker.terminate();
    }

    onProgress?.(85);

    const resolvedBank = (selectedBank && ['BBVA', 'Banorte', 'Inbursa', 'STP', 'Convenia'].includes(selectedBank))
      ? (selectedBank as BankType)
      : detectBank(rawText);

    if (!resolvedBank) {
      const preview = rawText.replace(/\s+/g, ' ').substring(0, 300);
      console.warn('[OcrService] Could not detect bank. OCR preview:', preview);
      throw new Error(
        'No se pudo identificar el banco. Asegúrese de que la captura sea de BBVA, Banorte, STP, Convenia o Inbursa.'
      );
    }

    const rawTxs: RawTx[] =
      resolvedBank === 'BBVA'     ? parseBBVA(rawText) :
      resolvedBank === 'Banorte'  ? parseBanorte(rawText) :
      resolvedBank === 'Inbursa'  ? parseInbursa(rawText) :
      resolvedBank === 'STP'      ? parseSTP(rawText) :
                                    parseConvenia(rawText);

    if (rawTxs.length === 0) {
      throw new Error(
        `Se detectó ${resolvedBank} pero no se encontraron transacciones. Verifique que la captura muestre la tabla de movimientos.`
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

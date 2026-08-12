import { DateEngine } from '../utils/DateEngine';

export interface ParsedTransaction {
  id: string;
  date: string;
  description: string;
  reference: string;
  amount: number;
  lowConfidence: boolean;
}

export class StatementParserService {

  /**
   * Parse Banorte PDF text dump
   */
  public static parseBanorte(text: string): ParsedTransaction[] {
    const lines = text.split('\n');
    const transactions: ParsedTransaction[] = [];
    let currentTx: any = null;

    const isMoneyToken = (tok: string) => tok === '-' || /^-?\$[0-9,.]+$/.test(tok);
    const parseMoney = (str: string) => parseFloat(str.replace(/[^0-9.-]/g, '')) || 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Starts with: Account (10 digits) Date Date Reference
      const startMatch = line.match(/^(\d{10})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(\S+)/);
      if (startMatch) {
        if (currentTx) {
          transactions.push(currentTx);
        }

        const dateParts = startMatch[2].split('/');
        const formattedDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
        const ref = startMatch[4];
        
        // Exclude the matched start tokens from description
        const remainingText = line.replace(/^\d{10}\s+\d{2}\/\d{2}\/\d{4}\s+\d{2}\/\d{2}\/\d{4}\s+\S+/, '').trim();

        currentTx = {
          id: `banorte-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          date: formattedDate,
          reference: ref,
          description: remainingText,
          amount: 0,
          lowConfidence: false,
          completedAmount: false
        };

        // Check if money tokens are on the same line
        let parts = remainingText.split(/\s+/).map(x => x.trim()).filter(Boolean);

        let moneyIdx = -1;
        for (let j = 0; j <= parts.length - 3; j++) {
          if (isMoneyToken(parts[j]) && isMoneyToken(parts[j+1]) && isMoneyToken(parts[j+2])) {
            moneyIdx = j;
            break;
          }
        }

        if (moneyIdx !== -1) {
          const depToken = parts[moneyIdx];
          const wdToken = parts[moneyIdx + 1];
          
          let amount = 0;
          if (depToken !== '-') {
            amount = parseMoney(depToken);
          } else if (wdToken !== '-') {
            amount = -parseMoney(wdToken);
          }

          currentTx.amount = amount;
          currentTx.completedAmount = true;

          const nonMoneyParts = parts.filter((_, idx) => idx < moneyIdx || idx > moneyIdx + 2);
          currentTx.description = nonMoneyParts.join(' ');
        }

      } else if (currentTx) {
        // Look for the line containing the transaction amounts (only if we haven't found them yet)
        let parts = line.split(/\s+/).map(x => x.trim()).filter(Boolean);

        if (!currentTx.completedAmount) {
          let moneyIdx = -1;
          for (let j = 0; j <= parts.length - 3; j++) {
            if (isMoneyToken(parts[j]) && isMoneyToken(parts[j+1]) && isMoneyToken(parts[j+2])) {
              moneyIdx = j;
              break;
            }
          }

          if (moneyIdx !== -1) {
            const depToken = parts[moneyIdx];
            const wdToken = parts[moneyIdx + 1];
            
            let amount = 0;
            if (depToken !== '-') {
              amount = parseMoney(depToken);
            } else if (wdToken !== '-') {
              amount = -parseMoney(wdToken);
            }

            currentTx.amount = amount;
            currentTx.completedAmount = true;

            const nonMoneyParts = parts.filter((_, idx) => idx < moneyIdx || idx > moneyIdx + 2);
            if (nonMoneyParts.length > 0) {
              currentTx.description += ' ' + nonMoneyParts.join(' ');
            }
            continue; // skip the append block since we parsed it here
          }
        }

        // Reconstruct description for wrapped lines, filtering out footer/header structural texts
        const isStructuralLine = 
          line.includes('Cheques') || 
          line.includes('Página') || 
          line.includes('--') || 
          line.startsWith('DEPÓSITOS RETIROS') || 
          line.startsWith('TOTAL:') || 
          line.startsWith('OPERACIONES:') || 
          line.includes('about:blank') ||
          /^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(line);

        if (!isStructuralLine) {
          currentTx.description += ' ' + line;
        }
      }
    }

    if (currentTx) {
      transactions.push(currentTx);
    }

    // Clean up description text (remove trailing dashes or random formatting leftovers)
    return transactions.map(tx => ({
      id: tx.id,
      date: tx.date,
      reference: tx.reference,
      amount: tx.amount,
      lowConfidence: tx.lowConfidence,
      description: tx.description.replace(/\s+/g, ' ').replace(/\s+-\s*$/, '').trim()
    }));
  }

  public static parseBBVA(text: string): ParsedTransaction[] {
    const lines = text.split('\n');
    const transactions: ParsedTransaction[] = [];
    let currentTx: any = null;

    const parseMoney = (str: string) => parseFloat(str.replace(/[^0-9.-]/g, '')) || 0;

    const monthMap: Record<string, string> = {
      '01': '01', '02': '02', '03': '03', '04': '04', '05': '05', '06': '06',
      '07': '07', '08': '08', '09': '09', '10': '10', '11': '11', '12': '12'
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      const parts = line.split('\t').map(x => x.trim());
      if (parts.length < 5) continue;

      const datePart = parts[0];
      const dateMatch = datePart.match(/^(\d{2}-\d{2})\b/);

      if (dateMatch) {
        if (currentTx) {
          transactions.push(currentTx);
        }

        const dateStr = dateMatch[1];
        const [day, month] = dateStr.split('-');
        const formattedDate = `2026-${monthMap[month] || '07'}-${day}`;

        const desc = parts[1] || '';
        const cargoVal = parts[2];
        const abonoVal = parts[3];

        let amount = 0;
        let completedAmount = false;

        // Check if there are digits in columns to identify money amount
        if (cargoVal && /\d/.test(cargoVal)) {
          amount = -parseMoney(cargoVal);
          completedAmount = true;
        } else if (abonoVal && /\d/.test(abonoVal)) {
          amount = parseMoney(abonoVal);
          completedAmount = true;
        }

        currentTx = {
          id: `bbva-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          date: formattedDate,
          description: desc,
          reference: '',
          amount: amount,
          lowConfidence: false,
          completedAmount: completedAmount
        };
      } else if (currentTx) {
        const descExtra = parts[1];
        if (descExtra && !descExtra.includes('BBVANet') && !descExtra.includes('Page') && !descExtra.includes('--')) {
          if (currentTx.description) {
            currentTx.description += ' ' + descExtra;
          } else {
            currentTx.description = descExtra;
          }
        }

        if (!currentTx.completedAmount) {
          const cargoVal = parts[2];
          const abonoVal = parts[3];

          if (cargoVal && /\d/.test(cargoVal)) {
            currentTx.amount = -parseMoney(cargoVal);
            currentTx.completedAmount = true;
          } else if (abonoVal && /\d/.test(abonoVal)) {
            currentTx.amount = parseMoney(abonoVal);
            currentTx.completedAmount = true;
          }
        }
      }
    }

    if (currentTx) {
      transactions.push(currentTx);
    }

    // Resolve references and clean descriptions
    return transactions.map(tx => {
      // Extract reference number if present in description (e.g. /0032572577 or /0166148304)
      const refMatch = tx.description.match(/\/(\d+)\b/);
      const reference = refMatch ? refMatch[1] : '';

      return {
        id: tx.id,
        date: tx.date,
        reference,
        amount: tx.amount,
        lowConfidence: tx.lowConfidence,
        description: tx.description.replace(/\s+/g, ' ').trim()
      };
    });
  }

  /**
   * Parse Convenia PDF text dump
   */
  public static parseConvenia(text: string): ParsedTransaction[] {
    const lines = text.split('\n');
    const transactions: ParsedTransaction[] = [];

    const monthMap: Record<string, string> = {
      'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04', 'mayo': '05', 'junio': '06',
      'julio': '07', 'agosto': '08', 'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
    };

    const parseMoney = (str: string) => parseFloat(str.replace(/[^0-9.-]/g, '')) || 0;
    
    const isNoise = (str: string) => {
      const s = str.toUpperCase();
      return s.includes('EL EQUIPO DE CONVENIA') || s.includes('DERECHOS RESERVADOS') || s.includes('PÁGINA') || s.includes('PAGINA');
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      const parts = line.split('\t');
      if (parts.length < 7) continue;

      const col0 = parts[0].trim(); // Date
      const col4 = parts[4].trim(); // Cargo
      const col5 = parts[5].trim(); // Abono

      const dateStartMatch = col0.match(/^(\d{1,2})\s+de\s+([a-zA-ZñÑáéíóúÁÉÍÓÚ]+)\s+de/);
      const hasMoney = (col4 && col4.includes('$')) || (col5 && col5.includes('$'));

      if (dateStartMatch && hasMoney) {
        const day = dateStartMatch[1];
        const monthName = dateStartMatch[2].toLowerCase();
        const month = monthMap[monthName] || '07';
        
        const cargo = parseMoney(col4);
        const abono = parseMoney(col5);
        const amount = cargo > 0 ? -cargo : abono;

        const dateParts = [col0];
        const descParts = [parts[1].trim(), parts[2].trim()];
        const refParts = [parts[3].trim()];

        let j = i + 1;
        while (j < lines.length) {
          const nextLine = lines[j];
          if (!nextLine.trim()) {
            j++;
            continue;
          }

          const nextParts = nextLine.split('\t');
          if (nextParts.length < 7) {
            j++;
            continue;
          }

          const nextCol0 = nextParts[0].trim();
          const nextCol4 = nextParts[4].trim();
          const nextCol5 = nextParts[5].trim();

          const nextDateMatch = nextCol0.match(/^(\d{1,2})\s+de\s+([a-zA-ZñÑáéíóúÁÉÍÓÚ]+)\s+de/);
          const nextHasMoney = (nextCol4 && nextCol4.includes('$')) || (nextCol5 && nextCol5.includes('$'));
          if (nextDateMatch && nextHasMoney) {
            break;
          }

          if (nextCol0 && !isNoise(nextCol0)) dateParts.push(nextCol0);
          if (nextParts[1].trim() && !isNoise(nextParts[1])) descParts.push(nextParts[1].trim());
          if (nextParts[2].trim() && !isNoise(nextParts[2])) descParts.push(nextParts[2].trim());
          if (nextParts[3].trim() && !isNoise(nextParts[3])) refParts.push(nextParts[3].trim());

          j++;
        }

        i = j - 1;

        let year = '2026';
        for (const d of dateParts) {
          const yearMatch = d.match(/^(\d{4})\b/);
          if (yearMatch) {
            year = yearMatch[1];
            break;
          }
        }

        const formattedDate = `${year}-${month}-${day.padStart(2, '0')}`;
        const reference = refParts.join('').replace(/\s+/g, '');
        const description = descParts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

        transactions.push({
          id: `convenia-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          date: formattedDate,
          description,
          reference,
          amount,
          lowConfidence: false
        });
      }
    }

    return transactions;
  }

  /**
   * Parse Inbursa PDF text dump
   */
  public static parseInbursa(text: string): ParsedTransaction[] {
    const lines = text.split('\n');
    const transactions: ParsedTransaction[] = [];
    let currentTx: any = null;

    const parseMoney = (str: string) => parseFloat(str.replace(/[^0-9.-]/g, '')) || 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const startMatch = line.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\S+)/);
      if (startMatch) {
        if (currentTx) {
          transactions.push(currentTx);
        }

        const dateParts = [startMatch[1], startMatch[2], startMatch[3]];
        // dateParts[0] is month (07), dateParts[1] is day (03/31), dateParts[2] is year (2026)
        const formattedDate = `${dateParts[2]}-${dateParts[0]}-${dateParts[1]}`;
        const reference = startMatch[4];

        currentTx = {
          id: `inbursa-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          date: formattedDate,
          description: line.replace(/^\d{2}\/\d{2}\/\d{4}\s+\S+/, '').trim(),
          reference,
          amount: 0,
          lowConfidence: false,
          completedAmount: false
        };

        const parts = line.split(/\s+/).map(x => x.trim()).filter(Boolean);
        const moneyParts = parts.filter(p => /^[+-]?(\[S\])?\$[0-9,.-]+$/.test(p));

        if (moneyParts.length >= 2) {
          currentTx.amount = parseMoney(moneyParts[0]);
          currentTx.completedAmount = true;

          const nonDescTokens = [startMatch[1] + '/' + startMatch[2] + '/' + startMatch[3], reference, ...moneyParts];
          const descParts = parts.filter(p => !nonDescTokens.includes(p) && !p.startsWith('036INBU'));
          currentTx.description = descParts.join(' ');
        }
      } else if (currentTx) {
        if (!currentTx.completedAmount) {
          const parts = line.split(/\s+/).map(x => x.trim()).filter(Boolean);
          const moneyParts = parts.filter(p => /^[+-]?(\[S\])?\$[0-9,.-]+$/.test(p));

          if (moneyParts.length >= 2) {
            currentTx.amount = parseMoney(moneyParts[0]);
            currentTx.completedAmount = true;
            
            const nonDescTokens = [...moneyParts];
            const descParts = parts.filter(p => !nonDescTokens.includes(p) && !p.startsWith('036INBU'));
            if (descParts.length > 0) {
              currentTx.description += ' ' + descParts.join(' ');
            }
            continue;
          }
        }

        if (!line.includes('Estado de Cuenta') && !line.includes('Página') && !line.includes('--')) {
          currentTx.description += ' ' + line;
        }
      }
    }

    if (currentTx) {
      transactions.push(currentTx);
    }

    return transactions
      .filter(tx => tx.reference !== 'SALDO' && !tx.description.includes('SALDO INICIAL'))
      .map(tx => {
        return {
          id: tx.id,
          date: tx.date,
          reference: tx.reference,
          amount: tx.amount,
          lowConfidence: tx.lowConfidence,
          description: tx.description.replace(/\s+/g, ' ').trim()
        };
      });
  }

  /**
   * Parse STP CSV text dump
   */
  public static parseSTP(text: string): ParsedTransaction[] {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];

    // Parse header to map column indices
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    
    const idxAmount = headers.indexOf('monto');
    const idxDesc = headers.indexOf('concepto');
    const idxDesc2 = headers.indexOf('concepto 2');
    const idxRef = headers.indexOf('referencia');
    const idxDate = headers.indexOf('fecha');
    const idxType = headers.indexOf('tipo de movimiento');

    if (idxAmount === -1 || idxDesc === -1 || idxRef === -1 || idxDate === -1) {
      throw new Error('El archivo CSV de STP no contiene las columnas requeridas (Monto, Concepto, Referencia, Fecha).');
    }

    const transactions: ParsedTransaction[] = [];

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',').map(c => c.trim());
      if (row.length < headers.length) continue;

      const rawAmount = parseFloat(row[idxAmount]) || 0;
      const type = row[idxType]?.toLowerCase() || 'abono';
      const amount = type === 'retiro' ? -Math.abs(rawAmount) : Math.abs(rawAmount);

      const desc1 = row[idxDesc] || '';
      const desc2 = idxDesc2 !== -1 ? row[idxDesc2] || '' : '';
      const description = `${desc1} ${desc2}`.trim();

      const reference = row[idxRef] || '';
      
      // STP Date is typically "YYYY-MM-DD HH:MM:SS" or "YYYY-MM-DD"
      const dateStr = row[idxDate] || '';
      const date = dateStr.split(' ')[0] || DateEngine.getLocalYYYYMMDD(new Date());

      transactions.push({
        id: `stp-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
        date,
        description,
        reference,
        amount,
        lowConfidence: false
      });
    }

    return transactions;
  }
}

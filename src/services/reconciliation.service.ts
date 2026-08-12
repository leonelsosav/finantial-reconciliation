import { supabase } from '../lib/supabase';
import { DateEngine } from '../utils/DateEngine';

export class ReconciliationService {
  /**
   * Orchestrates the reverse-flow matching logic programmatically.
   * Accepts a record ID, a context token, and an optional client ID override.
   */
  static async processReconciliationEvent(
    id: string,
    source: 'billing_record' | 'bank_transaction',
    clientIdOverride?: string
  ): Promise<boolean> {
    try {
      console.log(`[ReconciliationService] Starting processReconciliationEvent for ${source} (${id}), client override: ${clientIdOverride}`);

      if (source === 'billing_record') {
        // 1. Fetch the billing record
        const { data: bill, error: fetchErr } = await supabase
          .from('billing_records')
          .select('*')
          .eq('id', id)
          .single();

        if (fetchErr || !bill) {
          throw new Error(`Failed to fetch billing record: ${fetchErr?.message || 'Not found'}`);
        }

        // If already reconciled, skip
        if (bill.is_reconciled) {
          console.log(`[ReconciliationService] Billing record ${id} is already reconciled. Skipping.`);
          return false;
        }

        const clientId = bill.client_id;
        const amountGross = Number(bill.amount_gross);
        const opDateStr = bill.operation_date;

        if (!clientId || !amountGross || !opDateStr) {
          console.log(`[ReconciliationService] Incomplete parameters on billing record ${id}. Skipping.`);
          return false;
        }

        // Parse operation date and build +/- 5 days range timezone-safely
        const opDate = DateEngine.parseLocalDate(opDateStr);
        const minDateObj = new Date(opDate);
        minDateObj.setDate(opDate.getDate() - 5);
        const maxDateObj = new Date(opDate);
        maxDateObj.setDate(opDate.getDate() + 5);

        const minDateStr = DateEngine.getLocalYYYYMMDD(minDateObj);
        const maxDateStr = DateEngine.getLocalYYYYMMDD(maxDateObj);

        // 2. Query bank_transactions for any un-reconciled record matching date range criteria
        const { data: matchedTxs, error: matchErr } = await supabase
          .from('bank_transactions')
          .select('*')
          .eq('is_reconciled', false)
          .gte('transaction_date', minDateStr)
          .lte('transaction_date', maxDateStr)
          .order('transaction_date', { ascending: true })
          .order('created_at', { ascending: true });

        if (matchErr) {
          throw new Error(`Error searching matching bank transactions: ${matchErr.message}`);
        }

        // Filter mathematically equivalent deposit (tx.amount == amountGross)
        const matchedTx = matchedTxs?.find(
          tx => Number(tx.amount) === amountGross
        );

        if (!matchedTx) {
          console.log(`[ReconciliationService] No matching bank deposit found for billing record ${id}.`);
          return false;
        }

        console.log(`[ReconciliationService] Found matching bank deposit transaction: ${matchedTx.id}`);

        // 3. Fetch target client commission percentage and current balance
        const { data: client, error: clientErr } = await supabase
          .from('clients')
          .select('commission_percentage, retainer_balance')
          .eq('id', clientId)
          .single();

        if (clientErr || !client) {
          throw new Error(`Failed to fetch client info: ${clientErr?.message || 'Not found'}`);
        }

        const commPct = Number(client.commission_percentage || 0);
        const currentBalance = Number(client.retainer_balance || 0);

        // Try to find the matching payout outflow dynamically in the bank transactions list:
        // Payout should be negative, have a description containing 'NOMINA', and its absolute value 
        // should be between 85% and 99.5% of the gross funding amount.
        const minPayout = amountGross * 0.85;
        const maxPayout = amountGross * 0.995;

        const matchedPayoutTx = matchedTxs?.find(tx => {
          const val = Math.abs(Number(tx.amount));
          const isNegative = Number(tx.amount) < 0;
          const desc = (tx.description || '').toUpperCase();
          const isNomina = desc.includes('NOMINA');
          return isNegative && isNomina && val >= minPayout && val <= maxPayout;
        });

        // Calculate splits based on the actual payout transaction if found; otherwise fallback to DB commission pct.
        let amountCommission = 0;
        let amountNetPayroll = 0;

        if (matchedPayoutTx) {
          console.log(`[ReconciliationService] Found matching bank payout transaction: ${matchedPayoutTx.id}`);
          amountNetPayroll = Math.abs(Number(matchedPayoutTx.amount));
          amountCommission = amountGross - amountNetPayroll;
        } else {
          amountCommission = amountGross * (commPct / 100);
          amountNetPayroll = amountGross - amountCommission;
        }

        // 4. Batch updates programmatically
        // Update bank deposit transaction to reconciled
        const { error: txUpdateErr } = await supabase
          .from('bank_transactions')
          .update({ is_reconciled: true })
          .eq('id', matchedTx.id);

        if (txUpdateErr) throw txUpdateErr;

        // If payout transaction was found, mark it reconciled too
        if (matchedPayoutTx) {
          const { error: payoutUpdateErr } = await supabase
            .from('bank_transactions')
            .update({ is_reconciled: true })
            .eq('id', matchedPayoutTx.id);
          if (payoutUpdateErr) throw payoutUpdateErr;
        }

        // Update billing record with splits and link to bank tx
        const { error: billUpdateErr } = await supabase
          .from('billing_records')
          .update({
            is_reconciled: true,
            bank_transaction_id: matchedTx.id,
            amount_commission: amountCommission,
            amount_net_payroll: amountNetPayroll
          })
          .eq('id', id);

        if (billUpdateErr) throw billUpdateErr;

        // Update client balance (funding deposit increases balance, payroll payout decreases balance)
        // If both occur and are reconciled, the net change is 0. If only the deposit is reconciled, balance increases by net payroll.
        const balanceChange = matchedPayoutTx ? 0 : amountNetPayroll;

        const { error: clientUpdateErr } = await supabase
          .from('clients')
          .update({ retainer_balance: currentBalance + balanceChange })
          .eq('id', clientId);

        if (clientUpdateErr) throw clientUpdateErr;

        console.log(`[ReconciliationService] Successfully reconciled billing record ${id} with bank deposit ${matchedTx.id}`);
        return true;

      } else if (source === 'bank_transaction') {
        // 1. Fetch the bank transaction
        const { data: tx, error: fetchErr } = await supabase
          .from('bank_transactions')
          .select('*')
          .eq('id', id)
          .single();

        if (fetchErr || !tx) {
          throw new Error(`Failed to fetch bank transaction: ${fetchErr?.message || 'Not found'}`);
        }

        // If already reconciled, skip
        if (tx.is_reconciled) {
          console.log(`[ReconciliationService] Bank transaction ${id} is already reconciled. Skipping.`);
          return false;
        }

        const txAmount = Number(tx.amount);
        const txDateStr = tx.transaction_date;

        let clientId = clientIdOverride;

        // Parse transaction date and build +/- 5 days range timezone-safely
        const txDate = DateEngine.parseLocalDate(txDateStr);
        const minDateObj = new Date(txDate);
        minDateObj.setDate(txDate.getDate() - 5);
        const maxDateObj = new Date(txDate);
        maxDateObj.setDate(txDate.getDate() + 5);

        const minDateStr = DateEngine.getLocalYYYYMMDD(minDateObj);
        const maxDateStr = DateEngine.getLocalYYYYMMDD(maxDateObj);

        // Fetch client info first if clientId is known
        let commPct = 0;
        let currentBalance = 0;

        if (clientId) {
          const { data: client, error: clientErr } = await supabase
            .from('clients')
            .select('commission_percentage, retainer_balance')
            .eq('id', clientId)
            .single();

          if (!clientErr && client) {
            commPct = Number(client.commission_percentage || 0);
            currentBalance = Number(client.retainer_balance || 0);
          }
        }

        // Fallback: If no clientId was passed directly, try to search for matching billing records to resolve the client ID
        if (!clientId && txDateStr) {
          const { data: searchBills } = await supabase
            .from('billing_records')
            .select('client_id')
            .eq('is_reconciled', false)
            .or(`amount_gross.eq.${Math.abs(txAmount)},amount_net_payroll.eq.${Math.abs(txAmount)}`)
            .gte('operation_date', minDateStr)
            .lte('operation_date', maxDateStr)
            .limit(1);

          if (searchBills && searchBills.length > 0) {
            clientId = searchBills[0].client_id;
            // Fetch client details now
            const { data: client } = await supabase
              .from('clients')
              .select('commission_percentage, retainer_balance')
              .eq('id', clientId)
              .single();

            if (client) {
              commPct = Number(client.commission_percentage || 0);
              currentBalance = Number(client.retainer_balance || 0);
            }
          }
        }

        if (!clientId || !txAmount || !txDateStr) {
          console.log(`[ReconciliationService] Incomplete parameters or no client linked for bank transaction ${id}. Skipping.`);
          return false;
        }

        if (txAmount > 0) {
          // Deposit / Inflow
          // Find matching billing record where amount_gross matches the deposit
          let query = supabase
            .from('billing_records')
            .select('*')
            .eq('is_reconciled', false)
            .eq('client_id', clientId);

          if (!clientIdOverride) {
            query = query
              .gte('operation_date', minDateStr)
              .lte('operation_date', maxDateStr);
          }

          const { data: matchedBills, error: matchErr } = await query
            .order('operation_date', { ascending: true });

          if (matchErr) throw new Error(`Error searching matching billing records: ${matchErr.message}`);

          const matchedBill = matchedBills?.find(bill => Number(bill.amount_gross) === txAmount);
          if (!matchedBill) {
            console.log(`[ReconciliationService] No matching billing record found for deposit bank transaction ${id}.`);
            return false;
          }

          // Try to find the matching payout outflow dynamically in bank_transactions:
          // Payout should be negative, have description containing 'NOMINA', and value in 85%-99.5% range of deposit
          const minPayout = txAmount * 0.85;
          const maxPayout = txAmount * 0.995;

          let queryPayouts = supabase
            .from('bank_transactions')
            .select('*')
            .eq('is_reconciled', false);

          if (!clientIdOverride) {
            queryPayouts = queryPayouts
              .gte('transaction_date', minDateStr)
              .lte('transaction_date', maxDateStr);
          }

          const { data: potentialPayouts } = await queryPayouts;

          const matchedPayoutTx = potentialPayouts?.find(p => {
            const val = Math.abs(Number(p.amount));
            const isNegative = Number(p.amount) < 0;
            const desc = (p.description || '').toUpperCase();
            const isNomina = desc.includes('NOMINA');
            return isNegative && isNomina && val >= minPayout && val <= maxPayout;
          });

          let amountCommission = 0;
          let amountNetPayroll = 0;

          if (matchedPayoutTx) {
            amountNetPayroll = Math.abs(Number(matchedPayoutTx.amount));
            amountCommission = txAmount - amountNetPayroll;
          } else {
            amountCommission = txAmount * (commPct / 100);
            amountNetPayroll = txAmount - amountCommission;
          }

          // Mark deposit reconciled
          await supabase.from('bank_transactions').update({ is_reconciled: true }).eq('id', id);

          // Mark payout reconciled if found
          if (matchedPayoutTx) {
            await supabase.from('bank_transactions').update({ is_reconciled: true }).eq('id', matchedPayoutTx.id);
          }

          // Mark invoice reconciled
          await supabase.from('billing_records').update({
            is_reconciled: true,
            bank_transaction_id: id,
            amount_commission: amountCommission,
            amount_net_payroll: amountNetPayroll
          }).eq('id', matchedBill.id);

          // Update client balance: net change is 0 if payout occurred; otherwise +amountNetPayroll
          const balanceChange = matchedPayoutTx ? 0 : amountNetPayroll;
          await supabase.from('clients').update({ retainer_balance: currentBalance + balanceChange }).eq('id', clientId);

          console.log(`[ReconciliationService] Successfully reconciled deposit ${id} and invoice ${matchedBill.id}`);
          return true;

        } else {
          // Payout / Outflow (txAmount < 0)
          const payoutAmountAbs = Math.abs(txAmount);

          // Find matching billing record where the payout amount matches the net payroll calculation
          // (meaning the payout amount is between 85% and 99.5% of the billing record's gross amount)
          let query = supabase
            .from('billing_records')
            .select('*')
            .eq('is_reconciled', false)
            .eq('client_id', clientId);

          if (!clientIdOverride) {
            query = query
              .gte('operation_date', minDateStr)
              .lte('operation_date', maxDateStr);
          }

          const { data: matchedBills, error: matchErr } = await query
            .order('operation_date', { ascending: true });

          if (matchErr) throw new Error(`Error searching matching billing records: ${matchErr.message}`);

          const matchedBill = matchedBills?.find(bill => {
            const gross = Number(bill.amount_gross);
            const minGross = payoutAmountAbs / 0.995;
            const maxGross = payoutAmountAbs / 0.85;
            return gross >= minGross && gross <= maxGross;
          });

          if (!matchedBill) {
            console.log(`[ReconciliationService] No matching billing record found for payout bank transaction ${id}.`);
            return false;
          }

          const amountGross = Number(matchedBill.amount_gross);
          const amountNetPayroll = payoutAmountAbs;
          const amountCommission = amountGross - amountNetPayroll;

          // Search for the matching deposit inflow (+amountGross) in bank_transactions
          let queryDeposit = supabase
            .from('bank_transactions')
            .select('*')
            .eq('is_reconciled', false)
            .eq('amount', amountGross);

          if (!clientIdOverride) {
            queryDeposit = queryDeposit
              .gte('transaction_date', minDateStr)
              .lte('transaction_date', maxDateStr);
          }

          const { data: matchedDepositTxs } = await queryDeposit.limit(1);

          const matchedDepositTx = matchedDepositTxs && matchedDepositTxs.length > 0 ? matchedDepositTxs[0] : null;

          // Mark payout reconciled
          await supabase.from('bank_transactions').update({ is_reconciled: true }).eq('id', id);

          // Mark deposit reconciled if found
          if (matchedDepositTx) {
            await supabase.from('bank_transactions').update({ is_reconciled: true }).eq('id', matchedDepositTx.id);
          }

          // Mark invoice reconciled
          await supabase.from('billing_records').update({
            is_reconciled: true,
            bank_transaction_id: matchedDepositTx ? matchedDepositTx.id : id,
            amount_commission: amountCommission,
            amount_net_payroll: amountNetPayroll
          }).eq('id', matchedBill.id);

          // Update client balance: net change is 0 if deposit occurred; otherwise -amountNetPayroll
          const balanceChange = matchedDepositTx ? 0 : -amountNetPayroll;
          await supabase.from('clients').update({ retainer_balance: currentBalance + balanceChange }).eq('id', clientId);

          console.log(`[ReconciliationService] Successfully reconciled payout ${id} and invoice ${matchedBill.id}`);
          return true;
        }
      }

      return false;
    } catch (err: any) {
      console.error(`[ReconciliationService] Critical error in processReconciliationEvent:`, err);
      throw err;
    }
  }
}

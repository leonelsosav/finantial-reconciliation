import { supabase } from '../lib/supabase';

export interface PredictedClient {
  client_id: string;
  client_group_id: string | null;
}

export class PredictionService {
  /**
   * Predicts the client and group based on historical billing records.
   */
  static async predictClientFromDescription(
    bankDescription: string,
    amount?: number
  ): Promise<PredictedClient | null> {
    try {
      console.log(`[PredictionService] Predicting client for description: "${bankDescription}" and amount: ${amount}`);

      // 1. Try to find a match in billing_records (both un-reconciled and reconciled, prioritizing un-reconciled)
      if (amount !== undefined) {
        const absAmount = Math.abs(amount);
        const isPayout = amount < 0;

        // Fetch all un-reconciled billing records
        const { data: bills, error: billErr } = await supabase
          .from('billing_records')
          .select(`
            client_id,
            amount_gross,
            clients (
              client_group_id
            )
          `)
          .eq('is_reconciled', false);

        if (!billErr && bills && bills.length > 0) {
          // In-memory match
          const matched = bills.find(bill => {
            const gross = Number(bill.amount_gross || 0);
            if (isPayout) {
              // Payout: net payroll should be between 85% and 99.5% of the gross amount
              const minPayout = gross * 0.85;
              const maxPayout = gross * 0.995;
              return absAmount >= minPayout && absAmount <= maxPayout;
            } else {
              // Deposit: gross amount should match exactly
              return gross === absAmount;
            }
          });

          if (matched && matched.client_id) {
            console.log(`[PredictionService] Found client prediction via in-memory match: client ${matched.client_id}`);
            const clientGroupObj = matched.clients as any;
            return {
              client_id: matched.client_id,
              client_group_id: clientGroupObj?.client_group_id || null
            };
          }
        }
      }

      // 2. Fallback: Search billing_records matching description (token/partial match)
      if (bankDescription) {
        const { data: bills, error: billErr } = await supabase
          .from('billing_records')
          .select(`
            client_id,
            clients (
              client_group_id
            )
          `)
          .not('client_id', 'is', null)
          .ilike('description', `%${bankDescription}%`)
          .order('operation_date', { ascending: false })
          .limit(5);

        if (!billErr && bills && bills.length > 0) {
          const bestMatch = bills[0];
          if (bestMatch.client_id) {
            const clientGroupObj = bestMatch.clients as any;
            return {
              client_id: bestMatch.client_id,
              client_group_id: clientGroupObj?.client_group_id || null
            };
          }
        }

        // 3. Fallback: Search recent billing_records and check substring matching in-memory
        const { data: recentBills, error: recentErr } = await supabase
          .from('billing_records')
          .select(`
            client_id,
            description,
            clients (
              client_group_id
            )
          `)
          .not('client_id', 'is', null)
          .order('operation_date', { ascending: false })
          .limit(100);

        if (!recentErr && recentBills) {
          const memoryMatch = recentBills.find(bill => {
            if (!bill.description) return false;
            return (
              bankDescription.toLowerCase().includes(bill.description.toLowerCase()) ||
              bill.description.toLowerCase().includes(bankDescription.toLowerCase())
            );
          });

          if (memoryMatch && memoryMatch.client_id) {
            console.log(`[PredictionService] Memory match found: "${memoryMatch.description}"`);
            const clientGroupObj = memoryMatch.clients as any;
            return {
              client_id: memoryMatch.client_id,
              client_group_id: clientGroupObj?.client_group_id || null
            };
          }
        }
      }

      console.log(`[PredictionService] No prediction match found.`);
      return null;
    } catch (err: any) {
      console.error(`[PredictionService] Error in predictClientFromDescription:`, err);
      return null;
    }
  }
}

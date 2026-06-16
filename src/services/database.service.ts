import { supabase } from '../lib/supabase';

export interface QueryFilter {
  column: string;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'like' | 'ilike' | 'is' | 'in';
  value: any;
}

export interface QueryOptions {
  filters?: QueryFilter[];
  sort?: {
    column: string;
    direction: 'asc' | 'desc';
  };
  limit?: number;
  select?: string;
}

export class DatabaseService<T> {
  private table: string;

  constructor(table: string) {
    this.table = table;
  }

  async getAll(options?: QueryOptions): Promise<T[]> {
    let query = supabase.from(this.table).select(options?.select || '*');

    if (options?.filters) {
      options.filters.forEach(filter => {
        // @ts-ignore - Dynamic filter application
        query = query[filter.operator](filter.column, filter.value);
      });
    }

    if (options?.sort) {
      query = query.order(options.sort.column, { ascending: options.sort.direction === 'asc' });
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data as T[];
  }

  async getById(id: string): Promise<T | null> {
    const { data, error } = await supabase
      .from(this.table)
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as T;
  }

  async create(payload: Partial<T>): Promise<T> {
    const { data, error } = await supabase
      .from(this.table)
      .insert(payload as any)
      .select()
      .single();

    if (error) throw error;
    if (!data) throw new Error('No se pudo crear el registro');
    return data as T;
  }

  async update(id: string, payload: Partial<T>): Promise<T> {
    const { data, error } = await supabase
      .from(this.table)
      .update(payload as any)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) throw new Error('No se pudo actualizar el registro');
    return data as T;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from(this.table)
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  subscribe(callback: (payload: any) => void) {
    return supabase
      .channel(`public:${this.table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: this.table }, callback)
      .subscribe();
  }
}

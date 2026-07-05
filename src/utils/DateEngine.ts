export class DateEngine {
  /**
   * Returns current local date as a YYYY-MM-DD string, preventing UTC timezone shifts.
   */
  static getLocalYYYYMMDD(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Returns local year and month as a YYYY-MM string.
   */
  static getLocalYYYYMM(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  /**
   * Safely parses a YYYY-MM-DD string into a local Date object without UTC drift.
   */
  static parseLocalDate(dateStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
}

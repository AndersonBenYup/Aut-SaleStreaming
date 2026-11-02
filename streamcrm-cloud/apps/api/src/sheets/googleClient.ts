import { readFileSync } from 'node:fs';
import { google, type sheets_v4 } from 'googleapis';
import { toSheetSerial } from '../lib/dates.js';
import { columnLetter, type CellUpdate, type SheetData, type SheetsClient, type SheetValue } from './client.js';

const quoteTab = (tab: string) => `'${tab.replace(/'/g, "''")}'`;

export function loadServiceAccount(raw: string): { client_email: string; private_key: string } {
  if (!raw) throw new Error('Falta GOOGLE_SERVICE_ACCOUNT_JSON');
  const json = raw.trim().startsWith('{') ? raw : readFileSync(raw, 'utf8');
  return JSON.parse(json);
}

/** Lee y escribe en una Google Sheet compartida con la service account del SaaS. */
export class GoogleSheetsClient implements SheetsClient {
  private api: sheets_v4.Sheets;

  constructor(
    private spreadsheetId: string,
    serviceAccountJson: string,
  ) {
    const creds = loadServiceAccount(serviceAccountJson);
    const auth = new google.auth.JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    this.api = google.sheets({ version: 'v4', auth });
  }

  async read(tab: string): Promise<SheetData | null> {
    const range = quoteTab(tab);
    try {
      const [values, formulas] = await Promise.all([
        this.api.spreadsheets.values.get({
          spreadsheetId: this.spreadsheetId,
          range,
          valueRenderOption: 'UNFORMATTED_VALUE',
          dateTimeRenderOption: 'SERIAL_NUMBER',
        }),
        this.api.spreadsheets.values.get({ spreadsheetId: this.spreadsheetId, range, valueRenderOption: 'FORMULA' }),
      ]);
      const v = (values.data.values ?? []) as unknown[][];
      const f = ((formulas.data.values ?? []) as unknown[][]).map((row) =>
        row.map((c) => (typeof c === 'string' && c.startsWith('=') ? c : null)),
      );
      return { values: v, formulas: f };
    } catch (err: unknown) {
      if (/Unable to parse range/i.test(String((err as Error).message))) return null;
      throw err;
    }
  }

  async update(tab: string, updates: CellUpdate[]): Promise<void> {
    if (!updates.length) return;
    await this.api.spreadsheets.values.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: updates.map((u) => ({
          range: `${quoteTab(tab)}!${columnLetter(u.col)}${u.row + 1}`,
          values: [[toGoogleValue(u.value)]],
        })),
      },
    });
  }
}

function toGoogleValue(v: SheetValue): string | number {
  if (v === null) return '';
  if (typeof v === 'object') return 'date' in v ? toSheetSerial(v.date) : v.formula;
  return v;
}

/** Extrae el id de una URL de Google Sheets o lo devuelve tal cual si ya es un id. */
export const spreadsheetIdFromUrl = (input: string) => input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] ?? input.trim();

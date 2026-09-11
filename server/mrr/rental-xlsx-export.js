import fs from 'node:fs/promises';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { fetchAggregatedRentals, defaultMrrClient } from '../mrr.js';
import { getDb } from '../db.js';
import { getBtcPrice } from '../utils/priceUtils.js';

const EXPORT_DIR = path.resolve(process.cwd(), 'data', 'exports');
export const RENTAL_EXPORT_PATH = path.join(EXPORT_DIR, 'rentals.xlsx');

const RENTAL_HEADERS = [
  'Date', 'Account', 'Rig Name', 'Algorithm', 
  'Start', 'End', 'Advertised', 'Advertised Unit', 
  'Efficiency %', 'Price', 'Price Unit',
  'Paid', 'Paid Unit', 'USDT Paid'
];

function rentalsFrom(result) {
  const data = result?.data?.data;
  return Array.isArray(data) ? data : (Array.isArray(data?.rentals) ? data.rentals : []);
}

function value(obj, ...keys) {
  for (const key of keys) {
    const found = key.split('.').reduce((item, part) => item?.[part], obj);
    if (found !== undefined && found !== null && found !== '') return found;
  }
  return '';
}

function formatDate(val) {
  if (!val) return '';
  const numeric = Number(val);
  const ms = Number.isFinite(numeric) && numeric > 0 ? (numeric < 1e12 ? numeric * 1000 : numeric) : Date.parse(val);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : String(val);
}

function bangkokDate() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function safeNumber(val) {
  if (val === undefined || val === null || val === '') return NaN;
  const num = Number(String(val).replace(/,/g, ''));
  return isNaN(num) ? NaN : num;
}

// ============================================
// GET ADVERTISED HASHRATE WITH CORRECT UNIT
// ============================================
function getAdvertisedInfo(rental) {
  let advertised = '';
  let unit = '';
  
  // The data is in rental.hashrate
  if (rental?.hashrate) {
    const hr = rental.hashrate;
    
    // Get advertised hashrate
    if (hr.advertised !== undefined && hr.advertised !== null) {
      if (typeof hr.advertised === 'object') {
        advertised = hr.advertised.hash || hr.advertised.nice || hr.advertised.value || '';
        unit = hr.advertised.unit || hr.suffix || hr.unit || '';
      } else {
        advertised = String(hr.advertised);
        unit = hr.suffix || hr.unit || '';
      }
    }
    
    // If no advertised, try hash
    if (!advertised && hr.hash !== undefined && hr.hash !== null) {
      advertised = String(hr.hash);
      unit = hr.suffix || hr.unit || '';
    }
    
    // Get suffix/unit - THIS IS THE KEY FIX
    if (!unit) {
      unit = hr.suffix || hr.unit || '';
    }
    
    // Also check if the unit is in the advertised object
    if (!unit && hr.advertised && typeof hr.advertised === 'object') {
      unit = hr.advertised.unit || '';
    }
  }
  
  // If still no unit, try rig
  if (!unit) {
    unit = value(rental, 'rig.unit', 'rig.suffix', 'hashrate.unit', 'hashrate.suffix');
  }
  
  // Clean up unit
  if (unit) {
    unit = unit.toUpperCase().replace(/\/S$/, '');
    const unitMap = {
      'H': 'H/s', 'KH': 'KH/s', 'MH': 'MH/s', 
      'GH': 'GH/s', 'TH': 'TH/s', 'PH': 'PH/s', 'EH': 'EH/s'
    };
    unit = unitMap[unit] || (unit.includes('/') ? unit : unit + '/s');
  } else {
    unit = 'MH/s';
  }
  
  return { advertised, unit };
}

// ============================================
// GET PRICE WITH CORRECT CURRENCY
// ============================================
function getPriceInfo(rental) {
  let price = '';
  let currency = 'BTC';
  
  if (rental?.price) {
    if (typeof rental.price === 'object') {
      // Try advertised price
      if (rental.price.advertised !== undefined && rental.price.advertised !== null) {
        const adv = rental.price.advertised;
        if (typeof adv === 'object') {
          price = adv.price || adv.amount || adv.advertised || '';
          currency = adv.currency || adv.unit || rental.price.currency || '';
        } else {
          price = String(adv);
          currency = rental.price.currency || rental.price.unit || '';
        }
      }
      
      // Try price field
      if (!price && rental.price.price !== undefined && rental.price.price !== null) {
        price = String(rental.price.price);
        currency = rental.price.currency || rental.price.unit || '';
      }
    } else {
      price = String(rental.price);
    }
  }
  
  // Get currency
  if (!currency || currency === 'BTC') {
    const cv = value(rental, 'price.currency', 'currency', 'price_unit');
    if (cv) currency = String(cv).toUpperCase();
  }
  
  return { price, currency: currency || 'BTC' };
}

// ============================================
// GET PAID AMOUNT WITH CORRECT CURRENCY
// ============================================
function getPaidInfo(rental) {
  let paid = '';
  let currency = 'BTC';
  
  // Check price.paid
  if (rental?.price?.paid !== undefined && rental?.price?.paid !== null) {
    const p = rental.price.paid;
    if (typeof p === 'object') {
      paid = p.paid || p.amount || p.price || '';
      currency = p.currency || p.unit || rental.price.currency || '';
    } else {
      paid = String(p);
      currency = rental.price.currency || rental.price.unit || '';
    }
  }
  
  // Direct paid field
  if (!paid) {
    const pv = value(rental, 'paid', 'cost', 'price_paid');
    if (pv) paid = String(pv);
  }
  
  // If still no paid, use price
  if (!paid) {
    const priceInfo = getPriceInfo(rental);
    paid = priceInfo.price;
    currency = priceInfo.currency;
  }
  
  // Get currency
  if (!currency || currency === 'BTC') {
    const cv = value(rental, 'price.currency', 'currency', 'paid_currency', 'price_unit');
    if (cv) currency = String(cv).toUpperCase();
  }
  
  return { paid, currency: currency || 'BTC' };
}

function toExportRow(rental, client, snapshotDate, btcPriceUsd) {
  const advertisedInfo = getAdvertisedInfo(rental);
  const priceInfo = getPriceInfo(rental);
  const paidInfo = getPaidInfo(rental);
  
  // Calculate USDT Paid
  let usdtPaid = '';
  const paidNum = safeNumber(paidInfo.paid);
  if (!isNaN(paidNum) && paidNum > 0) {
    if (paidInfo.currency === 'USDT' || paidInfo.currency === 'USD') {
      usdtPaid = paidNum.toFixed(2);
    } else if (paidInfo.currency === 'BTC' && btcPriceUsd > 0) {
      usdtPaid = (paidNum * btcPriceUsd).toFixed(2);
    }
  }
  
  return {
    Date: snapshotDate,
    Account: value(rental, 'mrrClient', 'client') || client,
    'Rig Name': value(rental, 'rig.name', 'name', 'rig_name', 'rigName'),
    Algorithm: value(rental, 'rig.type', 'algo', 'algorithm', 'miningAlgorithm'),
    Start: formatDate(value(rental, 'start', 'start_time', 'startTime')),
    End: formatDate(value(rental, 'end', 'end_time', 'endTime')),
    Advertised: advertisedInfo.advertised,
    'Advertised Unit': advertisedInfo.unit,
    'Efficiency %': value(rental, 'hashrate.average.percent', 'percent'),
    Price: priceInfo.price,
    'Price Unit': priceInfo.currency,
    Paid: paidInfo.paid,
    'Paid Unit': paidInfo.currency,
    'USDT Paid': usdtPaid,
  };
}

async function getCachedRentalRows(client, snapshotDate, btcPriceUsd) {
  const db = await getDb();
  const isAllClients = client === 'ALL' || client === 'VN';
  
  let rows;
  if (isAllClients) {
    rows = await db.all('SELECT * FROM rentals ORDER BY last_updated DESC');
  } else {
    rows = await db.all('SELECT * FROM rentals WHERE client = ? ORDER BY last_updated DESC', [client]);
  }
  
  return rows.map(row => {
    const paid = row.price_paid || row.paid || '';
    const paidCurrency = row.paid_currency || row.currency || 'BTC';
    const price = row.price || row.advertised_price || '';
    const priceCurrency = row.price_currency || row.currency || 'BTC';
    const advertisedUnit = row.advertised_unit || 'MH/s';
    
    let usdtPaid = '';
    const paidNum = safeNumber(paid);
    if (!isNaN(paidNum) && paidNum > 0) {
      if (paidCurrency === 'USDT' || paidCurrency === 'USD') {
        usdtPaid = paidNum.toFixed(2);
      } else if (paidCurrency === 'BTC' && btcPriceUsd > 0) {
        usdtPaid = (paidNum * btcPriceUsd).toFixed(2);
      }
    }
    
    return {
      Date: snapshotDate,
      Account: row.client || client,
      'Rig Name': row.name || '',
      Algorithm: row.algo || '',
      Start: formatDate(row.start_time),
      End: formatDate(row.end_time),
      Advertised: row.advertised_hashrate || '',
      'Advertised Unit': advertisedUnit,
      'Efficiency %': row.efficiency || '',
      Price: price,
      'Price Unit': priceCurrency,
      Paid: paid,
      'Paid Unit': paidCurrency,
      'USDT Paid': usdtPaid,
    };
  });
}

function normalizeWorkbookRow(row) {
  return {
    Date: row.Date || '',
    Account: row.Account || '',
    'Rig Name': row['Rig Name'] || '',
    Algorithm: row.Algorithm || '',
    Start: row.Start || '',
    End: row.End || '',
    Advertised: row.Advertised || '',
    'Advertised Unit': row['Advertised Unit'] || 'MH/s',
    'Efficiency %': row['Efficiency %'] || '',
    Price: row.Price || '',
    'Price Unit': row['Price Unit'] || 'BTC',
    Paid: row.Paid || '',
    'Paid Unit': row['Paid Unit'] || 'BTC',
    'USDT Paid': row['USDT Paid'] || '',
  };
}

function setColumns(sheet) {
  sheet['!cols'] = [
    { wch: 13 }, // Date
    { wch: 11 }, // Account
    { wch: 30 }, // Rig Name
    { wch: 18 }, // Algorithm
    { wch: 24 }, // Start
    { wch: 24 }, // End
    { wch: 20 }, // Advertised
    { wch: 16 }, // Advertised Unit
    { wch: 13 }, // Efficiency %
    { wch: 14 }, // Price
    { wch: 13 }, // Price Unit
    { wch: 14 }, // Paid
    { wch: 13 }, // Paid Unit
    { wch: 14 }, // USDT Paid
  ];
}

async function loadWorkbook() {
  try { 
    return XLSX.read(await fs.readFile(RENTAL_EXPORT_PATH), { type: 'buffer' }); 
  }
  catch (error) { 
    if (error.code === 'ENOENT') return XLSX.utils.book_new(); 
    throw error; 
  }
}

// ============================================
// CREATE SHEET - CLEAN VERSION (NO DUPLICATES)
// ============================================
function createSheet(dataRows, headers, btcPriceUsd, sheetName) {
  // Start with clean slate
  const rows = [];
  
  // 1. HEADER
  rows.push(headers);
  
  // 2. DATA ROWS
  dataRows.forEach((row, idx) => {
    const rowNum = idx + 2;
    const paidUnit = row['Paid Unit'] || 'BTC';
    
    // USDT Paid - use Excel formula if BTC
    let usdtPaidValue = row['USDT Paid'] || '';
    if (paidUnit === 'BTC' && row.Paid && btcPriceUsd > 0) {
      usdtPaidValue = { f: `L${rowNum} * $P$1` };
    }
    
    rows.push([
      row.Date || '',
      row.Account || '',
      row['Rig Name'] || '',
      row.Algorithm || '',
      row.Start || '',
      row.End || '',
      row.Advertised || '',
      row['Advertised Unit'] || 'MH/s',
      row['Efficiency %'] || '',
      row.Price || '',
      row['Price Unit'] || 'BTC',
      row.Paid || '',
      paidUnit,
      usdtPaidValue,
    ]);
  });
  
  // 3. EMPTY ROW (spacing)
  if (dataRows.length > 0) {
    rows.push([]);
  }
  
  // 4. SUMMARY SECTION (at the bottom)
  if (dataRows.length > 0) {
    const lastRow = dataRows.length + 1;
    
    rows.push(['=== SUMMARY ===']);
    rows.push(['Total Paid (BTC)', { f: `SUM(L2:L${lastRow})` }]);
    rows.push(['Total USDT Paid', { f: `SUM(N2:N${lastRow})` }]);
    rows.push(['Avg Efficiency %', { f: `AVERAGE(I2:I${lastRow})` }]);
    rows.push(['Total Rentals', { f: `COUNTA(B2:B${lastRow})` }]);
    rows.push(['BTC Price (USD)', btcPriceUsd > 0 ? btcPriceUsd : 'N/A']);
  }
  
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  
  // Add BTC price in cell P1 for formulas
  if (btcPriceUsd > 0) {
    sheet['P1'] = { t: 'n', v: btcPriceUsd };
  }
  
  return sheet;
}

export async function exportMrrRentalsToXlsx(client = 'ALL') {
  const requestedClient = String(client || defaultMrrClient || 'ALL').toUpperCase();
  const snapshotDate = bangkokDate();
  const btcPriceUsd = await getBtcPrice();
  
  console.log(`[MRR export] Exporting for client: ${requestedClient}, BTC Price: $${btcPriceUsd}`);
  
  let activeRows = [];
  let dataSource = 'MRR API';
  let liveError = null;
  
  try {
    const result = await fetchAggregatedRentals({ all: true, includeInactive: true }, requestedClient);
    if (result.statusCode >= 200 && result.statusCode < 300 && result.data?.success) {
      const rentals = rentalsFrom(result);
      console.log(`[MRR export] Fetched ${rentals.length} rentals from MRR API`);
      
      // Log sample for debugging
      if (rentals.length > 0) {
        const sample = rentals[0];
        console.log('[MRR export] Sample hashrate:', JSON.stringify(sample.hashrate, null, 2));
        console.log('[MRR export] Sample price:', JSON.stringify(sample.price, null, 2));
        console.log('[MRR export] Sample paid:', sample.paid);
        console.log('[MRR export] Sample currency:', sample.currency);
        console.log('[MRR export] Sample mrrClient:', sample.mrrClient);
      }
      
      activeRows = rentals.map(rental => 
        toExportRow(rental, result.clientName || requestedClient, snapshotDate, btcPriceUsd)
      );
      
      console.log(`[MRR export] Processed ${activeRows.length} rows for export`);
    } else {
      liveError = result.data?.message || `MRR returned status ${result.statusCode}`;
    }
  } catch (error) {
    liveError = error.message;
    console.error('[MRR export] Error fetching rentals:', error.message);
  }

  if (activeRows.length === 0) {
    console.log('[MRR export] No rentals from API, using cached data');
    activeRows = await getCachedRentalRows(requestedClient, snapshotDate, btcPriceUsd);
    dataSource = 'monitor database';
  }
  
  if (activeRows.length === 0 && liveError) {
    throw new Error(liveError);
  }

  // Create a NEW workbook (not loading existing one to avoid duplication)
  const workbook = XLSX.utils.book_new();
  
  // Create sheets
  const currentSheet = createSheet(activeRows, RENTAL_HEADERS, btcPriceUsd, 'Current Rentals');
  const historySheet = createSheet(activeRows, RENTAL_HEADERS, btcPriceUsd, 'Daily Snapshots');
  
  setColumns(currentSheet);
  setColumns(historySheet);
  
  XLSX.utils.book_append_sheet(workbook, currentSheet, 'Current Rentals');
  XLSX.utils.book_append_sheet(workbook, historySheet, 'Daily Snapshots');
  
  await fs.mkdir(EXPORT_DIR, { recursive: true });
  XLSX.writeFile(workbook, RENTAL_EXPORT_PATH, { compression: true });
  
  console.log(`[MRR export] Exported ${activeRows.length} rentals to ${RENTAL_EXPORT_PATH} (source: ${dataSource})`);
  
  return { 
    path: RENTAL_EXPORT_PATH, 
    activeCount: activeRows.length, 
    snapshotDate, 
    client: requestedClient, 
    dataSource 
  };
}

let dailyTimer;
let lastDailyExportDate = '';

export function startDailyMrrRentalExport() {
  if (dailyTimer) return;
  const runIfDue = async () => {
    const dailyDate = bangkokDate();
    if (dailyDate === lastDailyExportDate) return;
    try {
      await exportMrrRentalsToXlsx('ALL');
      lastDailyExportDate = dailyDate;
      console.log(`[MRR export] Daily rental workbook updated for ${dailyDate}`);
    } catch (error) { 
      console.error('[MRR export] Daily workbook update failed:', error.message); 
    }
  };
  runIfDue();
  dailyTimer = setInterval(runIfDue, 15 * 60 * 1000);
}
/**
 * Test time entries API
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env
function loadEnv() {
  try {
    const envPath = join(__dirname, '.env');
    const envContent = readFileSync(envPath, 'utf-8');
    
    envContent.split('\n').forEach(line => {
      line = line.trim();
      if (line && !line.startsWith('#')) {
        const [key, ...valueParts] = line.split('=');
        const value = valueParts.join('=').replace(/^["']|["']$/g, '');
        process.env[key] = value;
      }
    });
    console.log('✅ Environment variables loaded from .env');
  } catch (error) {
    console.error('❌ Failed to load .env file:', error.message);
    process.exit(1);
  }
}

async function testTimeEntries() {
  loadEnv();
  
  const config = {
    clientId: process.env.CW_CLIENT_ID || process.env.VITE_CW_CLIENT_ID,
    publicKey: process.env.CW_PUBLIC_KEY || process.env.VITE_CW_PUBLIC_KEY,
    privateKey: process.env.CW_PRIVATE_KEY,
    baseUrl: process.env.CW_BASE_URL || process.env.VITE_CW_BASE_URL,
    companyId: process.env.CW_COMPANY_ID || process.env.VITE_CW_COMPANY_ID,
  };
  
  console.log('[Test] Config check:');
  console.log('  baseUrl:', config.baseUrl ? '✓' : '✗');
  console.log('  companyId:', config.companyId ? '✓' : '✗');
  console.log('  clientId:', config.clientId ? '✓' : '✗');
  
  if (!config.baseUrl) {
    console.error('❌ Missing baseUrl');
    return;
  }
  
  const codebase = process.env.CW_CODEBASE || 'v2025_1/';
  const authString = `${config.companyId}+${config.publicKey}:${config.privateKey}`;
  const auth = Buffer.from(authString).toString('base64');
  
  // Test with timeStart orderBy
  const url = `${config.baseUrl}/${codebase}apis/3.0/time/entries?page=1&pageSize=5&orderBy=timeStart%20desc`;
  console.log('\n[Test] Testing time entries with orderBy=timeStart desc');
  console.log('[Test] URL:', url);
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/vnd.connectwise.com+json',
        'Content-Type': 'application/json',
        'clientId': config.clientId,
      },
    });
    
    console.log('[Test] Status:', response.status);
    
    if (!response.ok) {
      const text = await response.text();
      console.log('❌ Error:', text);
      return;
    }
    
    const data = await response.json();
    console.log(`✅ Success! Got ${data.length} time entries`);
    
    if (data[0]) {
      console.log('\n[Test] Sample entry fields:', Object.keys(data[0]).join(', '));
      console.log('\n[Test] Sample entry:');
      console.log('  ID:', data[0].id);
      console.log('  Member ID:', data[0].member?.id);
      console.log('  Ticket ID:', data[0].ticket?.id);
      console.log('  Hours:', data[0].actualHours || data[0].hours);
      console.log('  Billable:', data[0].billableOption);
      console.log('  Notes:', (data[0].notes || '').substring(0, 100));
      console.log('  timeStart:', data[0].timeStart);
      console.log('  dateStart:', data[0].dateStart);
    }
  } catch (error) {
    console.error('❌ Fetch error:', error.message);
  }
}

testTimeEntries();


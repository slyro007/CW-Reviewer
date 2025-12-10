/**
 * Test fetching project tickets for Project #487
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadEnv() {
  const envPath = join(__dirname, '.env');
  const envContent = readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    line = line.trim();
    if (line && !line.startsWith('#')) {
      const eqIndex = line.indexOf('=');
      if (eqIndex > 0) {
        const key = line.substring(0, eqIndex).trim();
        const value = line.substring(eqIndex + 1).trim().replace(/^["']|["']$/g, '');
        process.env[key] = value;
      }
    }
  });
}

loadEnv();

const config = {
  clientId: process.env.CW_CLIENT_ID || process.env.VITE_CW_CLIENT_ID,
  publicKey: process.env.CW_PUBLIC_KEY || process.env.VITE_CW_PUBLIC_KEY,
  privateKey: process.env.CW_PRIVATE_KEY,
  baseUrl: process.env.CW_BASE_URL || process.env.VITE_CW_BASE_URL,
  companyId: process.env.CW_COMPANY_ID || process.env.VITE_CW_COMPANY_ID,
};
const codebase = process.env.CW_CODEBASE || 'v2025_1/';
const authString = `${config.companyId}+${config.publicKey}:${config.privateKey}`;
const auth = Buffer.from(authString).toString('base64');

async function request(endpoint, params = {}) {
  const url = new URL(`${config.baseUrl}/${codebase}apis/3.0${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) url.searchParams.append(key, String(value));
  });

  console.log(`[API] ${url.toString()}`);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/vnd.connectwise.com+json',
      'Content-Type': 'application/json',
      'clientId': config.clientId,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error (${response.status}): ${text.substring(0, 200)}`);
  }

  return response.json();
}

async function main() {
  console.log('Testing Project Tickets API for Project #487\n');

  // Method 1: Query /project/tickets with project/id filter
  console.log('='.repeat(70));
  console.log('METHOD 1: /project/tickets?conditions=project/id=487');
  console.log('='.repeat(70));
  
  try {
    const tickets = await request('/project/tickets', {
      conditions: 'project/id=487',
      pageSize: 50,
    });
    
    console.log(`\n✅ Found ${tickets.length} tickets in Project #487:\n`);
    
    tickets.forEach((t, i) => {
      console.log(`${i + 1}. #${t.id}: ${t.summary}`);
      console.log(`   Phase: ${t.phase?.name || 'N/A'} | Status: ${t.status?.name} | Resources: ${t.resources || 'N/A'}`);
    });
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }

  // Method 2: Get ALL project tickets (no filter)
  console.log('\n' + '='.repeat(70));
  console.log('METHOD 2: /project/tickets (all, limited to 20)');
  console.log('='.repeat(70));
  
  try {
    const tickets = await request('/project/tickets', {
      pageSize: 20,
      orderBy: 'id desc',
    });
    
    console.log(`\n✅ Found ${tickets.length} recent project tickets:\n`);
    
    tickets.forEach((t, i) => {
      console.log(`${i + 1}. #${t.id}: ${(t.summary || '').substring(0, 50)}`);
      console.log(`   Project: ${t.project?.name || 'N/A'} | Phase: ${t.phase?.name || 'N/A'}`);
    });
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

main().catch(console.error);


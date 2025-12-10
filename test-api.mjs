/**
 * Test script to verify ConnectWise API connectivity and search for dsolomon
 * Run with: node test-api.mjs
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
    console.log('Make sure .env exists in the project root');
    process.exit(1);
  }
}

// Simple ConnectWise client implementation for testing
class ConnectWiseClient {
  constructor(config) {
    this.config = config;
    this.codebase = null;
  }

  async getCodebase() {
    if (this.codebase) return this.codebase;

    try {
      let siteUrl = this.config.baseUrl.replace('https://', '');
      if (siteUrl.startsWith('api-')) {
        siteUrl = siteUrl.replace('api-', '');
      }
      
      const companyInfoUrl = `https://${siteUrl}/login/companyinfo/${this.config.companyId}`;
      console.log(`[Test] Fetching codebase from: ${companyInfoUrl}`);
      
      const response = await fetch(companyInfoUrl);
      if (response.ok) {
        const info = await response.json();
        this.codebase = info.Codebase || 'v4_6_release/';
        this.codebase = this.codebase.endsWith('/') ? this.codebase : `${this.codebase}/`;
        console.log(`[Test] Detected codebase: ${this.codebase}`);
        return this.codebase;
      }
    } catch (error) {
      console.warn('[Test] Could not determine codebase, using default:', error.message);
    }
    
    this.codebase = 'v4_6_release/';
    return this.codebase;
  }

  async request(endpoint, options = {}) {
    const { page = 1, pageSize = 1000, conditions, orderBy, fields } = options;
    
    if (!this.codebase) {
      this.codebase = await this.getCodebase();
    }
    
    const url = new URL(`${this.config.baseUrl}/${this.codebase}apis/3.0${endpoint}`);
    url.searchParams.append('page', page.toString());
    url.searchParams.append('pageSize', pageSize.toString());
    if (conditions) url.searchParams.append('conditions', conditions);
    if (orderBy) url.searchParams.append('orderBy', orderBy);
    if (fields) url.searchParams.append('fields', fields);

    const authString = `${this.config.companyId}+${this.config.publicKey}:${this.config.privateKey}`;
    const auth = Buffer.from(authString).toString('base64');

    console.log(`[Test] Making request to: ${url.toString()}`);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/vnd.connectwise.com+json',
        'Content-Type': 'application/json',
        'clientId': this.config.clientId,
      },
    });

    if (!response.ok) {
      let errorText = response.statusText;
      try {
        const errorBody = await response.text();
        if (errorBody) {
          try {
            const errorJson = JSON.parse(errorBody);
            errorText = errorJson.message || errorJson.error || errorBody;
          } catch {
            errorText = errorBody.length > 200 ? errorBody.substring(0, 200) + '...' : errorBody;
          }
        }
      } catch (e) {
        // ignore
      }
      throw new Error(`ConnectWise API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  async getMembers(options = {}) {
    const conditions = 'inactiveFlag=false';
    return this.request('/system/members', {
      ...options,
      conditions: options.conditions 
        ? `${conditions} AND ${options.conditions}`
        : conditions,
      fields: options.fields || 'id,identifier,firstName,lastName,emailAddress,inactiveFlag',
    });
  }
}

// Main test function
async function testConnectWiseAPI() {
  console.log('='.repeat(60));
  console.log('ConnectWise API Test');
  console.log('='.repeat(60));
  console.log();

  // Load environment variables
  loadEnv();
  console.log();

  // Get credentials
  const clientId = process.env.CW_CLIENT_ID || process.env.VITE_CW_CLIENT_ID;
  const publicKey = process.env.CW_PUBLIC_KEY || process.env.VITE_CW_PUBLIC_KEY;
  const privateKey = process.env.CW_PRIVATE_KEY;
  const baseUrl = process.env.CW_BASE_URL || process.env.VITE_CW_BASE_URL;
  const companyId = process.env.CW_COMPANY_ID || process.env.VITE_CW_COMPANY_ID;

  // Validate credentials
  console.log('[Test] Environment check:');
  console.log(`  clientId: ${clientId ? '✓ present' : '✗ missing'}`);
  console.log(`  publicKey: ${publicKey ? '✓ present' : '✗ missing'}`);
  console.log(`  privateKey: ${privateKey ? '✓ present' : '✗ missing'}`);
  console.log(`  baseUrl: ${baseUrl ? '✓ present' : '✗ missing'}`);
  console.log(`  companyId: ${companyId ? '✓ present' : '✗ missing'}`);
  console.log();

  if (!clientId || !publicKey || !privateKey || !baseUrl || !companyId) {
    console.error('❌ Missing required environment variables!');
    console.error('Please ensure all ConnectWise credentials are set in .env');
    process.exit(1);
  }

  try {
    // Create client
    console.log('[Test] Creating ConnectWise client...');
    const client = new ConnectWiseClient({
      clientId,
      publicKey,
      privateKey,
      baseUrl,
      companyId,
    });
    console.log('✅ Client created successfully');
    console.log();

    // Fetch members
    console.log('[Test] Fetching members from ConnectWise...');
    const startTime = Date.now();
    const members = await client.getMembers();
    const elapsed = Date.now() - startTime;
    
    console.log(`✅ Received ${members.length} members in ${elapsed}ms`);
    console.log();

    // Search for dsolomon
    console.log('='.repeat(60));
    console.log('Searching for "dsolomon"...');
    console.log('='.repeat(60));
    console.log();

    const dsolomon = members.find(m => 
      m.identifier?.toLowerCase().includes('dsolomon') ||
      m.firstName?.toLowerCase().includes('dsolomon') ||
      m.lastName?.toLowerCase().includes('dsolomon') ||
      m.emailAddress?.toLowerCase().includes('dsolomon')
    );

    if (dsolomon) {
      console.log('✅ FOUND dsolomon!');
      console.log();
      console.log('Member Details:');
      console.log(`  ID: ${dsolomon.id}`);
      console.log(`  Identifier: ${dsolomon.identifier}`);
      console.log(`  Name: ${dsolomon.firstName} ${dsolomon.lastName}`);
      console.log(`  Email: ${dsolomon.emailAddress}`);
      console.log(`  Inactive: ${dsolomon.inactiveFlag}`);
    } else {
      console.log('⚠️ dsolomon NOT FOUND');
      console.log();
      console.log('First 10 members:');
      members.slice(0, 10).forEach((m, i) => {
        console.log(`  ${i + 1}. ${m.identifier} - ${m.firstName} ${m.lastName} (${m.emailAddress})`);
      });
      
      if (members.length > 10) {
        console.log(`  ... and ${members.length - 10} more`);
      }
    }

    console.log();
    console.log('='.repeat(60));
    console.log('Test completed successfully!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error();
    console.error('❌ TEST FAILED');
    console.error('='.repeat(60));
    console.error('Error:', error.message);
    if (error.stack) {
      console.error();
      console.error('Stack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the test
testConnectWiseAPI().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});


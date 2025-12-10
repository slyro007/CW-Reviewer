/**
 * Comprehensive API Test Script
 * Tests all ConnectWise and OpenAI APIs needed for each tab
 * 
 * Run with: node test-all-apis.mjs
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================
// Environment Setup
// ============================================================

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
    return true;
  } catch (error) {
    console.error('❌ Failed to load .env file:', error.message);
    return false;
  }
}

// ============================================================
// ConnectWise API Client
// ============================================================

class ConnectWiseClient {
  constructor() {
    this.config = {
      clientId: process.env.CW_CLIENT_ID || process.env.VITE_CW_CLIENT_ID,
      publicKey: process.env.CW_PUBLIC_KEY || process.env.VITE_CW_PUBLIC_KEY,
      privateKey: process.env.CW_PRIVATE_KEY,
      baseUrl: process.env.CW_BASE_URL || process.env.VITE_CW_BASE_URL,
      companyId: process.env.CW_COMPANY_ID || process.env.VITE_CW_COMPANY_ID,
    };
    this.codebase = process.env.CW_CODEBASE || 'v2025_1/';
    
    const authString = `${this.config.companyId}+${this.config.publicKey}:${this.config.privateKey}`;
    this.auth = Buffer.from(authString).toString('base64');
  }

  async request(endpoint, params = {}) {
    const url = new URL(`${this.config.baseUrl}/${this.codebase}apis/3.0${endpoint}`);
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) url.searchParams.append(key, value);
    });

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${this.auth}`,
        'Accept': 'application/vnd.connectwise.com+json',
        'Content-Type': 'application/json',
        'clientId': this.config.clientId,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API error (${response.status}): ${text.substring(0, 200)}`);
    }

    return response.json();
  }

  async getMembers(limit = 10) {
    return this.request('/system/members', {
      page: 1,
      pageSize: limit,
      conditions: 'inactiveFlag=false',
      fields: 'id,identifier,firstName,lastName,emailAddress,inactiveFlag',
    });
  }

  async getTimeEntries(startDate, endDate, limit = 10) {
    const conditions = [];
    if (startDate) conditions.push(`timeStart >= [${startDate}]`);
    if (endDate) conditions.push(`timeStart <= [${endDate}]`);
    
    return this.request('/time/entries', {
      page: 1,
      pageSize: limit,
      conditions: conditions.length > 0 ? conditions.join(' AND ') : undefined,
      orderBy: 'timeStart desc',
      fields: 'id,member/id,ticket/id,hours,actualHours,billableOption,notes,timeStart,timeEnd',
    });
  }

  async getTickets(limit = 10) {
    return this.request('/service/tickets', {
      page: 1,
      pageSize: limit,
      orderBy: 'dateEntered desc',
      fields: 'id,summary,board/id,status/name,closedDate,closedFlag,dateEntered',
    });
  }

  async getBoards(limit = 50) {
    return this.request('/service/boards', {
      page: 1,
      pageSize: limit,
      fields: 'id,name',
    });
  }
}

// ============================================================
// OpenAI API Client
// ============================================================

class OpenAIClient {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
  }

  async generateAnalysis(systemPrompt, userPrompt) {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${text.substring(0, 200)}`);
    }

    const result = await response.json();
    return result.choices[0]?.message?.content || '';
  }
}

// ============================================================
// Test Functions
// ============================================================

async function testMembers(cw) {
  console.log('\n' + '='.repeat(60));
  console.log('📋 TEST: Members API (Used by: All Tabs)');
  console.log('='.repeat(60));
  
  try {
    const members = await cw.getMembers(5);
    console.log(`✅ Fetched ${members.length} members`);
    
    members.forEach((m, i) => {
      console.log(`   ${i + 1}. ${m.firstName} ${m.lastName} (${m.identifier}) - ID: ${m.id}`);
    });
    
    // Check for dsolomon
    const dsolomon = members.find(m => 
      m.identifier?.toLowerCase().includes('dsolomon') ||
      m.firstName?.toLowerCase().includes('daniel')
    );
    if (dsolomon) {
      console.log(`\n   🎯 Found target user: ${dsolomon.firstName} ${dsolomon.lastName} (ID: ${dsolomon.id})`);
    }
    
    return { success: true, count: members.length, sample: members[0] };
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function testTimeEntries(cw) {
  console.log('\n' + '='.repeat(60));
  console.log('⏱️  TEST: Time Entries API (Used by: Dashboard, Time Tracking, Notes, Trends)');
  console.log('='.repeat(60));
  
  try {
    // Get entries from last 30 days
    const endDate = new Date().toISOString();
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    console.log(`   Fetching entries from ${startDate.split('T')[0]} to ${endDate.split('T')[0]}`);
    
    const entries = await cw.getTimeEntries(startDate, endDate, 10);
    console.log(`✅ Fetched ${entries.length} time entries`);
    
    if (entries.length > 0) {
      const sample = entries[0];
      console.log(`\n   Sample entry:`);
      console.log(`   - ID: ${sample.id}`);
      console.log(`   - Member ID: ${sample.member?.id}`);
      console.log(`   - Ticket ID: ${sample.ticket?.id || 'N/A'}`);
      console.log(`   - Hours: ${sample.actualHours || sample.hours}`);
      console.log(`   - Billable: ${sample.billableOption}`);
      console.log(`   - Time: ${sample.timeStart}`);
      console.log(`   - Notes: ${(sample.notes || '').substring(0, 80)}...`);
      
      // Calculate stats
      const totalHours = entries.reduce((sum, e) => sum + (e.actualHours || e.hours || 0), 0);
      const billableEntries = entries.filter(e => e.billableOption === 'Billable');
      console.log(`\n   📊 Stats from sample:`);
      console.log(`   - Total hours: ${totalHours.toFixed(1)}`);
      console.log(`   - Billable entries: ${billableEntries.length}/${entries.length}`);
    }
    
    return { success: true, count: entries.length, sample: entries[0] };
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function testTickets(cw) {
  console.log('\n' + '='.repeat(60));
  console.log('🎫 TEST: Tickets API (Used by: Projects)');
  console.log('='.repeat(60));
  
  try {
    const tickets = await cw.getTickets(10);
    console.log(`✅ Fetched ${tickets.length} tickets`);
    
    if (tickets.length > 0) {
      const sample = tickets[0];
      console.log(`\n   Sample ticket:`);
      console.log(`   - ID: ${sample.id}`);
      console.log(`   - Summary: ${(sample.summary || '').substring(0, 60)}...`);
      console.log(`   - Board ID: ${sample.board?.id}`);
      console.log(`   - Status: ${sample.status?.name}`);
      console.log(`   - Closed: ${sample.closedFlag ? 'Yes' : 'No'}`);
      console.log(`   - Created: ${sample.dateEntered}`);
      
      // Calculate stats
      const closedCount = tickets.filter(t => t.closedFlag).length;
      console.log(`\n   📊 Stats from sample:`);
      console.log(`   - Open: ${tickets.length - closedCount}`);
      console.log(`   - Closed: ${closedCount}`);
    }
    
    return { success: true, count: tickets.length, sample: tickets[0] };
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function testBoards(cw) {
  console.log('\n' + '='.repeat(60));
  console.log('📁 TEST: Boards API (Used by: Projects)');
  console.log('='.repeat(60));
  
  try {
    const boards = await cw.getBoards(20);
    console.log(`✅ Fetched ${boards.length} boards`);
    
    boards.slice(0, 10).forEach((b, i) => {
      console.log(`   ${i + 1}. ${b.name} (ID: ${b.id})`);
    });
    
    if (boards.length > 10) {
      console.log(`   ... and ${boards.length - 10} more`);
    }
    
    return { success: true, count: boards.length, sample: boards[0] };
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function testOpenAI(openai) {
  console.log('\n' + '='.repeat(60));
  console.log('🤖 TEST: OpenAI API (Used by: Compare, Highlights, Performance Review, Export)');
  console.log('='.repeat(60));
  
  if (!process.env.OPENAI_API_KEY) {
    console.log('⚠️  OPENAI_API_KEY not configured - skipping');
    return { success: false, error: 'API key not configured' };
  }
  
  try {
    console.log('   Testing with a simple analysis request...');
    
    const systemPrompt = 'You are an expert at analyzing MSP engineer performance. Be concise.';
    const userPrompt = `Given an engineer who logged 40 hours this week with 80% billable and 90% entries with notes, provide a 2-sentence performance summary.`;
    
    const startTime = Date.now();
    const response = await openai.generateAnalysis(systemPrompt, userPrompt);
    const elapsed = Date.now() - startTime;
    
    console.log(`✅ OpenAI response received in ${elapsed}ms`);
    console.log(`\n   Response preview:`);
    console.log(`   "${response.substring(0, 200)}${response.length > 200 ? '...' : ''}"`);
    
    return { success: true, responseTime: elapsed, sample: response.substring(0, 100) };
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// ============================================================
// Main Test Runner
// ============================================================

async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         CW REVIEWER - COMPREHENSIVE API TEST               ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  // Load environment
  console.log('\n📁 Loading environment variables...');
  if (!loadEnv()) {
    console.error('Failed to load environment. Exiting.');
    process.exit(1);
  }
  console.log('✅ Environment loaded');
  
  // Check required variables
  const required = ['CW_CLIENT_ID', 'CW_PUBLIC_KEY', 'CW_PRIVATE_KEY', 'CW_BASE_URL', 'CW_COMPANY_ID'];
  const missing = required.filter(key => !process.env[key] && !process.env[`VITE_${key}`]);
  
  if (missing.length > 0) {
    console.error(`❌ Missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
  }
  
  console.log('\n📋 Configuration:');
  console.log(`   Base URL: ${process.env.CW_BASE_URL || process.env.VITE_CW_BASE_URL}`);
  console.log(`   Company: ${process.env.CW_COMPANY_ID || process.env.VITE_CW_COMPANY_ID}`);
  console.log(`   Codebase: ${process.env.CW_CODEBASE || 'v2025_1/'}`);
  console.log(`   OpenAI: ${process.env.OPENAI_API_KEY ? '✓ configured' : '✗ not configured'}`);
  
  // Initialize clients
  const cw = new ConnectWiseClient();
  const openai = new OpenAIClient();
  
  // Run tests
  const results = {};
  
  results.members = await testMembers(cw);
  results.timeEntries = await testTimeEntries(cw);
  results.tickets = await testTickets(cw);
  results.boards = await testBoards(cw);
  results.openai = await testOpenAI(openai);
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  
  const tests = [
    { name: 'Members API', result: results.members, tabs: 'All tabs' },
    { name: 'Time Entries API', result: results.timeEntries, tabs: 'Dashboard, Time Tracking, Notes, Trends, Compare, Highlights, Performance Review, Export' },
    { name: 'Tickets API', result: results.tickets, tabs: 'Projects, Highlights' },
    { name: 'Boards API', result: results.boards, tabs: 'Projects' },
    { name: 'OpenAI API', result: results.openai, tabs: 'Compare, Highlights, Performance Review, Export' },
  ];
  
  tests.forEach(test => {
    const status = test.result.success ? '✅ PASS' : '❌ FAIL';
    console.log(`${status}  ${test.name}`);
    if (!test.result.success) {
      console.log(`        Error: ${test.result.error}`);
    }
  });
  
  const passed = tests.filter(t => t.result.success).length;
  const total = tests.length;
  
  console.log('\n' + '='.repeat(60));
  console.log(`Result: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('\n🎉 All APIs working! Ready to deploy.');
  } else {
    console.log('\n⚠️  Some APIs need attention. Check errors above.');
  }
  
  console.log('='.repeat(60));
}

// Run tests
runAllTests().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});


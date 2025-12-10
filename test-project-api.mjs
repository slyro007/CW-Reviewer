/**
 * Project Investigation Test Script
 * 
 * Investigates ticket #1290140 and ConnectWise project structure
 * to understand where project data lives.
 * 
 * Run with: node test-project-api.mjs
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
        const eqIndex = line.indexOf('=');
        if (eqIndex > 0) {
          const key = line.substring(0, eqIndex).trim();
          const value = line.substring(eqIndex + 1).trim().replace(/^["']|["']$/g, '');
          process.env[key] = value;
        }
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
      if (value !== undefined) url.searchParams.append(key, String(value));
    });

    console.log(`   [API] ${endpoint}`);

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
      throw new Error(`API error (${response.status}): ${text.substring(0, 300)}`);
    }

    return response.json();
  }

  // Get a specific ticket by ID (with ALL fields)
  async getTicketById(ticketId) {
    return this.request(`/service/tickets/${ticketId}`);
  }

  // Get all service boards
  async getBoards() {
    return this.request('/service/boards', {
      pageSize: 100,
    });
  }

  // Get tickets from a specific board
  async getTicketsByBoard(boardId, limit = 10) {
    return this.request('/service/tickets', {
      pageSize: limit,
      conditions: `board/id=${boardId}`,
      orderBy: 'dateEntered desc',
    });
  }

  // Check if projects API exists
  async getProjects(limit = 10) {
    return this.request('/project/projects', {
      pageSize: limit,
      orderBy: 'id desc',
    });
  }

  // Get project tickets (tickets linked to projects)
  async getProjectTickets(projectId) {
    return this.request(`/project/projects/${projectId}/tickets`, {
      pageSize: 50,
    });
  }

  // Get time entries for a specific ticket
  async getTimeEntriesForTicket(ticketId) {
    return this.request('/time/entries', {
      conditions: `ticket/id=${ticketId}`,
      pageSize: 50,
    });
  }
}

// ============================================================
// Investigation Functions
// ============================================================

async function investigateTicket1290140(cw) {
  console.log('\n' + '='.repeat(70));
  console.log('🔍 INVESTIGATING TICKET #1290140');
  console.log('   "CD Bradshaw- Scanning to Email Not Working (CD Bradshaw Onboarding)"');
  console.log('='.repeat(70));

  try {
    const ticket = await cw.getTicketById(1290140);
    
    console.log('\n📋 TICKET DETAILS:');
    console.log('-'.repeat(50));
    
    // Print all fields to understand the structure
    console.log(JSON.stringify(ticket, null, 2));
    
    console.log('\n📊 KEY FIELDS:');
    console.log(`   ID: ${ticket.id}`);
    console.log(`   Summary: ${ticket.summary}`);
    console.log(`   Board: ${ticket.board?.name} (ID: ${ticket.board?.id})`);
    console.log(`   Status: ${ticket.status?.name}`);
    console.log(`   Type: ${ticket.type?.name || 'N/A'}`);
    console.log(`   SubType: ${ticket.subType?.name || 'N/A'}`);
    console.log(`   Item: ${ticket.item?.name || 'N/A'}`);
    console.log(`   Company: ${ticket.company?.name} (ID: ${ticket.company?.id})`);
    console.log(`   Site: ${ticket.site?.name || 'N/A'}`);
    console.log(`   Owner: ${ticket.owner?.identifier || 'N/A'}`);
    console.log(`   Priority: ${ticket.priority?.name || 'N/A'}`);
    console.log(`   Date Entered: ${ticket.dateEntered}`);
    console.log(`   Closed: ${ticket.closedFlag ? 'Yes' : 'No'}`);
    console.log(`   Resolved: ${ticket.resolvedFlag ? 'Yes' : 'No'}`);
    console.log(`   Project: ${ticket.project?.id || 'N/A'}`);
    
    // Get time entries for this ticket
    console.log('\n⏱️  TIME ENTRIES FOR THIS TICKET:');
    const timeEntries = await cw.getTimeEntriesForTicket(1290140);
    console.log(`   Found ${timeEntries.length} time entries`);
    
    if (timeEntries.length > 0) {
      timeEntries.slice(0, 3).forEach((entry, i) => {
        console.log(`   ${i + 1}. ${entry.member?.identifier} - ${entry.actualHours || entry.hours}h on ${entry.timeStart?.split('T')[0]}`);
      });
    }
    
    return ticket;
  } catch (error) {
    console.log(`❌ Error fetching ticket: ${error.message}`);
    return null;
  }
}

async function listAllBoards(cw) {
  console.log('\n' + '='.repeat(70));
  console.log('📁 ALL SERVICE BOARDS');
  console.log('='.repeat(70));

  try {
    const boards = await cw.getBoards();
    
    console.log(`\nFound ${boards.length} boards:\n`);
    
    boards.forEach((board, i) => {
      console.log(`   ${String(i + 1).padStart(2)}. ${board.name.padEnd(40)} (ID: ${board.id})`);
    });
    
    // Look for project-related boards
    const projectBoards = boards.filter(b => 
      b.name.toLowerCase().includes('project') ||
      b.name.toLowerCase().includes('onboard') ||
      b.name.toLowerCase().includes('implementation')
    );
    
    if (projectBoards.length > 0) {
      console.log('\n🎯 PROJECT-RELATED BOARDS:');
      projectBoards.forEach(b => {
        console.log(`   - ${b.name} (ID: ${b.id})`);
      });
    }
    
    return boards;
  } catch (error) {
    console.log(`❌ Error fetching boards: ${error.message}`);
    return [];
  }
}

async function checkProjectsAPI(cw) {
  console.log('\n' + '='.repeat(70));
  console.log('🗂️  CHECKING CONNECTWISE PROJECTS API');
  console.log('='.repeat(70));

  try {
    const projects = await cw.getProjects(20);
    
    console.log(`\n✅ Projects API exists! Found ${projects.length} projects:\n`);
    
    projects.forEach((project, i) => {
      console.log(`   ${String(i + 1).padStart(2)}. ${(project.name || 'Unnamed').substring(0, 50).padEnd(50)}`);
      console.log(`       ID: ${project.id} | Status: ${project.status?.name || 'N/A'} | Company: ${project.company?.name || 'N/A'}`);
      console.log(`       Manager: ${project.manager?.identifier || 'N/A'} | Board: ${project.board?.name || 'N/A'}`);
      if (project.estimatedStart || project.estimatedEnd) {
        console.log(`       Estimated: ${project.estimatedStart?.split('T')[0] || '?'} to ${project.estimatedEnd?.split('T')[0] || '?'}`);
      }
      console.log();
    });
    
    // If we found projects, show the first one in detail
    if (projects.length > 0) {
      console.log('\n📋 SAMPLE PROJECT FULL STRUCTURE:');
      console.log('-'.repeat(50));
      console.log(JSON.stringify(projects[0], null, 2));
    }
    
    return projects;
  } catch (error) {
    console.log(`❌ Projects API error: ${error.message}`);
    console.log('\n   This might mean:');
    console.log('   - ConnectWise Projects module is not enabled');
    console.log('   - The API key doesn\'t have access to Projects');
    console.log('   - Projects might be managed differently in this instance');
    return [];
  }
}

async function getTicketsFromTargetBoard(cw, ticket) {
  if (!ticket?.board?.id) {
    console.log('\n⚠️  Cannot check board tickets - no board found on target ticket');
    return;
  }

  console.log('\n' + '='.repeat(70));
  console.log(`📁 SAMPLE TICKETS FROM BOARD: "${ticket.board.name}" (ID: ${ticket.board.id})`);
  console.log('='.repeat(70));

  try {
    const tickets = await cw.getTicketsByBoard(ticket.board.id, 10);
    
    console.log(`\nFound ${tickets.length} recent tickets on this board:\n`);
    
    tickets.forEach((t, i) => {
      console.log(`   ${String(i + 1).padStart(2)}. #${t.id} - ${(t.summary || 'No summary').substring(0, 50)}`);
      console.log(`       Status: ${t.status?.name || 'N/A'} | Type: ${t.type?.name || 'N/A'}`);
    });
    
    return tickets;
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return [];
  }
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║         CW REVIEWER - PROJECT DATA INVESTIGATION                   ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');

  // Load environment
  console.log('\n📁 Loading environment...');
  if (!loadEnv()) {
    process.exit(1);
  }
  console.log('✅ Environment loaded');

  const cw = new ConnectWiseClient();
  console.log(`\n📋 Configuration:`);
  console.log(`   Base URL: ${cw.config.baseUrl}`);
  console.log(`   Company: ${cw.config.companyId}`);
  console.log(`   Codebase: ${cw.codebase}`);

  // 1. Investigate the target ticket
  const ticket = await investigateTicket1290140(cw);
  
  // 2. List all boards
  await listAllBoards(cw);
  
  // 3. Check if Projects API exists
  await checkProjectsAPI(cw);
  
  // 4. Get sample tickets from the same board as target ticket
  await getTicketsFromTargetBoard(cw, ticket);

  console.log('\n' + '='.repeat(70));
  console.log('✅ INVESTIGATION COMPLETE');
  console.log('='.repeat(70));
  console.log('\nBased on the above data, determine:');
  console.log('1. Which board(s) contain the "projects" the user wants to track');
  console.log('2. Whether to use /service/tickets or /project/projects API');
  console.log('3. What fields are available for project analytics');
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});


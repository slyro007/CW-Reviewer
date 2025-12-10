/**
 * Find Ticket #1290140 Investigation
 * 
 * Searches for the ticket across different ConnectWise endpoints
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

  // Search service tickets by summary
  async searchServiceTickets(searchTerm, limit = 50) {
    return this.request('/service/tickets', {
      pageSize: limit,
      conditions: `summary contains '${searchTerm}'`,
    });
  }

  // Get all projects
  async getProjects(limit = 100) {
    return this.request('/project/projects', {
      pageSize: limit,
      orderBy: 'id desc',
    });
  }

  // Get project tickets
  async getProjectTickets(projectId) {
    return this.request(`/project/projects/${projectId}/tickets`, {
      pageSize: 200,
    });
  }

  // Get project by ID
  async getProject(projectId) {
    return this.request(`/project/projects/${projectId}`);
  }

  // Search for ticket by ID across service tickets
  async getServiceTicketById(ticketId) {
    return this.request(`/service/tickets/${ticketId}`);
  }

  // Get time entries for a charge code (project ticket)
  async getProjectTicketById(ticketId) {
    return this.request(`/project/tickets/${ticketId}`);
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║         FIND TICKET #1290140                                       ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');

  loadEnv();
  const cw = new ConnectWiseClient();

  // Method 1: Try as service ticket
  console.log('\n' + '='.repeat(70));
  console.log('1️⃣  CHECKING SERVICE TICKETS API');
  console.log('='.repeat(70));
  
  try {
    const ticket = await cw.getServiceTicketById(1290140);
    console.log('✅ Found as SERVICE TICKET!');
    console.log(JSON.stringify(ticket, null, 2));
  } catch (error) {
    console.log('❌ Not found in service tickets:', error.message.substring(0, 100));
  }

  // Method 2: Try as project ticket
  console.log('\n' + '='.repeat(70));
  console.log('2️⃣  CHECKING PROJECT TICKETS API');
  console.log('='.repeat(70));
  
  try {
    const ticket = await cw.getProjectTicketById(1290140);
    console.log('✅ Found as PROJECT TICKET!');
    console.log(JSON.stringify(ticket, null, 2));
  } catch (error) {
    console.log('❌ Not found in project tickets:', error.message.substring(0, 100));
  }

  // Method 3: Search by summary text
  console.log('\n' + '='.repeat(70));
  console.log('3️⃣  SEARCHING BY SUMMARY TEXT "CD Bradshaw"');
  console.log('='.repeat(70));
  
  try {
    const tickets = await cw.searchServiceTickets('CD Bradshaw', 20);
    console.log(`Found ${tickets.length} service tickets with "CD Bradshaw":`);
    
    tickets.forEach((t, i) => {
      console.log(`\n   ${i + 1}. Ticket #${t.id}`);
      console.log(`      Summary: ${t.summary?.substring(0, 60)}...`);
      console.log(`      Board: ${t.board?.name} (ID: ${t.board?.id})`);
      console.log(`      Status: ${t.status?.name}`);
    });
  } catch (error) {
    console.log('❌ Search failed:', error.message);
  }

  // Method 4: Look through CD Bradshaw projects
  console.log('\n' + '='.repeat(70));
  console.log('4️⃣  SEARCHING CD BRADSHAW PROJECTS');
  console.log('='.repeat(70));
  
  try {
    const projects = await cw.getProjects(100);
    const cdbProjects = projects.filter(p => 
      p.name?.toLowerCase().includes('bradshaw') || 
      p.company?.name?.toLowerCase().includes('bradshaw')
    );
    
    console.log(`Found ${cdbProjects.length} CD Bradshaw projects:`);
    
    for (const project of cdbProjects) {
      console.log(`\n   📁 Project #${project.id}: ${project.name}`);
      console.log(`      Status: ${project.status?.name}`);
      console.log(`      Company: ${project.company?.name}`);
      
      // Get tickets for this project
      try {
        const tickets = await cw.getProjectTickets(project.id);
        console.log(`      Tickets in project: ${tickets.length}`);
        
        // Look for our target ticket
        const target = tickets.find(t => t.id === 1290140);
        if (target) {
          console.log('\n   🎯🎯🎯 FOUND TARGET TICKET! 🎯🎯🎯');
          console.log(JSON.stringify(target, null, 2));
        }
        
        // Show first few tickets
        tickets.slice(0, 5).forEach(t => {
          console.log(`         - #${t.id}: ${t.summary?.substring(0, 50)}...`);
        });
        if (tickets.length > 5) {
          console.log(`         ... and ${tickets.length - 5} more`);
        }
      } catch (err) {
        console.log(`      ❌ Could not get tickets: ${err.message.substring(0, 50)}`);
      }
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
  }

  // Method 5: Check "Onboarding Projects" board for tickets
  console.log('\n' + '='.repeat(70));
  console.log('5️⃣  CHECKING ONBOARDING PROJECTS BOARD (ID: 19)');
  console.log('='.repeat(70));
  
  try {
    const tickets = await cw.request('/service/tickets', {
      pageSize: 50,
      conditions: "board/id=19 AND summary contains 'Bradshaw'",
    });
    
    console.log(`Found ${tickets.length} tickets on Onboarding Projects board:`);
    tickets.forEach(t => {
      console.log(`   - #${t.id}: ${t.summary?.substring(0, 60)}`);
    });
  } catch (error) {
    console.log('❌ Error:', error.message);
  }

  console.log('\n' + '='.repeat(70));
  console.log('✅ INVESTIGATION COMPLETE');
  console.log('='.repeat(70));
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});


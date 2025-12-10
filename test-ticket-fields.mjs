import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env file manually
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
    console.error('Failed to load .env file:', error.message);
    return false;
  }
}

loadEnv();

const baseUrl = process.env.CW_BASE_URL || process.env.VITE_CW_BASE_URL;
const clientId = process.env.CW_CLIENT_ID || process.env.VITE_CW_CLIENT_ID;
const publicKey = process.env.CW_PUBLIC_KEY || process.env.VITE_CW_PUBLIC_KEY;
const privateKey = process.env.CW_PRIVATE_KEY;
const companyId = process.env.CW_COMPANY_ID || process.env.VITE_CW_COMPANY_ID;
const codebase = process.env.CW_CODEBASE || 'v2025_1/';

const authString = `${companyId}+${publicKey}:${privateKey}`;
const auth = Buffer.from(authString).toString('base64');

// Fetch tickets with ALL fields to see what's available for project analysis
async function testTickets() {
  console.log('Testing ticket fields for Project Board...\n');
  
  // First, get Project Board ID
  const boardsUrl = `${baseUrl}/${codebase}apis/3.0/service/boards?conditions=name='Project Board'`;
  console.log('Fetching Project Board ID...');
  
  const boardResponse = await fetch(boardsUrl, {
    headers: {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/vnd.connectwise.com+json',
      'Content-Type': 'application/json',
      'clientId': clientId
    }
  });
  
  const boards = await boardResponse.json();
  console.log('Boards found:', boards);
  
  if (!boards.length) {
    console.log('No Project Board found!');
    return;
  }
  
  const projectBoardId = boards[0].id;
  console.log(`\nProject Board ID: ${projectBoardId}`);
  
  // Now fetch tickets without restricting fields to see ALL available
  // Try without board filter first to get ANY ticket
  const ticketsUrl = `${baseUrl}/${codebase}apis/3.0/service/tickets?pageSize=3`;
  console.log('\nFetching sample tickets (any board)...');
  
  const response = await fetch(ticketsUrl, {
    headers: {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/vnd.connectwise.com+json',
      'Content-Type': 'application/json',
      'clientId': clientId
    }
  });
  
  if (!response.ok) {
    const text = await response.text();
    console.error('Error:', response.status, text);
    return;
  }
  
  const data = await response.json();
  console.log(`\n=== Got ${data.length} tickets from Project Board ===\n`);
  
  if (data.length > 0) {
    console.log('Sample ticket (ALL FIELDS):');
    console.log(JSON.stringify(data[0], null, 2));
    
    console.log('\n=== Key Fields for Phase/Type Analysis ===');
    const ticket = data[0];
    console.log('status:', JSON.stringify(ticket.status, null, 2));
    console.log('type:', JSON.stringify(ticket.type, null, 2));
    console.log('subType:', JSON.stringify(ticket.subType, null, 2));
    console.log('item:', JSON.stringify(ticket.item, null, 2));
    console.log('priority:', JSON.stringify(ticket.priority, null, 2));
    console.log('severity:', JSON.stringify(ticket.severity, null, 2));
    console.log('impact:', JSON.stringify(ticket.impact, null, 2));
    console.log('owner:', JSON.stringify(ticket.owner, null, 2));
    console.log('company:', JSON.stringify(ticket.company, null, 2));
    console.log('project:', JSON.stringify(ticket.project, null, 2));
    console.log('phase:', JSON.stringify(ticket.phase, null, 2));
  }
}

testTickets().catch(console.error);


import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Initialize Supabase with the ANON key (since RLS is disabled, this works and is safer for your setup)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// 1. GET Method (For Browser Testing)
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const phone = searchParams.get('phone'); // e.g., "919988776655"
  
  if (!phone) return NextResponse.json({ error: 'Please add ?phone=YOUR_NUMBER to the URL' });

  return await updateClientStatus(phone);
}

// 2. POST Method (For WhatsApp)
export async function POST(request) {
  try {
    const formData = await request.formData();
    const From = formData.get('From') || ''; // "whatsapp:+91..."
    const Body = formData.get('Body') || ''; // "DONE"

    // Clean the phone number (Remove 'whatsapp:' and '+')
    const cleanPhone = From.replace('whatsapp:', '').replace('+', ''); 

    // Check if message contains "done" (Case insensitive)
    if (Body.toLowerCase().includes('done')) {
      return await updateClientStatus(cleanPhone);
    }

    return NextResponse.json({ message: 'Message was not DONE' });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// 3. The Logic (Shared)
async function updateClientStatus(phone) {
  console.log("🔍 Looking for client with phone:", phone);

  // Try to match the number (with OR without 91 prefix just in case)
  // We perform a "partial match" or check variations
  const { data, error } = await supabase
    .from('clients')
    .update({ status: 'DONE' })
    .or(`phone.eq.+${phone},phone.eq.${phone}`) // Try both "+91..." and "91..."
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  
  if (data.length === 0) {
    return NextResponse.json({ 
      status: 'Failed', 
      message: 'Client not found', 
      checked_number: phone 
    });
  }

  return NextResponse.json({ 
    status: 'Success', 
    client: data[0].name, 
    new_status: 'DONE' 
  });
}
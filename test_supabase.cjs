const { createClient } = require('@supabase/supabase-js');

const url = 'https://skpdqfmuzhlviovnhuix.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNrcGRxZm11emhsdmlvdm5odWl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NTc3MjksImV4cCI6MjEwMjUzMzcyOX0.vBxx6E2SQ12xBt-fJPzr9NfRFAr9yuJqZ5QysdRgnF0';

const supabase = createClient(url, key);

async function testConnection() {
  console.log('Testing connection to Supabase:', url);
  try {
    const { data, error } = await supabase.from('assignments').select('count', { count: 'exact' });
    if (error) {
      console.log('Table "assignments" status:', error.message);
      if (error.message.includes('does not exist')) {
        console.log('💡 Bảng chưa tồn tại trên Supabase. Cần chạy file supabase_schema.sql trên Supabase SQL Editor.');
      }
    } else {
      console.log('✅ Kết nối thành công! Bảng assignments đã sẵn sàng trên Supabase.');
    }
  } catch (err) {
    console.error('Connection error:', err);
  }
}

testConnection();

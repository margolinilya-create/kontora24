import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    throw new Error('VITE_SUPABASE_URL is required in production')
  }
  console.warn('VITE_SUPABASE_URL is not set. Supabase features will not work.')
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
)

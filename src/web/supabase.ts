import { createClient } from '@supabase/supabase-js';
import { urlBase } from '../shared/url';

export const supabase = createClient(urlBase(import.meta.env.VITE_SUPABASE_URL), (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim());

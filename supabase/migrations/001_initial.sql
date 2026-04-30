-- Kontora24 initial schema
-- Profiles (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin','manager','designer','printer','assembler')),
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, role, display_name)
  VALUES (NEW.id, 'manager', COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Clients
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  comment TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number SERIAL,
  client_id UUID REFERENCES clients(id),
  order_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  width_mm NUMERIC NOT NULL,
  height_mm NUMERIC NOT NULL,
  qty INTEGER NOT NULL,
  design_variants INTEGER DEFAULT 1,
  need_lam BOOLEAN DEFAULT false,
  lam_type TEXT,
  cost_materials NUMERIC,
  cost_labor NUMERIC,
  cost_total NUMERIC,
  markup NUMERIC,
  discount_pct NUMERIC,
  price_final NUMERIC,
  price_per_unit NUMERIC,
  prod_days INTEGER,
  assigned_to UUID REFERENCES profiles(id),
  created_by UUID REFERENCES profiles(id),
  deadline DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Order status history
CREATE TABLE IF NOT EXISTS order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Materials
CREATE TABLE IF NOT EXISTS materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  stock_qty NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL,
  min_qty NUMERIC DEFAULT 0,
  price_per_unit NUMERIC,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Material transactions
CREATE TABLE IF NOT EXISTS material_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID REFERENCES materials(id),
  order_id UUID REFERENCES orders(id),
  delta NUMERIC NOT NULL,
  reason TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Settings (key-value)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS Policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_transactions ENABLE ROW LEVEL SECURITY;

-- Profiles: all authenticated can read
CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE TO authenticated USING (id = auth.uid());

-- Orders: all authenticated can read
CREATE POLICY "orders_select" ON orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "orders_insert" ON orders FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
  );
CREATE POLICY "orders_update" ON orders FOR UPDATE TO authenticated USING (true);

-- Clients: manager/admin only
CREATE POLICY "clients_select" ON clients FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')));
CREATE POLICY "clients_insert" ON clients FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')));
CREATE POLICY "clients_update" ON clients FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')));

-- Materials: all read, admin write
CREATE POLICY "materials_select" ON materials FOR SELECT TO authenticated USING (true);
CREATE POLICY "materials_insert" ON materials FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "materials_update" ON materials FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Settings: all read, admin write
CREATE POLICY "settings_select" ON settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings_update" ON settings FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Order status history: all read
CREATE POLICY "order_status_history_select" ON order_status_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "order_status_history_insert" ON order_status_history FOR INSERT TO authenticated WITH CHECK (true);

-- Material transactions: all read
CREATE POLICY "material_transactions_select" ON material_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "material_transactions_insert" ON material_transactions FOR INSERT TO authenticated WITH CHECK (true);

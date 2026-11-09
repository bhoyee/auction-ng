-- T15e Lot setup: categories, pickup locations, bins, conditions, suppliers
-- and brands. Changes apply to new lots only.

-- Categories ---------------------------------------------------------------
ALTER TABLE categories
  ADD COLUMN icon varchar(32) NOT NULL DEFAULT 'tag',
  ADD COLUMN description varchar(240),
  ADD COLUMN sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN default_run_time_minutes integer CHECK (default_run_time_minutes IN (360,720,1440,2880,4320)),
  ADD COLUMN min_start_price_kobo bigint CHECK (min_start_price_kobo >= 0),
  ADD COLUMN min_photos integer CHECK (min_photos BETWEEN 0 AND 20),
  ADD COLUMN is_visible boolean NOT NULL DEFAULT true,
  -- Subcategories inherit their parent's fields and allowed conditions until
  -- they are changed.
  ADD COLUMN fields_inherited boolean NOT NULL DEFAULT true,
  ADD COLUMN conditions_inherited boolean NOT NULL DEFAULT true;
CREATE UNIQUE INDEX categories_sibling_name_key ON categories (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
CREATE INDEX categories_tree_order_idx ON categories (parent_id, sort_order, id);

CREATE TABLE category_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  name varchar(60) NOT NULL,
  key varchar(60) NOT NULL CHECK (key ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  type varchar(12) NOT NULL CHECK (type IN ('text','list','number','boolean')),
  options text[] NOT NULL DEFAULT '{}',
  help_text varchar(160),
  required boolean NOT NULL DEFAULT false,
  show_to_buyers boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  UNIQUE (category_id, key)
);
CREATE INDEX category_fields_order_idx ON category_fields (category_id, sort_order, id);

-- Conditions: a fixed set of keys that buyer filters rely on; staff edit the
-- wording, colour, order and on/off.
CREATE TABLE conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key varchar(24) NOT NULL UNIQUE CHECK (key IN ('new','like_new','open_box','damaged','untested')),
  label varchar(40) NOT NULL,
  meaning varchar(200) NOT NULL,
  colour varchar(12) NOT NULL CHECK (colour IN ('green','indigo','blue','amber','red','grey')),
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX conditions_label_key ON conditions (lower(label));
INSERT INTO conditions (key, label, meaning, colour, sort_order) VALUES
  ('new', 'New', 'Unused, in the original sealed packaging.', 'green', 1),
  ('like_new', 'Like new', 'Opened but unused or barely used, with no visible wear.', 'indigo', 2),
  ('open_box', 'Open box', 'Box opened or damaged; the item works and may be missing small extras.', 'blue', 3),
  ('damaged', 'Damaged', 'Visible damage or a known fault, described in the listing.', 'amber', 4),
  ('untested', 'Untested', 'Not checked by staff. Sold as seen, with no promise that it works.', 'grey', 5);

CREATE TABLE category_conditions (
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  condition_id uuid NOT NULL REFERENCES conditions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  PRIMARY KEY (category_id, condition_id)
);

-- Pickup locations ---------------------------------------------------------
ALTER TABLE locations
  ADD COLUMN landmark varchar(160),
  ADD COLUMN phone varchar(20),
  ADD COLUMN lat numeric(9,6) CHECK (lat BETWEEN -90 AND 90),
  ADD COLUMN lng numeric(9,6) CHECK (lng BETWEEN -180 AND 180),
  ADD COLUMN status varchar(8) NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  ADD COLUMN opens_on date,
  ADD COLUMN slot_minutes integer NOT NULL DEFAULT 30 CHECK (slot_minutes BETWEEN 10 AND 240),
  ADD COLUMN id_required boolean NOT NULL DEFAULT true,
  ADD COLUMN delivery_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN bin_required_to_publish boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX locations_name_key ON locations (lower(name));

CREATE TABLE location_opening_hours (
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  day varchar(10) NOT NULL CHECK (day IN ('monday','tuesday','wednesday','thursday','friday','saturday','sunday','holiday')),
  opens time,
  closes time,
  PRIMARY KEY (location_id, day),
  CHECK ((opens IS NULL) = (closes IS NULL) AND (opens IS NULL OR opens < closes))
);

CREATE TABLE location_staff (
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  PRIMARY KEY (location_id, user_id)
);
CREATE INDEX location_staff_user_idx ON location_staff (user_id);

-- A bin is just a named spot (a shelf, a cage, a corner of the floor).
CREATE TABLE bins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  code varchar(20) NOT NULL CHECK (code ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$'),
  note varchar(120),
  capacity integer CHECK (capacity >= 1),
  accepts_new_lots boolean NOT NULL DEFAULT true,
  deleted_at timestamptz(3),
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX bins_location_code_key ON bins (location_id, code) WHERE deleted_at IS NULL;
CREATE INDEX bins_location_order_idx ON bins (location_id, code, id) WHERE deleted_at IS NULL;

-- Suppliers and brands -----------------------------------------------------
CREATE TABLE suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL,
  type varchar(24) NOT NULL CHECK (type IN ('marketplace_returns','retailer','individual')),
  contact_name varchar(120),
  phone varchar(20),
  email varchar(200),
  payment_terms varchar(120),
  notes varchar(1000),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX suppliers_name_key ON suppliers (lower(name));
CREATE INDEX suppliers_order_idx ON suppliers (active, name, id);

CREATE TABLE brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(80) NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX brands_name_key ON brands (lower(name));
CREATE INDEX brands_order_idx ON brands (name, id);

CREATE TABLE brand_categories (
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  PRIMARY KEY (brand_id, category_id)
);
CREATE INDEX brand_categories_category_idx ON brand_categories (category_id);

-- Lots: optional bin, brand and the category's "item details" answers.
ALTER TABLE lots
  ADD COLUMN bin_id uuid REFERENCES bins(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD COLUMN brand_id uuid REFERENCES brands(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD COLUMN details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object');
CREATE INDEX lots_bin_idx ON lots (bin_id) WHERE bin_id IS NOT NULL;
CREATE INDEX lots_brand_idx ON lots (brand_id) WHERE brand_id IS NOT NULL;
CREATE INDEX lots_location_no_bin_idx ON lots (location_id, id) WHERE bin_id IS NULL AND archived_at IS NULL;

-- Permissions: ops managers change Lot setup; other roles read it.
UPDATE staff_roles SET permissions = array_append(permissions, 'setup.manage')
  WHERE built_in AND key = 'manager' AND NOT ('setup.manage' = ANY (permissions));
UPDATE staff_roles SET permissions = array_append(permissions, 'setup.read')
  WHERE built_in AND key IN ('manager','intake','warehouse','finance','support') AND NOT ('setup.read' = ANY (permissions));

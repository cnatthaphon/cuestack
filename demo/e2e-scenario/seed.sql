-- Demo E2E Scenario: Temperature & Humidity Monitoring
-- Run after docker compose up and basic init

-- Assumes org_id and user_id exist from the initial setup
-- We'll use variables for the org_id

-- 1. Create ClickHouse tables (org_tables registry)
INSERT INTO org_tables (org_id, name, db_type, columns, description) VALUES
((SELECT id FROM organizations LIMIT 1), 'raw_sensor_data', 'analytical',
 '[{"name":"timestamp","type":"DateTime64(3)"},{"name":"channel","type":"String"},{"name":"temperature","type":"Float64"},{"name":"humidity","type":"Float64"}]',
 'Raw temperature and humidity readings from MQTT sensors'),
((SELECT id FROM organizations LIMIT 1), 'processed_sensor_data', 'analytical',
 '[{"name":"timestamp","type":"DateTime64(3)"},{"name":"channel","type":"String"},{"name":"metric","type":"String"},{"name":"value","type":"Float64"}]',
 'Processed data: FFT frequencies and smoothed values')
ON CONFLICT (org_id, name) DO NOTHING;

-- 2. Create MQTT/WebSocket channels
INSERT INTO org_channels (org_id, name, description, channel_type) VALUES
((SELECT id FROM organizations LIMIT 1), 'sensor-room-a', 'Temperature & humidity sensor in Room A', 'data'),
((SELECT id FROM organizations LIMIT 1), 'sensor-room-b', 'Temperature & humidity sensor in Room B', 'data')
ON CONFLICT (org_id, name) DO NOTHING;

-- 3. Create demo folder
INSERT INTO user_pages (org_id, user_id, name, icon, page_type, entry_type, sort_order) VALUES
((SELECT id FROM organizations LIMIT 1), (SELECT id FROM users WHERE username='admin' LIMIT 1),
 'E2E Demo', '🧪', 'dashboard', 'folder', 0)
ON CONFLICT DO NOTHING;

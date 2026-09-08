-- Allow S. Doksov to connect their own Google Drive via self-service OAuth.
-- This does not grant elevated Lumi permissions.
INSERT INTO managers (name, email, role)
VALUES ('S. Doksov', 's.doksov@inweb.ua', 'viewer')
ON CONFLICT (email) DO NOTHING;

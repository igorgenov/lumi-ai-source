-- Grant S. Doksov admin permissions in Lumi / Huyumi AI.
INSERT INTO managers (name, email, role)
VALUES ('S. Doksov', 's.doksov@inweb.ua', 'admin')
ON CONFLICT (email) DO UPDATE SET role = 'admin';


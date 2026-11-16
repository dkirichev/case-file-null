-- Player read queries run as this read-only user.
CREATE USER IF NOT EXISTS 'analyst'@'%' IDENTIFIED BY 'analyst';
GRANT SELECT ON halcyon.* TO 'analyst'@'%';

-- Write cases run as this user inside a transaction that is always rolled back.
-- It has no DDL rights except creating/dropping indexes on shipments (index cases).
CREATE USER IF NOT EXISTS 'agent'@'%' IDENTIFIED BY 'agent';
GRANT SELECT, INSERT, UPDATE, DELETE ON halcyon.* TO 'agent'@'%';
GRANT INDEX ON halcyon.shipments TO 'agent'@'%';
FLUSH PRIVILEGES;

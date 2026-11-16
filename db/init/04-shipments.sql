-- 60,000 deterministic pseudo-random shipments (MD5 of the row number, no RAND()).
USE halcyon;
SET SESSION cte_max_recursion_depth = 100000;

INSERT INTO shipments (id, tracking_code, origin_port, destination_port, status, weight_kg, declared_value, shipped_at)
WITH RECURSIVE seq (n) AS (
  SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 60000
)
SELECT
  n,
  CONCAT('HF-', LPAD((n * 7919) % 10000000, 7, '0')),
  ELT(1 + CONV(LEFT(MD5(CONCAT('o', n)), 8), 16, 10) % 8, 'BAL', 'NYC', 'SAV', 'HOU', 'LAX', 'SEA', 'MIA', 'CHS'),
  ELT(1 + CONV(LEFT(MD5(CONCAT('d', n)), 8), 16, 10) % 12, 'RTM', 'HAM', 'ANR', 'SIN', 'SHA', 'DXB', 'LIM', 'PAN', 'SAN', 'FXT', 'GOA', 'PIR'),
  CASE
    WHEN CONV(LEFT(MD5(CONCAT('s', n)), 8), 16, 10) % 100 < 2 THEN 'HELD'
    WHEN CONV(LEFT(MD5(CONCAT('s', n)), 8), 16, 10) % 100 < 10 THEN 'IN_TRANSIT'
    ELSE 'DELIVERED'
  END,
  50 + CONV(LEFT(MD5(CONCAT('w', n)), 8), 16, 10) % 24000,
  ROUND(500 + (CONV(LEFT(MD5(CONCAT('v', n)), 8), 16, 10) % 9000000) / 100, 2),
  TIMESTAMP('2024-01-01') + INTERVAL (CONV(LEFT(MD5(CONCAT('t', n)), 8), 16, 10) % (182 * 86400)) SECOND
FROM seq;

ANALYZE TABLE shipments;

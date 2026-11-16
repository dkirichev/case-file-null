-- Throwaway database for the PHP transaction case. The game resets these tables before every test,
-- and the clerk user can touch nothing else.
CREATE DATABASE IF NOT EXISTS scratch CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE scratch;

CREATE TABLE wallets (
  id      INT PRIMARY KEY,
  owner   VARCHAR(60) NOT NULL,
  balance DECIMAL(12,2) NOT NULL,
  CONSTRAINT balance_not_negative CHECK (balance >= 0)
);

CREATE TABLE transfers (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  from_wallet INT NOT NULL,
  to_wallet   INT NOT NULL,
  amount      DECIMAL(12,2) NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (from_wallet) REFERENCES wallets(id),
  FOREIGN KEY (to_wallet) REFERENCES wallets(id)
);

INSERT INTO wallets (id, owner, balance) VALUES
  (1, 'Halcyon Reserve (frozen)', 5000.00),
  (2, 'US Marshals Seized Assets', 0.00);

CREATE USER IF NOT EXISTS 'clerk'@'%' IDENTIFIED BY 'clerk';
GRANT SELECT, INSERT, UPDATE, DELETE ON scratch.* TO 'clerk'@'%';
FLUSH PRIVILEGES;

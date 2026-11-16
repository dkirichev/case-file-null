CREATE DATABASE IF NOT EXISTS halcyon CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE halcyon;

CREATE TABLE departments (
  id   INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL
);

CREATE TABLE employees (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  first_name    VARCHAR(50) NOT NULL,
  last_name     VARCHAR(50) NOT NULL,
  department_id INT NOT NULL,
  manager_id    INT NULL,
  title         VARCHAR(80) NOT NULL,
  salary        DECIMAL(10,2) NOT NULL,
  hire_date     DATE NOT NULL,
  FOREIGN KEY (department_id) REFERENCES departments(id),
  FOREIGN KEY (manager_id) REFERENCES employees(id)
);

CREATE TABLE login_events (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  login_at    DATETIME NOT NULL,
  ip_address  VARCHAR(45) NOT NULL,
  success     TINYINT(1) NOT NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE companies (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  name               VARCHAR(100) NOT NULL,
  category           VARCHAR(40) NOT NULL,
  registered_address VARCHAR(200) NOT NULL,
  country            CHAR(2) NOT NULL,
  incorporated_on    DATE NOT NULL,
  is_vendor          TINYINT(1) NOT NULL
);

CREATE TABLE accounts (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  company_id     INT NOT NULL,
  bank_name      VARCHAR(80) NOT NULL,
  account_number VARCHAR(34) NOT NULL,
  label          VARCHAR(40) NOT NULL,
  opened_on      DATE NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id)
);

CREATE TABLE transactions (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  from_account_id INT NOT NULL,
  to_account_id   INT NOT NULL,
  amount          DECIMAL(12,2) NOT NULL,
  txn_at          DATETIME NOT NULL,
  memo            VARCHAR(120) NOT NULL,
  approved_by     INT NULL,
  FOREIGN KEY (from_account_id) REFERENCES accounts(id),
  FOREIGN KEY (to_account_id) REFERENCES accounts(id),
  FOREIGN KEY (approved_by) REFERENCES employees(id)
);

-- Backup trail: every UPDATE or DELETE on transactions stores the old row here.
CREATE TABLE audit_log (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  action          VARCHAR(10) NOT NULL,
  txn_id          INT NOT NULL,
  from_account_id INT NOT NULL,
  to_account_id   INT NOT NULL,
  amount          DECIMAL(12,2) NOT NULL,
  txn_at          DATETIME NOT NULL,
  memo            VARCHAR(120) NOT NULL,
  approved_by     INT NULL,
  logged_at       DATETIME NOT NULL,
  logged_by       VARCHAR(40) NOT NULL
);

-- Halcyon's actual freight business. Large on purpose and has no secondary indexes:
-- this is the table the index cases work on.
CREATE TABLE shipments (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  tracking_code    VARCHAR(12) NOT NULL,
  origin_port      CHAR(3) NOT NULL,
  destination_port CHAR(3) NOT NULL,
  status           VARCHAR(12) NOT NULL,
  weight_kg        INT NOT NULL,
  declared_value   DECIMAL(10,2) NOT NULL,
  shipped_at       DATETIME NOT NULL
);

-- Logins for Halcyon's internal web portal (the PHP application).
CREATE TABLE portal_users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(40) NOT NULL UNIQUE,
  password_hash CHAR(64) NOT NULL,
  role          VARCHAR(20) NOT NULL,
  employee_id   INT NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);

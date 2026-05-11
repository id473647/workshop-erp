# My Care Service Center - ERP Project Manifest

## 1. Project Objective
To digitize the manual workflow of a multi-brand two-wheeler workshop. The system tracks customer history, dual-warehouse spares, mechanic commissions, and third-party lathe work.

## 2. Branding & Identity
* **Main Brand:** My Care Service Center.
* **Segment Branding:** Green Scooter / Moped Warehouse logic.
* **Logo Assets:** `logo-main.jpg` (Header) and `logo-green.png` (Sub-branding).

## 3. Core Database Architecture (Supabase)
* **Customers:** Primary Key: `mobile_number`. Links all bikes and bills.
* **Mechanics:** Tracks active staff and their specific `commission_rate`.
* **Staff Ledger:** Tracks `EARNING` (from labour) and `ADVANCE` (cash withdrawals).
* **Job Cards:** Stores daily totals for Green Spares, Moped Spares, Lubricants, Labour, and Lathe.
* **Lathe Tracking:** Uses `lathe_status` (Pending/Paid) to manage third-party settlements.

## 4. Operational Workflow
1. **Entry:** Search mobile -> Load customer -> Record Complaints -> Assign Mechanic.
2. **Dashboard:** Monitor "Open" jobs in the workshop and live staff balances.
3. **Billing:** Calculate totals with dual-discount logic (Flat amount then Percentage).
4. **Closing:** - Post commission to Mechanic Ledger.
   - Set Lathe payment status.
   - Trigger WhatsApp message with bill summary and "Future Advice".

## 5. Achievements & Progress
- [x] Cloud Database Setup (Supabase).
- [x] Automated Mechanic Commission Engine.
- [x] Dual-Warehouse Accounting.
- [x] Third-party Lathe/Welding Debt Tracking.
- [x] WhatsApp Integration.
- [x] Branding & UI Customization.

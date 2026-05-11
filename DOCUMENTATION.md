# Workshop ERP: Project Manifest & Progress Log

## 1. Project Vision
To transition "My Care Service Center" from manual paper records to a cloud-synced digital system that manages customer history, dual-warehouse inventory (Green & Moped), and staff financial ledgers.

## 2. Technical Infrastructure
* **Version Control:** GitHub (For logic and documentation).
* **Database:** Supabase / PostgreSQL (For real-time data storage).
* **Frontend:** HTML5/JavaScript (Cross-platform for PC and Android).
* **Integrations:** WhatsApp Web for automated invoicing.

## 3. How It Works (The Logic Flow)
1.  **Check-in:** Enter mobile number -> Check if customer exists -> Record vehicle & problem -> Assign Mechanic.
2.  **Service:** Parts issued from Green/Moped warehouses.
3.  **Billing:** Sum of all costs (Spares + Labour + Lathe) -> Apply Flat then % Discount -> Add Future Advice.
4.  **Accounting:** Update Mechanic Ledger with commissions -> Record Payment (Cash/UPI/Credit).

## 4. Current Achievements (Status)
- [x] **Phase 1: Infrastructure.** GitHub and Supabase connected.
- [x] **Phase 2: Database Design.** SQL Master Schema v1.5 implemented (Mechanics, Ledger, Job Cards).
- [x] **Phase 3: The Dashboard.** `index.html` created to show live workshop status.
- [x] **Phase 4: Data Entry.** `new-jobcard.html` created with "upsert" logic (handles new/old customers).
- [ ] **Phase 5: Billing System.** `billing.html` skeleton created (Need to connect "Close Job" logic).

## 5. Future Roadmap
- [ ] Implement WhatsApp Invoice generation.
- [ ] Create Daily Sales Analytics report.
- [ ] Add Lathe/Welding specialized tracking.
- [ ] Build the "Counter Sale" mode for retail.

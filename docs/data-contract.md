# Data Contract — Budget App

## Purpose
This application is a zero-based budgeting workspace.  
Users plan money by month, log transactions manually, and track debt accounts as balances with payments.

This document defines what each piece of data *means* and how totals are calculated.  
It is the source of truth for the go-live database.

---

## Core Concepts

### Budget Month
A budget operates in monthly cycles.
- Represented as `YYYY-MM`
- Groups planned amounts and transactions
- Users can view other months, but all calculations are month-scoped

---

## Budget Structure (Hierarchy)

### Sections (Fixed)
Sections are fixed and not user-editable.

- Income
- Giving
- Expenses
- Debt

### Category Groups
User-created groupings inside a section.
Examples:
- Housing
- Transportation
- Lifestyle
- Credit Cards

### Categories
Leaf-level budget items.
Examples:
- Mortgage
- Gas
- VA Disability
- Capital One Payment

Hierarchy:
Section → Group → Category


---

## Tables (Conceptual)

### category_groups
Represents group headers (e.g., Housing, Transportation).

- id
- user_id
- section (`income | giving | expenses | debt`)
- name
- sort_order

---

### categories
Represents budget line items (e.g., Mortgage, Gas, VA Disability).

- id
- user_id
- group_id
- name
- sort_order

Categories are user-owned and created inline in the budget list.

---

### budget_plans
Represents a user’s planned amount for a category in a given month.

- id
- user_id
- month (`YYYY-MM`)
- category_id
- planned_amount (number)

Planned amounts exist for:
- income categories
- expense categories
- giving categories
- debt payment categories

---

### debt_accounts
Represents debt accounts with balances.

- id
- user_id
- name
- current_balance (number)
- minimum_payment (number)
- sort_order

APR may exist but is not required or surfaced.

---

### transactions
Manual transaction log (automation may be added later).

- id
- user_id
- date
- month (`YYYY-MM`)
- amount (positive number)
- type (`income | expense | debt_payment`)
- category_id (nullable)
- debt_account_id (nullable)
- notes (optional)
- source = `manual`

Rules:
- Income transactions use `category_id`
- Expense transactions use `category_id`
- Debt payment transactions use `debt_account_id`
- No transaction should use both `category_id` and `debt_account_id`

---

## Calculations (Rules)

### Left to Budget (Planning Truth)


LeftToBudget =
Total Planned Income
− (Planned Expenses + Planned Giving + Planned Debt Payments)


- Uses **planned income only**
- Updates immediately when planned amounts change
- Does NOT change when transactions are added

---

### Income Rows
For each income category:

- Planned = planned_amount
- Received = sum of income transactions for that category in the month
- Difference = Planned − Received

Labeling uses **Received**, not Spent.

---

### Expense Rows
For each expense category:

- Planned = planned_amount
- Spent = sum of expense transactions for that category in the month
- Remaining = Planned − Spent

Remaining may be negative (overspending allowed).

---

### Debt Rows
Debt is not an expense, but debt payments are cash outflows.

For each debt account row:

- Planned = planned payment amount (defaults to minimum payment, editable)
- Paid = sum of debt_payment transactions for that account in the month
- Remaining = Planned − Paid

Debt rows:
- reduce Left to Budget
- reduce Actual Net Flow
- do NOT count as expense spending

---

### Debt Balance Updates
When a debt payment transaction is added:

- `current_balance` is reduced by the payment amount
- Balance reflects payoff progress
- Balance math is independent of budget math

---

### Actual Net Flow (Reality Metric)
Optional but recommended:



Actual Net Flow =
Actual Income
− (Actual Expenses + Actual Debt Payments)


This reflects real cash movement for the month.

---

## UX Rules

### Budget List
- The budget list is the home screen
- Users do not leave the list to manage structure
- Groups and categories are added inline
- Planned amounts are editable inline

### Drag and Drop
- Allowed only within the same section
- Users can:
  - reorder groups
  - reorder categories
  - move categories between groups (same section only)
- Dragging never changes money calculations

### Layout
**Desktop**
- Left 2/3: Budget list (scrollable)
- Right 1/3: Sticky panel
  - Quick Add Transaction (pinned)
  - Transactions list (scrolls inside panel)
  - Debt accounts visible in context

**Mobile**
- Budget and Transactions are separate tabs/pages

---

## Seeding Defaults (Per User)

On first login, seed user-owned defaults:

### Income
- Primary Income
- Other Income

### Giving
- Tithe
- Charity

### Expenses
- Housing
- Transportation
- Food
- Lifestyle
- Health
- Savings
- Misc

### Debt
- Credit Cards group (accounts added by user)

All seeded records belong to the user (`user_id`).

---

## Design Principles
- Planning and reality are separate truths
- Overspending is allowed and visible
- Debt is structurally distinct from expenses
- Manual entry first; automation later
- Dashboards are derived, not primary
d
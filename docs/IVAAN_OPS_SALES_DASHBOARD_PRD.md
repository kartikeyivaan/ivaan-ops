# Ivaan Ops — Sales Dashboard, Reports & Performance Gamification PRD

**Version:** 1.0  
**Date:** 20 August 2026  
**Status:** Ready for Codebase Audit and Cursor Implementation  
**Primary Users:** `SALES_EXECUTIVE`, `SALES_MANAGER`, `SUPER_ADMIN`  
**Primary Platform:** Desktop/Laptop first  
**Business Timezone:** `Asia/Kolkata`

---

# 1. Product Vision

Build a visual, actionable, role-aware Sales Dashboard for Ivaan Ops.

The dashboard must combine:

- What needs attention right now
- Today's dispatches
- Sales pipeline and conversion
- Collections and outstanding balances
- Dispatch performance
- Stock relevant to active sales
- Customer inactivity
- Team performance
- Approvals
- Module Mastery gamification
- Targets
- Visual analytics and reports

The dashboard must not be merely a collection of KPI cards. Charts, bar graphs, histograms, funnel charts, donut/pie charts and timelines shall be used where they answer a useful business question.

## Sales Executive question

> **What do I need to do next, what is happening with my dispatches today, and how am I performing?**

## Sales Manager question

> **Where is the team stuck, what needs my attention, and who is performing?**

## Super Admin question

> **What is happening across the sales operation?**

---

# 2. Scope and Information Architecture

## 2.1 Main Dashboard

Use one role-aware dashboard route:

```text
/dashboard
```

The application shall render widgets according to authenticated role and permissions.

## 2.2 Reports Hub

Use a separate reports hub:

```text
/reports
```

### Dashboard
Live operational snapshot + actionable queues + visual insights.

### Reports
Deeper historical analysis + filters + detailed tables + exports.

## 2.3 Dashboard Layers

```text
┌─────────────────────────────────────────────────────┐
│ TODAY / CRITICAL ACTIONS                            │
├─────────────────────────────────────────────────────┤
│ KPI PERFORMANCE SNAPSHOT                            │
├─────────────────────────────────────────────────────┤
│ VISUAL ANALYTICS / CHARTS                           │
├─────────────────────────────────────────────────────┤
│ WORK QUEUES / RISKS / DETAILS                       │
└─────────────────────────────────────────────────────┘
```

---

# 3. Users and Data Scope

## 3.1 SALES_EXECUTIVE

Sales Executives shall see only data belonging to their authorized sales scope, including:

- Assigned customers
- Authorized quotations
- Authorized PIs
- Authorized bookings
- Their collections
- Their dispatch performance
- Their targets
- Their Module Mastery progress

Do not send company-wide data to an executive's browser and filter it client-side.

Server-side authorization and filtering are mandatory.

## 3.2 SALES_MANAGER

Sales Managers shall see authorized company-wide or team-wide data, depending on the existing organization and permission architecture.

They shall be able to:

- Compare executives
- See team pipeline
- Monitor approvals
- Identify risks and exceptions
- Drill into executive performance
- Monitor dispatch operations
- Monitor collection risk
- Monitor stock conflicts
- View team Module Mastery

## 3.3 SUPER_ADMIN

Super Admin shall have the authorized organization-wide manager view and access to relevant configuration.

---

# 4. Sales Executive Dashboard

The executive dashboard is primarily action-oriented.

## 4.1 First Priority: Today's Dispatches

The first major question answered on opening the dashboard must be:

> **What is happening with my dispatches today?**

### Today's Dispatch Hero

Show:

- Planned dispatches today
- Completed dispatches
- Pending dispatches
- Blocked dispatches
- Module units
- Inverter units
- Other units
- Completion progress

Example:

```text
TODAY'S DISPATCHES

8 PLANNED

████████████████████████░░

5 COMPLETED
3 PENDING

Modules       450 Units
Inverters      24 Units
Other          85 Units

[ VIEW TODAY'S DISPATCHES ]
```

Click-through must open a filtered dispatch list for:

```text
Date = Today
Sales Executive = Current User
```

Use India local date.

---

# 5. Executive Dashboard Layout

Recommended desktop-first layout:

```text
┌───────────────────────────────────────────────────────────────────┐
│ GOOD MORNING, [NAME]                             [MONTH YEAR]     │
│ Today: [LOCAL INDIA DATE]                                         │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│ 🚚 TODAY'S DISPATCHES                                             │
│  Planned | Completed | Pending | Blocked                          │
│  Completion Progress                                              │
│                                                                   │
│  [ VIEW TODAY'S DISPATCHES ]                                     │
├───────────────┬───────────────┬───────────────┬───────────────────┤
│ QUOTATIONS    │ PI VALUE      │ COLLECTION    │ DISPATCH VALUE    │
├───────────────────────────────┴───────────────────────────────────┤
│                                                                   │
│ ⚡ MODULE MASTERY                    🎯 MONTHLY TARGET             │
│ Current Level / Progress              Module Target / Progress    │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│ 📈 MY SALES PERFORMANCE                                           │
│ Funnel + Trend Chart + Metric Selector                            │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│ 📋 WHAT NEEDS MY ATTENTION                                        │
│ Follow-ups | Expiring Quotes | Unpaid PIs | Quiet Customers       │
├───────────────────────────────┬───────────────────────────────────┤
│ 💰 OUTSTANDING AGING          │ 📦 SALES STOCK WATCH              │
│ Histogram / Aging Bars        │ Relevant Open-Sales Products      │
└───────────────────────────────┴───────────────────────────────────┘
```

---

# 6. Executive KPI Strip

Default period:

```text
This Month
```

Show:

1. Quotation Value
2. PI Value
3. Collection Value
4. Dispatched Value

Where data exists, show comparison against previous comparable period:

```text
↑ 18% vs previous period
```

or

```text
↓ 7% vs previous period
```

Every KPI must click through to an appropriate filtered detail list.

## Critical Formula Requirement

The dashboard must use the same authoritative business formulas as the existing Sales Executive Report.

In particular, Cursor must audit and document:

- Quotation Value formula
- PI Value formula
- Collection Value formula
- Dispatched Value formula

Do not invent new formulas.

---

# 7. Module Mastery Gamification

Module Mastery is a major widget inside the Sales Dashboard. It is not a separate application or standalone dashboard.

## 7.1 Objective

Transform monthly dispatched module performance into a progressive gaming-style achievement system.

The system must:

- Track actual dispatched module units only
- Progress in slabs of 500 modules
- Unlock levels sequentially
- Show the current active level prominently
- Show the immediate next challenge
- Include 15 named levels
- Continue indefinitely through God Levels
- Reset current progression monthly
- Preserve historical achievements
- Support subtle level-up celebrations
- Support configuration by authorized roles

## 7.2 Primary Metric

**Confirmed/valid dispatched module units.**

The following must NOT count:

- Quotation quantity
- PI quantity
- Booked quantity
- Reserved inventory
- Planned dispatch quantity
- Draft dispatch quantity
- Cancelled dispatch quantity
- Unconfirmed dispatch quantity

The exact valid statuses must be determined from the existing codebase and dispatch workflow.

---

# 8. Module Mastery Level Progression

Each standard level equals:

```text
500 dispatched module units
```

Levels unlock sequentially.

## Default Levels

| Level | Name | Badge | Total Modules Required |
|---|---|---|---:|
| 1 | Rookie | 🌱 | 500 |
| 2 | Spark | 🔥 | 1,000 |
| 3 | Charged | ⚡ | 1,500 |
| 4 | Power Player | 🛡️ | 2,000 |
| 5 | Rising Star | 🚀 | 2,500 |
| 6 | Solar Striker | 💥 | 3,000 |
| 7 | Energy Hunter | 🔥 | 3,500 |
| 8 | Power Master | ⚡ | 4,000 |
| 9 | Solar Champion | 🏆 | 4,500 |
| 10 | Elite Performer | 👑 | 5,000 |
| 11 | Legend | 🌟 | 5,500 |
| 12 | Titan | ⚔️ | 6,000 |
| 13 | Solar Titan | 🔱 | 6,500 |
| 14 | Energy Overlord | 🌌 | 7,000 |
| 15 | Ultimate Legend | 👑⚡ | 7,500 |

After Level 15:

```text
GOD LEVEL
```

There is no upper limit.

## God Level Progression

Continue dynamically in 500-module slabs:

| God Rank | Total Modules |
|---|---:|
| God Level I | 8,000 |
| God Level II | 8,500 |
| God Level III | 9,000 |
| God Level IV | 9,500 |

Do not hardcode a maximum God Level.

---

# 9. Module Mastery Calculation Rules

For monthly dispatched module quantity:

```text
monthlyDispatchedModules
```

Each 500-unit threshold represents a completed level milestone.

Examples:

```text
237 modules
Current: Level 1 — Rookie
Progress: 237 / 500
Remaining: 263
```

```text
500 modules
Level 1 completed
Current active challenge: Level 2
Progress: 0 / 500
```

```text
1,237 modules
Level 1 completed
Level 2 completed
Current: Level 3 — Charged
Progress: 237 / 500
Remaining: 263
```

```text
7,500 modules
Level 15 completed
Current active challenge: God Level I
Progress: 0 / 500
```

```text
8,237 modules
Current: God Level I
Progress: 237 / 500
Remaining: 263
```

The implementation must correctly define the active challenge after an exact threshold.

---

# 10. Module Mastery Dashboard Widget

Recommended placement: below Today's Dispatch Hero or adjacent to primary dispatch/target KPIs.

Show:

- Current month
- Current level number
- Level name
- Badge/icon
- Total modules dispatched this month
- Current slab progress
- Progress percentage
- Modules remaining
- Next level preview
- View My Journey action

Example:

```text
⚡ MODULE MASTERY

AUGUST 2026

LEVEL 3
CHARGED

1,237 TOTAL MODULES DISPATCHED

████████████░░░░░░░░

237 / 500 MODULES

263 MODULES TO NEXT LEVEL

NEXT UNLOCK
🛡️ LEVEL 4 — POWER PLAYER

[ VIEW MY JOURNEY ]
```

Only the current level and immediate next challenge should be prominent on the main dashboard.

---

# 11. Module Mastery Level States

## Completed

Show achievement badge, completion indicator and completion date where available.

## Active

Show:

- Prominent badge
- Progress bar or radial progress
- Remaining quantity
- Next unlock information

## Locked

Future levels should remain locked.

Do not show the full future progression as active.

At most, preview the immediate next level.

---

# 12. Level-Up Events

When a dispatch crosses a milestone, record the achievement.

Example:

```text
Previous total: 1,480
New dispatch: 50
New total: 1,530
```

The crossed milestone must be recorded.

## Celebration

Show a subtle one-time celebration when the executive next opens the dashboard.

Example:

```text
🎉 LEVEL UNLOCKED

⚡ LEVEL 3 — CHARGED

1,500 MODULES DISPATCHED

NEXT CHALLENGE
🛡️ LEVEL 4 — POWER PLAYER
```

Track acknowledgement/display so the celebration does not repeat indefinitely.

## Multiple Levels in One Dispatch

If a dispatch crosses multiple thresholds:

1. Record every crossed level.
2. Do not lose intermediate achievements.
3. Preserve correct auditability.
4. Show a consolidated celebration.

Example:

```text
🔥 AMAZING PERFORMANCE!

3 LEVELS UNLOCKED

✓ Rookie
✓ Spark
✓ Charged
```

---

# 13. My Module Mastery Journey

Suggested route:

```text
/dashboard/module-mastery
```

Show:

- Current month progression
- Current level
- Completed levels
- Completion dates
- Monthly total modules
- Personal best month
- Highest level ever achieved
- Lifetime dispatched modules
- Historical monthly performance
- Achievement timeline

Recommended visualizations:

- Vertical achievement timeline
- Monthly bar chart
- Personal-best marker
- Current active progress

---

# 14. Monthly Module Target

Module Mastery and target are separate concepts.

```text
TARGET
= Business expectation

MODULE MASTERY
= Motivational progression
```

Default monthly target:

```text
3,000 module units
```

Target shall be editable.

Recommended hierarchy:

```text
Company Default Target
        ↓
Executive-Specific Target Override
        ↓
Monthly Executive Override
```

Example widget:

```text
🎯 MONTHLY TARGET

3,000 MODULES

1,237 ACHIEVED

████████░░░░░░░░░░

41.2%

1,763 REMAINING
```

An executive may exceed the target and continue progressing through Module Mastery and God Levels.

---

# 15. Sales Performance Visual Analytics

## 15.1 Sales Funnel

Show:

```text
Quotation Value
      ↓
PI Value
      ↓
Collection Value
      ↓
Dispatched Value
```

Use a proper funnel chart or horizontal conversion visualization.

Show conversion percentages where meaningful.

## 15.2 Monthly/Daily Performance Trend

Use a bar chart for selected metric:

- Module Units
- Dispatch Value
- Collection
- PI Value

## 15.3 Product Contribution

Use a donut/pie chart only where it provides a useful composition view, for example:

- Modules
- Inverters
- Other

## 15.4 Chart Principle

Charts are not decorative.

Every chart must answer a business question and support click-through where underlying details exist.

---

# 16. Executive Work Queue — What Needs My Attention

This must be a list of actionable items, not only counts.

## 16.1 Follow-Ups Due

Show:

- Customer
- Follow-up due date/time
- Last interaction
- Days since last activity
- Open action

## 16.2 Expiring Quotations

States:

- Expires today
- Expires in 1–3 days
- Expired

## 16.3 PIs Waiting for Payment

Show:

- Customer
- PI number
- PI value
- Collected amount
- Outstanding amount
- Age/days outstanding

## 16.4 Quiet Customers

Alerts requested as a priority.

A quiet customer is a customer with no qualifying sales activity for a configurable threshold.

Qualifying activity should be based on the actual data model and may include:

- Follow-up
- Quotation
- PI
- Payment
- Dispatch
- Logged customer interaction

Default recommended threshold:

```text
7 days
```

Make the threshold configurable.

---

# 17. Outstanding Collections and Aging

Show total outstanding for authorized customers and visual aging.

Suggested aging buckets:

- 0–7 days
- 8–15 days
- 16–30 days
- 30+ days

Recommended visualization: horizontal aging bars / histogram.

Example:

```text
OUTSTANDING COLLECTIONS

₹8.4L TOTAL

0–7 Days     ███████████  ₹3.2L
8–15 Days    ██████       ₹1.8L
16–30 Days   █████        ₹1.5L
30+ Days     ██████       ₹1.9L
```

Clicking a bucket must open the filtered source list.

---

# 18. Sales Stock Watch

Do not show a complete warehouse dump.

Show only products relevant to the executive's active sales, including products on:

- Open quotations
- Open PIs
- Booked PIs

Example:

```text
Waaree 540Wp
Open Requirement: 1,250
Available: 800
Status: SHORT

Polycab 3KW
Open Requirement: 12
Available: 18
Status: AVAILABLE
```

Statuses may include:

- Available
- Low
- Conflict
- Short

Reuse existing inventory and reservation calculations.

---

# 19. Executive Quick Actions

Provide persistent quick actions:

```text
+ New Quotation
+ New PI
+ Record Payment
+ Open Customer
```

Optional if supported by existing workflow:

```text
+ Mark Dispatch Today
```

Reuse existing forms/routes. Do not create duplicate business workflows.

---

# 20. Sales Manager Dashboard

The Sales Manager dashboard focuses on comparison, bottlenecks and exceptions.

Recommended layout:

```text
┌──────────────────────────────────────────────────────────────────┐
│ SALES TEAM DASHBOARD                            [PERIOD]         │
├──────────────────────────────────────────────────────────────────┤
│ 🔔 APPROVALS SUMMARY                                              │
├───────────────┬───────────────┬───────────────┬──────────────────┤
│ QUOTATION     │ PI VALUE      │ COLLECTION    │ DISPATCH VALUE   │
├──────────────────────────────────────────────────────────────────┤
│ 📊 TEAM SCOREBOARD                                                │
├───────────────────────────────┬──────────────────────────────────┤
│ 📈 TEAM PERFORMANCE           │ ⚡ TEAM MODULE MASTERY            │
├───────────────────────────────┴──────────────────────────────────┤
│ ⚠️ PIPELINE RISKS                                                 │
├───────────────────────────────┬──────────────────────────────────┤
│ 🚚 DISPATCH OPERATIONS        │ 📦 STOCK CONFLICTS               │
└───────────────────────────────┴──────────────────────────────────┘
```

---

# 21. Manager Approvals Summary

The dashboard shall not replace the existing Approvals Inbox.

Show a summary and link.

Example:

```text
APPROVALS WAITING

Booking Approvals        5
Early-Date PI Edits      2
Unbook Requests          3
Dispatch Today Requests  2

TOTAL: 12

OLDEST WAITING: 2 Days

[ OPEN APPROVALS ]
```

Click-through opens the existing approvals workflow.

---

# 22. Team Scoreboard

Period toggle:

```text
This Week | This Month | This Quarter
```

Columns:

- Rank
- Executive
- Quotation Value
- PI Value
- Collection Value
- Dispatched Value
- Module Units
- New Customers

Default ranking:

```text
Dispatched Module Units DESC
```

Allow sorting by relevant columns.

Clicking an executive drills into their authorized performance view.

---

# 23. Team Performance Charts

## Executive Comparison

Use grouped or horizontal bar charts.

Metric selector:

- Quotation
- PI
- Collection
- Dispatch Value
- Module Units
- New Customers

## Team Funnel

Visualize:

```text
Quotation
    ↓
PI
    ↓
Collection
    ↓
Dispatch
```

Use actual supported business stages.

## Daily Dispatch Trend

Bar chart by day.

## Collection Trend

Line or bar chart with:

- Daily
- Weekly
- Monthly

---

# 24. Team Module Mastery

Managers and Super Admins shall see team-wide Module Mastery.

Show:

- Executive name
- Current level
- Badge
- Modules dispatched
- Current slab progress
- Distance to next level

Include a leaderboard ranked primarily by monthly dispatched module units.

Example:

| Rank | Executive | Level | Modules | To Next Level |
|---|---|---|---:|---:|
| 1 | Rahul | Level 9 — Solar Champion | 4,750 | 250 |
| 2 | Kartik | Level 8 — Power Master | 4,280 | 220 |
| 3 | Amit | Level 6 — Solar Striker | 3,120 | 380 |

Clicking an executive must drill into their performance view.

Sales Executive visibility of team leaderboard shall be configurable.

---

# 25. Pipeline Risk

Display actionable risk lists.

## Expiring Quotations

- Expires today
- Expires soon
- Expired

## Booked but Not Dispatched

Show age since booking.

## High Outstanding

Show customers with:

- High outstanding amount
- Aging
- No recent payment

## Stuck PIs

Potential states:

- Draft too long
- Sent but no payment
- Partially paid too long
- Booked but no movement

Exact thresholds should be configurable or based on existing business rules.

---

# 26. Exceptions

## Overdue Collections

Show:

- Customer
- Outstanding
- Days outstanding
- Last payment
- Executive

## Quiet Customers

Show:

- Customer
- Last activity
- Inactive days
- Executive

## Stuck PIs

Show:

- PI number
- Status
- Days in status
- Value
- Executive

---

# 27. Dispatch Operations

Manager-level dispatch summary:

```text
TODAY'S DISPATCH OPERATIONS

Planned:       24
Completed:     16
Pending:        5
Blocked:        3

67% COMPLETE
```

Break down by:

- Modules
- Inverters
- Other

Click-through to filtered dispatch records.

---

# 28. Stock Conflicts

Show inventory problems likely to block sales or dispatch.

Example:

```text
PRODUCT STOCK CONFLICT

Waaree 540Wp

Available: 500
Required by Open PIs: 1,200

SHORT: 700
```

Prioritize according to existing inventory/reservation logic. The suggested business priority is:

1. Booked PIs
2. Open PIs
3. Open quotations

Do not duplicate inventory allocation logic.

---

# 29. Reports Hub

Route:

```text
/reports
```

Reports should support deeper analysis, detailed tables and export.

## 29.1 Sales Performance Report

Filters:

- Date range
- Executive
- Customer
- Product
- Brand

Metrics:

- Quotation
- PI
- Collection
- Dispatch
- Module units
- Inverter units
- Other units

## 29.2 Dispatch Report

- Dispatch value
- Module units
- Inverter units
- Other units
- Daily trend
- Executive-wise analysis

## 29.3 Collection Report

- Collection received
- Outstanding
- Aging
- Customer-wise
- Executive-wise

## 29.4 Sales Funnel Report

Use actual supported stages, potentially:

```text
Lead → Quotation → PI → Booking → Collection → Dispatch
```

Do not assume stages exist without auditing the codebase.

## 29.5 Executive Performance Report

Show:

- Monthly targets
- Module Mastery level
- Modules dispatched
- Dispatch value
- PI value
- Collection
- New customers

---

# 30. Period Controls

Default dashboard period:

```text
This Month
```

Available options:

```text
Today
This Week
This Month
This Quarter
Custom Range
```

Use shared period state where practical.

Today's operational widgets must remain based on today even if the overall dashboard period changes.

Example:

```text
Today's Dispatches
```

must still mean today when overall period is set to This Quarter.

---

# 31. Click-Through Requirements

Every major number and meaningful chart segment should lead to detail where such a detail view exists.

Examples:

```text
Outstanding 30+ Days
        ↓
Filtered PI / Outstanding List
```

```text
Expiring Quotations
        ↓
Filtered Quotation List
```

```text
Executive
        ↓
Executive Performance View
```

```text
Blocked Dispatch
        ↓
Filtered Dispatch List
```

---

# 32. Data Definitions and Source of Truth

Cursor must audit the existing database and application before implementation.

Do not assume:

- Table names
- Status values
- Relationships
- Sales ownership rules
- Dispatch value formulas
- Payment allocation rules

The source of truth for Module Mastery is actual operational dispatch data.

Any progress/analytics table is a cache or projection, not an independent business source of truth.

If a dispatch is:

- Cancelled
- Reversed
- Corrected
- Deleted
- Reassigned

the relevant analytics must be recalculated according to final valid operational data.

---

# 33. Executive Attribution

This is critical.

Performance must be attributed to the correct Sales Executive.

Potential relationships to audit include:

```text
Customer.assigned_sales_executive_id
Quotation.created_by
Quotation.sales_executive_id
PI.created_by
PI.sales_executive_id
Booking.created_by
Dispatch.created_by
```

These are examples only.

Do not assume `Dispatch.created_by` represents the salesperson responsible for the sale.

Determine the authoritative sales ownership model from the codebase.

---

# 34. Timezone

All business date calculations must use:

```text
Asia/Kolkata
```

Apply to:

- Today's dispatches
- Follow-ups
- Monthly boundaries
- Achievement timestamps
- Current period
- Historical monthly records
- Aging calculations where business-date semantics require it

Do not rely solely on server UTC boundaries.

---

# 35. Configuration

Create authorized configuration for:

## Module Mastery

- Metric
- Slab size: default 500
- Named level count: default 15
- Level names
- Level badges
- Thresholds
- God Level enabled
- God Level increment
- Reset period
- Executive leaderboard visibility

## Targets

- Company default module target
- Executive-specific target
- Monthly override

## Risk Thresholds

Where appropriate and supported:

- Quiet customer inactivity threshold
- Stuck PI thresholds
- Expiring quotation windows
- Collection risk thresholds

Follow existing settings and RBAC architecture.

---

# 36. Recommended Data Model

Cursor must inspect the actual ORM/schema before creating anything.

The following is conceptual.

## ModuleMasteryConfig

```text
id
metric_type
slab_size
named_level_count
god_level_increment
reset_period
leaderboard_visible_to_executives
created_at
updated_at
```

## ModuleMasteryLevel

```text
id
level_number
name
badge
threshold_modules
is_god_level
is_active
created_at
updated_at
```

The first 15 are named levels.

God Levels should be calculated dynamically rather than stored infinitely.

## ExecutiveModuleMasteryProgress

```text
id
executive_id
year
month
modules_dispatched
current_level_number
current_level_name
current_level_progress
next_level_threshold
highest_completed_level
created_at
updated_at
```

Recommended unique constraint:

```text
(executive_id, year, month)
```

## ExecutiveModuleLevelAchievement

```text
id
executive_id
year
month
level_number
level_name
threshold_modules
achieved_at
celebration_shown_at
celebration_acknowledged_at
created_at
```

Recommended unique constraint:

```text
(executive_id, year, month, level_number)
```

---

# 37. Analytics Architecture

Create centralized server-side analytics services.

Do not calculate dashboard business metrics independently in React components.

Suggested conceptual services:

```text
dashboard.service
sales-analytics.service
dispatch-analytics.service
collection-analytics.service
module-mastery.service
```

Adapt names to the existing codebase.

Suggested Module Mastery functions:

```text
getExecutiveMonthlyModuleProgress()
getExecutiveModuleJourney()
getTeamModuleLeaderboard()
calculateModuleMasteryLevel()
calculateGodLevel()
recordLevelAchievements()
recalculateExecutiveModuleMastery()
```

---

# 38. Recalculation Strategy

Recommended hybrid:

```text
Operational Records
        ↓
Analytics Service
        ↓
Monthly Cached Summary / Projection
        ↓
Dashboard
```

Trigger recalculation when relevant operational records are:

```text
Completed
Updated
Cancelled
Reversed
Corrected
Reassigned
```

Provide an authorized recalculation capability for:

```text
One Executive
One Month
All Executives for Current Month
```

The operational records remain authoritative.

---

# 39. API Requirements

Adapt to the existing API architecture.

Possible endpoints:

```text
GET /api/dashboard
GET /api/dashboard/executive
GET /api/dashboard/manager
GET /api/dashboard/module-mastery
GET /api/dashboard/module-mastery/journey
GET /api/dashboard/module-mastery/leaderboard
GET /api/dashboard/approvals-summary
GET /api/dashboard/team-scoreboard
GET /api/settings/module-mastery
PUT /api/settings/module-mastery
```

Do not blindly implement these exact routes if the application uses a different routing convention.

Authorization must be enforced server-side.

Do not permit unauthorized data access through manipulated IDs or query parameters.

---

# 40. Suggested UI Component Structure

Adapt to the existing architecture rather than duplicating it.

Conceptually:

```text
components/
  dashboard/
    executive/
    manager/
    charts/
    work-queue/
    module-mastery/
      ModuleMasteryCard
      ModuleMasteryProgress
      LevelBadge
      NextLevelPreview
      LevelUpCelebration
      ModuleMasteryJourney
      ModuleMasteryTimeline
      TeamModuleMastery
      ModuleMasteryLeaderboard

services/
  analytics/
    dashboard
    sales
    dispatch
    collection
    module-mastery
```

---

# 41. Design Requirements

The application should feel like a professional business system with subtle gaming motivation.

Do not make Module Mastery look like a children's game.

Use:

- Premium achievement badges
- Clear hierarchy
- Strong progress visualization
- Subtle animation
- Professional typography
- Minimal clutter
- Desktop-first layout
- Responsive support

Avoid:

- Excessive neon
- Excessive confetti
- Decorative charts without meaning
- Duplicate data
- Dense warehouse-style tables on the main executive dashboard

---

# 42. Chart Selection Rules

## KPI Cards

Use for current totals and quick status.

## Bar Charts

Use for:

- Executive comparison
- Daily dispatches
- Monthly performance
- Product comparison

## Funnel Charts

Use for sales conversion.

## Line Charts

Use for trends over time.

## Donut/Pie Charts

Use sparingly for composition, such as:

- Dispatch status distribution
- Product category contribution
- Payment status distribution

## Histogram / Aging Bars

Use for:

- Outstanding aging
- PI aging
- Dispatch delays

---

# 43. Empty States

Every widget requires a meaningful empty state.

## No Dispatches Today

```text
NO DISPATCHES PLANNED TODAY

You have no dispatches scheduled.

[ VIEW UPCOMING DISPATCHES ]
```

## New Executive

```text
START BUILDING YOUR SALES PIPELINE

Create your first quotation to begin.

[ NEW QUOTATION ]
```

## No Outstanding

```text
ALL CLEAR

No outstanding payments requiring attention.
```

## Module Mastery Start

```text
START YOUR MODULE MASTERY

0 Modules Dispatched This Month

🌱 LEVEL 1 — ROOKIE

Dispatch your first 500 modules to unlock
your first achievement.

0 / 500
```

---

# 44. Permissions

| Feature | Sales Executive | Sales Manager | Super Admin |
|---|---|---|---|
| Own Dashboard | Yes | Yes | Yes |
| Own Module Mastery | Yes | Yes | Yes |
| Other Executive Detail | No | Authorized | Authorized |
| Team Dashboard | No | Authorized | Authorized |
| Team Leaderboard | Configurable | Yes | Yes |
| Achievement History | Own only | Team scope | Authorized scope |
| Configuration | No | Existing RBAC dependent | Yes |
| Recalculate Analytics | No | Existing RBAC dependent | Yes |

Do not create a parallel permission system unless necessary.

---

# 45. Performance Requirements

The dashboard must remain responsive.

Requirements:

- Aggregate data server-side
- Parallelize independent queries
- Avoid N+1 queries
- Use appropriate database indexes
- Cache expensive analytics where justified
- Lazy-load lower-priority charts where useful
- Prioritize fast loading of Today's Dispatch Hero and work queue
- Avoid loading full source datasets merely to render a KPI

---

# 46. Auditability

Every performance metric must be traceable.

For Module Mastery and dispatch performance, the system should be able to identify:

- Contributing dispatch records
- Dispatch dates
- Product
- Product category
- Quantity
- Customer
- Sales ownership
- Corrections
- Reversals

Do not create an untraceable gamification counter.

---

# 47. Edge Cases and Validation

Cursor must explicitly test:

## Zero Dispatches

```text
0 modules
Level 1 active
Progress 0 / 500
```

## Exact Boundary

```text
500 modules
Level 1 completed
Level 2 active
Progress 0 / 500
```

## Multiple Levels in One Dispatch

```text
Previous: 480
New dispatch: 1,100
Total: 1,580
```

All crossed levels must be recorded.

## Level 15

At 7,500 modules, transition correctly to God Level progression.

## Unlimited God Levels

Test beyond several God Level thresholds.

## Month Boundary

At India local midnight, new month starts at zero while prior month remains historical.

## Dispatch Reversal

Current progress must reconcile to valid final records.

## Executive Reassignment

Analytics must follow the authoritative business ownership rule.

## Authorization

Test direct URL/API manipulation.

## Large Dataset

Validate query performance and chart aggregation.

---

# 48. Implementation Phases

## Phase 1 — Codebase and Data Audit

Before coding, inspect:

1. Database ORM and schema
2. User and role models
3. Customer assignment model
4. Sales ownership model
5. Quotation flow
6. PI flow
7. Booking flow
8. Payment flow
9. Dispatch flow
10. Exact dispatch statuses
11. Product classification
12. Inventory availability and reservation logic
13. Approval system
14. Existing dashboard
15. Existing Sales Executive Report
16. Existing analytics services
17. Existing RBAC
18. Existing chart library

Create:

```text
SALES_DASHBOARD_DATA_AUDIT.md
```

The audit must map each dashboard metric to:

- Actual source table/model
- Relevant fields
- Relationships
- Status filters
- Calculation formula
- Ownership/scoping rule

Do not guess.

## Phase 2 — Analytics and API Layer

Implement centralized role-aware analytics.

Build:

- Executive dashboard aggregation
- Manager dashboard aggregation
- KPI calculations
- Funnel calculations
- Outstanding aging
- Dispatch metrics
- Stock watch
- Risk detection
- Quiet customer detection

Validate against existing reports.

## Phase 3 — Core Executive Dashboard

Implement:

1. Today's Dispatch Hero
2. KPI Strip
3. Work Queue
4. Quick Actions
5. Outstanding Aging
6. Sales Stock Watch

## Phase 4 — Visual Analytics

Implement:

1. Sales Funnel
2. Performance Trend
3. Outstanding Histogram
4. Dispatch Trend
5. Product Contribution
6. Period Controls

## Phase 5 — Module Mastery and Targets

Implement:

1. Monthly module calculation
2. Target calculation
3. Level engine
4. Current progress visualization
5. Next level preview
6. Achievement recording
7. One-time celebration
8. My Journey
9. Historical records
10. Unlimited God Levels
11. Team leaderboard
12. Configuration

## Phase 6 — Manager Dashboard

Implement:

1. Approval Summary
2. Team KPI Strip
3. Team Scoreboard
4. Executive Comparison
5. Team Funnel
6. Pipeline Risk
7. Exceptions
8. Dispatch Operations
9. Stock Conflicts
10. Team Module Mastery

## Phase 7 — Reports Hub

Implement or enhance:

1. Sales Performance Report
2. Dispatch Report
3. Collection Report
4. Funnel Report
5. Executive Performance Report
6. Export functionality

## Phase 8 — Validation and Hardening

Validate:

- Role isolation
- Customer ownership isolation
- Period calculations
- India timezone
- Dispatch statuses
- Payment corrections
- Dispatch reversals
- Stock conflicts
- Empty states
- Large datasets
- Chart correctness
- Click-through filters
- Responsive behavior

Create:

```text
SALES_DASHBOARD_IMPLEMENTATION_REPORT.md
```

Document:

- Files changed
- Database changes
- Migrations
- APIs
- Calculation formulas
- Tests
- Assumptions
- Known limitations

---

# 49. Cursor Master Implementation Instruction

> Do not start implementing UI or database changes immediately.
>
> First perform a complete audit of the existing Ivaan Ops codebase, database schema, report calculations, sales workflows, dispatch workflows, inventory logic, approval system, RBAC and existing dashboard architecture.
>
> Create `SALES_DASHBOARD_DATA_AUDIT.md`.
>
> Map every metric in this PRD to its actual database source, field, relationship, status values, ownership rules and calculation formula.
>
> The existing Sales Executive Report is the baseline for Quotation Value, PI Value, Collection Value and Dispatched Value. Do not create alternative formulas without documenting the current formula and obtaining consistency with existing reporting.
>
> Do not guess table names, enum values or status names.
>
> After the audit, propose the implementation architecture and list all database migrations before modifying production-facing functionality.
>
> All Sales Executive data must be scoped server-side to the user's authorized customers/sales records. Never send company-wide data to an executive's browser for client-side filtering.
>
> Use `Asia/Kolkata` for all business dates and dashboard calculations.
>
> Reuse existing Ivaan Ops authentication, RBAC, design system, inventory calculations, workflow components and report logic.
>
> Do not rebuild existing functionality unnecessarily.
>
> Implement incrementally according to the phases in this PRD.
>
> After each phase, validate metrics against the existing reports and operational records.
>
> Do not claim a phase is complete without running relevant tests and documenting changed files.

---

# 50. Final Acceptance Criteria

## Sales Executive

- [ ] Sees today's dispatch situation immediately.
- [ ] Sees only authorized data.
- [ ] Has actionable work queues.
- [ ] Can identify expiring quotations.
- [ ] Can identify unpaid PIs.
- [ ] Can identify quiet customers.
- [ ] Can view outstanding aging.
- [ ] Can see relevant sales stock.
- [ ] Has quick actions for quotation, PI, payment and customer.
- [ ] Can view meaningful funnel and performance charts.
- [ ] Can track monthly module target.
- [ ] Can progress through Module Mastery.

## Module Mastery

- [ ] Counts only valid dispatched module units.
- [ ] Uses 500-unit slabs by default.
- [ ] Has 15 configurable named levels.
- [ ] Unlocks sequentially.
- [ ] Shows current and next achievement.
- [ ] Supports unlimited God Levels.
- [ ] Resets current progression monthly.
- [ ] Preserves historical achievements.
- [ ] Supports one-time celebrations.
- [ ] Handles reversals and corrections.
- [ ] Remains auditable to source dispatch records.

## Sales Manager

- [ ] Sees approvals count and oldest waiting item.
- [ ] Can click through to approvals.
- [ ] Sees team scoreboard.
- [ ] Can compare executives visually.
- [ ] Can identify pipeline risks.
- [ ] Can identify collection exceptions.
- [ ] Can monitor today's dispatch operations.
- [ ] Can identify stock conflicts.
- [ ] Can drill into executive performance.
- [ ] Can see team Module Mastery.

## System

- [ ] Dashboard metrics match existing reports.
- [ ] Every major metric is traceable.
- [ ] Click-through leads to relevant filtered details.
- [ ] India timezone is correctly applied.
- [ ] RBAC is enforced server-side.
- [ ] Performance is acceptable at scale.
- [ ] Charts are meaningful and responsive.
- [ ] Existing workflows are not broken.

---

# 51. Final Product Principle

For the Sales Executive, the dashboard must answer:

> **Where am I now, what do I need to do next, and how close am I to my next achievement?**

For the Sales Manager, the dashboard must answer:

> **Where is the team stuck, who is performing, and what requires intervention?**

The final product should be visually rich, highly actionable, professionally designed and grounded in correct, auditable operational business data.
